# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** Phase 0/1, Milestone A, B G1-G6b complete; G7 dropped; Phase 4 partially done — 4.1/4.3/4.5 ✅, 4.4 ⬜ blocked (cold-build follow-up); Phase 3 remaining pending

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G6a the mockData.ts delete surfaces all of them)

**Open risks:** latent mock-fallback bugs potentially still in unvisited/mock pages; verify scripts must remain committed; mockData.ts deletion at G6a will surface latent bugs

**Next action for a fresh session:** read tracker + git log + this file. Next: **4.4 follow-up** — cold-build blockers (frontend 4 pre-existing tsc errors at app/src/pages/EquipmentDetailPage.tsx:184, WorkOrderDetailPage.tsx:505/533/857; prisma generate EPERM → stop :4000 backend before install/generate; change build.bat line 18 `prisma db push` → `prisma migrate deploy`). Then Phase 3 remaining (attachments, bulk import, delete strategy, WCAG). STOP before Phase 5.

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
  - Proof: `verify_g6a.py` PASS exit 0 — grep gates clean, tsc gates clean (only 4 pre-existing baseline errors in
    untouched files), 14-route sweep: API up = real data, /api aborted = visible error + no fabricated records.
- **G6b** — COMPLETE. Sidebar + Swagger + refresh decision (`1631505`).
  - 2.7 Sidebar: `Sidebar.tsx` gained `Work Centers` (Briefcase, /work-centers) after Equipment and
    `Preventive Maintenance` (CalendarClock, /preventive-maintenance) after Work Orders; no other entries touched.
  - 2.11 Swagger: option (a) — `@openapi` JSDoc on all 6 WO routes (list/detail/create/update/delete/status).
    `/api-docs.json` paths non-empty (3 paths), `/api/work-orders` group present, swagger-ui renders. tnc 20 routers deferred (Phase 3 note).
  - 2.12 Refresh decision recorded 2026-09-24: fixed 8h session retained; RefreshToken model unwired/reserved.
    Proved live: token `exp-iat=28800`; `JWT_EXPIRES_IN=28800` in `.env.example`. No refresh endpoints built.
  - Proof: `verify_g6b.py` PASS exit 0 — login UI+API, sidebar asserts, click-through both routes, direct renders,
    swagger gates, `PAGE_ERRORS=[]`. Screenshots `screenshots/g6b_01..06`.
- **Phase 4 (partial)** — DB & Build Hygiene.
  - 4.1 baseline migration `20260924142537_init_baseline` (`72e8834`): DB was db-push-created so `migrate dev` demanded a
    destructive reset → adopted non-destructively (generate SQL via `migrate diff --from-empty`, then `migrate resolve --applied`);
    `migrate status` = up to date; `migrate deploy` is now the fresh-DB path; **db push retired**.
  - 4.3 backend eslint (`5d63f1a`): flat config (TS recommended). Baseline = 50 errors (mostly no-explicit-any) — >30 so fixes
    deferred to Phase 5; p4 gate = no new errors vs baseline (currently exactly 50).
  - 4.4 **BLOCKED** (`build.bat` exit 2): see tracker row + next-action above. Follow-up required before cold-build is real.
  - 4.5 F3 partial unique index for `MaintenancePlan.planCode` (`a888665`, migration `20260924113634_partial_unique_index`):
    `DROP INDEX MaintenancePlan_planCode_key` + raw `CREATE UNIQUE INDEX ... WHERE isDeleted=false`. verify_g4a passed twice with
    NO purge (G4A-TEST recreate 201 both runs). Client regenerated after stopping the dev backend (DLL EPERM fix).
  - `verify_p4.py` PASS exit 0 (`ae9c2a5`): migrations>=2, status up to date, eslint<=50, g4a x2.
- **Findings recorded, not yet fixed:** F1 (no zod on plan create); tsc tech-debt x4 (Phase 5); eslint baseline 50 (Phase 5);
  build.bat db push → migrate deploy (4.4 follow-up); F3 partial-index pattern still pending for 8 more models (recorded in tracker 4.5).
- **Next action on resume:** 4.4 cold-build follow-up first (see above) → then Phase 3 remaining. STOP before Phase 5.


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