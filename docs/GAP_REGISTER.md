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

## A. Close now — code and data gap (13)

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
| C19 | Settings screen is mostly static. 6 of the rows shown (session timeout, PM scheduler time, audit retention, upload limit, password policy, language) are hard-coded `SettingItem` markup at `AdministrationPage.tsx:393-398` with nothing enforcing those values; only the two number-prefix rows are backed by `system-config` | Found on my own; `README.md:264` | M |
| B1 | Legacy migration accuracy: the Client dataset **is** held at `docs/migration-templates/dataset/` (2,259 open-WO rows, 6,163 equipment, 5,954 materials), so the full legacy load and the >99.9% accuracy figure on Client data are executable. The 21 unfilled templates are **not** a gap: `FILL_REPORT.md` §Scope records that they have no source rows or are deliberately deferred (meter patch). **Reclassified from "Blocked on owner" 2026-10-09** — nothing is pending from the Client | Matrix lines 40 (§1.3), 307 (§5.7), 335 (§6.4); Table 1 item 5; `migration-templates/TRIAL_RUN_REPORT.md`; `migration-templates/FILL_REPORT.md` §Scope | M + run window |

## B. Close now — documentation gap (5)

| ID | Item | Where it lives | Size |
|---|---|---|---|
| D1 | Documentation accuracy sweep — one entry, with what it covers: the five stale limitation-register claims named in OWNER_ACTION_SHEET note 8 (no task-list screen — `TaskListsPage.tsx` exists; no meter/combined PM strategy — `scheduler.ts:111` evaluates all three; hard-coded generated status; read-only BOM/cost-split lines — both have write endpoints; no system-generated alerts — all four fire); the stale Table 1 asks (item 1 "no failure field" — `WorkOrder.failureCodeId` exists at `schema.prisma:372`, delivered `1e4b28c`; item 5 "trial-run report missing" — delivered `c81bc3d`; item 6 — decided 2026-10-05, see N9; item 7 — answered by D-7) and the "Seven items need your answer" header; `README.md:262` ("200-user load test remains post-go-live" — the run passed 2026-10-03 and GO was approved), `README.md:265` and `README.md:266` figures; the tracker's 68/13 teardown figure; the stale matrix citations `index.ts:172-192` (line 297) and `workOrders.ts:567` (line 126; declaration is `:752`, applied `:835`) plus the `verify_a1.py` line ranges; and the Table 2 "Migration tooling" wording that reads as if the live importers were done (they are harness-only, see C5); and the unrefreshed `docs/openapi.json` snapshot (a manual re-export, last changed `5aa0094`, still listing the old action set and no `Blocked`, with no gate that regenerates it — a dated stale snapshot to be refreshed, not silently half-patched) | Table 2 "Documentation accuracy sweep"; tracker v1.1-8 (partially exercised `f58e478`) | L |
| D2 | Migration runbook: no runbook file exists anywhere under `docs/`; the tooling and the trial-run report do | Matrix line 307 (§5.7), line 40 (§1.3); Table 2 "Migration tooling"; Table 1 item 5 | M |
| D3 | Matrix §2.2 line 62's note ("the Close permission is not enforced server-side") is stale: `requireSupervisorForClose` is declared at `workOrders.ts:752`, applied at `:835` after `validate(...)`, landed `206e1de`, and is asserted by `workOrders.test.ts:224-249` (Technician 403, Supervisor 200); §3.3.2 line 126 is `Met` on that evidence. The note is the only basis for line 62's `Partial`, so the Status is the owner's call | Matrix line 62 (§2.2) | S (edit) |
| D4 | Matrix §5.4 line 292's limbs are contradicted: BOM lines have `POST`/`PUT`/`DELETE` (`equipment.ts:963`/`:1049`/`:1114`), cost splits are created and soft-deleted (`workOrderCostSplits.ts:256`), and plan meters are written in the plan `PUT` (`maintenancePlans.ts:509-513`) — so "deletes are absent on several entities" and "child collections are read-only" no longer hold for master data or work orders. Residual deletes genuinely absent: `SystemAlert`, checklist templates, meter readings, system config — none of which is master data or a work order. Status is the owner's call | Matrix line 292 (§5.4) | S (edit) |
| D5 | Tracker v1.1-6's premise is wrong on the current tree: there is no audit-log action filter dropdown in `AdministrationPage.tsx` (only a free-text filter at line 128, which already matches on `action`, so `Blocked` entries are isolable today). What is stale is the v1.1-6 wording itself and the swagger `action` description at `auditLog.ts:37`, which lists Create/Update/Delete/Run while `AuditAction` includes `Blocked` (`middleware/audit.ts:6`) and five routes write it (labor `:152`/`:285`, notifications `:413`, workOrders `:862`/`:900`) | Tracker v1.1-6 | S |

