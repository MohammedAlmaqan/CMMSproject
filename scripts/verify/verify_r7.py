#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# R.7  UAT RECONCILIATION PACK — report figures vs an independent reader
# SOW 6.4/b ("all standard reports verified against manual calculation")
# and tracker item L15.
#
# The third route.  Two readers of every report figure already exist:
#   1. the TypeScript handler  (backend/src/routes/reports.ts, on the R.1 rollup)
#   2. the report_* SQL views  (migration 20261002160000_reporting_views)
# and R.6 already holds #1 and #2 equal (r6-view-differential.ts +
# tests/routes/reportsViews.test.ts).  So the views are NOT available here:
# comparing against them would compare R.6 with itself.  This pack is a third
# route — Python `requests` against the live API, plus raw SQL through `psql`
# over the BASE tables.  It never names a report_* view (it asserts that about
# itself below), never imports the report service or the R.1 rollup, and never
# calls cyclesInWindow.  The row-61 denominator is re-derived by hand and by
# PostgreSQL generate_series, because a pack that imported cyclesInWindow would
# agree with a wrong denominator by construction.
#
# It runs a deterministic fixture (insert -> reconcile -> remove) because the
# live seed is thin (no plans, no breakdown work orders, no material lines), and
# a pack that reconciles empty sets proves nothing.  Every fixture row is
# prefixed r7fix- so cleanup is exact.
#
# Usage:  python scripts/verify/verify_r7.py            (auto-discovers)
#         python scripts/verify/verify_r7.py --api-port 4000
#         R7_TOKEN=<bearer> ... (use an existing token instead of logging in;
#                               the DB-invariance run passes one so the login
#                               audit row is not part of the measured delta)
# Exit:   0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(r"C:\Users\Injaz\Documents\Default Project\CMMSproject")
BACKEND = ROOT / "backend"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"

# ── fixture identifiers (text ids; deterministic, easy to remove) ──────────
LOC, LOC_CHILD = "r7fix-loc", "r7fix-loc-child"
CRAFT, TL = "r7fix-craft", "r7fix-tl"
PLAN, TARGET = "r7fix-plan", "r7fix-target"
WO_EM, WO_EM2, WO_CM, WO_PM = "r7fix-wo-em", "r7fix-wo-em2", "r7fix-wo-cm", "r7fix-wo-pm"
WO_O1, WO_O2, WO_O3 = "r7fix-wo-open1", "r7fix-wo-open2", "r7fix-wo-open3"
OP_EM, OP_CM, OP_PM = "r7fix-op-em", "r7fix-op-cm", "r7fix-op-pm"
OP_O1, OP_O2, OP_O3 = "r7fix-op-o1", "r7fix-op-o2", "r7fix-op-o3"
LAB_EM = "r7fix-lab-em"
MAT_EM1, MAT_EM2, MAT_CM1 = "r7fix-mat-em1", "r7fix-mat-em2", "r7fix-mat-cm1"
SVC_EM1, SVC_EM2 = "r7fix-svc-em1", "r7fix-svc-em2"
N1, N2, N3, N4 = "r7fix-notif-1", "r7fix-notif-2", "r7fix-notif-3", "r7fix-notif-4"

RATE = 20.00  # fixture craft hourly rate — round number, hand-checkable
RESULTS = []
ALL_SQL = []  # every SQL string the pack issues, for the no-view self-assert


def record(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  -- {detail}" if detail else ""))


def approx(a, b, tol=0.005):
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


# ─────────────────────────── database helpers ───────────────────────────
def db_url():
    m = re.search(r'^DATABASE_URL="?([^\s"]+)"?', (BACKEND / ".env").read_text(encoding="utf-8"), re.M)
    if not m:
        raise SystemExit("DATABASE_URL not found in backend/.env")
    url = m.group(1)
    # Prisma appends ?connection_limit=...&pool_timeout=... which libpq rejects
    # as an unknown URI parameter. Keep only the connection part.
    url = url.split("?", 1)[0]
    return url


def psql(sql, tuples=True):
    ALL_SQL.append(sql)
    args = [PSQL, db_url(), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off",
            "-t", "-A", "-F", "|"]
    if tuples:
        args += ["-c", sql]
    else:
        tmp = Path(tempfile.gettempdir()) / "r7fix_script.sql"
        tmp.write_text(sql, encoding="utf-8")
        args += ["-f", str(tmp)]
    r = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"psql failed:\n{r.stderr.strip()}\n--- sql ---\n{sql}")
    rows = []
    for line in r.stdout.splitlines():
        if line == "":
            continue
        rows.append(line.split("|"))
    return rows


def scalar(sql):
    rows = psql(sql)
    return rows[0][0] if rows and rows[0] and rows[0][0] != "" else None


