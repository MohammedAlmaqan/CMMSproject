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
| 2 | `fix(reports): clamp MTBF, report null intervals and count open breakdowns` | done `1765c0a` |
| 3 | `test(uat): automate the zero-to-hero acceptance pass` | done `43d328c` |

## Part 1 — reporting fixes

- [x] MTBF: join equipment, emit `equipmentCode` + `equipmentName`, fall back to the code for a soft-deleted asset
- [x] MTTR `byEquipment`: same join and labels
- [x] Downtime: same join and labels
- [x] MTBF: clamp at zero
- [x] MTBF: `mtbfHours` is `null` when there is no interval between failures
- [x] MTBF: `excludedIncomplete` counts breakdowns still open, and the UI says so
- [x] OpenAPI: correct `mtbfDays`/`failureCount`, `downtimeHours`, and the "reported and completed" wording
- [x] `reports.test.ts`: MTBF, downtime and label assertions (none existed)
- [x] `reportsViews.test.ts`: label agreement with the views
- [x] `ReportsPage.test.tsx`: axis carries the code, not the UUID
- [x] backend typecheck + full backend suite green
- [x] app typecheck + full app suite green

## Part 2 — UAT environment

- [x] fresh `pg_dump` of `cmms` immediately before testing
- [x] restore into `cmms_uat`
- [x] row counts match `cmms` exactly (WorkOrder, Notification, Equipment, User, AuditLogEntry, RefreshToken)
- [x] API on 4100 against `cmms_uat`
- [x] built `app/dist` on 3000 proxying to 4100 (never the vite dev server: it proxies to live 4000)

## Part 3 — UAT execution

- [x] S0 preflight
- [x] S1 master data: location → equipment → work centre, linked
- [x] S2 lifecycle: M1 notification → WO → operation → scheduled → executed → closed
- [x] S3a WO without operations refused (409)
- [x] S3b scheduling without dates refused (400)
- [x] S3c M3 completion confirmation not convertible (400)
- [x] S4 reports: no UUID on any axis, math recomputed independently, Excel carries the code
- [x] S5 RBAC: lower role blocked from Administration and from `/api/users`, `/api/audit-log`
- [x] S6 evidence written, environment torn down

Result: **81 passed, 0 failed**, 0 console errors, 0 failed page responses
(`docs/screenshots/uat_v1.7.1/UAT_S0_S6_REPORT.md`).

The S4 clamp fixture overlaps by a fraction of a second (`spanHours=0.0001`,
`repairHours=0.0003`), because both work-order transitions run inside one pass.
That confirms the path end-to-end — the intermediate uptime really is negative —
but at that magnitude rounding to two places would also print 0, so the fixture
does not by itself distinguish the clamp from rounding. The magnitude proof is
the backend unit test `reports.test.ts` "clamps an overlapping-repair interval at
zero instead of going negative", which seeds two failures an hour apart with
six-hour repairs each: unclamped that is -11 h, and the handler reports 0.

## Part 4 — close-out

- [x] live `cmms` proven untouched (`admin.lastLogin`, `AuditLogEntry`,
      `RefreshToken`) — see `docs/screenshots/uat_v1.7.1/LIVE_SAFETY.md`.
      Nothing in live carries a 2026-11-17 timestamp and live holds zero
      `UAT171-*` fixtures. Live did move on 2026-11-16 13:18–13:48 UTC (+18
      audit rows, +2 tokens, all updates/PM runs, no records created), which is
      recorded there as an open discrepancy, not attributed to this pass.
- [x] `cmms_uat` dropped, ports 3000/4100 free
- [x] UAT suite and evidence committed
- [x] pushed to `origin/main`, CI green — run 44046148582, Backend / Frontend /
      Installer all success