## C. Blocked on owner (0)

Empty since 2026-10-09 — all four owner items (B1–B4) are resolved. B1 was
reclassified to close-now work, B2 and B3 were accepted, and B4 was applied
(see the closure log and Reclassifications).

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

## Reclassifications (2026-10-09)

- **B1 → A.** Nothing is pending from the Client: the legacy dataset is held at
  `docs/migration-templates/dataset/`, and the 21 unfilled templates have no source
  rows (`migration-templates/FILL_REPORT.md` §Scope). Not a blocker — executable
  migration-and-measurement work. Category A retitled "code and data gap".
- **B2 → accepted and closed.** The owner accepted the §3.5.2 cost-split-screen
  deferral for go-live on 2026-10-09, formalising the 2026-10-04 decision (matrix
  row 331). The screen itself remains v1.1 work (N1); nothing is added.
- **B3 → accepted and closed.** The owner accepted the defect position (the four
  accessibility items, named and carried) for go-live on 2026-10-09, formalising
  the 2026-10-05 decision (matrix row 334). The items remain v1.1 work (N2);
  nothing is added.
- **B4 → applied and closed.** The authorized orphan cleanup ran on 2026-10-09
  against the gate/test database (`cmms_gate`, the database a gate is evidence
  about) via `backend/scripts/r9d-orphan-clean.ts`, after a `pg_dump` backup of
  both `cmms` and `cmms_gate`. Deleted: 38 soft-deleted `TL-T*` fixture task
  lists (unreferenced by any plan) with the 114 `TaskList` audit rows that name
  them, plus 198/83/35 orphan audit rows on `WorkOrder`/`WorkOrderOperation`/
  `MaintenancePlan`. The register said 61 task lists; 38 remained — the count
  was re-derived from the database, not copied from earlier prose. Zero deleted
  ids are named by any test, script, or gate; the db-invariance check named
  exactly the 468 removed rows and nothing else, and the baseline was
  re-snapshot afterwards. The developer `cmms` database was clean and was not
  the target. Not a blocker; placeholder where in the phases fits was the
  closure log.

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

13 code and data gaps · 5 documentation gaps · 0 blocked on owner · 1 blocked on external ·
10 decisions-not-gap = **29 open items**.

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
| C15 | 2026-10-10 | `50ff911` | 241 |
| C14 | 2026-10-10 | `fd86709` | 243 |
| C20 | 2026-10-10 | `cfc6108` | 246 |
| C21 | 2026-10-10 | `ad93610` | 248 |

C9 also needed a test-isolation fix at `e3d87e6` (run 226): the seed's new home-centre
assignment exposed an unordered `workCenter.findFirst` in `workOrderAlerts.test.ts`.
Run 223 was green before that flake surfaced; run 226 is the first fully green tip.
`1590ffd` (C10) landed on a red run 225 that the `e3d87e6` fix cleared.
C9's matrix line-63 note correction (Technician "view assigned") landed at `e7c331b`
(run 230); the earlier line-62 Supervisor-Close correction is item D3 above.