# ─────────────────────────── fixture SQL ───────────────────────────
def fixture_sql(ids):
    return f"""
BEGIN;
INSERT INTO "Craft" ("craftId", "workCenterId", "craftCode", description, "hourlyRate", "modifiedDate")
VALUES ('{CRAFT}', '{ids['mech']}', 'R7CRAFT', 'R7 fixture craft', {RATE}, now());

INSERT INTO "TaskList" ("taskListId", code, description, "workCenterId", "modifiedDate")
VALUES ('{TL}', 'R7-TL', 'R7 fixture task list', '{ids['mech']}', now());

INSERT INTO "FunctionalLocation" ("functionalLocationId", "locationCode", description, "parentLocationId", "locationType", "modifiedDate")
VALUES ('{LOC}', 'R7-LOC', 'R7 fixture root', NULL, 'Area', now()),
       ('{LOC_CHILD}', 'R7-LOC-CH', 'R7 fixture child', '{LOC}', 'Area', now());

INSERT INTO "MaintenancePlan" ("planId", "planCode", description, "functionalLocationId", "workCenterId", "taskListId",
  "strategyType", "intervalValue", "intervalUnit", "startDate", "endDate", priority, "modifiedDate")
VALUES ('{PLAN}', 'R7-PLAN', 'R7 fixture monthly plan', '{LOC}', '{ids['mech']}', '{TL}',
  'Time', 1, 'Months', TIMESTAMP '2026-06-15 00:00:00', TIMESTAMP '2026-12-15 00:00:00', 'Medium', now());

INSERT INTO "MaintenancePlanTarget" ("planTargetId", "planId", "equipmentId", "modifiedDate")
VALUES ('{TARGET}', '{PLAN}', '{ids['eq_m']}', now());

INSERT INTO "WorkOrder" ("workOrderId", "woNumber", type, priority, status, "functionalLocationId", "equipmentId",
  description, "workCenterId", "supervisorUserId", "reportedByUserId", "costCenterCode",
  "actualStart", "actualFinish", "plannedCost", "actualCost", "sourcePlanId", "sourcePlanCycle",
  "createdDate", "modifiedDate")
VALUES
 ('{WO_EM}',  'R7-EM-001', 'EM', 'High',   'Completed',   '{LOC}',       '{ids['eq_m']}', 'r7 breakdown', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-A', TIMESTAMP '2026-08-01 00:00:00', TIMESTAMP '2026-08-01 02:00:00', 100.00, 120.00, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_EM2}', 'R7-EM-002', 'EM', 'Medium', 'Closed',      '{LOC}',       '{ids['eq_m']}', 'r7 breakdown 2', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-B', TIMESTAMP '2026-08-10 00:00:00', TIMESTAMP '2026-08-10 01:00:00', 20.00, 0, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_CM}',  'R7-CM-001', 'CM', 'Medium', 'In Progress', '{LOC_CHILD}', '{ids['eq_p']}', 'r7 corrective', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-A', TIMESTAMP '2026-08-02 05:00:00', TIMESTAMP '2026-08-02 06:30:00', 36.00, 12.00, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_PM}',  'R7-PM-001', 'PM', 'Medium', 'Completed',   '{LOC}',       '{ids['eq_m']}', 'r7 planned', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-B', NULL, NULL, 70.00, 0, '{PLAN}', '2026-08-15', TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_O1}',  'R7-CM-002', 'CM', 'High',   'Draft',       '{LOC}',       '{ids['eq_m']}', 'r7 open 1', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-A', NULL, NULL, 50.00, 0, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_O2}',  'R7-CM-003', 'CM', 'Low',    'Scheduled',   '{LOC}',       '{ids['eq_p']}', 'r7 open 2', '{ids['mech']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-A', NULL, NULL, 20.00, 0, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now()),
 ('{WO_O3}',  'R7-PM-002', 'PM', 'High',   'Planned',     '{LOC}',       '{ids['eq_c']}', 'r7 open 3', '{ids['elec']}', '{ids['admin']}', '{ids['admin']}', 'R7-CC-C', NULL, NULL, 10.00, 0, NULL, NULL, TIMESTAMP '2026-10-01 00:00:00', now());

INSERT INTO "WorkOrderOperation" ("operationId", "workOrderId", "sequenceNumber", description, "craftId", "plannedHours", status, "modifiedDate")
VALUES
 ('{OP_EM}', '{WO_EM}', 10, 'r7 op', '{CRAFT}', 4.0,  'Completed',   now()),
 ('{OP_CM}', '{WO_CM}', 10, 'r7 op', '{CRAFT}', 1.0,  'In Progress', now()),
 ('{OP_PM}', '{WO_PM}', 10, 'r7 op', '{CRAFT}', 2.0,  'Completed',   now()),
 ('{OP_O1}', '{WO_O1}', 10, 'r7 op', '{CRAFT}', 3.5,  'Pending',     now()),
 ('{OP_O2}', '{WO_O2}', 10, 'r7 op', '{CRAFT}', 2.25, 'Pending',     now()),
 ('{OP_O3}', '{WO_O3}', 10, 'r7 op', '{CRAFT}', 10.0, 'Pending',     now());

INSERT INTO "LaborEntry" ("laborEntryId", "operationId", "userId", "hoursWorked", "modifiedDate")
VALUES ('{LAB_EM}', '{OP_EM}', '{ids['admin']}', 2.5, now());

INSERT INTO "WorkOrderMaterial" ("woMaterialId", "workOrderId", "materialId", "plannedQuantity", "actualQuantity", "unitCost", "modifiedDate")
VALUES
 ('{MAT_EM1}', '{WO_EM}', '{ids['mat_bearing']}', 2, 2,   10.00, now()),
 ('{MAT_EM2}', '{WO_EM}', '{ids['mat_gasket']}',  4, 3,    5.50, now()),
 ('{MAT_CM1}', '{WO_CM}', '{ids['mat_lube']}',    2, 1.5,  8.00, now());

INSERT INTO "ExternalServiceCost" ("serviceCostId", "workOrderId", vendor, description, cost, "invoiceRef", category, "modifiedDate")
VALUES
 ('{SVC_EM1}', '{WO_EM}', 'V1', 'r7 service', 60.00, 'INV-R7-1', 'Service', now()),
 ('{SVC_EM2}', '{WO_EM}', 'V2', 'r7 travel',  15.00, 'INV-R7-2', 'Travel',  now());

INSERT INTO "Notification" ("notificationId", "notificationNumber", type, priority, "functionalLocationId", "equipmentId", "reportedByUserId", description, status, "createdDate", "modifiedDate")
VALUES
 ('{N1}', 'R7-N1', 'Malfunction', 'High',   '{LOC}', '{ids['eq_p']}', '{ids['admin']}', 'r7 notif high',   'Open',       TIMESTAMP '2026-09-15 12:00:00', now()),
 ('{N2}', 'R7-N2', 'Malfunction', 'Medium', '{LOC}', NULL,             '{ids['admin']}', 'r7 notif medium', 'Open',       TIMESTAMP '2026-09-15 12:00:00', now()),
 ('{N3}', 'R7-N3', 'Malfunction', 'Low',    '{LOC}', NULL,             '{ids['admin']}', 'r7 notif low',    'In Process', TIMESTAMP '2026-09-15 12:00:00', now()),
 ('{N4}', 'R7-N4', 'Malfunction', 'High',   '{LOC}', NULL,             '{ids['admin']}', 'r7 notif done',   'Completed',  TIMESTAMP '2026-09-15 12:00:00', now());
COMMIT;
"""


