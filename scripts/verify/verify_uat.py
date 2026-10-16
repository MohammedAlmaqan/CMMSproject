#!/usr/bin/env python3
# ============================================================
# UAT WALKTHROUGH - owner-readable evidence
# A single scoped Playwright pass producing uat_*.png screenshots and a short
# exception report (screenshots/uat_exception_report.txt). It is NOT a gate:
# it walks the product once so a human can see it work, then records anything
# that did not behave. Stage 1 (verify_g*.py + verify_r7.py) remains the gate.
#
# Covers: admin login; every screen once (one shot each); six-role login with
# one restricted page per role; one full WO lifecycle; one notification -> WO
# conversion; one .xlsx export per report (10); one failure-mode check with the
# API unreachable (all /api/** aborted - equivalent to the backend being down).
#
# Requires: Vite dev server on :3000 and the backend on :4000, both running.
# Usage:    python scripts/verify/verify_uat.py
# Exit:     0 = every expectation met and no unexpected page/console error
#           1 = at least one expectation not met (see the exception report)
# ============================================================
import argparse
import json
import os
import re
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
HERE = os.path.dirname(os.path.abspath(__file__))
SCREEN = os.path.abspath(os.path.join(HERE, "..", "..", "screenshots"))
REPORT = os.path.join(SCREEN, "uat_exception_report.txt")

REPORTS = [
    "backlog",
    "pm-compliance",
    "mtbf",
    "mttr",
    "cost-summary",
    "downtime",
    "material-consumption",
    "backlog-hours-by-work-center",
    "top-cost-equipment",
    "notifications-awaiting-conversion",
]
# username -> whether /administration is allowed (Administrator only)
ROLES = [
    ("admin", "Administrator", True),
    ("planner", "Maintenance Planner", False),
    ("supervisor", "Maintenance Supervisor", False),
    ("tech1", "Technician", False),
    ("operator", "Requester", False),
    ("auditor", "View-Only", False),
]
FABRICATED = ["simulated", "math.random", "mock data", "lorem ipsum", "sample data"]

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
RESP_FAILS = []
EXCEPTIONS = []
# The failure-mode check deliberately makes the API unreachable, so the client
# noise it produces is expected. Those errors are captured separately so they
# cannot mask a real error elsewhere, and are reported as their own section.
FAILURE_PHASE = [False]
FAILURE_PAGE = []
FAILURE_CONSOLE = []
FAILURE_RESP = []


def snap(page, label):
    try:
        page.screenshot(path=os.path.join(SCREEN, f"{label}.png"))
    except Exception as e:
        EXCEPTIONS.append(f"SNAP_FAIL {label}: {e}")


def rows(body):
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        return body.get("data", [])
    return []


