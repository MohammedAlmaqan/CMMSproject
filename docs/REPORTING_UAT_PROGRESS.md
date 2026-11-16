# Reporting fixes and UAT — progress ledger

Started 2026-11-16. Owner approved all four decisions (A labels, B math, C
throwaway `cmms_uat`, D execute S0-S6).

This file exists so a session limit cannot lose the position: every step is
ticked only once its command has actually run, and each commit below is a
restore point.

## Commits

| # | Subject | State |
|---|---|---|
| 1 | `fix(reports): name equipment on the MTBF, MTTR and downtime rows` | done `9692dea` |
| 2 | `fix(reports): clamp MTBF, report null intervals and count open breakdowns` | pending |
| 3 | `test(uat): automate the zero-to-hero acceptance pass` | pending |

## Part 1 — reporting fixes

- [x] MTBF: join equipment, emit `equipmentCode` + `equipmentName`, fall back to the code for a soft-deleted asset
- [x] MTTR `byEquipment`: same join and labels
- [x] Downtime: same join and labels
- [ ] MTBF: clamp at zero
- [ ] MTBF: `mtbfHours` is `null` when there is no interval between failures
- [ ] MTBF: `excludedIncomplete` counts breakdowns still open, and the UI says so
- [ ] OpenAPI: correct `mtbfDays`/`failureCount`, `downtimeHours`, and the "reported and completed" wording
- [x] `reports.test.ts`: MTBF, downtime and label assertions (none existed)
- [x] `reportsViews.test.ts`: label agreement with the views
- [x] `ReportsPage.test.tsx`: axis carries the code, not the UUID
- [ ] backend typecheck + full backend suite green
- [ ] app typecheck + full app suite green

## Part 2 — UAT environment

- [ ] fresh `pg_dump` of `cmms` immediately before testing
- [ ] restore into `cmms_uat`
- [ ] row counts match `cmms` exactly (WorkOrder, Notification, Equipment, User, AuditLogEntry, RefreshToken)
- [ ] API on 4100 against `cmms_uat`
- [ ] built `app/dist` on 3000 proxying to 4100 (never the vite dev server: it proxies to live 4000)

## Part 3 — UAT execution

- [ ] S0 preflight
- [ ] S1 master data: location → equipment → work centre, linked
- [ ] S2 lifecycle: M1 notification → WO → operation → scheduled → executed → closed
- [ ] S3a WO without operations refused (409)
- [ ] S3b scheduling without dates refused (400)
- [ ] S3c M3 completion confirmation not convertible (400)
- [ ] S4 reports: no UUID on any axis, math recomputed independently, Excel carries the code
- [ ] S5 RBAC: lower role blocked from Administration and from `/api/users`, `/api/audit-log`
- [ ] S6 evidence written, environment torn down

## Part 4 — close-out

- [ ] live `cmms` proven untouched (`admin.lastLogin`, `AuditLogEntry`, `RefreshToken`)
- [ ] `cmms_uat` dropped, ports 3000/4100 free
- [ ] UAT suite and evidence committed
- [ ] pushed to `origin/main`, CI green
