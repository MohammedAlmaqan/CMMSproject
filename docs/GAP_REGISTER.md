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
lines, `DECISION_REGISTER.md` (D-2…D-20), `README.md` known issues, `FILL_REPORT.md`,
plus the backend routes/schema/middleware and the frontend pages/routes/services.

---

## A. Close now — code and data gap (0)

Empty since 2026-10-15 — the sole item (C11) is resolved: the PM/overdue/audit
schedulers now run in a separate worker process (`backend/src/worker.ts`,
`npm run worker`) instead of inside the API, so the API tier is stateless and scales.
Matrix line 255 (§4.1 horizontal scaling) moves `Partial` → `Met`; line 281 (§5.1
separate background service) keeps its `Partial` status because its email-notification
and report-generation limbs are still absent (see the closure log).

## B. Close now — documentation gap (0)

Empty since 2026-10-15 — the sole item (D1) is closed. The documentation accuracy
sweep re-derived the citations, claims and frozen counts it named: every `file:line`
locator in `docs/SOW_COMPLIANCE.md` was re-checked against source and replaced with a
symbolic reference (154 locators: 145 rewritten in place, 7 dropped with the stale claims
that carried them, and the 2 section references to `docs/ADMIN_GUIDE.md` left as they
were); the five stale limitation-register
claims (L2, L12, L13, L16, L24) and the five Table 1 asks / "Seven items" header were
corrected; `README.md`'s load-test sentence was pointed at the 2026-10-03 pass; the
stale line ranges in `scripts/verify/verify_a1.py` and the tracker's `v1.1-8` citation
were replaced with symbolic references; and `docs/openapi.json` was re-exported and put
under a new drift gate (`scripts/verify/verify_openapi.py`). Two of the named items were
found already correct and needed no edit: the tracker teardown figure (54 in 12, fixed
at C14) and the `schema.prisma` value-domain comments (all 24 match the C15 CHECK
constraints). One owner-authorised status move came out of it: matrix line 306 (§5.7
import tools) `Partial` → `Met`. See the closure log.

## C. Blocked on owner (0)

Empty since 2026-10-09 — all four owner items (B1–B4) are resolved. B1 was
reclassified to close-now work, B2 and B3 were accepted, and B4 was applied
(see the closure log and Reclassifications).

## D. Blocked on external (0)

Empty since 2026-10-14 — the sole item (E1) is resolved: the TLS-terminating
IIS/ARR front end was executed and verified against the live site on 2026-10-03
(matrix §4.2, line 256), and `README.md:267`–`README.md:268` are corrected to
that state (see the closure log).

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
- **Re-measured figures:** teardown sites 68 → 55 (**superseded by the C14 closure** —
  the count re-derived from source was **54** in 12 files; the 55th match was a comment,
  not a code site. See the closure log); lint 41 / 28+2 → 43 / 29+2;
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

## Splits (2026-10-12)

- **C4 → C4a / C4b / C4c (owner decision, 2026-10-12).** The single L-sized entry
  bundled three independent concerns: the master-data *screens* the existing write
  APIs lack (C4a), a JSON bulk endpoint for Functional Locations (C4b), and an
  OData-style query grammar (C4c). Only C4a is in scope this pass; C4b and C4c stay
  open, and matrix lines 295/296 stay `Partial` until they close. Category A goes
  10 → 12 entries.

## Coverage check

*Updated 2026-10-10 (B1): matrix lines 40 (§1.3), 307 (§5.7) and 335 (§6.4) are now `Met`, so the `Partial`/`Not Met` set is 31 lines, not 34, and entries **B1** and **D2** are closed (see the closure log). The original freeze-time mapping is kept below as the record it was.*

All 34 `Partial`/`Not Met` matrix lines **as at the freeze** map to exactly one entry above:
line 38→C3, 39→N4, 40→B1+D2, 52→C3, 53→D1, 54→D1, 55→C6, 56→D1, 59→C4a, 61→C3, 62→D3,
63→C9, 175→N1, 253→C12, 255→C11, 259→C1, 261→N9, 263→C13, 264→C6, 265→N2,
281→C11, 289→C6, 290→C6, 291→N3, 292→D4, 295→C4b, 296→C4c, 299→C1, 300→C10, 301→C2,
306→C5, 307→D2+B1, 316→N5, 335→B1.

All 13 Action Sheet Table 2 rows map to one entry: 1→C12, 2→C1, 3→C2, 4→C13, 5→C14,
6→D1, 7→C3, 8→C4a, 9→N8, 10→C6, 11→C5+D2 (**D2 closed 2026-10-10**), 12→N2, 13→C15.

