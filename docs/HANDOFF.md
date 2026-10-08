# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** **Phase 8 — Production Readiness: A ✅ | B ✅ | C ✅ | D ✅ | E ✅ | F ✅ (F.1-F.9, all 19-hold rows closed) | G: D-4 drill PASS, 100-VU acceptance PASS after the P2028 fix, §4.2 TLS rehearsal PASS (2026-10-02, both limbs green over HTTPS); G.5 (SOW §4.1 200-VU) PASSED 2026-10-03 (p(95) 1.15 s, `http_req_failed` 0.00%, 0 P2028 / 0×429 / 0×500), so §4.1's concurrency and screen-load limbs are met (green CI at `6c2f482`, run 37136744688); row 253 stays `Partial` because `capacity.js` drives the read path only, so the transactional-save limb is unmeasured.** Phases 0-7 complete (7.1-7.7 shipped, tag `v1.0.0`). **Phase R — Reporting, BI layer and the UAT pack (register Phase F) — is closed: R.0-R.10 all delivered, with the four close-out items recorded in the tracker (R.9 D heading corrected; the 68-swallow teardown ban deferred as `v1.1-7`; the 61 orphan fixture task lists and the other orphaned audit-row families held on the Client's authorisation).** **Phase H — Remaining §3 surface (register Phase H) — Layer A complete and verified: H.0 recorded 2026-10-02; rows 23 (emergency forces highest priority), 36 (widened attachment allowlist under D-11), 29 (long-text `safetyNotes`/`completionRemarks` columns plus create-page field and detail Notes tab) and 8 (cause codes wired to work orders — a `CauseCode` CRUD API plus a `WorkOrder.causeCodeId` that a breakdown must name before it can be completed) delivered and promoted to `Met` after green CI at `9b1758c` (workflow run 37071130720); rows 8 and 36 keep `Partial` clause status for their documented residuals; row 24 is unblocked — the SOW owner answered `docs/ROW24_CALIBRATION_DEPTH_QUESTION.md` on 2026-10-02, selecting full depth (pass/fail plus as-found/as-left readings, reference standard, calibration due date/interval).** **Layer B1 complete and verified: rows 71 (a PM-generation failure alerts the planners and supervisors on both the manual and scheduled paths) and 72 (a High-priority notification alerts the same roles) are promoted to `Met` after green CI at `ad428a1` (workflow run 37124329927), on a shared `backend/src/services/alertService.ts` emitter that also absorbs the three earlier one-off alert writes.** **Layer B2 complete and verified: row 20 (multiple notifications aggregated into one work order) is exposed through a new additive collection route `POST /api/notifications/convert-to-wo` — the single-notification route is unchanged — on the existing `WorkOrderNotifLink` table with no migration; green CI at `e639d47` (workflow run 37127211546), local full gate 77 files / 1033 tests.** **Layer C verified and promoted: row 69 (a work order's assignment alerts its assignee and the work centre's supervisors) and row 70 (a daily sweep alerts on overdue work orders, once each) share new `WO_Assigned`/`WO_Overdue` types on `alertService.ts` plus `backend/src/services/overdueSweep.ts`; row 24 (calibration at the owner-selected full depth — pass/fail, as-found/as-left readings, reference standard, due date/interval) adds seven nullable columns and a completion gate; green CI at `761d0bb` (workflow run 37131906999), local full gate 79 files / 1047 tests. Owner decisions 2026-10-03: §4.1 200-VU is GO and executed 2026-10-03 (200-VU clean pass; 100-VU clean at G.6); legacy migration held last pending the frozen schema; the IIS site is live (both limbs over HTTPS verified 2026-10-03).** **H.10/§6.2+§6.4-f is closed and the 200-VU capacity run passed (G.5; p(95) 1.15 s, 0 P2028 / 0×429 / 0×500): the User Manual screenshots are now tracked under `docs/images/`, so SOW rows 321, 323 and 336 are `Met`, while row 253 stays `Partial` on the unmeasured transactional-save limb (all 214 recount: 141 Met / 32 Partial / 7 Not Met / 7 Deferred / 15 Excluded / 12 Waived after the post-H sequence, decisions D-18/D-19, and the D-4 WAL/PITR rehearsal of 2026-10-05; §3 is 103 Met / 2 Partial / 0 Not Met / 3 Deferred / 7 Excluded / 11 Waived of 126).** Earlier in-progress notes below are history — see the tracker for the authoritative state. **B.2 and B.3 accepted by client.** Do NOT start a new phase section without explicit go.

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review
- **tsc gate:** use `tsc -b`, not `tsc --noEmit -p app` — the latter is vacuous (project root is references-only). Use `app\node_modules\.bin\tsc.cmd -b`.

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G6a the mockData.ts delete surfaces all of them)