CLEANUP_SQL = f"""
DELETE FROM "ExternalServiceCost" WHERE "serviceCostId" IN ('{SVC_EM1}','{SVC_EM2}');
DELETE FROM "LaborEntry"          WHERE "laborEntryId" = '{LAB_EM}';
DELETE FROM "WorkOrderMaterial"   WHERE "woMaterialId" IN ('{MAT_EM1}','{MAT_EM2}','{MAT_CM1}');
DELETE FROM "WorkOrderOperation"  WHERE "operationId" IN ('{OP_EM}','{OP_CM}','{OP_PM}','{OP_O1}','{OP_O2}','{OP_O3}');
DELETE FROM "WorkOrder"           WHERE "workOrderId" IN ('{WO_EM}','{WO_EM2}','{WO_CM}','{WO_PM}','{WO_O1}','{WO_O2}','{WO_O3}');
DELETE FROM "MaintenancePlanTarget" WHERE "planId" = '{PLAN}' OR "planTargetId" = '{TARGET}';
DELETE FROM "MaintenancePlan"     WHERE "planId" = '{PLAN}';
DELETE FROM "Notification"        WHERE "notificationId" IN ('{N1}','{N2}','{N3}','{N4}');
DELETE FROM "TaskList"            WHERE "taskListId" = '{TL}';
DELETE FROM "Craft"               WHERE "craftId" = '{CRAFT}';
DELETE FROM "FunctionalLocation"  WHERE "functionalLocationId" IN ('{LOC_CHILD}','{LOC}');
"""


def resolve_seed_ids():
    def one(sql):
        v = scalar(sql)
        if v is None:
            raise SystemExit("seed reference not found: " + sql)
        return v

    return {
        "mech": one("SELECT \"workCenterId\" FROM \"WorkCenter\" WHERE code='MECH' AND \"isDeleted\"=false"),
        "elec": one("SELECT \"workCenterId\" FROM \"WorkCenter\" WHERE code='ELEC' AND \"isDeleted\"=false"),
        "admin": one("SELECT \"userId\" FROM \"User\" WHERE username='admin'"),
        "eq_m": one("SELECT \"equipmentId\" FROM \"Equipment\" WHERE \"equipmentCode\"='M-1002' AND \"isDeleted\"=false"),
        "eq_p": one("SELECT \"equipmentId\" FROM \"Equipment\" WHERE \"equipmentCode\"='P-1001' AND \"isDeleted\"=false"),
        "eq_c": one("SELECT \"equipmentId\" FROM \"Equipment\" WHERE \"equipmentCode\"='C-1004' AND \"isDeleted\"=false"),
        "mat_bearing": one("SELECT \"materialId\" FROM \"Material\" WHERE \"materialCode\"='BEARING-6205' AND \"isDeleted\"=false"),
        "mat_gasket": one("SELECT \"materialId\" FROM \"Material\" WHERE \"materialCode\"='GASKET-150' AND \"isDeleted\"=false"),
        "mat_lube": one("SELECT \"materialId\" FROM \"Material\" WHERE \"materialCode\"='LUBE-OIL-ISO68' AND \"isDeleted\"=false"),
    }


# ─────────────────────────── SQL oracles (base tables only) ───────────────────────────
EXACT = f'w."functionalLocationId" = \'{LOC}\''
EXACT_PLAN = f'p."functionalLocationId" = \'{LOC}\''
DESC = f'w."functionalLocationId" IN (\'{LOC}\',\'{LOC_CHILD}\')'


def sql_backlog(scope):
    out = {}
    for field, col in (("byStatus", "status"), ("byPriority", "priority"), ("byWorkCenter", "workCenterId")):
        rows = psql(f"""
SELECT w."{col}", count(*),
  COALESCE(sum((SELECT COALESCE(sum(o."plannedHours"),0) FROM "WorkOrderOperation" o
                WHERE o."workOrderId"=w."workOrderId" AND o."isDeleted"=false)),0)
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."status" NOT IN ('Completed','Closed','Cancelled') AND {scope}
GROUP BY 1 ORDER BY 1;
""")
        out[field] = [(r[0], int(r[1]), round(float(r[2]), 4)) for r in rows]
    return out


def sql_backlog_hours(scope):
    rows = psql(f"""
SELECT wc.code, COALESCE(sum(x.cnt),0), COALESCE(sum(x.hours),0)
FROM "WorkCenter" wc
LEFT JOIN (
  SELECT w."workCenterId", count(*) cnt,
    sum((SELECT COALESCE(sum(o."plannedHours"),0) FROM "WorkOrderOperation" o
         WHERE o."workOrderId"=w."workOrderId" AND o."isDeleted"=false)) hours
  FROM "WorkOrder" w
  WHERE w."isDeleted"=false AND w."status" NOT IN ('Completed','Closed','Cancelled') AND {scope}
  GROUP BY 1
) x ON x."workCenterId"=wc."workCenterId"
WHERE wc."isDeleted"=false GROUP BY 1 ORDER BY 1;
""")
    return [(r[0], int(r[1]), round(float(r[2]), 4)) for r in rows]


