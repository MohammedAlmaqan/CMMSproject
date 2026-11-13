# UAT v1.7.0 - API and report arithmetic

Generated: 2026-11-13T09:58:41.048069+00:00

Result: **19 passed, 0 failed**

| Check | Result | Detail |
|---|---|---|
| report backlog: HTTP 200 | PASS | status=200 size=3 |
| report pm-compliance: HTTP 200 | PASS | status=200 size=6 |
| report mtbf: HTTP 200 | PASS | status=200 size=2 |
| report mttr: HTTP 200 | PASS | status=200 size=3 |
| report cost-summary: HTTP 200 | PASS | status=200 size=1 |
| report downtime: HTTP 200 | PASS | status=200 size=4 |
| report material-consumption: HTTP 200 | PASS | status=200 size=1 |
| report backlog-hours-by-work-center: HTTP 200 | PASS | status=200 size=14 |
| report top-cost-equipment: HTTP 200 | PASS | status=200 size=10 |
| report notifications-awaiting-conversion: HTTP 200 | PASS | status=200 size=3 |
| mtbf: HTTP 200 and array | PASS | status=200 rows=2 |
| mtbf: exact match against report_mtbf_by_equipment | PASS | equipment=2 mismatches=0 extra=0 |
| cost-summary: HTTP 200 and expected keys | PASS | status=200 period=2026-11 |
| cost-summary: exact match against direct cost SQL | PASS | period=2026-11 costCentres=1 mismatches=0 extra=0 |
| cost-summary: total planned and actual agree | PASS | planned api=1829.96 sql=1829.96; actual api=118.96 sql=118.96 |
| material-consumption: HTTP 200 and byMaterial | PASS | status=200 materials=1 |
| material-consumption: exact match against direct SQL | PASS | materials=1 mismatches=0 extra=0 |
| material-consumption: totals agree | PASS | qty api=2.0 sql=2.0; cost api=38.96 sql=38.96 |
| cost spot-check: derived cost = labour + materials + services | PASS | WO-001668 planned 118.96 vs 118.96; actual 118.96 vs 118.96 |

## MTBF
API rows: 2; direct-SQL equipment: 2
Sample: d48b115a=0h/1bd, 7b0922ba=0h/1bd
Mismatches: 0

## Cost Summary
Period: 2026-11
Cost centres: 1
Planned total: API 1829.96 / SQL 1829.96
Actual total:  API 118.96 / SQL 118.96

## Material Consumption
Materials: 1
Quantity total: API 2.0 / SQL 2.0
Cost total:     API 38.96 / SQL 38.96

## Cost spot-check
WO-001668: labour p/a 80.00/80.00, materials p/a 38.96/38.96, services 0
recomputed planned 118.96 vs view 118.96; actual 118.96 vs view 118.96
