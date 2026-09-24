#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G6b E2E VERIFY — Sidebar entries, Swagger spec, 8h JWT decision
# Login UI+API (admin) → sidebar asserts (Work Centers + Preventive
# Maintenance) → click-through both routes → /api-docs.json paths non-empty
# + WO route group present → screenshots.
# Usage: python scripts/verify/verify_g6b.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import base64
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


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def decode_jwt_payload(token):
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception:
        return {}


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

        # ---------- Login UI (admin) ----------
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

        # ---------- Sidebar assertions ----------
        nav = page.locator("nav")
        try:
            nav.get_by_text("Work Centers", exact=True).first.wait_for(timeout=15000)
            nav.get_by_text("Preventive Maintenance", exact=True).first.wait_for(timeout=15000)
            SI["sidebar_work_centers"] = nav.get_by_text("Work Centers", exact=True).first.is_visible()
            SI["sidebar_preventive_maintenance"] = nav.get_by_text("Preventive Maintenance", exact=True).first.is_visible()
        except Exception as e:
            print("SIDEBAR_ERR", e)
            SI["sidebar_work_centers"] = False
            SI["sidebar_preventive_maintenance"] = False
        snap(page, "g6b_01_sidebar")

        # ---------- Click-through: Work Centers then Preventive Maintenance ----------
        try:
            nav.get_by_text("Work Centers", exact=True).click()
            page.wait_for_url("**/work-centers", timeout=15000)
            page.locator("div.industrial-card").first.wait_for(timeout=15000)
            SI["click_work_centers_nav"] = True
            snap(page, "g6b_02_work_centers_click")
        except Exception as e:
            print("CLICK_WC_ERR", e)
            SI["click_work_centers_nav"] = False

        try:
            nav.get_by_text("Preventive Maintenance", exact=True).click()
            page.wait_for_url("**/preventive-maintenance", timeout=15000)
            page.locator("div.industrial-card").first.wait_for(timeout=15000)
            SI["click_pm_nav"] = True
            snap(page, "g6b_03_preventive_maintenance_click")
        except Exception as e:
            print("CLICK_PM_ERR", e)
            SI["click_pm_nav"] = False

        # ---------- Direct route renders ----------
        for path, key, sel, label in [
            ("/work-centers", "work_centers_rendered", "div.industrial-card", "g6b_04_work_centers"),
            ("/preventive-maintenance", "pm_rendered", "div.industrial-card", "g6b_05_preventive_maintenance"),
        ]:
            page.goto(base + path, wait_until="domcontentloaded")
            try:
                page.locator(sel).first.wait_for(timeout=15000)
                SI[key] = True
            except Exception:
                SI[key] = False
            snap(page, label)

        # ---------- API login + JWT lifetime ----------
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "admin", "password": "password"}),
            )
            SI["api_token_ok"] = r.status == 200
            payload = decode_jwt_payload(r.json()["token"])
            iat = payload.get("iat", 0)
            exp = payload.get("exp", 0)
            SI["jwt_seconds_alive"] = exp - iat if iat and exp else None
            SI["jwt_8h"] = SI["jwt_seconds_alive"] == 28800
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_token_ok"] = False
            SI["jwt_8h"] = False

        # ---------- Swagger spec ----------
        try:
            spec = page.request.get(api + "/api-docs.json").json()
            paths = spec.get("paths") or {}
            SI["api_docs_paths_count"] = len(paths)
            SI["api_docs_non_empty"] = len(paths) > 0
            SI["api_docs_wo_group"] = "/api/work-orders" in paths or any(
                k.startswith("/api/work-orders") for k in paths
            )
        except Exception as e:
            print("API_DOCS_ERR", e)
            SI["api_docs_non_empty"] = False
            SI["api_docs_wo_group"] = False

        page.goto(base + "/api-docs", wait_until="domcontentloaded")
        try:
            page.get_by_text("CommandPulse CMMS API", exact=False).first.wait_for(timeout=15000)
            SI["swagger_ui_rendered"] = True
        except Exception:
            SI["swagger_ui_rendered"] = False
        snap(page, "g6b_06_api_docs")

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
            and SI.get("sidebar_work_centers")
            and SI.get("sidebar_preventive_maintenance")
            and SI.get("click_work_centers_nav")
            and SI.get("click_pm_nav")
            and SI.get("work_centers_rendered")
            and SI.get("pm_rendered")
            and SI.get("api_docs_non_empty")
            and SI.get("api_docs_wo_group")
            and SI.get("swagger_ui_rendered")
            and not PAGE_ERRORS
        )
        print("G6B_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()