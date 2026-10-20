# ARCHITECTURAL AND ENGINEERING EVALUATION

**System:** CommandPulse CMMS (on-prem Windows; React/Vite SPA + Express/Prisma API + PostgreSQL 18)
**Evaluation type:** Independent, read-only architectural and engineering review
**Evaluated commit:** `1721c1290edbf775cf853594d6f38d7d9177ae43` (`main`, equal to `origin/main` at the time of writing)
**Evaluation date:** 2026-10-20 (host local time, UTC+3)
**Report file:** `docs/ARCHITECTURAL_EVALUATION.md`
**Status:** Revision 1.1, documentation only. No Cons, Recommendation or Appendix D gap has been implemented. The Build Now items are a proposal awaiting the owner's decision; no code was written for them.

**Safety declaration:** No application code, configuration, schema, test, seed, migration
or script was changed or executed as part of this evaluation. No statement was run against
the live `cmms` database. The review used file reads, `git` inspection, `npm audit` and
`Select-String`. The only file written is this report.

**Historical note:** this document does not replace or alter
`docs/CMMS_EVALUATION_AND_BUILD_PLAN.old.md` (archived 2026-09-22, when the project was a
frontend-only SPA). That file is preserved as history; this one evaluates the delivered
system.

---

## 1. Purpose and scope

This evaluation answers two questions for the owner:

1. Is the system, as it stands at `1721c12`, safe to release and archive?
2. What must change for it to remain sound over five years and at roughly 200 concurrent
   users?

Scope: repository contents (backend, frontend, schema, migrations, tests, CI, scripts),
the shipped bundle, and the documented deployment topology. It is an engineering
assessment, not a SOW acceptance or contract review. Where a finding is a scope or
acceptance decision rather than an engineering one, this is stated.

Out of scope: re-running the acceptance test suite, penetration testing, load testing at
target concurrency, and any remediation.

---

## 2. Method and evidence

- Facts were re-derived from source at `1721c12`, not taken from prose about the source.
- Every count in Appendix A was produced by a command recorded in Appendix B on
  2026-10-20.
- File and line references point at the evaluated commit.
- Where a statement is an inference rather than an observation, it is labelled Claim.
- Nothing in this evaluation was validated by running the test suites; test evidence is
  the recorded green CI run, not a local re-run.

---

## 3. Executive summary

CommandPulse CMMS is a well-engineered, production-operable monolith, not a prototype. It
has an unusually disciplined verification culture for its size: 214 SOW clauses tracked
and mechanically gated, 88 backend test files (15,037 lines) against 22,692 lines of
backend source, a generated-and-drift-checked OpenAPI contract (148 operations over 93
paths), and a documented operational posture (split API/worker under PM2, IIS reverse
proxy, WAL archiving, daily backups with a restore drill).

The Client dataset is live (20,333 of 20,333 rows, one transaction, verified backup). The
system is production-ready for the delivered scope, at the current data volume, on the
delivered single-host topology.

It is not yet a five-year, 500K-work-order, horizontally scaled architecture. The gap is
not correctness or discipline: it is scale engineering (indexes, reporting, audit and
token growth) and a handful of deliberate security trade-offs (CSP disabled, access token
in `localStorage`, in-process rate limiter). Those trade-offs are defensible for a
loopback-bound LAN deployment and would be liabilities under internet exposure or growth.
The repository documents most of this itself.

---

## 4. Pros

### 4.1 Verification is a first-class artifact

- CI (`.github/workflows/ci.yml`) runs real PostgreSQL 15, `npm ci`, typecheck, lint,
  `migrate deploy`, seed and the full suite for both tiers. Run `39453367213` is green at
  `1721c12`, both jobs `success`.
- `scripts/verify/verify_a1.py` re-derives the 214-clause SOW inventory from source and
  `scripts/verify/verify_a1_dispositions.py` proves every register row is dispositioned.
  Both PASS at HEAD.
- OpenAPI is generated from route annotations and guarded by a drift check, so the
  contract cannot silently diverge from code.
- The release history shows one concern per commit with honest messages; documentation
  corrections are committed against code, not in place of it.

### 4.2 Schema design is deliberate and honest

- 38 models; money in `Decimal(12,2)`; soft delete on all but four documented
  append-only tables; partial unique indexes scoped to `WHERE isDeleted = false`, so a
  code can be reused after deletion.
- Database CHECK constraints pin status and type domains (migration
  `20261009120000`), so integrity is not only application-enforced.
- `AuditLogEntry`, `WorkOrderSnapshot`, `WorkOrderOperation` and `SequenceCounter` are
  documented exceptions (immutable log, child-of-WO, high-volume counter) rather than
  accidental omissions.

### 4.3 Security fundamentals are sound for an on-prem LAN

