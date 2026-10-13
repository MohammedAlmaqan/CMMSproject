# Gap register Ã¢â‚¬â€ every open item at 2026-10-08

One line per item, one category per item, and for anything under "Close now" a size
so the owner can see what closing it costs. Every entry was re-derived from source on
2026-10-08 (the same standard applied to the C8/C18 corrections); anything the code or
the decision register contradicted was reclassified and keeps an entry under its new
category. Nothing was dropped.

**Status changes are the owner's.** Where an entry implies a `SOW_COMPLIANCE.md` Status
should move (for example Ã‚Â§2.2 line 62, Ã‚Â§5.4 line 292), the register records the finding;
it does not rewrite the matrix.

**Citations.** Entries cite `docs/SOW_COMPLIANCE.md` by **line number** plus clause, not
by the "row N" numbering used in `verify_a1.py` and `OWNER_ACTION_SHEET.md` Ã¢â‚¬â€ those two
numberings differ (the dispositions log's "row 8" is Ã‚Â§3.1.4, which sits at line 91).
Line numbers are unambiguous.

**Sizes.** S = half a day or less; M = 1Ã¢â‚¬â€œ3 days; L = 4+ days or a cross-cutting
workstream. "Run window" means the work needs a target environment and a scheduled run,
not only desk time.

**Sources read.** `OWNER_ACTION_SHEET.md` (Tables 1Ã¢â‚¬â€œ2, notes, footnote), the open v1.1
backlog in `CMMS_FINALIZATION_TRACKER.md` (v1.1-1Ã¢â‚¬Â¦14), all 34 `Partial`/`Not Met` matrix
lines, `DECISION_REGISTER.md` (D-2Ã¢â‚¬Â¦D-19), `README.md` known issues, `FILL_REPORT.md`,
plus the backend routes/schema/middleware and the frontend pages/routes/services.

---

## A. Close now Ã¢â‚¬â€ code and data gap (12)

What it is, where it lives, size.

| ID | Item | Where it lives | Size |
|---|---|---|---|
| C1 | Session security end to end: server-side idle expiry, refresh rotation, logout that revokes the presented token, technician identity taken from the session rather than the request. `backend/src/routes/auth.ts` exposes only `POST /login` and `GET /me`; there is no refresh or logout route at all, so the `RefreshToken` model is unused for rotation and the JWT stays valid for its full 8 hours | OWNER_ACTION_SHEET Table 2 "Session security"; matrix lines 259 (Ã‚Â§4.2), 299 (Ã‚Â§5.5); `README.md:263` | L |
| C2 | Frontend access control: navigation and routes are not filtered by role. `app/src/components/layout/Sidebar.tsx` renders all 11 items for every role (matrix line 301), and `ProtectedRoute` checks authentication only (`app/src/App.tsx:24-27`); role is used only to gate data fetches (`appStore.ts:153-166`) | OWNER_ACTION_SHEET Table 2 "Frontend access control"; matrix line 301 (Ã‚Â§5.5) | M |
| C3 | Planning and intake screens Ã¢â‚¬â€ closed. `PreventiveMaintenancePage.tsx` now drives plan create/edit/delete (multi-target rows per D-10 and meter-threshold rows for Meter/Combined per SOW 3.4.2), plus a role-gated on-demand scheduler control; `NotificationsPage.tsx` gained the notification-intake form over the existing `POST /notifications`. Delivered `40cb3c3`, `8ed6f70`, `cf2f9c5` | Table 2 "Planning and intake screens"; matrix lines 38 (Ã‚Â§1.3), 52 (Ã‚Â§2.1), 61 (Ã‚Â§2.2) | Done |
| C4a | Master-data editing screens delivered (FL CRUD, BOM add/edit/remove, meters add/edit/remove). Cost-split editor screen remains deferred (N1); only these three screens were implemented. | Table 2 "Master-data editing and bulk access"; matrix line 59 (§2.2) | Done |
| C4b | JSON bulk endpoint for Functional Locations: `functionalLocations.ts:275`/`:394` are single-row, so there is no bulk import/export path | Matrix line 295 (Ã‚Â§5.4) | M |
| C4c | OData-style query grammar: no `$filter`/`$top` anywhere, conventional `skip`/`take` only | Matrix line 296 (Ã‚Â§5.4) | M |
| C6 | Audit completeness: per-column old/new values on the handlers that lack them, enforced at the middleware boundary, plus the configurable 7-year purge job. Measured 2026-10-08: 5 route files with `PUT` routes import neither `logFieldChanges` nor `logAuditFieldChange` (alerts, externalServiceCosts, safetyChecklists, workOrderCostSplits, workOrderMaterials Ã¢â‚¬â€ 7 handlers), `auditMiddleware` is exported at `backend/src/middleware/audit.ts:119` and never used, and no purge/retention job exists (matrix line 264: the 7-year default is a seed comment only) | Table 2 "Audit completeness"; matrix lines 55 (Ã‚Â§2.1), 264 (Ã‚Â§4.3), 289, 290 (Ã‚Â§5.3) | L |
| C9 | "View assigned" not enforced: `GET /api/work-orders` builds `where` with no assignment scoping (`workOrders.ts:97-131`), so every holder sees every work order | Matrix line 63 (Ã‚Â§2.2) | M |
| C10 | Unauthenticated `/api/health/scheduler` exposes plan counts and last-run state; the handler carries no `authenticate` and `apiRouter` has no global auth middleware (`index.ts:225`) | Matrix line 300 (Ã‚Â§5.5) | S |
| C11 | Scheduler runs as an in-process singleton (`index.ts:308-309` starts it; advisory-lock startup), so tier scaling and scheduler correctness are unreconciled; the Ã‚Â§5.1 report-generation limb is also absent | Matrix lines 255 (Ã‚Â§4.1), 281 (Ã‚Â§5.1) | L |
| C13 | Total recovery time: measured. DB restore + attachments + app layer = 9.11 s (app 0.36 s) on live stack using backup cmms-2026-09-29-1659.sql with paired uploads; WorkOrder 189, attachment snapshot verified, drill DB dropped. Script ready and exercised. | Table 2 "Total recovery time"; matrix line 263 (Ã‚Â§4.3) | Done |
| C19 | Settings screen made accurate. The duplicate "Audit Log Retention" static row is removed (the value is shown once, as the editable `audit_retention_years` setting); the "PM Scheduler" row no longer claims 06:00 - it states the server cron default (02:00, `PM_SCHEDULER_CRON`) and that it is not configurable here; and the remaining fixed rows (session timeout, upload limit, password policy, language) carry accurate descriptions under a "Read-only (fixed configuration)" label. No values are newly enforced. | Found on my own; `README.md:264` | Done |

## B. Close now Ã¢â‚¬â€ documentation gap (4)

| ID | Item | Where it lives | Size |
|---|---|---|---|
| D1 | Documentation accuracy sweep Ã¢â‚¬â€ one entry, with what it covers: the five stale limitation-register claims named in OWNER_ACTION_SHEET note 8 (no task-list screen Ã¢â‚¬â€ `TaskListsPage.tsx` exists; no meter/combined PM strategy Ã¢â‚¬â€ `scheduler.ts:111` evaluates all three; hard-coded generated status; read-only BOM/cost-split lines Ã¢â‚¬â€ both have write endpoints; no system-generated alerts Ã¢â‚¬â€ all four fire); the stale Table 1 asks (item 1 "no failure field" Ã¢â‚¬â€ `WorkOrder.failureCodeId` exists at `schema.prisma:372`, delivered `1e4b28c`; item 5 "trial-run report missing" Ã¢â‚¬â€ delivered `c81bc3d`; item 6 Ã¢â‚¬â€ decided 2026-10-05, see N9; item 7 Ã¢â‚¬â€ answered by D-7) and the "Seven items need your answer" header; `README.md:262` ("200-user load test remains post-go-live" Ã¢â‚¬â€ the run passed 2026-10-03 and GO was approved), `README.md:265` and `README.md:266` figures; the value-domain comments in `schema.prisma` against the C15 CHECK constraints Ã¢â‚¬â€ closing C15 (`50ff911`, run 241) found two drifts, `SystemAlert.alertType` omitting `Account_Lockout` and `Comment.entityType` omitting `MaintenancePlan`; both comments were corrected at `3ea1b30` (run 242) and all 24 pinned domains now match their comments, so this is the standing re-check rather than an open correction; the tracker's teardown figure Ã¢â‚¬â€ R.9 D3-cleanup-errors and the Phase R close-out still read 68 across 13, but the count re-derived from source and verified by the C14 closure is **54 in 12** (`fd86709`); the stale matrix citations `index.ts:172-192` (line 297) and `workOrders.ts:567` (line 126; declaration is `:752`, applied `:835`) plus the `verify_a1.py` line ranges; and the Table 2 "Migration tooling" wording that reads as if the live importers were done (they are harness-only, see C5); and the unrefreshed `docs/openapi.json` snapshot (a manual re-export, last changed `5aa0094`, still listing the old action set and no `Blocked`, with no gate that regenerates it Ã¢â‚¬â€ a dated stale snapshot to be refreshed, not silently half-patched) | Table 2 "Documentation accuracy sweep"; tracker v1.1-8 (partially exercised `f58e478`) | L |
| D3 | Matrix Ã‚Â§2.2 line 62's note ("the Close permission is not enforced server-side") is stale: `requireSupervisorForClose` is declared at `workOrders.ts:752`, applied at `:835` after `validate(...)`, landed `206e1de`, and is asserted by `workOrders.test.ts:224-249` (Technician 403, Supervisor 200); Ã‚Â§3.3.2 line 126 is `Met` on that evidence. The note is the only basis for line 62's `Partial`, so the Status is the owner's call | Matrix line 62 (Ã‚Â§2.2) | S (edit) |
| D4 | Matrix Ã‚Â§5.4 line 292's limbs are contradicted: BOM lines have `POST`/`PUT`/`DELETE` (`equipment.ts:963`/`:1049`/`:1114`), cost splits are created and soft-deleted (`workOrderCostSplits.ts:256`), and plan meters are written in the plan `PUT` (`maintenancePlans.ts:509-513`) Ã¢â‚¬â€ so "deletes are absent on several entities" and "child collections are read-only" no longer hold for master data or work orders. Residual deletes genuinely absent: `SystemAlert`, checklist templates, meter readings, system config Ã¢â‚¬â€ none of which is master data or a work order. Status is the owner's call | Matrix line 292 (Ã‚Â§5.4) | S (edit) |
| D5 | Tracker v1.1-6's premise is wrong on the current tree: there is no audit-log action filter dropdown in `AdministrationPage.tsx` (only a free-text filter at line 128, which already matches on `action`, so `Blocked` entries are isolable today). What is stale is the v1.1-6 wording itself and the swagger `action` description at `auditLog.ts:37`, which lists Create/Update/Delete/Run while `AuditAction` includes `Blocked` (`middleware/audit.ts:6`) and five routes write it (labor `:152`/`:285`, notifications `:413`, workOrders `:862`/`:900`) | Tracker v1.1-6 | S |

## C. Blocked on owner (0)

Empty since 2026-10-09 Ã¢â‚¬â€ all four owner items (B1Ã¢â‚¬â€œB4) are resolved. B1 was
reclassified to close-now work, B2 and B3 were accepted, and B4 was applied
(see the closure log and Reclassifications).

## D. Blocked on external (1)

| ID | Item | Where it lives |
|---|---|---|
| E1 | TLS termination and reverse-proxy configuration, and the IIS reverse-proxy deployment executed end to end Ã¢â‚¬â€ needs a host matching production, which is not held | `README.md:267`, `README.md:268` |

## E. Decision, not gap (10)

| ID | Item | Where it lives | Decision |
|---|---|---|---|
| N1 | Cost-split editor screen (allocation is implemented, tested and reachable by API) | Tracker v1.1-9; matrix line 175 (Ã‚Â§3.5.2); Table 1 item 2 | Owner, 2026-10-04 |
| N2 | Accessibility remediation: command-palette focus trap, repeated aria-labels on the work-order detail rows, chart tick contrast, title-only icon names | Tracker v1.1-11Ã¢â‚¬Â¦14; matrix line 265 (Ã‚Â§4.4); Table 2 "Accessibility polish" | Owner acceptance 2026-10-05 |
| N3 | `MaintenancePlan.functionalLocationId` remains a plain scalar with no relation/FK, mitigated not removed | Matrix line 291 (Ã‚Â§5.3) | D-10 / F3 (`638dbd6`) |
| N4 | Mobile/tablet viewport and ERP integration not delivered | Matrix lines 39 (Ã‚Â§1.3), 38 mobile limb | D-6; Client decision (ERP, line 39) |
| N5 | Deployable container artifacts excluded Ã¢â‚¬â€ delivery is a source-and-pipeline handoff | Matrix line 316 (Ã‚Â§6.1) | Client decision recorded at line 316 |
| N6 | Meter readings and meter columns out of scope for the sample | `FILL_REPORT.md` meter patch section | Owner decision recorded there |
| N7 | Availability monitoring / 99.5% and agreed maintenance windows carried as owned operational obligations | `DECISION_REGISTER.md` D-14, D-19 | D-14, D-19 |
| N8 | Per-user opt-out of specific alert types (and email delivery) is waived, so Table 2's "add per-user opt-out" is not fresh work | Matrix line 222 (Ã‚Â§3.8) Ã¢â‚¬â€ register row 74, phase H (email is row 73, line 221) | Waived, register rows 73/74 |
| N9 | Differential backup will not be built; transaction-log recovery is accepted as the mechanism and Ã‚Â§4.3 stays `Partial` as the direct consequence | Matrix line 261 (Ã‚Â§4.3); Table 1 item 6 | Owner, 2026-10-05 |
| N10 | Cause/failure code on a Notification: no Ã‚Â§3 clause requires it Ã¢â‚¬â€ matrix line 91 (Ã‚Â§3.1.4) records that treating it as a residual was an over-attribution, so building it needs a new owner decision | Tracker v1.1-10 | Needs a new owner decision |

---

## Corrections made while verifying (2026-10-08)

- **C7 Ã¢â€ â€™ D4.** "Deletes absent on several entities" did not survive contact with the
  routes; the write paths exist for every master-data child collection named.
- **C16 Ã¢â€ â€™ D5.** The audit action filter dropdown that v1.1-6 describes does not exist;
  free-text search already isolates `Blocked`.
- **C17 Ã¢â€ â€™ N10.** Matrix line 91 states plainly that the notification cause/failure limb
  is not required by any clause; it needs a new decision, not engineering.
- **B2 Ã¢â€ â€™ N9.** Row 261 records the owner's 2026-10-05 decision; the Action Sheet's item 6
  is the stale artefact.
- **C8 Ã¢â€ â€™ D3** and **C18 Ã¢â€ â€™ N8**, agreed earlier in this session.
- **Re-measured figures:** teardown sites 68 Ã¢â€ â€™ 55 (**superseded by the C14 closure** Ã¢â‚¬â€
  the count re-derived from source was **54** in 12 files; the 55th match was a comment,
  not a code site. See the closure log); lint 41 / 28+2 Ã¢â€ â€™ 43 / 29+2;
  advisories 9 / "no criticals" Ã¢â€ â€™ 10 / 1 critical; Settings static rows "5 of 7" Ã¢â€ â€™ 6 of 8.

## Reclassifications (2026-10-09)

- **B1 Ã¢â€ â€™ A.** Nothing is pending from the Client: the legacy dataset is held at
  `docs/migration-templates/dataset/`, and the 21 unfilled templates have no source
  rows (`migration-templates/FILL_REPORT.md` Ã‚Â§Scope). Not a blocker Ã¢â‚¬â€ executable
  migration-and-measurement work. Category A retitled "code and data gap".
- **B2 Ã¢â€ â€™ accepted and closed.** The owner accepted the Ã‚Â§3.5.2 cost-split-screen
  deferral for go-live on 2026-10-09, formalising the 2026-10-04 decision (matrix
  row 331). The screen itself remains v1.1 work (N1); nothing is added.
- **B3 Ã¢â€ â€™ accepted and closed.** The owner accepted the defect position (the four
  accessibility items, named and carried) for go-live on 2026-10-09, formalising
  the 2026-10-05 decision (matrix row 334). The items remain v1.1 work (N2);
  nothing is added.
- **B4 Ã¢â€ â€™ applied and closed.** The authorized orphan cleanup ran on 2026-10-09
  against the gate/test database (`cmms_gate`, the database a gate is evidence
  about) via `backend/scripts/r9d-orphan-clean.ts`, after a `pg_dump` backup of
  both `cmms` and `cmms_gate`. Deleted: 38 soft-deleted `TL-T*` fixture task
  lists (unreferenced by any plan) with the 114 `TaskList` audit rows that name
  them, plus 198/83/35 orphan audit rows on `WorkOrder`/`WorkOrderOperation`/
  `MaintenancePlan`. The register said 61 task lists; 38 remained Ã¢â‚¬â€ the count
  was re-derived from the database, not copied from earlier prose. Zero deleted
  ids are named by any test, script, or gate; the db-invariance check named
  exactly the 468 removed rows and nothing else, and the baseline was
  re-snapshot afterwards. The developer `cmms` database was clean and was not
  the target. Not a blocker; placeholder where in the phases fits was the
  closure log.

## Splits (2026-10-12)

- **C4 Ã¢â€ â€™ C4a / C4b / C4c (owner decision, 2026-10-12).** The single L-sized entry
  bundled three independent concerns: the master-data *screens* the existing write
  APIs lack (C4a), a JSON bulk endpoint for Functional Locations (C4b), and an
  OData-style query grammar (C4c). Only C4a is in scope this pass; C4b and C4c stay
  open, and matrix lines 295/296 stay `Partial` until they close. Category A goes
  10 Ã¢â€ â€™ 12 entries.

## Coverage check

*Updated 2026-10-10 (B1): matrix lines 40 (Ã‚Â§1.3), 307 (Ã‚Â§5.7) and 335 (Ã‚Â§6.4) are now `Met`, so the `Partial`/`Not Met` set is 31 lines, not 34, and entries **B1** and **D2** are closed (see the closure log). The original freeze-time mapping is kept below as the record it was.*

All 34 `Partial`/`Not Met` matrix lines **as at the freeze** map to exactly one entry above:
line 38Ã¢â€ â€™C3, 39Ã¢â€ â€™N4, 40Ã¢â€ â€™B1+D2, 52Ã¢â€ â€™C3, 53Ã¢â€ â€™D1, 54Ã¢â€ â€™D1, 55Ã¢â€ â€™C6, 56Ã¢â€ â€™D1, 59Ã¢â€ â€™C4a, 61Ã¢â€ â€™C3, 62Ã¢â€ â€™D3,
63Ã¢â€ â€™C9, 175Ã¢â€ â€™N1, 253Ã¢â€ â€™C12, 255Ã¢â€ â€™C11, 259Ã¢â€ â€™C1, 261Ã¢â€ â€™N9, 263Ã¢â€ â€™C13, 264Ã¢â€ â€™C6, 265Ã¢â€ â€™N2,
281Ã¢â€ â€™C11, 289Ã¢â€ â€™C6, 290Ã¢â€ â€™C6, 291Ã¢â€ â€™N3, 292Ã¢â€ â€™D4, 295Ã¢â€ â€™C4b, 296Ã¢â€ â€™C4c, 299Ã¢â€ â€™C1, 300Ã¢â€ â€™C10, 301Ã¢â€ â€™C2,
306Ã¢â€ â€™C5, 307Ã¢â€ â€™D2+B1, 316Ã¢â€ â€™N5, 335Ã¢â€ â€™B1.

All 13 Action Sheet Table 2 rows map to one entry: 1Ã¢â€ â€™C12, 2Ã¢â€ â€™C1, 3Ã¢â€ â€™C2, 4Ã¢â€ â€™C13, 5Ã¢â€ â€™C14,
6Ã¢â€ â€™D1, 7Ã¢â€ â€™C3, 8Ã¢â€ â€™C4a, 9Ã¢â€ â€™N8, 10Ã¢â€ â€™C6, 11Ã¢â€ â€™C5+D2 (**D2 closed 2026-10-10**), 12Ã¢â€ â€™N2, 13Ã¢â€ â€™C15.

All 10 open v1.1 backlog rows map to one entry: 4Ã¢â€ â€™C15, 6Ã¢â€ â€™D5, 7Ã¢â€ â€™C14, 8Ã¢â€ â€™D1, 9Ã¢â€ â€™N1,
10Ã¢â€ â€™N10, 11Ã¢â‚¬Â¦14Ã¢â€ â€™N2.

## Totals

12 code and data gaps Ã‚Â· 4 documentation gaps Ã‚Â· 0 blocked on owner Ã‚Â· 1 blocked on external Ã‚Â·
10 decisions-not-gap = **27 open items**.

Items found on my own and listed nowhere else before: C19, C20, C21, E1, D3, D4, D5.

---

## Closure log

Snapshot tables above stay frozen. Rows are appended as each item closes, and carry
the SHA and green CI run recorded when the item landed.

| ID | Closed | SHA | Run |
|---|---|---|---|
| C9 | 2026-10-09 | `446cfd5` | 223 |
| C10 | 2026-10-09 | `1590ffd` | 226 |
| D3 | 2026-10-09 | `10610cd` | 228 |
| D4 | 2026-10-09 | `c4875a9` | 229 |
| D5 | 2026-10-09 | `62b6185` | 229 |
| C2 | 2026-10-09 | `22c3b2e` | 232 |
| C6 | 2026-10-09 | `5f11e25` | 236 |
| B2 | 2026-10-09 | `16a02eb` | 238 |
| B3 | 2026-10-09 | `fede127` | 238 |
| B4 | 2026-10-09 | `4d2d7c7` | 239 |
| C13 | 2026-10-11 | `6cdabc9` | n/a |
| C15 | 2026-10-10 | `50ff911` | 241 |
| C14 | 2026-10-10 | `fd86709` | 243 |
| C20 | 2026-10-10 | `cfc6108` | 246 |
| C21 | 2026-10-10 | `ad93610` | 248 |
| C5 | 2026-10-10 | `eefcff1` | 252 |
| C12 | 2026-10-10 | `fd86b2b` | 254 |
| B1 | 2026-10-10 | `1971686` | 257 |
| D2 | 2026-10-10 | `1971686` | 257 |
| C19 | 2026-10-11 | `7174597` | 263 |
| C3 | 2026-10-12 | `cf2f9c5` | 267 |
| C4a | 2026-10-12 | `8add8d7` | 279 |
