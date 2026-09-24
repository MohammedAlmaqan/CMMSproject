#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G4a  E2E VERIFY — Preventive Maintenance (frontend wiring + generate-wo)
# Committed live API gate (login UI+API → POST test plan → GET list/detail →
# generate-wo x2 → distinct WO numbers → headless /preventive-maintenance
# render → cleanup plan + WOs), assertions + screenshots.
# Usage: python scripts/verify/verify_g4a.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import sys
from datetime import date
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"

# NOTE: equipmentId / functionalLocationId / workCenterId / taskListId are
# None here — they are resolved at runtime from the live API (the demo seed
# regenerates UUIDs on every reseed, so hardcoded ids drift stale).
PLAN_BODY = {
    "planCode": "G4A-TEST",
    "description": "G4a verify",
    "equipmentId": None,
    "functionalLocationId": None,
    "workCenterId": None,
    "taskListId": None,
    "strategyType": "Time",
    "intervalValue": 30,
    "intervalUnit": "Days",
    "callHorizonValue": 7,
    "callHorizonUnit": "Days",
    "startDate": date.today().isoformat(),
    "activeFlag": True,
}

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []
GEN1 = None
GEN2 = None


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-port", type=int, default=BASE_PORT)
    ap.add_argument("--api-port", type=int, default=API_PORT)
    args = ap.parse_args()
    base = f"http://localhost:{args.base_port}"
    api = f"http://localhost:{args.api_port}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()
        page.set_default_timeout(15000)

        def on_page_error(e):
            PAGE_ERRORS.append(re.sub(r"\s+", " ", str(e)))

        def on_console(m):
            t = m.type
            txt = m.text.strip().replace("\n", " ")
            if t == "error":
                CONSOLE_ERRORS.append(txt)
            elif t == "warning":
                CONSOLE_WARNINGS.append(txt)

        def on_resp(resp):
            if resp.status >= 400:
                RESP_FAILS.append((resp.status, resp.url.split("?")[0]))

        page.on("pageerror", on_page_error)
        page.on("console", on_console)
        page.on("response", on_resp)
        page.on("dialog", lambda d: d.accept())

        # ---------- Login UI (operator) ----------
        page.goto(base + "/login", wait_until="domcontentloaded")
        form = page.locator("form").first
        form.locator("input[type='text']").fill("operator")
        form.locator("input[type='password']").fill("password")
        form.locator("button[type='submit']").click()
        try:
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["login_ok"] = True
        except Exception:
            SI["login_ok"] = False

        # ---------- API login (operator) + admin (cleanup) ----------
        def api_login(username):
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": username, "password": "password"}),
            )
            token = r.json().get("token") if r.ok else None
            return r.status, token

        try:
            st, token = api_login("operator")
            hdrs = {"Authorization": f"Bearer {token}"} if token else {}
            SI["api_token_ok"] = st == 200 and bool(token)
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_token_ok"] = False
            hdrs = {}

        admin_hdrs = {}
        try:
            st, atok = api_login("admin")
            SI["admin_token_ok"] = st == 200 and bool(atok)
            if atok:
                admin_hdrs = {"Authorization": f"Bearer {atok}"}
        except Exception as e:
            print("ADMIN_LOGIN_ERR", e)
            SI["admin_token_ok"] = False

        hdrs = {**hdrs, "Content-Type": "application/json"}
        admin_hdrs = {**admin_hdrs, "Content-Type": "application/json"}

        # ---------- Resolve live master-data ids (seed regenerates UUIDs) ----------
        def one_id(url, key):
            try:
                r = page.request.get(api + url, headers=admin_hdrs)
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
        PLAN_BODY.update({k: v for k, v in resolved.items() if v})

        plan_id = None
        wo1_id = None
        wo2_id = None

        # ---------- API: POST one test plan ----------
        try:
            cr = page.request.post(
                api + "/api/maintenance-plans",
                headers=hdrs,
                data=json.dumps(PLAN_BODY),
            )
            created = cr.json()
            SI["plan_create_status"] = cr.status
            SI["plan_id"] = created.get("planId")
            plan_ok = (
                cr.status == 201
                and created.get("planCode") == "G4A-TEST"
                and bool(created.get("planId"))
            )
            plan_id = created.get("planId")
        except Exception as e:
            print("PLAN_CREATE_ERR", e)
            SI["plan_create_status"] = None
            plan_ok = False

        # ---------- API: GET list + GET by id ----------
        try:
            lr = page.request.get(api + "/api/maintenance-plans?take=100", headers=hdrs)
            plans = lr.json()
            if not isinstance(plans, list):
                plans = plans.get("data", [])
            SI["list_status"] = lr.status
            SI["list_contains_plan"] = lr.status == 200 and any(
                p.get("planCode") == "G4A-TEST" for p in plans
            )
            list_ok = SI["list_contains_plan"]
        except Exception as e:
            print("PLAN_LIST_ERR", e)
            SI["list_status"] = None
            list_ok = False

        try:
            dr = page.request.get(api + f"/api/maintenance-plans/{plan_id}", headers=hdrs)
            detail = dr.json()
            SI["detail_status"] = dr.status
            SI["detail_shape_ok"] = (
                dr.status == 200
                and detail.get("planCode") == "G4A-TEST"
                and detail.get("description") == "G4a verify"
                and detail.get("strategyType") == "Time"
                and detail.get("intervalValue") == 30
                and detail.get("intervalUnit") == "Days"
                and detail.get("activeFlag") is True
                and bool(detail.get("equipmentId"))
                and bool(detail.get("functionalLocationId"))
                and bool(detail.get("workCenterId"))
                and bool(detail.get("taskListId"))
            )
            shape_ok = SI["detail_shape_ok"]
        except Exception as e:
            print("PLAN_DETAIL_ERR", e)
            SI["detail_status"] = None
            shape_ok = False

        # ---------- API: POST generate-wo twice (verbatim bodies) ----------
        try:
            g1 = page.request.post(
                api + f"/api/maintenance-plans/{plan_id}/generate-wo",
                headers=hdrs,
                data=json.dumps({}),
            )
            GEN1 = g1.text()
            g2 = page.request.post(
                api + f"/api/maintenance-plans/{plan_id}/generate-wo",
                headers=hdrs,
                data=json.dumps({}),
            )
            GEN2 = g2.text()
            j1, j2 = g1.json(), g2.json()
            wo1_id = j1.get("workOrderId")
            wo2_id = j2.get("workOrderId")
            SI["gen1_status"] = g1.status
            SI["gen2_status"] = g2.status
            SI["gen1_wo_number"] = j1.get("woNumber")
            SI["gen2_wo_number"] = j2.get("woNumber")
            distinct_ok = (
                g1.status == 201
                and g2.status == 201
                and bool(wo1_id)
                and bool(wo2_id)
                and wo1_id != wo2_id
                and j1.get("woNumber") != j2.get("woNumber")
            )
            SI["distinct_wo_numbers"] = distinct_ok
        except Exception as e:
            print("GEN_WO_ERR", e)
            SI["gen1_status"] = None
            SI["gen2_status"] = None
            distinct_ok = False

        # ---------- Render /preventive-maintenance headless ----------
        page.goto(base + "/preventive-maintenance", wait_until="domcontentloaded")
        try:
            page.get_by_text("G4A-TEST", exact=True).wait_for(timeout=15000)
            SI["plan_row_visible"] = True
        except Exception:
            SI["plan_row_visible"] = False
        try:
            row = page.locator("tr", has=page.get_by_text("G4A-TEST", exact=True))
            SI["generate_ui_button_present"] = row.locator("button", has_text="Generate WO").count() == 1
        except Exception:
            SI["generate_ui_button_present"] = False
        snap(page, "g4a_01_plan_list")
        snap(page, "g4a_02_plan_row_details")

        # ---------- Cleanup: delete plan + both generated WOs ----------
        try:
            dl = page.request.delete(api + f"/api/maintenance-plans/{plan_id}", headers=hdrs)
            SI["plan_delete_status"] = dl.status
        except Exception as e:
            print("PLAN_DELETE_ERR", e)
            SI["plan_delete_status"] = None
        try:
            dw1 = page.request.delete(api + f"/api/work-orders/{wo1_id}", headers=admin_hdrs)
            dw2 = page.request.delete(api + f"/api/work-orders/{wo2_id}", headers=admin_hdrs)
            SI["wo1_delete_status"] = dw1.status
            SI["wo2_delete_status"] = dw2.status
        except Exception as e:
            print("WO_DELETE_ERR", e)
            SI["wo1_delete_status"] = None
            SI["wo2_delete_status"] = None
        cleanup_ok = (
            SI.get("plan_delete_status") == 200
            and SI.get("wo1_delete_status") == 200
            and SI.get("wo2_delete_status") == 200
        )

        # ---------- Post-cleanup absent checks ----------
        try:
            lr2 = page.request.get(api + "/api/maintenance-plans?take=100", headers=hdrs)
            plans2 = lr2.json()
            if not isinstance(plans2, list):
                plans2 = plans2.get("data", [])
            SI["list_post_cleanup_clean"] = not any(
                p.get("planCode") == "G4A-TEST" for p in plans2
            )
        except Exception as e:
            print("POSTCLEAN_LIST_ERR", e)
            SI["list_post_cleanup_clean"] = False

        print("GEN1", GEN1)
        print("GEN2", GEN2)
        print("SI_JSON", json.dumps(SI))
        print("PAGE_ERRORS", PAGE_ERRORS)
        print("CONSOLE_ERRORS", CONSOLE_ERRORS)
        print("CONSOLE_WARNINGS", CONSOLE_WARNINGS)
        seen = set()
        for s, u in RESP_FAILS:
            if (s, u) not in seen:
                seen.add((s, u))
                print("RESP_FAIL", s, u)

        browser.close()

        ok = (
            SI.get("login_ok")
            and SI.get("api_token_ok")
            and SI.get("admin_token_ok")
            and plan_ok
            and list_ok
            and shape_ok
            and distinct_ok
            and SI.get("plan_row_visible")
            and cleanup_ok
            and SI.get("list_post_cleanup_clean")
            and not PAGE_ERRORS
        )
        print("G4A_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()