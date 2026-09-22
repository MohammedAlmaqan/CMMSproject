# CMMS Finalization Tracker

**Project:** CommandPulse CMMS
**Tracker created:** 2026-09-22
**Total estimate:** ~26-40 working days
**Critical path:** Phase 2 (E2E integration) -> Phase 3.1 (PM scheduler) -> Phase 5 (backend route tests) -> Phase 6 (hardening)
**Status:** Phase 0 of 7 - Complete | Phase 1 - In Progress

## Status Legend

- ⬜ Not Started
- 🔶 In Progress
- ✅ Done
- ⛔ Blocked

## Locked Decisions

- **Mock data:** remove entirely; loading/error states instead
- **Scope:** core + security hardening (HTTPS, account lockout, session timeout) + WCAG 2.1 AA light; defer ERP integration and ad-hoc reporting to post-go-live; no i18n (English only)
- **Testing floor:** moderate - protect backend route tests first; defer frontend component tests if time-constrained
- **PM scheduler:** in-process node-cron with the 5 mandatory safeguards plus expansions (startup lock, idempotency per plan-cycle, heartbeat/watchdog, manual admin trigger, startup catch-up run)

## Step 0 - Project Setup (Docs & Baseline)

| # | Task | Status | Commit |
|---|---|---|---|
| S1-S3 | Tracker written, stale evaluation plan archived, initial commit | ✅ | 1bab61d |

### Commit Log

| Commit | Description |
|---|---|
| 1bab61d | docs: add finalization tracker; archive stale evaluation plan |
| 0d74455 | docs: record tracker baseline commit (backfill S1-S3 row status + hash) |
| 8f4739c | build: complete phase 0 baseline (0.1-0.5); repair app/package-lock.json |
| e6df64e | docs: record phase 0 commit hashes |

---

## Phase 0 - Baseline & Environment (0.5 day)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 0.1 | `npm install` in `backend/` and `app/` | ✅ | Both succeed | 8f4739c |
| 0.2 | Provision PostgreSQL, create `cmms`, write `.env` from examples | ✅ | `prisma db push` succeeds | 8f4739c |
| 0.3 | Seed + boot backend; hit `/api/health` and `/api-docs.json` | ✅ | 200 OK; spec loads | 8f4739c |
| 0.4 | Boot frontend, verify login + Vite proxy | ✅ | Login as `admin` renders dashboard | 8f4739c |
| 0.5 | Run `tsc` + `eslint` both packages; capture baseline error list | ✅ | Baseline recorded (backend-tsc, backend-eslint, frontend-tsc, frontend-eslint) | 8f4739c |

## Phase 1 - Critical Defects & Security Baseline (2-3 days) - *gate: no P0 open*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 1.1 | Reorder alerts routes so `read-all` precedes `/:id/read` | ✅ | `PUT /api/alerts/read-all` returns 200 | d0c51a1 |
| 1.2 | Add `/work-orders/new` route + WO creation form (or fix button to open dialog) | ⬜ | Create flow persists WO to DB |  |
| 1.3 | Fix password change: require current password; restrict resets to Administrator | ✅ | Non-admin cannot reset others; wrong current password -> 400 | 5ad8e4e |
| 1.4 | Fix PM `generate-wo` empty-FK; replace `Date.now()` WO number with sequence/prefix+counter | ✅ | Equipment-only plan generates WO; concurrent creates don't collide | 498c221 |
| 1.5 | Replace hardcoded `* 50` labor rate with work-center/craft rate from DB | ✅ | Planned labor cost matches master data | 41181ca |
| 1.6 | Security baseline: env-only `JWT_SECRET` (fail fast if missing), CORS origin allow-list, `helmet`, `express-rate-limit` on `/api/auth/login` | ✅ | Missing secret refuses boot; login rate-limited | 849cab1 |
| 1.7 | Remove scaffolding: `Home.tsx`, `App.css`, stock `app/README.md`, kimi plugin, unused UI components | ⬜ | `npm run build` passes; no dead imports |  |
| 1.8 | Fix dashboard literal `\n`; update/archive stale `CMMS_EVALUATION_AND_BUILD_PLAN.md` | ⬜ | No stray text; docs match reality |  |
| 1.9 | Fix `TacticalDashboardGrid.tsx` React 19 render violations (refs accessed during render, impure function calls; 9 lint errors - flickering / non-deterministic render risk) | ⬜ | File passes eslint cleanly; 3D dashboard still renders correctly |  |
| 1.10 | Fix `App.tsx` useEffect deps + `EquipmentPage.tsx` useMemo deps (stale-closure / stale-calculation risk) | ⬜ | Files pass eslint cleanly; affected pages behave correctly |  |