def sql_pm_compliance(scope_plan, y, m):
    rows = psql(f"""
SELECT p."planId",
 (SELECT count(*) FROM generate_series(
    p."startDate", COALESCE(p."endDate", TIMESTAMP '2099-12-31'),
    CASE p."intervalUnit" WHEN 'Days' THEN make_interval(days => p."intervalValue")
                          WHEN 'Weeks' THEN make_interval(weeks => p."intervalValue")
                          ELSE make_interval(months => p."intervalValue") END) g
   WHERE g >= DATE '{y:04d}-{m:02d}-01' AND g <= TIMESTAMP '{y:04d}-{m:02d}-{_last_day(y, m):02d} 23:59:59.999') cycles,
 GREATEST((SELECT count(*) FROM "MaintenancePlanTarget" mt WHERE mt."planId"=p."planId" AND mt."isDeleted"=false),1) targets
FROM "MaintenancePlan" p WHERE p."isDeleted"=false AND p."strategyType"<>'Meter' AND {scope_plan};
""")
    scheduled = sum(int(r[1]) * int(r[2]) for r in rows)
    completed = int(scalar(f"""
SELECT count(*) FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type"='PM' AND w."status" IN ('Completed','Closed')
  AND w."sourcePlanId" IS NOT NULL AND {EXACT}
  AND left(w."sourcePlanCycle",10) BETWEEN '{y:04d}-{m:02d}-01' AND '{y:04d}-{m:02d}-{_last_day(y, m):02d}';
"""))
    return scheduled, completed


def _last_day(y, m):
    if m == 12:
        return 31
    import calendar
    return calendar.monthrange(y, m)[1]


def sql_mtbf(scope):
    rows = psql(f"""
SELECT w."equipmentId", count(*),
  EXTRACT(EPOCH FROM (max(w."actualStart") - min(w."actualStart")))/3600.0,
  sum(EXTRACT(EPOCH FROM (w."actualFinish" - w."actualStart")))/3600.0
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type"='EM' AND w."equipmentId" IS NOT NULL
  AND w."actualStart" IS NOT NULL AND w."actualFinish" IS NOT NULL AND {scope}
GROUP BY 1 ORDER BY 1;
""")
    out = []
    for r in rows:
        n = int(r[1]); span = float(r[2]); down = float(r[3])
        out.append((r[0], 0.0 if n < 2 else round((span - down) / (n - 1), 2), n))
    return out


def sql_mttr(scope):
    eq = psql(f"""
SELECT w."equipmentId", count(*),
  round((sum(EXTRACT(EPOCH FROM (w."actualFinish" - w."actualStart")))/3600.0 / count(*))::numeric, 2)
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type"='EM' AND w."actualStart" IS NOT NULL AND w."actualFinish" IS NOT NULL
  AND w."equipmentId" IS NOT NULL AND {scope}
GROUP BY 1 ORDER BY 1;
""")
    loc = psql(f"""
SELECT w."functionalLocationId", count(*),
  round((sum(EXTRACT(EPOCH FROM (w."actualFinish" - w."actualStart")))/3600.0 / count(*))::numeric, 2)
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type"='EM' AND w."actualStart" IS NOT NULL AND w."actualFinish" IS NOT NULL AND {scope}
GROUP BY 1 ORDER BY 1;
""")
    excluded = int(scalar(f"""
SELECT count(*) FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type"='EM' AND (w."actualStart" IS NULL OR w."actualFinish" IS NULL) AND {scope};
"""))
    return ([(r[0], float(r[2]), int(r[1])) for r in eq],
            [(r[0], float(r[2]), int(r[1])) for r in loc], excluded)


def sql_downtime(scope):
    rows = psql(f"""
SELECT w."equipmentId", count(*),
  round((sum(EXTRACT(EPOCH FROM (w."actualFinish" - w."actualStart")))/3600.0)::numeric, 2)
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."type" IN ('EM','CM') AND w."equipmentId" IS NOT NULL
  AND w."actualStart" IS NOT NULL AND w."actualFinish" IS NOT NULL AND {scope}
GROUP BY 1 ORDER BY 1;
""")
    return [(r[0], float(r[2]), int(r[1])) for r in rows]


def sql_cost_by_center(scope, frm, to):
    rows = psql(f"""
WITH base AS (
  SELECT w."workOrderId", w."costCenterCode"
  FROM "WorkOrder" w
  WHERE w."isDeleted"=false AND {scope}
    AND ((w."createdDate" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}')
      OR (w."actualStart" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}'))
),
pl AS (SELECT o."workOrderId", sum(o."plannedHours"*c."hourlyRate") v FROM "WorkOrderOperation" o
       JOIN "Craft" c ON c."craftId"=o."craftId" WHERE o."isDeleted"=false GROUP BY 1),
al AS (SELECT o."workOrderId", sum(le."hoursWorked"*c."hourlyRate") v FROM "LaborEntry" le
       JOIN "WorkOrderOperation" o ON o."operationId"=le."operationId" AND o."isDeleted"=false
       JOIN "Craft" c ON c."craftId"=o."craftId" WHERE le."isDeleted"=false GROUP BY 1),
pm AS (SELECT "workOrderId", sum("plannedQuantity"*"unitCost") v FROM "WorkOrderMaterial" WHERE "isDeleted"=false GROUP BY 1),
am AS (SELECT "workOrderId", sum("actualQuantity"*"unitCost") v FROM "WorkOrderMaterial" WHERE "isDeleted"=false GROUP BY 1),
sv AS (SELECT "workOrderId", sum(cost) v FROM "ExternalServiceCost" WHERE "isDeleted"=false GROUP BY 1),
per_wo AS (
  SELECT b."costCenterCode",
    round((COALESCE(pl.v,0)+COALESCE(pm.v,0)+COALESCE(sv.v,0))::numeric,2) planned,
    round((COALESCE(al.v,0)+COALESCE(am.v,0)+COALESCE(sv.v,0))::numeric,2) actual
  FROM base b
  LEFT JOIN pl ON pl."workOrderId"=b."workOrderId"
  LEFT JOIN al ON al."workOrderId"=b."workOrderId"
  LEFT JOIN pm ON pm."workOrderId"=b."workOrderId"
  LEFT JOIN am ON am."workOrderId"=b."workOrderId"
  LEFT JOIN sv ON sv."workOrderId"=b."workOrderId"
)
SELECT "costCenterCode", round(sum(planned)::numeric,2), round(sum(actual)::numeric,2), count(*)
FROM per_wo GROUP BY 1 ORDER BY 1;
""")
    return [(r[0], float(r[1]), float(r[2]), int(r[3])) for r in rows]