**Open risks:** the IIS `curl` verification residual is closed - §4.2 is `Met` (both limbs green over HTTPS, 2026-10-03). The SOW §4.1 200-user capacity test is executed (200-VU clean, G.5) but row 253 stays Partial: the concurrency and screen-load limbs are met, the transactional-save limb is unmeasured. The D-4 RPO dependency is closed — `scripts\pitr-drill.ps1` rehearsed WAL archiving and PITR against a local secondary target on 2026-10-05 (row 262 `Met`, measured 1 s commit-to-archive lag, 5-minute worst-case bound), though `archive_mode` is still `off` on the live cluster, so enabling it there is a deployment step. What remains: the **two** §3 `Partial` rows gate §6.4/a (§3.1.4 failure capture, §3.5.2 cost-split editor held for v1.1); §4.3 row 261 stays `Partial` on the differential limb, which the owner decided on 2026-10-05 **not to plan** — the transaction-log limb already bounds loss at 5 minutes, so differential would only shrink a full backup while coupling every incremental to the full backup beneath it (a new decision if the Client wants it, not a residual); and the legacy migration is held last. The old mock-fallback risk is closed - `mockData.ts` was deleted at G6a and the fleet has been green since.

**Next action for a fresh session:** read tracker + git log + this file. Current position is Phase H: Layers A-C complete, plus G.5 (§4.1 200-VU, row 253 `Partial` on the unmeasured save limb) and H.10 (§6.2/§6.4-f documentation); the "7.4 API reference / 24 files / 156 tests" notes below are historical Phase-7-era entries. Test floor today: **backend Vitest 1084 tests passing across 81 test files (35 unit + 46 routes) as executed by `npm test`; `vitest list` prints 1080 because it counts each of the two `it.each` templates in `tests/unit/laborAttribution.test.ts` once while the runner expands them into 6, `tsc -b` clean (backend + app), eslint at the 41-error baseline.** *Re-measured 2026-10-08; the "1060 tests across 80 test files (35 unit + 45 routes)" quoted here earlier is superseded.* The post-H classification build sequence (60 → 64 → 267 → 294) is complete: all four rows are delivered and `Met` (green CI at `581c1d0` run 37146679517, `4b00233` run 37147538004, `6cb510f` run 37148106485, and `271e445` run 37149026522). Decisions **D-18** (row 58 `Waived`) and **D-19** (row 269 refiled to Client Operations as `Deferred`) dispose of the last two §2.2/§4.6 rows; **both were accepted by the SOW owner on 2026-10-04.** The per-phase suite sizes earlier in the tracker and the "55 files" in the E.13 block are that phase's own snapshots, not current totals. **Migration workstream, updated 2026-10-08:** the trial run has been executed — `docs/migration-templates/TRIAL_RUN_REPORT.md` (`c81bc3d`) records 91/91 rows correct = **100.00%** against the 99.9% target, run on the 91-row sample at `cba06e3`, after three harness fixes: `f3d0615` (`backendDir` resolved one level short to `backend/src`, so `prisma migrate deploy` never ran), `0267625` (rejection reasons were being recorded as an empty string), and `cba06e3` (blank `costCenterCode`/`internalOrder` delivered as null against non-nullable `String @default("")` columns, which Prisma reports as a missing `functionalLocation`). **Next action there: the migration runbook and the Client's full dataset — rows 40, 307 and 335 stay `Not Met`, no status moved, and a 91-row sample does not carry §6.4/d.** *Decision recorded 2026-10-08:* `backend/src/migration-trial` has never had unit tests — `git log --all` shows no such file and no deletion — and the gap was deliberately left to close **after** the trial run, because the harness plus its read-back verifier plus this report are the acceptance instrument for this workstream. The run is now complete, so writing those importer tests is the next test work, not a precondition that was skipped.