## Phase 2 - End-to-End Integration (5-8 days) - *core phase*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 2.1 | Wire **all mutations** to services: create/update WO, status transitions, convert-to-WO, comments, alert read, materials/labor/checklists CRUD | ⬜ | Refresh after each action -> data persists |  |
| 2.2 | Load remaining collections live: users, crafts, taskLists, operations, labor, checklists, meter readings, comments, **audit log** | ⬜ | Administration audit tab shows real entries |  |
| 2.3 | **Delete `mockData.ts` and all `.catch(() => mock)` fallbacks**; add toast + loading/error states on every view | ⬜ | API down -> visible error, zero fabricated data |  |
| 2.4 | ReportsPage -> call `reportService` (7 endpoints); delete `Math.random()`/simulated logic | ⬜ | Report figures match SQL results |  |
| 2.5 | Implement Export (CSV minimum; align README claim) | ⬜ | Button downloads file |  |
| 2.6 | Dashboard: feed trend chart from `/dashboard/cost-summary`; alerts from API | ⬜ | No hardcoded series |  |
| 2.7 | Add missing sidebar entries: Work Centers, Preventive Maintenance | ⬜ | Both reachable via nav |  |
| 2.8 | Wire `auditMiddleware`/`logAudit` onto all mutating routes | ⬜ | Every create/update/delete writes `AuditLogEntry` |  |
| 2.9 | Apply `authorizeMinRole` per SOW role matrix | ⬜ | View-Only gets 403 on writes |  |
| 2.10 | Zod validation on all request bodies/params | ⬜ | Malformed payload -> 400 with message, never raw Prisma error |  |
| 2.11 | Annotate all routes with Swagger JSDoc (or regenerate spec) | ⬜ | `/api-docs` renders full API reference |  |
| 2.12 | Decide refresh-token scope: implement refresh endpoints **or** document fixed 8h session | ⬜ | Decision recorded; no dead schema |  |

## Phase 3 - Missing SOW Features (6-9 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 3.1 | **PM scheduler (node-cron)** with mandatory safeguards | ⬜ | See sub-criteria below |  |
| 3.1a | - PM2 `instances: 1`, `exec_mode: 'fork'` + comment re: cluster incompatibility | ⬜ | Config correct |  |
| 3.1b | - Startup lock (PID + start time); refuse + `SystemAlert` if live owner exists | ⬜ | Duplicate scheduler blocked |  |
| 3.1c | - **Idempotency per (plan_id, scheduled_cycle_date)** - skip if WO exists, log | ⬜ | Re-runnable; no duplicate WOs |  |
| 3.1d | - `SchedulerRun` table + `GET /api/health/scheduler`; `SystemAlert` if no success in 25h | ⬜ | Heartbeat observable |  |
| 3.1e | - Non-blocking async batches (50/yield) | ⬜ | API stays responsive during run |  |
| 3.1f | - Admin-only `POST /api/maintenance-plans/run-scheduler` with user-ID logging | ⬜ | Manual trigger works, audited |  |
| 3.1g | - `PM_SCHEDULER_CRON` env (default `0 2 * * *`) + run-once at startup (idempotency-guarded) | ⬜ | Catch-up after downtime works |  |
| 3.2 | **File attachments:** `Attachment` model + migration, multer upload (size/type limits), WO detail UI | ⬜ | Attach -> view -> download works |  |
| 3.3 | **CSV bulk import/export** for materials/equipment + runbook section | ⬜ | Round-trip import -> export |  |
| 3.4 | Consistent delete strategy (standardize soft-delete + filter everywhere) | ⬜ | Deleted rows never reappear |  |
| 3.5 | **WCAG 2.1 AA light pass:** keyboard nav, ARIA labels, focus states, contrast fixes | ⬜ | Manual keyboard-only walkthrough of all 14 routes passes |  |