All 10 open v1.1 backlog rows map to one entry: 4→C15, 6→D5, 7→C14, 8→D1, 9→N1,
10→N10, 11…14→N2.

## Totals

0 code and data gap · 0 documentation gap · 0 blocked on owner · 0 blocked on external ·
10 decisions-not-gap = **10 open items**.

Items found on my own and listed nowhere else before: C19, C20, C21, E1, D3, D4, D5.

---

## Closure log

Section tables list only open items. When an item closes, its row is removed from its
category table and the header count and Totals decrement; the Closure log below is the
append-only record, and each row carries the SHA and green CI run recorded when the item
landed.

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
| E1 | 2026-10-14 | `574d006` | 289 |
| C4b | 2026-10-14 | `fdf0303` | 290 |
| C4c | 2026-10-14 | `b31900c` | 292 |
| C1 | 2026-10-15 | `a9b5326` | 294 |
| C11 | 2026-10-15 | `e59e9a1` | 296 |
| D1 | 2026-10-15 | `7db0d20` | 298 |

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

**C5** (`eefcff1`, run 252) added the two missing live importers —
`POST /api/functional-locations/import.csv` and `POST /api/work-orders/import.csv` — both
Maintenance Planner-only, on the same mapping rules as the trial harness so a live load and
the accuracy trial cannot diverge. A new helper (`backend/src/migration-trial/liveImport.ts`)
resolves the importers' FK refs against live master data (plus rows created earlier in the
same file, so a location's parent can come from the same upload), then upserts by natural key
with an audit row; an unresolved ref, a malformed row or a Prisma failure is reported per row
rather than aborting the run. Nine route tests cover the auth/role/header guards, parent and
child resolution within one file, idempotent re-import as update, and per-row rejection of
unknown references. The item left no matrix Status to move — the matrix line 306 Status is
the owner's call — and the line 306 note and the Table 2 "Migration tooling" wording that
still read as harness-only are **D1**'s remaining sweep, named here so closing C5 does not
silently leave them stale.

**C12** (`fd86b2b`, run 254) added the missing write-path measurement — `scripts/k6/write.js`,
a 200-VU single-scenario load that logs in once per VU, resolves existing work orders once, then
saves in a loop via `PUT /api/work-orders/:id` (`completionRemarks` set to a fixed probe, so no
rows are created and audit growth is bounded) and records the save percentile in its own
`save_latency` trend. Run on 2026-10-10 against a disposable clone of `cmms` (229 work orders;
the live `cmms` was not touched — verified back at 9 WOs). **At a realistic cadence — one save
per user per 20 s (`THINK_TIME=20`) — the save limb is p(95) 89.4 ms**, median 26.3 ms, max
836 ms over 3,790 saves, `http_req_failed` 0.00%, 0 P2028 / 0×429 / 0×500: **within the §4.1
< 1 s budget**, so this is the acceptance figure. A tight loop (one save per user per second)
saturates at p(95) 3.47 s (median 2.6 s, ~46 saves/s from 22,089 saves; solo saves ~50 ms), and
is recorded as a **stress bound, not the acceptance number**. The row carries no matrix Status to
move — the line 253 Status is the owner's call — and its note is refreshed with these figures so
the "Residual: a write-path save-latency load run" line is discharged.

**B1** (`1971686`, run 257) is the legacy migration full load. The Client's raw
workbooks were extracted to the trial-run CSV contract by a new
`scripts/migration/extract_full_dataset.py` and loaded by the `backend/src/migration-trial/run.ts`
harness (extended with `TRIAL_RUN_CSV_DIR` / `TRIAL_RUN_REPORT_PATH` overrides so a full run
never touches the reviewed sample). Cleaning policy per the owner's 2026-10-10 decision — keep
the full sets, cleaned to a loadable set with every exclusion logged — dropped 78 work orders
(77 `E3_Non-Maintenance`, 1 blank `#N/A` FL), deduplicated 11 `woNumber`s and 21
`notificationNumber`s, dropped 36 equipment rows (blank/duplicate code, blank criticality or FL),
merged 267 material rows by code, and blanked 11 unresolved equipment FKs. **Result on the full
dataset: 20,333 / 20,333 rows correct = 100.00%** against the 99.9% target, 0 rejected; the report
is `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md` and the ledger
`docs/migration-templates/FULL_LOAD_LEDGER.json`. On this evidence matrix lines 40 (§1.3), 307
(§5.7) and 335 (§6.4 / d) moved `Not Met` → `Met`. **D2** (`1971686`, run 257) — the
migration runbook the register said did not exist anywhere under `docs/` — is discharged by
`docs/migration-runbook.md`, delivered as part of B1. Both runs are confirmed against the
closure's push-run (257, green).