def ui_login(page, base, username):
    page.goto(base, wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    page.goto(base + "/login", wait_until="domcontentloaded")
    form = page.locator("form").first
    form.locator("input[type='text']").fill(username)
    form.locator("input[type='password']").fill("password")
    form.locator("button[type='submit']").click()
    page.wait_for_url("**/dashboard", timeout=15000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-port", type=int, default=BASE_PORT)
    ap.add_argument("--api-port", type=int, default=API_PORT)
    args = ap.parse_args()
    base = f"http://localhost:{args.base_port}"
    api = f"http://localhost:{args.api_port}"
    os.makedirs(SCREEN, exist_ok=True)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 950}, accept_downloads=True)
        page = ctx.new_page()
        page.set_default_timeout(15000)

        def on_page_error(e):
            (FAILURE_PAGE if FAILURE_PHASE[0] else PAGE_ERRORS).append(re.sub(r"\s+", " ", str(e)))

        def on_console(m):
            if m.type != "error":
                return
            (FAILURE_CONSOLE if FAILURE_PHASE[0] else CONSOLE_ERRORS).append(
                m.text.strip().replace("\n", " "))

        def on_resp(r):
            if r.status >= 400:
                (FAILURE_RESP if FAILURE_PHASE[0] else RESP_FAILS).append(
                    (r.status, r.url.split("?")[0]))

        page.on("pageerror", on_page_error)
        page.on("console", on_console)
        page.on("response", on_resp)
        page.on("dialog", lambda d: d.accept())

        # ---------- API login (admin) + ids for detail screens ----------
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
            EXCEPTIONS.append(f"API_LOGIN_ERR {e}")
            SI["api_token_ok"] = False
            hdrs = {}

        def api_rows(path):
            try:
                return rows(page.request.get(api + path, headers=hdrs).json())
            except Exception as e:
                EXCEPTIONS.append(f"API_ROWS_ERR {path}: {e}")
                return []

        wo_id = next((w.get("workOrderId") for w in api_rows("/api/work-orders?take=1")), None)
        notif_id = next((n.get("notificationId") for n in api_rows("/api/notifications?take=1")), None)
        equip_id = next((e.get("equipmentId") for e in api_rows("/api/equipment?take=1")), None)

        # ---------- Admin: walk every screen once ----------
        try:
            ui_login(page, base, "admin")
            SI["admin_login_ok"] = True
        except Exception as e:
            EXCEPTIONS.append(f"ADMIN_LOGIN_ERR {e}")
            SI["admin_login_ok"] = False

        detail_ids = {
            "work-orders": wo_id,
            "notifications": notif_id,
            "equipment": equip_id,
        }
        screens = [
            ("dashboard", "/dashboard", None),
            ("work-orders", "/work-orders", None),
            ("work-order-create", "/work-orders/new", None),
            ("work-order-detail", f"/work-orders/{wo_id}" if wo_id else None, None),
            ("notifications", "/notifications", None),
            ("notification-detail", f"/notifications/{notif_id}" if notif_id else None, None),
            ("equipment", "/equipment", None),
            ("equipment-detail", f"/equipment/{equip_id}" if equip_id else None, None),
            ("locations", "/locations", None),
            ("materials", "/materials", None),
            ("work-centers", "/work-centers", None),
            ("task-lists", "/task-lists", None),
            ("preventive-maintenance", "/preventive-maintenance", None),
            ("reports", "/reports", None),
            ("administration", "/administration", None),
        ]
        walked = []
        for name, path, _ in screens:
            if path is None:
                walked.append((name, "SKIP (no id available)", False))
                continue
            try:
                page.goto(base + path, wait_until="domcontentloaded")
                page.wait_for_timeout(700)
                snap(page, f"uat_screen_{name}")
                walked.append((name, page.url, True))
            except Exception as e:
                EXCEPTIONS.append(f"SCREEN_ERR {name}: {e}")
                walked.append((name, str(e), False))
        SI["screens_walked"] = sum(1 for _, _, ok in walked if ok)

        # ---------- Six-role login, one restricted page per role ----------
        role_results = []
        for username, role, allowed in ROLES:
            try:
                ui_login(page, base, username)
                page.goto(base + "/administration", wait_until="domcontentloaded")
                page.wait_for_timeout(500)
                reached = page.url.rstrip("/").endswith("/administration")
                ok = reached == allowed
                if not ok:
                    EXCEPTIONS.append(
                        f"RBAC role={role}: /administration reached={reached}, expected={allowed}"
                    )
                snap(page, f"uat_role_{username}")
                role_results.append((username, role, allowed, reached, ok))
            except Exception as e:
                EXCEPTIONS.append(f"ROLE_ERR {username}: {e}")
                role_results.append((username, role, allowed, None, False))

        # ---------- Admin: one full WO lifecycle ----------
        lifecycle = {}
        create_wo_id = None
        try:
            ui_login(page, base, "admin")
            page.goto(base + "/work-orders/new", wait_until="domcontentloaded")
            fl = page.locator("form select").nth(2)
            fl.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            fl.select_option(index=1)
            wc = page.locator("form select").nth(4)
            wc.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            wc.select_option(index=1)
            sup = page.locator("form select").nth(6)
            sup.locator("option").nth(1).wait_for(state="attached", timeout=15000)
            sup.select_option(index=1)
            page.locator("form textarea").first.fill("UAT walkthrough lifecycle work order")
            snap(page, "uat_lifecycle_create")
            page.get_by_role("button", name="Create Work Order").click()
            page.wait_for_url(re.compile(r".*/work-orders/[0-9a-fA-F-]{36}"), timeout=20000)
            create_wo_id = page.url.rstrip("/").rsplit("/", 1)[-1]
            lifecycle["created"] = bool(create_wo_id)

            # Draft -> Planned is gated by requiresAtLeastOneOperation, so the
            # order needs one operation before it can be planned (as a user would
            # add on the detail page's Operations tab). Create it over the API to
            # keep this walkthrough small.
            crfs = api_rows("/api/crafts?take=1")
            op = page.request.post(
                api + "/api/work-order-operations",
                headers={**hdrs, "Content-Type": "application/json"},
                data=json.dumps({
                    "workOrderId": create_wo_id,
                    "sequenceNumber": 1,
                    "description": "UAT walkthrough lifecycle operation",
                    "craftId": crfs[0]["craftId"] if crfs else None,
                    "plannedHours": 1,
                    "numberOfTechnicians": 1,
                }),
            )
            if op.status not in (200, 201):
                EXCEPTIONS.append(f"LIFECYCLE operation add status={op.status}")

            transitions = [
                ("Plan", "Schedule", "planned"),
                ("Schedule", "Start", "scheduled"),
                ("Start", "Complete", "in_progress"),
                ("Complete", "Close", "completed"),
            ]
            for button, nxt, key in transitions:
                page.get_by_role("button", name=button, exact=True).wait_for(timeout=15000)
                page.get_by_role("button", name=button, exact=True).click()
                page.get_by_role("button", name=nxt, exact=True).wait_for(timeout=15000)
                lifecycle[key] = True
            page.get_by_role("button", name="Close", exact=True).click()
            page.get_by_text("Closed", exact=True).first.wait_for(timeout=15000)
            lifecycle["closed"] = True
            snap(page, "uat_lifecycle_closed")
        except Exception as e:
            EXCEPTIONS.append(f"LIFECYCLE_ERR {e}")
            lifecycle.setdefault("closed", False)

        # ---------- One notification -> WO conversion ----------
        conversion = {}
        linked_wo_id = None
        new_notif_id = None
        try:
            fls = api_rows("/api/functional-locations?take=100")
            fl_id = next((x.get("functionalLocationId") for x in fls
                          if x.get("locationCode") == "PL-01"),
                         fls[0].get("functionalLocationId") if fls else None)
            users = api_rows("/api/users?take=100")
            operator_id = next((u.get("userId") for u in users
                                if u.get("username") == "operator"),
                               users[0].get("userId") if users else None)
            r = page.request.post(
                api + "/api/notifications",
                headers={**hdrs, "Content-Type": "application/json"},
                data=json.dumps({
                    "type": "M2",
                    "priority": "Medium",
                    "description": "UAT walkthrough convert-to-WO notification",
                    "functionalLocationId": fl_id,
                    "reportedByUserId": operator_id,
                    "breakdownFlag": False,
                }),
            )
            if r.status == 201:
                new_notif_id = r.json()["notificationId"]
                notif_number = r.json()["notificationNumber"]
                conversion["notif_created"] = True
            else:
                conversion["notif_created"] = False
                EXCEPTIONS.append(f"NOTIF_CREATE status={r.status}")

            if new_notif_id and token:
                ui_login(page, base, "admin")
                page.goto(base + "/notifications", wait_until="domcontentloaded")
                page.get_by_text(notif_number, exact=True).first.wait_for(timeout=15000)
                page.get_by_text(notif_number, exact=True).first.click()
                page.wait_for_url(re.compile(r".*/notifications/[0-9a-fA-F-]{36}"), timeout=15000)
                snap(page, "uat_notification_before_convert")
                page.get_by_role("button", name="Convert to WO").first.click()
                page.wait_for_url(re.compile(r".*/work-orders/[0-9a-fA-F-]{36}"), timeout=20000)
                linked_wo_id = page.url.rstrip("/").rsplit("/", 1)[-1]
                conversion["convert_ok"] = bool(linked_wo_id)
                snap(page, "uat_notification_converted")
        except Exception as e:
            EXCEPTIONS.append(f"CONVERSION_ERR {e}")
            conversion.setdefault("convert_ok", False)

        # ---------- One .xlsx export per report (10, authenticated) ----------
        exports = []
        for name in REPORTS:
            try:
                resp = page.request.get(api + f"/api/reports/{name}/export.xlsx", headers=hdrs)
                body = resp.body()
                ctype = resp.headers.get("content-type", "")
                ok = (resp.status == 200 and body[:2] == b"PK"
                      and "spreadsheetml" in ctype and len(body) > 0)
                if not ok:
                    EXCEPTIONS.append(
                        f"EXPORT {name}: status={resp.status} magic={body[:2]!r} ctype={ctype} bytes={len(body)}"
                    )
                else:
                    with open(os.path.join(SCREEN, f"uat_export_{name}.xlsx"), "wb") as fh:
                        fh.write(body)
                exports.append((name, resp.status, len(body), ok))
            except Exception as e:
                EXCEPTIONS.append(f"EXPORT_ERR {name}: {e}")
                exports.append((name, None, 0, False))

        # ---------- One failure-mode check (API unreachable) ----------
        failure = {}
        try:
            page.goto(base + "/dashboard", wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            FAILURE_PHASE[0] = True
            ctx.route("**/api/**", lambda route: route.abort())
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1500)
            text = page.locator("body").inner_text()
            lower = text.lower()
            failure["visible_error"] = ("failed to load" in lower) or ("retry" in lower)
            failure["fabricated_data"] = any(m in lower for m in FABRICATED)
            failure["body_snippet"] = re.sub(r"\s+", " ", text)[:200]
            snap(page, "uat_failure_mode")
            if not failure["visible_error"]:
                EXCEPTIONS.append("FAILURE_MODE: no visible error after API abort")
            if failure["fabricated_data"]:
                EXCEPTIONS.append("FAILURE_MODE: fabricated/mock markers present after API abort")
            FAILURE_PHASE[0] = False
            ctx.unroute("**/api/**")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            failure["recovered"] = "failed to load" not in page.locator("body").inner_text().lower()
            snap(page, "uat_failure_mode_recovered")
        except Exception as e:
            EXCEPTIONS.append(f"FAILURE_MODE_ERR {e}")
            failure.setdefault("visible_error", False)

        # ---------- Cleanup test data (soft-delete; DB as-found) ----------
        try:
            if new_notif_id:
                page.request.delete(api + f"/api/notifications/{new_notif_id}", headers=hdrs)
            if linked_wo_id:
                page.request.delete(api + f"/api/work-orders/{linked_wo_id}", headers=hdrs)
            if create_wo_id:
                page.request.delete(api + f"/api/work-orders/{create_wo_id}", headers=hdrs)
        except Exception as e:
            EXCEPTIONS.append(f"CLEANUP_ERR {e}")

        # ---------- Expectations ----------
        rbac_ok = all(ok for _, _, _, _, ok in role_results)
        exports_ok = all(ok for _, _, _, ok in exports)
        core_ok = (
            SI.get("api_token_ok")
            and SI.get("admin_login_ok")
            and SI.get("screens_walked", 0) == len([s for s in screens if s[1]])
            and rbac_ok
            and lifecycle.get("closed")
            and conversion.get("convert_ok")
            and exports_ok
            and failure.get("visible_error")
            and not failure.get("fabricated_data")
            and not PAGE_ERRORS
            and not CONSOLE_ERRORS
        )

        # ---------- Exception report ----------
        L = []
        L.append("UAT WALKTHROUGH - EXCEPTION REPORT")
        L.append(f"run: {datetime.now().isoformat(timespec='seconds')}")
        L.append(f"stack: frontend {base}  backend {api}")
        L.append(f"result: {'PASS' if core_ok else 'FAIL'}")
        L.append("")
        L.append("SCREENS WALKED (admin)")
        for name, url, ok in walked:
            L.append(f"  [{'ok' if ok else 'XX'}] {name}: {url}")
        L.append("")
        L.append("RBAC - /administration (Administrator only)")
        for username, role, allowed, reached, ok in role_results:
            L.append(f"  [{'ok' if ok else 'XX'}] {role} ({username}): reached={reached} expected={allowed}")
        L.append("")
        L.append("WO LIFECYCLE")
        L.append(f"  create -> planned -> scheduled -> in_progress -> completed -> closed: "
                 f"{'closed' if lifecycle.get('closed') else 'NOT CLOSED'}")
        L.append("")
        L.append("NOTIFICATION -> WO CONVERSION")
        L.append(f"  created -> converted -> linked WO: "
                 f"{'ok' if conversion.get('convert_ok') else 'FAILED'}")
        L.append("")
        L.append("XLSX EXPORTS (one per report)")
        for name, status, size, ok in exports:
            L.append(f"  [{'ok' if ok else 'XX'}] {name}: status={status} bytes={size}")
        L.append("")
        L.append("FAILURE MODE (API unreachable: all /api/** aborted)")
        L.append(f"  visible error: {failure.get('visible_error')}")
        L.append(f"  fabricated data: {failure.get('fabricated_data')}")
        L.append(f"  recovered on reload: {failure.get('recovered')}")
        L.append(f"  body: {failure.get('body_snippet', '')}")
        L.append("")
        L.append("EXCEPTIONS")
        if EXCEPTIONS:
            for e in EXCEPTIONS:
                L.append(f"  - {e}")
        else:
            L.append("  none")
        if PAGE_ERRORS:
            L.append("")
            L.append("PAGE ERRORS")
            for e in PAGE_ERRORS:
                L.append(f"  - {e}")
        if CONSOLE_ERRORS:
            L.append("")
            L.append("CONSOLE ERRORS")
            for e in CONSOLE_ERRORS:
                L.append(f"  - {e}")
        seen = set()
        fails = [f for f in RESP_FAILS if not (f in seen or seen.add(f))]
        if fails:
            L.append("")
            L.append("HTTP >= 400 SEEN")
            for s, u in fails:
                L.append(f"  - {s} {u}")
        L.append("")
        L.append("EXPECTED NOISE (failure-mode phase: API aborted on purpose)")
        L.append(f"  page errors={len(FAILURE_PAGE)} console errors={len(FAILURE_CONSOLE)} "
                 f"http>=400={len(FAILURE_RESP)}")
        report_text = "\n".join(L)
        with open(REPORT, "w", encoding="utf-8") as fh:
            fh.write(report_text + "\n")

        browser.close()

    try:
        print(report_text)
    except Exception:
        sys.stdout.buffer.write((report_text + "\n").encode("utf-8", "replace"))
    print("UAT_EXIT", "PASS" if core_ok else "FAIL")
    sys.exit(0 if core_ok else 1)


if __name__ == "__main__":
    main()
