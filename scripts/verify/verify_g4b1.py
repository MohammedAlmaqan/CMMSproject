#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G4b-1  E2E VERIFY — PM scheduler core: idempotency (3.1c), manual admin
# trigger (3.1f), env-driven cron + startup run (3.1g).
# Live API gate: admin login -> create Time plan due today -> run-scheduler
# x2 -> wosCreated=1 / wosSkipped=0 then wosCreated=0 / wosSkipped=1 ->
# exactly one WO with sourcePlanCycle = today -> cleanup + post-checks.
# Usage: python scripts/verify/verify_g4b1.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
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

            # ---------- Create Time-strategy plan due today ----------
            plan_code = "G4B1-TEST-" + str(int(time.time() * 1000))
            plan_body = {
                "planCode": plan_code,
                "description": "G4b1 verify",
                "equipmentId": "27fbcebc-b922-4b71-b8df-349d98d8955a",
                "functionalLocationId": "3c26edce-b5d3-4448-a547-e9e04a674581",
                "workCenterId": "0a4cf365-5fce-4262-a1f2-b1d0ddc2a53c",
                "taskListId": "4343f060-5b81-41c8-9b9f-01c462c0dbf1",
                "strategyType": "Time",
                "intervalValue": 1,
                "intervalUnit": "Days",
                "callHorizonValue": 7,
                "callHorizonUnit": "Days",
                "startDate": today_iso,
                "activeFlag": True,
            }
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
            r1_ok = False
            try:
                r1 = req.post("/api/maintenance-plans/run-scheduler", headers=hdrs, data={})
                j1 = r1.json()
                SI["run1_status"] = r1.status
                SI["run1_wosCreated"] = j1.get("wosCreated")
                SI["run1_wosSkipped"] = j1.get("wosSkipped")
                SI["run1_plansEvaluated"] = j1.get("plansEvaluated")
                r1_ok = r1.status == 200 and j1.get("wosCreated") == 1 and j1.get("wosSkipped") == 0
            except Exception as e:
                print("RUN1_ERR", e)
                SI["run1_status"] = None

            # ---------- run-scheduler 2nd call (idempotency) ----------
            r2_ok = False
            try:
                r2 = req.post("/api/maintenance-plans/run-scheduler", headers=hdrs, data={})
                j2 = r2.json()
                SI["run2_status"] = r2.status
                SI["run2_wosCreated"] = j2.get("wosCreated")
                SI["run2_wosSkipped"] = j2.get("wosSkipped")
                SI["run2_plansEvaluated"] = j2.get("plansEvaluated")
                r2_ok = r2.status == 200 and j2.get("wosCreated") == 0 and j2.get("wosSkipped") == 1
            except Exception as e:
                print("RUN2_ERR", e)
                SI["run2_status"] = None

            # ---------- Exactly one WO for the plan, cycle = today ----------
            wo_ok = False
            try:
                wl = req.get("/api/work-orders?take=200", headers=hdrs)
                wos = wl.json()
                if isinstance(wos, dict):
                    wos = wos.get("data", [])
                mine = [w for w in wos if w.get("sourcePlanId") == plan_id]
                SI["wo_list_status"] = wl.status
                SI["wo_supplier_count"] = len(mine)
                SI["wo_sourceCycle"] = mine[0].get("sourcePlanCycle") if mine else None
                wo_ok = (
                    wl.status == 200
                    and len(mine) == 1
                    and mine[0].get("sourcePlanCycle") == today_iso
                )
                if mine:
                    global GENERATED_WO_ID
                    GENERATED_WO_ID = mine[0].get("workOrderId")
            except Exception as e:
                print("WO_LIST_ERR", e)
                SI["wo_list_status"] = None

            # ---------- Cleanup: soft-delete plan + generated WO ----------
            cleanup_ok = False
            try:
                dp = req.delete(f"/api/maintenance-plans/{plan_id}", headers=hdrs)
                SI["plan_delete_status"] = dp.status
                dw = req.delete(f"/api/work-orders/{GENERATED_WO_ID}", headers=hdrs)
                SI["wo_delete_status"] = dw.status
                cleanup_ok = dp.status == 200 and dw.status == 200
            except Exception as e:
                print("CLEANUP_ERR", e)
                SI["plan_delete_status"] = None
                SI["wo_delete_status"] = None

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