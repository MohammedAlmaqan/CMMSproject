# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** Phase 0/1, Milestone A, Milestone B G1-G3 complete; G4-G7 pending

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G7 the mockData.ts delete surfaces all of them)

**Open risks:** latent mock-fallback bugs potentially still in unvisited/mock pages; verify scripts must remain committed; mockData.ts deletion at G7 will surface latent bugs

**Next action for a fresh session:** read tracker + git log + this file; then begin G4

---

## Current position (G4a mid-flight — paused for session reset, 2026-09-23)

- **G4a** = Preventive Maintenance frontend + API verification. Status: **IN PROGRESS**, blocked on session reset.
- **Backend findings (established live, NOT yet in tracker):**
  - **F1:** `POST /api/maintenance-plans` has NO zod validation — `req.body` passed directly to Prisma. Fix belongs in G4b or Phase 2 addendum, not G4a.
  - **F2:** `POST /api/maintenance-plans/:id/generate-wo` has NO idempotency guard — calling twice creates duplicate WOs. Fix is G4b safeguard 3.1c.
- **Frontend:** `PreventiveMaintenancePage.tsx` wiring was attempted and **REVERTED** (broken JSX, 8 tsc errors). Must be re-done cleanly with surgical edits only.
- **`scripts/verify/verify_g4a.py`:** NOT written.
- **Tracker G4a row:** NOT updated.
- **Session reset reason:** context exhaustion + thrash loop on JSX bracket balance.
- **Next action on resume:** fresh session completes G4a frontend wiring + `verify_g4a.py` + tracker + commit. STOP before G4b.
- **Seed IDs for G4a verify (live):** equipment `27fbcebc-b922-4b71-b8df-349d98d8955a`, functionalLocation `3c26edce-b5d3-4448-a547-e9e04a674581`, workCenter `0a4cf365-5fce-4262-a1f2-b1d0ddc2a53c`, taskList `4343f060-5b81-41c8-9b9f-01c462c0dbf1`.


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