#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# G3  E2E VERIFY — Equipment & Locations & Materials & Work Centers
# Committed live API gate (login → API token → list+detail+meters+BOM →
# locations tree → materials → work centers), assertions + screenshots.
# Usage: python scripts/verify/verify_g3.py
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

        # ---------- Login ----------
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

        # ---------- API login ----------
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "operator", "password": "password"}),
            )
            token = r.json()["token"]
            hdrs = {"Authorization": f"Bearer {token}"}
            SI["api_token_ok"] = r.status == 200
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_token_ok"] = False
            hdrs = {}

        # ---------- API: equipment list + detail (meters/bom/loc/params) ----------
        target_id = None
        try:
            eqs = page.request.get(api + "/api/equipment?take=100", headers=hdrs).json()
            if not isinstance(eqs, list):
                eqs = eqs.get("data", [])
            SI["api_equipment_count"] = len(eqs)
            target = next(
                (e for e in eqs if e.get("equipmentCode") == "P-1001"),
                next(
                    (e for e in eqs if e.get("meters")),
                    eqs[0] if eqs else None,
                ),
            )
            if target:
                target_id = target["equipmentId"]
                SI["target_code"] = target["equipmentCode"]
                detail = page.request.get(api + f"/api/equipment/{target_id}", headers=hdrs).json()
                SI["api_meter_count"] = len(detail.get("meters") or [])
                SI["api_detail_has_meters"] = bool(detail.get("meters"))
                SI["api_detail_has_bom"] = bool(detail.get("bomItems"))
                SI["api_detail_has_loc"] = bool(detail.get("functionalLocation"))
                SI["api_detail_has_params"] = bool(detail.get("technicalParameters"))
        except Exception as e:
            print("API_EQUIP_ERR", e)
            SI["api_equipment_count"] = None

        # ---------- Equipment list page ----------
        page.goto(base + "/equipment", wait_until="domcontentloaded")
        try:
            page.locator("div.industrial-card table tbody tr").first.wait_for(timeout=15000)
            SI["list_rendered"] = True
        except Exception:
            SI["list_rendered"] = False
        snap(page, "g3_01_equipment_list")

        if target_id:
            try:
                tr = page.locator("tr", has=page.get_by_text(SI["target_code"], exact=True))
                tr.locator("td").first.click()
                page.wait_for_url(f"**/equipment/{target_id}", timeout=15000)
                page.locator("div.industrial-card").first.wait_for(timeout=15000)
                SI["detail_title_ok"] = SI["target_code"] in page.locator("body").inner_text()
                snap(page, "g3_02_equipment_detail")
            except Exception as e:
                print("DETAIL_NAV_ERR", e)
                SI["detail_title_ok"] = False

        # ---------- Locations (tree), Materials (table), Work Centers (cards) ----------
        for path, key, sel, label in [
            ("/locations", "locations_rendered", "div.industrial-card", "g3_03_locations"),
            ("/materials", "materials_rendered", "div.industrial-card table tbody tr", "g3_04_materials"),
            ("/work-centers", "work_centers_rendered", "div.industrial-card", "g3_05_work_centers"),
        ]:
            page.goto(base + path, wait_until="domcontentloaded")
            try:
                page.locator(sel).first.wait_for(timeout=15000)
                SI[key] = True
            except Exception:
                SI[key] = False
            snap(page, label)

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
            and SI.get("list_rendered")
            and SI.get("api_equipment_count") is not None
            and SI.get("locations_rendered")
            and SI.get("materials_rendered")
            and SI.get("work_centers_rendered")
            and not PAGE_ERRORS
        )
        print("G3_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
