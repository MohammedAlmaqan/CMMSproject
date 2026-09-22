# CMMS Finalization Tracker

**Project:** CommandPulse CMMS
**Tracker created:** 2026-09-22
**Total estimate:** ~26-40 working days
**Critical path:** Phase 2 (E2E integration) -> Phase 3.1 (PM scheduler) -> Phase 5 (backend route tests) -> Phase 6 (hardening)
**Status:** Phase 0 - Complete | Phase 1 (1.0–1.10) - Complete | Phase 2 - In Progress (Milestone A: WO domain E2E - complete; Milestone B Group 1: WO sub-domain CRUD + costs + board - complete; Groups 2-7 pending)

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
| 5ad8e4e | fix(auth): require current password on self-service password change (1.3) |
| 849cab1 | fix(security): env-only JWT_SECRET fail-fast, CORS allow-list, helmet, rate-limit login (1.6) |
| d0c51a1 | fix(routes): move alerts/read-all before /:id/read (1.1) |
| 41181ca | fix(wo): replace hardcoded * 50 labor rate with craft hourly rate (1.5; also narrows JWT_SECRET type in utils/config.ts) |
| 498c221 | fix(wo): atomic sequence WO numbers + resolve generate-wo functional location (1.4) |
| 593cf63 | docs: record phase 1.4 commit hash |
| 40e90af | feat(wo): add work order creation form at /work-orders/new (1.2) |
| 90a5f6b | docs: record phase 1.2 commit hash |
| caa4ba1 | chore(app): remove unused scaffolding (1.7) |
| 38cf7c1 | docs: record phase 1.7 commit hash |
| cab39a5 | fix(dashboard): remove stray literal newline; drop stale scaffold docs (1.8) |
| f81d4a1 | docs: record phase 1.8 commit hash |
| 4115150 | fix(dashboard): React 19 render-safe refs and one-time particle init (1.9) |
| adab974 | docs: record phase 1.9 commit hash |
| 08646c1 | fix(ui): correct hook dependencies in App.tsx and EquipmentPage.tsx (1.10) |
| 1e6ada1 | docs: record phase 1.10 commit hash |
| e4f7ce2 | fix(app): remove nested Router causing blank screen (1.0) |
| 2fda2c7 | feat(app): add top-level Error Boundary (1.0) |
| 0f48927 | fix(api): stop double /api prefix in GET requests (1.0 verification blocker) |

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
| 1.0 | Fix blank screen: remove nested `<Router>`; add top-level Error Boundary | ✅ | `http://localhost:3000` loads the login page; no console errors; Error Boundary renders on crash. Evidence: `screenshots/login.png`, `screenshots/dashboard.png`, `screenshots/errorboundary.png` | e4f7ce2, 2fda2c7 |
| 1.1 | Reorder alerts routes so `read-all` precedes `/:id/read` | ✅ | `PUT /api/alerts/read-all` returns 200 | d0c51a1 |
| 1.2 | Add `/work-orders/new` route + WO creation form (or fix button to open dialog) | ✅ | Create flow persists WO to DB | 40e90af |
| 1.3 | Fix password change: require current password; restrict resets to Administrator | ✅ | Non-admin cannot reset others; wrong current password -> 400 | 5ad8e4e |
| 1.4 | Fix PM `generate-wo` empty-FK; replace `Date.now()` WO number with sequence/prefix+counter | ✅ | Equipment-only plan generates WO; concurrent creates don't collide | 498c221 |
| 1.5 | Replace hardcoded `* 50` labor rate with work-center/craft rate from DB | ✅ | Planned labor cost matches master data | 41181ca |
| 1.6 | Security baseline: env-only `JWT_SECRET` (fail fast if missing), CORS origin allow-list, `helmet`, `express-rate-limit` on `/api/auth/login` | ✅ | Missing secret refuses boot; login rate-limited | 849cab1 |
| 1.7 | Remove scaffolding: `Home.tsx`, `App.css`, stock `app/README.md`, kimi plugin, unused UI components | ✅ | `npm run build` passes; no dead imports | caa4ba1 |
| 1.8 | Fix dashboard literal `\n`; update/archive stale `CMMS_EVALUATION_AND_BUILD_PLAN.md` | ✅ | No stray text; docs match reality | cab39a5 |
| 1.9 | Fix `TacticalDashboardGrid.tsx` React 19 render violations (refs accessed during render, impure function calls; 9 lint errors - flickering / non-deterministic render risk) | ✅ | File passes eslint cleanly; 3D dashboard still renders correctly | 4115150 |
| 1.10 | Fix `App.tsx` useEffect deps + `EquipmentPage.tsx` useMemo deps (stale-closure / stale-calculation risk) | ✅ | Files pass eslint cleanly; affected pages behave correctly | 08646c1 |