**C3** (`40cb3c3`, `8ed6f70`, `cf2f9c5`; runs 265–267) closed the three limbs the entry
named. **C3.1** (`40cb3c3`, run 265) added the plan CRUD UI — an inline create/edit/delete
form with `planCode` create-only, multi-target equipment/location rows (D-10) and
meter-threshold rows for the Meter and Combined strategies (SOW 3.4.2) — plus a new
`equipmentMeterService` and `MaintenancePlanInput` types; the plan UI edits from the store
list object rather than `GET /maintenance-plans/:id`, which omits `targets`. **C3.2**
(`8ed6f70`, run 266) added the Administrator-only on-demand "Run Scheduler" control over
`POST /maintenance-plans/run-scheduler`, whose real response is `SchedulerRunResult`
(`{ranAt, plansEvaluated, wosCreated, wosSkipped, errors}`), not the `{generated}` the
OpenAPI snapshot still claims. **C3.3** (`cf2f9c5`, run 267) added the notification-intake
form on `NotificationsPage.tsx` over `notificationService.create`, added `NotificationInput`,
and derives the functional location from a chosen equipment (the route rejects a
contradicting location). The row carries the tip; the item left no `SOW_COMPLIANCE.md`
Status to move — matrix lines 38, 52 and 61 are the owner's call.

**C13** (`6cdabc9`, run n/a; corrected `this commit`). C13 closed §4.3/RTO on a
full-sequence measurement that did not actually measure its limbs. Re-derived from
`scripts/restore-drill.bat`, the "application layer" timer bracketed an **empty
block** — two comment lines between the `CMMS_APP_START_MS` and `CMMS_APP_END_MS`
timestamps — so its reported app-layer time (0.36 s) was `powershell.exe` invocation
overhead, and the attachment limb only **counted** files in the paired `-uploads`
folder rather than restoring bytes. The "9.11 s total" was therefore database create
+ restore + `WorkOrder` count + a recursive file count + an empty timer + drop.
`this commit` corrects the drill so the attachment limb copies the paired snapshot
into a scratch tree and reads a file back, and the app limb stops the backend on
`:4000`, rebuilds the backend and frontend, restarts the API and requires
`GET /api/health` to return 200 before the timer stops. Re-run on this host
2026-10-14: **PASS**, **85.82 s total** (app layer 79.65 s) against the four-hour
budget. The status stays `Met` — the requirement is met; only the measurement was
wrong — so no section-table row, header count or Totals changes. This note and matrix
line 263 (`docs/SOW_COMPLIANCE.md`) supersede the "9.11 s total (app layer 0.36 s)"
figure; `docs/ADMIN_GUIDE.md` §7.6 and `docs/ARCHITECTURE.md` now carry the corrected
figure. The matching comment in `scripts/verify/verify_a1.py` repeats the 9.11 s
figure and is left unchanged pending an owner call.

**E1** (`this commit`, 2026-10-14). E1 was the only "blocked on external" item:
TLS termination and the IIS reverse-proxy deployment, said to need a host matching
production that is not held. The host was not missing — the owner deployed the
site live and re-verified both limbs over HTTPS on 2026-10-03 (`curl -k
https://cmms.local/api/health` → 200 JSON, `/dashboard` → 200 SPA), which is what
had already promoted §4.2 to `Met` (matrix line 256). `README.md:267`/`:268` still
carried the pre-deployment claims ("HTTPS/TLS termination is not configured";
"has not been executed end to end. Treat it as untested"), so both are corrected
to the verified state, keeping the old wording in the line and retaining the local
`sslmode=disable` database fact and the internet-exposure caution. Category D
drops to 0 (shown empty) and the Totals line to 15 open items. The item left no
`SOW_COMPLIANCE.md` Status to move — §4.2 was already `Met` and is unchanged by
this closure. The closure row records `this commit`; the green run for the push
is backfilled once confirmed.