- 15-minute access JWT plus a rotating, single-use refresh token stored hashed; replay
  revokes the session (`backend/src/routes/auth.ts:419-482`).
- Refresh cookie is `httpOnly`, `SameSite=Strict`, `Path=/api`; server-side idle expiry
  is independent of the browser (`backend/src/middleware/auth.ts:65`).
- Startup fails fast if `JWT_SECRET` is missing (`backend/src/utils/config.ts:3`).
- Passwords are bcrypt-hashed at cost 10; account lockout is 5 failures in 15 minutes;
  login is rate-limited (`backend/src/index.ts:61-66,175`).
- Uploads are deny-first: extensions are allowlisted and a blocklist rejects executables
  and scripts, with MIME as fallback only (`backend/src/utils/uploadRules.ts:47`).
  Downloads are forced to attachment disposition (`backend/src/routes/attachments.ts:319`).
- The API is pinned to loopback in the shipped PM2 config (`BIND_HOST: '127.0.0.1'`,
  `backend/ecosystem.config.cjs:15`), and `trust proxy = 1` is documented against the
  spoofing hazard (`backend/src/index.ts:71`).

### 4.4 Operational maturity

- API and scheduler are separate PM2 processes; cron work runs only in the worker
  (`backend/src/worker.ts:11-24`).
- Backups snapshot attachments with the SQL dump, cap retention at 14 generations, and a
  restore drill targets a throwaway database, never live `cmms`.
- Structured JSON logging (pino) with request/user attribution, plus a scheduler
  freshness endpoint.
- Deployment documentation covers firewall rules, scheduled-task names and WAL archive
  verification, not just "run npm start".

### 4.5 Frontend engineering

- Route guards mirror the API read floors; RBAC is enforced server-side and the client is
  not the authority (`app/src/lib/rbac.ts`).
- The API client carries a single-flight token refresh (`app/src/lib/api.ts`), so
  concurrent 401s do not stampede the refresh endpoint.
- Accessibility work is recorded with concrete fixes and verification (WCAG 2.1 AA light
  pass, `docs/WCAG-AUDIT.md`).

---

## 5. Cons and risks

### 5.1 Single-instance assumptions are designed in

- The login limiter is in-process (`express-rate-limit`, `backend/src/index.ts:61`), and
  the PM2 config says so explicitly: scaling the API requires a shared limiter store
  (`backend/ecosystem.config.cjs:7-10`).
- Attachments are stored on local disk under the backend; a second API instance would
  not see them.
- The worker lock is a heartbeat row with a 5-minute freshness window
  (`LOCK_FRESH_MS`, `backend/src/services/scheduler.ts:17,20-50`), not a PostgreSQL
  advisory lock. Two workers starting inside the same window can both observe "no fresh
  foreign lock" and both start crons. Probability is low on a single host, but the
  mechanism does not make it impossible.

**Risk:** medium. Today's topology is correct; "add a second API node" is not a supported
operation.

### 5.2 Reporting and query paths will not scale to 500K work orders as designed

- All 23 report objects are plain, non-materialized views
  (`backend/prisma/migrations/20261002160000_reporting_views`), recomputed on every read.
  `report_backlog` alone unions three grouped scans over `report_work_order`.
- Base-table indexing is thin: the baseline created indexes almost exclusively for
  uniqueness and `SchedulerRun`. There is no index on `WorkOrder.status`, `priority`,
  `workCenterId` or `createdDate`, yet the default list sort is
  `orderBy: { createdDate: 'desc' }` (`backend/src/routes/workOrders.ts:376`).
- The `WorkOrder` list also filters by type, priority, status, equipment and work centre
  (`backend/src/routes/workOrders.ts:235-248`) without supporting composite indexes.

**Risk:** high at the five-year target; invisible at 20K rows. This is the largest
distance between the delivered system and the stated growth goal.

### 5.3 Audit and token tables grow without bounds or supporting indexes

- `AuditLogEntry` has no index on `timestamp`, `tableName` or `action`
  (`backend/prisma/schema.prisma`, model `AuditLogEntry`), yet retention deletes by
  `timestamp` (`backend/src/services/auditRetention.ts:62`) and the UI filters and pages
  over the same columns.
- `RefreshToken` rows are never pruned after expiry or revocation; no cleanup job exists
  in the worker.

**Risk:** medium today, high over five years. The audit table grows roughly with every
field change across the system.

### 5.4 Two browser-security trade-offs are documented but still real

- CSP is disabled: `helmet({ contentSecurityPolicy: false })`
  (`backend/src/index.ts:74`).
- The access token is stored in `localStorage`
  (`app/src/lib/api.ts:3`, `setAuthToken`), so any XSS can read a 15-minute token. The
  httpOnly rotating refresh cookie caps the blast radius but does not remove it.