def sql_cost_total(scope, frm, to):
    rows = psql(f"""
WITH base AS (
  SELECT w."workOrderId"
  FROM "WorkOrder" w
  WHERE w."isDeleted"=false AND {scope}
    AND ((w."createdDate" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}')
      OR (w."actualStart" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}'))
),
pl AS (SELECT o."workOrderId", sum(o."plannedHours"*c."hourlyRate") v FROM "WorkOrderOperation" o
       JOIN "Craft" c ON c."craftId"=o."craftId" WHERE o."isDeleted"=false GROUP BY 1),
al AS (SELECT o."workOrderId", sum(le."hoursWorked"*c."hourlyRate") v FROM "LaborEntry" le
       JOIN "WorkOrderOperation" o ON o."operationId"=le."operationId" AND o."isDeleted"=false
       JOIN "Craft" c ON c."craftId"=o."craftId" WHERE le."isDeleted"=false GROUP BY 1),
pm AS (SELECT "workOrderId", sum("plannedQuantity"*"unitCost") v FROM "WorkOrderMaterial" WHERE "isDeleted"=false GROUP BY 1),
am AS (SELECT "workOrderId", sum("actualQuantity"*"unitCost") v FROM "WorkOrderMaterial" WHERE "isDeleted"=false GROUP BY 1),
sv AS (SELECT "workOrderId", sum(cost) v FROM "ExternalServiceCost" WHERE "isDeleted"=false GROUP BY 1),
per_wo AS (
  SELECT round((COALESCE(pl.v,0)+COALESCE(pm.v,0)+COALESCE(sv.v,0))::numeric,2) planned,
         round((COALESCE(al.v,0)+COALESCE(am.v,0)+COALESCE(sv.v,0))::numeric,2) actual
  FROM base b
  LEFT JOIN pl ON pl."workOrderId"=b."workOrderId"
  LEFT JOIN al ON al."workOrderId"=b."workOrderId"
  LEFT JOIN pm ON pm."workOrderId"=b."workOrderId"
  LEFT JOIN am ON am."workOrderId"=b."workOrderId"
  LEFT JOIN sv ON sv."workOrderId"=b."workOrderId"
)
SELECT round(sum(planned)::numeric,2), round(sum(actual)::numeric,2), count(*) FROM per_wo;
""")
    r = rows[0]
    return float(r[0]), float(r[1]), int(r[2])


def sql_material(scope, frm, to):
    mat = psql(f"""
SELECT m."materialCode", round(sum(l."actualQuantity")::numeric,2),
  round(sum(l."actualQuantity"*l."unitCost")::numeric,2), count(*)
FROM "WorkOrderMaterial" l
JOIN "WorkOrder" w ON w."workOrderId"=l."workOrderId"
JOIN "Material" m ON m."materialId"=l."materialId"
WHERE l."isDeleted"=false AND l."actualQuantity">0 AND w."isDeleted"=false AND {scope}
  AND w."createdDate" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}'
GROUP BY 1 ORDER BY 1;
""")
    wo = psql(f"""
SELECT w."woNumber", round(sum(l."actualQuantity")::numeric,2),
  round(sum(l."actualQuantity"*l."unitCost")::numeric,2), count(*)
FROM "WorkOrderMaterial" l
JOIN "WorkOrder" w ON w."workOrderId"=l."workOrderId"
WHERE l."isDeleted"=false AND l."actualQuantity">0 AND w."isDeleted"=false AND {scope}
  AND w."createdDate" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}'
GROUP BY 1 ORDER BY 1;
""")
    eq = psql(f"""
SELECT w."equipmentId", round(sum(l."actualQuantity")::numeric,2),
  round(sum(l."actualQuantity"*l."unitCost")::numeric,2), count(*)
FROM "WorkOrderMaterial" l
JOIN "WorkOrder" w ON w."workOrderId"=l."workOrderId"
WHERE l."isDeleted"=false AND l."actualQuantity">0 AND w."isDeleted"=false AND {scope}
  AND w."createdDate" BETWEEN TIMESTAMP '{frm}' AND TIMESTAMP '{to}'
GROUP BY 1 ORDER BY 1;
""")
    return ([(r[0], float(r[1]), float(r[2]), int(r[3])) for r in mat],
            [(r[0], float(r[1]), float(r[2]), int(r[3])) for r in wo],
            [(r[0], float(r[1]), float(r[2]), int(r[3])) for r in eq])


def sql_top_cost(scope):
    rows = psql(f"""
SELECT w."equipmentId", count(*), round(sum(w."plannedCost")::numeric,2),
  round(sum(w."actualCost")::numeric,2),
  round(sum(CASE WHEN w."actualCost">0 THEN w."actualCost" ELSE w."plannedCost" END)::numeric,2)
FROM "WorkOrder" w
WHERE w."isDeleted"=false AND w."equipmentId" IS NOT NULL AND {scope}
GROUP BY 1 ORDER BY 5 DESC, 1 ASC LIMIT 10;
""")
    return [(r[0], int(r[1]), float(r[2]), float(r[3]), float(r[4])) for r in rows]


