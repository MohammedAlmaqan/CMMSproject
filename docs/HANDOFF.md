# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** Phase 0/1, Milestone A, B G1-G6a complete; G6b pending

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G6a the mockData.ts delete surfaces all of them)

**Open risks:** latent mock-fallback bugs potentially still in unvisited/mock pages; verify scripts must remain committed; mockData.ts deletion at G6a will surface latent bugs

**Next action for a fresh session:** read tracker + git log + this file; then complete G6b (sidebar + swagger + refresh-token)

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
- **Findings recorded, not yet fixed:** F1 (no zod on plan create); F3 (soft-delete/unique conflict → Phase 4.5).
- **Next action on resume:** Group 6b — sidebar (Work Centers/PM entries), Swagger 2.11, refresh-token decision 2.12. STOP before G7.


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