- Upload validation is filename-first; there is no magic-byte sniffing, and
  `multer.memoryStorage()` buffers up to 10 MB per upload in RAM
  (`backend/src/routes/attachments.ts:18,25`).

**Risk:** accepted for LAN use; blocking for internet exposure. This is an engineering
judgement, not an owner acceptance decision, and the owner should record which it is.

### 5.5 CI has soft edges and no committed end-to-end suite

- The lint gate fails only above 50 errors (`ci.yml:67`), so lint debt can accumulate
  below that line without failing the build.
- Backend tests are strong (88 files). Frontend tests are 25 files / 3,194 lines, and
  there is no committed Playwright/E2E suite. The prior RBAC UAT run was live evidence,
  not a repeatable job.
- `npm audit --omit=dev` reports 3 high advisories in the backend chain
  (`prisma` -> `@prisma/config` -> `deepmerge-ts`, stack exhaustion on recursive config
  merge). Practical exploitability is near zero because config files are static and
  vendor-controlled, and a fix exists, but the advisories are open. The frontend reports
  zero.

**Risk:** low to medium. The main cost is that regressions outside unit-tested paths are
caught late.

### 5.6 Rollback is restore-only; small debt remains in the frontend

- Prisma migrations are forward-only. A bad schema change is recovered by restoring a
  dump. That is workable, but it should be an explicit owner decision, not a surprise
  during an incident.
- `switchRole` in `app/src/store/authStore.ts:14,45` is dead code (defined, never
  called): harmless, but demo-era scaffolding.
- The SPA ships a 1,045,687-byte main bundle plus an 893,244-byte three.js dashboard
  chunk; only the dashboard grid is lazily loaded.
- No i18n/RTL layer exists (no i18n library in `app/package.json`). If the user base is
  Arabic-speaking, this is a significant future workstream and should be a scope
  decision, not an engineering surprise.

**Risk:** low for release; medium for the five-year UI roadmap.

### 5.7 Single-host resilience

- Both PM2 apps run as the interactive user; autostart is a logon Scheduled Task, not a
  Windows service. A reboot without logon leaves the system down until someone signs in.
- Backups and WAL archives are local; no off-host copy is documented.

**Risk:** accepted single-laptop decisions, but not five-year infrastructure.

---

## 6. Recommendations

Ordered by impact on the stated five-year, 200-concurrent-user goal. None is implemented
in this commit.

1. **Index and materialize for the 500K target.**
   Add composite indexes for the actual filter/sort paths:
   `WorkOrder(status, createdDate)`, `WorkOrder(workCenterId, status, createdDate)`,
   `WorkOrder(priority, status)`, `Notification(status, createdDate)`,
   `AuditLogEntry(timestamp)`, `AuditLogEntry(tableName, action)`.
   Convert the heaviest report views (`report_backlog`, `report_cost_*`,
   `report_mttr_*`, `report_mtbf_*`) to materialized views refreshed by the worker, or to
   indexed summary tables. Validate with `EXPLAIN ANALYZE` against a copy of the live
   dataset on a throwaway database before and after.

2. **Make the deployment horizontally safe.**
   Move the login limiter to PostgreSQL or Redis; replace the heartbeat lock with a
   real `pg_advisory_lock`; move attachments to shared or object storage, or record the
   single-instance constraint as permanent; add a worker job that prunes expired and
   revoked `RefreshToken` rows.

3. **Harden the browser security posture.**
   Add a CSP (report-only first, then enforce), keep the access token in memory and
   refresh on load, add magic-byte upload validation, and make the cookie and header
   posture explicit in deployment docs. This is the prerequisite for any
   internet-facing deployment.

4. **Close the test and CI gaps.**
   Commit the Playwright RBAC UAT as a CI job against a disposable database; ratchet the
   lint gate from 50 errors to zero; add a dependency-audit job or Dependabot so the
   Prisma-chain advisories are fixed rather than remembered; add a migration smoke test
   that applies all 22 migrations to an empty PostgreSQL 15 and 18.

5. **Decide the longevity items explicitly.**
   Record decisions for i18n/RTL, off-host backup, Windows services instead of logon
   tasks, and schema rollback policy (expand/contract migrations, or a signed-off
   restore-only statement). Remove dead scaffolding and add route-level code splitting.

---

## 7. Release decision

**Decision: the current state is safe to tag and archive as a stable release for the
delivered scope, on the delivered single-host topology, at the current data volume.**

Grounds:

- Green CI at the exact SHA (`39453367213`, `1721c12`).
- Both mandatory verification gates PASS at HEAD (214 clauses; 77/77 dispositions).
- Live cutover verified: 20,333 of 20,333 rows, one transaction, verified backup.
- Reference bundle independently extracted and hash-verified.
- High-severity documentation findings are corrected; the remaining issues are scale and
  hardening debt, not correctness defects.