def sql_notifications(scope):
    rows = psql(f"""
SELECT w."priority", count(*) FROM "Notification" w
WHERE w."isDeleted"=false AND w."status" IN ('Open','In Process') AND {scope}
GROUP BY 1;
""")
    total = int(scalar(f"""
SELECT count(*) FROM "Notification" w
WHERE w."isDeleted"=false AND w."status" IN ('Open','In Process') AND {scope};
"""))
    oldest = scalar(f"""
SELECT min(w."createdDate") FROM "Notification" w
WHERE w."isDeleted"=false AND w."status" IN ('Open','In Process') AND {scope};
""")
    return {r[0]: int(r[1]) for r in rows}, total, oldest


# ─────────────────────────── API helpers ───────────────────────────
class Api:
    def __init__(self, port):
        self.base = f"http://localhost:{port}"
        self.s = requests.Session()

    def login(self):
        # A successful login always writes one AuditLogEntry (lastLogin), by
        # design.  R7_TOKEN lets the caller supply an existing bearer token so a
        # DB-invariance run can isolate the fixture's own footprint from that
        # auth side effect; standalone runs log in normally.
        token = os.environ.get("R7_TOKEN")
        if token:
            self.s.headers.update({"Authorization": f"Bearer {token}"})
            return
        r = self.s.post(f"{self.base}/api/auth/login",
                        json={"username": "admin", "password": "password"}, timeout=20)
        r.raise_for_status()
        self.s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})

    def get(self, path, params=None):
        r = self.s.get(self.base + path, params=params, timeout=60)
        return r.status_code, (r.json() if r.content else None)


# ─────────────────────────── comparisons ───────────────────────────
def tupled(rows, fields):
    out = []
    for r in rows:
        out.append(tuple(round(r[f], 4) if isinstance(r[f], (int, float)) else r[f] for f in fields))
    return out