Note: Phase 1 tasks 1.2, 1.7, 1.8, 1.9, 1.10 were verified by build/lint only. Task 1.0 completed visual verification of login + dashboard (screenshots referenced in the 1.0 row). Page-level visual checks for the 1.2/1.7/1.8/1.9/1.10 features remain pending (deferred to Phase 2).

## Phase 2 - End-to-End Integration (5-8 days) - *core phase*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 2.1 | Wire **all mutations** to services: create/update WO, status transitions, convert-to-WO, comments, alert read, materials/labor/checklists CRUD | 🔶 | Refresh after each action -> data persists | 367b59d, d842bb9, 1f2ff8e |
| 2.2 | Load remaining collections live: users, crafts, taskLists, operations, labor, checklists, meter readings, comments, **audit log** | 🔶 | Administration audit tab shows real entries | 40e90af, d842bb9 |
| 2.3 | **Delete `mockData.ts` and all `.catch(() => mock)` fallbacks**; add toast + loading/error states on every view | ⬜ | API down -> visible error, zero fabricated data |  |
| 2.4 | ReportsPage -> call `reportService` (7 endpoints); delete `Math.random()`/simulated logic | ⬜ | Report figures match SQL results |  |
| 2.5 | Implement Export (CSV minimum; align README claim) | ⬜ | Button downloads file |  |
| 2.6 | Dashboard: feed trend chart from `/dashboard/cost-summary`; alerts from API | ⬜ | No hardcoded series |  |
| 2.7 | Add missing sidebar entries: Work Centers, Preventive Maintenance | ⬜ | Both reachable via nav |  |
| 2.8 | Wire `auditMiddleware`/`logAudit` onto all mutating routes | 🔶 | Every create/update/delete writes `AuditLogEntry` | 367b59d |
| 2.9 | Apply `authorizeMinRole` per SOW role matrix | 🔶 | View-Only gets 403 on writes | 367b59d |
| 2.10 | Zod validation on all request bodies/params | 🔶 | Malformed payload -> 400 with message, never raw Prisma error | 367b59d |
| 2.11 | Annotate all routes with Swagger JSDoc (or regenerate spec) | ⬜ | `/api-docs` renders full API reference |  |
| 2.12 | Decide refresh-token scope: implement refresh endpoints **or** document fixed 8h session | ⬜ | Decision recorded; no dead schema |  |

Note: 2.2 is partially started — commit `40e90af` (task 1.2) wired `userService.getAll()` into `appStore.loadFromApi` (with fallback to current user on failure). Remaining collections (crafts, taskLists, operations, labor, checklists, meter readings, comments, audit log) are still on mock/static data and land with 2.2.

### Milestone A - WO domain end-to-end pilot (COMPLETE, awaiting approval)

**Scope done in this milestone (folded 2.8/2.9/2.10 into every route edit):**
- Backend: `backend/src/utils/validation.ts` (zod v4: workOrder create/update/status, operation, woMaterial, labor, comment schemas + `validate` middleware). Rewrote `workOrders.ts` (RBAC create/update=Requester, transition=Technician, delete=Supervisor; documented state machine; auto actualStart/actualFinish; plannedCost recompute; `logAudit` on create/update/delete/status incl. old→new) + `workOrderOperations.ts`, `workOrderMaterials.ts`, `labor.ts`, `comments.ts` (writes=Technician; comment delete author-or-admin; labor soft-delete; audit on all).
- Frontend: `WorkOrdersPage` (live `workOrderService` list via embedded functionalLocation/equipment/workCenter, loading/error/empty states, async quick actions + Plan/Schedule added, busy indicators), `WorkOrderDetailPage` (live detail + labor + audit history, async transitions, Delete (Supervisor/Admin), comment compose/delete, per-tab empty states), `WorkOrderCreatePage` (form options from live API, loading/error/Retry).