## Phase 4 - Database & Build Hygiene (1-2 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 4.1 | Baseline `prisma migrate dev`; commit `prisma/migrations/` | ⬜ | Fresh DB via `migrate deploy` only |  |
| 4.2 | Fix `ecosystem.config.cjs` (drop phantom `register.js`, fix `env_file`, confirm fork mode) | ⬜ | `pm2 start` serves API |  |
| 4.3 | Backend eslint dependency or remove script; lint green both packages | ⬜ | Exit 0 |  |
| 4.4 | Verify `build.bat`/`start.bat` cold on target Windows box | ⬜ | Cold build -> running app |  |

## Phase 5 - Testing, moderate floor (5-8 days) - *backend route tests protected first*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 5.1 | **Priority:** Vitest + Supertest covering all 21 routers: auth, RBAC matrix, WO lifecycle transitions, convert-to-wo, scheduler idempotency, reports | ⬜ | `npm test` green in backend |  |
| 5.2 | Vitest + Testing Library for 5 key pages (login, WO list/detail, guard) - *deferrable* | ⬜ | Green, or explicitly deferred |  |
| 5.3 | One Playwright E2E: login -> create WO -> transition -> convert notification -> report | ⬜ | Passes against seeded DB |  |
| 5.4 | Regression pass re-verifying every Phase 1 defect | ⬜ | Checklist signed off |  |

## Phase 6 - CI/CD, Ops & Security Hardening (3-4 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 6.1 | GitHub Actions: install -> lint -> typecheck -> **backend tests** -> build | ⬜ | Green on `main` |  |
| 6.2 | Scheduled `pg_dump` backup + documented restore drill | ⬜ | Drill succeeds; RPO/RTO recorded |  |
| 6.3 | **Security:** HTTPS/TLS, account lockout (5 failures), 30-min idle session timeout (SOW §4.2) | ⬜ | All three enforced and tested |  |
| 6.4 | Structured logging + rotation under PM2 | ⬜ | Rotated logs on disk |  |
| 6.5 | k6 smoke: login + WO list at target concurrency; record vs SOW §4.1 | ⬜ | Results documented |  |

## Phase 7 - Documentation & Delivery (3-5 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 7.1 | Rewrite README to match reality (32 models, honest features, real endpoints) | ⬜ | Every claim implemented |  |
| 7.2 | System Architecture document | ⬜ | SOW §6.2 deliverable |  |
| 7.3 | ER diagram + data dictionary (from Prisma) | ⬜ | SOW §6.2 deliverable |  |
| 7.4 | API reference (generated Swagger export -> static doc) | ⬜ | SOW §6.2 deliverable |  |
| 7.5 | User Manual (per role) + Administrator Guide (config, backup, users, scheduler ops) | ⬜ | SOW §6.2 deliverables |  |
| 7.6 | SOW compliance matrix (clause-by-clause); ERP + ad-hoc reporting **deferred**, i18n **excluded** | ⬜ | All Critical/High pass or formally waived |  |
| 7.7 | Tag `v1.0.0` | ⬜ | Release tag exists |  |

---

## Deferred to Post-Go-Live

- ERP integration
- Ad-hoc query builder / ad-hoc reporting
- Full-scale load testing at 500K-WO volume

## Excluded (client clarifications)

- i18n / multilingual text (English only)
- Mobile camera access, offline capability, digital signatures
- Docker / Kubernetes containers (local Windows server deployment)
- Training materials (training conducted by IT team)