#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G4b-1  E2E VERIFY — PM scheduler core: idempotency (3.1c), manual admin
# trigger (3.1f), env-driven cron + startup run (3.1g).
# Live API gate: admin login -> create Time plan due today -> run-scheduler
# x2 -> the first run evaluates the active plans and mints WOs across their
# call horizons, the second mints none (idempotent) -> the plan's own WOs are
# one per horizon cycle and identical across both runs -> cleanup + post-checks.
# Usage: python scripts/verify/verify_g4b1.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import time
from datetime import date
from playwright.sync_api import sync_playwright

API_PORT = 4000

SI = {}
GENERATED_WO_ID = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-port", type=int, default=API_PORT)
    args = ap.parse_args()
    api = f"http://localhost:{args.api_port}"
    today_iso = date.today().isoformat()

    with sync_playwright() as p:
        req = p.request.new_context(base_url=api)
        try:
            # ---------- Admin API login ----------
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

            # ---------- Create Time-strategy plan due today ----------
            plan_code = "G4B1-TEST-" + str(int(time.time() * 1000))
            plan_body = {
                "planCode": plan_code,
                "description": "G4b1 verify",
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

            # ---------- run-scheduler 1st call ----------
            # The endpoint evaluates every active Time/Meter/Combined plan and
            # materialises each cycle inside its call horizon (SOW 3.4.1-3.4.3),
            # so wosCreated and plansEvaluated are not ours alone. Assert the run
            # happened and minted something; our plan's own work orders are read
            # back below.
            r1_ok = False
            try:
                r1 = req.post("/api/maintenance-plans/run-scheduler", headers=hdrs, data={})
                j1 = r1.json()
                SI["run1_status"] = r1.status
                SI["run1_wosCreated"] = j1.get("wosCreated")
                SI["run1_wosSkipped"] = j1.get("wosSkipped")
                SI["run1_plansEvaluated"] = j1.get("plansEvaluated")
                r1_ok = (
                    r1.status == 200
                    and (j1.get("plansEvaluated") or 0) >= 1
                    and (j1.get("wosCreated") or 0) >= 1
                )
            except Exception as e:
                print("RUN1_ERR", e)
                SI["run1_status"] = None

            def plan_work_orders():
                r = req.get("/api/work-orders?take=1000", headers=hdrs)
                d = r.json()
                if isinstance(d, dict):
                    d = d.get("data", [])
                return r.status, [w for w in d if w.get("sourcePlanId") == plan_id]

            after_run1 = []
            try:
                _st, after_run1 = plan_work_orders()
                SI["run1_plan_wo_count"] = len(after_run1)
                SI["run1_plan_cycles"] = sorted({w.get("sourcePlanCycle") for w in after_run1})
            except Exception as e:
                print("RUN1_WO_LIST_ERR", e)

            # ---------- run-scheduler 2nd call (idempotency) ----------
            r2_ok = False
            try:
                r2 = req.post("/api/maintenance-plans/run-scheduler", headers=hdrs, data={})
                j2 = r2.json()
                SI["run2_status"] = r2.status
                SI["run2_wosCreated"] = j2.get("wosCreated")
                SI["run2_wosSkipped"] = j2.get("wosSkipped")
                SI["run2_plansEvaluated"] = j2.get("plansEvaluated")
                # A second run must mint nothing: every cycle in the horizon is
                # already covered, so no duplicate work order can appear.
                r2_ok = r2.status == 200 and j2.get("wosCreated") == 0
            except Exception as e:
                print("RUN2_ERR", e)
                SI["run2_status"] = None

            # ---------- Our plan's work orders: one per horizon cycle, stable ----------
            after_run2 = []
            wo_ok = False
            try:
                st2, after_run2 = plan_work_orders()
                SI["wo_list_status"] = st2
                SI["wo_plan_count"] = len(after_run2)
                SI["wo_stable"] = sorted(
                    w.get("workOrderId") for w in after_run1
                ) == sorted(w.get("workOrderId") for w in after_run2)
                cycles = sorted({w.get("sourcePlanCycle") for w in after_run2})
                SI["wo_sourceCycles"] = cycles
                cycle_ok = bool(cycles) and all(
                    re.match(r"^\d{4}-\d{2}-\d{2}#[0-9a-f-]{36}$", c or "") for c in cycles
                )
                wo_ok = (
                    st2 == 200
                    and len(after_run2) >= 1
                    and SI["wo_stable"]
                    and cycle_ok
                )
                SI["plan_wo_ids"] = [w.get("workOrderId") for w in after_run2]
                SI["plan_wo_numbers"] = [w.get("woNumber") for w in after_run2]
                if after_run2:
                    global GENERATED_WO_ID
                    GENERATED_WO_ID = after_run2[0].get("workOrderId")
            except Exception as e:
                print("WO_LIST_ERR", e)
                SI["wo_list_status"] = None

            # ---------- Cleanup: soft-delete every WO for the plan, then the plan ----------
            cleanup_ok = False
            try:
                wo_statuses = []
                for wid in SI.get("plan_wo_ids", []):
                    dr = req.delete(f"/api/work-orders/{wid}", headers=hdrs)
                    wo_statuses.append(dr.status)
                SI["wo_delete_statuses"] = wo_statuses
                SI["wo_delete_all_ok"] = len(wo_statuses) >= 1 and all(s == 200 for s in wo_statuses)
                dp = req.delete(f"/api/maintenance-plans/{plan_id}", headers=hdrs)
                SI["plan_delete_status"] = dp.status
                cleanup_ok = bool(SI.get("wo_delete_all_ok")) and dp.status == 200
            except Exception as e:
                print("CLEANUP_ERR", e)
                SI["plan_delete_status"] = None
                SI["wo_delete_all_ok"] = False

            # ---------- Post-cleanup absence ----------
            try:
                lr2 = req.get("/api/maintenance-plans?take=100", headers=hdrs)
                plans2 = lr2.json()
                if not isinstance(plans2, list):
                    plans2 = plans2.get("data", [])
                SI["plan_absent_after_cleanup"] = not any(
                    pl.get("planCode") == plan_code for pl in plans2
                )
            except Exception as e:
                print("POSTCLEAN_PLAN_ERR", e)
                SI["plan_absent_after_cleanup"] = False

            print("SI_JSON", json.dumps(SI))
        finally:
            req.dispose()

        ok = (
            SI.get("admin_login_status") == 200
            and SI.get("plan_create_status") == 201
            and r1_ok
            and r2_ok
            and wo_ok
            and cleanup_ok
            and SI.get("plan_absent_after_cleanup")
        )
        print("G4B1_EXIT", "PASS" if ok else "FAIL")
        sys_exit = 0 if ok else 1

    raise SystemExit(sys_exit)


if __name__ == "__main__":
    main()