---

## Current position (authoritative: CMMS_FINALIZATION_TRACKER.md)

### Phase 6 — COMPLETE (6.1–6.5 ✅)

- **6.1 CI/CD** — GitHub Actions pipeline `be52072`; runner Node bumped to 24 to match the lockfile `25107b0`; green `5050fa9`. Tracked in `.github/workflows/`.
- **6.2 Backup/restore** — scheduled `pg_dump` + restore drill `f562d0a`; lint reconcile + tracker fix + PG version align `7f4a26f`. **Follow-up:** `backend/uploads` now snapshotted alongside the SQL dump, same 14-generation retention, with paired restore assertions (`d37daa0`).
  - Limitation: the full `backup.bat` / restore-drill was never executed against live PostgreSQL because that needs `PGPASSWORD` and `.env` must not be read. The new upload logic was verified with isolated batch harnesses (20-file snapshot, 16→14 retention, restore-drill 0/20, 20/20, 0/0). **A first real run on the target server is still owed.**
- **6.3 Security** — account lockout after 5 failed logins `6d983d3`; 30-min idle session timeout `bd8faeb`; HTTPS/TLS reverse-proxy steps `3380466`.
  - **Idle timeout is client-side only** — clears local state and redirects, but the JWT stays valid server-side for its full 8-hour expiry. Documented honestly in `7448f93`; do not describe it as server-side session termination.
  - **Follow-ups:** `app.set('trust proxy', 1)` + `PM_SCHEDULER_CRON` documented `bcb7b1f`; `BIND_HOST` env + Windows Firewall guidance `fbbfd87`.
- **6.4 Logging** — structured pino logging + PM2 rotation `e890a92`.
- **6.5 k6 smoke** — 50 VU smoke + `K6_MODE` login-limiter override `96abd8a`; P2028 deferred to post-go-live `16a16d7`; `K6_MODE` guard hardened against production `703ad77`.

### Phase 7 — COMPLETE (7.1–7.7 ✅, tag `v1.0.0`)

- **7.1 README rewrite** `6d56b7b` — matched to reality at the time (**35 models**, then 32 earlier); count is 38 today. 7 seed accounts, honest feature list, `npm audit` not clean.
- **7.2 System Architecture** `2643cb8` — `docs/ARCHITECTURE.md`. Accepted as B.2.
- **7.3 ER diagram + data dictionary** `7c093d8` — `docs/ER_DIAGRAM.md` (hand-authored Mermaid, no new deps) + `docs/DATA_DICTIONARY.md` (35 models then; 38 models today, 7 domains). Accepted as B.3.
  - Verification method worth reusing: the diagram was **cross-checked programmatically against `schema.prisma`** — entity count, braces, cardinality tokens, 45 FK columns matched per table and per column, and 45 relationship edges matched 45 `@relation`s with none invented and none missing. That check caught a genuinely dropped `MAINTENANCE_PLAN → TASK_LIST` edge. **This is the standard for future generated docs.**
- **7.4 API reference** — `docs/API_REFERENCE.md` written; at the time only `workOrders.ts` was annotated and 23 routers / 108 endpoints lacked `@openapi` blocks. Today every router carries `@openapi` annotations (27 routers, 141 ops; the earlier reading of 26 routers / 133 ops, counted 2026-10-02, is superseded).

### Deferred to v1.1 (triaged 2026-09-25, no v1.0.0 scope change)

Recorded in `CMMS_FINALIZATION_TRACKER.md` under **Post-Go-Live Backlog (v1.1)**:

1. **`CauseCode` / `FailureCode` are orphaned** — no column on `WorkOrder`, `Notification` or `WorkOrderOperation` references either, so failure/cause cannot be captured against a work order. **7.6 must record this as Partial — failure/cause capture not wired to WO.**
2. **`MaintenancePlan.functionalLocationId` has no `@relation`** — nullable and unenforced, unlike the required `workCenterId` / `taskListId`. **Mitigated in F3 (`638dbd6` / D-10):** target-based planning now lives on `MaintenancePlanTarget`, whose `equipmentId`/`functionalLocationId` are enforced `@relation`s; the plan-row column remains as a compatibility mirror only.
3. **Quantity/duration columns remain `Float`** — `currentStock`, `percentage`, `plannedHours`, `hoursWorked`, `actualQuantity` and the other quantity columns. **Superseded by D-17/E.13:** the seven monetary columns (`standardCost`, `unitCost`, `plannedCost`, `actualCost`, `cost`, `hourlyRate`, `costRatePerHour`) are now `DECIMAL(12,2)` and round-trip exactly; deferred D6 was promoted out of v1.1. The residual Float columns are quantity/duration only and are covered by `roundMoney` at the persist boundary.
4. **Unenforced free-text status/type columns** — permitted values live only in schema comments; validated at the API boundary by zod instead.

### Verified good — not a defect

Work orders are soft-deleted and **children are retained** under the parent row, per rule 3.4. Verified empirically against the live DB on 2026-09-25 for every populated child table: `WorkOrderOperation` (122 rows), `ExternalServiceCost` (1) and `WorkOrderNotifLink` (4) all kept their rows across `UPDATE "WorkOrder" SET "isDeleted"=true`, with the parent row still present. `WorkOrderMaterial`, `CostSplit` and `WorkOrderChecklist` are empty, so they hold by the same mechanism but were not exercised. All rows restored afterwards. **Superseded by E.12:** the children now carry their own `isDeleted` (the 16-model sweep), and deletes on operations, materials, checklists, splits and plans soft-retire the related rows instead of removing them.

### Open residuals (2)

1. **P2028 Prisma pool exhaustion — ✅ resolved (2026-09-29).** 15 of ~140 concurrent logins returned HTTP 500 under the 6.5 k6 run; the 100-VU acceptance run reproduced it (55/200). Fixed in G.6 (bcrypt outside the login transaction, `connection_limit=20&pool_timeout=30000`, `max_connections=100`, interactive-transaction `timeout`/`maxWait` 30 s; see ADMIN_GUIDE 14.3). Post-fix 100-VU run: 0 P2028, 0×500, 0×429. The SOW §4.1 200-user capacity test remains a separate **post-go-live** exercise.
2. **IIS `curl` verification untested** — the 6.3/Item-4 IIS reverse-proxy steps (ARR `X-Forwarded-For` overwrite, `BIND_HOST=127.0.0.1`, firewall rule) are documented but have **never been executed against a real IIS deployment**. Needs a live Windows server with ARR installed.

### The live database is not a clean oracle

`WorkOrder.plannedCost` / `actualCost` are denormalised caches, and the live rows in them are **not all trustworthy**: as of 2026-09-30, 2 of 4 work orders had `plannedCost = 0` against real operation rows, and **only one of those is a production defect** (`WO-000097`, `createdBy = 'scheduler'`, $90.00). The other (`WO-T1790267575210`, $45.00) is **residue left by a route test** that writes operations straight to Prisma instead of through the API, so it bypassed the recompute that keeps the cache honest. **A future session must not treat a row-count differential as a production finding without checking provenance** — a PM work order has `createdBy = 'scheduler'` and a `sourcePlanId`; one without them was not made by the scheduler. Seven test files are the cause and R.9 D removes it, but until that lands, a discrepancy count from the live DB mixes defects with test debris and cannot tell you which is which. `verify_b1.py` still prints the raw count on purpose, so the number stays visible and gets explained rather than quietly filtered.

### Housekeeping

- `*.tsbuildinfo` is now gitignored (`69af740`), so `tsc -b` no longer dirties the worktree.
- Ports 3000/4000 confirmed free at the end of this session.

---

## Phase 0–5 archive (historical — see tracker for full detail)

Retained for context. Phases 0–5 are complete and closed out; the authoritative state is
the section above.

