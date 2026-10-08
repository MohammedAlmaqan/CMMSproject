# Gap register — every open item at 2026-10-08

One line per item, one category per item, and for anything under "Close now" a size
so the owner can see what closing it costs. Every entry was re-derived from source on
2026-10-08 (the same standard applied to the C8/C18 corrections); anything the code or
the decision register contradicted was reclassified and keeps an entry under its new
category. Nothing was dropped.

**Status changes are the owner's.** Where an entry implies a `SOW_COMPLIANCE.md` Status
should move (for example §2.2 line 62, §5.4 line 292), the register records the finding;
it does not rewrite the matrix.

**Citations.** Entries cite `docs/SOW_COMPLIANCE.md` by **line number** plus clause, not
by the "row N" numbering used in `verify_a1.py` and `OWNER_ACTION_SHEET.md` — those two
numberings differ (the dispositions log's "row 8" is §3.1.4, which sits at line 91).
Line numbers are unambiguous.

**Sizes.** S = half a day or less; M = 1–3 days; L = 4+ days or a cross-cutting
workstream. "Run window" means the work needs a target environment and a scheduled run,
not only desk time.

**Sources read.** `OWNER_ACTION_SHEET.md` (Tables 1–2, notes, footnote), the open v1.1
backlog in `CMMS_FINALIZATION_TRACKER.md` (v1.1-1…14), all 34 `Partial`/`Not Met` matrix
lines, `DECISION_REGISTER.md` (D-2…D-19), `README.md` known issues, `FILL_REPORT.md`,
plus the backend routes/schema/middleware and the frontend pages/routes/services.

---

## A. Close now — code gap (16)

What it is, where it lives, size.

| ID | Item | Where it lives | Size |
|---|---|---|---|
| C1 | Session security end to end: server-side idle expiry, refresh rotation, logout that revokes the presented token, technician identity taken from the session rather than the request. `backend/src/routes/auth.ts` exposes only `POST /login` and `GET /me`; there is no refresh or logout route at all, so the `RefreshToken` model is unused for rotation and the JWT stays valid for its full 8 hours | OWNER_ACTION_SHEET Table 2 "Session security"; matrix lines 259 (§4.2), 299 (§5.5); `README.md:263` | L |
| C2 | Frontend access control: navigation and routes are not filtered by role. `app/src/components/layout/Sidebar.tsx` renders all 11 items for every role (matrix line 301), and `ProtectedRoute` checks authentication only (`app/src/App.tsx:24-27`); role is used only to gate data fetches (`appStore.ts:153-166`) | OWNER_ACTION_SHEET Table 2 "Frontend access control"; matrix line 301 (§5.5) | M |
| C3 | Planning and intake screens. `PreventiveMaintenancePage.tsx` exists with a plan list, filters and per-plan generate, and the APIs exist (`maintenancePlans.ts:292` `POST`, `:420` `PUT`, `:226` `POST /run-scheduler`), but there is no plan create/edit UI (`maintenancePlanService.ts` calls only list + generate), no on-demand scheduler control, and no notification-intake form anywhere in `app/src` (matrix line 64 names it) | Table 2 "Planning and intake screens"; matrix lines 38 (§1.3), 52 (§2.1), 61 (§2.2) | L |
| C4 | Master-data editing and bulk access. The write APIs exist — BOM `POST`/`PUT`/`DELETE` (`equipment.ts:963`, `:1049`, `:1114`), cost splits (`workOrderCostSplits.ts`), meters (`equipmentMeters.ts`), plan meters written inside the plan `PUT` (`maintenancePlans.ts:509-513`) — but no screen drives them; there is no JSON bulk endpoint for functional locations (`functionalLocations.ts:275`/`:394` are single-row) and no OData-style query grammar (no `$filter`/`$top` anywhere; conventional `skip`/`take` only) | Table 2 "Master-data editing and bulk access"; matrix lines 295, 296 (§5.4), 59 (§2.2) | L |
| C5 | Live-API importers for open work orders and functional locations. Only `POST /api/equipment/import.csv` (`equipment.ts:154`) and `POST /api/materials/import.csv` (`materials.ts:132`) exist; the work-order and location importers built at `dbd48af` are the database-free trial harness under `backend/src/migration-trial/` (`workOrder.ts:153`), not routes | Table 2 "Migration tooling"; matrix line 306 (§5.7) | M |
| C6 | Audit completeness: per-column old/new values on the handlers that lack them, enforced at the middleware boundary, plus the configurable 7-year purge job. Measured 2026-10-08: 5 route files with `PUT` routes import neither `logFieldChanges` nor `logAuditFieldChange` (alerts, externalServiceCosts, safetyChecklists, workOrderCostSplits, workOrderMaterials — 7 handlers), `auditMiddleware` is exported at `backend/src/middleware/audit.ts:119` and never used, and no purge/retention job exists (matrix line 264: the 7-year default is a seed comment only) | Table 2 "Audit completeness"; matrix lines 55 (§2.1), 264 (§4.3), 289, 290 (§5.3) | L |
| C9 | "View assigned" not enforced: `GET /api/work-orders` builds `where` with no assignment scoping (`workOrders.ts:97-131`), so every holder sees every work order | Matrix line 63 (§2.2) | M |
| C10 | Unauthenticated `/api/health/scheduler` exposes plan counts and last-run state; the handler carries no `authenticate` and `apiRouter` has no global auth middleware (`index.ts:225`) | Matrix line 300 (§5.5) | S |
| C11 | Scheduler runs as an in-process singleton (`index.ts:308-309` starts it; advisory-lock startup), so tier scaling and scheduler correctness are unreconciled; the §5.1 report-generation limb is also absent | Matrix lines 255 (§4.1), 281 (§5.1) | L |
| C12 | Write-path load measurement: the 200-VU run exercises the read path only, so no transactional-save percentile exists separately from reads (row 253 records the run; `scripts/k6/capacity.js` drives login + two GETs) | Table 2 "Write-path load measurement"; matrix line 253 (§4.1) | M + run window |
| C13 | Total recovery time: only the database restore is measured (5.35 s, ADMIN_GUIDE); host rebuild and attachment store are not | Table 2 "Total recovery time"; matrix line 263 (§4.3) | M + run window |
| C14 | Test hygiene: enforce the ban on swallowed teardown errors and clear the existing sites. Re-measured 2026-10-08: **55** exact `.catch(() => {})` sites across 13 test files (the recorded figure of 68 is stale); the enforcement instrument (ESLint rule vs gate grep) is still undecided | Table 2 "Test hygiene"; tracker v1.1-7 | M |
| C15 | Database constraints for status and type values: they live in zod/API schemas only. Migrations contain no `CREATE TYPE` at all and exactly one `CHECK` (`MaintenancePlanTarget_exactly_one_target`) | Table 2 "Database constraints"; tracker v1.1-4 | M |
| C19 | Settings screen is mostly static. 6 of the rows shown (session timeout, PM scheduler time, audit retention, upload limit, password policy, language) are hard-coded `SettingItem` markup at `AdministrationPage.tsx:393-398` with nothing enforcing those values; only the two number-prefix rows are backed by `system-config` | Found on my own; `README.md:264` | M |
| C20 | Lint debt. Re-measured 2026-10-08: backend `npx eslint .` = **43 errors, 0 warnings**; app = **29 errors, 2 warnings**. `README.md:266` records 41 / 28+2 measured 2026-10-02 | Found on my own; `README.md:266` | M |
| C21 | Dependency advisories with upgrades available. Re-measured 2026-10-08: backend `npm audit --omit=dev` = **10** (1 critical, 6 high, 3 moderate; `qs`/`body-parser`/`express`); app = **4** (3 high, 1 moderate; `react-router-dom`). Both report `npm audit fix`. `README.md:265` says 9 with "no criticals" | Found on my own; `README.md:265` | S/M |

## B. Close now — documentation gap (5)

| ID | Item | Where it lives | Size |
|---|---|---|---|
| D1 | Documentation accuracy sweep — one entry, with what it covers: the five stale limitation-register claims named in OWNER_ACTION_SHEET note 8 (no task-list screen — `TaskListsPage.tsx` exists; no meter/combined PM strategy — `scheduler.ts:111` evaluates all three; hard-coded generated status; read-only BOM/cost-split lines — both have write endpoints; no system-generated alerts — all four fire); the stale Table 1 asks (item 1 "no failure field" — `WorkOrder.failureCodeId` exists at `schema.prisma:372`, delivered `1e4b28c`; item 5 "trial-run report missing" — delivered `c81bc3d`; item 6 — decided 2026-10-05, see N9; item 7 — answered by D-7) and the "Seven items need your answer" header; `README.md:262` ("200-user load test remains post-go-live" — the run passed 2026-10-03 and GO was approved), `README.md:265` and `README.md:266` figures; the tracker's 68/13 teardown figure; the stale matrix citations `index.ts:172-192` (line 297) and `workOrders.ts:567` (line 126; declaration is `:752`, applied `:835`) plus the `verify_a1.py` line ranges; and the Table 2 "Migration tooling" wording that reads as if the live importers were done (they are harness-only, see C5) | Table 2 "Documentation accuracy sweep"; tracker v1.1-8 (partially exercised `f58e478`) | L |
| D2 | Migration runbook: no runbook file exists anywhere under `docs/`; the tooling and the trial-run report do | Matrix line 307 (§5.7), line 40 (§1.3); Table 2 "Migration tooling"; Table 1 item 5 | M |
| D3 | Matrix §2.2 line 62's note ("the Close permission is not enforced server-side") is stale: `requireSupervisorForClose` is declared at `workOrders.ts:752`, applied at `:835` after `validate(...)`, landed `206e1de`, and is asserted by `workOrders.test.ts:224-249` (Technician 403, Supervisor 200); §3.3.2 line 126 is `Met` on that evidence. The note is the only basis for line 62's `Partial`, so the Status is the owner's call | Matrix line 62 (§2.2) | S (edit) |
| D4 | Matrix §5.4 line 292's limbs are contradicted: BOM lines have `POST`/`PUT`/`DELETE` (`equipment.ts:963`/`:1049`/`:1114`), cost splits are created and soft-deleted (`workOrderCostSplits.ts:256`), and plan meters are written in the plan `PUT` (`maintenancePlans.ts:509-513`) — so "deletes are absent on several entities" and "child collections are read-only" no longer hold for master data or work orders. Residual deletes genuinely absent: `SystemAlert`, checklist templates, meter readings, system config — none of which is master data or a work order. Status is the owner's call | Matrix line 292 (§5.4) | S (edit) |
| D5 | Tracker v1.1-6's premise is wrong on the current tree: there is no audit-log action filter dropdown in `AdministrationPage.tsx` (only a free-text filter at line 128, which already matches on `action`, so `Blocked` entries are isolable today). What is stale is the v1.1-6 wording itself and the swagger `action` description at `auditLog.ts:37`, which lists Create/Update/Delete/Run while `AuditAction` includes `Blocked` (`middleware/audit.ts:6`) and five routes write it (labor `:152`/`:285`, notifications `:413`, workOrders `:862`/`:900`) | Tracker v1.1-6 | S |

## C. Blocked on owner (4)

| ID | Item | Where it lives |
|---|---|---|
| B1 | The Client's legacy dataset, and everything that can only come from it: the >99.9% accuracy figure on Client data, the full legacy load, and the 21 unfilled templates that arrive with it (`FILL_REPORT.md:26` "the other 21 templates") | Matrix lines 40 (§1.3), 307 (§5.7), 335 (§6.4); Table 1 item 5; DECISION_REGISTER "Client legacy data" dependency |
| B2 | Go-live acceptance of the remaining partial functional requirement. Table 1 item 3 named items 1 and 2; item 1 is delivered (`1e4b28c`), so the question is now the cost-split screen alone, which is already decided for v1.1 (N1) | Table 1 item 3 |
| B3 | Confirm the defect position is acceptable for go-live (the four accessibility items, named and carried) | Table 1 item 4 |
| B4 | Authorisation to delete the 61 orphan fixture task lists and the orphaned audit rows on `WorkOrder`/`WorkOrderOperation`/`MaintenancePlan` | OWNER_ACTION_SHEET footnote under Table 2 |

## D. Blocked on external (1)

| ID | Item | Where it lives |
|---|---|---|
| E1 | TLS termination and reverse-proxy configuration, and the IIS reverse-proxy deployment executed end to end — needs a host matching production, which is not held | `README.md:267`, `README.md:268` |

## E. Decision, not gap (10)

| ID | Item | Where it lives | Decision |
|---|---|---|---|
| N1 | Cost-split editor screen (allocation is implemented, tested and reachable by API) | Tracker v1.1-9; matrix line 175 (§3.5.2); Table 1 item 2 | Owner, 2026-10-04 |
| N2 | Accessibility remediation: command-palette focus trap, repeated aria-labels on the work-order detail rows, chart tick contrast, title-only icon names | Tracker v1.1-11…14; matrix line 265 (§4.4); Table 2 "Accessibility polish" | Owner acceptance 2026-10-05 |
| N3 | `MaintenancePlan.functionalLocationId` remains a plain scalar with no relation/FK, mitigated not removed | Matrix line 291 (§5.3) | D-10 / F3 (`638dbd6`) |
| N4 | Mobile/tablet viewport and ERP integration not delivered | Matrix lines 39 (§1.3), 38 mobile limb | D-6; Client decision (ERP, line 39) |
| N5 | Deployable container artifacts excluded — delivery is a source-and-pipeline handoff | Matrix line 316 (§6.1) | Client decision recorded at line 316 |
| N6 | Meter readings and meter columns out of scope for the sample | `FILL_REPORT.md` meter patch section | Owner decision recorded there |
| N7 | Availability monitoring / 99.5% and agreed maintenance windows carried as owned operational obligations | `DECISION_REGISTER.md` D-14, D-19 | D-14, D-19 |
| N8 | Per-user opt-out of specific alert types (and email delivery) is waived, so Table 2's "add per-user opt-out" is not fresh work | Matrix line 222 (§3.8) — register row 74, phase H (email is row 73, line 221) | Waived, register rows 73/74 |
| N9 | Differential backup will not be built; transaction-log recovery is accepted as the mechanism and §4.3 stays `Partial` as the direct consequence | Matrix line 261 (§4.3); Table 1 item 6 | Owner, 2026-10-05 |
| N10 | Cause/failure code on a Notification: no §3 clause requires it — matrix line 91 (§3.1.4) records that treating it as a residual was an over-attribution, so building it needs a new owner decision | Tracker v1.1-10 | Needs a new owner decision |

---

## Corrections made while verifying (2026-10-08)

- **C7 → D4.** "Deletes absent on several entities" did not survive contact with the
  routes; the write paths exist for every master-data child collection named.
- **C16 → D5.** The audit action filter dropdown that v1.1-6 describes does not exist;
  free-text search already isolates `Blocked`.
- **C17 → N10.** Matrix line 91 states plainly that the notification cause/failure limb
  is not required by any clause; it needs a new decision, not engineering.
- **B2 → N9.** Row 261 records the owner's 2026-10-05 decision; the Action Sheet's item 6
  is the stale artefact.
- **C8 → D3** and **C18 → N8**, agreed earlier in this session.
- **Re-measured figures:** teardown sites 68 → 55; lint 41 / 28+2 → 43 / 29+2;
  advisories 9 / "no criticals" → 10 / 1 critical; Settings static rows "5 of 7" → 6 of 8.

## Coverage check

All 34 `Partial`/`Not Met` matrix lines map to exactly one entry above:
line 38→C3, 39→N4, 40→B1+D2, 52→C3, 53→D1, 54→D1, 55→C6, 56→D1, 59→C4, 61→C3, 62→D3,
63→C9, 175→N1, 253→C12, 255→C11, 259→C1, 261→N9, 263→C13, 264→C6, 265→N2,
281→C11, 289→C6, 290→C6, 291→N3, 292→D4, 295→C4, 296→C4, 299→C1, 300→C10, 301→C2,
306→C5, 307→D2+B1, 316→N5, 335→B1.

All 13 Action Sheet Table 2 rows map to one entry: 1→C12, 2→C1, 3→C2, 4→C13, 5→C14,
6→D1, 7→C3, 8→C4, 9→N8, 10→C6, 11→C5+D2, 12→N2, 13→C15.

All 10 open v1.1 backlog rows map to one entry: 4→C15, 6→D5, 7→C14, 8→D1, 9→N1,
10→N10, 11…14→N2.

## Totals

16 code gaps · 5 documentation gaps · 4 blocked on owner · 1 blocked on external ·
10 decisions-not-gap = **36 open items**.

Items found on my own and listed nowhere else before: C19, C20, C21, E1, D3, D4, D5.
