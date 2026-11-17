#!/usr/bin/env python3
"""S0-S6 acceptance pass against a throwaway stack.

Target: the built ``app/dist`` served on :3000 through a static+proxy harness
that forwards ``/api`` to the API on :4100, and that API runs against
``cmms_uat`` - a clone restored from a fresh ``pg_dump`` of ``cmms``. No write
this script makes can reach the live database; the live copy is only read, by a
separate psql query outside this script, to prove it did not move.

Sections:
  s0  preflight: health, identity, served bundle, console cleanliness
  s1  master data: functional location -> equipment -> work centre, linked
  s2  lifecycle: M1 notification -> work order -> operation -> scheduled ->
      executed -> closed
  s3  guards: no operations refused (409), scheduling without dates refused
      (400), M3 completion confirmation not convertible (400)
  s4  reports: no UUID on any axis, arithmetic recomputed independently, the
      Excel export carries the equipment code
  s5  RBAC: a Requester is blocked from Administration and from /api/users and
      /api/audit-log

Usage:
  python scripts/verify/uat/run_uat.py --base http://localhost:3000 \
      --api http://localhost:4100 --out docs/screenshots/uat_v1.7.1

Exit: 0 PASS, 1 FAIL.
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

import expected

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
PASSWORD = "UatPass!2026"
ADMIN = "admin"

ERROR_MARKERS = [
    "Something went wrong",
    "Unexpected Application Error",
    "Failed to load report data",
    "Cannot read properties of",
]

UUID_IN_TEXT = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


class Run:
    def __init__(self, out):
        self.out = out
        self.checks = []
        self.console = []
        self.responses = []
        self.section = "init"
        self.facts = {}

    def shot(self, page, label):
        path = os.path.join(self.out, f"{self.section}_{label}.png")
        try:
            page.screenshot(path=path, full_page=True)
        except Exception as exc:  # pragma: no cover - evidence only
            print(f"  screenshot failed {label}: {exc}")

    def check(self, name, ok, detail=""):
        self.checks.append(
            {"section": self.section, "name": name, "ok": bool(ok), "detail": str(detail)}
        )
        print(("PASS  " if ok else "FAIL  ") + f"[{self.section}] {name}" + (f" - {detail}" if detail else ""))
        return ok


def attach_logging(page, run):
    def on_console(message):
        if message.type == "error":
            text = re.sub(r"\s+", " ", message.text.strip())[:400]
            run.console.append({"section": run.section, "text": text})

    def on_pageerror(error):
        run.console.append({"section": run.section, "text": "PAGEERROR " + re.sub(r"\s+", " ", str(error))[:400]})

    def on_response(response):
        if response.status >= 400:
            run.responses.append(
                {"section": run.section, "status": response.status, "url": response.url.split("?")[0]}
            )

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
    page.wait_for_url("**/dashboard", timeout=30000)
    page.wait_for_timeout(700)


def api_token(page):
    return page.evaluate("() => localStorage.getItem('cmms-api-token')")


def api(page, method, path, token, payload=None, absolute=None):
    headers = {"Authorization": f"Bearer {token}"}
    kwargs = {"headers": headers}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        kwargs["data"] = json.dumps(payload)
    response = page.request.fetch(absolute or (api_base + path), method=method, **kwargs)
    try:
        body = response.json()
    except Exception:
        body = response.body()
    return response.status, body


def api_get(page, path, token):
    return api(page, "GET", path, token)


def api_post(page, path, token, payload):
    return api(page, "POST", path, token, payload)


def api_put(page, path, token, payload):
    return api(page, "PUT", path, token, payload)


def paginate(page, path, token, take=500):
    """Walk a paginated collection until the API returns a short page."""
    rows = []
    skip = 0
    while True:
        joiner = "&" if "?" in path else "?"
        status, body = api_get(page, f"{path}{joiner}take={take}&skip={skip}", token)
        if status != 200 or not isinstance(body, dict):
            return status, rows
        page_rows = body.get("data") or []
        rows.extend(page_rows)
        skip += take
        total = body.get("total")
        if len(page_rows) < take or (isinstance(total, int) and len(rows) >= total):
            return 200, rows


def wait_status(page, status, timeout=20000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        locator = page.locator("span").filter(has_text=re.compile(rf"^{re.escape(status)}$"))
        if locator.count() > 0 and locator.first.is_visible():
            return True
        page.wait_for_timeout(300)
    return False


def body_has_error(page):
    body = page.inner_text("body")
    return [marker for marker in ERROR_MARKERS if marker in body]


def uuid_hits(text):
    return sorted(set(UUID_IN_TEXT.findall(text)))


# ───────────────────────────────────────────────────────────────────────
# S0 - preflight
# ───────────────────────────────────────────────────────────────────────
def section_s0(run, page, base, token, expect_asset):
    run.section = "s0"
    reset_console(run)

    status, health = api_get(page, "/api/health", token)
    run.check("S0 API health is 200 and ok", status == 200 and isinstance(health, dict) and health.get("status") == "ok", f"status={status} body={health}")

    status, me = api_get(page, "/api/auth/me", token)
    run.check(
        "S0 the API session is the Administrator",
        status == 200 and isinstance(me, dict) and me.get("role") == "Administrator",
        f"status={status} user={me.get('username') if isinstance(me, dict) else me} role={me.get('role') if isinstance(me, dict) else ''}",
    )

    page.goto(base + "/dashboard", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    title = page.title()
    run.check("S0 the app loads the dashboard", "CommandPulse" in title, f"title={title}")
    run.check("S0 the dashboard renders without an error marker", not body_has_error(page), f"markers={body_has_error(page)}")

    status, html = api(page, "GET", "/", token, absolute=base + "/")
    script = ""
    if isinstance(html, bytes):
        html = html.decode("utf-8", "replace")
    match = re.search(r'src="(/assets/index-[^"]+\.js)"', html or "")
    if match:
        script = match.group(1)
    if expect_asset:
        run.check(
            "S0 the served bundle is the build under test",
            script.endswith(expect_asset),
            f"served={script} expected={expect_asset}",
        )
    else:
        run.check("S0 the served bundle is a built asset", bool(script), f"served={script}")

    page.goto(base + "/dashboard", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    run.shot(page, "dashboard")
    run.check("S0 no console error on load", not run.console, f"console={[c['text'][:90] for c in run.console]}")


# ───────────────────────────────────────────────────────────────────────
# S1 - master data
# ───────────────────────────────────────────────────────────────────────
def section_s1(run, page, base, token, ts):
    run.section = "s1"
    reset_console(run)
    login(page, base, ADMIN)
    token = api_token(page)

    loc_code = f"UAT171-LOC-{ts}"
    page.goto(base + "/locations", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    page.get_by_role("button", name="New Location").click()
    page.wait_for_selector("#fl-code", timeout=20000)
    page.fill("#fl-code", loc_code)
    page.fill("#fl-desc", f"UAT 1.7.1 unit {ts}")
    page.select_option("#fl-type", "Unit")
    page.select_option("#fl-status", "Active")
    page.get_by_role("button", name="Create Location").click()
    page.wait_for_timeout(1800)
    run.shot(page, "location-created")
    body = page.inner_text("body")
    run.check(
        "S1 functional location created through the form",
        loc_code in body and page.locator("#fl-code").count() == 0 and not page.locator('[role="alert"]').count(),
        loc_code,
    )

    status, found = api_get(page, f"/api/functional-locations?search={loc_code}", token)
    rows = found.get("data", []) if isinstance(found, dict) else (found or [])
    location = next((r for r in rows if r.get("locationCode") == loc_code), None)
    run.check("S1 the location persisted", status == 200 and location is not None, f"status={status} rows={len(rows)}")
    if location is None:
        return None
    loc_id = location["functionalLocationId"]

    eq_code = f"UAT171-EQ-{ts}"
    page.goto(base + "/equipment", wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    page.get_by_role("button", name="Add Equipment").click()
    page.wait_for_selector('input[aria-label="Equipment code"]', timeout=20000)
    page.get_by_label("Equipment code").fill(eq_code)
    page.get_by_label("Equipment name").fill(f"UAT 1.7.1 pump {ts}")
    page.get_by_label("Equipment description").fill("Created by the S1 master-data walk")
    page.get_by_label("Equipment criticality").select_option("B")
    page.wait_for_function(
        """() => {
            const s = document.querySelector('select[aria-label="Equipment functional location"]');
            return s && s.options.length > 1;
        }""",
        timeout=30000,
    )
    page.get_by_label("Equipment functional location").select_option(loc_id)
    page.get_by_role("button", name="Create Equipment").click()
    page.wait_for_timeout(1800)
    run.shot(page, "equipment-created")
    run.check(
        "S1 equipment created through the form",
        page.get_by_role("button", name="Create Equipment").count() == 0 and not page.locator('[role="alert"]').count(),
        eq_code,
    )

    status, found = api_get(page, f"/api/equipment?search={eq_code}", token)
    rows = found.get("data", []) if isinstance(found, dict) else (found or [])
    equipment = next((r for r in rows if r.get("equipmentCode") == eq_code), None)
    run.check(
        "S1 the equipment is linked to the new location",
        status == 200 and equipment is not None and equipment.get("functionalLocationId") == loc_id,
        f"equipmentLocation={equipment.get('functionalLocationId') if equipment else 'n/a'} expected={loc_id}",
    )

    status, children = api_get(page, f"/api/functional-locations?search={loc_code}", token)
    child_rows = children.get("data", []) if isinstance(children, dict) else (children or [])
    run.check(
        "S1 the equipment sits on a lowest-level location",
        not any(r.get("parentLocationId") == loc_id for r in child_rows),
        f"locationsAtOrBelow={len(child_rows)}",
    )

    wc_code = f"UAT171-WC-{ts}"
    page.goto(base + "/work-centers", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    page.click('button[aria-label="Add work center"]')
    form = page.locator('form[aria-label="New work center"]')
    form.get_by_label("Code").fill(wc_code)
    form.get_by_label("Name").fill(f"UAT 1.7.1 work centre {ts}")
    form.get_by_label("Daily capacity hours").fill("8")
    form.get_by_label("Cost rate per hour").fill("45.5")
    form.get_by_role("button", name="Save").click()
    page.wait_for_timeout(1800)
    run.shot(page, "work-center-created")
    run.check(
        "S1 work centre created through the form",
        page.locator('form[aria-label="New work center"]').count() == 0 and not page.locator('[role="alert"]').count(),
        wc_code,
    )

    status, wcs = api_get(page, "/api/work-centers", token)
    wc_rows = wcs.get("data", []) if isinstance(wcs, dict) else (wcs or [])
    work_center = next((r for r in wc_rows if r.get("code") == wc_code), None)
    run.check("S1 the work centre persisted", status == 200 and work_center is not None, f"status={status}")

    run.facts.update(
        {
            "locationCode": loc_code,
            "functionalLocationId": loc_id,
            "equipmentCode": eq_code,
            "equipmentName": equipment.get("name") if equipment else None,
            "equipmentId": equipment.get("equipmentId") if equipment else None,
            "workCenterCode": wc_code,
            "workCenterId": work_center.get("workCenterId") if work_center else None,
        }
    )
    return run.facts


# ───────────────────────────────────────────────────────────────────────
# S2 - lifecycle
# ───────────────────────────────────────────────────────────────────────
def section_s2(run, page, base, token, facts, ts):
    run.section = "s2"
    reset_console(run)
    login(page, base, ADMIN)
    token = api_token(page)

    _, before = api_get(page, "/api/notifications?type=M3&take=100", token)
    m3_before = before.get("total") if isinstance(before, dict) else len(before or [])

    description = f"UAT 1.7.1 lifecycle {ts}"
    page.goto(base + "/notifications", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    page.get_by_role("button", name="New Notification").click()
    page.wait_for_selector("#ntf-eq", timeout=20000)
    page.wait_for_function(
        "() => { const s = document.querySelector('#ntf-eq'); return s && s.options.length > 1; }",
        timeout=120000,
    )
    page.select_option("#ntf-type", "M1")
    page.select_option("#ntf-priority", "Medium")
    page.select_option("#ntf-eq", facts["equipmentId"])
    page.fill("#ntf-desc", description)
    page.fill("#ntf-damages", "S2 walk observation")
    page.get_by_role("button", name="Raise notification").click()
    page.wait_for_timeout(1800)
    run.shot(page, "notification-raised")
    body = page.inner_text("body")
    match = re.search(r"N-\d{6}", body)
    number = match.group(0) if match else ""
    run.check("S2 M1 notification raised through the form", bool(number) and description[:20] in body, number)

    status, found = api_get(page, f"/api/notifications?search={description.replace(' ', '%20')}&take=5", token)
    rows = found.get("data", []) if isinstance(found, dict) else []
    if not rows:
        run.check("S2 notification resolvable by API search", False, f"status={status}")
        return
    notification = rows[0]
    notification_id = notification["notificationId"]
    run.check(
        "S2 notification carries the M1 type and the new equipment",
        notification.get("type") == "M1" and notification.get("equipmentId") == facts["equipmentId"],
        f"type={notification.get('type')} equipment={notification.get('equipmentId')}",
    )

    page.goto(f"{base}/notifications/{notification_id}", wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    run.shot(page, "notification-detail")
    page.get_by_role("button", name="Convert to WO").first.click()
    page.wait_for_url("**/work-orders/**", timeout=30000)
    page.wait_for_timeout(1400)
    wo_url = page.url
    wo_id = wo_url.rstrip("/").split("/")[-1]
    run.shot(page, "wo-converted")
    run.check("S2 notification converted to a work order", wait_status(page, "Draft", 10000), wo_url)

    page.get_by_role("button", name="Add Operation").click()
    page.get_by_label("Operation description").fill(f"UAT 1.7.1 operation {ts}")
    craft = page.get_by_label("Craft", exact=True)
    craft_values = craft.locator("option").evaluate_all("opts => opts.map(o => o.value).filter(Boolean)")
    craft.select_option(craft_values[0])
    page.get_by_label("Planned hours", exact=True).fill("2")
    page.get_by_label("Number of technicians", exact=True).fill("1")
    page.locator('form:has-text("New Operation")').get_by_role("button", name="Add").click()
    page.wait_for_timeout(1400)
    run.shot(page, "wo-operation")
    run.check("S2 operation added to the work order", f"UAT 1.7.1 operation {ts}" in page.inner_text("body"), "")

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
    for action, wanted, ok in steps:
        run.check(f"S2 workflow {action} -> {wanted}", ok, "")

    _, after = api_get(page, "/api/notifications?type=M3&take=100", token)
    m3_after = after.get("total") if isinstance(after, dict) else len(after or [])
    _, notification_now = api_get(page, f"/api/notifications/{notification_id}", token)
    run.check(
        "S2 completing the work order generated no M3 (D-22)",
        m3_after == m3_before,
        f"m3 before={m3_before} after={m3_after}",
    )
    run.check(
        "S2 the converted notification reached Completed",
        isinstance(notification_now, dict) and notification_now.get("status") == "Completed",
        f"status={notification_now.get('status') if isinstance(notification_now, dict) else 'n/a'}",
    )

    _, wo = api_get(page, f"/api/work-orders/{wo_id}", token)
    run.check(
        "S2 the closed work order carries both actual timestamps",
        isinstance(wo, dict) and bool(wo.get("actualStart")) and bool(wo.get("actualFinish")),
        f"actualStart={bool(wo.get('actualStart')) if isinstance(wo, dict) else 'n/a'} actualFinish={bool(wo.get('actualFinish')) if isinstance(wo, dict) else 'n/a'}",
    )
    run.facts.update(
        {
            "lifecycleWorkOrderId": wo_id,
            "lifecycleNotificationId": notification_id,
            "lifecycleNotificationNumber": number,
        }
    )


# ───────────────────────────────────────────────────────────────────────
# S3 - guards
# ───────────────────────────────────────────────────────────────────────
def section_s3(run, page, base, token, facts, ts):
    run.section = "s3"
    reset_console(run)
    login(page, base, ADMIN)
    token = api_token(page)

    _, me = api_get(page, "/api/auth/me", token)
    supervisor_id = me.get("userId")
    _, crafts = api_get(page, "/api/crafts", token)
    craft_rows = crafts.get("data", []) if isinstance(crafts, dict) else (crafts or [])
    craft_id = craft_rows[0]["craftId"]

    # S3a: a draft with no operations cannot be planned.
    status, wo = api_post(
        page,
        "/api/work-orders",
        token,
        {
            "type": "CM",
            "priority": "Low",
            "description": f"UAT 1.7.1 guard {ts}",
            "functionalLocationId": facts["functionalLocationId"],
            "equipmentId": facts["equipmentId"],
            "workCenterId": facts["workCenterId"],
            "supervisorUserId": supervisor_id,
        },
    )
    run.check("S3a a draft work order was created", status == 201 and isinstance(wo, dict), f"status={status}")
    if not isinstance(wo, dict):
        return
    guard_wo_id = wo["workOrderId"]

    page.goto(f"{base}/work-orders/{guard_wo_id}", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Plan", exact=True).click()
    page.wait_for_timeout(1500)
    run.shot(page, "a-plan-refused")
    body = page.inner_text("body")
    run.check(
        "S3a the UI refuses to plan a work order with no operations",
        "at least one operation" in body,
        f"alert={page.locator('[role=\"alert\"]').count()}",
    )

    status, error = api_put(page, f"/api/work-orders/{guard_wo_id}/status", token, {"status": "Planned"})
    run.check(
        "S3a the API refuses Draft -> Planned with 409",
        status == 409 and isinstance(error, dict) and "at least one operation" in str(error.get("error", "")),
        f"status={status} body={error}",
    )

    # S3b: Scheduled without a schedule is refused.
    status, operation = api_post(
        page,
        "/api/work-order-operations",
        token,
        {
            "workOrderId": guard_wo_id,
            "sequenceNumber": 10,
            "description": f"UAT 1.7.1 guard operation {ts}",
            "craftId": craft_id,
            "plannedHours": 1,
            "numberOfTechnicians": 1,
        },
    )
    run.check("S3b an operation was added to the guard work order", status == 201, f"status={status}")

    page.goto(f"{base}/work-orders/{guard_wo_id}", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Plan", exact=True).click()
    run.check("S3b the work order reaches Planned", wait_status(page, "Planned", 12000), "")

    page.get_by_role("button", name="Schedule", exact=True).click()
    dialog = page.locator('[aria-label^="Schedule WO-"]')
    dialog.wait_for(timeout=10000)
    dialog.get_by_role("button", name="Schedule", exact=True).click()
    page.wait_for_timeout(900)
    run.shot(page, "b-schedule-refused")
    _, guard_wo = api_get(page, f"/api/work-orders/{guard_wo_id}", token)
    run.check(
        "S3b the UI keeps the dialog open and does not schedule without dates",
        dialog.is_visible() and guard_wo.get("status") == "Planned",
        f"dialogOpen={dialog.is_visible()} status={guard_wo.get('status')}",
    )
    dialog.get_by_role("button", name="Cancel", exact=True).click()
    page.wait_for_timeout(500)

    status, error = api_put(page, f"/api/work-orders/{guard_wo_id}/status", token, {"status": "Scheduled"})
    run.check(
        "S3b the API refuses Scheduled without dates with 400",
        status == 400 and isinstance(error, dict) and "plannedStart" in str(error.get("error", "")),
        f"status={status} body={error}",
    )

    # S3c: an M3 completion confirmation cannot become a work order.
    status, notif = api_post(
        page,
        "/api/notifications",
        token,
        {
            "type": "M3",
            "priority": "Low",
            "description": f"UAT 1.7.1 completion confirmation {ts}",
            "functionalLocationId": facts["functionalLocationId"],
            "equipmentId": facts["equipmentId"],
            "reportedByUserId": supervisor_id,
        },
    )
    run.check("S3c an M3 completion confirmation was created", status == 201 and isinstance(notif, dict), f"status={status}")
    if not isinstance(notif, dict):
        return
    m3_id = notif["notificationId"]

    page.goto(f"{base}/notifications/{m3_id}", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    run.shot(page, "c-m3-readonly")
    body = page.inner_text("body")
    run.check(
        "S3c the UI hides Convert to WO on a completion confirmation",
        page.get_by_role("button", name="Convert to WO").count() == 0,
        "",
    )
    run.check(
        "S3c the UI explains why the record is read-only",
        "cannot be edited, deleted, or converted" in body,
        "",
    )

    status, error = api_post(page, f"/api/notifications/{m3_id}/convert-to-wo", token, {})
    run.check(
        "S3c the API refuses to convert a completion confirmation with 400",
        status == 400 and isinstance(error, dict) and "completion confirmation" in str(error.get("error", "")),
        f"status={status} body={error}",
    )
    run.facts.update({"guardWorkOrderId": guard_wo_id, "m3NotificationId": m3_id})


# ───────────────────────────────────────────────────────────────────────
# S4 - reports
# ───────────────────────────────────────────────────────────────────────
def create_breakdown(page, token, facts, supervisor_id, craft_id, description, leave_open=False):
    """Create an EM breakdown and walk it far enough for the report to see it.

    With ``leave_open`` the work order is started and left In Progress, which is
    the state MTBF/MTTR must count as excluded rather than average over.
    """
    status, wo = api_post(
        page,
        "/api/work-orders",
        token,
        {
            "type": "EM",
            "priority": "High",
            "description": description,
            "functionalLocationId": facts["functionalLocationId"],
            "equipmentId": facts["equipmentId"],
            "workCenterId": facts["workCenterId"],
            "supervisorUserId": supervisor_id,
            "breakdownFlag": True,
        },
    )
    if status != 201:
        return None, None, f"create status={status} body={wo}"
    wo_id = wo["workOrderId"]

    status, body = api_post(
        page,
        "/api/work-order-operations",
        token,
        {
            "workOrderId": wo_id,
            "sequenceNumber": 10,
            "description": "Breakdown repair",
            "craftId": craft_id,
            "plannedHours": 1,
            "numberOfTechnicians": 1,
        },
    )
    if status != 201:
        return wo_id, "Draft", f"operation status={status} body={body}"

    planned_start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    planned_finish = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    for payload in (
        {"status": "Planned"},
        {"status": "Scheduled", "plannedStart": planned_start, "plannedFinish": planned_finish},
        {"status": "In Progress"},
    ):
        status, body = api_put(page, f"/api/work-orders/{wo_id}/status", token, payload)
        if status != 200:
            return wo_id, payload["status"], f"transition status={status} body={body}"
    if leave_open:
        return wo_id, "In Progress", ""
    return wo_id, "In Progress", ""


def close_breakdown(page, token, wo_id, cause_id):
    status, body = api_put(page, f"/api/work-orders/{wo_id}", token, {"causeCodeId": cause_id})
    if status != 200:
        return f"cause status={status} body={body}"
    for target in ("Completed", "Closed"):
        status, body = api_put(page, f"/api/work-orders/{wo_id}/status", token, {"status": target})
        if status != 200:
            return f"{target} status={status} body={body}"
    return ""


def chart_axis_text(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.recharts-wrapper text'))
            .map(t => (t.textContent || '').trim()).filter(Boolean)"""
    )