**C4c** (`this commit`, 2026-10-14). Implement a bounded OData-style query grammar
(`backend/src/utils/queryGrammar.ts`) supporting `$filter`, `$top`, `$skip`,
`$orderby`, `$select` with field allowlists per resource, operators
`eq/ne/gt/ge/lt/le/contains`, `and`/`or`, parentheses, quoted strings with `''`
escape, type coercion (string/number/boolean/date), `MAX_TOP=500`, `$skip`
capped at `Number.MAX_SAFE_INTEGER`, and response-level `$select` of top-level
scalar fields. Wire into 11 GET collection routes (work-orders, notifications,
equipment, functional-locations, materials, maintenance-plans, task-lists,
work-centers, crafts, failure-codes, cause-codes). `$top`/`$skip` override
conventional skip/take when present, else conventional defaults apply; bad input
returns 400 `{ error: 'Invalid query parameters', details: [...] }`. Both `/api/*`
and `/api/v1/*` covered. Unit tests 37, route tests 14 pass; typecheck and
eslint pass. Matrix line 296 (`§5.4 OData...`) moves `Partial` → `Met`, category
A drops to 2 and Totals to 13 open items. Limitation row L22 is marked resolved.
The verifier promotion entry (`"5.4 odata"`, `Partial` → `Met`, `this commit`)
lands in the same commit.