- **G4a** — COMPLETE. Gate `4beb2fb`.
- **G4b-1** — COMPLETE. Scheduler core + idempotency (`cc8d11c`).
- **G4b-2** — COMPLETE. All 5 safeguards landed (`5048a17`, docs `7f183d3`).
  - `SchedulerRun` table; startup lock (`acquireStartupLock`, 5-min heartbeat window);
    `GET /api/health/scheduler` (200 ok / 503 stale + SystemAlert dedup);
    non-blocking batches (BATCH_SIZE=50 + setImmediate);
    PM2 fork config (`instances: 1`, `exec_mode: 'fork'`, register.js + env_file removed).
  - Proof: `verify_g4b2.py` PASS — 2nd backend locked out; stale→503→alert→restore; batch markers present.
- **Phase 3.1 (PM scheduler) — COMPLETE.**
- **G5** — COMPLETE. Dashboard + Reports (`e047a40`).
  - ReportsPage now calls all 7 reportService endpoints (per-report keyed cache, no stale-data cross-tab crash);
    CSV export via Blob download; PM compliance renders backend single-period stats; README claim aligned to CSV.
  - Dashboard trend reads `/api/dashboard/cost-summary` (AreaChart), alerts from `/api/dashboard/alerts`.
  - Proof: `verify_g5.py` PASS exit 0 (10 endpoints live, material row BEARING-6205, export downloaded, trend area + live alerts, no hardcoded/simulated markers).
- **G6a** — COMPLETE. mockData deleted; trust property (`9876e67`).
  - `mockData.ts` removed; zero `mock*` refs and zero `.catch(() =>)` in app/src; appStore seeds empty arrays and
    `loadFromApi`/`loadAlerts`/`loadDashboardKPIs` propagate real errors to `store.error` (no silent mock keep).
    Loaded live now: crafts + auditLog added to `loadFromApi`.
  - Three-state (loading/error/empty) added to Materials, Work Centers, Administration, Dashboard (KPI error banner);
    all other pages already had it (G1-G5).
  - Proof: `verify_g6a.py` PASS exit 0 — grep gates clean, tsc gates clean (4 pre-existing baseline errors at the time — since resolved in 4.4), 14-route sweep: API up = real data, /api aborted = visible error + no fabricated records.
- **G6b** — COMPLETE. Sidebar + Swagger + refresh decision (`1631505`).
  - 2.7 Sidebar: `Sidebar.tsx` gained `Work Centers` (Briefcase, /work-centers) after Equipment and
    `Preventive Maintenance` (CalendarClock, /preventive-maintenance) after Work Orders; no other entries touched.
  - 2.11 Swagger: option (a) — `@openapi` JSDoc on all 6 WO routes (list/detail/create/update/delete/status).
    `/api-docs.json` paths non-empty (3 paths), `/api/work-orders` group present, swagger-ui renders. tnc 20 routers deferred (Phase 3 note).
  - 2.12 Refresh decision recorded 2026-09-24: fixed 8h session retained; RefreshToken model unwired/reserved.
    Proved live: token `exp-iat=28800`; `JWT_EXPIRES_IN=28800` in `.env.example`. No refresh endpoints built.
  - Proof: `verify_g6b.py` PASS exit 0 — login UI+API, sidebar asserts, click-through both routes, direct renders,
    swagger gates, `PAGE_ERRORS=[]`. Screenshots `screenshots/g6b_01..06`.
