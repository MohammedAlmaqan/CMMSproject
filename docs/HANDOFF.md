# HANDOFF

**Project:** CommandPulse CMMS, on-prem Windows, Node/Express/Prisma/Postgres + React/Vite

**State:** Phase 0/1, Milestone A, Milestone B G1-G3 + G4a complete; G4b-G7 pending

**Read first when resuming:** CMMS_FINALIZATION_TRACKER.md, git log --oneline -40, this file

**Standing rules:** never touch .env/.env.example; never print secrets; raw outputs not summaries; one commit per logical unit; no .catch(() => mock) anywhere; stop at each group boundary for review

**Verify harness:** committed scripts/verify/verify_gN.py (Python + Playwright); assert live endpoint 200 + expected shape, not just render (e.g. /api/locations 404 → grouped G2-G3 latent bug; was masked by mock fallback; after G7 the mockData.ts delete surfaces all of them)

**Open risks:** latent mock-fallback bugs potentially still in unvisited/mock pages; verify scripts must remain committed; mockData.ts deletion at G7 will surface latent bugs

**Next action for a fresh session:** read tracker + git log + this file; then complete G4b (PM scheduler + 5 safeguards)

---

## Current position (G4a COMPLETE — 2026-09-23)

- **G4a** = Preventive Maintenance frontend + API verification. Status: **COMPLETE**. Gate commit `4beb2fb`, tracker docs commit `68f3990`, verify script exit 0 (`G4A_EXIT PASS`).
- **Frontend:** `PreventiveMaintenancePage.tsx` — loading/error/empty states (spinner reads `appStore.loading`; error panel reads `appStore.error` with Dismiss + Retry via `loadFromApi`; "No maintenance plans found" empty state); new **Next Due** column (Time: `startDate + intervalValue` unit-aware; Meter: runtime value); per-row **Generate WO** wired to `maintenancePlanService.generateWorkOrder(planId)` with `generatingId` busy spinner + `woNumber` toast. `tsc --noEmit` exit 0.
- **Verify:** committed `scripts/verify/verify_g4a.py` — UI+API login (operator), POST `G4A-TEST` plan (201), GET list/detail shape, `generate-wo` x2 → **WO-000043 / WO-000044** (distinct, direct proof of F2), headless `/preventive-maintenance` (plan row + Generate WO button visible; `PAGE_ERRORS=[] CONSOLE_ERRORS=[]`), API cleanup (plan + both WOs soft-deleted) + post-cleanup absence checks. Screenshots `g4a_01_plan_list.png`, `g4a_02_plan_row_details.png`.
- **Backend findings (recorded in tracker G4a row + Phase 4, NOT fixed in G4a):**
  - **F1:** `POST /api/maintenance-plans` has NO zod validation — `req.body` passed directly to Prisma; malformed payload -> 500, never 400. Fix belongs in G4b or Phase 2 addendum.
  - **F2:** `POST /api/maintenance-plans/:id/generate-wo` has NO idempotency guard — calling twice creates duplicate WOs. Fix is G4b safeguard 3.1c.
  - **F3:** Soft-delete + unique-constraint conflict — soft-deleted rows still reserve their `@unique` code (planCode confirmed); re-running `verify_g4a.py` -> 409; real users hit the same. Fix: partial unique index (`where isDeleted=false`), Phase 4 (DB hygiene) row 4.5.
- **G4a re-run caveat:** until F3 is fixed, `verify_g4a.py` relies on a one-off `prisma db execute` purge of `MaintenancePlan WHERE planCode='G4A-TEST'` between runs to stay re-runnable.
- **Seed IDs for G4 verify (live):** equipment `27fbcebc-b922-4b71-b8df-349d98d8955a`, functionalLocation `3c26edce-b5d3-4448-a547-e9e04a674581`, workCenter `0a4cf365-5fce-4262-a1f2-b1d0ddc2a53c`, taskList `4343f060-5b81-41c8-9b9f-01c462c0dbf1`.
- **Next action on resume:** complete **G4b** (PM scheduler with the 5 mandatory safeguards + expansions: 3.1a-3.1g). STOP before G4b scope creep.


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