# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** Phase 0/1, Milestone A, B G1-G6b complete; G7 dropped; **Phase 4 complete — 4.1–4.5 ✅ (DB & build hygiene)** + Phase 4-escalation items 3.6 (seed guard) & 3.7 (F3 extended) done; **Phase 3 complete — 3.1–3.7 ✅** (3.1 PM scheduler `5048a17`/`cc8d11c`; 3.2 attachments `d78597d`, verify_g3_2 PASS; 3.3 CSV import/export `f4c8dcc`, verify_g3_3 PASS; 3.4 delete strategy `d5b016c`, verify_g3_4 PASS — 3.4b sweep >5 routes → RBAC/audit fold (2.9) deferred to Phase 5; 3.5 WCAG 2.1 AA light pass `1e54ae4`, verify_g3_5 PASS + docs/WCAG-AUDIT.md; 3.5a catch-all 404 `7a23409`, verify_g3_5a PASS; 3.6 seed guard `2beaeb2`/`0492ae7`; 3.7 partial indexes `a7adf2d`); NEXT phase = Phase 5 (backend route tests first), do NOT start without explicit go.

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review
- **tsc gate:** use `tsc -b`, not `tsc --noEmit -p app` — the latter is vacuous (project root is references-only). Use `app\node_modules\.bin\tsc.cmd -b`.

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G6a the mockData.ts delete surfaces all of them)

**Open risks:** latent mock-fallback bugs potentially still in unvisited/mock pages; verify scripts must remain committed; mockData.ts deletion at G6a will surface latent bugs

**Next action for a fresh session:** read tracker + git log + this file. Next: **Phase 5 — Testing (backend route tests protected first: 5.1 Vitest+Supertest across all 21 routers incl. the 2.9 RBAC/audit fold; then 5.2–5.4).** STOP was observed at the end of Phase 3; do not begin Phase 5 without explicit consent.

---

## Current position (2026-09-23)

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
- **Next action on resume:** Phase 5 — Testing (5.1 backend route tests first: Vitest + Supertest over all 21 routers incl. the deferred 2.9 RBAC/audit fold from the 3.4b sweep; then 5.2–5.4). STOP was observed after Phase 3; do not begin Phase 5 without explicit consent.
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