Conditions attached to that decision:

1. Do not expose port 4000 or the app directly to the internet until Recommendation 3
   is done.
2. Do not exceed the single-host, single-worker topology without Recommendation 2.
3. Do not claim the 500K-work-order target without Recommendation 1.
4. Keep the three Prisma advisories on a tracked remediation list.

These are engineering and scope caveats. They do not block this release; they define
what "this release" is.

Per owner instruction (2026-10-20), no tag was created by this evaluation.

---

## Appendix A - Metrics at `1721c12`

| Metric | Value |
|---|---|
| Backend source lines (`backend/src`, `.ts`) | 22,692 |
| Backend test lines (`backend/tests`) | 15,037 |
| Backend test files | 88 |
| Frontend source lines (`app/src`, `.ts`/`.tsx`) | 17,430 |
| Frontend test lines | 3,194 |
| Frontend test files | 25 |
| Frontend page components | 20 |
| Backend route modules | 27 |
| OpenAPI paths / operations | 93 / 148 |
| Prisma models | 38 |
| Migrations | 22 |
| `CREATE [UNIQUE] INDEX` in migrations | 38 |
| Report views (all plain, non-materialized) | 23 |
| Backend production dependency advisories | 3 high, 0 critical |
| Frontend production dependency advisories | 0 |
| Main JS bundle | 1,045,687 bytes |
| Lazy three.js dashboard chunk | 893,244 bytes |
| CSS bundle | 21,630 bytes |

---

## Appendix B - Evidence log (2026-10-20)

- `git rev-parse HEAD` -> `1721c1290edbf775cf853594d6f38d7d9177ae43`;
  `git rev-parse origin/main` -> same.
- `git status --porcelain --branch` -> `## main...origin/main` plus the 18 pre-existing
  CRLF-artifact ` M` entries and untracked `docs/migration-templates/dataset/`.
  Nothing staged.
- CI run `39453367213` at `1721c12`: conclusion `success`; jobs `Frontend
  (ubuntu-latest)` and `Backend (ubuntu-latest)` both `success`.
- `verify_a1.py`: PASS (214 clauses). `verify_a1_dispositions.py`: PASSED (77/77).
- Counts in Appendix A re-derived by file enumeration and `Select-String` over
  `backend/prisma/migrations/*/migration.sql`, `backend/prisma/schema.prisma`,
  `docs/openapi.json` and `app/dist/assets`.
- `npm audit --omit=dev` (backend): `{"high": 3, "critical": 0}` via
  `prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5`.
- `npm audit --omit=dev` (app): `{"total": 0}`.
- Source citations verified: `backend/src/index.ts:61-66,71,74,175`;
  `backend/src/utils/config.ts:3`; `backend/src/middleware/auth.ts:65`;
  `backend/src/routes/auth.ts:419-482`; `backend/src/routes/attachments.ts:18,25,319`;
  `backend/src/utils/uploadRules.ts:47`;
  `backend/src/services/scheduler.ts:17,20-50`;
  `backend/src/services/auditRetention.ts:62`;
  `backend/src/routes/workOrders.ts:235-248,376`;
  `backend/ecosystem.config.cjs:7-10,15`;
  `app/src/lib/api.ts:3`; `app/src/lib/rbac.ts`; `app/src/store/authStore.ts:14,45`;
  `.github/workflows/ci.yml:67`.

---

## Appendix C - Limitations of this evaluation

- No test suite, load test or penetration test was executed; test evidence is the
  recorded CI run.
- No query plans were captured. The scaling findings in 5.2 are structural (missing
  indexes, plain views, sort/scan shape), not measured timings.
- The 200-concurrent-user target was not independently reproduced; the prior capacity run
  is recorded elsewhere and was not re-run.
- Deployment was assessed from documentation and configuration, not by inspecting the
  live host in this session.

---

## Revision history

| Date | Revision | Note |
|---|---|---|
| 2026-10-20 | 1.0 | Initial evaluation at `1721c12`. Documentation only; no fixes, no tags. |
| 2026-10-20 | 1.1 | Appendix D (functional completeness audit) appended, derived from source only. Discovery and proposal only; no code written. |

---

## Appendix D - Functional Completeness Audit (2026-10-20)

### D.1 Method and scope

This audit was derived from source code alone. `GAP_REGISTER.md`,
`CMMS_FINALIZATION_TRACKER.md`, the USER_MANUAL and every other historical document
were deliberately not consulted; where a finding is stated, it cites a file and line
that was read on 2026-10-20.

Method: enumerate the 20 frontend routes and 27 backend routers; extract every
service call actually made by each page; extract every HTTP operation the API
exposes; diff the two sets; then verify each candidate gap by reading the page code.
A gap counts only when it impairs a user's ability to manage the system through the
application - a missing button that the API already supports, or a screen that
silently cannot perform a task the role is meant to do.