def same(api_rows, oracle_tuples, fields):
    """Compare API dict rows against SQL-oracle tuples on `fields` (order-insensitive)."""
    a = sorted(tupled(api_rows, fields))
    o = sorted(tuple(round(v, 4) if isinstance(v, (int, float)) else v for v in t) for t in oracle_tuples)
    return a == o, f"api={a} oracle={o}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-port", type=int, default=4000)
    args = ap.parse_args()

    # Self-assertion: this pack must never touch a report_* view.
    ids = resolve_seed_ids()
    # Build all SQL now (resolve_seed_ids issues a few), then assert on the whole set.
    # The important guard runs after all queries in `finally` too; here it is early:
    def assert_no_views():
        blob = "\n".join(ALL_SQL)
        bad = [s for s in ALL_SQL if re.search(r"\breport_[a-z]", s)]
        record("independent reader touches no report_* view", not bad,
               ("found: " + bad[0][:80]) if bad else "raw SQL over base tables only")
    # (assert later, after queries have been issued)

    print("== fixture: insert ==")
    psql(CLEANUP_SQL, tuples=False)  # idempotent re-run
    psql(fixture_sql(ids), tuples=False)
    print("  inserted r7fix-* fixture")

    api = Api(args.api_port)
    try:
        api.login()
    except Exception as e:
        print(f"FATAL: could not log in to API on :{args.api_port} ({e}). Start the backend first.")
        psql(CLEANUP_SQL, tuples=False)
        return 1

    exact_q = {"functionalLocationId": LOC}
    desc_q = {"functionalLocationId": LOC, "includeDescendantLocations": "true"}
    oct_from, oct_to = "2026-10-01 00:00:00", "2026-10-31 23:59:59.999"

    try:
        # ---------- 1. backlog (exact) ----------
        print("== reports ==")
        _, bl = api.get("/api/reports/backlog", exact_q)
        oracle = sql_backlog(EXACT)
        record("backlog byStatus (API = base-table SQL)",
               same(bl["byStatus"], oracle["byStatus"], ["status", "count", "totalPlannedHours"])[0],
               same(bl["byStatus"], oracle["byStatus"], ["status", "count", "totalPlannedHours"])[1])
        record("backlog byPriority (API = base-table SQL)",
               same(bl["byPriority"], oracle["byPriority"], ["priority", "count", "totalPlannedHours"])[0])
        # API byWorkCenter also carries codes; oracle keys on workCenterId
        api_wc = sorted([(r["workCenterId"], r["count"], round(r["totalPlannedHours"], 4)) for r in bl["byWorkCenter"]])
        ora_wc = sorted([(r[0], r[1], r[2]) for r in oracle["byWorkCenter"]])
        record("backlog byWorkCenter (API = base-table SQL)", api_wc == ora_wc, f"api={api_wc} oracle={ora_wc}")
        record("backlog hand-computed (Draft 1/3.5, Planned 1/10, Scheduled 1/2.25; total 15.75 h)",
               sorted(tupled(bl["byStatus"], ["status", "count", "totalPlannedHours"]))
               == sorted([("Draft", 1, 3.5), ("Planned", 1, 10.0), ("Scheduled", 1, 2.25)]))

        # ---------- 2. backlog-hours-by-work-center ----------
        _, bhwc = api.get("/api/reports/backlog-hours-by-work-center", exact_q)
        oracle = sql_backlog_hours(EXACT)
        api_bhwc = sorted([(r["workCenterCode"], r["openWorkOrderCount"], round(r["backlogHours"], 4)) for r in bhwc])
        record("backlog-hours-by-work-center (API = base-table SQL)", api_bhwc == sorted(oracle),
               f"api={api_bhwc} oracle={oracle}")
        record("backlog-hours hand-computed (MECH 2/5.75, ELEC 1/10, INST 0/0)",
               api_bhwc == sorted([("ELEC", 1, 10.0), ("INST", 0, 0.0), ("MECH", 2, 5.75)]))

        # ---------- 3. pm-compliance (the hand case + cyclesInWindow-free denominator) ----------
        _, pm = api.get("/api/reports/pm-compliance", {**exact_q, "year": 2026, "month": 8})
        sched, comp = sql_pm_compliance(EXACT_PLAN, 2026, 8)
        print("  HAND pm-compliance:")
        print("    plan R7-PLAN start 2026-06-15, interval 1 Months, end 2026-12-15, 1 target")
        print("    target month 2026-08 -> cycles 06-15,07-15,[08-15],09-15,... => 1 due in window")
        print(f"    scheduledPM = 1 cycle x 1 target = 1; completedPM (R7-PM-001 cycle 2026-08-15) = 1")
        print("    complianceRate = 1/1 x 100 = 100.00")
        record("pm-compliance scheduledPM (API = generate_series SQL = hand 1)", pm["scheduledPM"] == sched == 1,
               f"api={pm['scheduledPM']} sql={sched} hand=1")
        record("pm-compliance completedPM (API = SQL = hand 1)", pm["completedPM"] == comp == 1,
               f"api={pm['completedPM']} sql={comp} hand=1")
        record("pm-compliance complianceRate (API = 100.0)", approx(pm["complianceRate"], 100.0), str(pm["complianceRate"]))
        record("pm-compliance excludedMeterPlans = 0", pm["excludedMeterPlans"] == 0)

        # ---------- 4. mtbf ----------
        _, mtbf = api.get("/api/reports/mtbf", exact_q)
        oracle = sql_mtbf(EXACT)
        api_mtbf = sorted([(r["equipmentId"], round(r["mtbfHours"], 4), r["breakdownCount"]) for r in mtbf])
        print("  HAND mtbf: M-1002 EM 2026-08-01..08-10 (9d=216h) minus 2h+1h downtime / (2-1) = 213.0h")
        record("mtbf (API = base-table SQL = hand 213.0 / n=2)", api_mtbf == sorted(oracle) and api_mtbf == [(ids['eq_m'], 213.0, 2)],
               f"api={api_mtbf} oracle={oracle}")

        # ---------- 5. mttr ----------
        _, mttr = api.get("/api/reports/mttr", exact_q)
        oe, ol, excl = sql_mttr(EXACT)
        api_me = sorted([(r["equipmentId"], round(r["mttrHours"], 4), r["breakdownCount"]) for r in mttr["byEquipment"]])
        api_ml = sorted([(r["functionalLocationId"], round(r["mttrHours"], 4), r["breakdownCount"]) for r in mttr["byLocation"]])
        record("mttr byEquipment (API = base-table SQL = hand 1.5h / n=2)",
               api_me == sorted(oe) and api_me == [(ids['eq_m'], 1.5, 2)], f"api={api_me} oracle={oe}")
        record("mttr byLocation (API = base-table SQL = hand R7-LOC 1.5h / n=2)",
               api_ml == sorted(ol) and api_ml == [(LOC, 1.5, 2)], f"api={api_ml} oracle={ol}")
        record("mttr excludedIncomplete = 0", mttr["excludedIncomplete"] == excl == 0)

        # ---------- 6. downtime ----------
        _, dt = api.get("/api/reports/downtime", exact_q)
        oracle = sql_downtime(EXACT)
        api_dt = sorted([(r["equipmentId"], round(r["totalDowntimeHours"], 4), r["workOrderCount"]) for r in dt])
        record("downtime (API = base-table SQL = hand M-1002 3.0h / n=2)",
               api_dt == sorted(oracle) and api_dt == [(ids['eq_m'], 3.0, 2)], f"api={api_dt} oracle={oracle}")

        # ---------- 7. cost-summary ----------
        _, cs = api.get("/api/reports/cost-summary", {**exact_q, "year": 2026, "month": 10})
        oracle = sql_cost_by_center(EXACT, oct_from, oct_to)
        api_cc = [(r["costCenterCode"], round(r["plannedCost"], 4), round(r["actualCost"], 4), r["workOrderCount"]) for r in cs["byCostCenter"]]
        print("  HAND cost-summary (derived, rate 20):")
        print("    em     lab 4x20 + mat(2x10+4x5.5) + svc 75 = 197.00 / act 2.5x20 + (2x10+3x5.5) + 75 = 161.50")
        print("    open1  3.5x20 = 70 | open2  2.25x20 = 45  -> R7-CC-A 312.00 / 161.50 / 3")
        print("    em2 0 | pm 2x20 = 40                    -> R7-CC-B  40.00 /   0.00 / 2")
        print("    open3  10x20 = 200                      -> R7-CC-C 200.00 /   0.00 / 1")
        record("cost-summary byCostCenter (API = base-table SQL = hand)",
               api_cc == sorted(oracle) and api_cc == [("R7-CC-A", 312.0, 161.5, 3),
                                                       ("R7-CC-B", 40.0, 0.0, 2),
                                                       ("R7-CC-C", 200.0, 0.0, 1)],
               f"api={api_cc} oracle={oracle}")
        tp, ta, tc = sql_cost_total(EXACT, oct_from, oct_to)
        loc_row = next((r for r in cs["byLocation"] if r["functionalLocationId"] == LOC), None)
        record("cost-summary location R7-LOC subtree (API = SQL = hand 552.00 / 161.50 / 6)",
               loc_row is not None and approx(loc_row["plannedCost"], tp) and approx(loc_row["actualCost"], ta)
               and loc_row["workOrderCount"] == tc and loc_row["workOrderCount"] == 6
               and approx(tp, 552.0) and approx(ta, 161.5),
               f"api={loc_row and (loc_row['plannedCost'], loc_row['actualCost'], loc_row['workOrderCount'])} sql={(tp, ta, tc)}")

        # ---------- 8. material-consumption ----------
        _, mc = api.get("/api/reports/material-consumption", {**exact_q, "year": 2026, "month": 10})
        om, ow, oe = sql_material(EXACT, oct_from, oct_to)
        api_m = sorted([(r["materialCode"], round(r["totalQuantityUsed"], 4), round(r["totalCost"], 4), r["usageCount"]) for r in mc["byMaterial"]])
        api_w = sorted([(r["woNumber"], round(r["totalQuantityUsed"], 4), round(r["totalCost"], 4), r["lineCount"]) for r in mc["byWorkOrder"]])
        api_e = sorted([(r["equipmentId"], round(r["totalQuantityUsed"], 4), round(r["totalCost"], 4), r["lineCount"]) for r in mc["byEquipment"]])
        record("material-consumption byMaterial (API = base-table SQL = hand)",
               api_m == sorted(om) and api_m == [("BEARING-6205", 2.0, 20.0, 1), ("GASKET-150", 3.0, 16.5, 1)],
               f"api={api_m} oracle={om}")
        record("material-consumption byWorkOrder (API = SQL = hand R7-EM-001 5 / 36.50 / 2)",
               api_w == sorted(ow) and api_w == [("R7-EM-001", 5.0, 36.5, 2)], f"api={api_w} oracle={ow}")
        record("material-consumption byEquipment (API = SQL = hand M-1002 5 / 36.50 / 2)",
               api_e == sorted(oe) and api_e == [(ids['eq_m'], 5.0, 36.5, 2)], f"api={api_e} oracle={oe}")

        # ---------- 9. top-cost-equipment ----------
        _, tc_rep = api.get("/api/reports/top-cost-equipment", exact_q)
        oracle = sql_top_cost(EXACT)
        api_tc = [(r["equipmentId"], r["workOrderCount"], round(r["plannedCost"], 4), round(r["actualCost"], 4), round(r["totalCost"], 4)) for r in tc_rep]
        print("  HAND top-cost (stored): M-1002 em120+em2(20 from planned)+pm70+o1 50 = 260 (n4); P-1001 20; C-1004 10")
        record("top-cost-equipment (API = base-table SQL = hand ordering 260/20/10)",
               api_tc == sorted(oracle, key=lambda x: (-x[4], x[0])) and api_tc == [(ids['eq_m'], 4, 240.0, 120.0, 260.0),
                                                                                    (ids['eq_p'], 1, 20.0, 0.0, 20.0),
                                                                                    (ids['eq_c'], 1, 10.0, 0.0, 10.0)],
               f"api={api_tc} oracle={oracle}")

        # ---------- 10. notifications-awaiting-conversion ----------
        _, na = api.get("/api/reports/notifications-awaiting-conversion", exact_q)
        byp, total, oldest = sql_notifications(EXACT)
        api_p = {r["priority"]: r["count"] for r in na["byPriority"]}
        record("notifications-awaiting total/byPriority (API = base-table SQL = hand 3)",
               total == na["total"] == 3 and api_p == byp and api_p == {"High": 1, "Medium": 1, "Low": 1},
               f"api={api_p} sql={byp}")
        expected_age = None
        if oldest:
            dt = datetime.strptime(oldest[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            expected_age = int((datetime.now(timezone.utc) - dt).total_seconds() // 86400)
        record("notifications-awaiting oldestAgeDays (API = age of SQL oldest, naive-as-UTC)",
               expected_age is not None and na["oldestAgeDays"] == expected_age,
               f"api={na['oldestAgeDays']} oldest={oldest} expected={expected_age}")

        # ---------- 11. descendant-location probe (R.2) ----------
        _, bld = api.get("/api/reports/backlog", desc_q)
        od = sql_backlog(DESC)
        api_d = sorted(tupled(bld["byStatus"], ["status", "count", "totalPlannedHours"]))
        rec_d = api_d == sorted(od["byStatus"]) and api_d == [("Draft", 1, 3.5), ("In Progress", 1, 1.0),
                                                              ("Planned", 1, 10.0), ("Scheduled", 1, 2.25)]
        record("backlog includeDescendantLocations=true folds child (4 WOs / 16.75 h)", rec_d,
               f"api={api_d} oracle={od['byStatus']}")

        # ---------- 12. date-range probe (R.1) ----------
        _, bl_jan = api.get("/api/reports/backlog", {**exact_q, "from": "2026-01-01", "to": "2026-01-31"})
        empty = all(r["count"] == 0 for r in bl_jan["byStatus"]) and len(bl_jan["byStatus"]) == 0
        _, bl_oct = api.get("/api/reports/backlog", {**exact_q, "from": "2026-10-01", "to": "2026-10-31"})
        week = sum(r["count"] for r in bl_oct["byStatus"]) == 3
        record("backlog date range is applied (Jan outside = empty, Oct = 3)", empty and week,
               f"jan={len(bl_jan['byStatus'])} oct_total={sum(r['count'] for r in bl_oct['byStatus'])}")

        assert_no_views()
    finally:
        print("== fixture: remove ==")
        psql(CLEANUP_SQL, tuples=False)
        left = int(scalar("SELECT count(*) FROM \"WorkOrder\" WHERE \"workOrderId\" LIKE 'r7fix-%';"))
        record("fixture removed (no r7fix- work orders left)", left == 0, f"left={left}")

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"\nR7_EXIT {'PASS' if passed == total else 'FAIL'}  ({passed}/{total})")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