C6 landed in three parts, so the table carries the tip (`5f11e25`, run 236) rather than
one SHA for the item. **C6a** (`c37f7a4`, run 233) added field-level old/new diffs on the
single-row write routes the register names; run 233 was red because
`tests/unit/auditFieldChanges.test.ts` enumerates every `AUDITED_FIELDS` key in its own
map, and the follow-up `3589324` (run 234) registered the new tables there. **C6b**
(`de73cf9`, run 235) mounted `auditMiddleware` on the four `DELETE /:id` routes and
removed their hand-written Delete rows. **C6c** (`5f11e25`, run 236) delivered the
configurable purge: a daily job reads the `audit_retention_years` setting (default 7) and
deletes older entries, `POST /api/audit-log/purge` runs it on demand for an Administrator,
and the setting joins the writable allowlist with its own 1-100 validation. The C6b mount
is deliberately narrow - the DELETE routes only. Extending the middleware to `PUT /:id`
and to named-id params (`:woId`) was considered and **deferred as a v1.1 candidate, not
overlooked**.

**B2** and **B3** are owner acceptances recorded as register edits, not code. B2 accepts
the §3.5.2 cost-split-screen deferral for go-live (matrix row 331); B3 accepts the defect
position — the four accessibility items, named and carried (matrix row 334). Both
formalise earlier decisions (2026-10-04 and 2026-10-05) and add no work; the underlying
screen and accessibility items remain v1.1 (`N1`, `N2`). They share run 238, the first
green tip carrying them, pushed together with **B1**'s reclassification (`1310340`) and
the **D1** OpenAPI-coverage correction (`018e570`). B1 and D1 are not closures: B1 moved
to "close now" work, and D1's sweep is still open.

**B4** (`4d2d7c7`, run 239) is the authorized orphan cleanup. The deletion itself ran
against the gate/test database (`cmms_gate`), so the table honours the `r9d-orphan-clean`
commit that shipped the tool and recorded the run, with the register processing at
`5114d8d`.

**C15** (`50ff911`, run 241) pinned the status/type/priority/role value domains with
reversible `CHECK` constraints, one migration, 24 constraints across 12 tables — free
text plus constraints, not native `CREATE TYPE` enums, so every one stays reversible in
place and the schema keeps its no-native-enum pattern. Two domains corrected against
the schema comments as part of the pin: `SystemAlert.alertType` admits `Account_Lockout`
(written on lockout by the auth route) and `Comment.entityType` admits `MaintenancePlan`
(validation.ts `commentEntityTypeSchema`), which the comments omit. The pin forced the
PM-generation-failure fixture (`pmGenerationAlerts.test.ts`) to stop storing the `'Bogus'`
`generatedWorkOrderStatus` the DB now refuses; it is re-anchored to a plan that names no
equipment, no functional location and no target rows, which is still storable at rest
and fails generation with `NO_FUNCTIONAL_LOCATION` — same alert paths, same intent.

**C14** (`fd86709`, run 243) enforced the swallowed-teardown ban and cleared the sites.
The count the C14 row carried — 55 across 13 — conflated a code site with a comment:
re-derived from source, there were **54** `.catch(() => {})` teardowns in 12 backend test
files, and the 13th match was a comment in `helpers.ts` describing the old pattern. All 54
removed; the delete order was already correct, so the full 1099-test suite passes with every
swallow gone — the empty handlers had been hiding failures, not preventing them. Enforcement
is a `no-restricted-syntax` rule in the `tests/**` ESLint override: an empty arrow catch now
fails lint whether or not it binds a parameter, while production `src` keeps its adjudicated
parse-fallback catches. The re-measured-figures note above (`68 → 55`) and the tracker's
`68`/13 figures — including the `:1206` per-file breakdown that still lists
`notifications.test.ts` (16), a file that no longer holds any — are superseded by 54 in 12.

