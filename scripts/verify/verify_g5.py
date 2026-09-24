#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G5  E2E VERIFY — Dashboard + Reports (live API integration)
# Committed live API gate (login → 7 report + 3 dashboard endpoints →
# headless /reports + /dashboard renders → CSV export download),
# assertions + screenshots.
# Usage: python scripts/verify/verify_g5.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []
SEEN_API = {}


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
        ctx = browser.new_context(viewport={"width": 1600, "height": 950}, accept_downloads=True)
        page = ctx.new_page()
        page.set_default_timeout(20000)

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
            url = resp.url.split("?")[0]
            if resp.status >= 400:
                RESP_FAILS.append((resp.status, url))
            for key in ("/api/dashboard/kpis", "/api/dashboard/alerts", "/api/dashboard/cost-summary",
                        "/api/reports/backlog", "/api/reports/pm-compliance", "/api/reports/mtbf",
                        "/api/reports/mttr", "/api/reports/cost-summary", "/api/reports/downtime",
                        "/api/reports/material-consumption"):
                if key in url:
                    SEEN_API[key] = True

        page.on("pageerror", on_page_error)
        page.on("console", on_console)
        page.on("response", on_resp)
        page.on("dialog", lambda d: d.accept())

        # ---------- UI login (admin) ----------
        page.goto(base + "/login", wait_until="domcontentloaded")
        form = page.locator("form").first
        form.locator("input[type='text']").fill("admin")
        form.locator("input[type='password']").fill("password")
        form.locator("button[type='submit']").click()
        try:
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["login_ok"] = True
        except Exception:
            SI["login_ok"] = False

        # ---------- API login ----------
        hdrs = {}
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

        # ---------- API: 7 report + 3 dashboard endpoints ----------
        probes = [
            ("/api/reports/backlog", "list", ("status", "count")),
            ("/api/reports/pm-compliance", "dict", ("period", "complianceRate")),
            ("/api/reports/mtbf", "list", None),
            ("/api/reports/mttr", "list", None),
            ("/api/reports/cost-summary", "list", None),
            ("/api/reports/downtime", "list", None),
            ("/api/reports/material-consumption", "list", None),
            ("/api/dashboard/kpis", "dict", ("activeWorkOrders", "completionRate")),
            ("/api/dashboard/alerts", "list", None),
            ("/api/dashboard/cost-summary", "list", None),
        ]
        for path, kind, keys in probes:
            try:
                resp = page.request.get(api + path, headers=hdrs)
                body = resp.json()
                key = path.strip("/").replace("/", "_")
                SI[key + "_status"] = resp.status
                SI[key + "_shape_ok"] = False
                if resp.status == 200:
                    if kind == "list":
                        if isinstance(body, list):
                            if not body:
                                SI[key + "_shape_ok"] = True
                            elif keys and all(k in body[0] for k in keys):
                                SI[key + "_shape_ok"] = True
                            elif keys is None:
                                SI[key + "_shape_ok"] = True
                            SI[key + "_count"] = len(body)
                    else:
                        SI[key + "_shape_ok"] = bool(body) and all(k in body for k in keys)
                        SI[key + "_keys"] = sorted(body.keys())
                SI[key + "_raw"] = json.dumps(body)[:160]
            except Exception as e:
                print("API_PROBE_ERR", path, e)
                SI[path.strip("/").replace("/", "_") + "_status"] = None

        # ---------- /reports render ----------
        page.goto(base + "/reports", wait_until="domcontentloaded")
        reports_marker_ok = True
        body_text = ""
        try:
            page.locator("svg .recharts-bar-rectangle path").first.wait_for(timeout=15000)
            body_text = page.locator("body").inner_text()
            lower = body_text.lower()
            markers = ["math.random", "simulated", "jan", "feb"]
            reports_marker_ok = not any(m in lower for m in markers)
            SI["reports_backlog_chart_ok"] = True
            SI["reports_backlog_has_status"] = "Scheduled" in body_text or "Draft" in body_text
        except Exception as e:
            print("REPORTS_RENDER_ERR", e)
            SI["reports_backlog_chart_ok"] = False
            SI["reports_backlog_has_status"] = False
        snap(page, "g5_01_reports_backlog")

        # Report with provable live data -> PM Compliance period marker
        # (the seed DB has no material-usage rows, so PM Compliance is the
        # live report used here, matching verify_g5_3.py's choice)
        try:
            page.get_by_role("button", name="PM Compliance", exact=True).click()
            page.get_by_text(re.compile(r"2026-\d{2}")).first.wait_for(timeout=15000)
            SI["reports_pm_data_ok"] = True
        except Exception as e:
            print("REPORTS_PM_ERR", e)
            SI["reports_pm_data_ok"] = False
        snap(page, "g5_02_reports_pm_compliance")

        # PM Compliance tab -> backend period
        try:
            page.get_by_role("button", name="PM Compliance", exact=True).click()
            page.locator("h2", has_text="PM Compliance").wait_for(timeout=15000)
            page.get_by_text(re.compile(r"2026-\d{2}")).first.wait_for(timeout=15000)
            SI["reports_pm_period_ok"] = True
        except Exception as e:
            print("REPORTS_PM_ERR", e)
            SI["reports_pm_period_ok"] = False

        # Export CSV download (current report has rows)
        try:
            with page.expect_download(timeout=15000) as dl:
                page.get_by_role("button", name="Export", exact=True).first.click()
            download = dl.value
            SI["export_suggested_filename"] = download.suggested_filename
            SI["export_download_ok"] = download.suggested_filename.endswith(".csv")
        except Exception as e:
            print("EXPORT_ERR", e)
            SI["export_download_ok"] = False
            SI["export_suggested_filename"] = None

        # ---------- /dashboard render ----------
        page.goto(base + "/dashboard", wait_until="domcontentloaded")
        SI["dashboard_seen_api"] = bool(SEEN_API.get("/api/dashboard/cost-summary"))
        SI["dashboard_alerts_seen_api"] = bool(SEEN_API.get("/api/dashboard/alerts"))
        try:
            page.get_by_role("heading", name="Maintenance Trend", exact=True).wait_for(timeout=15000)
            trend_card = page.get_by_role("heading", name="Maintenance Trend", exact=True).locator(
                "xpath=ancestor::div[contains(@class,'industrial-card')]"
            )
            trend_card.locator("svg.recharts-surface").wait_for(timeout=15000)
            area_count = trend_card.locator(".recharts-area").count()
            SI["trend_area_series"] = area_count
            SI["trend_chart_ok"] = area_count >= 1 and "Sep" in page.locator("body").inner_text()
        except Exception as e:
            print("TREND_ERR", e)
            SI["trend_chart_ok"] = False
        try:
            page.get_by_text("System Alerts", exact=True).wait_for(timeout=10000)
            db = page.locator("body").inner_text()
            SI["alerts_card_present"] = True
            SI["alerts_live_rows"] = "PM Work Order Generated" in db
        except Exception as e:
            print("ALERTS_ERR", e)
            SI["alerts_card_present"] = False
            SI["alerts_live_rows"] = False
        dash_marker_ok = True
        try:
            db2 = page.locator("body").inner_text().lower()
            dash_marker_ok = not any(m in db2 for m in ["simulated", "jan", "feb"])
            SI["dash_no_hardcoded_months"] = dash_marker_ok
        except Exception:
            SI["dash_no_hardcoded_months"] = False
        snap(page, "g5_03_dashboard")

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
            and SI.get("api_reports_backlog_status") == 200
            and SI.get("api_reports_backlog_shape_ok")
            and SI.get("api_reports_pm-compliance_status") == 200
            and SI.get("api_reports_pm-compliance_shape_ok")
            and SI.get("api_reports_mtbf_status") == 200
            and SI.get("api_reports_mtbf_shape_ok")
            and SI.get("api_reports_mttr_status") == 200
            and SI.get("api_reports_mttr_shape_ok")
            and SI.get("api_reports_cost-summary_status") == 200
            and SI.get("api_reports_cost-summary_shape_ok")
            and SI.get("api_reports_downtime_status") == 200
            and SI.get("api_reports_downtime_shape_ok")
            and SI.get("api_reports_material-consumption_status") == 200
            and SI.get("api_reports_material-consumption_shape_ok")
            and SI.get("api_dashboard_kpis_status") == 200
            and SI.get("api_dashboard_kpis_shape_ok")
            and SI.get("api_dashboard_alerts_status") == 200
            and SI.get("api_dashboard_alerts_shape_ok")
            and SI.get("api_dashboard_cost-summary_status") == 200
            and SI.get("api_dashboard_cost-summary_shape_ok")
            and SI.get("reports_backlog_chart_ok")
            and SI.get("reports_pm_data_ok")
            and SI.get("reports_pm_period_ok")
            and SI.get("export_download_ok")
            and SI.get("trend_chart_ok")
            and SI.get("alerts_card_present")
            and SI.get("alerts_live_rows")
            and SI.get("dashboard_seen_api")
            and SI.get("dashboard_alerts_seen_api")
            and reports_marker_ok
            and dash_marker_ok
            and not PAGE_ERRORS
            and not CONSOLE_ERRORS
        )
        print("G5_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()