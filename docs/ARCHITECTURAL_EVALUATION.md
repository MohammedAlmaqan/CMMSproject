# ARCHITECTURAL AND ENGINEERING EVALUATION

**System:** CommandPulse CMMS (on-prem Windows; React/Vite SPA + Express/Prisma API + PostgreSQL 18)
**Evaluation type:** Independent, read-only architectural and engineering review
**Evaluated commit:** `1721c1290edbf775cf853594d6f38d7d9177ae43` (`main`, equal to `origin/main` at the time of writing)
**Evaluation date:** 2026-10-20 (host local time, UTC+3)
**Report file:** `docs/ARCHITECTURAL_EVALUATION.md`
**Status:** Documentation only. No Cons or Recommendation in this report has been implemented.

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
