#!/usr/bin/env python3
"""UAT v1.7.0 - browser walkthrough.

Runs against a throwaway stack (Vite on :3000 pointed at an API on :4100 backed
by `cmms_uat`), so no workflow write reaches the live `cmms` database. The one
exception is the `legacy` section, which is read-only by construction: it opens
the live site with an injected token and only reads a notification detail page.

Sections: nav, roles, masterdata, csv, lifecycle, reports, legacy.
Evidence (screenshots + JSON + markdown) is written to --out.
"""
import argparse
import io
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
NAV = [
    "Dashboard",
    "Work Orders",
    "Preventive Maintenance",
    "Notifications",
    "Locations",
    "Equipment",
    "Work Centers",
    "Crafts",
    "Task Lists",
    "Materials",
    "Code Lists",
    "Safety Checklists",
    "Reports",
    "Administration",
]
REPORT_TABS = ["WO Backlog", "PM Compliance", "MTBF", "MTTR", "Cost Summary", "Downtime", "Material Usage"]
ERROR_MARKERS = [
    "Something went wrong",
    "Unexpected Application Error",
    "Failed to load report data",
    "Cannot read properties of",
]

PASSWORD = "Uat@170!Demo"
ROLES = [
    ("uat170-admin", "Administrator", True),
    ("uat170-planner", "Maintenance Planner", False),
    ("uat170-supervisor", "Maintenance Supervisor", False),
    ("uat170-tech", "Technician", False),
    ("uat170-requester", "Requester", False),
    ("uat170-viewonly", "View-Only", False),
]


class Run:
    def __init__(self, out):
        self.out = out
        self.checks = []
        self.console = []
        self.responses = []
        self.section = "init"

    def shot(self, page, label):
        try:
            page.screenshot(path=os.path.join(self.out, f"{self.section}_{label}.png"), full_page=True)
        except Exception as e:
            print(f"  screenshot failed {label}: {e}")

    def check(self, name, ok, detail=""):
        self.checks.append({"section": self.section, "name": name, "ok": bool(ok), "detail": detail})
        print(("PASS  " if ok else "FAIL  ") + f"[{self.section}] {name}" + (f" - {detail}" if detail else ""))
        return ok


def attach_logging(page, run):
    def on_console(m):
        if m.type == "error":
            text = re.sub(r"\s+", " ", m.text.strip())[:400]
            run.console.append({"section": run.section, "text": text})

    def on_pageerror(e):
        run.console.append({"section": run.section, "text": "PAGEERROR " + re.sub(r"\s+", " ", str(e))[:400]})

    def on_response(r):
        if r.status >= 400:
            run.responses.append({"section": run.section, "status": r.status, "url": r.url.split("?")[0]})

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)


def reset_console(run):
    run.console = []
    run.responses = []


def login(page, base, username, password=PASSWORD):
    page.goto(base + "/", wait_until="domcontentloaded")
    page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
    page.goto(base + "/login", wait_until="domcontentloaded")
    page.wait_for_selector("form", timeout=20000)
    page.fill("input[type='text']", username)
    page.fill("input[type='password']", password)
    page.click("button[type='submit']")
    page.wait_for_url("**/dashboard", timeout=25000)
    page.wait_for_timeout(700)


def api_token(page):
    return page.evaluate("() => localStorage.getItem('cmms-api-token')")


def api_get(page, api, path, token):
    r = page.request.get(api + path, headers={"Authorization": f"Bearer {token}"})
    try:
        return r.status, r.json()
    except Exception:
        return r.status, None


def wait_status(page, status, timeout=20000):
    """Wait until a span's exact text is the work-order status."""
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        loc = page.locator("span").filter(has_text=re.compile(rf"^{re.escape(status)}$"))
        if loc.count() > 0 and loc.first.is_visible():
            return True
        page.wait_for_timeout(300)
    return False


def section_nav(run, page, base):
    run.section = "nav"
    reset_console(run)
    login(page, base, "uat170-admin")
    for item in NAV:
        before = len(run.console)
        page.click(f'button[aria-label="{item}"]')
        page.wait_for_timeout(1100)
        body = page.inner_text("body")
        bad = [m for m in ERROR_MARKERS if m in body]
        new_errs = run.console[before:]
        run.shot(page, item.lower().replace(" ", "-"))
        run.check(
            f"nav {item}: renders without error",
            not bad and not new_errs,
            f"url={page.url.split('/')[-1] or 'root'} markers={bad} console={[e['text'][:80] for e in new_errs]}",
        )


