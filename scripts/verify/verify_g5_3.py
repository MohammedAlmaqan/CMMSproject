#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G5.3  E2E VERIFY — Full Work Order Lifecycle (UI + API)
# Login UI as operator → dashboard → create WO (UI) → lifecycle
# Draft→Planned→Scheduled→In Progress→Completed→Closed (UI, admin role)
# → create Notification (API; the app exposes no notification-create form,
#   creation is API-only, conversion is UI) → Convert to WO (UI)
# → verify linked WO → Reports render real data (no simulated markers)
# → cleanup soft-deletes test WO/notification so DB is as-found.
# Usage: python scripts/verify/verify_g5_3.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:/Users/Injaz/Documents/Default Project/CMMSproject/screenshots"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}/{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def ui_login(page, base, username):
    page.goto(base, wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    page.goto(base + "/login", wait_until="domcontentloaded")
    form = page.locator("form").first
    form.locator("input[type='text']").fill(username)
    form.locator("input[type='password']").fill("password")
    form.locator("button[type='submit']").click()
    page.wait_for_url("**/dashboard", timeout=15000)


def api_get(page, api, path, hdrs):
    return page.request.get(api + path, headers=hdrs)


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

        # ---------- API login (admin) ----------
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "admin", "password": "password"}),
            )
            token = r.json()["token"]
            hdrs = {"Authorization": f"Bearer {token}"}
            SI["api_token_ok"] = r.status == 200
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_token_ok"] = False
            hdrs = {}

        # ---------- Baseline counts (DB as-found) ----------
        before_wo = None
        before_notif = None
        try:
            wo_r = api_get(page, api, "/api/work-orders?take=1000", hdrs)
            notif_r = api_get(page, api, "/api/notifications?take=1000", hdrs)
            before_wo = len(wo_r.json().get("data", []))
            before_notif = len(notif_r.json().get("data", []))
            SI["before_wo_count"] = before_wo
            SI["before_notif_count"] = before_notif
        except Exception as e:
            print("BASELINE_ERR", e)
            SI["before_wo_count"] = None
            SI["before_notif_count"] = None

        # ---------- Login UI as operator -> dashboard ----------
        try:
            ui_login(page, base, "operator")
            SI["login_ok"] = True
            SI["dashboard_ok"] = page.url.endswith("/dashboard")
        except Exception:
            SI["login_ok"] = False
            SI["dashboard_ok"] = False
        snap(page, "g5_3_01_dashboard_operator")

        # ---------- Create Work Order via UI ----------
        ui_wo_id = None
        wo_number = None
        try:
            page.goto(base + "/work-orders", wait_until="domcontentloaded")
            page.locator("div.industrial-card table tbody tr").first.wait_for(timeout=15000)
            snap(page, "g5_3_02_work_orders_list")
            page.get_by_role("button", name="Create").click()
            page.wait_for_url("**/work-orders/new", timeout=15000)

            fl_sel = page.locator("form select").nth(2)
            fl_sel.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            fl_sel.select_option(index=1)
            wc_sel = page.locator("form select").nth(4)
            wc_sel.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            wc_sel.select_option(index=1)
            sup_sel = page.locator("form select").nth(5)
            sup_sel.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            sup_sel.select_option(index=1)
            page.locator("form textarea").fill("G5-3 E2E lifecycle test WO")
            snap(page, "g5_3_03_create_form")
            page.get_by_role("button", name="Create Work Order").click()
            page.wait_for_url(re.compile(r".*/work-orders/[0-9a-fA-F-]{36}"), timeout=20000)
            ui_wo_id = page.url.rstrip("/").rsplit("/", 1)[-1]
            wo_number = page.locator("span.font-mono.text-lg").first.inner_text().strip()
            SI["wo_created"] = bool(ui_wo_id and wo_number)
            SI["wo_number"] = wo_number
        except Exception as e:
            print("WO_CREATE_ERR", e)
            SI["wo_created"] = False

        # ---------- WO appears in list ----------
        try:
            page.goto(base + "/work-orders", wait_until="domcontentloaded")
            page.locator("tr", has=page.get_by_text(wo_number, exact=True)).first.wait_for(timeout=15000)
            SI["wo_in_list"] = True
        except Exception:
            SI["wo_in_list"] = False

        # ---------- Lifecycle: Draft -> Planned -> Scheduled -> In Progress -> Completed -> Closed ----------
        # Operator (Requester) cannot transition (backend: Technician+); switch to admin.
        transitions = {
            "planned": ("Plan", "Schedule"),
            "scheduled": ("Schedule", "Start"),
            "in_progress": ("Start", "Complete"),
            "completed": ("Complete", "Close"),
        }
        SI["closed"] = False
        try:
            ui_login(page, base, "admin")
            if ui_wo_id:
                page.goto(base + f"/work-orders/{ui_wo_id}", wait_until="domcontentloaded")
            for key, (btn, nxt) in transitions.items():
                page.get_by_role("button", name=btn, exact=True).wait_for(timeout=15000)
                page.get_by_role("button", name=btn, exact=True).click()
                page.get_by_role("button", name=nxt, exact=True).wait_for(timeout=15000)
                SI[key] = True
            page.get_by_role("button", name="Close", exact=True).click()
            page.get_by_text("Closed", exact=True).first.wait_for(timeout=15000)
            SI["closed"] = True
        except Exception as e:
            print("LIFECYCLE_ERR", e)
            SI["planned"] = SI.get("planned", False)
            SI["scheduled"] = SI.get("scheduled", False)
            SI["in_progress"] = SI.get("in_progress", False)
            SI["completed"] = SI.get("completed", False)
        snap(page, "g5_3_04_wo_closed")

        # ---------- Create Notification (API) and Convert to WO (UI) ----------
        notif_id = None
        linked_wo_id = None
        notif_number = None
        try:
            fl = api_get(page, api, "/api/functional-locations?take=100", hdrs).json()
            if not isinstance(fl, list):
                fl = fl.get("data", [])
            fl_id = next((x["functionalLocationId"] for x in fl if x.get("locationCode") == "PL-01"), fl[0]["functionalLocationId"])
            us = api_get(page, api, "/api/users?take=100", hdrs).json()
            users = us if isinstance(us, list) else us.get("data", [])
            operator_id = next((u["userId"] for u in users if u.get("username") == "operator"), users[0]["userId"])
            r = page.request.post(
                api + "/api/notifications",
                headers={"Authorization": hdrs.get("Authorization", ""), "Content-Type": "application/json"},
                data=json.dumps({
                    "type": "M2",
                    "priority": "Medium",
                    "description": "G5-3 E2E convert-to-WO notification",
                    "functionalLocationId": fl_id,
                    "reportedByUserId": operator_id,
                    "breakdownFlag": False,
                }),
            )
            if r.status == 201:
                notif_id = r.json()["notificationId"]
                notif_number = r.json()["notificationNumber"]
                SI["notif_created"] = True
                SI["notif_number"] = notif_number
            else:
                SI["notif_created"] = False
        except Exception as e:
            print("NOTIF_CREATE_ERR", e)
            SI["notif_created"] = False

        if SI.get("notif_created"):
            try:
                page.goto(base + "/notifications", wait_until="domcontentloaded")
                page.get_by_text(notif_number, exact=True).first.wait_for(timeout=15000)
                page.get_by_text(notif_number, exact=True).first.click()
                page.wait_for_url(re.compile(r".*/notifications/[0-9a-fa-f-]{36}"), timeout=15000)
                snap(page, "g5_3_05_notification_detail")
                page.get_by_role("button", name="Convert to WO").first.click()
                page.wait_for_url(re.compile(r".*/work-orders/[0-9a-fa-f-]{36}"), timeout=20000)
                linked_wo_id = page.url.rstrip("/").rsplit("/", 1)[-1]
                SI["notif_convert_ok"] = bool(linked_wo_id)
                SI["linked_wo_ok"] = linked_wo_id is not None
                page.goto(base + f"/notifications/{notif_id}", wait_until="domcontentloaded")
                page.get_by_text("Linked Work Orders (1)", exact=True).wait_for(timeout=15000)
                page.get_by_text("Converted", exact=True).first.wait_for(timeout=15000)
                SI["notif_converted_ui"] = True
            except Exception as e:
                print("NOTIF_CONVERT_ERR", e)
                SI["notif_convert_ok"] = False
                SI["linked_wo_ok"] = False
                SI["notif_converted_ui"] = False
            snap(page, "g5_3_06_converted_notification")

        # ---------- Reports: real data, no simulated markers ----------
        # Backlog chart + PM Compliance carry real seeded/runtime data
        # (the Material Usage report is legitimately empty for the seed DB).
        try:
            page.goto(base + "/reports", wait_until="domcontentloaded")
            page.locator("svg.recharts-surface").first.wait_for(timeout=15000)
            SI["backlog_chart_ok"] = True
            snap(page, "g5_3_07_reports_backlog")

            page.get_by_role("button", name="PM Compliance").click()
            page.locator("div.text-5xl").first.wait_for(timeout=15000)
            SI["pm_created"] = page.locator("div.text-tertiary", has_text="PMs Created").locator("xpath=following-sibling::div").first.inner_text().strip()
            SI["pm_compliance_ok"] = (
                page.locator("div.text-5xl").first.inner_text().strip().endswith("%")
                and SI["pm_created"].isdigit()
                and int(SI["pm_created"]) > 0
            )
            SI["no_empty_marker"] = page.locator("text=No data yet for this report.").count() == 0 and page.locator("text=Failed to load report data.").count() == 0
            snap(page, "g5_3_08_reports_pm_compliance")
        except Exception as e:
            print("REPORTS_ERR", e)
            SI["backlog_chart_ok"] = False
            SI["pm_compliance_ok"] = False
            SI["no_empty_marker"] = False

        # ---------- Cleanup: soft-delete test data, DB as-found ----------
        try:
            if notif_id:
                page.request.delete(api + f"/api/notifications/{notif_id}", headers=hdrs)
            if linked_wo_id:
                page.request.delete(api + f"/api/work-orders/{linked_wo_id}", headers=hdrs)
            if ui_wo_id:
                page.request.delete(api + f"/api/work-orders/{ui_wo_id}", headers=hdrs)
            wo_r2 = api_get(page, api, "/api/work-orders?take=1000", hdrs)
            notif_r2 = api_get(page, api, "/api/notifications?take=1000", hdrs)
            SI["cleanup_wo_restored"] = len(wo_r2.json().get("data", [])) == (before_wo if before_wo is not None else -1)
            SI["cleanup_notif_restored"] = len(notif_r2.json().get("data", [])) == (before_notif if before_notif is not None else -1)
        except Exception as e:
            print("CLEANUP_ERR", e)
            SI["cleanup_wo_restored"] = False
            SI["cleanup_notif_restored"] = False

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
            and SI.get("dashboard_ok")
            and SI.get("api_token_ok")
            and SI.get("wo_created")
            and SI.get("wo_in_list")
            and SI.get("planned")
            and SI.get("scheduled")
            and SI.get("in_progress")
            and SI.get("completed")
            and SI.get("closed")
            and SI.get("notif_created")
            and SI.get("notif_convert_ok")
            and SI.get("linked_wo_ok")
            and SI.get("notif_converted_ui")
            and SI.get("backlog_chart_ok")
            and SI.get("pm_compliance_ok")
            and SI.get("no_empty_marker")
            and SI.get("cleanup_wo_restored")
            and SI.get("cleanup_notif_restored")
            and not PAGE_ERRORS
            and not CONSOLE_ERRORS
        )
        print("G5_3_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()