- **Phase 4 — COMPLETE.** DB & Build Hygiene.
  - 4.1 baseline migration `20260924142537_init_baseline` (`72e8834`): DB was db-push-created so `migrate dev` demanded a
    destructive reset → adopted non-destructively (generate SQL via `migrate diff --from-empty`, then `migrate resolve --applied`);
    `migrate status` = up to date; `migrate deploy` is now the fresh-DB path; **db push retired**.
  - 4.3 backend eslint (`5d63f1a`): flat config (TS recommended). Baseline = 50 errors (mostly no-explicit-any) — >30 so fixes
    deferred to Phase 5; p4 gate = no new errors vs baseline (currently exactly 50).
  - 4.4 cold-build + start verified (`5a8ed2c`): the 4 pre-existing frontend tsc errors fixed surgically
    (`EquipmentBOM.material` type added; `notes ... || undefined` ×2; `tab.id as DetailTab` cast). `build.bat` now kills only the
    :4000 owner before `prisma generate` (DLL EPERM fix, `ping` TTY-free wait) and runs `prisma migrate deploy` (db push retired).
    `build.bat` exit 0 end-to-end (client regenerated, no pending migrations, frontend built, seed ok). `start.bat` → backend = `node dist/index.js`
    on :4000 with `/api/health` 200 and vite on :3000 serving. Backend tsc + frontend `tsc -b` exit 0.
    NOTE: build's destructive seed step was REMOVED and the `seed.ts` wipe GUARDED behind `SEED_DEMO=1` + non-prod `NODE_ENV`
    (3.6, `2beaeb2`/`0492ae7`) — reseed demo data only via `scripts/seed-demo.bat`. Proved: WO-000063/64 + N-000012/13
    survived a rebuild, `/api/health` 200.
  - 4.5 F3 partial unique index for `MaintenancePlan.planCode` (`a888665`): `DROP INDEX MaintenancePlan_planCode_key` + raw
    `CREATE UNIQUE INDEX ... WHERE isDeleted=false`. verify_g4a passed twice with NO purge (G4A-TEST recreate 201 both runs).
    **Ordering bug fixed (3.7):** migration renamed `20260924113634_partial_unique_index` → `20260924150000_partial_unique_index`
    so it sorts AFTER `init_baseline` (`20260924142537`) — shadow/fresh DB replay (P3006) is now valid; live
    `_prisma_migrations.migration_name` record updated alongside. Verified on a throwaway empty DB (`cmms_fresh_gate`):
    deploy exit 0, 3 migrations in order, `migrate diff` = "No difference detected."; test DB dropped.
  - 3.7 (`a7adf2d`, migration `20260924160000_f3_remaining_partial_indexes`): F3 partial-unique pattern extended to the
    remaining 8 soft-deletable `@unique` models (User.username, FunctionalLocation.locationCode, Equipment.equipmentCode,
    WorkCenter.code, Material.materialCode, TaskList.code, Notification.notificationNumber, WorkOrder.woNumber +
    `@@unique([sourcePlanId,sourcePlanCycle])`). The ONLY `findUnique` consumer of a de-unique'd field was auth login
    (User.username) → `findFirst`. Backend `tsc --noEmit` exit 0; verify_g4a PASS twice, NO purge. verify_g4a now resolves
    master-data ids live — NEVER hardcode entity UUIDs in gate scripts (seeds regenerate them).
  - `verify_p4.py` PASS exit 0 (`ae9c2a5`): migrations>=2, status up to date, eslint<=50, g4a x2.
  - `verify_g6a.py` tsc gate updated (baseline was resolved → now expects `tsc -b` exit 0); gate re-verified PASS.
- **Findings recorded, not yet fixed:** F1 (no zod on plan create); eslint baseline 50 (Phase 5).
  RESOLVED during Phase-4 escalation: seed.ts destructive wipe (guarded, 3.6); F3 partial indexes for remaining 8 models (3.7).
