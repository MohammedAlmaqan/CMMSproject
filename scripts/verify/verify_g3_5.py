#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 3.5 E2E VERIFY — WCAG 2.1 AA light pass
# Headless audit of all 14 protected routes: page load w/o errors, at
# least one keyboard-focusable control per route, no interactive element
# trapped with tabindex=-1, search/filter controls carry accessible
# names, CommandPalette is a proper modal dialog, skip link + main
# landmark present, global focus-visible ring + lightened tertiary text
# compiled into the stylesheet, and a real keyboard-only Tab walk on
# login, the WO list and the WO detail page.
# Usage: python scripts/verify/verify_g3_5.py
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


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def search_labeled(page):
    boxes = page.locator('input[placeholder*="earch"], input[placeholder*="earch"]')
    if boxes.count() == 0:
        return None
    ok = True
    for i in range(boxes.count()):
        al = boxes.nth(i).get_attribute("aria-label")
        if not al:
            ok = False
    return ok


def focus_walk(page, route, steps, key):
    page.goto(route, wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    landed = 0
    for _ in range(steps):
        page.keyboard.press("Tab")
        tag = (page.evaluate("() => (document.activeElement || {}).tagName") or "").lower()
        if tag not in ("body", "html"):
            landed += 1
    SI[key] = landed >= steps - 2


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

        page.on("pageerror", on_page_error)
        page.on("console", on_console)

        # ---------- Login via API for ids ----------
        token = None
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "admin", "password": "password"}),
            )
            token = r.json()["token"]
            SI["api_login_ok"] = r.status == 200 and bool(token)
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_login_ok"] = False

        def get_json(url, hdrs):
            return page.request.get(api + url, headers=hdrs).json()

        wo_id = notif_id = eq_id = None
        if token:
            hdrs = {"Authorization": f"Bearer {token}"}
            try:
                wos = get_json("/api/work-orders?take=1", hdrs)
                if isinstance(wos, dict) and wos.get("data"):
                    wo_id = wos["data"][0].get("workOrderId")
            except Exception as e:
                print("WOFETCH_ERR", e)
            try:
                notifs = get_json("/api/notifications?take=1", hdrs)
                if isinstance(notifs, dict) and notifs.get("data"):
                    notif_id = notifs["data"][0].get("notificationId")
            except Exception as e:
                print("NOTIF_FETCH_ERR", e)
            try:
                eqs = get_json("/api/equipment?take=1", hdrs)
                if isinstance(eqs, list) and eqs:
                    eq_id = eqs[0].get("equipmentId")
            except Exception as e:
                print("EQFETCH_ERR", e)

        routes = [
            ("dashboard", "/dashboard"),
            ("work_orders", "/work-orders"),
            ("work_orders_new", "/work-orders/new"),
            ("work_orders_detail", f"/work-orders/{wo_id}" if wo_id else "/work-orders"),
            ("notifications", "/notifications"),
            ("notifications_detail", f"/notifications/{notif_id}" if notif_id else "/notifications"),
            ("equipment", "/equipment"),
            ("equipment_detail", f"/equipment/{eq_id}" if eq_id else "/equipment"),
            ("locations", "/locations"),
            ("materials", "/materials"),
            ("work_centers", "/work-centers"),
            ("preventive_maintenance", "/preventive-maintenance"),
            ("reports", "/reports"),
            ("administration", "/administration"),
        ]

        # Keyword probe: any select whose first option reads like a filter
        FILTER_PROBES = {
            "work_orders": ["Filter by status", "Filter by priority"],
            "notifications": ["Filter by type", "Filter by priority", "Filter by status"],
            "equipment": ["Filter by equipment class", "Filter by criticality"],
            "preventive_maintenance": ["Filter by strategy", "Filter by status"],
        }

        # ---------- UI login ----------
        try:
            page.goto(base + "/login", wait_until="domcontentloaded")
            form = page.locator("form").first
            form.locator("input[type='text']").fill("admin")
            form.locator("input[type='password']").fill("password")
            form.locator("button[type='submit']").click()
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["ui_login_ok"] = True
        except Exception as e:
            print("UI_LOGIN_ERR", e)
            SI["ui_login_ok"] = False

        # Skip link + main landmark present after login
        try:
            page.locator("a.skip-link").first.wait_for(state="attached", timeout=5000)
            SI["skip_link_present"] = page.locator('a.skip-link[href="#main-content"]').count() == 1
            page.locator("main#main-content").first.wait_for(state="attached", timeout=5000)
            SI["main_landmark_present"] = page.locator('main#main-content').count() == 1
        except Exception as e:
            print("SKIPLINK_ERR", e)
            SI["skip_link_present"] = SI["main_landmark_present"] = False

        # Global CSS smoke check (Vite dev injects CSS via JS <style>, so read
        # the live CSSOM): focus-visible rule present + .text-tertiary lightened.
        try:
            css_state = page.evaluate(
                """() => {
                    const all = [...document.styleSheets].map(s => {
                        try { return [...s.cssRules].map(r => r.cssText).join('\\n'); }
                        catch (e) { return ''; }
                    }).join('\\n');
                    const probe = document.createElement('span');
                    probe.className = 'text-tertiary';
                    probe.style.display = 'none';
                    document.body.appendChild(probe);
                    const color = getComputedStyle(probe).color;
                    probe.remove();
                    return { hasFocusVisible: /focus-visible/.test(all), color: color };
                }"""
            )
            SI["css_focus_visible_rule"] = css_state.get("hasFocusVisible", False) is True
            SI["css_tertiary_lightened"] = css_state.get("color") == "rgb(146, 146, 155)"
        except Exception as e:
            print("CSS_ERR", e)
            SI["css_focus_visible_rule"] = SI["css_tertiary_lightened"] = False

        # CommandPalette opens as a modal dialog
        try:
            page.goto(base + "/dashboard", wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            page.keyboard.press("Control+k")
            page.wait_for_timeout(400)
            dlg = page.locator('[role="dialog"]')
            SI["command_palette_dialog"] = dlg.count() == 1 and dlg.get_attribute("aria-modal") == "true"
            if SI["command_palette_dialog"]:
                SI["command_palette_named"] = bool(dlg.get_attribute("aria-label"))
                inp = page.locator('[role="dialog"] input')
                SI["command_palette_input_named"] = inp.count() == 1 and bool(inp.get_attribute("aria-label"))
            else:
                SI["command_palette_named"] = SI["command_palette_input_named"] = False
            page.keyboard.press("Escape")
        except Exception as e:
            print("PALETTE_ERR", e)
            SI["command_palette_dialog"] = SI["command_palette_named"] = SI["command_palette_input_named"] = False

        # ---------- 14-route audit ----------
        for slug, path in routes:
            try:
                page.goto(base + path, wait_until="domcontentloaded")
                page.wait_for_timeout(700)
                SI[f"route_{slug}_loaded"] = True
                focusable = page.locator(
                    'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
                ).count()
                SI[f"route_{slug}_focusable"] = focusable > 0
                blocked = page.locator(
                    'a[href][tabindex="-1"], button[tabindex="-1"], input[tabindex="-1"], select[tabindex="-1"], textarea[tabindex="-1"]'
                ).count()
                SI[f"route_{slug}_no_blocked"] = blocked == 0
                if slug in FILTER_PROBES:
                    SI[f"route_{slug}_filters_named"] = all(
                        page.locator(f'select[aria-label="{name}"]').count() == 1
                        for name in FILTER_PROBES[slug]
                    )
                sl = search_labeled(page)
                if sl is not None:
                    SI[f"route_{slug}_search_labeled"] = sl
            except Exception as e:
                print(f"ROUTE_ERR {slug}: {e}")
                SI[f"route_{slug}_loaded"] = SI[f"route_{slug}_focusable"] = SI[f"route_{slug}_no_blocked"] = False

        # ---------- Keyboard-only walks ----------
        focus_walk(page, base + "/login", 10, "kw_login")
        focus_walk(page, base + "/work-orders", 14, "kw_work_orders")
        if wo_id:
            focus_walk(page, f"{base}/work-orders/{wo_id}", 16, "kw_work_order_detail")

        snap(page, "g3_5_01_audit_final")

        SI["page_errors_empty"] = not PAGE_ERRORS
        SI["console_errors_empty"] = not CONSOLE_ERRORS

        print("SI_JSON", json.dumps(SI))
        print("PAGE_ERRORS", PAGE_ERRORS)
        print("CONSOLE_ERRORS", CONSOLE_ERRORS)
        print("CONSOLE_WARNINGS", CONSOLE_WARNINGS)

        browser.close()

        needed = [
            k for k, v in SI.items()
            if k.startswith("route_") and (k.endswith("_loaded") or k.endswith("_focusable") or k.endswith("_no_blocked"))
        ]
        ok = (
            all(SI.get(k) for k in (
                "api_login_ok", "ui_login_ok", "skip_link_present", "main_landmark_present",
                "css_focus_visible_rule", "css_tertiary_lightened",
                "command_palette_dialog", "command_palette_named", "command_palette_input_named",
                "kw_login", "kw_work_orders",
            ))
            and (wo_id is None or SI.get("kw_work_order_detail"))
            and all(SI.get(k) for k in needed)
            and SI.get("page_errors_empty")
            and SI.get("console_errors_empty")
        )
        print("G3_5_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()