A cross-cutting observation, and the reason several gaps below are cheap: in almost
every case the frontend service layer already wraps the missing operation
(`materialService.create/update/delete`, `equipmentService.create/update/delete`,
`workCenterService.create/update/delete`, `notificationService.update`,
`userService.update/changePassword` all exist and are exported), but no page calls
them. The client plumbing is finished; the screens are not.

### D.2 Gap inventory

Each gap carries raw evidence (file and line, read today), the operational impact,
and the verdict.

---

**G1. Non-administrator users cannot log labor (core technician workflow).**

Evidence: `app/src/pages/WorkOrderDetailPage.tsx:344-349` loads `users` via
`userService.getAll()` only when `hasPermission(['Administrator'])`, else
`Promise.resolve([])`. The Log Labor form's technician select maps that list
(`:1558-1562`) and the submit button is disabled while `laborForm.userId` is empty
(`:1576`). For a Technician, Supervisor or Planner the list is empty, so the button
can never enable. The backend expects exactly the opposite:
`POST /api/labor` defaults `userId` to the authenticated caller and only requires it
for a supervisor booking on someone else's behalf
(`backend/src/routes/labor.ts:90,143-145`, schema at
`backend/src/utils/validation.ts:213-222`).

Impact: labor entry - the primary technician activity, and the source of the
completion and cost figures the reports use - is impossible from the UI for every
role except Administrator. Technicians can only be recorded by an admin.

Verdict: **Build Now (P0).**

---

**G2. There is no password change surface anywhere in the application.**

Evidence: the API implements `PUT /api/users/:id/password` with self-service
(current password required) and administrator reset semantics
(`backend/src/routes/users.ts:449-548`); the frontend service wraps it
(`app/src/services/userService.ts:21-22`); no page or component calls it. A search of
`app/src` for `password`, `currentPassword`, `newPassword` or "Change Password"
returns only that service line. There is no profile screen; the header has no user
menu (`app/src/components/layout/Header.tsx`).

Impact: a forgotten or leaked password has no recovery path inside the product. The
administrator cannot reset an account and the user cannot rotate their own credential;
the only remedies are a database edit or a seed script, both of which are prohibited
against the live `cmms` database. On a system with 11 live users this is an operational
dead end the first time it happens.

Verdict: **Build Now (P0).**

---

**G3. Users can be created and deactivated but never edited.**

Evidence: `app/src/pages/AdministrationPage.tsx` calls only `userService.create`
(`:591`) and `userService.remove` (`:118`). The API supports partial update of
fullName, email, role, workCentreId and isActive
(`backend/src/routes/users.ts:327-351`, `userUpdateSchema` at
`backend/src/utils/validation.ts:690-698`), and the frontend wraps it
(`app/src/services/userService.ts:19`) unused. The row actions column offers only
Deactivate (`AdministrationPage.tsx:304-317`).

Impact: a role change, a work-centre reassignment, an email correction or a temporary
deactivation/reactivation of a still-present account all require database access. Role
changes are frequent in maintenance organisations (technician promoted to planner).

Note: Deactivate is soft-delete (`isDeleted = true, isActive = false`,
`users.ts:434`), so a deactivated user is invisible to `GET /users` (`:57`) and cannot
be restored by the update endpoint. Reactivation of a soft-deleted account is a
separate API change and is listed under Defer (D.3) because the partial unique index
allows the username to be re-registered as a new account, which is a workable
operational workaround today.

Verdict: **Build Now for edit (P1). Restore/undelete: Defer.**

---

**G4. Equipment records cannot be created or edited from the UI.**

Evidence: `app/src/pages/EquipmentPage.tsx` offers Import/Export CSV only
(`:355-369`); `EquipmentDetailPage.tsx` renders every field read-only via `InfoItem`
(`:415-425`) and manages only BOM, meters and attachments. No page calls
`equipmentService.create` or `equipmentService.update`, both of which exist
(`app/src/services/equipmentService.ts`), against API routes that exist
(`backend/src/routes/equipment.ts` POST at `:715`, PUT at `:745`, validated by
`equipmentUpdateSchema`). The command palette even advertises "Add Equipment"
(`app/src/components/layout/CommandPalette.tsx:72`) which merely navigates to the
list page, where there is no add control.

Impact: adding one asset, correcting a serial number, moving an asset to another
location or downgrading a criticality requires assembling a CSV and re-importing the
catalogue. Equipment is the anchor of most work orders; its master data will be
edited routinely.

Verdict: **Build Now (P1).**

---

**G5. Materials cannot be created, edited or deleted from the UI; stock can only
change through a full CSV re-import.**