**C20** (`cfc6108`, run 246) cleared the lint debt in two packages, landed as three commits
so the backend and app halves stay separately revertable. **`40f91b3`** (run 245) took
backend `npx eslint .` from **43 errors / 0 warnings** to **0 / 0**: 38 `no-explicit-any`
replaced with `Prisma.*WhereInput` and node-tree types plus `isPrismaError`-guarded
`catch (error)` rewrites, 4 `no-unused-vars` removed, and 1 `no-namespace` isolated behind a
scoped disable on the Express `Request` augmentation. **`c0ff7de`** (run 245) took the app
from **29 errors / 2 warnings** to **0 / 0**: 21 unused vars/imports removed, 6 `any` typed
(getAll params widened to `Record<string, string | number | boolean | undefined>` over
object-literal call sites; MTBF/downtime reports given `MbtfReportRow`/`DowntimeReportRow`),
and the two `react-hooks` v7 rule sites fixed behaviour-preservingly — the settings row
resyncs its draft during render instead of in an effect, and the Reports loading flag is
derived from `reportData`/`reportError` with the pm-compliance memo keyed on a stable slice.
**`cfc6108`** (run 246) restores the indentation `c0ff7de` had dropped on the
`WorkOrderDetailPage` reload `catch` brace — a cosmetic slip that tsc, eslint and tests pass
either way, corrected rather than silently carried. The item left no `SOW_COMPLIANCE.md`
Status to move and is not a tracker `v1.1` row: it was found on my own and recorded only
here. The pre-sweep baselines re-derived from source were **43** (backend) and **29 + 2
warnings** (app) on 2026-10-08; `README.md:266`'s `41 / 28 + 2` (measured 2026-10-02) was
already stale, and is now corrected to the cleared state with the superseded figures kept in
the line. That correction discharges the `README.md:266` limb of **D1**'s figure sweep; D1
stays open on its remaining items.

**C21** (`ad93610`, run 248) cleared every production dependency advisory that had a fix
available, and closed as **reduced** rather than forcing the last one. Re-derived from
source on 2026-10-10, `npm audit --omit=dev` reported backend **10** — 1 critical
(`proxy-addr` IP-spoofing), 6 high, 3 moderate — and app **4** (3 high, 1 moderate). The
row's re-measure was right and `README.md:265`'s "9 … no criticals" understated it. Two
commits, one per package, changing **only the lockfiles** (`package.json` untouched,
`@prisma/client`/`prisma` still 6.19.3). `89585f8` refreshed the patched set inside its
declared ranges (`express` 4.22.2→4.22.3, `body-parser` 1.20.6→1.20.8, `qs` 6.15.3→6.16.0,
`proxy-addr` 2.0.7→2.0.8, plus `brace-expansion`, `fast-uri`, `js-yaml`, `source-map-js`)
leaving **3**; `ad93610` took the app from **4** to **0** (`lodash`, `react-router` /
`react-router-dom`, `fflate`). The 3 that remain are a single advisory — `deepmerge-ts <8`,
reached through `@prisma/config` → `prisma` — and are left open deliberately: no stable
Prisma fixes them (`@prisma/config@7.10.0` still pins `deepmerge-ts@7.1.5`; only an 8.x dev
build bumps it), the package is a **devDependency** and only an *optional* peer of
`@prisma/client`, this repo has no `prisma.config.*` for the vulnerable path to run, and so
the advisory is unreachable at runtime. An npm `overrides` pin to `deepmerge-ts@^8.0.2` was
**considered and declined** — it would clear the number but diverge from `@prisma/config`'s
declared version and accept a behaviour-changing release (`deepmerge-ts` 8.0.0 altered Map
merging and stopped mutating its target) on the migration toolchain, untested. Re-examine
when Prisma ships a stable bump. The dev-only Tailwind 3 / PostCSS advisories that remain in
the app are likewise out of scope here (they need `tailwindcss@4`, a breaking change) and are
not counted by `--omit=dev`. `README.md:265` is corrected to this state with the superseded
figures kept in the line; the item left no `SOW_COMPLIANCE.md` Status to move and, like C20,
was found on my own and recorded only here, with no tracker `v1.1` row.

