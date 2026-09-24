#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G4b-2  E2E VERIFY — PM scheduler safeguards:
#   3.1a PM2 fork config (instances:1 / fork / no register.js)
#   3.1b startup lock (foreign running row blocks a 2nd backend process)
#   3.1d scheduler heartbeat health + SystemAlert on staleness
#   3.1e non-blocking batches (setImmediate + batch log in scheduler.ts)
# Usage: python scripts/verify/verify_g4b2.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

API_PORT = 4000
SECOND_PORT = 4100
BACKEND = str(Path(__file__).resolve().parents[2] / "backend")
ECOSYSTEM = Path(BACKEND) / "ecosystem.config.cjs"
SCHEDULER = Path(BACKEND) / "src" / "services" / "scheduler.ts"
SECOND_LOG = Path(BACKEND) / "backend-g4b2-second.log"

SI = {}


def db_exec(sql: str):
    # SET TIME ZONE 'UTC' so now() writes naive timestamps with the UTC wall value
    r = subprocess.run(
        ["cmd", "/c", "npx.cmd", "prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
        input="SET TIME ZONE 'UTC';\n" + sql,
        capture_output=True,
        text=True,
        cwd=BACKEND,
        timeout=120,
    )
    return r


def db_read(sql: str):
    r = subprocess.run(
        ["cmd", "/c", "node_modules\\.bin\\tsx.cmd", "../scripts/verify/g4b2_query.ts", sql],
        capture_output=True,
        text=True,
        cwd=BACKEND,
        timeout=120,
    )
    try:
        return json.loads((r.stdout or "").strip().splitlines()[-1])
    except Exception:
        print("DB_READ_ERR", r.returncode, (r.stderr or "")[-2000:])
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-port", type=int, default=API_PORT)
    args = ap.parse_args()
    api = f"http://localhost:{args.api_port}"
    today_iso = date.today().isoformat()

    # ---------- 3.1a static: PM2 fork config ----------
    eco = ECOSYSTEM.read_text(encoding="utf-8")
    SI["eco_instances_1"] = bool(re.search(r"instances\s*:\s*1", eco))
    SI["eco_exec_mode_fork"] = bool(re.search(r"exec_mode\s*:\s*'fork'", eco))
    SI["eco_no_registerjs"] = "register.js" not in eco
    SI["eco_no_env_file"] = "env_file" not in eco

    # ---------- 3.1e static: non-blocking batches ----------
    sched = SCHEDULER.read_text(encoding="utf-8")
    SI["sched_has_setimmediate"] = "setImmediate" in sched
    SI["sched_has_batch"] = "BATCH_SIZE" in sched and "[scheduler] batch" in sched

    with sync_playwright() as p:
        req = p.request.new_context(base_url=api)
        try:
            # ---------- Admin login ----------
            try:
                lr = req.post("/api/auth/login", data={"username": "admin", "password": "password"})
                token = lr.json().get("token")
                SI["admin_login_status"] = lr.status
                hdrs = {"Authorization": f"Bearer {token}"}
            except Exception as e:
                print("ADMIN_LOGIN_ERR", e)
                SI["admin_login_status"] = None
                hdrs = {}

            # ---------- Resolve live master-data ids (seed regenerates UUIDs) ----------
            def one_id(url, key):
                try:
                    r = req.get(url, headers=hdrs)
                    d = r.json()
                    if isinstance(d, dict):
                        d = d.get("data") or d.get("items") or []
                    return d[0].get(key) if isinstance(d, list) and d else None
                except Exception:
                    return None

            resolved = {}
            for url, key in [
                ("/api/equipment?take=1", "equipmentId"),
                ("/api/functional-locations?take=1", "functionalLocationId"),
                ("/api/work-centers?take=1", "workCenterId"),
                ("/api/task-lists?take=1", "taskListId"),
            ]:
                resolved[key] = one_id(url, key)
            SI["test_ids_resolved"] = all(resolved.values())

            # ---------- Create due Time plan ----------
            plan_code = "G4B2-TEST-" + str(int(time.time() * 1000))
            plan_body = {
                "planCode": plan_code,
                "description": "G4b2 verify",
                "equipmentId": None,
                "functionalLocationId": None,
                "workCenterId": None,
                "taskListId": None,
                "strategyType": "Time",
                "intervalValue": 1,
                "intervalUnit": "Days",
                "callHorizonValue": 7,
                "callHorizonUnit": "Days",
                "startDate": today_iso,
                "activeFlag": True,
            }
            plan_body.update({k: v for k, v in resolved.items() if v})
            try:
                cr = req.post("/api/maintenance-plans", headers=hdrs, data=plan_body)
                created = cr.json()
                plan_id = created.get("planId")
                SI["plan_create_status"] = cr.status
                SI["plan_id"] = plan_id
                SI["plan_code"] = plan_code
            except Exception as e:
                print("PLAN_CREATE_ERR", e)
                plan_id = None
                SI["plan_create_status"] = None

            # ---------- 3.1b: fake running row blocks 2nd process ----------
            fake_id = str(uuid.uuid4())
            fake_pid = 60000 + (int(time.time()) % 30000) + os.getpid() % 1000
            r = db_exec(
                'INSERT INTO "SchedulerRun" ("schedulerRunId","hostname","pid","status","startedAt","heartbeatAt")\n'
                f"VALUES ('{fake_id}','fakehost',{fake_pid},'running',now(),now());\n"
            )
            chk_fake = db_read(f'SELECT count(*)::int AS c FROM "SchedulerRun" WHERE "schedulerRunId" = \'{fake_id}\';\n')
            SI["fake_row_inserted"] = bool(chk_fake and chk_fake[0].get("c") == 1)

            second_started = time.time()
            env = dict(os.environ)
            env["PORT"] = str(SECOND_PORT)
            env["FORCE_COLOR"] = "0"
            with SECOND_LOG.open("w", encoding="utf-8") as f:
                proc = subprocess.Popen(
                    ["cmd", "/c", "npm.cmd", "run", "dev"],
                    cwd=BACKEND,
                    env=env,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                )
            disabled_marker = "[scheduler] disabled — lock held by"
            found = False
            deadline = time.time() + 40
            while time.time() < deadline:
                try:
                    content = (SECOND_LOG.read_text(encoding="utf-8", errors="replace") or "")
                except Exception:
                    content = ""
                if disabled_marker in content:
                    found = True
                    break
                if proc.poll() is not None:
                    break
                time.sleep(1)
            boot_ms = int((time.time() - second_started) * 1000)
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            try:
                proc.wait(timeout=10)
            except Exception:
                pass
            content = (SECOND_LOG.read_text(encoding="utf-8", errors="replace") or "")
            SI["second_boot_ms"] = boot_ms
            SI["second_disabled_marker"] = found
            SI["second_started_cron_absent"] = "started cron" not in content
            SI["second_locked_out_message"] = disabled_marker in content
            # delete the fake row once the 2nd process is killed
            db_exec(f'DELETE FROM "SchedulerRun" WHERE "schedulerRunId" = \'{fake_id}\';\n')

            # ---------- 3.1d: run once + success row + healthy ----------
            rs = req.post("/api/maintenance-plans/run-scheduler", headers=hdrs, data={})
            j = rs.json()
            SI["run_rs_status"] = rs.status
            SI["run_rs_wosCreated"] = j.get("wosCreated")

            sr_rows = db_read('SELECT "schedulerRunId" AS id, pid AS pid FROM "SchedulerRun" WHERE status = \'success\' ORDER BY "completedAt" DESC LIMIT 1;\n')
            success_id = (sr_rows or [{}])[0].get("id") if sr_rows else None
            main_pid = (sr_rows or [{}])[0].get("pid") if sr_rows else None
            SI["success_row_exists"] = success_id is not None
            SI["success_row_id"] = success_id
            SI["success_row_pid"] = main_pid
            if success_id:
                # stale-history leak safety: keep only this process's live row so the
                # staleness assertion has a meaningful "no recent success" environment
                db_exec(f'DELETE FROM "SchedulerRun" WHERE "schedulerRunId" <> \'{success_id}\';\n')

            h1 = req.get("/api/health/scheduler")
            hj1 = h1.json()
            SI["health_ok_status"] = h1.status
            SI["health_ok_status_field"] = hj1.get("status")
            SI["minutes_since_success"] = hj1.get("minutesSinceSuccess")

            # ---------- 3.1d staleness: 503 + SystemAlert, then restore ----------
            stale_alert = None
            restored = None
            if success_id:
                su = db_exec(f'UPDATE "SchedulerRun" SET "completedAt" = now() - interval \'30 days\' WHERE "schedulerRunId" = \'{success_id}\';\n')
                SI["stale_update_rc"] = su.returncode
                h2 = req.get("/api/health/scheduler")
                hj2 = h2.json()
                SI["stale_status_code"] = h2.status
                SI["stale_status_field"] = hj2.get("status")
                SI["stale_minutes_since_success"] = hj2.get("minutesSinceSuccess")
                ar_rows = db_read('SELECT "alertId" AS id FROM "SystemAlert" WHERE "alertType" = \'Scheduler_Stale\' LIMIT 1;\n')
                stale_alert = (ar_rows or [{}])[0].get("id") if ar_rows else None
                SI["stale_alert_created"] = stale_alert is not None
                SI["stale_alert_id"] = stale_alert
                rr = db_exec(f'UPDATE "SchedulerRun" SET "completedAt" = now() WHERE "schedulerRunId" = \'{success_id}\';\n')
                SI["restore_rc"] = rr.returncode
                h3 = req.get("/api/health/scheduler")
                SI["restored_health_status"] = h3.status
                restored = h3.status == 200

            # ---------- WO evidence for the test plan ----------
            wo_ok = False
            try:
                wl = req.get("/api/work-orders?take=200", headers=hdrs)
                wos = wl.json()
                if isinstance(wos, dict):
                    wos = wos.get("data", [])
                mine = [w for w in wos if w.get("sourcePlanId") == plan_id]
                SI["wo_supplier_count"] = len(mine)
                wo_ok = wl.status == 200 and len(mine) == 1 and mine[0].get("sourcePlanCycle") == today_iso
                generated_wo_id = mine[0].get("workOrderId") if mine else None
            except Exception as e:
                print("WO_LIST_ERR", e)
                generated_wo_id = None
                SI["wo_supplier_count"] = None

            # ---------- Cleanup ----------
            try:
                dp = req.delete(f"/api/maintenance-plans/{plan_id}", headers=hdrs)
                SI["plan_delete_status"] = dp.status
            except Exception as e:
                print("PLAN_DELETE_ERR", e)
                SI["plan_delete_status"] = None
                dp = None
            try:
                if generated_wo_id:
                    dw = req.delete(f"/api/work-orders/{generated_wo_id}", headers=hdrs)
                    SI["wo_delete_status"] = dw.status
                else:
                    SI["wo_delete_status"] = None
            except Exception as e:
                print("WO_DELETE_ERR", e)
                SI["wo_delete_status"] = None
            db_exec('DELETE FROM "SystemAlert" WHERE "alertType" = \'Scheduler_Stale\';\n')
            db_exec('DELETE FROM "SchedulerRun" WHERE "hostname" = \'fakehost\';\n')
            if success_id and main_pid:
                db_exec(f'DELETE FROM "SchedulerRun" WHERE "schedulerRunId" <> \'{success_id}\' AND pid <> {main_pid};\n')
            chk = db_read('SELECT count(*)::int AS c FROM "SchedulerRun" WHERE "hostname" = \'fakehost\';\n')
            SI["fake_rows_remaining_cnt"] = chk[0].get("c") if chk else None
            dal = db_read('SELECT "alertId" AS id FROM "SystemAlert" WHERE "alertType" = \'Scheduler_Stale\' LIMIT 1;\n')
            SI["alerts_remaining"] = dal[0].get("id") if dal else None
            try:
                lr2 = req.get("/api/maintenance-plans?take=100", headers=hdrs)
                plans2 = lr2.json()
                if not isinstance(plans2, list):
                    plans2 = plans2.get("data", [])
                SI["plan_absent_after_cleanup"] = not any(pl.get("planCode") == plan_code for pl in plans2)
            except Exception as e:
                print("POSTCLEAN_PLAN_ERR", e)
                SI["plan_absent_after_cleanup"] = False

            print("SI_JSON", json.dumps(SI))
        finally:
            req.dispose()

        ok = (
            SI.get("admin_login_status") == 200
            and SI.get("plan_create_status") == 201
            and SI.get("eco_instances_1")
            and SI.get("eco_exec_mode_fork")
            and SI.get("eco_no_registerjs")
            and SI.get("eco_no_env_file")
            and SI.get("sched_has_setimmediate")
            and SI.get("sched_has_batch")
            and SI.get("second_disabled_marker")
            and SI.get("second_started_cron_absent")
            and SI.get("run_rs_status") == 200
            and SI.get("success_row_exists")
            and SI.get("health_ok_status") == 200
            and SI.get("health_ok_status_field") == "ok"
            and isinstance(SI.get("minutes_since_success"), int)
            and SI.get("minutes_since_success") < 1
            and SI.get("stale_status_code") == 503
            and SI.get("stale_status_field") == "stale"
            and SI.get("stale_alert_created")
            and SI.get("restored_health_status") == 200
            and wo_ok
            and SI.get("plan_delete_status") in (200, 204)
            and SI.get("wo_delete_status") in (200, 204)
            and SI.get("fake_rows_remaining_cnt") == 0
            and SI.get("alerts_remaining") is None
            and SI.get("plan_absent_after_cleanup")
        )
        print("G4B2_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()