- **Next action on resume:** Phase 6 — CI/CD, Ops & Security Hardening (6.1 GitHub Actions install/lint/typecheck/backend-tests/build; 6.2 scheduled pg_dump + restore drill; 6.3 HTTPS/TLS, account lockout 5-failures, 30-min idle session timeout (SOW §4.2); 6.4 structured logging + rotation under PM2; 6.5 k6 smoke at target concurrency). Phase 5 fully complete (all 11 verify scripts green — see 5.4 table in tracker); do not begin Phase 6 without explicit consent.
- **Phase 5 sign-off (2026-09-24):** Phase 5 journey — 5.1 backend Vitest+Supertest + 2.9 fold (`9460b9d`, `f0edd32`); 5.2 app Vitest+Testing-Library 5 pages (`31070ce`); 5.3 full-lifecycle Playwright `verify_g5_3.py` PASS (`ba4c1fc` users/options Requester+ narrow payload + `dfbfe2e`); 5.4 regression across all 11 verify scripts — first full fleet 7/11 PASS, 4 FAILs triaged: g4b2 (`verify_g4b2.py` live-ID resolution), g5 (`verify_g5.py` PM-compliance period assertion swap), g6a (gate narrowed to the two exact banned patterns after adjudicating services' `.catch(() => ({error}))` parse fallback as legitimate defense-in-depth — NO app changes), p4 (backend eslint 53 vs 50-baseline: three `catch (error: any)` leaks in equipment/materials POST /import + maintenancePlans PUT fixed typed; `tests/**` no-explicit-any/no-unused-vars override in `backend/eslint.config.js`; restored to exactly 50). Second fleet on cleared limiter window 10/11 PASS (p4's internal g4a-run2 was 429-rate-limited at the tail); p4 solo PASS exit 0 (both g4a runs + eslint 50). Note: express-rate-limit on /api/auth/login is 20/15 min per IP — verify fleets saturate it; run_all.py paces 60s with one 429 cooldown-retry; back-to-back fleet batches need ~15 min idle (Phase-6 ops item). App bug fixed in 5.4: maintenancePlans create/update missing-FK P2003 → 400 with clear message + regression test; verify_g4a + verify_g4b1 need Admin/Planner+ tokens post-2.9.
- **Phase 3 — COMPLETE (this session).** 3.3 CSV bulk import/export for materials + equipment (`f4c8dcc`, `scripts/verify/verify_g3_3.py` PASS exit 0, round-trip import → export). 3.5 WCAG 2.1 AA light pass (`1e54ae4`, 21 files, `scripts/verify/verify_g3_5.py` PASS exit 0): global `*:focus-visible` amber ring, `.skip-link` + `<main id="main-content">` in AppLayout, CommandPalette as modal dialog, thin-amber status/low text raised `#52525B` → `#92929B` (root-cause substitution; contrast ≥4.5:1 on both bg colors), `#2563EB` → `#3B82F6` for in-progress, starts/links-in-page given `tabIndex=0` + Enter/Space `onKeyDown` with accessible names, aria-labels on every search box/filter/toggle/dialog/back button (~70 controls), sortable column headers keyboard-operable, audit table in `docs/WCAG-AUDIT.md`. 3.5a catch-all 404 route inside the protected `<AppLayout>` (`7a23409`): new `app/src/pages/NotFoundPage.tsx` ("Page not found" + "Back to Dashboard" link to /dashboard) + `<Route path="*">` in `app/src/App.tsx`; `scripts/verify/verify_g3_5a.py` PASS exit 0 (unauth deep link → /login; garbage paths render 404 with sidebar intact; PAGE_ERRORS=[] CONSOLE_ERRORS=[]). Frontend `tsc -b` exit 0 throughout.


---

## Environment (Windows, on-prem)

- **Repo root:** `C:\Users\Injaz\Documents\Default Project\CMMSproject`
- **Backend:** Express on `http://localhost:4000` (dev via `tsx watch`)
- **Frontend:** Vite on `http://localhost:3000`
- **PostgreSQL:** Windows service `postgresql-x64-18` — must be **Running**. DB `cmms` on `localhost:5432`, user `postgres`.
- **Test credentials:** `operator / password` (Requester), `admin / password` (Administrator). Seeded, verified.
- **Verify harness:** Python 3.14 + Playwright (`from playwright.sync_api import sync_playwright`). Committed scripts at `scripts/verify/verify_gN.py`. **`verify_g3.py` is the canonical template** — read it before writing a new one.
- **Screenshots:** written to `screenshots/` (gitignored). Naming: `g*_*.png`.
- **Playwright note:** local `utilsBundle.js` was patched once during G1 to fix a corrupted byte. Survives normal use, lost on `pip install --upgrade playwright`. Not urgent.
- **Dev servers:** may or may not be running. Check ports 3000/4000 before assuming.
- **tsc invocation on Windows:** `npx tsc` may resolve to a stale `tsc@2.0.4` via PATH. Always use `app\node_modules\.bin\tsc.cmd` (frontend) or `backend\node_modules\.bin\tsc.cmd` (backend) for authoritative results.
