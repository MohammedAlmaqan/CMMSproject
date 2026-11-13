#!/usr/bin/env python3
"""UAT v1.7.0 - API surface, all ten reports, and report arithmetic.

This is a UAT evidence run, not a gate. It talks to a *throwaway* database
(cmms_uat by default) over its own API instance, so it never writes to the
live `cmms` database.

What it does
  1. Signs in as a UAT administrator.
  2. Calls every report endpoint and records status, shape and row counts.
  3. Re-derives MTBF, Cost Summary and Material Consumption with direct SQL
     and compares them to the API's JSON, exactly, to two decimals.

Usage
  python scripts/verify/verify_uat_v170.py --api-base http://127.0.0.1:4100 \
      --db cmms_uat --out screenshots/uat170

Exit 0 = every check passed; 1 = at least one mismatch. The JSON evidence and
the markdown summary are written to --out either way.
"""
import argparse
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"

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


def psql_url(db):
    """DATABASE_URL from backend/.env with the database name swapped."""
    url = None
    with io.open(os.path.join(ROOT, "backend", ".env"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if url is None:
        raise SystemExit("DATABASE_URL not found in backend/.env")
    url = url.split("?", 1)[0]
    head, _, _ = url.rpartition("/")
    return f"{head}/{db}"


def sql(db, query):
    """Run one query and return rows as lists of strings (psql -t -A -F '|')."""
    out = subprocess.run(
        [
            os.path.join(PG_BIN, "psql.exe"),
            psql_url(db),
            "-X", "-q", "-t", "-A", "-F", "|",
            "-P", "pager=off",
            "-v", "ON_ERROR_STOP=1",
            "-c", query,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if out.returncode != 0:
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:600]}")
    return [r.split("|") for r in out.stdout.splitlines() if r.strip()]


def http_json(base, path, token=None, method="GET", body=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode("utf-8", "replace")[:400]}


def num(v):
    if v is None:
        return 0.0
    return float(v)


def r2(v):
    return round(float(v) + 0.0, 2)


class Evidence:
    def __init__(self):
        self.checks = []
        self.sections = []

    def check(self, name, ok, detail):
        self.checks.append({"name": name, "ok": bool(ok), "detail": detail})
        print(("PASS  " if ok else "FAIL  ") + name + " - " + detail)
        return ok

    def section(self, title, lines):
        self.sections.append({"title": title, "lines": lines})


def expect_close(a, b, tol=0.005):
    return abs(float(a) - float(b)) <= tol


def verify_mtbf(ev, base, token, db, outdir):
    status, api = http_json(base, "/api/reports/mtbf", token)
    with io.open(os.path.join(outdir, "report_mtbf.json"), "w", encoding="utf-8") as f:
        json.dump(api, f, indent=1)
    if not ev.check("mtbf: HTTP 200 and array", status == 200 and isinstance(api, list), f"status={status} rows={len(api) if isinstance(api, list) else 'n/a'}"):
        return
    rows = sql(
        db,
        'select equipment_id, breakdown_count, mtbf_hours from report_mtbf_by_equipment '
        'order by equipment_id;',
    )
    direct = {r[0]: (int(r[1]), float(r[2])) for r in rows}
    api_map = {r["equipmentId"]: (int(r["breakdownCount"]), float(r["mtbfHours"])) for r in api}
    mismatches = []
    for eq, (cnt, hours) in direct.items():
        if eq not in api_map:
            mismatches.append(f"{eq}: missing from API")
        elif api_map[eq][0] != cnt or not expect_close(api_map[eq][1], hours):
            mismatches.append(f"{eq}: api={api_map[eq]} sql={(cnt, hours)}")
    extra = sorted(set(api_map) - set(direct))
    ok = not mismatches and not extra
    ev.check(
        "mtbf: exact match against report_mtbf_by_equipment",
        ok,
        f"equipment={len(direct)} mismatches={len(mismatches)} extra={len(extra)}"
        + ("" if ok else " :: " + "; ".join((mismatches + [f"extra {e}" for e in extra])[:4])),
    )
    ev.section(
        "MTBF",
        [
            f"API rows: {len(api)}; direct-SQL equipment: {len(direct)}",
            "Sample: " + ", ".join(f"{r['equipmentId'][:8]}={r['mtbfHours']}h/{r['breakdownCount']}bd" for r in api[:3]),
            f"Mismatches: {len(mismatches)}",
        ],
    )


def verify_cost_summary(ev, base, token, db, outdir):
    status, api = http_json(base, "/api/reports/cost-summary", token)
    with io.open(os.path.join(outdir, "report_cost_summary.json"), "w", encoding="utf-8") as f:
        json.dump(api, f, indent=1)
    if not ev.check(
        "cost-summary: HTTP 200 and expected keys",
        status == 200 and isinstance(api, dict) and "byCostCenter" in api and "period" in api,
        f"status={status} period={api.get('period') if isinstance(api, dict) else 'n/a'}",
    ):
        return
    period = api["period"]  # YYYY-MM
    year, month = period.split("-")
    # Same window the route builds: month start .. month end (UTC), applied as
    # createdDate OR actualStart, over non-deleted work orders.
    start = f"{year}-{month}-01 00:00:00+00"
    # last day: first day of next month minus a millisecond
    q = f"""
with price as (
  select w."workOrderId" as wo_id, w."costCenterCode" as cc,
         coalesce((select sum(op."plannedHours"::numeric * c."hourlyRate")
                     from "WorkOrderOperation" op join "Craft" c on c."craftId"=op."craftId"
                    where op."workOrderId"=w."workOrderId" and op."isDeleted"=false),0)
       + coalesce((select sum(m."plannedQuantity"::numeric * m."unitCost")
                     from "WorkOrderMaterial" m
                    where m."workOrderId"=w."workOrderId" and m."isDeleted"=false),0)
       + coalesce((select sum(s."cost")
                     from "ExternalServiceCost" s
                    where s."workOrderId"=w."workOrderId" and s."isDeleted"=false),0) as planned,
         coalesce((select sum(le."hoursWorked"::numeric * c."hourlyRate")
                     from "LaborEntry" le
                     join "WorkOrderOperation" op2 on op2."operationId"=le."operationId"
                     join "Craft" c on c."craftId"=op2."craftId"
                    where op2."workOrderId"=w."workOrderId" and op2."isDeleted"=false and le."isDeleted"=false),0)
       + coalesce((select sum(m."actualQuantity"::numeric * m."unitCost")
                     from "WorkOrderMaterial" m
                    where m."workOrderId"=w."workOrderId" and m."isDeleted"=false),0)
       + coalesce((select sum(s."cost")
                     from "ExternalServiceCost" s
                    where s."workOrderId"=w."workOrderId" and s."isDeleted"=false),0) as actual
    from "WorkOrder" w
   where w."isDeleted"=false
     and ( (w."createdDate" >= timestamptz '{start}' and w."createdDate" < (timestamptz '{start}' + interval '1 month'))
        or (w."actualStart" is not null and w."actualStart" >= timestamptz '{start}'
            and w."actualStart" < (timestamptz '{start}' + interval '1 month')) )
)
select coalesce(cc,''), count(*), round(sum(planned),2), round(sum(actual),2)
  from price group by 1 order by 1;
"""
    rows = sql(db, q)
    direct = {r[0]: (int(r[1]), float(r[2]), float(r[3])) for r in rows}
    api_map = {}
    for r in api["byCostCenter"]:
        key = r.get("costCenterCode") or ""
        api_map[key] = (int(r["workOrderCount"]), float(r["plannedCost"]), float(r["actualCost"]))
    mismatches = []
    for cc, v in direct.items():
        if cc not in api_map:
            mismatches.append(f"{cc or '(null)'}: missing")
            continue
        a = api_map[cc]
        if a[0] != v[0] or not expect_close(a[1], v[1]) or not expect_close(a[2], v[2]):
            mismatches.append(f"{cc or '(null)'}: api={a} sql={v}")
    extra = sorted(set(api_map) - set(direct))
    ok = not mismatches and not extra
    ev.check(
        "cost-summary: exact match against direct cost SQL",
        ok,
        f"period={period} costCentres={len(direct)} mismatches={len(mismatches)} extra={len(extra)}"
        + ("" if ok else " :: " + "; ".join((mismatches + [f"extra {e}" for e in extra])[:4])),
    )
    total_api_p = sum(v[1] for v in api_map.values())
    total_sql_p = sum(v[1] for v in direct.values())
    total_api_a = sum(v[2] for v in api_map.values())
    total_sql_a = sum(v[2] for v in direct.values())
    ev.check(
        "cost-summary: total planned and actual agree",
        expect_close(total_api_p, total_sql_p) and expect_close(total_api_a, total_sql_a),
        f"planned api={round(total_api_p,2)} sql={round(total_sql_p,2)}; "
        f"actual api={round(total_api_a,2)} sql={round(total_sql_a,2)}",
    )
    ev.section(
        "Cost Summary",
        [
            f"Period: {period}",
            f"Cost centres: {len(direct)}",
            f"Planned total: API {round(total_api_p,2)} / SQL {round(total_sql_p,2)}",
            f"Actual total:  API {round(total_api_a,2)} / SQL {round(total_sql_a,2)}",
        ],
    )


def verify_material(ev, base, token, db, outdir):
    status, api = http_json(base, "/api/reports/material-consumption", token)
    with io.open(os.path.join(outdir, "report_material_consumption.json"), "w", encoding="utf-8") as f:
        json.dump(api, f, indent=1)
    if not ev.check(
        "material-consumption: HTTP 200 and byMaterial",
        status == 200 and isinstance(api, dict) and isinstance(api.get("byMaterial"), list),
        f"status={status} materials={len(api.get('byMaterial', [])) if isinstance(api, dict) else 'n/a'}",
    ):
        return
    rows = sql(
        db,
        "select material_id, usage_count, total_quantity_used, total_cost "
        "from report_material_consumption_by_material order by material_id;",
    )
    direct = {r[0]: (int(r[1]), float(r[2]), float(r[3])) for r in rows}
    api_map = {}
    for r in api["byMaterial"]:
        api_map[r["materialId"]] = (int(r["usageCount"]), float(r["totalQuantityUsed"]), float(r["totalCost"]))
    mismatches = []
    for mid, v in direct.items():
        if mid not in api_map:
            mismatches.append(f"{mid}: missing")
            continue
        a = api_map[mid]
        if a[0] != v[0] or not expect_close(a[1], v[1]) or not expect_close(a[2], v[2]):
            mismatches.append(f"{mid}: api={a} sql={v}")
    extra = sorted(set(api_map) - set(direct))
    ok = not mismatches and not extra
    ev.check(
        "material-consumption: exact match against direct SQL",
        ok,
        f"materials={len(direct)} mismatches={len(mismatches)} extra={len(extra)}"
        + ("" if ok else " :: " + "; ".join((mismatches + [f"extra {e}" for e in extra])[:4])),
    )
    total_qty_api = sum(v[1] for v in api_map.values())
    total_qty_sql = sum(v[1] for v in direct.values())
    total_cost_api = sum(v[2] for v in api_map.values())
    total_cost_sql = sum(v[2] for v in direct.values())
    ev.check(
        "material-consumption: totals agree",
        expect_close(total_qty_api, total_qty_sql) and expect_close(total_cost_api, total_cost_sql),
        f"qty api={round(total_qty_api,2)} sql={round(total_qty_sql,2)}; "
        f"cost api={round(total_cost_api,2)} sql={round(total_cost_sql,2)}",
    )
    ev.section(
        "Material Consumption",
        [
            f"Materials: {len(direct)}",
            f"Quantity total: API {round(total_qty_api,2)} / SQL {round(total_qty_sql,2)}",
            f"Cost total:     API {round(total_cost_api,2)} / SQL {round(total_cost_sql,2)}",
        ],
    )


def verify_spot_cost(ev, db):
    """Hand-check the highest-actual-cost work order term by term."""
    rows = sql(
        db,
        "select work_order_id, wo_number, planned_labor_cost, actual_labor_cost, "
        "planned_material_cost, actual_material_cost, service_cost, "
        "derived_planned_cost, derived_actual_cost "
        "from report_work_order order by derived_actual_cost desc nulls last limit 1;",
    )
    if not rows:
        ev.check("cost spot-check: a work order exists", False, "no work orders")
        return
    wo, number, pl, al, pm, am, svc, planned, actual = rows[0]
    calc_planned = round(float(pl) + float(pm) + float(svc), 2)
    calc_actual = round(float(al) + float(am) + float(svc), 2)
    ok = expect_close(calc_planned, planned) and expect_close(calc_actual, actual)
    ev.check(
        "cost spot-check: derived cost = labour + materials + services",
        ok,
        f"{number} planned {calc_planned} vs {planned}; actual {calc_actual} vs {actual}",
    )
    ev.section(
        "Cost spot-check",
        [
            f"{number}: labour p/a {pl}/{al}, materials p/a {pm}/{am}, services {svc}",
            f"recomputed planned {calc_planned} vs view {planned}; actual {calc_actual} vs view {actual}",
        ],
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-base", default="http://127.0.0.1:4100")
    ap.add_argument("--db", default="cmms_uat")
    ap.add_argument("--user", default="uat170-admin")
    ap.add_argument("--password", default="Uat@170!Demo")
    ap.add_argument("--out", default=os.path.join(ROOT, "screenshots", "uat170"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    status, body = http_json(
        args.api_base, "/api/auth/login", method="POST",
        body={"username": args.user, "password": args.password},
    )
    if status != 200 or "token" not in body:
        print(f"login failed: status={status} body={body}")
        return 1
    token = body["token"]
    print(f"login ok: role={body.get('user', {}).get('role')}")

    ev = Evidence()
    results = []
    for name in REPORTS:
        st, data = http_json(args.api_base, f"/api/reports/{name}", token)
        with io.open(os.path.join(args.out, f"report_{name}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
        if isinstance(data, list):
            size = len(data)
        elif isinstance(data, dict):
            size = len(data.get("byCostCenter", data.get("byMaterial", data.get("rows", [])))) or len(data.keys())
        else:
            size = 0
        results.append({"report": name, "status": st, "size": size})
        ev.check(f"report {name}: HTTP 200", st == 200, f"status={st} size={size}")

    verify_mtbf(ev, args.api_base, token, args.db, args.out)
    verify_cost_summary(ev, args.api_base, token, args.db, args.out)
    verify_material(ev, args.api_base, token, args.db, args.out)
    verify_spot_cost(ev, args.db)

    passed = sum(1 for c in ev.checks if c["ok"])
    failed = len(ev.checks) - passed
    summary = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "api": args.api_base,
        "database": args.db,
        "reports": results,
        "checks": ev.checks,
        "sections": ev.sections,
        "passed": passed,
        "failed": failed,
    }
    with io.open(os.path.join(args.out, "uat_api_results.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)

    lines = ["# UAT v1.7.0 - API and report arithmetic", "", f"Generated: {summary['generated']}", ""]
    lines.append(f"Result: **{passed} passed, {failed} failed**")
    lines.append("")
    lines.append("| Check | Result | Detail |")
    lines.append("|---|---|---|")
    for c in ev.checks:
        lines.append(f"| {c['name']} | {'PASS' if c['ok'] else 'FAIL'} | {c['detail']} |")
    lines.append("")
    for s in ev.sections:
        lines.append(f"## {s['title']}")
        lines.extend(s["lines"])
        lines.append("")
    with io.open(os.path.join(args.out, "UAT_API_REPORT.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n{passed} passed, {failed} failed. Evidence: {args.out}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