Evidence: `app/src/pages/MaterialsPage.tsx` offers Import/Export CSV only
(`:158-173`); no create/edit/delete control exists on the page.
`materialService.create/update/delete` are exported and unused. The API supports the
full CRUD (`backend/src/routes/materials.ts` POST, PUT, DELETE). Stock is not
cosmetic: `backend/src/utils/materialAvailability.ts:113-130` enforces
`currentStock` as a hard reservation ceiling when work-order material lines are
added, and nothing else in the backend ever writes `currentStock` (grep of
`backend/src` shows writes only in the materials routes and the importer).

Impact: goods receipt (stock up), a stock correction, a standard-cost fix or retiring
a part all require a CSV round-trip of the entire catalogue. A planner who cannot
raise stock cannot add the part to a work order, because the reservation check will
reject it.

Verdict: **Build Now (P1).**

---

**G6. Work centres cannot be created, edited or deactivated from the UI.**

Evidence: `app/src/pages/WorkCentersPage.tsx` is a read-only grid (no service calls
at all; it renders the store). `WorkCentersPage` is the only surface for work centres.
`crafts.ts` and `code-lists` manage crafts and codes, but not the work centre itself.
The API implements POST/PUT/DELETE (`backend/src/routes/workCenters.ts:334,413,496`)
and the frontend service wraps all three
(`app/src/services/workCenterService.ts:17-21`) unused.

Impact: onboarding a new team, adjusting `dailyCapacityHours` or `costRatePerHour`
(these drive the capacity board and the cost reports) is impossible without SQL. The
crafts page already depends on work centres as its parent, so a new team cannot even
be scaffolded completely from the UI.

Verdict: **Build Now (P1).**

---

**G7. Meter readings cannot be recorded; only the latest reading can be overwritten.**

Evidence: the API implements `POST /api/equipment-meters/:id/readings`
(`backend/src/routes/equipmentMeters.ts:434-459`) which appends a reading row and
advances `lastReading`. No frontend service wraps it
(`app/src/services/equipmentMeterService.ts` exposes `getAll` only), and
`EquipmentDetailPage` can only overwrite `lastReading`/`lastReadingDate` through the
meter edit form (`:311-325`) while displaying the readings list read-only
(`:683-694`).

Impact: meter-based preventive maintenance is a first-class feature of the PM page
(plans can target meters, `PreventiveMaintenancePage.tsx:212`), but the readings that
would drive it cannot be entered as a series. Overwriting the latest value loses
history and defeats interval-based triggering.

Verdict: **Build Now (P2).**

---

**G8. Reports cannot be filtered.**

Evidence: every report handler accepts `from`, `to`, `functionalLocationId`,
`includeDescendantLocations`, `equipmentId` and `workCenterId`
(`backend/src/routes/reports.ts:44-85`, `parseReportFilter`). The Reports page has
no inputs at all - the only `<input>`/`<select>` elements on
`app/src/pages/ReportsPage.tsx` are the report selector's buttons; the export button
re-issues the unfiltered request (`:226-227`).

Impact: a monthly backlog review, a post-incident MTBF for one asset, a cost summary
for one location or a date-bounded compliance report - the normal management uses of
a reporting module - are impossible. Users get one default window with no way to
scope it.

Verdict: **Build Now (P2).**

---

**G9. Notifications cannot be edited.**

Evidence: create (`NotificationsPage.tsx:175`), delete (`:191`, detail `:87`) and
convert-to-WO (detail `:72`) exist; `notificationService.update` is exported
(`app/src/services/notificationService.ts:9`) and never called. The API implements
`PUT /api/notifications/:id` with type, priority, description, location, equipment,
reporter, damages observations, breakdown flag and status
(`backend/src/utils/validation.ts:366-382`).

Impact: a mistyped description or wrong equipment on a notification can only be
deleted and re-raised (losing the notification number and audit continuity), or left
wrong until it becomes a work order. Low risk of data loss, but a daily annoyance for
requesters and a correctness issue for anything that reports on notification fields.

Verdict: **Build Now (P2).**

---

**G10. The global header renders two dead controls on every page.**

Evidence: `app/src/components/layout/Header.tsx:106-114` renders "Filter" and
"Export" buttons with no `onClick` handler on every authenticated page.

Impact: not a data-loss risk, but every user on every screen sees two buttons that
do nothing, which reads as a broken product. Removing or wiring them is trivial.

Verdict: **Build Now (P3, trivial).**

---

**G11. Deactivated users cannot be restored (API cannot undelete).**

Evidence: DELETE sets `isDeleted = true` (`backend/src/routes/users.ts:434`); the
update route never clears it; `GET /users` filters `isDeleted = false` (`:57`). The
partial unique index on username ignores soft-deleted rows, so re-registering the
same username as a new account is permitted.