**C4b** (`fdf0303`, 2026-10-14). C4b was filed as "JSON bulk endpoint for
Functional Locations … there is no bulk import/export path". Half of that premise
had already gone: C5 added `POST /api/functional-locations/import.csv`
(`functionalLocations.ts:75`), so Functional Locations did have a bulk path, and
Materials and Work Orders have CSV importers too. What remained was a
clause-vs-form question — SOW 5.4 names `POST /api/v1/equipment/bulk` *with a JSON
array*, and no `/bulk` JSON route exists anywhere in `backend/src`; all bulk is CSV
multipart. The owner reviewed that difference on 2026-10-14 and accepted the CSV
form as meeting the clause for both SOW-named entities (Equipment and Functional
Locations), so matrix line 295 moves `Partial` → `Met`, category A drops to 3 and
the Totals line to 14 open items. That is the same reasoning already accepted for
§3.10 bulk master-data, which was waived as redundant with the SOW 5.7 CSV
importers. The limitation-register row L21 ("no bulk endpoint for functional
locations") is marked resolved to match, and the verifier promotion entry lands in
the same commit. The clause's JSON-array form was not built and is not required,
so this is a status move, not a build or a waiver. Adjacent bulk-form claims outside
C4b's cited surface are not swept here and are carried for the **D1** documentation
sweep: `SOW_COMPLIANCE.md:59` (§2.2 "CSV for 2 entities only"),
`OWNER_ACTION_SHEET.md:28` ("JSON bulk endpoints for locations"), and the
`API_REFERENCE.md` importer rows.

**C1** (`a9b5326`, run 294, 2026-10-15). C1 was the session-security workstream:
server-side idle expiry, refresh-token rotation, a logout that revokes the
presented token, and a technician identity taken from the session rather than the
request. The identity limb was already delivered earlier — `backend/src/utils/attribution.ts`
with `backend/src/routes/labor.ts:145` (matrix line 140) — so C1 covered the other
three. The access token is now short-lived (15 minutes by default) and carries a
`sid` claim naming a `RefreshToken` session row; `schema.prisma` gained
`RefreshToken.lastUsedAt` (migration `20261014120000_refresh_token_last_used`), and
`backend/src/middleware/auth.ts` rejects any token whose session is missing,
revoked, expired or idle past `SESSION_IDLE_MS` (30 minutes), touching `lastUsedAt`
on a throttle. `POST /api/auth/login` now also sets an httpOnly `cmms_refresh`
cookie (sameSite strict, `path=/api`, `secure` in production) stored only as a
sha256 hash, and `POST /api/auth/refresh` rotates it single-use while inheriting the
session's absolute `expiresAt`; replaying a rotated or revoked token revokes every
live session for the user. `POST /api/auth/logout` revokes the presented token and
is idempotent. The frontend (`app/src/lib/api.ts`) does a single-flight refresh on a
401 and retries once, with a registered auth-failure handler that logs out and
redirects. Matrix line 259 (§4.2 30-minute session timeout) and line 299 (§5.5 JWT
refresh rotation) both move `Partial` → `Met`, so category A drops to 1 (C11) and
the Totals line to 12 open items. Limitation row L8 is marked resolved. The verifier
promotion entries (`"4.2 session-timeout"`, `"5.5 jwt-refresh"`, `Partial` → `Met`,
`this commit`) land in the same commit. All work ran against the throwaway
`cmms_c1` database; the operational `cmms` database was not seeded, migrated or
written.

**C11** (`e59e9a1`, run 296, 2026-10-15). C11 was the process-separation item: the PM,
overdue and audit-retention schedulers ran inside the API process behind an advisory
lock, which is the §4.1 scaling blocker. They now run in a dedicated worker process,
`backend/src/worker.ts` (`npm run worker`, i.e. `dist/worker.js`), started by PM2 as
`cmms-worker` (fork, `instances: 1`). `backend/src/index.ts` no longer starts any
scheduler, so the HTTP tier holds no in-process job state and a duplicate worker simply
fails to take the `SchedulerRun` startup lock and exits 0. The three `start*Scheduler`
functions now return their `node-cron` task so the worker can stop them on
`SIGINT`/`SIGTERM`; `backend/tests/unit/worker.test.ts` pins the lock-refused,
cron-started and catch-up-failure branches without a database. Matrix line 255 (§4.1)
moves `Partial` → `Met` — the web/API tiers are stateless and scaling the API no longer
multiplies scheduled work. Line 281 (§5.1) stays `Partial`: the separate-process limb
for PM scheduling is now delivered, but the email-notification and report-generation
services the same clause names do not exist. The one residual is recorded, not used to
hold the row: the login rate limiter is still an in-process store, so running more than
one API instance would need a shared limiter store for the per-IP budget to hold
cluster-wide. Category A drops to 0 and the Totals line to 11 open items. The verifier
promotion entry (`"4.1 horizontal-scaling"`, `Partial` → `Met`, `this commit`) lands in
the same commit. All suite work ran against the throwaway `cmms_c11` database; the
operational `cmms` database was not seeded, migrated or written.

**D1** (`7db0d20`, run 298, 2026-10-15). D1 was the documentation accuracy sweep.
The `docs/SOW_COMPLIANCE.md` citations were its centre: all 154 `file:line` locators were
re-derived from source and turned into symbolic references (145 rewritten in place, 7
dropped with the stale claims that carried them, and the 2 `docs/ADMIN_GUIDE.md` section
references left as they were; a file or a named symbol rather than a line range), because
a line range breaks silently when a list grows and nothing fails — the same reason v1.1-8 recommends symbolic references. The one citation
whose target had moved file, the role hierarchy, now names `roleHierarchy` in
`backend/src/utils/roles.ts` instead of the old `backend/src/middleware/auth.ts`. The
five stale limitation-register claims were re-checked and corrected (L2 task-list screen,
L12 meter/combined PM strategy, L13 per-plan generated status, L16 BOM / cost-split /
plan-meter write paths, L24 system alerts), the stale Table 1 asks and "Seven items"
header corrected, and `README.md`'s 200-user load-test sentence pointed at the
2026-10-03 pass and C12. The tracker teardown figure and the `schema.prisma`
value-domain comments were re-checked and found already correct, so they were left as
they stood. `verify_a1.py`'s importer citation was rewritten to name the four live
import routes instead of four off-by-one line numbers, and the tracker's `v1.1-8`
example citation was made symbolic. `docs/openapi.json` was re-exported from the same
module the server serves it from (`backend/src/openapi.ts`, extracted so the served
document, the snapshot and the gate share one definition) — 141 operations / 87 paths →
146 operations / 92 paths — and `scripts/verify/verify_openapi.py` now fails when the
snapshot and the route annotations drift. One status move was authorised by the owner
and landed here: matrix line 306 (§5.7 import tools) `Partial` → `Met`, on the C5 live
importers (`eefcff1`, run 252); the verifier promotion entry (`"5.7 import-tools"`,
`Partial` → `Met`, `this commit`) lands in the same commit. §5.7's summary figures move
to 156 Met / 23 Partial (the §3 total is unchanged at 104 Met / 1 Partial). No database
was touched — docs, source citations and one verifier comment only.

*Superseded 2026-10-15:* the summary figures moved again after this sweep, when the **D-20**
owner decision promoted nine non-§3 rows (`docs/SOW_COMPLIANCE.md` §1.3 line 38, §2.1 lines 52/53/54/56,
§2.2 lines 59/61/62/63) from `Partial` to `Met`. That took the all-clauses count from
**156 Met / 23 Partial** to **165 Met / 14 Partial**; the §3 total is unchanged at
**104 Met / 1 Partial**. The paragraph above is kept as the record of what the D1 sweep itself
moved (§5.7 row 306, 156/23); this pointer records the later move so the figure is not read as
current. The D-20 promotion commit is `45ea771` — an interior commit with no run of
its own, covered by green run 300 at its child `1b027dc`.
