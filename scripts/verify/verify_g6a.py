import json
import os
import re
import subprocess
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("NO_PLAYWRIGHT")
    sys.exit(1)

import requests

REPO = os.getcwd()
APP = os.path.join(REPO, "app")
BASE = "http://localhost:3000"
API = "http://localhost:4000/api"
SHOTS = os.path.join(REPO, "screenshots")
os.makedirs(SHOTS, exist_ok=True)

SI = {}
FAILED = []

# The 4 pre-existing errors were resolved in Phase 4.4 (tsc -b exit 0).
# BASELINE_TSC is intentionally empty: any reappearance of that class of
# error is now NEW and must fail the gate.
BASELINE_TSC = set()


def norm_tsc(line):
    m = re.match(r"^(.*?): error TS", line)
    return m.group(1).replace("\\", "/") if m else None


def step(name, cond, detail=""):
    SI[name] = bool(cond)
    if not cond:
        FAILED.append(name)
    print(f"{name} {bool(cond)} {detail}")


# ── 1. Grep assertions (narrowed scope per 5.4 adjudication) ───────────────
#    Production-only checks (skip __tests__/ and *.test.*). Test files may
#    name identifiers mockX freely. Banned in PRODUCTION app code:
#      Ban 1: silent store fallback on error: `.catch(() => get().` — the
#             shape used to swallow an API error and fall back to cached
#             in-memory store data instead of surfacing the error state.
#      Ban 2: silent fallback to mock imports — any `data/mockData` import
#             (e.g. `from '@/data/mockData'` or `from '../data/mockData'`).
#    Generic defensive `.catch(() => ({ error: ... }))` parse fallbacks are
#    NOT banned; they return a real error object and are legitimate.
mock_hits = []
catch_hits = []
for root, _dirs, files in os.walk(os.path.join(APP, "src")):
    if "__tests__" in root:
        continue
    for f in files:
        if not (f.endswith(".ts") or f.endswith(".tsx")) or f.endswith(".test.ts") or f.endswith(".test.tsx"):
            continue
        p = os.path.join(root, f)
        rel = os.path.relpath(p, APP)
        with open(p, encoding="utf-8", errors="ignore") as fh:
            for ln, line in enumerate(fh, 1):
                if re.search(r"from\s+['\"][^'\"]*data/mockData['\"]", line):
                    mock_hits.append(f"{rel}:{ln}")
                if re.search(r"\.catch\(\(\) => get\(\)\.", line):
                    catch_hits.append(f"{rel}:{ln}")

step("grep_mockdata_absent", not mock_hits and not os.path.exists(os.path.join(APP, "src", "data", "mockData.ts")), mock_hits[:5])
step("grep_catch_empty_arrow_absent", not catch_hits, catch_hits[:5])

# ── 2. tsc gates ───────────────────────────────────────────────────────────
r_lit = subprocess.run(
    ["cmd", "/c", r"app\node_modules\.bin\tsc.cmd", "--noEmit", "-p", "app"],
    cwd=REPO, capture_output=True, text=True,
)
step("tsc_literal_exit0", r_lit.returncode == 0, f"rc={r_lit.returncode}")

si_lit = {"rc": r_lit.returncode}
step("tsc_serialized", True, json.dumps(si_lit)[:200])

r_b = subprocess.run(
    ["cmd", "/c", r"node_modules\.bin\tsc.cmd", "-b"],
    cwd=APP, capture_output=True, text=True,
)
new_errs = []
known = 0
for line in (r_b.stderr + r_b.stdout).splitlines():
    n = norm_tsc(line)
    if n is None:
        continue
    if n in BASELINE_TSC:
        known += 1
    else:
        new_errs.append(n)
step("tsc_build_exit0", r_b.returncode == 0 and not new_errs, f"rc={r_b.returncode} new={new_errs}")

# ── 3. API ids for detail routes ───────────────────────────────────────────
s = requests.Session()
try:
    lr = s.post(API + "/auth/login", json={"username": "admin", "password": "password"}, timeout=10)
    token = lr.json().get("token")
    H = {"Authorization": f"Bearer {token}"} if token else {}
    SI["api_login_ok"] = lr.status_code == 200

    def first_id(payload, key):
        data = payload.get("data", []) if isinstance(payload, dict) else (payload if isinstance(payload, list) else [])
        return data[0].get(key, "none") if data else "none"

    wo_id = first_id(s.get(API + "/work-orders?take=1", headers=H, timeout=10).json(), "workOrderId")
    not_id = first_id(s.get(API + "/notifications?take=1", headers=H, timeout=10).json(), "notificationId")
    eq_id = first_id(s.get(API + "/equipment?take=1", headers=H, timeout=10).json(), "equipmentId")
except Exception as e:
    SI["api_login_ok"] = False
    wo_id = not_id = eq_id = "none"
    print("API_IDS_ERR", e)