Impact: restoring an account requires a DB update or creating a new user. Creating a
new user is a workable workaround (audit history attaches to the old id, but the
person gets access). Restoring would need an API change with a collision pre-check.

Verdict: **Defer** (operational workaround exists; API change with edge cases).

---

**G12. Work-order CSV import has no UI.**

Evidence: `POST /api/work-orders/import.csv` exists
(`backend/src/routes/workOrders.ts`, csvUpload) with no caller in `app/src`;
equipment and materials both expose their importers.

Impact: bulk WO load matters for migration and rare bulk planning, not for daily
operation. Low frequency, high blast radius if done wrong.

Verdict: **Defer.**

---

**G13. The audit log UI offers only free-text search.**

Evidence: the UI passes only `search`, `skip`, `take`
(`AdministrationPage.tsx:135-140`); the API also accepts `tableName` and `action`
(`backend/src/routes/auditLog.ts:90-100`) and has no date filter at all; there is no
export and no manual purge button (purge exists as `POST /api/audit-log/purge` and as
an automated retention job).

Impact: investigating "who changed this record" is slower than it needs to be, and a
forensic export must be scraped. Automated retention covers the growth concern.

Verdict: **Defer** (post-release enhancement; add date filter to API in the same
change).

---

**G14. The alert bell counts system alerts but navigates to the notifications list;
there is no alert list page.**

Evidence: the bell reads `getUnreadAlertCount()` and calls `markAllAlertsRead` then
`navigate('/notifications')` (`Header.tsx:90-94`); system alerts are only displayed as
the six most recent on the dashboard (`DashboardPage.tsx:425-436`). `SystemAlert` and
`Notification` are different tables with different semantics.

Impact: a user who clicks the bell expecting the seven unseen alerts is shown the
notifications list instead, and older alerts age off the dashboard silently. Annoying
but not blocking; the alerts are at least visible and markable.

Verdict: **Defer.**

---

**G15. Bulk notification-to-WO conversion has no UI.**

Evidence: `POST /api/notifications/convert-to-wo` (bulk, `convertNotificationsSchema`)
exists; only the single-notification endpoint is called
(`NotificationDetailPage.tsx:72`).

Impact: converting a backlog of notifications requires one click each. Convenience,
not correctness.

Verdict: **Defer.**

---

**G16. Equipment and material delete have no UI.**

Evidence: both APIs implement soft DELETE; neither page exposes a delete control
(equipment delete is Supervisor+ at `equipment.ts`, materials Supervisor+ at
`materials.ts`). Equipment offers `operationalStatus: Decommissioned` as a
non-destructive alternative.

Impact: retirement can be modelled via status/soft-delete at the API; day-to-day
management does not need a delete button, and a stray delete is high-blast-radius.

Verdict: **Defer** (deliberate; revisit only with an owner decision).

---

**G17. No global entity search; the command palette is navigation-only.**

Evidence: `CommandPalette.tsx` matches static navigation and action labels only
(`:61-73`); no page offers cross-entity search.

Impact: users search within each module (each list has its own search box). A global
search is a convenience at this data volume.

Verdict: **Defer.**

---

**G18. No work-order export on the list page.**

Evidence: `WorkOrdersPage.tsx` has no export control; the header Export button is
dead (G10); WO data reaches reports and XLSX exports through the reports module.

Impact: reporting needs are met by the reports module; bespoke WO dumps can be taken
from the database by an administrator.

Verdict: **Defer.**

---

### D.3 Verdict summary

| # | Gap | Verdict |
|---|---|---|
| G1 | Labor logging impossible for non-admins | Build Now (P0) |
| G2 | No password change/reset UI | Build Now (P0) |
| G3 | No user edit UI | Build Now (P1) |
| G4 | No equipment create/edit UI | Build Now (P1) |
| G5 | No material create/edit/delete UI (stock locked to CSV) | Build Now (P1) |
| G6 | No work-centre CRUD UI | Build Now (P1) |
| G7 | Meter readings cannot be recorded | Build Now (P2) |
| G8 | Reports have no filter UI | Build Now (P2) |
| G9 | Notifications cannot be edited | Build Now (P2) |
| G10 | Dead Header Filter/Export buttons | Build Now (P3) |
| G11 | Deactivated users cannot be restored | Defer |
| G12 | Work-order CSV import has no UI | Defer |
| G13 | Audit log UI: search only, no date filter or export | Defer |
| G14 | Alert bell mis-targets notifications; no alert list page | Defer |
| G15 | Bulk notification conversion has no UI | Defer |
| G16 | Equipment/material delete have no UI | Defer (deliberate) |
| G17 | No global entity search | Defer |
| G18 | No work-order list export | Defer |

### D.4 Recommendation