def section_roles(run, page, base):
    run.section = "roles"
    for username, role, admin_allowed in ROLES:
        reset_console(run)
        login(page, base, username)
        body = page.inner_text("body")
        nav_buttons = page.locator("nav button[aria-label]").count()
        has_admin = page.locator('button[aria-label="Administration"]').count() > 0
        run.shot(page, role.lower().replace(" ", "-"))
        run.check(
            f"login {role}",
            "CommandPulse" in body and nav_buttons >= 1,
            f"user={username} navItems={nav_buttons} adminVisible={has_admin}",
        )
        run.check(
            f"{role}: Administration visibility matches policy",
            has_admin == admin_allowed,
            f"adminVisible={has_admin} expected={admin_allowed}",
        )
    # Return to an admin session for later sections.
    login(page, base, "uat170-admin")


def section_masterdata(run, page, base, api, ts):
    run.section = "masterdata"
    reset_console(run)
    login(page, base, "uat170-admin")
    token = api_token(page)

    # Work center
    wc_code = f"UAT170-WC-{ts}"
    page.goto(base + "/work-centers", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    page.click('button[aria-label="Add work center"]')
    form = page.locator('form[aria-label="New work center"]')
    form.get_by_label("Code").fill(wc_code)
    form.get_by_label("Name").fill(f"UAT 1.7.0 Work Center {ts}")
    form.get_by_label("Daily capacity hours").fill("8")
    form.get_by_label("Cost rate per hour").fill("45.5")
    form.get_by_role("button", name="Save").click()
    page.wait_for_timeout(1800)
    run.shot(page, "work-center-created")
    alert = page.locator('[role="alert"]').count()
    run.check(
        "create work center: form accepted",
        page.locator('form[aria-label="New work center"]').count() == 0 and alert == 0,
        wc_code,
    )

    # Material
    mat_code = f"UAT170-MAT-{ts}"
    page.goto(base + "/materials", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Add Material").click()
    form = page.locator('form[aria-label="New material"]')
    form.get_by_label("Material code").fill(mat_code)
    form.get_by_label("Description").fill(f"UAT 1.7.0 Material {ts}")
    form.get_by_label("Unit of measure").fill("EA")
    form.get_by_label("Standard cost").fill("12.34")
    form.get_by_label("Current stock").fill("100")
    form.get_by_role("button", name="Save").click()
    page.wait_for_timeout(1800)
    run.shot(page, "material-created")
    body = page.inner_text("body")
    run.check(
        "create material: form accepted",
        page.locator('form[aria-label="New material"]').count() == 0 and "Material created" in body,
        mat_code,
    )

    # Equipment
    eq_code = f"UAT170-EQ-{ts}"
    page.goto(base + "/equipment", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Add Equipment").click()
    page.get_by_label("Equipment code").fill(eq_code)
    page.get_by_label("Equipment name").fill(f"UAT 1.7.0 Pump {ts}")
    page.get_by_label("Equipment description").fill("UAT created equipment")
    loc = page.get_by_label("Equipment functional location")
    page.wait_for_function(
        """() => {
            const s = document.querySelector('select[aria-label="Equipment functional location"]');
            return s && s.options.length > 1;
        }""",
        timeout=20000,
    )
    # Equipment must sit on a lowest-level location: pick a location that is not
    # any other location's parent, rather than the first option in the list.
    st_loc, locations = api_get(page, api, "/api/functional-locations?take=2000", token)
    loc_rows = locations.get("data", []) if isinstance(locations, dict) else (locations or [])
    parents = {r.get("parentLocationId") for r in loc_rows if r.get("parentLocationId")}
    leaves = [r["functionalLocationId"] for r in loc_rows if r["functionalLocationId"] not in parents]
    run.check(
        "a lowest-level functional location exists",
        st_loc == 200 and len(leaves) > 0,
        f"status={st_loc} locations={len(loc_rows)} leaves={len(leaves)}",
    )
    loc.select_option(leaves[0])
    page.get_by_role("button", name="Create Equipment").click()
    page.wait_for_timeout(1800)
    run.shot(page, "equipment-created")
    alert = page.locator('[role="alert"]').count()
    run.check(
        "create equipment: form accepted",
        page.get_by_role("button", name="Create Equipment").count() == 0 and alert == 0,
        eq_code,
    )

    # API cross-check that all three persisted. Work centres return a bare array;
    # materials and equipment are paginated, so query by the new code instead of
    # paging past thousands of existing rows.
    st1, wcs = api_get(page, api, "/api/work-centers", token)
    st2, mats = api_get(page, api, f"/api/materials?search={mat_code}", token)
    st3, eqs = api_get(page, api, f"/api/equipment?search={eq_code}", token)

    def has(payload, code, key):
        rows = payload.get("data", []) if isinstance(payload, dict) else (payload or [])
        return any(r.get(key) == code for r in rows)

    run.check(
        "master data persisted (API)",
        has(wcs, wc_code, "code") and has(mats, mat_code, "materialCode") and has(eqs, eq_code, "equipmentCode"),
        f"wc={st1} mat={st2} eq={st3}",
    )
    return wc_code, mat_code, eq_code


def section_csv(run, page, base, ts):
    run.section = "csv"
    reset_console(run)
    login(page, base, "uat170-admin")

    # Export materials
    page.goto(base + "/materials", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export").click()
    path = os.path.join(run.out, "csv_materials_export.csv")
    dl.value.save_as(path)
    text = io.open(path, encoding="utf-8-sig").read().strip().splitlines()
    run.check("materials CSV export", len(text) >= 2, f"rows={len(text) - 1} header={text[0][:80]}")

    # Build a new material row using the exported header, then import it.
    header = text[0]
    new_code = f"UAT170-CSV-{ts}"
    values = {
        "materialCode": new_code,
        "description": f"UAT 1.7.0 CSV material {ts}",
        "unitOfMeasure": "EA",
        "standardCost": "7.77",
        "currentStock": "25",
        "isActive": "true",
    }
    cols = header.split(",")
    row = ",".join(values.get(c, "") for c in cols)
    import_path = os.path.join(run.out, "csv_materials_import.csv")
    io.open(import_path, "w", encoding="utf-8", newline="").write(header + "\r\n" + row + "\r\n")
    page.set_input_files('input[aria-label="Import materials CSV"]', import_path)
    page.wait_for_selector('[role="status"]', timeout=30000)
    page.wait_for_timeout(500)
    run.shot(page, "materials-import")
    status = page.locator('[role="status"]').first.inner_text() if page.locator('[role="status"]').count() else ""
    run.check("materials CSV import", "Imported" in status, status)

    # Locations export + re-import of its own file (idempotent update).
    page.goto(base + "/locations", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    with page.expect_download() as dl2:
        page.get_by_role("button", name="Export").click()
    loc_path = os.path.join(run.out, "csv_locations_export.csv")
    dl2.value.save_as(loc_path)
    loc_lines = io.open(loc_path, encoding="utf-8-sig").read().strip().splitlines()
    run.check("locations CSV export", len(loc_lines) >= 2, f"rows={len(loc_lines) - 1}")
    page.set_input_files('input[aria-label="Import functional locations CSV"]', loc_path)
    # A full 463-row import takes several seconds server-side; wait for the
    # toolbar to publish its result instead of guessing a duration.
    page.wait_for_selector('[role="status"]', timeout=60000)
    page.wait_for_timeout(500)
    run.shot(page, "locations-import")
    status2 = page.locator('[role="status"]').first.inner_text() if page.locator('[role="status"]').count() else ""
    run.check("locations CSV import", "Imported" in status2, status2)


def section_lifecycle(run, page, base, api, ts, eq_code):
    run.section = "lifecycle"
    reset_console(run)
    login(page, base, "uat170-admin")
    token = api_token(page)

    _, before = api_get(page, api, "/api/notifications?type=M3&take=100", token)
    m3_before = before.get("total") if isinstance(before, dict) else len(before or [])

    # 1. Raise a notification through the form.
    description = f"UAT 1.7.0 lifecycle {ts}"
    page.goto(base + "/notifications", wait_until="domcontentloaded")
    page.wait_for_timeout(700)
    page.get_by_role("button", name="New Notification").click()
    page.wait_for_selector("#ntf-eq", timeout=20000)
    # The equipment picker is fed by the app store, which pages through all
    # 6k+ assets on sign-in. Wait for it, and fall back to a functional
    # location if the store is still filling.
    try:
        page.wait_for_function(
            "() => { const s = document.querySelector('#ntf-eq'); return s && s.options.length > 1; }",
            timeout=90000,
        )
    except Exception:
        pass
    page.select_option("#ntf-type", "M2")
    page.select_option("#ntf-priority", "High")
    eq = page.locator("#ntf-eq option").evaluate_all("opts => opts.map(o => o.value).filter(Boolean)")
    if eq:
        page.select_option("#ntf-eq", eq[0])
    else:
        loc_values = page.locator("#ntf-loc option").evaluate_all("opts => opts.map(o => o.value).filter(Boolean)")
        run.check("notification form has a location or equipment to pick", len(loc_values) > 0, f"locations={len(loc_values)}")
        page.select_option("#ntf-loc", loc_values[0])
    page.fill("#ntf-desc", description)
    page.fill("#ntf-damages", "UAT observation")
    page.get_by_role("button", name="Raise notification").click()
    page.wait_for_timeout(1600)
    run.shot(page, "notification-raised")
    body = page.inner_text("body")
    m = re.search(r"N-\d{6}", body)
    number = m.group(0) if m else ""
    run.check("notification raised via UI", bool(number) and description[:20] in body, number)

    # 2. Open it from the API-resolved id and convert.
    _, found = api_get(page, api, f"/api/notifications?search={description.replace(' ', '%20')}&take=5", token)
    rows = found.get("data", []) if isinstance(found, dict) else []
    if not rows:
        run.check("notification found by API search", False, "no row")
        return
    notif = rows[0]
    nid = notif["notificationId"]
    page.goto(f"{base}/notifications/{nid}", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    run.shot(page, "notification-detail")
    run.check("notification detail shows M2", "Maintenance Request" in page.inner_text("body"), number)
    page.get_by_role("button", name="Convert to WO").first.click()
    page.wait_for_url("**/work-orders/**", timeout=25000)
    page.wait_for_timeout(1200)
    wo_url = page.url
    wo_id = wo_url.rstrip("/").split("/")[-1]
    run.shot(page, "wo-converted")
    run.check("converted to work order", wait_status(page, "Draft", 8000), wo_url)

    # 3. Assign a supervisor through Edit details.
    page.get_by_role("button", name="Edit details").click()
    page.get_by_label("Supervisor").select_option(label="UAT 1.7.0 Supervisor")
    page.get_by_role("button", name="Save").click()
    page.wait_for_timeout(1300)
    run.shot(page, "wo-assigned")
    run.check("work order assigned to supervisor", "UAT 1.7.0 Supervisor" in page.inner_text("body"), "")

    # 4. Add one operation (completion requires it).
    page.get_by_role("button", name="Add Operation").click()
    page.get_by_label("Operation description").fill("UAT 1.7.0 operation")
    craft = page.get_by_label("Craft", exact=True)
    craft_values = craft.locator("option").evaluate_all("opts => opts.map(o => o.value).filter(Boolean)")
    craft.select_option(craft_values[0])
    page.get_by_label("Planned hours", exact=True).fill("2")
    page.get_by_label("Number of technicians", exact=True).fill("1")
    page.locator('form:has-text("New Operation")').get_by_role("button", name="Add").click()
    page.wait_for_timeout(1300)
    run.shot(page, "wo-operation")
    run.check("operation added", "UAT 1.7.0 operation" in page.inner_text("body"), "")

    # 5. Walk the workflow, asserting the visible status at each step.
    steps = []
    page.get_by_role("button", name="Plan", exact=True).click()
    steps.append(("Plan", "Planned", wait_status(page, "Planned", 12000)))
    page.get_by_role("button", name="Schedule", exact=True).click()
    dialog = page.locator('[aria-label^="Schedule WO-"]')
    start = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
    finish = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
    dialog.get_by_label("Planned start").fill(start)
    dialog.get_by_label("Planned finish").fill(finish)
    dialog.get_by_role("button", name="Schedule", exact=True).click()
    steps.append(("Schedule", "Scheduled", wait_status(page, "Scheduled", 12000)))
    page.get_by_role("button", name="Start", exact=True).click()
    steps.append(("Start", "In Progress", wait_status(page, "In Progress", 12000)))
    run.shot(page, "wo-in-progress")
    page.get_by_role("button", name="Complete", exact=True).click()
    steps.append(("Complete", "Completed", wait_status(page, "Completed", 12000)))
    run.shot(page, "wo-completed")
    page.get_by_role("button", name="Close", exact=True).click()
    steps.append(("Close", "Closed", wait_status(page, "Closed", 12000)))
    run.shot(page, "wo-closed")
    for action, expected, ok in steps:
        run.check(f"workflow {action} -> {expected}", ok, "")

    # 6. Notification should now be Completed, and no M3 should have appeared.
    _, after = api_get(page, api, "/api/notifications?type=M3&take=100", token)
    m3_after = after.get("total") if isinstance(after, dict) else len(after or [])
    _, notif_now = api_get(page, api, f"/api/notifications/{nid}", token)
    run.check(
        "D-22: completing the WO generated no M3",
        m3_after == m3_before,
        f"m3 before={m3_before} after={m3_after}",
    )
    run.check(
        "converted notification reached Completed",
        isinstance(notif_now, dict) and notif_now.get("status") == "Completed",
        f"status={notif_now.get('status') if isinstance(notif_now, dict) else 'n/a'}",
    )

    # 7. Close the loop in the database: the completed WO has cost, labour? (report math food)
    _, wo = api_get(page, api, f"/api/work-orders/{wo_id}", token)
    run.check(
        "closed WO carries actual timestamps",
        isinstance(wo, dict) and bool(wo.get("actualStart")) and bool(wo.get("actualFinish")),
        f"actualStart={bool(wo.get('actualStart')) if isinstance(wo, dict) else 'n/a'} actualFinish={bool(wo.get('actualFinish')) if isinstance(wo, dict) else 'n/a'}",
    )


def section_reports(run, page, base):
    run.section = "reports"
    reset_console(run)
    login(page, base, "uat170-admin")
    page.goto(base + "/reports", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    for tab in REPORT_TABS:
        before = len(run.console)
        page.get_by_role("button", name=tab, exact=True).click()
        page.wait_for_timeout(1600)
        body = page.inner_text("body")
        bad = [m for m in ERROR_MARKERS if m in body]
        new_errs = run.console[before:]
        run.shot(page, tab.lower().replace(" ", "-"))
        run.check(
            f"report tab {tab} renders",
            not bad and not new_errs,
            f"markers={bad} console={[e['text'][:70] for e in new_errs]}",
        )


def section_legacy(run, page, live_base, token, user_json):
    run.section = "legacy"
    reset_console(run)
    page.goto(live_base + "/", wait_until="domcontentloaded")
    page.evaluate(
        """([token, user]) => {
            localStorage.setItem('cmms-api-token', token);
            localStorage.setItem('cmms-auth', JSON.stringify({ state: { user: JSON.parse(user), isAuthenticated: true }, version: 0 }));
        }""",
        [token, user_json],
    )
    # Read the live M3 set through the page's own session (same-origin /api).
    rows = page.evaluate(
        """async (token) => {
            const r = await fetch('/api/notifications?type=M3&take=50', { headers: { Authorization: 'Bearer ' + token } });
            const j = await r.json();
            return (j.data || []).map(n => ({ id: n.notificationId, number: n.notificationNumber, status: n.status }));
        }""",
        token,
    )
    open_rows = page.evaluate(
        """async (token) => {
            const r = await fetch('/api/notifications?type=M3&status=Open&take=50', { headers: { Authorization: 'Bearer ' + token } });
            const j = await r.json();
            return (j.data || []).length;
        }""",
        token,
    )
    cleaned = ["N-000478", "N-000487", "N-000488", "N-000490", "N-000493", "N-000495", "N-000497", "N-000499"]
    numbers = {r["number"] for r in rows}
    run.check(
        "live M3 list holds only the three Converted rows",
        len(rows) == 3 and all(r["status"] == "Converted" for r in rows),
        f"rows={sorted(numbers)}",
    )
    run.check(
        "live M3 list hides all eight soft-deleted Open rows",
        not (numbers & set(cleaned)),
        f"visible={sorted(numbers)}",
    )
    run.check("live API returns zero Open M3", open_rows == 0, f"open={open_rows}")

    page.goto(live_base + "/notifications?type=M3", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    run.shot(page, "live-m3-list")

    target = next((r for r in rows if r["status"] == "Converted"), None)
    if not target:
        run.check("a legacy M3 is visible", False, f"rows={rows}")
        return
    page.goto(f"{live_base}/notifications/{target['id']}", wait_until="domcontentloaded")
    page.wait_for_timeout(2200)
    run.shot(page, "live-m3-detail")
    body = page.inner_text("body")
    run.check("legacy M3 shows the Legacy record badge", "Legacy record" in body, target["number"])
    run.check("legacy M3 hides Convert to WO", page.get_by_role("button", name="Convert to WO").count() == 0, "")
    run.check("legacy M3 hides Delete", page.get_by_role("button", name="Delete", exact=True).count() == 0, "")
    run.check(
        "legacy M3 shows the read-only note",
        "cannot be edited, deleted, or converted" in body,
        "",
    )
    return target["number"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--api", default="http://localhost:4100")
    ap.add_argument("--out", default=os.path.join(ROOT, "screenshots", "uat170"))
    ap.add_argument("--sections", default="nav,roles,masterdata,csv,lifecycle,reports")
    ap.add_argument("--live-base", default="")
    ap.add_argument("--live-token-file", default="")
    ap.add_argument("--live-user-json", default="")
    ap.add_argument("--headful", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sections = [s.strip() for s in args.sections.split(",") if s.strip()]
    ts = datetime.now().strftime("%H%M%S")

    run = Run(args.out)
    eq_code = f"UAT170-EQ-{ts}"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headful)
        ctx = browser.new_context(
            viewport={"width": 1680, "height": 1000},
            accept_downloads=True,
            ignore_https_errors=True,
        )
        page = ctx.new_page()
        page.set_default_timeout(25000)
        attach_logging(page, run)

        if "nav" in sections:
            section_nav(run, page, args.base)
        if "roles" in sections:
            section_roles(run, page, args.base)
        if "masterdata" in sections:
            _, _, eq_code = section_masterdata(run, page, args.base, args.api, ts)
        if "csv" in sections:
            section_csv(run, page, args.base, ts)
        if "lifecycle" in sections:
            section_lifecycle(run, page, args.base, args.api, ts, eq_code)
        if "reports" in sections:
            section_reports(run, page, args.base)
        if "legacy" in sections:
            token = io.open(args.live_token_file, encoding="utf-8").read().strip() if args.live_token_file else ""
            user_json = args.live_user_json
            if user_json and os.path.isfile(user_json):
                user_json = io.open(user_json, encoding="utf-8").read()
            section_legacy(run, page, args.live_base or "https://cmms.local", token, user_json or "{}")

        browser.close()

    passed = sum(1 for c in run.checks if c["ok"])
    failed = len(run.checks) - passed
    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "base": args.base,
        "sections": sections,
        "checks": run.checks,
        "console_errors": run.console,
        "failed_responses": run.responses,
        "passed": passed,
        "failed": failed,
    }
    with io.open(os.path.join(args.out, "uat_ui_results.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)

    lines = ["# UAT v1.7.0 - browser walkthrough", "", f"Generated: {summary['generated']}", f"Target: {args.base}", ""]
    lines.append(f"Result: **{passed} passed, {failed} failed**")
    lines.append("")
    lines.append("| Section | Check | Result | Detail |")
    lines.append("|---|---|---|---|")
    for c in run.checks:
        lines.append(f"| {c['section']} | {c['name']} | {'PASS' if c['ok'] else 'FAIL'} | {str(c['detail']).replace('|', '/')} |")
    lines.append("")
    lines.append(f"Console errors captured: {len(run.console)}; failed HTTP responses: {len(run.responses)}")
    with io.open(os.path.join(args.out, "UAT_UI_REPORT.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n{passed} passed, {failed} failed. Evidence: {args.out}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