**Verification (all raw, automated via Playwright headless Chromium):**
- API: create 201 / WO-000004; malformed body -> 400 with zod path list; View-Only create+delete -> 403; invalid status transition -> 400; transition chain Draft→Planned→Scheduled→In Progress (actualStart auto-set) -> audit rows `{Create, Update status old/new ×3}`.
- Browser E2E (WO-000011, full lifecycle): create via UI -> list empty state -> Draft badge -> Plan/Schedule/Start/Complete/Close buttons appear/disappear per state -> reload persists -> History tab shows 6 entries -> comment add (in-memory ≤1s) + persists after reload + delete -> list shows Closed -> Board view renders -> Delete WO -> absent after refresh. `PAGE_ERRORS=[] CONSOLE_ERRORS=[]`.
- API-failure state: aborted `/api/work-orders` -> error panel + Retry shown; Retry recovers to live data.
- Screenshots (evidence, git-ignored): `screenshots/ma_01_list_start.png`, `ma_02_detail_draft.png`, `ma_03_detail_closed.png`, `ma_04_history.png`, `ma_05_comments.png`, `ma_06_list_closed.png`, `ma_07_board.png`, `ma_08_after_delete.png`.
- DB left clean after verification (0 active work orders; test comments/WOs deleted). Backend restarted on :4000 (logs `backend-out12/err12.log`).

**Remaining for 2.1/2.2/2.8/2.9/2.10 (non-WO domains, Milestone B):** alert read, convert-notification-to-WO, notifications/materials/equipment/locations/work-centers pages, Preventative Maintenance page, Reports, Dashboard live feeds, admin audit tab, plus mockData deletion.

### Milestone B - Remaining SOW domains in 8 ordered groups (IN PROGRESS)

**Group order:** G1 WO sub-domain CRUD (ops/materials/labor/services/checklists) + cost recompute verify (Corrective 1&3) + board Closed handling (Corrective 2) -> G2 Notifications -> G3 Asset master -> G4 Preventive Maintenance -> G5 Dashboard+Reports -> G6 Administration -> G7 Sidebar + delete `mockData.ts` and all `.catch(() => mock)` -> G8 coverage re-check.

### Milestone B - Group 1 (COMPLETE): WO sub-domain CRUD + costs + board

**Scope (folded 2.8/2.9/2.10 into each touched route):**
- Backend (commits `8df301d`): new `utils/costs.ts` `recomputeWorkOrderCosts` (planned=Σ ops(plannedHours×techs×craft.hourlyRate) + Σ materials(plannedQuantity×unitCost) + Σ services(cost); actual=Σ labor(hours×op.craft.hourlyRate) + Σ materials(actualQuantity×unitCost) + Σ services(cost)); wired into labor/operations/materials/external-services CRUD + WO PUT (also fixes old sum×sum material math). New routes `externalServiceCosts.ts` (GET by workOrderId required / POST / PUT / DELETE, Technician, zod, audit, recompute) + `crafts.ts` (GET /crafts, `craftCode`/`description` order). `labor.ts` +PUT /:id + recompute + FK 404 guards (operation/user/craft/material). `workOrderOperations.ts` recompute + cascade delete laborEntries + craft 404 guard. `workOrderMaterials.ts` recompute + material 404 guard. `safetyChecklists.ts` full rewrite: RBAC, zod, audit on all routes + DELETE. `validation.ts` added laborUpdate/externalServiceCreate+Update/checklistTemplateCreate+Attach+Update+Item schemas. Backend `tsc --noEmit` exit 0.
- Frontend (commit `c40030a`): new `craftService.ts`, `externalServiceService.ts`; `laborService.update`; `safetyChecklistService.deleteChecklist` + attach payload fix (`checklistTemplateId` not `templateId`). `WorkOrderDetailPage.tsx` full rewrite — CRUD for Operations (craft dropdown, plannedHours, techs), Materials (dropdown auto-fill standardCost→unitCost when empty, planned/actual/unitCost), Labor (operation+user dropdowns, hours, notes), Services (vendor/desc/cost/invoiceRef), Checklists (attach, Yes/No/NA chips, Complete & Sign, delete); cost cards recompute via reload after each mutation; `performTransition` now clears `busy` so transition buttons render after each step (bug found by E2E); loading/empty/error states preserved; zero mock, zero `any`. `WorkOrdersPage.tsx` board = all 8 lanes incl. Closed + Cancelled (Corrective 2, add-column option). Group-1 files `tsc` exit 0 and `eslint` exit 0.