Build Now: G1 through G10. Ten items, every one of them a frontend screen against an
API that already exists, validated and audited. The two P0 items are not conveniences:
G1 removes the ability for the workforce to record its own work, and G2 removes the
only safe recovery path for a lost credential on a live system. The P1 items (G3-G6)
are the master-data loop - equipment, materials, work centres and users are the four
things a maintenance organisation edits weekly, and today three of them require CSV
surgery and the fourth requires SQL.

Defer: G11 through G18. Each has either a workable operational workaround (re-register
a deleted user, convert notifications one at a time, retire equipment by status), a
lower-frequency need (bulk WO import), or is a deliberate design choice (no delete
buttons, no global search).

### D.5 Execution plan for the Build Now set

Every Build Now item is a change to `app/src` only. None of them requires a database
change: no migration, no schema edit, no data backfill, no new table, no new column,
no index. Each reuses an existing endpoint that is already covered by backend tests
and the audit trail, and in most cases the frontend service method already exists and
is merely uncalled. The one exception is G7, which needs a new
`equipmentMeterService.addReading` wrapper - still a frontend-only addition over an
existing, tested endpoint.

Proposed order, each concern as its own commit (one logical concern per commit, per
standing rules), each landing green:

1. **G1 - labor attribution.** Replace the admin-only `users` load with
   `userService.getOptions()` (already Requester+, used by WorkOrderCreatePage) for
   the technician select, and default the form's `userId` to the signed-in user. For
   supervisors who may book on behalf of others the options list is the right payload.
   Delete the unused `isAdmin ? getAll : []` branch. Frontend only.

2. **G2 - password change.** Add a "Change password" dialog reachable from the
   header user block (Administration page side bar already shows the signed-in user at
   `AdministrationPage.tsx:200-215`, and the header is global). Self-service calls
   `PUT /users/{self}/password` with `currentPassword`; an Administrator resetting
   another user does the same call without `currentPassword` (the route already
   permits this, `users.ts:513`). New dialog component plus one call site in the
   Administration row actions for admins.

3. **G3 - user edit.** An edit dialog on the Administration users tab (role,
   full name, email, work centre, active toggle) calling `userService.update`. Mirror
   the create form's fields minus username/password.

4. **G4 - equipment edit.** An edit form on `EquipmentDetailPage` covering the
   `equipmentUpdateSchema` fields, plus an "Add Equipment" dialog on `EquipmentPage`
   calling `equipmentService.create`. This also makes the command palette's
   "Add Equipment" action truthful.

5. **G5 - material CRUD.** Row-level edit and add controls on `MaterialsPage`
   (code, description, unit of measure, standard cost, current stock) calling
   `materialService.create/update`. Omit a delete button deliberately (see G16).

6. **G6 - work-centre CRUD.** Add/edit controls on `WorkCentersPage` (code, name,
   daily capacity hours, cost rate, active) calling `workCenterService.create/update`.
   Omit delete deliberately; deactivate via `isActive` is enough for v1.

7. **G7 - meter readings.** An "Add reading" form in the meter card of
   `EquipmentDetailPage` (value, date, notes) calling a new
   `equipmentMeterService.addReading` -> `POST /equipment-meters/{id}/readings`; the
   readings list already renders the history, so the screen gains the series for free.

8. **G8 - report filters.** A filter bar on `ReportsPage` (from/to dates, location,
   equipment, work centre, include-descendant toggle) threaded into the existing
   `reportService` parameter objects. The backend parses and validates these today and
   returns a 400 with reasons on a bad filter, so the UI can simply surface the error.

9. **G9 - notification edit.** An edit form on `NotificationDetailPage` (and an
   edit affordance in the list) reusing the create form's field set, calling
   `notificationService.update`, disabled once the notification is `Converted` since
   the linked work order owns the truth from that point.

10. **G10 - header dead buttons.** Remove the two inert buttons. (Wiring them is
    out of scope; a page-local filter control already exists where it matters, and
    export belongs to the reports module.)

Test strategy for all of the above: follow the existing frontend pattern - vitest
component tests with the service layer mocked, as in
`WorkOrderDetailPage.test.tsx` and `WorkOrderCreatePage.test.tsx`. Each commit adds
tests for the new control (happy path, API error surfaced, role floor hides the
control) and keeps the suite green. Verification per commit: `npm run build` and
`npm test` in `app`, plus both mandatory gates, plus green CI at the exact SHA before
anything is called done. No backend test changes are needed because no backend
behaviour changes.

Database-safety confirmation: **no Build Now item touches the database schema or
requires a migration.** They are read/write calls against endpoints that already
exist and already run in production. Nothing in this plan executes against `cmms`;
verification happens in CI and, if any local run is needed, against a throwaway
database.

Deferred items (G11-G18) are explicitly out of this plan and should be re-evaluated
after the first period of live use, when their frequency can be measured rather than
guessed.