def section_s4(run, page, base, token, facts, ts, out):
    run.section = "s4"
    reset_console(run)
    login(page, base, ADMIN)
    token = api_token(page)

    _, me = api_get(page, "/api/auth/me", token)
    supervisor_id = me.get("userId")
    _, crafts = api_get(page, "/api/crafts", token)
    craft_rows = crafts.get("data", []) if isinstance(crafts, dict) else (crafts or [])
    craft_id = craft_rows[0]["craftId"]
    _, causes = api_get(page, "/api/cause-codes", token)
    cause_rows = causes.get("data", []) if isinstance(causes, dict) else (causes or [])
    cause_id = cause_rows[0]["causeCodeId"]

    # Three breakdowns on the new asset. EM-1 is started first and finished last,
    # so its repair overlaps EM-2: the span between the two failures is shorter
    # than the total repair time, which is exactly the case the clamp exists for.
    em1, state1, err1 = create_breakdown(page, token, facts, supervisor_id, craft_id, f"UAT 1.7.1 breakdown A {ts}")
    run.check("S4 breakdown A started", state1 == "In Progress" and not err1, f"id={em1} state={state1} {err1}")

    em2, state2, err2 = create_breakdown(page, token, facts, supervisor_id, craft_id, f"UAT 1.7.1 breakdown B {ts}")
    run.check("S4 breakdown B started", state2 == "In Progress" and not err2, f"id={em2} state={state2} {err2}")
    if em2:
        error = close_breakdown(page, token, em2, cause_id)
        run.check("S4 breakdown B completed and closed", not error, error)

    if em1:
        error = close_breakdown(page, token, em1, cause_id)
        run.check("S4 breakdown A completed and closed (overlapping B)", not error, error)

    em3, state3, err3 = create_breakdown(
        page, token, facts, supervisor_id, craft_id, f"UAT 1.7.1 breakdown C {ts}", leave_open=True
    )
    run.check("S4 breakdown C left open for the exclusion count", state3 == "In Progress" and not err3, f"id={em3} {err3}")

    # ── raw rows, for the independent recomputation ──────────────────────
    status, em_rows = paginate(page, "/api/work-orders?type=EM", token)
    run.check("S4 raw breakdown rows fetched", status == 200 and bool(em_rows), f"status={status} rows={len(em_rows)}")

    status_cm, cm_rows = paginate(page, "/api/work-orders?type=CM", token)
    run.check("S4 raw corrective rows fetched", status_cm == 200, f"status={status_cm} rows={len(cm_rows)}")
    downtime_rows = em_rows + cm_rows

    equipment_id = facts["equipmentId"]
    equipment_code = facts["equipmentCode"]

    # ── MTBF, filtered to the new asset ─────────────────────────────────
    status, mtbf = api_get(page, f"/api/reports/mtbf?equipmentId={equipment_id}", token)
    ok_shape = status == 200 and isinstance(mtbf, dict) and isinstance(mtbf.get("byEquipment"), list)
    run.check("S4 MTBF returns an object with byEquipment", ok_shape, f"status={status} keys={list(mtbf) if isinstance(mtbf, dict) else mtbf}")
    if ok_shape:
        rows = mtbf["byEquipment"]
        want, want_excluded = expected.mtbf([r for r in em_rows if r.get("equipmentId") == equipment_id])
        row = rows[0] if rows else {}
        run.check(
            "S4 MTBF labels the row with the equipment code and name",
            row.get("equipmentCode") == equipment_code
            and row.get("equipmentName") == facts.get("equipmentName"),
            f"code={row.get('equipmentCode')} name={row.get('equipmentName')} expectedName={facts.get('equipmentName')}",
        )
        run.check(
            "S4 MTBF reports two failures for the new asset",
            row.get("breakdownCount") == 2,
            f"breakdownCount={row.get('breakdownCount')}",
        )
        run.check(
            "S4 MTBF clamps overlapping repairs at zero",
            row.get("mtbfHours") == 0,
            f"mtbfHours={row.get('mtbfHours')} recomputed={want.get(equipment_id)}",
        )
        run.check(
            "S4 MTBF counts the open breakdown as excluded",
            mtbf.get("excludedIncomplete") == 1,
            f"excludedIncomplete={mtbf.get('excludedIncomplete')} recomputed={want_excluded}",
        )
        # Show that zero came from the clamp, not from rounding a small value.
        starts = sorted(
            expected.parse_ts(r["actualStart"])
            for r in em_rows
            if r.get("equipmentId") == equipment_id and r.get("actualStart") and r.get("actualFinish")
        )
        if len(starts) >= 2:
            span = (starts[-1] - starts[0]).total_seconds() / 3600.0
            repair = sum(
                expected.repair_hours(r)
                for r in em_rows
                if r.get("equipmentId") == equipment_id and r.get("actualFinish")
            )
            run.check(
                "S4 the clamp was actually needed (unclamped uptime is negative)",
                span - repair < 0,
                f"spanHours={span:.4f} repairHours={repair:.4f} unclamped={(span - repair) / (len(starts) - 1):.4f}",
            )

    # ── MTBF, unfiltered: the null rule and the labels ──────────────────
    status, mtbf_all = api_get(page, "/api/reports/mtbf", token)
    if status == 200 and isinstance(mtbf_all, dict):
        rows = mtbf_all.get("byEquipment") or []
        single = [r for r in rows if r.get("breakdownCount") == 1]
        run.check(
            "S4 MTBF reports a null interval for a single failure",
            bool(single) and all(r.get("mtbfHours") is None for r in single),
            f"singleFailureRows={[(r.get('equipmentCode'), r.get('mtbfHours')) for r in single][:5]}",
        )
        codes = [r.get("equipmentCode") for r in rows]
        run.check("S4 MTBF orders rows by equipment code", codes == sorted(codes), f"rows={len(codes)}")
        bad = [r.get("equipmentCode") for r in rows if expected.is_uuid(r.get("equipmentCode"))]
        bad += [r.get("equipmentName") for r in rows if expected.is_uuid(r.get("equipmentName"))]
        run.check("S4 MTBF never uses a UUID as a label", not bad, f"uuidLabels={bad[:5]} rows={len(rows)}")
        want_all, want_excluded_all = expected.mtbf(em_rows)
        problems = expected.compare_maps(want_all, {r["equipmentId"]: r for r in rows}, "mtbfHours", "breakdownCount")
        run.check(
            "S4 MTBF matches the independently recomputed arithmetic",
            not problems and mtbf_all.get("excludedIncomplete") == want_excluded_all,
            f"problems={problems[:4]} excluded={mtbf_all.get('excludedIncomplete')} recomputed={want_excluded_all}",
        )

    # ── MTTR ───────────────────────────────────────────────────────────
    status, mttr = api_get(page, "/api/reports/mttr", token)
    ok_shape = status == 200 and isinstance(mttr, dict) and isinstance(mttr.get("byEquipment"), list)
    run.check("S4 MTTR returns byEquipment and byLocation", ok_shape, f"status={status} keys={list(mttr) if isinstance(mttr, dict) else mttr}")
    if ok_shape:
        want_eq, want_loc, want_excluded = expected.mttr(em_rows)
        problems = expected.compare_maps(want_eq, {r["equipmentId"]: r for r in mttr["byEquipment"]}, "mttrHours", "breakdownCount")
        run.check("S4 MTTR by equipment matches the recomputed arithmetic", not problems, f"problems={problems[:4]} rows={len(mttr['byEquipment'])}")
        problems = expected.compare_maps(want_loc, {r["functionalLocationId"]: r for r in mttr["byLocation"]}, "mttrHours", "breakdownCount")
        run.check("S4 MTTR by location matches the recomputed arithmetic", not problems, f"problems={problems[:4]} rows={len(mttr['byLocation'])}")
        run.check(
            "S4 MTTR counts the open breakdown as excluded",
            mttr.get("excludedIncomplete") == want_excluded,
            f"excludedIncomplete={mttr.get('excludedIncomplete')} recomputed={want_excluded}",
        )
        run.check(
            "S4 MTTR reports a positive repair interval",
            any((r.get("mttrHours") or 0) > 0 for r in mttr["byEquipment"]),
            f"values={[r.get('mttrHours') for r in mttr['byEquipment']][:5]}",
        )
        bad = [r.get("equipmentCode") for r in mttr["byEquipment"] if expected.is_uuid(r.get("equipmentCode"))]
        bad += [r.get("locationCode") for r in mttr["byLocation"] if expected.is_uuid(r.get("locationCode"))]
        empty = [r.get("functionalLocationId") for r in mttr["byLocation"] if not r.get("locationCode")]
        run.check("S4 MTTR never uses a UUID as a label", not bad, f"uuidLabels={bad[:5]}")
        run.check("S4 MTTR by location carries a location code", not empty, f"emptyLabels={empty[:5]}")

    # ── Downtime ───────────────────────────────────────────────────────
    status, downtime = api_get(page, "/api/reports/downtime", token)
    ok_shape = status == 200 and isinstance(downtime, list)
    run.check("S4 downtime returns a list of equipment rows", ok_shape, f"status={status}")
    if ok_shape:
        want = expected.downtime(downtime_rows)
        problems = expected.compare_maps(want, {r["equipmentId"]: r for r in downtime}, "totalDowntimeHours", "workOrderCount")
        run.check(
            "S4 downtime matches the recomputed arithmetic",
            not problems,
            f"problems={problems[:4]} rows={len(downtime)}",
        )
        bad = [r.get("equipmentCode") for r in downtime if expected.is_uuid(r.get("equipmentCode"))]
        run.check("S4 downtime never uses a UUID as a label", not bad, f"uuidLabels={bad[:5]} rows={len(downtime)}")

    # ── the screen ─────────────────────────────────────────────────────
    page.goto(base + "/reports", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)
    page.get_by_role("button", name="MTBF", exact=True).click()
    page.wait_for_timeout(1200)
    page.select_option('select[aria-label="Report equipment"]', equipment_id)
    page.wait_for_timeout(2200)
    run.shot(page, "mtbf-filtered")
    axis = chart_axis_text(page)
    run.check(
        "S4 the MTBF axis carries the equipment code",
        any(equipment_code in label for label in axis),
        f"axis={axis[:8]}",
    )
    hits = uuid_hits(page.inner_text("body"))
    run.check("S4 the MTBF screen shows no UUID", not hits, f"uuids={hits[:3]}")
    body = page.inner_text("body")
    run.check(
        "S4 the MTBF screen states how many breakdowns were excluded",
        "excluded: still open" in body,
        f"snippet={[line for line in body.splitlines() if 'excluded' in line][:2]}",
    )

    for tab in ("MTTR", "Downtime"):
        page.get_by_role("button", name=tab, exact=True).click()
        page.wait_for_timeout(1800)
        run.shot(page, tab.lower())
        hits = uuid_hits(page.inner_text("body"))
        run.check(f"S4 the {tab} screen shows no UUID", not hits, f"uuids={hits[:3]}")

    # ── the Excel export ───────────────────────────────────────────────
    from openpyxl import load_workbook

    def download_report(report_key, query, filename):
        response = page.request.get(f"{api_base}/api/reports/{report_key}/export.xlsx{query}", headers={"Authorization": f"Bearer {token}"})
        payload = response.body()
        path = os.path.join(out, filename)
        with io.open(path, "wb") as handle:
            handle.write(payload)
        return response.status, path, payload

    status, path, payload = download_report("mtbf", f"?equipmentId={equipment_id}", "export_mtbf.xlsx")
    run.check("S4 MTBF export returns an xlsx", status == 200 and payload[:2] == b"PK", f"status={status} bytes={len(payload)}")
    if status == 200:
        workbook = load_workbook(io.BytesIO(payload), data_only=True)
        sheets = workbook.sheetnames
        run.check(
            "S4 the MTBF workbook carries a Summary and a By Equipment sheet",
            "Summary" in sheets and "By Equipment" in sheets,
            f"sheets={sheets}",
        )
        if "By Equipment" in sheets:
            grid = [[cell for cell in row] for row in workbook["By Equipment"].iter_rows(values_only=True)]
            header = list(grid[0]) if grid else []
            run.check(
                "S4 the export carries equipmentCode and equipmentName columns",
                "equipmentCode" in header and "equipmentName" in header,
                f"header={header}",
            )
            code_col = header.index("equipmentCode") if "equipmentCode" in header else None
            name_col = header.index("equipmentName") if "equipmentName" in header else None
            values = [row[code_col] for row in grid[1:] if code_col is not None]
            names = [row[name_col] for row in grid[1:] if name_col is not None]
            run.check(
                "S4 the export's label cells are the plant's code, not a UUID",
                equipment_code in values and not any(expected.is_uuid(v) for v in values + names),
                f"codes={values[:4]} names={[str(n)[:24] for n in names[:2]]}",
            )

    # The label columns, not the machine-key columns: the workbook keeps
    # equipmentId/functionalLocationId as keys (as the JSON does) and adds the
    # plant's code and name beside them. A label cell must never be a UUID.
    label_columns = ("equipmentCode", "equipmentName", "locationCode", "description")
    for report_key in ("mttr", "downtime"):
        status, path, payload = download_report(report_key, "", f"export_{report_key}.xlsx")
        ok = status == 200 and payload[:2] == b"PK"
        label_cells = []
        uuid_labels = []
        if ok:
            workbook = load_workbook(io.BytesIO(payload), data_only=True)
            for sheet in workbook.worksheets:
                rows = list(sheet.iter_rows(values_only=True))
                if not rows:
                    continue
                header = [str(cell) if cell is not None else "" for cell in rows[0]]
                for column in label_columns:
                    if column not in header:
                        continue
                    index = header.index(column)
                    for row in rows[1:]:
                        value = row[index] if index < len(row) else None
                        if isinstance(value, str) and value:
                            label_cells.append(value)
                            if expected.is_uuid(value):
                                uuid_labels.append(f"{sheet.title}.{column}={value}")
        run.check(
            f"S4 the {report_key} export carries plant labels and no UUID label",
            ok and bool(label_cells) and not uuid_labels,
            f"status={status} labelCells={len(label_cells)} uuidLabels={uuid_labels[:3]}",
        )

    # The screen's own Export button, which streams the same workbook.
    page.get_by_role("button", name="MTBF", exact=True).click()
    page.wait_for_timeout(1500)
    with page.expect_download() as download:
        page.get_by_role("button", name="Export", exact=True).click()
    saved = os.path.join(out, "export_mtbf_ui.xlsx")
    download.value.save_as(saved)
    run.check(
        "S4 the Export button downloads a workbook",
        os.path.getsize(saved) > 0,
        f"file={os.path.basename(saved)} bytes={os.path.getsize(saved)}",
    )

    run.facts.update({"breakdownWorkOrders": [em1, em2, em3]})