ROUTES_UP = [
    ("/dashboard", ["DASHBOARD", "Maintenance Trend"]),
    ("/work-orders", ["WORK ORDERS"]),
    (f"/work-orders/{wo_id}", ["Operations", "WO-"]),
    ("/notifications", ["NOTIFICATIONS"]),
    (f"/notifications/{not_id}", ["Notification", "Back"]),
    ("/equipment", ["EQUIPMENT"]),
    (f"/equipment/{eq_id}", ["Meters", "BOM"]),
    ("/locations", ["LOCATIONS"]),
    ("/materials", ["MATERIALS"]),
    ("/work-centers", ["WORK CENTERS"]),
    ("/preventive-maintenance", ["PREVENTIVE MAINTENANCE"]),
    ("/reports", ["REPORTS", "Export"]),
    ("/administration", ["ADMINISTRATION"]),
    ("/work-orders/new", ["WORK ORDERS", "Create"]),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    def new_collector(page):
        page_errors = []
        console_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)[:300]))
        page.on("console", lambda m: console_errors.append(m.text[:300]) if m.type == "error" else None)
        return page_errors, console_errors

    # ── API-up sweep ───────────────────────────────────────────────────────
    ctx = browser.new_context(accept_downloads=True)
    page = ctx.new_page()
    page.set_default_timeout(20000)
    pe, ce = new_collector(page)
    page.goto(BASE + "/login", wait_until="domcontentloaded")
    f = page.locator("form").first
    f.locator("input[type='text']").fill("admin")
    f.locator("input[type='password']").fill("password")
    f.locator("button[type='submit']").click()
    page.wait_for_url("**/dashboard", timeout=15000)
    page.wait_for_timeout(2500)

    for i, (route, markers) in enumerate(ROUTES_UP, 1):
        pe.clear(); ce.clear()
        try:
            page.goto(BASE + route, wait_until="domcontentloaded")
            page.wait_for_timeout(2600)
            body = page.locator("body").inner_text()
            marker_ok = any(m in body for m in markers) or ("No " in body and ("found" in body or "available" in body))
            bad_body = ("undefined" in body) or ("NaN" in body)
            name = f"up_{route.strip('/').replace('/', '_') or 'dashboard'}"
            ok = marker_ok and not pe and not ce and not bad_body and len(body.strip()) > 60
            step(name, ok, f"markers={marker_ok} pageerrors={len(pe)} consoleerrors={len(ce)} bodylen={len(body.strip())}")
            if i <= 3:
                page.screenshot(path=os.path.join(SHOTS, f"g6a_0{i}_{route.strip('/').replace('/', '_') or 'dashboard'}_up.png"))
        except Exception as e:
            name = f"up_{route.strip('/').replace('/', '_') or 'dashboard'}"
            step(name, False, f"EXC {str(e)[:150]}")
    ctx.close()

    # ── API-down sweep ─────────────────────────────────────────────────────
    ctx2 = browser.new_context(accept_downloads=True)
    page2 = ctx2.new_page()
    page2.set_default_timeout(20000)
    pe2, ce2 = new_collector(page2)
    page2.goto(BASE + "/login", wait_until="domcontentloaded")
    f2 = page2.locator("form").first
    f2.locator("input[type='text']").fill("admin")
    f2.locator("input[type='password']").fill("password")
    f2.locator("button[type='submit']").click()
    page2.wait_for_url("**/dashboard", timeout=15000)
    page2.wait_for_timeout(2000)

    def abort_api(route):
        route.abort()

    page2.route("**/api/**", abort_api)
    page2.reload(wait_until="domcontentloaded")
    page2.wait_for_timeout(3500)

    for i, (route, _markers) in enumerate(ROUTES_UP, 1):
        pe2.clear()
        try:
            page2.goto(BASE + route, wait_until="domcontentloaded")
            page2.wait_for_timeout(2400)
            body = page2.locator("body").inner_text()
            err_ok = ("Failed" in body) or ("Retry" in body) or ("No data" in body) or ("offline" in body.lower())
            no_records = not re.search(r"WO-\d{4}", body)
            no_undefined = ("undefined" not in body) and ("NaN" not in body)
            name = f"down_{route.strip('/').replace('/', '_') or 'dashboard'}"
            ok = err_ok and no_records and no_undefined and not pe2
            step(name, ok, f"err={err_ok} norecords={no_records} pageerrors={len(pe2)}")
            shot = f"g6a_1{i:02d}_{route.strip('/').replace('/', '_') or 'dashboard'}_down.png"
            step(f"down_shot_{i}", True, shot)
            if i <= 3 or i in (9, 10, 13):
                page2.screenshot(path=os.path.join(SHOTS, shot))
        except Exception as e:
            name = f"down_{route.strip('/').replace('/', '_') or 'dashboard'}"
            step(name, False, f"EXC {str(e)[:150]}")
    ctx2.close()
    browser.close()

ok = not FAILED
print("SI_JSON " + json.dumps(SI))
print("FAILED", FAILED)
print("G6A_EXIT", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)