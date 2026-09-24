#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 3.5a E2E VERIFY — catch-all 404 route inside the protected layout
# Authed navigation to an unknown path renders NotFoundPage WITH the app
# sidebar (protected layout still active); the Back-to-Dashboard link
# navigates to /dashboard; unauthenticated deep links redirect to
# /login. No page/console errors on the 404 page.
# Usage: python scripts/verify/verify_g3_5a.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []

UNKNOWN_PATHS = ["/nonexistent-page-xyz", "/nope/anything/at/all"]


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-port", type=int, default=BASE_PORT)
    args = ap.parse_args()
    base = f"http://localhost:{args.base_port}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()
        page.set_default_timeout(15000)

        def on_page_error(e):
            PAGE_ERRORS.append(re.sub(r"\s+", " ", str(e)))

        def on_console(m):
            if m.type == "error":
                CONSOLE_ERRORS.append(m.text.strip().replace("\n", " "))

        page.on("pageerror", on_page_error)
        page.on("console", on_console)

        # ---------- Unauthenticated deep link → redirect to /login ----------
        try:
            page.goto(base + UNKNOWN_PATHS[0], wait_until="domcontentloaded")
            page.wait_for_timeout(700)
            SI["unauthed_redirect_login"] = "/login" in page.url
        except Exception as e:
            print("UNAUTH_ERR", e)
            SI["unauthed_redirect_login"] = False

        # ---------- Login, then hit the catch-all ----------
        try:
            page.goto(base + "/login", wait_until="domcontentloaded")
            form = page.locator("form").first
            form.locator("input[type='text']").fill("admin")
            form.locator("input[type='password']").fill("password")
            form.locator("button[type='submit']").click()
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["ui_login_ok"] = True

            page.goto(base + UNKNOWN_PATHS[0], wait_until="domcontentloaded")
            page.wait_for_timeout(700)
            body = page.locator("body").inner_text()
            SI["not_found_heading"] = "Page not found" in body and "404" in body
            SI["sidebar_still_visible"] = page.locator("nav").count() == 1
            SI["back_to_dashboard_link"] = page.get_by_role("link", name="Back to Dashboard").count() == 1

            page.get_by_role("link", name="Back to Dashboard").click()
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["back_to_dashboard_navigates"] = "/dashboard" in page.url
            snap(page, "g3_5a_01_dashboard_after_404_link")
        except Exception as e:
            print("AUTH_ERR", e)
            for k in ("ui_login_ok", "not_found_heading", "sidebar_still_visible",
                      "back_to_dashboard_link", "back_to_dashboard_navigates"):
                if k not in SI:
                    SI[k] = False

        # Second unknown path (fresh 404 render, no errors)
        try:
            page.goto(base + UNKNOWN_PATHS[1], wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            body2 = page.locator("body").inner_text()
            SI["second_unknown_path_404"] = "Page not found" in body2
        except Exception as e:
            print("SECOND_ERR", e)
            SI["second_unknown_path_404"] = False

        SI["page_errors_empty"] = not PAGE_ERRORS
        SI["console_errors_empty"] = not CONSOLE_ERRORS

        print("SI_JSON", json.dumps(SI))
        print("PAGE_ERRORS", PAGE_ERRORS)
        print("CONSOLE_ERRORS", CONSOLE_ERRORS)

        browser.close()

        ok = (
            SI.get("unauthed_redirect_login")
            and SI.get("ui_login_ok")
            and SI.get("not_found_heading")
            and SI.get("sidebar_still_visible")
            and SI.get("back_to_dashboard_link")
            and SI.get("back_to_dashboard_navigates")
            and SI.get("second_unknown_path_404")
            and SI.get("page_errors_empty")
            and SI.get("console_errors_empty")
        )
        print("G3_5A_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()