# ───────────────────────────────────────────────────────────────────────
# S5 - RBAC
# ───────────────────────────────────────────────────────────────────────
def section_s5(run, page, base, token, ts):
    run.section = "s5"
    reset_console(run)
    login(page, base, ADMIN)
    token = api_token(page)

    username = f"uat171-requester-{ts}"
    status, user = api_post(
        page,
        "/api/users",
        token,
        {
            "username": username,
            "password": PASSWORD,
            "fullName": f"UAT 1.7.1 Requester {ts}",
            "email": f"{username}@example.test",
            "role": "Requester",
        },
    )
    run.check("S5 a Requester account was created", status == 201 and isinstance(user, dict), f"status={status}")

    login(page, base, username)
    requester_token = api_token(page)
    body = page.inner_text("body")
    run.check("S5 the Requester signs in", "CommandPulse" in body, f"user={username}")
    run.check(
        "S5 the Requester has no Administration navigation entry",
        page.locator('button[aria-label="Administration"]').count() == 0,
        f"navItems={page.locator('nav button[aria-label]').count()}",
    )

    page.goto(base + "/administration", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)
    run.shot(page, "administration-blocked")
    landed = page.url.rstrip("/").split("/")[-1]
    run.check(
        "S5 a direct visit to /administration lands on the dashboard",
        landed == "dashboard",
        f"url={page.url}",
    )

    status, error = api_get(page, "/api/users", requester_token)
    run.check("S5 the Requester is refused /api/users with 403", status == 403, f"status={status} body={str(error)[:90]}")

    status, error = api_get(page, "/api/audit-log", requester_token)
    run.check("S5 the Requester is refused /api/audit-log with 403", status == 403, f"status={status} body={str(error)[:90]}")

    page.goto(base + "/dashboard", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    run.shot(page, "requester-dashboard")
    run.facts["requesterUsername"] = username


def main():
    global api_base
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:3000")
    parser.add_argument("--api", default="http://localhost:4100")
    parser.add_argument("--out", default=os.path.join(ROOT, "docs", "screenshots", "uat_v1.7.1"))
    parser.add_argument("--expect-asset", default="")
    parser.add_argument("--sections", default="s0,s1,s2,s3,s4,s5")
    parser.add_argument("--headful", action="store_true")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    api_base = args.api.rstrip("/")
    sections = [s.strip() for s in args.sections.split(",") if s.strip()]
    ts = datetime.now().strftime("%H%M%S")

    run = Run(args.out)
    facts = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headful)
        context = browser.new_context(
            viewport={"width": 1680, "height": 1000},
            accept_downloads=True,
            ignore_https_errors=True,
        )
        page = context.new_page()
        page.set_default_timeout(30000)
        attach_logging(page, run)

        login(page, args.base, ADMIN)
        token = api_token(page)

        if "s0" in sections:
            section_s0(run, page, args.base, token, args.expect_asset)
        if "s1" in sections:
            facts = section_s1(run, page, args.base, token, ts) or {}
        if "s2" in sections:
            section_s2(run, page, args.base, token, facts, ts)
        if "s3" in sections:
            section_s3(run, page, args.base, token, facts, ts)
        if "s4" in sections:
            section_s4(run, page, args.base, token, facts, ts, args.out)
        if "s5" in sections:
            section_s5(run, page, args.base, token, ts)

        browser.close()

    passed = sum(1 for c in run.checks if c["ok"])
    failed = len(run.checks) - passed
    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "base": args.base,
        "api": args.api,
        "sections": sections,
        "facts": run.facts,
        "checks": run.checks,
        "console_errors": run.console,
        "failed_responses": run.responses,
        "passed": passed,
        "failed": failed,
    }
    with io.open(os.path.join(args.out, "uat_s0_s6_results.json"), "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=1)

    lines = [
        "# UAT v1.7.1 - S0-S6 acceptance pass",
        "",
        f"Generated: {summary['generated']}",
        f"UI: {args.base} (built `app/dist` behind the throwaway proxy)",
        f"API: {args.api} against the throwaway `cmms_uat` clone",
        "",
        f"Result: **{passed} passed, {failed} failed**",
        "",
        "| Section | Check | Result | Detail |",
        "|---|---|---|---|",
    ]
    for check in run.checks:
        lines.append(
            f"| {check['section']} | {check['name']} | {'PASS' if check['ok'] else 'FAIL'} | "
            f"{check['detail'].replace('|', '/').replace(chr(10), ' ')} |"
        )
    lines.append("")
    lines.append(f"Console errors captured: {len(run.console)}; failed HTTP responses: {len(run.responses)}")
    if run.console:
        lines.append("")
        lines.append("Console errors:")
        for entry in run.console:
            lines.append(f"- [{entry['section']}] {entry['text']}")
    with io.open(os.path.join(args.out, "UAT_S0_S6_REPORT.md"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    print(f"\n{passed} passed, {failed} failed. Evidence: {args.out}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