**Verification (Playwright headless, `g1_e2e.py`, run at commit c40030a — all SI flags True, `PAGE_ERRORS=[] CONSOLE_ERRORS=[]`):**
- Operations: add (planned 70), reload persists, edit craft→WELDER (80, Δ-10), delete (0), re-add FITTER (90 planned chain); Materials: add 3×10 (planned+30), reload persists, edit unitCost 20 (+30 more), delete (back to 90); Services: add 50 (+50 planned/actual), edit cost 60 (+10), delete (back to 90); Labor: add 2h FITTER → actual 90, reload persists, edit 1h → actual 45, delete → actual 0.
- Checklists: attach Lockout/Tagout (persists; template id payload verified via API), respond Yes, Complete & Sign ("Signed by Admin User on …"), delete.
- Transitions on detail page: Draft→…→Close chain completed on a second WO (regression re-proof of full lifecycle after Group 1 refactor); Closed card verified present in the **Closed** board lane (header-span-scoped selector); all 8 lanes render.
- Two product bugs found by E2E and fixed: attach sent wrong field (`templateId`) and `performTransition` never cleared busy (transition buttons stuck as spinner).
- Screenshots (evidence, git-ignored): `screenshots/g1_01_operation_added.png`, `g1_01b_operation_deleted.png`, `g1_02b_material_deleted.png`, `g1_05_checklist_responded.png`, `g1_05b_checklist_deleted.png`, `g1_07_board_all_lanes.png`, `g1_08_closed_lane_card.png`.

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

Note: Follow-up (non-blocking) - add a one-line comment to `Craft.hourlyRate` in `schema.prisma` documenting the per-person interpretation confirmed in task 1.5 (see `WorkOrderOperation.numberOfTechnicians` costing). Add during the next schema-touching task (e.g. 4.1 migrate baseline).

## Phase 5 - Testing, moderate floor (5-8 days) - *backend route tests protected first*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 5.1 | **Priority:** Vitest + Supertest covering all 21 routers: auth, RBAC matrix, WO lifecycle transitions, convert-to-wo, scheduler idempotency, reports | ⬜ | `npm test` green in backend |  |
| 5.2 | Vitest + Testing Library for 5 key pages (login, WO list/detail, guard) - *deferrable* | ⬜ | Green, or explicitly deferred |  |
| 5.3 | One Playwright E2E: login -> create WO -> transition -> convert notification -> report | ⬜ | Passes against seeded DB |  |
| 5.4 | Regression pass re-verifying every Phase 1 defect | ⬜ | Checklist signed off |  |

Note (Playwright tooling): during task 1.0 verification a corrupted byte was found in `C:\Users\Injaz\AppData\Roaming\Python\Python314\site-packages\playwright\driver\package\lib\utilsBundle.js`. On line 6310 the string `if (this.lastDraw <0x01>== str)` contained an injected `0x01` byte between `lastDraw ` and `==`, which broke the Node driver (`SyntaxError: Invalid or unexpected token`). Fix: binary-patched that single byte `0x01` -> `0x20` (space), restoring valid JS `if (this.lastDraw  == str)`. This patch does NOT survive `pip install playwright --upgrade` (pip replaces the installed package; a reinstall also restores the clean official file since the corruption was local, not in the wheel). Recommend a clean `pip uninstall playwright` + `pip install playwright` before 5.3 E2E setup. Not urgent.

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