# CMMS Finalization Tracker

**Project:** CommandPulse CMMS
**Tracker created:** 2026-09-22
**Total estimate:** ~26-40 working days
**Critical path:** Phase 8 - Production Readiness. Sections A through E; E is the last, and D-17 (`Float` -> `Decimal`) was its final item. Phase F followed: the DB-backed suites that the E.11 boundary note deferred — "the DB-backed suites that must exist before any of those 19 rows can move". Phase F is complete (F.1-F.9, 17+1 promotions). Phase G is in progress: the rehearsals and the SOW §4.1 200-user load test (see the Phase G section).
**Status:** Phases 0-7 complete. **Phase 8 - Production Readiness: A complete (gate passed) | B code complete | C code complete | D complete and verified | E complete | F complete (F.9, all 19-hold rows closed) | G in progress (G.0 environment survey done; D-4 drill PASS; 100-VU acceptance PASS after the P2028 fix).** Matrix: **101 `Met`, 50 Partial, 30 Not Met, 8 Deferred, 15 Excluded, 10 Waived (214 rows)** at the Phase F closure (`5fc4383`), re-verified at `40c852e`. The §3.6 history workstream is done (rows 55/56 `Met`, residual L25 closed); the 16-model soft-delete sweep (E.12) is done; the final Phase E item **D-17** (`Float` → `Decimal` for monetary columns) is delivered in E.13, which also promotes SOW deferred item D6 out of v1.1. §4.3 and §5.3 stay `Partial` only because the audit-purge job and the four deliberately non-soft-deleted tables (`RefreshToken`, `AuditLogEntry`, `SequenceCounter`, `WorkOrderSnapshot`) remain. Phase E was accepted by the Client 2026-09-28; two acceptance notes (the wire-format precision trade-off and the `instanceof` fragility) are recorded in the E.13 section. **A row is verified at the SHA where its test was green** — a commit cannot contain its own hash, so the evidence cell cites the tested SHA and that run's CI ID rather than the tip.

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
| f4c8dcc | feat(g3.3): CSV bulk import/export for materials + equipment |
| 1e54ae4 | fix(a11y): WCAG 2.1 AA light pass + audit doc (3.5) |
| 7a23409 | fix(app): catch-all 404 route inside protected layout (3.5a) |
| 9460b9d | test(backend): vitest+supertest across all 21 routers + RBAC/audit fold (5.1, 2.9) |
| f0edd32 | fix(auth): gate /api/audit-log to Administrator (2.9 fold) |
| 31070ce | test(app): vitest + testing-library for 5 key pages (5.2) |
| ba4c1fc | fix(auth): narrow user-options endpoint for WO create form (Requester+) (5.3) |
| dfbfe2e | test(e2e): full lifecycle playwright flow (5.3) |
| c30845f | fix(verify): live-ID resolution in verify_g4b2.py (5.4) |
| 7413dc2 | fix(verify): swap report assertion in verify_g5.py (5.4) |
| 75295d5 | fix(verify): narrow G6a gate to the exact banned patterns (mock import + store fallback) (5.4) |
| ca2072b | fix(verify): eslint baseline — tests override + import catch-any fixes (5.4) |
| 73bbb1c | fix(maintenance-plans): P2003 -> 400 on create; user-options endpoint at Requester+ (5.3/5.4 findings) |

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
| 2.1 | Wire **all mutations** to services: create/update WO, status transitions, convert-to-WO, comments, alert read, materials/labor/checklists CRUD | ✅ | All page mutations on services (WODetail full CRUD, convert, alert read); persists after action | 367b59d, d842bb9, 1f2ff8e, 9876e67 |
| 2.2 | Load remaining collections live: users, crafts, taskLists, operations, labor, checklists, meter readings, comments, **audit log** | ✅ | Administration audit tab + crafts + users + taskLists live via loadFromApi (verified /api/task-lists 200); WODetail tabs live; meterReadings store field stays empty (no wired endpoint) — page honest-empty, zero fabrication | 40e90af, d842bb9, 9876e67, 8022546 |
| 2.3 | **Delete `mockData.ts` and all `.catch(() => mock)` fallbacks**; add toast + loading/error states on every view | ✅ | verify_g6a PASS exit 0: zero mock/catch(()=>) refs; 14-route sweep — API up = real data, API down = visible error, no fabricated records | 9876e67 |
| 2.4 | ReportsPage -> call `reportService` (7 endpoints); delete `Math.random()`/simulated logic | ✅ | verify_g5 PASS exit 0; figures match SQL (backlog 2 rows, material 1 row, pm period 2026-09); no simulated/random markers | e047a40 |
| 2.5 | Implement Export (CSV minimum; align README claim) | ✅ | CSV downloads via expect_download (pm-compliance-report.csv); README claim aligned to CSV; PDF/Excel deferred to 3.3 | e047a40 |
| 2.6 | Dashboard: feed trend chart from `/dashboard/cost-summary`; alerts from API | ✅ | Trend = 2 live Area series + Sep tick, alerts = live PM rows (verify_g5 PASS) | e047a40 |
| 2.7 | Add missing sidebar entries: Work Centers, Preventive Maintenance | ✅ | verify_g6b PASS exit 0: both entries visible in nav ('Work Centers', 'Preventive Maintenance'), click-through to /work-centers + /preventive-maintenance renders, PAGE_ERRORS=[] | 1631505 |
| 2.8 | Wire `auditMiddleware`/`logAudit` onto all mutating routes | ✅ | Milestone A rewrote mutating routes with `logAudit` (create/update/delete/status); Administration audit tab reads live entries | 367b59d, 9876e67 |
| 2.9 | Apply `authorizeMinRole` per SOW role matrix | ✅ | WO-domain RBAC confirmed (Milestone A/Group 1). Gap sweep + full fold completed 2026-09-24 in Phase 5 (5.1): `authorizeMinRole` + zod validation + `logAudit` added on the SEVEN deferred files — materials (create/update Requester, delete Supervisor), workCenters, taskLists, failureCodes (same pattern), maintenancePlans (create/update Requester + delete Supervisor + generate-wo Planner + run-scheduler Administrator already), users (PUT `/` Administrator + zod, PUT `/password` self-or-admin + audit), alerts (read-all + per-read Requester). Each folded route has a test proving wrong role → 403, right role → success + AuditLogEntry row. Follow-up fold (2026-09-24): `GET /api/audit-log` gated to `Administrator` (was authenticate-only) + test Requester → 403 / Administrator → 200. | 9460b9d |
| 2.10 | Zod validation on all request bodies/params | 🔶 | Schemas centralized in `validation.ts` (WO, notifications, equipment, locations, meters, checklists). Deferred to Phase 5: full RBAC matrix sweep and complete zod coverage across all 21 routers. WO domain verified in G1. Decision recorded 2026-09-24. | 367b59d |
| 2.11 | Annotate all routes with Swagger JSDoc (or regenerate spec) | ✅ | WO domain annotated (option a): 6 routes (list/detail/create/update/delete/status); /api-docs.json paths=3, /api/work-orders group present, swagger-ui renders. Remaining 20 routers deferred — see Phase 3 note | 1631505 |
| 2.12 | Decide refresh-token scope: implement refresh endpoints **or** document fixed 8h session | ✅ | Decision 2026-09-24: fixed 8h JWT session retained. RefreshToken model remains in schema but unwired; refresh endpoints deferred to post-go-live if UX requires. SOW §4.2 requires session timeout, not refresh tokens — 8h fixed satisfies the requirement. Verified: JWT_EXPIRES_IN=28800 in .env.example; live token exp-iat=28800 (jwt_8h True) | 1631505 |

**2.10 Phase 6 pre-flight residual (2026-09-25):** The strict audit found 45 gaps, so 2.10 remains 🔶. The current `validate(...)` middleware validates only `req.body`, not path params. Unvalidated parameterized mutations are: `PUT/DELETE /functional-locations/:id`; `PUT/DELETE /equipment/:id`; `PUT/DELETE /equipment-meters/:id`; `POST /equipment-meters/:id/readings`; `PUT/DELETE /work-centers/:id`; `PUT/DELETE /materials/:id`; `PUT/DELETE /failure-codes/:id`; `PUT/DELETE /task-lists/:id`; `PUT/DELETE /notifications/:id`; `POST /notifications/:id/convert-to-wo`; `PUT/DELETE /work-orders/:id`; `PUT /work-orders/:id/status`; `PUT/DELETE /work-order-operations/:id`; `PUT/DELETE /work-order-materials/:id`; `PUT/DELETE /labor/:id`; `PUT/DELETE /external-services/:id`; `PUT/DELETE /maintenance-plans/:id`; `POST /maintenance-plans/:id/generate-wo`; `POST /safety-checklists/work-order/:woId/attach`; `PUT/DELETE /safety-checklists/work-order-checklist/:id`; `PUT/DELETE /safety-checklists/work-order-checklist-item/:id`; `PUT/DELETE /alerts/:id/read`; `DELETE /comments/:id`; `DELETE /attachments/:id`; `PUT /users/:id`; `PUT /users/:id/password`. Direct body/multipart/no-input exceptions are `POST /auth/login`, `POST /equipment/import.csv`, `POST /materials/import.csv`, and `PUT /alerts/read-all`; `generate-wo` also reads an unvalidated optional body and the password route uses manual checks. `workOrderUpdateSchema` and `operationUpdateSchema` omit fields their handlers accept. Residual work: add parameter-aware Zod validation, explicit multipart/no-input handling, and align the two update schemas.

Note: 2.2 fully resolved in `9876e67` (taskLists live) + `8022546` (live task-lists); the remaining collections cited below landed with 2.2.

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

**Group order:** G1 WO sub-domain CRUD -> G2 Notifications -> G3 Asset master -> G4 PM (frontend + scheduler) -> G5 Dashboard+Reports -> G6a mockData deletion + fallback removal (trust property) -> G6b Sidebar + Swagger + refresh-token -> G7 Administration -> G8 coverage re-check.

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

### Milestone B - Group 2 (COMPLETE): Notifications

**Scope (folded 2.8/2.9/2.10 into each touched route):**
- Backend (commit `42d8a82`): rewrote `notifications.ts` — GET `/` envelope `{data,total,skip,take}` with search/type/priority/status filters; GET `/:id` detail with nested `functionalLocation`/`equipment`/`reportedBy`/`workOrders`/`comments`; POST `/` `authorizeMinRole('Requester')` + `notificationCreateSchema` + `generateNotifNumber()` (prefix + NOTIFICATION sequence padded 6) + audit; PUT `/:id` Requester + `notificationUpdateSchema` + audit; DELETE `/:id` Maintenance Supervisor + soft delete + audit; POST `/:id/convert-to-wo` Maintenance Planner + `convertNotificationSchema` (optional workCenterId/supervisorUserId) + `generateWoNumber()` **before** transaction + tx { create WO (EM if breakdown else CM), `WorkOrderNotifLink`, notification→Converted } + dual audit (WorkOrder Create + Notification status Open→Converted) + 201 + duplicate-convert 400. `validation.ts` added notificationType (M1/M2/M3), notificationStatus (Open/In Process/Completed/Converted), create/update/convert schemas; `sequence.ts` added `generateNotifNumber`.
- Frontend (commit `42d8a82`): `Notification` type now matches backend wire (nested `functionalLocation`/`equipment`/`reportedBy`/`workOrders`/`comments`); `notificationService.getAll` envelope-aware; `NotificationsPage.tsx` live API (loading/error/Retry/empty states, type/priority/status filters, client pagination, reporter/location/equipment from nested payload); `NotificationDetailPage.tsx` live detail + real Convert-to-WO (busy/error handling, post-convert reload, status badge, linked-WO cards, hidden Convert button once Converted); header alerts bell now clickable → marks all read + navigates to Notifications. Fixed a real app bug found by E2E: `appStore.loadFromApi()` unconditionally fetched `/api/users` for every role → 403 console noise for non-admins (backend gates GET /users to Administrator); now only fetched for Administrator.

**Verification (Playwright headless, `g2_e2e.py` — all 22 SI flags True, `PAGE_ERRORS=[]`, only benign 404 from the deliberate unknown-id probe):**
- Created fresh notification via operator API → list shows it (nested reporter "Plant Operator", location AR-001); Open filter isolates it; Open details (no breakdown banner, no linked WOs, Convert button visible).
- Convert to WO as admin → navigates to `work-orders/:id`, WO number `WO-xxxxxx` shown; list now shows Converted; detail shows Linked Work Orders (1) with WO card, status badge Converted, Convert button hidden; Converted filter includes it; unknown-id path → clean not-found/error UI.
- API probes: envelope list shape; nested detail (reportedBy/fullName, workOrders[]); `/api/users` 403 root-caused and fixed (no more console 403s for operator login).
- Screenshots (evidence, git-ignored): `screenshots/g2_01_notification_detail_open.png`, `g2_02_after_convert_wo_detail.png`, `g2_03_notification_detail_converted.png`.
- Quality gates: frontend `tsc --noEmit` exit 0; G2-scoped eslint exit 0 (appStore 2 pre-existing errors remain — unused `commentService` import + `as any` in mock converter — both removed with `mockData.ts` deletion in G7).

### Milestone B - Group 3 (COMPLETE): Asset Master — Equipment (+Locations/Materials/Work Centers)

**Scope (live API + UI, replaced mock-only rendering):**
- `EquipmentPage.tsx` — live `equipmentService.getAll()`; card grid + row-click → detail; zero mocks, zero `.catch(() => mock)`.
- `EquipmentDetailPage.tsx` — live detail: **Meters tab** (renders P-1001's 2 meters with recent readings), **BOM tab** (equipment BOM items — currently empty-state "No BOM items" for all seed equipment since none are seeded with BOM), Technical Parameters + Functional Location cards; tab UI renders per tab.
- `LocationsPage.tsx` — **tree** render from `/api/functional-locations` (Plant root, 6 nodes) — NOT a table.
- `MaterialsPage.tsx` — live `/api/materials` table (5 rows: M-1001..M-1005, Std Cost/Stock/Value, search + sort).
- `WorkCentersPage.tsx` — live `/api/work-centers` (3 cards WC-001/002/004, capacity + cost rate).
- Backend — `locations` tree endpoint lives at `/api/functional-locations` (NOT `/api/locations` — the earlier parse-error probe hard-coded `/api/locations` and 404'd; corrected). Re-ran live probe: P-1001 → meters=2 ✓, technicalParameters ✓, functionalLocation ✓; materials=5, work-centers=3, functional-locations=6.

**Verification (committed `scripts/verify/verify_g3.py`, exit 0 = PASS):**
- `api_equipment_count=5`, target `P-1001` → meters=2, loc ✓, params ✓; list+detail render, tabs switch (Meters/BOM) with no console/page errors (`PAGE_ERRORS=[] CONSOLE_ERRORS=[]`).
- Screenshots (evidence, git-ignored): `screenshots/g3_01_equipment_list.png`, `g3_02_equipment_detail.png` (incl. Meters+BOM tabs), `g3_03_locations.png`, `g3_04_materials.png`, `g3_05_work_centers.png`.
- Quality gates: committed verify script `G3_EXIT PASS` (exit 0); frontend page files tsc-clean.

### Milestone B - Group 4a (COMPLETE): Preventive Maintenance — frontend wiring + API verification

**Scope (frontend only, surgical edits on `PreventiveMaintenancePage.tsx`):**
- Loading / error / empty states: spinner reads `appStore.loading`; error panel reads `appStore.error` with Dismiss + Retry ($ `loadFromApi`); "No maintenance plans found" empty state.
- New **Next Due** column: Time strategy computes `startDate + intervalValue` (unit-aware Days/Weeks/Months); Meter strategy displays the runtime value (`intervalValue` + unit).
- Per-row **Generate WO** button wired to `maintenancePlanService.generateWorkOrder(plan.planId)` with `generatingId` busy spinner and success toast showing the returned `woNumber`.
- Quality gate: `npx tsc --noEmit -p app` exit 0.

**Findings established live (observations — NOT fixed in G4a; both belong to G4b / Phase 2 addendum):**
- **F1:** `POST /api/maintenance-plans` has NO zod validation — `req.body` is passed straight to Prisma (malformed payload -> 500, not 400). Confirmed by route source while writing verify wiring.
- **F2:** `POST /api/maintenance-plans/:id/generate-wo` has NO idempotency guard — two sequential calls on the same plan produced **WO-000043** and **WO-000044** (two distinct WOs). Fix = G4b safeguard 3.1c (per plan-cycle idempotency).

**Verification (committed `scripts/verify/verify_g4a.py`, exit code `0` = PASS):**
- Login UI + API (`operator / password`, backend :4000); admin API token for WO cleanup (DELETE /work-orders/:id is Maintenance-Supervisor-gated).
- POST test plan `G4A-TEST` (seed IDs per HANDOFF) -> 201; GET list -> 200 + plan present; GET `/:id` -> 200 + expected shape (strategy Time, interval 30 Days, all FK ids resolved).
- `POST generate-wo` twice on the same plan -> both 201, bodies captured verbatim, **two distinct WO numbers** (direct proof of F2).
- Headless `/preventive-maintenance` -> `G4A-TEST` row visible + Generate WO button present; `PAGE_ERRORS=[] CONSOLE_ERRORS=[]`.
- Cleanup: test plan + both generated WOs deleted via API; post-cleanup list clean (no `G4A-TEST`, both WOs absent). Residual soft-deleted rows hard-purged so `G4A-TEST` planCode remains reusable.
- Screenshots (evidence, git-ignored): `screenshots/g4a_01_plan_list.png`, `screenshots/g4a_02_plan_row_details.png`.
- Gate commit (hash recorded): `4beb2fb` — `feat(g4a): wire preventive maintenance page live (...) + verify_g4a.py live API + headless E2E gate`. Frontend page tsc-clean, verify script exit 0.

## Phase 3 - Missing SOW Features (6-9 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 3.1 | **PM scheduler (node-cron)** with mandatory safeguards | ✅ | All 3.1a–3.1g green (verify_g4b1/g4b2 exit 0) | `5048a17` |
| 3.1a | - PM2 `instances: 1`, `exec_mode: 'fork'` + comment re: cluster incompatibility | ✅ | `instances: 1`/`fork` present; register.js + env_file removed | `5048a17` |
| 3.1b | - Startup lock (PID + start time); refuse + `SystemAlert` if live owner exists | ✅ | 2nd backend blocked (log: disabled — lock held by); fake running row test (verify exit 0) | `5048a17` |
| 3.1c | - **Idempotency per (plan_id, scheduled_cycle_date)** - skip if WO exists, log | ✅ | Re-runnable; no duplicate WOs (verified: run1 wosCreated=1, run2 wosSkipped=1) | cc8d11c |
| 3.1d | - `SchedulerRun` table + `GET /api/health/scheduler`; `SystemAlert` if no success in 25h | ✅ | 200 ok + 503 stale→SystemAlert, row restored (verify exit 0) | `5048a17` |
| 3.1e | - **Non-blocking batches (max 50)** with `setImmediate` yield + per-batch log | ✅ | `BATCH_SIZE` 50 + `[scheduler] batch N/M complete` present | `5048a17` |
| 3.1f | - Admin-only `POST /api/maintenance-plans/run-scheduler` with user-ID logging | ✅ | Manual trigger works, audited (verify exit 0) | cc8d11c |
| 3.1g | - `PM_SCHEDULER_CRON` env (default `0 2 * * *`) + run-once at startup (idempotency-guarded) | ✅ | Catch-up after downtime works (boot log: started cron="0 2 * * *", startup run wosCreated=1) | cc8d11c |
| 3.2 | **File attachments:** `Attachment` model + migration, multer upload (size/type limits), WO detail UI | ✅ | verify_g3_2.py PASS exit 0 (all SI true, PAGE_ERRORS=[]): admin UI+API login → test WO → POST <1MB PDF = 201 + persisted → list shows → download 200 + `application/pdf` + `%PDF` body → 11MB oversize = 400 "File too large — maximum size is 10 MB" → `.exe` (unsupported mime) = 400 "Unsupported file type" → DELETE = soft (row remains `isDeleted=true` per psql, list `[]`) → headless WO detail Attachments tab shows the uploaded file. storage convention: `backend/uploads/<entityType>/<entityId>/<uuid>-<originalName>` (memoryStorage → manual fs write; originalName sanitized; uploads/ gitignored). Limits: 10 MB/file; allowed MIMEs: jpeg/png/webp/pdf/txt/xlsx/xls. Roles: upload Requester+, delete Maintenance Supervisor+. Delete semantics: SOFT — row `isDeleted=true`, **physical file KEPT on disk** (documented; consistent with soft-delete philosophy). Migration `20260924170000_add_attachment` (renamed from auto `...142525` so it sorts AFTER `init_baseline` — fresh-DB `migrate deploy` gate PASS on throwaway `cmms_fresh_gate`, dropped) | d78597d |
| 3.3 | **CSV bulk import/export** for materials/equipment + runbook section | ✅ | Round-trip import -> export (verify_g3_3.py PASS exit 0) | f4c8dcc |
| 3.4 | Consistent delete strategy (standardize soft-delete + filter everywhere) | ✅ | verify_g3_4.py PASS exit 0 (all SI keys true, PAGE_ERRORS=[]): every fixed route probed create→DELETE→GET 404/absent-from-list; DB proof — soft routes row remains `isDeleted=true`, hard exception routes row GONE (incl. checklist-item cascade). strategy: soft for every model that carries `isDeleted`; hard delete DOCUMENTED as deliberate for composition children with no `isDeleted` column (WorkOrderOperation + laborEntry cascade, WorkOrderMaterial, ExternalServiceCost, Comment, WorkOrderChecklist/Item — the WorkOrder is the soft-delete boundary; FK + cost-recompute semantics forbid soft here). `taskLists` PUT replace-operations converted to soft (`updateMany isDeleted=true` + list/detail/replace includes filter `isDeleted:false`); `maintenancePlans` taskList.operations includes (detail + generate-wo) now filter `isDeleted:false` so replaced ops never reappear / regenerate. verify_g4a regression PASS. 3.4b sweep (2.9 fold-in): read-filters confirmed complete on every soft-deletable read across all 21 route files; but audit+RBAC gaps span SEVEN route files (materials, workCenters, taskLists, failureCodes, maintenancePlans writes; users PUT+password; alerts read-all/read) — EXCEEDS the 5-route stop threshold → sweep stopped, findings recorded, 2.9 + audit-coverage fold deferred to Phase 5 (see note) | d5b016c |
| 3.5 | **WCAG 2.1 AA light pass:** keyboard nav, ARIA labels, focus states, contrast fixes | ✅ | verify_g3_5.py PASS exit 0 (all 14 routes: no page errors, ≥1 focusable control, zero interactive with tabindex=-1, named search/filter controls; keyboard-only Tab walks on login/WO list/WO detail; CommandPalette = modal dialog; global :focus-visible ring + lightened .text-tertiary #92929B in live CSSOM; PAGE_ERRORS=[] CONSOLE_ERRORS=[]). Audit doc: docs/WCAG-AUDIT.md | 1e54ae4 |
| 3.5a | - **Catch-all 404:** add a `*` route INSIDE the protected layout rendering a simple "Page not found" component with a link to `/dashboard`. Unmatched routes today render blank (sidebar + empty `<Outlet>`, no loading/error/empty) — real users with a stale bookmark/typo see nothing. Found during 3.4 blank-screenshot review (e.g. `/task-lists` has no route in `app/src/App.tsx`; browser shows blank content). Do during 3.5 (WCAG polish). | ✅ | verify_g3_5a.py PASS exit 0: unauth deep link → /login; authed /nonexistent-page-xyz → "Page not found" + "404" + sidebar still visible; "Back to Dashboard" link navigates to /dashboard; second garbage path also 404; PAGE_ERRORS=[] CONSOLE_ERRORS=[] | 7a23409 |
| 3.6 | **Seed guard:** `seed.ts` destructive wipe (deleteMany over ALL tables incl. `WorkOrder`/`Notification`, which seed never recreates) now gated behind `SEED_DEMO=1` + non-prod `NODE_ENV`; destructive seed step REMOVED from `build.bat` (build must not destroy live data) → guarded `scripts/seed-demo.bat` | ✅ | Proved: full `build.bat` rerun — seed skipped; `start.bat` probe after rebuild — WO-000063/64 + N-000012/13 SURVIVED, `/api/health` 200 | 2beaeb2, 0492ae7 |
| 3.7 | **F3 for remaining 8 soft-deletable `@unique` models** (User.username, FunctionalLocation.locationCode, Equipment.equipmentCode, WorkCenter.code, Material.materialCode, TaskList.code, Notification.notificationNumber, WorkOrder.woNumber + `@@unique([sourcePlanId,sourcePlanCycle])`); all now `isDeleted`-partial `CREATE UNIQUE INDEX` in `20260924160000_f3_remaining_partial_indexes` | ✅ | verify_g4a PASS twice back-to-back, NO purge (both runs create 201, distinct WOs). Login regression — auth was the only `findUnique` on a de-unique'd field (User.username) → `findFirst` — fixed; backend `tsc --noEmit` exit 0. ALSO fixed 4.5's latent ordering bug: `20260924150000_partial_unique_index` (renamed from `...113634`) now sorts AFTER `init_baseline` so shadow/fresh replay (P3006 `MaintenancePlan_planCode_key does not exist`) is valid; live `_prisma_migrations.migration_name` record updated. verify_g4a now resolves master-data ids live (seed regenerates UUIDs) | a7adf2d |

Note (Swagger deferral, 2026-09-24): 2.11 executed as option (a) — WO domain only, all 6 routes documented (`/api/work-orders` list+create, `/{id}` get+put+delete, `/{id}/status`). The remaining 20 routers are deferred to a later phase (post-G7); the `apis: ['./src/routes/*.ts']` glob in `backend/src/index.ts` will pick them up automatically as each route file gains `@openapi` blocks — no config change needed.

## Phase 4 - Database & Build Hygiene (1-2 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 4.1 | Baseline `prisma migrate dev`; commit `prisma/migrations/` | ✅ | Baseline `20260924142537_init_baseline` (34 tables, all models incl. SchedulerRun); adopted via `migrate resolve --applied` (DB was db-push-created, non-destructive adopt) + `migrate status` "up to date"; `prisma migrate deploy` = fresh-DB path; db push retired | 72e8834 |
| 4.2 | Fix `ecosystem.config.cjs` (drop phantom `register.js`, fix `env_file`, confirm fork mode) | ✅ | Landed in G4b-2 safeguard 3.1a: phantom `register.js` removed, `env_file` removed, `instances: 1`/`exec_mode: 'fork'` confirmed — `pm2 start` serves API | `5048a17` |
| 4.3 | Backend eslint dependency or remove script; lint green both packages | ✅ | Flat config (TS recommended); baseline = 50 errors (43 no-explicit-any, 4 no-unused-vars, 1 no-namespace... per run 50). >30 → fixes deferred to Phase 5 per standing rule; gate = no new errors vs baseline. A.1 reconciliation: `npx eslint src tests --format json` = **50 errors, 0 warnings**, so CI remains `> 50`. The earlier 32/2 report used the different frontend scope `npm run lint` / `eslint .`; its warnings were in `app/src/pages/ReportsPage.tsx` and `app/src/pages/WorkOrderDetailPage.tsx`, not the Phase 4 backend baseline. | 5d63f1a |
| 4.4 | Verify `build.bat`/`start.bat` cold on target Windows box | ✅ | `build.bat` exit 0 end-to-end. Fixes: (1) the 4 frontend tsc errors fixed surgically — `EquipmentBOM` gained `material?: {materialCode} \| null` (API includes `material: true`; type was missing the field) in types/index.ts; `notes: ... \|\| undefined` ×2 in WorkOrderDetailPage (505/533); `setActiveTab(tab.id as DetailTab)` cast w/ comment (857). (2) line ~31 db push → `migrate deploy`. (3) before `prisma generate`: `netstat` → taskkill the :4000 owner only (narrow choice, documented — avoids nuking unrelated node e.g. vite), `ping` wait (TTY-free; `timeout` errors under redirected stdin). Proved: `✔ Generated Prisma Client v6.19.3`, `No pending migrations to apply`, frontend `✓ built in 21.30s`, `Seed completed successfully`, exit 0. `start.bat` → backend `node dist/index.js` on :4000, `/api/health` 200 `{"status":"ok",...}`, vite :3000 serves (200, has title). PM2 absent → `node dist/index.js` path. `tsc -b` (app) exit 0 — the 4-error baseline is RESOLVED; verify_g6a tsc gate updated to expect rc==0 and re-verified PASS. NOTE: build's seed step empties WorkOrder+Notification demo rows (see Finding below) — restored WO-000063/64 + N-000012/13 via API after build | 5a8ed2c |
| 4.5 | F3: Partial unique index for soft-deletable `@unique` fields (`planCode` etc., `where isDeleted=false`) — regenerate migration, verify `verify_g4a.py` passes twice | ✅ | schema.prisma: planCode no longer `@unique` (comment documents the partial index). Migration `20260924113634_partial_unique_index`: `DROP INDEX MaintenancePlan_planCode_key` + raw `CREATE UNIQUE INDEX "MaintenancePlan_planCode_active_key" ON "MaintenancePlan"("planCode") WHERE "isDeleted"=false`. Applied. verify_g4a PASS twice back-to-back, NO purge (create 201 both runs — soft-deleted G4A-TEST freed). verify_p4 exit 0. Follow-up: same partial-index pattern for the remaining 8 models landed in **3.7** (`a7adf2d`). B: auth login was the ONLY consumer of a de-unique'd field — `findUnique({where:{username}})` is invalid once `User.username` lost `@unique` (Prisma's unique-input type drops the field), so `auth.ts` resolves login via `findFirst` (rationale now in a code comment). C: verify_g4a's former hardcoded entity UUIDs (equipmentId/functionalLocationId/workCenterId/taskListId) were NOT affected by F3 re-indexing (they are `@id` columns) — they drifted stale because seed.ts recreates master data with NEW UUIDs each reseed; the gate now fetches `take=1` ids live via the admin token (`test_ids_resolved` SI key; only planCode stays fixed as the reuse-under-test). | a888665 |

Note: Follow-up (non-blocking) - add a one-line comment to `Craft.hourlyRate` in `schema.prisma` documenting the per-person interpretation confirmed in task 1.5 (see `WorkOrderOperation.numberOfTechnicians` costing). Add during the next schema-touching task (e.g. 4.1 migrate baseline).

Note (F3, task 4.5, RESOLVED): the one-off `prisma db execute` purge of `MaintenancePlan WHERE planCode='G4A-TEST'` is no longer needed — the partial unique index `MaintenancePlan_planCode_active_key` (WHERE isDeleted=false) frees soft-deleted plan codes for reuse. `verify_g4a.py` has no embedded purge line; both consecutive runs passed with no manual purge.

Note (3.7, migration-rename decision + fresh-DB verification): the 4.5 migration folder was renamed `20260924113634_partial_unique_index` → `20260924150000_partial_unique_index` — **folder name only**; `migration.sql` is byte-identical (git recorded the change as a 100% rename). Why: Prisma Migrate replays a schema by folder-name (timestamp) order, and `...113634` sorted BEFORE the `20260924142537_init_baseline` baseline — a fresh or shadow DB therefore replayed `DROP INDEX MaintenancePlan_planCode_key` before the baseline had created it (P3006: `index "MaintenancePlan_planCode_key" does not exist`). The live `_prisma_migrations.migration_name` row was edited (`prisma db execute`) to match so applied history stays consistent with the tree (checksum + applied_steps_count untouched). **VERIFIED on a throwaway empty DB `cmms_fresh_gate`:** `prisma migrate deploy` exit 0, all 3 migrations applied in order (baseline → partial_unique_index → f3_remaining) with checksums identical to the live DB; `prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url <fresh>` → `No difference detected.` exit 0. Test DB dropped after verification. (Side observation: the live DB's baseline row shows `applied_steps_count=0` — expected artifact of the non-destructive `migrate resolve --applied` adoption in 4.1; a cold install shows 1. Both yield the identical schema.)

Note (3.4, sweep stop — 2.9 NOT folded): the 3.4b route-uniformity sweep audits every route file for read-filters / soft-delete / audit / RBAC. Read-filters and soft-delete are already uniform (isDeleted:false on all soft-deletable reads; only `taskLists` PUT replace was a hard-delete of a soft-deletable model — converted in 3.4). But `authorizeMinRole` + `logAudit` coverage on mutating routes is missing on SEVEN route files — `materials`, `workCenters`, `taskLists`, `failureCodes`, `maintenancePlans` (create/update/delete + generate-wo), `users` (PUT /:id + PUT /:id/password), `alerts` (PUT /read-all + PUT /:id/read). That EXCEEDS the "if more than 5 routes need changes, stop and report" guardrail, so the RBAC/audit fold (2.9) remains deferred to Phase 5 (5.1 backend route tests / full RBAC matrix, already tracked as 🔶 2.9 + Phase 5). The full sweep table (route | read-filters | soft-delete | audit | RBAC | notes) was reported in-session; key rows stand: read-filters ✅ everywhere, soft-delete ✅ everywhere, audit+RBAC ❌ on the 7 files above.

## Phase 5 - Testing, moderate floor (5-8 days) - *backend route tests protected first*

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 5.1 | **Priority:** Vitest + Supertest covering all 21 routers: auth, RBAC matrix, WO lifecycle transitions, convert-to-wo, scheduler idempotency, reports | ✅ | `npm test` green in backend — 24 files, 149 tests, exit 0 (vitest 5.0.1); full RBAC/audit fold (2.9) + audit-increment proofs; also fixed 2 pre-existing app bugs surfaced by tests (equipment.ts create 500 on omitted optional manufacturer/model/serialNumber/assetTag/equipmentClass). See 2.9 row + commit log. | 9460b9d |
| 5.2 | Vitest + Testing Library for 5 key pages (login, WO list/detail, guard) - *deferrable* | ✅ | Green — Vitest + Testing Library across 5 test files: LoginPage (4), WorkOrdersPage (4), WorkOrderDetailPage (6), ProtectedRoute guard (2), NotFoundPage (2) = **18 component tests**. Phase 6.1 reconciliation: `npm.cmd test -- --reporter=verbose` reports 5 files / 18 tests passed; `31070ce` itself contains the same 18 `it` declarations, so the prior “20 tests”/dashboard wording was a tracker accounting error, not test loss. | 31070ce |
| 5.3 | One Playwright E2E: login -> create WO -> transition -> convert notification -> report | ✅ | verify_g5_3.py PASS exit 0: full lifecycle WO-000130 (create → Draft → Plan → Schedule → In Progress → Complete → Close), notification N-000026 created + converted to WO, linked WO, backlog chart + PM compliance, no empty markers, PAGE_ERRORS=[]/CONSOLE_ERRORS=[]. Folding fix ba4c1fc (WO create form + notification detail must not 401 for Requester+ — narrow payload at GET /api/users/options; convert button .first). | ba4c1fc, dfbfe2e |
| 5.4 | Regression pass re-verifying every Phase 1 defect | ✅ | **All 11 verify scripts green (5.4 regression table below).** 7 PASS on first full fleet; 4 FAILs triaged + adjudicated + fixed (g4b2 live-ID resolution, g5 PM-compliance assertion swap, g6a gate narrowed to the two exact banned patterns after adjudicating the services `.catch(() => ({error}))` parse fallback as legit, p4 eslint baseline restored via tests/** override + import catch-any fixes); second full fleet on a cleared rate-limiter window = 10/11 PASS (p4's internal g4a-run2 was 429-rate-limited at the tail; p4 solo from a cleared window PASS exit 0 with both g4a runs + eslint 50). Note: verify harness logins saturate the express-rate-limit (20/15min/IP) — run_all.py paces 60s + 429-retry; full-office fleets may need a 15-min idle between batches. Phase-6 ops item. | c30845f, 7413dc2, 75295d5, ca2072b, 73bbb1c (+ final Phase 5 sign-off commit — see commit log) |

Note (tracked tech-debt, Phase 0.5 -> Phase 5): the 4 `tsc -b` errors previously tracked here were **RESOLVED in 4.4** (EquipmentDetailPage.tsx(184,72) `EquipmentBOM.material` → added the `material` field to the type; WorkOrderDetailPage.tsx(505,11)+(533,11) `string|null`→`|| undefined`; (857,43) `tab.id as DetailTab` cast). `app\node_modules\.bin\tsc.cmd -b` now exits 0. verify_g6a's tsc gate updated (baseline set emptied → any reappearance is NEW) and re-verified PASS. Reminder: `tsc --noEmit -p app` compiles nothing (project-root tsconfig has only `references`); the real gate is the app's `tsc -b` (see HANDOFF standing rule).

Finding (4.4, surfaced by the cold build): `backend/prisma/seed.ts` begins with `deleteMany()` over ALL tables including `WorkOrder` + `Notification`, but re-creates only reference/master demo data — it **never creates WorkOrder or Notification rows** (confirmed: no `workOrder.create` anywhere; seed has a single commit `6f6d944`). Consequence: every cold build (its `npx tsx prisma/seed.ts` step) empties the WO + notification area, which caused `verify_g6a`'s detail sweep to fall back to `"_none"` ids. Restored demo rows afterwards via API (WO-000063, WO-000064; N-000012, N-000013) — `verify_g6a` re-PASSed. **RESOLVED (3.6, `2beaeb2` + `0492ae7`):** the wipe is now gated behind `SEED_DEMO=1` + non-prod `NODE_ENV` (skips with a notice when unset), and the destructive seed step is REMOVED from `build.bat` — a build can no longer destroy live WO/notification data; reseeding demo data is a deliberate act via the guarded `scripts/seed-demo.bat`. Remaining optional enhancement: seed still creates no sample WO/notification rows (only needed if a fresh demo install should pre-populate that area).

Note (Playwright tooling): during task 1.0 verification a corrupted byte was found in `C:\Users\Injaz\AppData\Roaming\Python\Python314\site-packages\playwright\driver\package\lib\utilsBundle.js`. On line 6310 the string `if (this.lastDraw <0x01>== str)` contained an injected `0x01` byte between `lastDraw ` and `==`, which broke the Node driver (`SyntaxError: Invalid or unexpected token`). Fix: binary-patched that single byte `0x01` -> `0x20` (space), restoring valid JS `if (this.lastDraw  == str)`. This patch does NOT survive `pip install playwright --upgrade` (pip replaces the installed package; a reinstall also restores the clean official file since the corruption was local, not in the wheel). Recommend a clean `pip uninstall playwright` + `pip install playwright` before 5.3 E2E setup. Not urgent.

### 5.4 Regression table (all 11 verify scripts, `scripts/verify/run_all.py`)

| script | exit | notes |
|---|---|---|
| verify_g3_4.py | PASS 0 | hard/soft delete cascades + tasklist ops semantics |
| verify_g3_5.py | PASS 0 | WCAG 2.1 AA sweep, 14 routes, skip link, landmarks, focusable |
| verify_g3_5a.py | PASS 0 | unknown-route 404 inside protected layout + sidebar |
| verify_g4a.py | PASS 0 | PM plan CRUD + generate-wo ×2 distinct numbers + cleanup (admin token, 2.9 fold) |
| verify_g4b1.py | PASS 0 | scheduler run idempotency + plan-cycle marker + cleanup (live-ID resolution) |
| verify_g4b2.py | PASS 0 | scheduler single-instance lock, disabled-mode, stale watchdog 503 + restore (live-ID resolution) |
| verify_g5.py | PASS 0 | reports live 7 endpoints + PM-compliance period + CSV export + dashboard trend/alerts |
| verify_g6a.py | PASS 0 | mock/fallback grep narrowed; 14-route up/down sweep; tsc -b; no fabricated rows |
| verify_g6b.py | PASS 0 | sidebar entries, jwt 8h, swagger paths + ui |
| verify_p4.py | PASS 0 | migrations check + eslint baseline (50) + g4a twice |
| verify_g5_3.py | PASS 0 | full WO lifecycle E2E + notification convert + PM compliance |

Note (5.4 resolution ledger): (1) `verify_g4a.py` generate-wo + plan-delete now use an Administrator token — the 2.9 fold made those routes require Planner/Supervisor; (2) `verify_g4b1.py` / `verify_g4b2.py` resolve live IDs (no hard-coded UUIDs); (3) app bug: `maintenancePlans.ts` create/update on missing FK returned 500 (P2003) — now 400 with a clear message, regression-tested; (4) `verify_g5.py` asserts PM-compliance period shape instead of a beatable materials-table row; (5) `verify_g6a.py` gate narrowed to the two exact banned patterns — production services' `.catch(() => ({ error: res.statusText }))` parse fallback is defense-in-depth and was adjudicated as legitimate (no app code changed); (6) backend eslint 53 vs 50-baseline — three leaks (equipment POST /import, materials POST /import, maintenancePlans PUT) each `catch (error: any)`, fixed as typed/`unknown`; `tests/**` got a no-explicit-any/no-unused-vars override; restored to exactly 50.

## Phase 6 - CI/CD, Ops & Security Hardening (3-4 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 6.1 | GitHub Actions: install -> lint -> typecheck -> **backend tests** -> build | ✅ | Run #2 green on Node 24: Backend + Frontend jobs successful. Evidence: https://github.com/MohammedAlmaqan/CMMSproject/actions/runs/36137610937 | be52072, 25107b0 |
| 6.2 | Scheduled `pg_dump` backup + documented restore drill | ✅ | Daily 02:00 schedule + newest-14 retention documented. Initial drill PASS: 306,826-byte dump, `WorkOrder` count 84, elapsed 5.35 s, `cmms_restore_test` absent after drop (`psql -l \| findstr` exit 1). RPO ≤ 24 h; measured RTO 5.35 s. A.1 current-script re-drill: `PASS: dump restored, WorkOrder query succeeded, drill database dropped.`, exit 0. PostgreSQL server references aligned to 15+; client detection is PATH first, then the documented PostgreSQL 18 local fallback. | 7f4a26f |
| 6.3 | **Security:** HTTPS/TLS, account lockout (5 failures), 30-min idle session timeout (SOW §4.2) | ✅ | A.2.1: five failures within 15 minutes trigger a 30-minute lock, HTTP 423, and an `Account_Lockout` alert; success/expiry reset state. Focused lockout tests 3/3 and full backend suite 156/156 passed. A.2.2: 30-minute idle timeout with a 1-minute warning toast and "Stay signed in" action; activity tracked from user events plus successful API responses; timeout logs out and redirects to `/login`. Idle hook tests 3/3 and full frontend suite 21/21 passed; `tsc -b` clean; frontend lint unchanged at the 32-error / 2-warning baseline. A.2.3: IIS reverse-proxy HTTPS/TLS steps documented (URL Rewrite + ARR, `cmms.local:443` binding, `/api/*` proxy, SPA fallback, forwarded headers, `curl -k https://cmms.local/api/health`); no Express TLS change. | 6d983d3, bd8faeb, 3380466 |
| 6.4 | Structured logging + rotation under PM2 | ✅ | `backend/src/utils/logger.ts` provides a shared pino instance writing JSON to stdout, honouring `LOG_LEVEL` (default `info`, invalid values fall back to `info`); all 131 `console.*` call sites across 27 backend source files now use it. pino-http in `index.ts` logs method, full path (`originalUrl`, query string dropped), status, `responseTime` ms, and `userId` when authenticated, mapping 2xx→info, 4xx→warn, 5xx→error. `ecosystem.config.cjs` writes `logs/api-out.log` + `logs/api-err.log` with `merge_logs: true`; `log_date_format` was removed because the PM2 prefix broke JSON-lines parsing. `pm2-logrotate` documented (daily, 14 retained, 10M cap, gzip). `logs/` was already gitignored. Live verification under PM2: all 9 log lines parsed as JSON, 4 access lines each carried method/path/status/responseTime, 2 carried `userId`; secret scan clean for passwords, `Bearer`/authorization, cookies, JWT-shaped values, and postgres URIs. `tsc -b` clean; backend suite 24 files / 156 tests passed; lint 49 errors / 0 warnings (one below the 50 baseline, no new findings). | e890a92 |
| 6.5 | k6 smoke: login + WO list at target concurrency; record vs SOW §4.1 | ✅ | k6 v2.3.0 portable binary at `scripts\k6\k6.exe` (gitignored, PATH untouched). `scripts/k6/smoke.js`: 50 VUs, 2m ramp → 5m steady → 1m ramp-down; per VU login → `GET /api/work-orders?take=10` → `GET /api/work-orders/:id`. Each VU authenticates once (per-iteration login would exceed even the 200/15min ceiling); no server-side logout exists since tokens are stateless JWTs. `K6_MODE=1` raises the login limiter 20→200 per 15 min, active only when the variable is exactly `1`. **Result: both thresholds PASS** — `http_req_duration{scenario:steady}` p(95)=36.19 ms (< 2000) and `http_req_failed` rate=0.04%, 15/37265 (< 0.01); 18,540 iterations, 37,265 requests at 77.6/s. **SOW §4.1 "200 concurrent users" DEFERRED to post-go-live** — this 50-VU run is a smoke sanity check on a single local backend and is not capacity evidence. **Open finding (no fix attempted, per scope):** 15 of 140 logins returned HTTP 500 from `PrismaClientKnownRequestError` P2028 "Unable to start a transaction in the given time" (connection-pool exhaustion when many logins start a transaction at once); the read path itself was unaffected. Needs a capacity decision on the Prisma pool limit / connection budget before any 200-user test. | 96abd8a |

Non-blocking follow-ups: (1) when `actions/checkout@v5` and `actions/setup-node@v5` ship, upgrade from the current v4 actions, which run on Node 20 and emit a deprecation warning; (2) Phase 7 should migrate from the `PGPASSWORD` environment variable to PostgreSQL-native `%APPDATA%\postgresql\pgpass.conf` with file-permission restrictions.

## Phase 7 - Documentation & Delivery (3-5 days)

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| 7.1 | Rewrite README to match reality (35 models, honest features, real endpoints) | ✅ | Every claim implemented | `6d56b7b` |
| 7.2 | System Architecture document | ✅ | SOW §6.2 deliverable | `2643cb8` |
| 7.3 | ER diagram + data dictionary (from Prisma) | ✅ | SOW §6.2 deliverable | `7c093d8` |
| 7.4 | API reference (generated Swagger export -> static doc) | ✅ | SOW §6.2 deliverable | `d3cfbc6` |
| 7.5 | User Manual (per role) + Administrator Guide (config, backup, users, scheduler ops) | ✅ | SOW §6.2 deliverables | `3679aa8` |
| 7.6 | SOW compliance matrix (clause-by-clause); ERP + ad-hoc reporting **deferred**, i18n **excluded** | ✅ | All Critical/High pass or formally waived | `f18819a` |
| 7.7 | Tag `v1.0.0` | ✅ | **Corrected 2026-09-26 — this row was factually wrong.** It previously read *"pending client decision, not started"*, but the tag exists. Verified: annotated tag `v1.0.0`, tag object `386fe3c`, pointing at commit `0d941df`, tagger date 2026-09-26. **The tag marks shipped code, not client acceptance** — SOW §6.4 is *not* met at this tag, which is what Phase 8 below now tracks. The tag is immutable and will not be re-cut; the next tag is `v1.1.0`, cut only when the §6.4 criteria are met or waived. | `0d941df` |

---

## B.6 Blocker Remediation

The SOW compliance matrix (7.6) recorded two `Not Met` clauses as release blockers. Both are remediated in code; the matrix rows are updated in a follow-up docs commit.

| # | Clause | Finding | Fix | Commit | Tests |
|---|---|---|---|---|---|
| R1 | SOW §3.3.7 | A work order could be moved to `In Progress` with an attached **mandatory** safety checklist still `Pending` or `In Progress`, so the checklist was advisory only. | `PUT /api/work-orders/:id/status` now refuses `In Progress` with **409** until every mandatory checklist on the work order reads `Completed`. Runs after role auth and transition validation, before any write. Rejections write an `AuditLogEntry` with `action: 'Blocked'`. | `e049238` | 409 while incomplete; 200 once `Completed`; 200 with no mandatory checklist; `Blocked` audit row asserted |
| R2 | SOW §3.3.2 | The status route was gated at `Technician` for every target status, so any Technician could **Close** a work order. | `Completed → Closed` now requires **Maintenance Supervisor or Administrator**; every other transition keeps the Technician floor. Enforced as a per-transition middleware reusing `authorizeMinRole`, so `roleHierarchy` stays in one place. | `206e1de` | Technician 403; Supervisor 200; Administrator 200; Technician floor unchanged on the other four transitions |

**R1 is now enforced on item responses as well as checklist status.** ~~`WorkOrderChecklistItem.response` is a non-nullable `String` and the attach route pre-fills every item with `'NA'`, so an unanswered item is not representable.~~ **Superseded in Phase D** (`9b2e9bd`, `369ff13`, `7b3a17a`): `response` is `String?`, attach creates every item with `response: null`, and the gate requires `status = 'Completed'` **and** zero unanswered items. `v1.1-5` is closed. The re-arm rule is deliberately narrow — it fires only when an update removes an answer, so signing a checklist off before filling in the answers is still allowed.

**Documentation contradictions found in review and fixed:** `INSTALLATION_GUIDE.md` and `docs/ADMIN_GUIDE.md` still instructed readers to run `prisma db push` (retired in favour of `migrate deploy`), the install guide documented 4 of 8 backend env variables, and `docs/ARCHITECTURE.md` still described the pre-close-out state of attachment backup and Express `trust proxy`. See `2e0bddc`, `ab7040c` and the follow-up commit.

---

## Phase 8 — Production Readiness

Started 2026-09-26. Phase 8 opens with **Phase A: scope freeze and decision register**. No feature work is scheduled until the Phase A gate passes.

### Phase A — Scope Freeze and Decision Register (gate PASSED)

The SOW defines its own definition of done in one place: **§6.4 Acceptance Criteria**. Of the six criteria, five are `Not Met` and one is `Partial` at `v1.0.0`. §6.4.1 requires *"all functional requirements listed in §3 … implemented and pass UAT scripts"*. Of the 126 §3 rows, 38 are `Met` and 11 are already out of scope, leaving **77 that are neither Deferred nor Excluded**. Those 77 were the entire remaining engineering question. Each is now dispositioned `Build` or `Waive`.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| A.1 | Freeze the SOW clause inventory; derive the §6.4.1 scope set | ✅ | `scripts/verify/verify_a1.py` re-derives every count from `docs/SOW_COMPLIANCE.md` and exits 0: **214** rows = 64 Met / 75 Partial / 52 Not Met / 8 Deferred / 15 Excluded; **§3 = 126** rows = 38 Met / 42 Partial / 35 Not Met / 4 Deferred / 7 Excluded; **77 in-scope §3 gaps** (42 Partial + 35 Not Met) reconciling 38 + 77 + 4 + 7 = 126. §3 gap split by subsection: 3.1=13, 3.2=9, 3.3=16, 3.4=10, 3.5=6, 3.6=3, 3.7=11, 3.8=6, 3.9=1, 3.10=2. Confirmed the `v1.0.0` tag object `386fe3c` → `0d941df` and that it is unchanged. | `66acd4f` |
| A.2 | Decision register: 77-row worksheet, D-2…D-16, unsigned sign-off | ✅ | `docs/DECISION_REGISTER.md` created with 77 rows whose clause text and status were **transcribed from the matrix, not retyped**; a phase each; 15 decisions posed as questions with options, a labelled recommendation and a named owner; sign-off block left **unsigned**. Surfaces four SOW-internal problems: **D-2** §6.4.6 requires training completed but X7 removed it; **D-3** planned labour hours per technician vs per operation; **D-15** §3.2.2 "any authenticated user" vs §2.2 View-Only "read access"; **D-16** §3.3.5 work-centre rate vs §3.5.1 craft rate. | `f2aebc1` |
| A.3 | Register cross-check + Phase A sign-off gate, with a self-test | ✅ | `verify_a1.py` extended to reconcile the register against the matrix on all 77 rows. `verify_a1_signed.py` added as a separate gate so a red signature gate was never mistaken for a broken baseline; at this point it correctly reported **0/77 dispositioned, 0/15 answered → NOT PASSED**. Self-test 9/9. | `3bea29f` |
| A.4 | Tracker evidence + factual correction of row 7.7 | ✅ | This section, plus the 7.7 correction above. Row 7.7 read "pending client decision, not started" while the tag in fact exists; verified with `git cat-file -p` before correcting. | `dace289`, `18bb785` |
| A.5 | Apply D-2: amend §6.4.6 to documentation-only | ✅ | `docs/SOW_COMPLIANCE.md` §6.4 criterion amended with the original wording struck through, so the change is auditable. Status stays `Partial` on the documentation limb alone (the two open §6.2 gaps). Matrix counts unchanged: 214 / 126 / 77, `verify_a1.py` exit 0. | `c3bf6e6` |
| A.6 | Record 16 decisions and all 77 dispositions | ✅ | **68 Build / 9 Waive** as first recorded (superseded by A.9 → 67/10), every row with a one-line reason. **16 decisions** D-2…D-17, each with an answer and a one-line rationale; D-2, D-3, D-15, D-16 carry positions supplied by the SOW owner. Grounding corrections: row 8's citation was wrong (pointed at D-5/OAuth2, belongs to matrix deferred D5) and row 14's was dropped; the register now warns that Phase A `D-n` and matrix `D1`–`D8` overlap numerically and mean different things. Row 30 was nearly waived on the SOW's inventory conditional but is **built**, because `Material.currentStock` is already maintained by the material routes. Phase table is now Build/Waive per phase. | `fc87e0e` |
| A.7 | Replace the sign-off gate with a disposition gate | ✅ | `verify_a1_signed.py` → `verify_a1_dispositions.py` (and the self-test likewise). Checks 77 dispositions, 77 reasons, 9 substantive waive reasons, 16 answers, 16 rationales, 0 dangling references, and that the register's own claimed totals and per-phase counts match its rows. **PASSED**. States in its own output that it does **not** check whether the dispositions are correct. Self-test **12/12**. `verify_a1.py` updated: 15 → 16 decisions, and `deferred Dn` accepted as a citation form. | `7e3073d` |
| A.8 | Tracker update for A.5–A.7 | ✅ | This section. | `0cd776c` |
| A.9 | Apply the SOW owner's six Phase A flag answers | ✅ | Three dispositions changed (row 24 Waive→Build, row 30 Build→Waive, row 75 Build→Waive) and three decisions confirmed (D-3, D-4, D-5). **Verified 67 Build / 10 Waive.** Added a `Waived` status to the compliance matrix so the ten declined rows no longer read `Not Met`; the matrix now reconciles as 38 Met + 67 build + 10 waived + 4 Def + 7 Exc = 126, making 67 re-derivable from the matrix alone. `verify_a1.py` split the conflated 77 into **67 build / 10 waived / 77 worksheet** and gained two matrix-to-register assertions. Negative-tested on a scratch copy: all four injected mutations caught. | `b6a3a1c` |
| A.10 | Tracker update for A.9 | ✅ | This section, and a correction. The follow-up commit `98fb76f`, despite its message, did not record this row: its only change was prepending a UTF-8 BOM to this file, a PowerShell encoding artifact. The BOM is removed and this row is completed here. | `4667263`, `98fb76f` |

### Phase A gate — PASSED (with one control withdrawn)

| Gate condition | State |
|---|---|
| Baseline inventory machine-frozen and re-derivable | ✅ `verify_a1.py` exit 0 |
| All 77 in-scope §3 rows listed with matrix-sourced clause and status | ✅ A.2 |
| Every row carries a phase and any governing decision | ✅ A.2, A.6 |
| D-2 … D-17 posed with options, an answer and a rationale | ✅ A.6 |
| **Every one of the 77 rows dispositioned `Build` or `Waive`** | ✅ **77 of 77** |
| **Every row carries a one-line business reason** | ✅ **77 of 77** |
| **Every waive carries a substantive reason** | ✅ **10 of 10** |
| **Matrix and register agree on Build, Waive and waive direction** | ✅ A.9 |
| **Every decision answered and reasoned** | ✅ **16 of 16** |
| ~~Signed by the Client~~ | ⛔ **requirement withdrawn 2026-09-26** |

**66 Build, 11 Waive** (after the SOW owner's answers of 2026-09-26; was 68/9, and 67/10 until 2026-10-04). Per phase: B 6/0, C 17/1, D 10/1, E 10/1, F 14/1, G 0/1, H 9/6. Phase G has no §3 build rows because its only clause (OAuth2) was waived; the §6.4.3 non-functional work it exists for lives in §4 and §6.4 and is tracked below.

**What the gate no longer proves, stated plainly.** The Client signature was the only control on this gate that the vendor did not control. It was withdrawn, and the dispositions were made under delegated authority. The gate now proves the register is complete, internally consistent and traceable to the matrix. It cannot prove the dispositions are *correct* — that is engineering judgement, and judgement is what was delegated. The 11 waives are proposed scope reductions and remain open to the SOW owner (the 9-waive figure as first recorded, and the 67/10 tally that replaced it, were both superseded by register §6.5, which now gives **66 Build / 11 Waive**). The register records this in its own §6.1 and §6.2.

**Flagged items — all six answered by the SOW owner on 2026-09-26** (register §6.4 keeps the reasoning). Three answers moved a disposition and are now in the register and the matrix:

- **Row 24 calibration — `Build`.** The plant does run a calibration programme. The row carries a **scope gate**: the confirmed scope is larger than the clause's "pass/fail tracking" wording, so the **label-only version must not be built** and the required depth must be confirmed with the SOW owner before Phase H.
- **Row 30 stock deduction — `Waive`.** The warehouse team owns the on-hand count, so the SOW's own conditional ("if inventory is managed inside the CMMS") is not met. `Material.currentStock` stays a manually maintained, **non-authoritative** reference field and is not auto-decremented; consumption, quantity and unit cost, is still recorded and still rolls into work order cost.
- **Row 75 responsive layout — `Waive`.** No tablet or phone use in the field, so the desktop layout stands. This retires the largest discretionary item identified in Phase A.

Three answers changed no disposition: **D-3** confirmed per-operation total (the `numberOfTechnicians` multiplier in `costs.ts:19` comes out with row 49 in Phase E); **D-4** confirmed Build with the restore rehearsal recorded as a **pending verification, not a scope reduction**; **D-5** confirmed waived on internal-use-only and does not reopen.

**Arithmetic correction.** 66 Build / 11 Waive was expected, and the register now records exactly that. Three rows flipped on the 68/9 baseline when the Phase A flag answers were applied, netting Build −1 / Waive +1 and giving an intermediate 67/10; D-3, D-4 and D-5 moved no row. The missing eleventh waived row was named on 2026-10-04: register row 36 (§3.3.8 file type), whose D-11 decision text already read "the 'any file type' limb is waived" while its worksheet disposition said `Build`. That flips Build −1 / Waive +1 again, to **66 / 11**. Register §6.5 sets out the working and keeps the superseded 68/9 and 67/10 figures.

**Dependencies the vendor does not hold** — none is an engineering task, and each gates a §6.4 criterion: Windows Server with IIS + ARR (§4.2 TLS rehearsal); a live PostgreSQL target and `PGPASSWORD` for the first real backup/restore drill (`backup.bat` hardcodes its connection and has never run against a live instance); `k6.exe` (gitignored, deliberately not in the repository) for the §6.4.3 100-VU and §4.1 200-VU runs; an Azure AD tenant and app registration if D-5 is ever revisited; Client legacy data for the §5.7 importers and §6.4.5 migration accuracy; a dry-run migration window for §6.4.5.

---

### Phase B — Notification lifecycle and labour attribution (CODE COMPLETE, NOT RUNTIME-VERIFIED)

Phase B covers the six §3 rows the Phase A register assigned to it: 14, 15, 16, 17, 22 and 33. All six now have working code. **None has been promoted to `Met`**, and the reason is stated below rather than buried.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| B.1 | Enforce the notification lifecycle map (row 16) | ✅ | `backend/src/utils/transitions.ts` holds the legal transitions as a pure map, with `Completed` terminal. `PUT /api/notifications/:id` rejects an illegal transition with **400** listing the statuses actually reachable, and writes an `AuditLogEntry` with `action: 'Blocked'`. The convert-to-work-order path validates the same map, so a `Converted` or `Completed` notification cannot be converted again. Before this, `status` was written straight from the request body and every transition was accepted. 11 unit cases. | `f1ba550` |
| B.2 | Generate M3 on completion; close linked notifications (rows 15, 22) | ✅ | Completing a work order creates an **M3** and moves every notification the work order was converted from `Converted` → `Completed`, both inside the same `prisma.$transaction` as the status change, so a work order can never be `Completed` without them. A linked notification is moved only where the lifecycle map permits it, so one already `Completed` by hand is left alone. | `6aed9b3` |
| B.3 | Correct two false audit entries found in B.2 | ✅ | The M3 `Create` entry filed the **work order id** against `tableName: 'Notification'`, pointing at the wrong row; the created notification's own id is now carried out of the transaction and used. Separately, the linked-notification audit loop ran over **every** link including ones the map had just refused to change, recording status changes that never happened; only notifications actually moved are audited now. | `6aed9b3` |
| B.4 | Attribute labour to the authenticated login (row 33) | ✅ | Labour is attributed to the authenticated caller. A Technician naming another user is refused with **403** plus a `Blocked` audit entry rather than silently coerced; Maintenance Supervisor and above may book on someone's behalf, audited with old and new values. `laborCreateSchema.userId` is now **optional** — it was required, which contradicted the attribution rule by rejecting a client that correctly trusted the server — and stays non-nullable on update, because every entry must be attributed to somebody. 14 attribution + 7 schema unit cases. | `7e96443` |
| B.5 | Database-free unit suite | ✅ | `backend/vitest.unit.config.ts` runs only `tests/unit` and declares **no `setupFiles`**, so nothing in that path can reach `.env`, the database or the network. 33 cases across 3 files. `npm test` is unchanged and still runs the DB-backed integration suite. | `3089c54` |
| B.6 | Phase B static gate | ✅ | `scripts/verify/verify_b1.py`: the Phase B behaviour is present in source, the policy modules are pure, there is no `.catch(() => ...)` in `backend/src`, no changed file carries a credential literal, the matrix still reconciles, and the unit suite **actually executes and passes**. The unit step parses the vitest **JSON report** rather than scraping console output, and asserts no case is skipped. | `de7f734` |
| B.7 | Re-anchor the A1 worksheet on the register | ✅ | The 77-row worksheet was derived from matrix rows whose status was `Partial`/`Not Met`/`Waived`, so promoting any row to `Met` silently dropped it out of the worksheet and broke the count. It is now the register's 77 rows, each paired to its matrix row on clause + requirement instead of by position, and register/matrix **status** is no longer compared because the register column is the freeze-time value. Expected counts derive from the freeze via an explicit `APPROVED_PROMOTIONS` list (empty at this boundary), so an unlisted status change still fails. | `00983c3` |
| B.8 | Correct the Phase B matrix notes | ✅ | Rows 14/15/16/17/22/33 still described the defects as present. Each note now states what the code does and that the runtime was never exercised. Row 17 recorded as resolved by decision (D-15) rather than by code. Owner answers propagated to the matrix: row 24 Build with no label-only work, D-3 settling planned hours, D-4 fixing the backup scope. Register's `backend/src/services/costs.ts:19` corrected — that file does not exist; the module is `backend/src/utils/costs.ts`. | `9d35cd0` |
| B.9 | Tracker update for B.1–B.8 | ✅ | This section, plus removal of a UTF-8 BOM and completion of the A.10 row (see Process slip below). | `d3fe155` |

**Why no row was promoted to `Met`.** The owner directed on 2026-09-26 that the six statuses be **held**, with the notes corrected and the gap flagged. `backend/tests/routes/*.test.ts` is a real integration suite: `tests/setup.ts` loads `.env`, signs JWTs with the real secret and requires seeded users in a live PostgreSQL. No live target is held and no credential may be read, so **it was not run**. The six rows are therefore code-complete and policy-tested but never executed against a database, and the matrix says exactly that. Promoting them needs one of:

1. a live PostgreSQL target plus `PGPASSWORD` and `JWT_SECRET`, so the integration suite can run; or
2. a restore rehearsal on the vendor's own instance, which also serves the D-4 proof.

**What was verified, and how.** `tsc -b` exits 0 on `backend` and on `app`, and was re-run against **every one of the five Phase B commits individually** in a detached worktree, so no commit is only green because of a later one. 33 unit cases pass with no database, no JWT and no `.env`. `verify_b1.py` passes. `verify_a1.py` exits 0. `verify_a1_dispositions.py` reports **Build 67 / Waive 10** over all 77 rows. `verify_a1_dispositions_test.py` is **12/12**. The `v1.0.0` tag is unchanged: object `386fe3c0` → commit `0d941df`, still the only tag.

**Fault injection.** Because a gate that only asserts its own source text proves nothing, both gates were negative-tested on scratch copies.

`verify_b1.py`, 9 injected faults, **9 caught**: deleting the transition guard, removing M3 generation, deleting the labour override rejection, moving the completion side effects out of the transaction, making the policy impure, re-adding the live-DB setup, adding a swallowed error, adding a credential literal, skipping a unit test. Two of these were caught only after the gate was fixed — a whole-file substring check could not tell the labour `POST` from the `PUT`, and a skipped test was invisible because the gate did not run the suite.

`verify_a1.py` after the B.7 rework, 10 cases, **all correct**: an unlogged promotion, a waive flipped on one side only, corrupted register requirement text, a deleted register row, a deleted build row, a deleted `Met` row, a `Met` row pushed backwards, and a removed decision entry all still **fail**; a promotion listed in `APPROVED_PROMOTIONS` **passes**; the scratch copy passes again once restored.

The WAL archiving and differential backup work (D-4) belongs to **Phase G**, not Phase D, and still needs a live host. *Corrected 2026-09-27:* this previously said "a Phase D task", which cannot be right — Phase D (Database & Build Hygiene) closed complete in an earlier phase, and `docs/DECISION_REGISTER.md` already places the backup/restore drill in Phase G. The correction is recorded rather than made silently.

**Process slip, disclosed.** Commit `98fb76f` is titled "record the A.10 commit hash" but did not record it; its only change was prepending a UTF-8 BOM to this tracker, a PowerShell encoding artifact, leaving A.10 as `pending`. B.9 removes the BOM and completes the row. History is not rewritten. Separately, commit `c3bf6e6` bundled two staged pure file renames with the D-2 matrix amendment; the renames were verified as pure and the commit was disclosed rather than amended.

---

### Phase C - Build rows, capacity board, and task-list surfaces (CODE COMPLETE, NOT RUNTIME-VERIFIED)

Phase C covers the 17 §3 rows the Phase A register assigned to it: 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 18, 21, 25, 27, 28 and 50. Row 1 stays `Waived` and is not in scope. All 17 now have code. **None has been promoted to `Met`**, for the reason given below.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| C.1 | Operation update validation (row 28) | ✅ | `PUT /api/work-orders/:id/operations/:opId` runs the same pure validator as create instead of a second, looser copy, so a field that create refuses cannot be smuggled in through update. | `4abb126` |
| C.2 | Equipment BOM and meter writes (rows 4, 12) | ✅ | Equipment BOM lines and meter readings gained the write paths the models already had. Row 4 was `Partial` because the model existed with no endpoint; it is still `Partial` only because nothing has run it. | `f0b8739` |
| C.3 | Craft CRUD and hourly rates (row 6) | ✅ | Crafts can be created, edited and deactivated, and `Craft.hourlyRate` (D-16) is the currency for planned and actual cost. Rate changes are audited. | `88a1910` |
| C.4 | Atomic cost allocations (row 50) | ✅ | Material and labour cost splits persist inside one `prisma.$transaction`, so a partial write cannot leave a work order whose costs do not add up. | `0ee4584` |
| C.5 | Operation-presence transition guard (row 27) | ✅ | A work order cannot reach a status that implies field work while it has zero operations. This is the one Phase C row that moved **off** `Not Met`. | `f2f3bf6` |
| C.6 | Task-list operation copy (row 11) | ✅ | Copying a task list to a work order carries its operations across, not just its header. | `5aac1f7` |
| C.7 | System-config allowlist and UI (row 25) | ✅ | Configuration writes go through an allowlist of known keys, and the settings screen exposes them. | `be153f1` |
| C.8 | Notification location/equipment consistency (row 18) | ✅ | Validation requires a notification's location and equipment to agree with the asset it names, so a notification cannot be filed against equipment that is not at that location. | `a6a4ec2` |
| C.9 | Equipment placement invariants (row 3) | ✅ | Equipment placement is validated on move and on install, not only on create. | `9ae12f4` |
| C.10 | Server-side location count rollups (row 2) | ✅ | Equipment and location counts are recomputed on the server rather than trusted from a client-supplied number, closing a tampering path. | `98bb7ff` |
| C.11 | Work-order-to-notification navigation (row 21) | ✅ | The work order detail screen links to the notifications it was converted from and back, closing a one-way reference. | `307b9bb` |
| C.12 | Equipment Documents tab and attachment-parent checks (row 5) | ✅ | Equipment gained the Documents tab the SOW describes, and an attachment is refused if its claimed parent does not match the entity it was uploaded against. | `ad4d17d` |
| C.13 | Task-list and operation material model (rows 9, 13) | ✅ | Added `TaskListMaterial` and a nullable `WorkOrderMaterial.operationId`, plus `backend/src/utils/materialRules.ts`, nested material persistence, operation-linked task-list copying, cross-work-order operation validation, and OpenAPI. Migration `20260926090000_task_list_and_operation_materials` is **committed but never applied**. | `5fa769b` |
| C.14 | Task-list CRUD screen (row 10) | ✅ | Full task-list UI: per-step materials, class and equipment association, role gating, re-read-before-edit, sequence renumbering, accessibility labels, route, sidebar entry, command-palette navigation. **Row 10 was `Not Met` and is the second and last status change Phase C made** — the model existed, but nothing could use it. | `5f4a7e0` |
| C.15 | Work-order material-to-operation assignment | ✅ | The Materials tab assigns or reassigns a line to an operation, or deliberately job-level. An empty selection is sent as `null` rather than omitted, and the read side shows `Step N` or `Job-level`. | `ae6bbdc` |
| C.16 | Three integrity rules found while implementing C.14 | ✅ | Craft retirement now counts live `TaskListOperation` references and names the blocking source instead of reporting only work-order operations. Functional-location re-parenting refuses an equipment-bearing parent, a missing parent, self-parenting, and a descendant cycle. Task-list deletion hard-deletes `TaskListMaterial`, soft-deletes operations, and soft-deletes the list in one transaction. 15 unit cases. | `490c2e3` |
| C.17 | Capacity board (row 7) | ✅ | `backend/src/utils/capacity.ts`, `GET /api/work-centers/capacity`, `capacityQuerySchema` with a strict calendar-date round trip, and `CapacityBoardPanel` on the Work Centers page. Whole-window planned hours are spread per day, Draft/finished/cancelled work is excluded, load is split by craft, overload is flagged, and undated committed work is reported as `unscheduledHours` / `unscheduledWorkOrders`. 30 pure cases + 29 contract cases. | `100a5a3`, defect fixed in `e51cf9c` |
| C.18 | Task-list template picker on work-order create | ✅ | `WorkOrderCreatePage` offers task-list templates, submits `taskListId`, summarises the steps and materials that will be copied, and warns when the template's work centre or asset differs from the work order's — a warning, not a block, because the SOW permits the deviation. Added a create-only `WorkOrderCreateInput`; a failed template fetch does not block ordinary work-order creation. 12 cases. | `7f7542e` |

**A defect found in C.17 after it was committed, and fixed.** The board's undated-work figure could not have been right. The work-order query selected consuming-status work with `OR: [{ plannedFinish: { gte } }, { plannedStart: { lte } }]`. Prisma compiles those to `plannedFinish >= $1` and `plannedStart <= $2`, and under SQL three-valued logic **both are UNKNOWN, not true, when the column is NULL** — so every work order with no `plannedStart` was filtered out before `buildCapacityBoard` ever saw it. The route comment asserted the opposite and the panel rendered a confidently empty `unscheduledWorkOrders`. The pure model and the UI were both correct; the query between them was not. Fixed by adding the `{ plannedStart: null }` branch in `e51cf9c`, with three contract cases added, and the fix was **negative-tested**: reverting the branch on a byte-restored scratch copy makes exactly the new case fail (28 pass / 1 fail) and restoring it returns 29/29. A gate that only asserts its own source text proves nothing, so the new cases were confirmed to be able to fail.

**Why no row was promoted to `Met`.** Same rule as Phase B, and the same reason. `backend/tests/routes/*.test.ts` is a real integration suite: `tests/setup.ts` loads `.env`, signs JWTs with the real secret, and requires seeded users in a live PostgreSQL. No live target is held and no credential may be read, so **it was not run**. The 17 rows are code-complete and covered by DB-free tests, but never executed against a database, and the matrix says exactly that. Combined with Phase B, **23 rows are now held at `IMPLEMENTED, NOT VERIFIED`** — 6 from Phase B and 17 from Phase C. Promoting them needs one of:

1. a live PostgreSQL target plus `PGPASSWORD` and `JWT_SECRET`, so the integration suite can run; or
2. a restore rehearsal on the vendor's own instance, which also serves the D-4 proof.

**Superseded in part by Phase D, and what is still owed.** CI applies migrations, seeds and runs the DB-backed suite, so from `479a7f7` onward a DB-backed case has executed for every SHA CI has touched. That is the condition above, met by proxy. **These 23 rows are not forgotten, and they are not yet covered** — they are deferred to a dedicated test-writing pass at the **end of Phase F, before Phase G's rehearsals**, for one reason: Phases E and F change the same code paths. `costs.ts` loses the technician multiplier, the 17 soft-delete models gain `isDeleted` read-filters, and financial columns move from `Float` to `Decimal`. Tests written now would be written against a schema and a cost model that is about to change, and would either fail for the wrong reason or pass for the wrong reason. They are written once, against the Phase F end state. Nothing else in this tracker should be read as excusing them.

**What was verified, and how.** `tsc -b` exits 0 on `backend` and on `app`. The DB-free unit suite is **345 cases across 22 files**, up from 33 cases across 3 files at the end of Phase B, and passes with no database, no JWT and no `.env`. The `v1.0.0` tag is unchanged: object `386fe3c0` → commit `0d941df`, still the only tag.

**Matrix effect, stated exactly.** Phase C changed the status of **two** rows, from `Not Met` to `Partial`: **row 10** (task lists were modellable but unusable) and **row 27** (operation-presence guard). The other 15 rows were already `Partial` and stayed there. Corrected totals across all 214 clauses: **64 Met, 76 Partial, 41 Not Met, 8 Deferred, 15 Excluded, 10 Waived**. §3 only, 126 rows: **38 Met, 43 Partial, 24 Not Met, 4 Deferred, 7 Excluded, 10 Waived**. The Summary table in `docs/SOW_COMPLIANCE.md` was missing a `Waived` line and had `Partial` and `Not Met` absorbing those ten rows; it is now derived from the Status column rather than transcribed, and both totals above reconcile against it.

**Not done, and not in scope for Phase C.** The technician-multiplier removal (D-3) lands with row 49 in Phase E, and `backend/src/utils/costs.ts` was deliberately left alone. D-4 is Phase G as above. Row 24 calibration is still blocked on the owner confirming the pass/fail capture depth, so no label-only version was built. No row was moved to `Met` on the strength of a passing unit test.

---

## CI Diagnostic — runs 45 to 61, and why 16 red runs went unnoticed

**Found on 2026-09-27, immediately after `5be8563` was pushed.** CI was red on `main` and had been for 16 consecutive runs. This section is the record of what was actually wrong, because the reason is a process failure and not only a code failure.

### The two distinct failures

| Runs | Commit | Fails at | Cause |
|---|---|---|---|
| 45 | `0ee4584` (C.4) | — | green; the last good run |
| 46–53 | `f2f3bf6` (C.5) through C.12 | `Test` | C.5 added the operation-presence guard, but its own integration fixtures still created operationless work orders and expected `200` |
| 54–61 | `5fa769b` (C.13) through `5be8563` | `Lint baseline` | Phase C pushed ESLint errors past the CI threshold of 50, so the suite never ran at all |

**Raw failing assertion, from the GitHub check annotations on run 46**, at `backend/tests/routes/workOrders.test.ts` lines 102, 134, 187 and 217:

```
AssertionError: expected 409 to be 200 // Object.is equality
```

The literal Actions log blob is not retrievable: the logs endpoint returns HTTP 403 and the run page requires sign-in, and no `gh`, `GH_TOKEN` or `GITHUB_TOKEN` is available in this environment. The four annotations above are the raw error text GitHub does expose unauthenticated. Nothing here is paraphrased.

**The 409 was correct and the test was wrong.** C.5 implemented SOW 3.3.3 — a work order may not leave Draft with zero operations — and shipped unit tests for the pure rule, but no database-backed test for the route. Every test that walked a work order up the lifecycle created it with no operations and then asserted `200` on Draft → Planned. The test was doing its job: it caught a real behavioural change the commit did not account for. **The fix adds operations to those fixtures; it does not weaken the guard or relax the assertion.**

`f2f3bf6` is the commit that introduced the failure. The new coverage added with the fix asserts all three parts of the contract: the 409, the `Blocked` audit row, that the work order remains in `Draft`, and that the same transition succeeds once an operation exists. A second case pins that `Cancelled` remains exempt, so a later tightening of the guard cannot quietly strand draft work.

### The lint regression, measured

`npx eslint src tests --format json`, which is the exact command CI runs:

| Commit | Errors |
|---|---|
| `98fb76f` (Phase B start) | 49 |
| `0ee4584` (C.4) | 49 |
| `5fa769b` (C.13) | 51 |
| `5be8563` (tip at the time) | 52 |

So the drift **did not predate Phase B or Phase C** — the baseline was healthy at 49. Phase C added a net 3: two `no-explicit-any` in `taskLists.ts` and one unused variable in `capacity.ts`. The baseline was **not** raised. The fixes brought the count to **46**, and the two `catch (error: any)` sites in `workCenters.ts` were converted to `unknown` with explicit narrowing, following the precedent set in `ca2072b`.

### Why 16 red runs were not noticed — the answer

Traced through this tracker, the local gate has **only ever run the database-free subset.** Phase B step 5.5 added `backend/vitest.unit.config.ts`, which by design runs only `tests/unit`, declares no `setupFiles`, and needs no database, no JWT secret and no `.env`. Every local verification recorded in this tracker — every `tsc -b`, every `npm run test:unit`, every `ESLINT_ERRORS=` count — came from that DB-free subset.

`npm test` is the DB-backed suite, and CI runs it against a provisioned PostgreSQL 15 service. **It was never executed locally.** So for sixteen runs the local report was genuinely green and genuinely meaningless with respect to the thing that was broken. The two failures were in code paths the DB-free subset does not reach: the integration suite (a database the subset never touches) and `eslint src tests` (which includes `tests/`, where the local checks had only ever run the typechecker and the unit config).

This is the whole failure, and it is worth being blunt about it: **a gate you can quietly run a subset of is not a gate.** The process gap, not the C.5 code, is the reason this went unnoticed for sixteen runs.

### Closing the gap

`backend/scripts/gate.mjs`, run as `npm run gate` from `backend`, executes every step CI executes: backend typecheck, the exact lint command and its threshold, the DB-free unit suite, then migrate, seed and the DB-backed suite. The difference is that the database step **cannot be skipped by accident**:

- If no database is reachable, the gate **exits non-zero** and explains that a green result without the DB-backed suite does not imply CI will be green. It does not report success.
- `SKIP_DB_TESTS=1` runs the database-free steps only, and its output is labelled `PARTIAL ... not equivalent to CI` so it can never be mistaken for a full pass.
- Nothing destructive happens without `GATE_ALLOW_DB=1`. `prisma/seed.ts` calls `deleteMany()` across most of the schema and the integration suite writes and deletes rows, so the gate will not migrate or seed a reachable database — local or remote — on its own. A reachable local database is refused outright unless that opt-in is set.

The rule going forward, which is the actual answer to "how do we close that gap so a green local gate means a green CI": **report CI state for the exact SHA.** A local result is called *static-green* until the DB-backed suite has run; the only claim that means CI is green is a green GitHub Actions run for that commit. `5be8563` is the proof of why: it passed every local check ever applied to it.

### One more prerequisite that is easy to misread

`verify_g3*`, `verify_g4*`, `verify_g5*` and `verify_g6*` are Playwright scripts and require a **Vite dev server running on `http://localhost:3000`**. They are not self-contained and are not part of CI. Any future claim that they passed must state that the server was running; otherwise a connection refusal is indistinguishable from a pass.

### A third failure the first fix exposed, and why it was invisible

The first fix (`9668db5`) cleared the lint gate — step 8 `Lint baseline` went green for the first time since C.4 — and cleared all four `workOrders.test.ts` assertions. With the suite running again it immediately failed somewhere else, in `backend/tests/routes/equipment.test.ts`:

```
[backend/tests/routes/equipment.test.ts:46] AssertionError: expected 400 to be 201
[backend/tests/routes/equipment.test.ts:65] AssertionError: expected 404 to be 403
[backend/tests/routes/equipment.test.ts:70] AssertionError: expected 404 to be 200
```

All three are one bug. `equipment.ts:515` refuses a create whose `functionalLocationId` is not a lowest-level location, which `locationRules.ts` defines structurally as one with no non-deleted children. The test picked its location with an unordered `findFirst`, so it passed only for as long as the seed happened to place a leaf at the front — and Phase C adding functional locations broke that coincidence. The 400 at line 46 means `createdId` was never assigned, and lines 65 and 70 are cascade from that. Fixed in `da02540` by selecting a genuine leaf deterministically.

Worth recording plainly: **this failure had been present since Phase C too, and nothing in the local gate could ever have found it.** It is the same lesson as the other two, in a third place. Fixing the first failure is what made it visible.

### Verified end state

`da02540` is green on CI. Run 36326909767, both jobs, every step including `Test`:

| Job | Result |
|---|---|
| Backend (`ubuntu-latest`) | **success** — Typecheck, Lint baseline, Apply migrations, Seed test data, Test all success |
| Frontend (`ubuntu-latest`) | **success** — Typecheck, Build, Test all success |

https://github.com/MohammedAlmaqan/CMMSproject/actions/runs/36326909767

`main` was red for 16 runs and is now green at `da02540`. Phase D remains not started.

**Docker attempt, abandoned.** A throwaway `postgres:15` container was attempted on 2026-09-27 to enable local DB-backed verification; Docker Desktop started, but `docker pull` never completed and the attempt was abandoned rather than retried. The integration fix is verified by CI, not locally. Docker is present on this machine but unreliable for this purpose — do not re-attempt without investigating the pull failure first.

**Rule, going forward.** A local result is static-green until the DB-backed suite has run. The only claim that means CI is green is a green GitHub Actions run for the exact SHA. `npm run gate` reports PARTIAL when the DB step is skipped — a partial result is not equivalent to CI, and the CI run for that SHA is the answer.

---

### Phase E - Costs, audit trail, and the data layer

Rows 19, 26, 31, 32, 34, 38, 49, 55, 56, 57, plus three cross-cutting items: D-3 (the technician multiplier), D-17 (`Float` → `Decimal` for monetary columns), and the 16-model soft-delete sweep. This is the highest-risk phase of Phase 8 — two of the three cross-cutting items change the schema, and the third changes what every read in the system returns.

Rows 19, 26, 31, 32, 34, 38, 49, 55 and 56 are done, along with D-3. Row 57 closed on the E.10 restatement, not on a code change. The 16-model soft-delete sweep (E.12) is done, and **D-17** (`Float` → `Decimal` for monetary columns) is delivered last in E.13, promoting deferred item D6 out of v1.1. Phase E is complete.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| E.1 | D-3: remove the `numberOfTechnicians` multiplier (row 49) | ✅ | Planned labour is `plannedHours × craft.hourlyRate`. Every planned-cost figure changes **only** by the removed multiplier. | `ca9aa63` |
| E.2 | Miscellaneous costs as line items (row 34), and the `+ other planned` term (row 49) | ✅ | Travel and permits are storable and reportable as their own line items, distinguishable from a contractor service. Every term of the §3.5.1 formula has a distinct source. | `722e1a3` |
| E.3 | Work Order "Reported By" header field (row 26) | ✅ | The work order names who reported the fault, separately from who raised the record and from who is assigned. Carries across a notification conversion. | `e256ad1` |
| E.4 | Notification "Damages/observations" field (row 19) | ✅ | What was found at the asset is recorded in its own field, and cannot overwrite the original report. | `96645ee` |
| E.5 | Material reservation concept (row 31) | ✅ | A part can actually be held for a scheduled job: over-reservation is refused, availability is reported, and a closed or cancelled job lets go. | `abb580f` |
| E.6 | Fix the E.3 migration backfill and the E.4 update schema | ✅ | Both E.3 and E.4 were red on CI. Neither was a test-logic problem; both were ways of writing a value that the database would not accept. | `fa79ef0` |
| E.7 | Stop the row-31 reservation tests mutating the shared work order (row 32 wording, D-16) | ✅ | The release test cancelled a work order the rest of the file depends on; it now owns its own. Row 32 closed on D-16, with no code change. | `98c356e` |
| E.8 | Stop PM generation writing `'scheduler'` into a user foreign key | ✅ | Every scheduled work order generation was failing on `WorkOrder_reportedByUserId_fkey`. Found by reproducing CI locally, not by guessing. | `96988dd` |
| E.9 | One-shot DB-backed diagnostic: re-test every row held on "never run against a live database" | ✅ | All 20 held rows examined clause by clause against the real suite. One promoted on genuine coverage; 19 re-stated as the specific untested clause. | `6c5b926` |
| E.10 | Audit workstream: enforce field diffs and actor metadata in the type system (rows 38, 57) | ✅ | Measured before touching anything: **10 of 84** real route call sites carried both old and new values (the earlier "86" was a raw grep that counted the definition and the import). The row-57 premise turned out to be wrong — all **323/323** audit rows already in the database carried an IP address — so the real gap was field diffs and write-site coverage, not missing IPs. Both matrix rows restated from the measurement. `logAudit` no longer exists: `logAuditFieldChange` requires field, old and new; `logAuditAction` cannot accept value fields at all; both require user and IP. 84 call sites across 22 route files migrated. Turning enforcement on immediately surfaced **six** call sites that passed a `fieldName` with no values behind it, which the trail had been presenting as diffs. Master-data edits on nine registries and work-order cost recomputes now record per-column old/new via a shared differ. | `8a155bf` |
| E.11 | Work Order History + Equipment Maintenance History (rows 55, 56) | ✅ | Each successful work-order status change stores a complete immutable snapshot of the work order (`WorkOrderSnapshot`, migration `20260928151746_work_order_snapshot`), written inside the status-transition transaction so a change can never occur without its history row; `GET /api/work-orders/:id/history` serves them oldest-first. `GET /api/equipment/:id/history` serves the full chronological maintenance history per equipment — date, type, cost, planned cost, and downtime hours derived from the actual start/finish exactly as the downtime report does — paginated and excluding soft-deleted work orders. Residual **L25 closed**. | *this commit* |
| E.12 | 16-model soft-delete sweep (closes the hard-deleted-children contradiction in §4.3/§5.3) | ✅ | Every remaining transactional table gains `isDeleted` (13 of them also gain the full audit-column set); every read on a soft-deletable entity filters `isDeleted: false`; DELETEs become soft; task-list-material replacement, work-order-operation DELETE (cascading to its labour), maintenance-plan PUT/DELETE (targets and meters) and cost-split PUT replacement soft-retire prior rows instead of deleting them; the dropped `SystemConfig.key` `@unique` is replaced by a partial unique index scoped to active rows plus `findFirst`/update-or-create in `sequence.ts` and `systemConfig.ts`. Migration `20260928160000_soft_delete_sweep` applies cleanly on `cmms_gate` and on a fresh-DB replay. | *this commit* |
| E.13 | D-17: `Float` → `Decimal` for monetary columns (§5.3 / deferred D6). **Final Phase E item.** | ✅ | All seven monetary columns (`WorkCenter.costRatePerHour`, `Craft.hourlyRate`, `Material.standardCost`, `WorkOrder.plannedCost`/`actualCost`, `WorkOrderMaterial.unitCost`, `ExternalServiceCost.cost`) are `DECIMAL(12,2)` in PostgreSQL, quantities and durations stay binary float; every API still serves the money values as JSON **numbers** (structural decoder at the response boundary, so no route or client change was needed); migration `20260928170000_float_to_decimal` applies cleanly on `cmms_gate` and on a fresh-DB replay. | *this commit* |

**E.10 decisions worth recording**

- **Why `userId`/`ipAddress` are required object properties rather than positional arguments.** They were positional, optional and nullable, which is three independent ways for a call site to drop them without noticing, and the nullable column accepted the result. As required properties they cannot be omitted, so SOW 3.6's "including IP address and user" is enforced by the compiler rather than by whoever remembers. The alternative considered was capturing `req.ip` in middleware, but the 84 call sites span bulk and transaction-scoped writes that never pass through the response hook, so it would have left the same sites unaudited.
- **`ipAddress` is required but nullable.** Express types `req.ip` as `string | undefined`, so requiring a `string` would have forced a fabricated value at 84 sites. Required forces the call site to decide; nullable keeps the record honest when the socket is genuinely gone.
- **A no-op edit records nothing.** Master-data updates emit one row per column that actually moved rather than a generic "Update" row, so a `PUT` that changes nothing leaves no trail entry. That is the honest outcome, but it is a deliberate change from the previous always-one-row behaviour, and the two tests that asserted on the old fake `fieldName` labels were rewritten rather than the labels restored.
- **Four label-without-diff sites were demoted to actions, not given invented values.** `alerts` read-all and read, `users` profile and password. A password change must never carry the old or new secret, so that one is permanently action-only; a per-field diff for profile edits remains open work under row 38.
- **`auth.ts` deliberately bypasses the helpers.** It writes audit rows through its own transaction client so an audit failure aborts the login, which is the opposite of the helpers' swallow-and-log policy and is right for authentication. The cost is that those rows sit outside the type enforcement, so their values are spelled out by hand: the `lastLogin` row gained an explicit `oldValue: null`, and the `LoginFailure` row keeps its `fieldName` because the account-lockout counter queries on it. Giving failure events a discriminator column is the clean fix and needs a migration; open against 3.5.1.
- **Auditable columns are declared once.** `backend/src/middleware/auditFields.ts` lists the business columns per registry, checked against the generated Prisma model types so a typo is a compile error rather than a field that silently never matches. System columns are excluded on purpose: they change on nearly every write and would bury the edits that matter.
- **The first draft of that registry was wrong.** The column names were written from memory and 9 of the 10 models listed fields that do not exist, which would have made the differ match nothing and silently audit nothing at all. It was rewritten from `schema.prisma` and given the compile-time check that would have caught it in the first place.
- **A verified fix was briefly lost and caught by re-running the validator.** Reverting the first, broken codemod with `git checkout -- backend/src/routes/` also reverted the duplicate `'400'` response key already fixed and verified in `functionalLocations.ts`, because the fix was uncommitted and lived in the same file. Nothing else was lost — the only other pending change was in the tracker. It was re-applied and re-verified at 111 blocks and 0 strict-YAML failures. The reason it is in this commit rather than the earlier one is that the earlier commit was already pushed, and amending or force-pushing it to fold in an unrelated fix would be worse than carrying the fix forward with its own verification. Worth remembering: a bulk `git checkout` on a directory discards every uncommitted change in it, not just the one being undone.

**E.10 verification**

| Gate | Result |
|---|---|
| `tsc -b` (backend) | exit 0 |
| `eslint src/` | 42 errors, identical set to the `HEAD` baseline — **no new violations** (gate: no new vs baseline) |
| Unit suite (no DB) | **524 cases across 29 files**, all passing (512 before; 12 new for the differ) |
| Full DB-backed suite on `cmms_gate` | **733 tests across 54 files**, all passing (721 before; 12 new) |
| `@openapi` strict YAML | **111 blocks, 0 failures** |
| Database inspection | 0 action rows leaking field values; 0 rows missing `userId` or `ipAddress`; cost and master-data diffs present with both old and new |

The 12 new cases cover the differ's decision logic, and were checked by mutation rather than trusted: making it skip any field that exists fails 5 of them, and removing the stable JSON key ordering fails 1. The silent no-op — a registry that matches nothing and audits nothing while looking correct — is the failure mode this code is most able to produce, so it is the one the tests were written against.

E.10 CI: run **36347996951**, `conclusion: success`, for exact SHA `8a155bf`. E.9's SHA is `6c5b926`.

#### E.11 — Work Order History and Equipment Maintenance History (rows 55, 56), and lessons from a JSONB column

Row 55 (§3.6 Work Order History) and row 56 (§3.6 Equipment Maintenance History) both reached `Met`. The register had row 55 `Not Met` and row 56 `Partial`; both rows, the residual **L25**, and the `SOW_COMPLIANCE.md` §5.3/§4.3 "18 of 35" counts are updated in the same commit.

**E.11 decisions worth recording**

- **A snapshot, not a diff.** `WorkOrderSnapshot` stores a complete copy of the work order — every scalar field, dates as ISO strings, keys sorted — rather than a per-field change record. The audit log already owns field-level diffs; a snapshot is what lets "the work order as it was when it entered `Completed`" be reconstructed without replaying diffs. The two coexist: this row is not the audit row's replacement.
- **Written inside the status-transition transaction, so it cannot drift.** The snapshot is created in the same `$transaction` that performs the `status` update, on the transaction client. A status change that fails rolls both back; a change that succeeds has its history row in the same commit. It is written on every successful transition, and **not** on create, on convert-to-work-order, or on PM generation — those are not status changes.
- **Immutable by omission.** `WorkOrderSnapshot` deliberately has no `isDeleted`, `modifiedBy`, or `modifiedDate`. There is no update, delete, or restore surface anywhere in the API, which is the operational meaning of the SOW's "stored as immutable records". It is the third table (with `AuditLogEntry` and `RefreshToken`) that intentionally breaks the §5.3 "every table carries IsDeleted" convention, and the §4.3/§5.3 rows now say so explicitly instead of counting it as a gap.
- **`User.username` is not `@unique`, and PostgreSQL enforces that.** Fixtures that drive status transitions in tests address the technician by `findFirstOrThrow({ where: { username: 'tech1' } })`, not `findUniqueOrThrow`. Half the configured user accounts share a username; only `id` is unique.
- **The history endpoint hugs the resource, not the data.** `GET /api/work-orders/:id/history` returns 404 for a soft-deleted work order, mirroring `GET /api/work-orders/:id`. The snapshot rows physically remain — they are append-only and are never purged with the soft delete — but the API stops serving them. A correction mid-E.11: an earlier test asserted history survived soft-delete with 200, and was rewritten to the 404 contract the route actually enforces.
- **JSONB does not promise key order.** The serializer sorts keys, but PostgreSQL does not guarantee to return them sorted, so sortedness is asserted on the serializer in a DB-free unit test, not on round-tripped rows. The DB-backed tests assert content semantics: a row per transition, the right statuses and timestamps, the right `takenBy`.
- **The downtime figure reuses the report's derivation.** `actualFinish − actualStart` in hours, rounded to 2dp, and `null` when either timestamp was never recorded — the same rule as the downtime report (`backend/src/routes/reports.ts:472-473`). One downtime definition across two surfaces, so the two cannot disagree.
- **The front-end stat cards are no longer hostage to the front-page list.** `EquipmentDetailPage` replaced a `getAll({ equipmentId })` capped at 200 with a module-level pagination loop over the dedicated history endpoint (200/page until `total`). The page's history and its cost/downtime cards now read the same complete data set.
- **The migration carries unrelated drift because it reconciles the chain.** `20260928151746_work_order_snapshot` also normalises pre-existing drift: `MaintenancePlanTarget` FKs were `ON DELETE CASCADE` in the migration but `SET NULL` in `schema.prisma`, two indexes existed only as migrations, and `TaskListMaterial.modifiedDate` had a migration-time `DEFAULT` the schema never declared. The decision was to keep them in this migration — reconciling the chain with `schema.prisma` is safe and non-data-lossy, and a fresh-DB `prisma migrate deploy` applies the whole chain cleanly. What it is **not** is evidence about rows 55/56, which is why this migration is verified by the fresh-deploy and the DB-backed suite it sits behind, not as a standalone gate.

**E.11 verification**

| Gate | Result |
|---|---|
| `tsc -b` (backend, frontend) | exit 0 both packages |
| `eslint src tests` (backend) | 42 errors, identical set to the `HEAD` baseline — **no new violations** (delta script: 0 positive) |
| Frontend lint, touched files | only pre-existing offenders (`equipmentService.ts:14`, `workOrderService.ts:9`, one pre-existing hook-dep warning) |
| Frontend `npm run build` | exit 0 |
| Unit suite (no DB) | **529 cases across 30 files**, all passing (524 before; 5 new for the serializer) |
| Full DB-backed suite on `cmms_gate` | **744 tests across 55 files**, all passing (733 before; 11 new: 3 work-order history, 3 equipment history, 5 serializer) |
| `@openapi` strict YAML | **113 blocks, 0 failures** |
| Migration | `20260928151746_work_order_snapshot` applied to `cmms_gate`; fresh-DB `prisma migrate deploy` on `cmms_gate_fresh` applies the full chain |
| Database inspection | one immutable snapshot row per status transition; none on plain edits; equipment history rows carry correct cost and downtime; sortedness covered by the unit suite |

**Phase F 19-hold deferral, recorded now.** E.9 restated 19 §3 rows held on `IMPLEMENTED, NOT VERIFIED` as clauses whose behaviour **no test exercises**. E.11 does not reopen any of them, and its 744-case green run is evidence only about the tests that exist. The DB-backed suites that must exist before any of those 19 rows can move are **Phase F's work**, and the E.11 verification table above deliberately claims nothing about them. Recording the constraint at each phase boundary is what stops a later reader treating a green run as coverage it does not have.

#### E.12 — the 16-model soft-delete sweep (§4.3/§5.3)

The phase-3.4 doctrine that work-order children are hard-deleted "with the parent work order as the soft-delete boundary" is retired. The sixteen remaining tables without `isDeleted` — every child, join and configuration table — now carry it, and 13 of them also gained the `createdBy`/`modifiedBy`/`modifiedDate` audit columns in the same migration. Thirty-four of the 38 tables are soft-deletable; the four that are not are deliberate and unmatched: `RefreshToken` (revoked, never deleted), `SequenceCounter` (a numeric semaphore), and the immutable append-only `AuditLogEntry` and `WorkOrderSnapshot`. `WorkOrderOperation`, `WorkOrderChecklist` and `TaskListMaterial` already had the audit set and gained `isDeleted` only.

**E.12 decisions worth recording**

- **The scope was the tables that lacked `isDeleted`.** Reads on every soft-deletable entity already filtered `isDeleted: false` after earlier sweeps; the missing half was the sixteen tables that had no column to filter on. The sweep therefore touched delete/write paths (soft-retire instead of `delete`), the replace operations (task-list materials, cost splits, plan targets/meters PUT), the operation DELETE cascade to labour, and the system tables `SystemAlert`, `SystemConfig` and `SchedulerRun` whose state was previously destroyed by hard deletes.
- **Prisma refuses `where` on required to-one relations in `include`.** Filtering the linked template, item or work order inside an include for a **required** to-one relation is a TS2353 compile error — `where` is only allowed on optional relations. The filter moves up to the parent list's `where` (`where: { isDeleted: false, template: { isDeleted: false } }` over `include: { template: true }`). This is a constraint, not a choice, and the checklist-gate doctrine test documents it.
- **`SystemConfig.key` lost its `@unique`.** A unique index scoped to active rows cannot be declared as a Prisma `@unique`, so `findUnique({ where: { key } })` stopped compiling. `sequence.ts` and `systemConfig.ts` now resolve by `findFirst({ where: { key, isDeleted: false } })` and write explicitly (update-or-create on `configId` rather than an upsert). Three other partial unique indexes joined it: `TaskListMaterial` and `MaintenancePlanTarget` (×2) get an `..._active_key` only over active rows, so a soft-deleted row always releases its slot.
- **Four tables stay without `isDeleted`, deliberately.** `RefreshToken` rows are revoked, never deleted; `SequenceCounter` is a numeric semaphore where a soft delete would corrupt allocation; `AuditLogEntry` and `WorkOrderSnapshot` are immutable append-only records — a soft delete would be an edit. The §4.3/§5.3 rows now name them as the reason those clauses stay `Partial`, rather than counting them as gaps of the kind E.12 just closed.
- **`crafts.ts:360` is deliberately unfiltered.** The craft-retirement guard counts work orders **including** soft-deleted ones, so a retired craft that holds only deleted orders still refuses retirement. The retirement test is locked to that behaviour.
- **Tests moved to concrete patterns the code actually contains.** Doctrine tests that pinned fragile single-line source strings were widened to the real forms — `taskListMaterial.updateMany(... isDeleted: true)` for the replace, and separate counts for the two bare-read and three filtered returns on the task-list materials include. One new scenario (re-adding a soft-retired BOM line) was added rather than trusting the sweep.

**E.12 verification**

| Gate | Result |
|---|---|
| Backend `tsc -b` | exit 0 |
| `eslint src tests` (backend) | 42 errors, identical set to the `HEAD` baseline — **no new violations** (delta script: 0 positive) |
| Frontend `npm run build` | exit 0 |
| Unit suite (no DB) | **530 cases across 30 files**, all passing (529 before; 1 new re-add/retire scenario) |
| Full DB-backed suite on `cmms_gate` | **745 tests across 55 files**, all passing (744 before; 1 new) |
| `@openapi` strict YAML | **113 blocks, 0 failures** |
| Migration | `20260928160000_soft_delete_sweep` applied to `cmms_gate`; fresh-DB `prisma migrate deploy` replays the full chain cleanly (`cmms_gate_fresh`) |
| Database inspection | 34 of 38 tables carry `isDeleted`; the four exceptions are `RefreshToken`, `AuditLogEntry`, `SequenceCounter`, `WorkOrderSnapshot`; `SystemConfig.key` has no `@unique`; the four partial unique indexes exist, and a soft-deleted row frees its unique slot |

The first sweep run of the DB-backed suite failed 77 tests, all `P2021`/`P2022` "column/table does not exist" — the suite had been pointed at the stale local `cmms` database (eight migrations behind `prisma/migrations`) instead of the migrated `cmms_gate`. That is why the E.12 DB row cites `cmms_gate`: a gate is only evidence about the database it actually ran against.

#### E.13 — D-17, Float → Decimal for monetary columns (§5.3 / deferred D6)

D-17 moves the seven monetary columns from binary floating point to `DECIMAL(12,2)` **before** Phase F's cost rollups and cost reports exist, which is the whole point of the register answer: rounding differences baked into new cost reporting are expensive to unpick later. The SOW's deferred (v1.1) item D6 said "Float → Decimal migration for all monetary **and quantity** columns (§5.3)"; the register answer scoped D-17 to **monetary columns only** — `currentStock`, `dailyCapacityHours`, `plannedHours`, `hoursWorked`, `actualQuantity` and the `CostSplit.percentage` limb stay binary float, and the D6 row is removed from the SOW's deferred table rather than marked partial. `scripts/verify/verify_a1.py` does not parse that deferred table, so the removal cannot drift a machine gate. That is the first cross-cutting change on the critical path whose scope did not change the schema surface: `DECIMAL(12,2)` is the same Prisma cell on every read, so it is invisible except at three places — the migration, the arithmetic that mixes `number` with `Decimal`, and the JSON wire.

**E.13 decisions worth recording**

- **`Decimal` is a class, not a `number`.**
  - Inside the process, `tsc -b --force` found every mixed site: `+=` on dashboard aggregates and report totals, `Math.round` on `_sum.unitCost`, the `Number !== Decimal` comparison in `costs.ts` (a compile-time no-overlap error), the CSV `(string | number)[][]` builder, the work-order-copy `standardCost` assignment, and the cost-split allocate call. Each coerces exactly once with an explicit `Number(...)` at the arithmetic boundary, so `roundMoney` and the split arithmetic still see plain numbers.
  - On the wire, Prisma hands the route a `Decimal` object and decimal.js provides a **string** `toJSON()`. `JSON.stringify` runs that `toJSON()` *before* the replacer, so a replacer-based `res.json` wrapper sees strings, never the `Decimal` — and one 500 failure proved `Decimal` objects cannot be stored in the `WorkOrderSnapshot` Json column either. Both problems are fixed by a single structural decoder at the response boundary (`backend/src/index.ts`): a wrapper over `res.json` that deep-walks the body and converts any object holding a `toNumber` function to a number, before the core serialiser runs. Every route's `res.json({ ..., actualCost })` now serialises a number without touching a single route.
  - `instanceof Prisma.Decimal` is **unreliable inside the vitest process**: the test module's `@prisma/client` and the app's copy are distinct classes, so the same value was `instanceof`-true in the test file and false in the middleware. The decoder keys off the same structural duck-type the serializer uses (`toNumber` function), which is why the serializer regression test passes. `Date` and arrays are excluded before the duck-type check.
  - **The audit middleware still composes.** It captures the *current* `res.json` at request time, so it wraps the decoder's wrapper, not the core — an audit row for a work-order write carries JSON-serialised numbers, and the decoder never sees an audit row's stringly field values (it only converts things that are genuinely decimal). A `body: unknown` wrapper signature kept lint at the 42-error baseline (an `any` would have added a violation).
- **`costRules.ts` `num()` widened, not the callers.** It now accepts `number | { toNumber(): number } | null | undefined` and coerce via `toNumber()`, so `plannedCost = craft.hourlyRate * op.plannedHours` just works when either side is a `Decimal` from a Prisma row. The rule functions stay free of Prisma, matching the E.1 `costRules` convention.
- **The work-order snapshot serializer got a decimal branch.** `serializeWorkOrderSnapshot` maps `Decimal` to a number *before* the generic object walk, so snapshots written during the DB-backed suite (which would otherwise 500 on the Json column) round-trip successfully; a unit regression test pins the "writes money as numbers, not object internals" contract with duck-typed `{ toNumber: () => 45.5 }` fixtures.
- **OpenAPI now says what the column is.** The five `@openapi` notes that said "served as a JSON number … binary float" now read "**Stored as DECIMAL(12,2) since Phase E (D-17)**", and `Material.currentStock` gained an explicit "stays binary float (not in the D-17 monetary scope)" note so a future reader cannot guess which side of the split it falls on.

**E.13 verification**

| Gate | Result |
|---|---|
| Backend `tsc -b` | exit 0 |
| `eslint src tests` (backend) | 42 errors, identical set to the `HEAD` baseline — **no new violations** |
| Frontend `tsc -b`, `npm run build`, `npm test` | exit 0; build exit 0; **21 tests across 6 files** pass |
| Unit suite (no DB) | **531 cases across 30 files**, all passing (530 before; 1 new snapshot-decimal regression) |
| Full DB-backed suite on `cmms_gate` | **746 tests across 55 files**, all passing (745 before; 1 new = the snapshot-decimal case also over the DB) |
| `@openapi` strict YAML | **113 blocks, 0 failures** (spec rebuilt from the routes: **80 paths**) |
| Migration | `20260928170000_float_to_decimal` applied to `cmms_gate`; fresh-DB `prisma migrate deploy` replays the full chain cleanly (`cmms_gate_fresh`) |
| Database inspection | `information_schema` shows all seven columns as `numeric(12,2)` (`decimal`), quantities unchanged; a `Craft.hourlyRate` write/read round-trip through Prisma returns a `Decimal` with `toNumber() → 12.34` |

The wire-format contract held with zero route or client changes: the DB-backed suite (which sends `actualCost`, CSV exports, cost-split responses and snapshot rows) passed unchanged, and the one 500 wave during development was the Json-column snapshot failure just before the serializer branch — it neither changed assertions nor accepted corrupted numbers.

**E.13 acceptance notes (recorded for future reviewers)**

- **The wire-format trade-off is a precision trade-off.** D-17 is a three-layer contract, not a single fact: **storage** is `DECIMAL(12,2)` (exact), **internal arithmetic** coerces to `Number` via `toNumber()`/`Number(...)` (float64), and the **wire** serves a JSON number (float64). The compatibility win — no route or client change, money visible as ordinary numbers — costs wire-level precision: JSON numbers are *not* the exact decimal value. "Stored as Decimal" must never be read as end-to-end decimal precision; only after the `Number(...)` at the response boundary does the value round-trip as the stored scale. A future requirement for exact decimal transport (e.g. string money) would be a new, deliberate wire change, not a bug in D-17.
- **`instanceof Prisma.Decimal` is a residual fragility.** The decoder and serializer match Decimals structurally by duck-typing on `toNumber` (and excluding `Date`/arrays) precisely because `instanceof` is not reliable across duplicate `@prisma/client` copies in the vitest process. That duck-type is intentional but has no compile-time guard: a future Prisma wrapper change that renames or removes `toNumber` would **silently** stop the boundary conversion. Wherever this code is touched again, the regression tests to lean on are the snapshot-decimal unit case and the DB-backed 746-case run — the decoder has no dedicated test, which is an accepted residual worth closing if the wire contract ever changes.

#### E.1, stated as raw output

The multiplier lived in exactly one place, `backend/src/utils/costs.ts:19`. `recomputeWorkOrderCosts` is the single cost entry point, called from `labor.ts`, `workOrderOperations.ts`, `workOrderMaterials.ts`, `externalServiceCosts.ts` and `workOrders.ts`, so removing it there corrects all five call sites at once. A sweep of `numberOfTechnicians` across `backend/src` confirmed the other eleven references only read or write the field; none of them touch money.

The arithmetic moved to `backend/src/utils/costRules.ts`, free of Prisma, matching the existing `pmDueRules.ts` / `checklistRules.ts` convention, so it can be tested as arithmetic. `costs.ts` now fetches, calls it, and rounds once at the persist boundary via `roundMoney`.

The test the change was judged on is differential, not a golden number. `costRules.test.ts` carries its own reference implementation of the **old** formula and asserts the new one differs in exactly one term:

```
plannedCost(before) - plannedCost(after)  ===  the labour term alone
plannedMaterials, actualMaterials, serviceCost, actualLabor, actualCost  ===  unchanged
```

`tsc -b` exits **0**. The DB-free unit suite is **508 cases across 28 files**. `eslint src tests` reports **42** errors against a gate threshold of 50. `npm run gate` is `PARTIAL` locally because the DB step is skipped without authorisation; the CI run is the claim, not the local one.

**The test was negative-tested, because a test that only ever passes proves nothing.** Restoring the multiplier on a scratch copy of `costRules.ts` and re-running the file gave **5 failed, 6 passed**; restoring the fix gave **11 passed**. The cases detect the defect they were written for.

**One assertion was wrong and was corrected rather than accommodated.** I first asserted `roundMoney(1.005) === 1.01`. It returns `1`: `1.005` is stored as `1.00499999999999989…`, so `× 100` is `100.49999…` and rounds down. That is inherent to `Math.round(v * 100) / 100`, which is what the cost code has always done, so changing it would have silently moved stored figures. The test now asserts the real behaviour and names it as part of the reason D-17 exists.

**Row 49 stays `Partial`, and deliberately so.** The residual that matrix row named — the multiplier — is now closed, but the SOW formula also has a `+ other planned` term with no source in the schema. That term *is* the miscellaneous-cost line, and `ExternalServiceCost` currently has no category discriminator, so travel and permits cannot be told apart from contractor services (row 34, `Not Met`). Row 49 and row 34 are therefore one piece of work, and row 49 closes when row 34 lands. Marking it `Met` here would have been a status that the code does not support.

E.1 CI: run **36335261520**, `conclusion: success`, for exact SHA `ca9aa6334ff1aa1f32edb680406b1989ffd4b6bf`.

#### E.2, stated as raw output

SOW §3.3.6 requires "additional miscellaneous costs (travel, permits) as line items". The table already held every non-labour, non-material cost, so travel and permits were storable in principle — but with nothing to tell them apart, a cost report totalled a travel line and a contractor invoice together and called the result "services".

**One column, not a new table.** `ExternalServiceCost.category`, migration `20260927110000_service_cost_category`: `Service` (the contractor case), `Travel`, `Permit`, `Other`. `Service` is the default, and that is also the backfill — every pre-existing line already *was* a service, so a client that never sends a category keeps exactly the meaning it had. `NOT NULL DEFAULT` is deliberate: on Postgres 11+ this is a metadata-only change, so the table is not rewritten and no concurrent read blocks on it.

**Free text plus zod, not a native enum.** This schema has no enums, and v1.1-4 already records the accepted pattern: permitted values are validated in the zod schema at the API boundary. A native `CREATE TYPE` would be stronger enforcement, but it is the one alteration on a live table that cannot be reversed in place, and it would have made this the first enum in a schema that currently has none. Consistency and migration safety won.

The `+ other planned` term of §3.5.1 is the same line item, so `computeWorkOrderCosts` now returns `plannedServices` and `otherCosts` as well as their sum. **The two buckets are a partition of the same lines**, so the split makes the SOW formula explicable without moving a single total — asserted directly, by running the same lines with the categories stripped and comparing. That is what closed row 49 rather than E.1.

The category is exposed end to end: `POST`/`PUT` accept it, the list endpoint returns it, the OpenAPI blocks document it, and `WorkOrderDetailPage.tsx` has a select in both the add and the inline-edit form plus a Category column that renders a misc line differently from a service.

`tsc -b` exits **0** in both packages. The DB-free unit suite is **512 cases across 28 files** (4 new pure cases for the split). `eslint src tests` reports **42** errors against a gate threshold of 50. The frontend suite is 7 cases; locally the vitest forks pool reported worker-start errors and still completed, which is a sandbox resource limit rather than a result, so the CI run below is the claim.

Coverage added: 5 DB-backed cases in `externalServiceCosts.test.ts` — the default applies when the field is omitted, `Travel`/`Permit`/`Other` each persist, an out-of-set category is a zod 400, a line can be reclassified, **an update that does not mention the category does not clear it**, and the list endpoint returns a permitted value on every row.

The row-34 commit moves **two** matrix rows to `Met`: §3.3.6 from `Not Met`, §3.5.1 from `Partial`. Recounted from the Status column of all 214 clause rows rather than transcribed: **76 Met, 68 Partial, 37 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 50 Met, 35 Partial, 20 Not Met, 4 Deferred, 7 Excluded, 10 Waived**, leaving 76 open in §3. The `docs/SOW_COMPLIANCE.md` Summary table and both narrative paragraphs, and the `docs/DECISION_REGISTER.md` row 49 and D-3 row, were corrected in the same commit rather than left contradicting the matrix.

E.2 CI: run **36336673989** for exact SHA `722e1a37aa9914a25b9d6c3065f69b71d0a281bd`.

#### E.3, and the residual that was wrong about which field was missing

Row 26 is the §3.3.3 header-field clause. **The register's residual for it was factually wrong, and it was checked against the schema before anything was built.** The register said "Assigned Supervisor and Safety critical are absent from the work-order header". Both are present: `WorkOrder.supervisorUserId` and `WorkOrder.safetyCriticalFlag`.

The `docs/SOW_COMPLIANCE.md` row had it right — the missing field was `reportedByUserId`. Had the register been trusted, E.3 would have "added" two columns that already existed and left the actual gap open. Both documents now record the correction rather than only the fix.

`WorkOrder.reportedByUserId`, migration `20260927120000_work_order_reported_by`: added nullable, backfilled from `createdBy`, then from `supervisorUserId` for any legacy row whose `createdBy` is itself null, and only then set `NOT NULL`. `ON DELETE RESTRICT`, because a work order's reporter is a statement about the past and must not be erased by removing a user account.

**The field is deliberately not `createdBy`, and that is the entire reason it exists.** For a corrective job converted from a notification, `createdBy` is the planner who typed the conversion and the reporter is the technician who saw the broken machine. `convert-to-wo` now carries `notification.reportedByUserId` across, so the job is answerable back to its origin.

Wired through all three `workOrder.create` sites: the manual route (defaults to the authenticated caller, accepts an explicit nomination), `generatePmWorkOrder` (a PM job is raised by the plan rather than reported by a person, so the reporter is the actor — which is why the column is non-nullable rather than optional), and `convert-to-wo`. `reportedBy` is included on the detail read next to `supervisor`, and the two are asserted to be different facts in the tests.

Five DB-backed cases: the reporter defaults to the caller; an explicit nomination is accepted and does **not** disturb `supervisorUserId`; the detail read exposes `reportedBy` separately; an empty string is a zod 400; and the conversion case, which raises a notification reported by the operator, converts it as the admin, and asserts the work order names the operator while `createdBy` is the admin.

`tsc -b` exits **0** in both packages. The DB-free unit suite is **512 cases across 28 files**; `eslint src tests` reports **42** against a gate threshold of 50.

Counted from the Status column, not transcribed: **77 Met, 67 Partial, 37 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 51 Met, 34 Partial, 20 Not Met, 4 Deferred, 7 Excluded, 10 Waived**.

E.3 CI: run **36338619584** for exact SHA `e256ad150af5ba120f6c5818fd038c7654bdd5fe`.

#### E.4 — the field that had nowhere to go

Row 19 was the shortest clause in §3.2.2, "Damages/observations", and it was `Not Met` for a reason that took a second look to get right. The only free text on a notification was `description`. The obvious fix — start storing observations in `description` — is wrong, and not just untidy: `description` is the caller's summary written at raise time, and the observation is what somebody found afterwards. They are two facts, and overwriting one with the other destroys the record of what was originally reported, which is the thing a failure analyst needs.

`Notification.damagesObservations`, migration `20260927130000_notification_damages_observations`: nullable, and **that is the load-bearing decision**. A notification is raised *before* anyone inspects the asset, so making the column required would force an observation to be invented at raise time. It is filled in on the follow-up `PUT` once a technician has actually been there. Metadata-only on Postgres: no default, no rewrite, no backfill.

Wired through `notificationCreateSchema`, `POST /api/notifications` and `PUT /api/notifications/:id`, and documented in both OpenAPI bodies. There is no notification create form in the UI (notifications are raised through the API), so the frontend change is the type plus a detail card that only renders when the observation exists.

Four DB-backed cases in `notifications.test.ts`: null stays null rather than defaulting to a string; create with an observation leaves `description` alone; an observation added later does not disturb the original report; and the detail read returns it. While writing these the reporter test was also found to be leaking its `WorkOrder` into the shared test database and was fixed.

`tsc -b` exits **0** in both packages. DB-free unit suite **512 cases across 28 files**; `eslint src tests` **42** against a gate threshold of 50.

Counted from the Status column, not transcribed: **78 Met, 67 Partial, 36 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 52 Met, 34 Partial, 19 Not Met, 4 Deferred, 7 Excluded, 10 Waived**.

E.4 CI: run **36339202953** for exact SHA `96645ee799ffd3ef60c3d9a34747b8e4173a9910`.

#### E.5 — a number that was stored but meant nothing

Row 31 is one clause long: "Vendor must implement a material reservation concept". Both the matrix and the register claimed `reservationQuantity` "is never written". **That was wrong, and checking it first mattered.** It was already written on create and update; what was missing was any behaviour attached to it. Nothing read it, nothing stopped two jobs promising the same bearing, and no planner could see what was already committed.

So E.5 does not add a column. It gives the existing column meaning:

- `getMaterialAvailability` reports `currentStock`, `reservedQuantity` and a clamped `availableQuantity`.
- `assertReservable` refuses an over-reservation with **409 before the write**, so a line can never land in an over-reserved state for someone to discover at issue time. Both `workOrderMaterials` routes now honour that status instead of flattening every failure to a 500 — a stock conflict reported as a server error hides the one sentence the planner needs.
- The update path excludes the line's own reservation from the check. Without that, raising a line's reservation counts its old value against its new one and rejects the very change being made — the kind of bug that looks correct in review and makes reservations impossible to edit.
- Completed, Closed and Cancelled work orders stop holding their reservation automatically.

**Reservations are derived on every read rather than kept in a counter.** A `Material.reservedStock` column would be cheaper per read and would drift the first time a job was cancelled, a line deleted, or a route updated a line without remembering to decrement it. A wrong availability figure is worse than an absent one, because a planner trusts it and issues against stock that was not there.

Six DB-backed cases in `workOrderMaterials.test.ts`, on an isolated material so the shared master's own reservations cannot perturb the totals. The 409 case asserts the line is **absent from the database**, not merely that the response said no.

`tsc -b` exits **0**. DB-free unit suite **512 across 28 files**. `eslint src tests` **42** against threshold 50 — the one error this task introduced (an unused destructured parameter) was found and removed rather than left for the next person.

Counted from the Status column, not transcribed: **79 Met, 67 Partial, 35 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 53 Met, 34 Partial, 18 Not Met, 4 Deferred, 7 Excluded, 10 Waived**.

#### E.6 — E.3 and E.4 were both red, and neither was what it looked like

E.3 (run **36338619584**) and E.4 (run **36339202953**) both failed at the same step, `Test`, on the Backend job, with Frontend green. Two separate faults, one in each commit, and neither of them was bad test logic.

**E.3: a foreign key violated on every scheduled PM generation.** `generatePmWorkOrder` wrote `reportedByUserId: input.actorUserId`, and the unattended scheduler calls it with the literal sentinel `actorUserId: 'scheduler'`. `reportedByUserId` carries a foreign key to `User`, and no user has the id `scheduler`, so **every** PM generation died with `WorkOrder_reportedByUserId_fkey` — 7 tests in `pmGeneration.test.ts`. The mistake was assuming `actorUserId` is always a person. It is the identity of *whoever ran the job*, which for the scheduler is a sentinel, and conflating "who ran this" with "who reported this" was the whole error. Fixed in E.8.

**The migration was not the CI cause, and the first guess at it was wrong.** The first theory was that the `createdBy` backfill wrote `"system"` into the new column and the foreign key rejected it. That is a real latent fault — `WorkOrder.createdBy` is `@default("system")`, so on any database that already holds work orders the backfill *would* write a dangling value — and the corrected backfill that checks each candidate against `User` before using it is the right thing to have in the file. But it was not why CI was red, and the reason is worth recording: **CI applies migrations to an empty database and seeds afterwards, so the backfill `UPDATE` matches zero rows and the foreign key is never exercised.** A migration fault of this shape is invisible to CI by construction. The E.6 migration change is therefore a genuine robustness fix for real data, not a CI repair, and the tracker previously claimed otherwise.

**E.4: the update silently dropped the field.** `damagesObservations` was added to `notificationCreateSchema` but not to `notificationUpdateSchema`. A zod `object` **strips** keys it does not declare, so `PUT /api/notifications/:id` received the field, removed it, wrote nothing, and answered **200**. The route code was correct and the destructure was correct; the value never survived validation. This is the worst shape a bug can take — a success response for a write that did not happen — and the test that caught it ("records an observation added later") is exactly the case that existed to catch it. This one was real, and it is the fault that E.4's red run actually turned on once the PM-generation failures were accounted for.

`tsc -b` exits **0**. DB-free unit suite **512 across 28 files**. `eslint src tests` **42** against threshold 50.

#### E.7 — a shared-fixture bug found by reading, and row 32 closed for free

**The row-31 test bug.** E.5's reservation cases ran *before* the pre-existing cases in `workOrderMaterials.test.ts`, and the release case cancelled `woId` — the work order the outer suite creates in its own `beforeAll` and then uses for the list, create, malformed-body and hard-delete cases. It would probably have passed, since nothing in those cases asserts a work-order status, but it is the same class of fault as E.6: a test that mutates shared state and happens to get away with it. The block now creates its own work order and its own material, so cancelling one cannot reach anything else. This was found by reading the file, not by CI — which is the point of reading it.

**Row 32 closes with no code at all.** §3.3.5 says actual labour cost is "hours x craft rate **(from work center master)**", while §3.5.1 says the same figure is "hours x craft rate" with no parenthetical. The SOW names two different rate sources. D-16 already records the position supplied by the SOW owner that `Craft.hourlyRate` is authoritative, which makes the parenthetical superseded, and the code has always used it.

Verified rather than assumed before closing: actual labour is `hoursWorked x craft.hourlyRate` over booked entries (`backend/src/utils/costRules.ts:90-92`), and `WorkCenter.costRatePerHour` — the column the old residual said "is never used" — is read in `workCenters.ts` CRUD and once in `validation.ts` but by **no cost path**. The row is now `Met` for the wording, and the column is documented as master data that is deliberately not a second source of truth, rather than left looking like an oversight. No behaviour changed; the arithmetic is the pure function D-3 already exercised in CI.

Counted from the Status column, not transcribed: **80 Met, 66 Partial, 35 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 54 Met, 33 Partial, 18 Not Met, 4 Deferred, 7 Excluded, 10 Waived**.

#### E.8 — the CI log was unreadable, so the failure was reproduced instead

Three consecutive red runs on the same step, and the cause was still unknown: the Actions API reports which step failed but the literal logs return `403` without authentication, and no `GH_TOKEN` or `gh` CLI is available here. Guessing at a fix and pushing it is how a red run becomes a red run with extra commits on top.

**A local PostgreSQL 18 is running on 5432** — it had been recorded as unavailable, which was wrong. So the failing job was reproduced exactly: a **throwaway** database `cmms_gate` on the local instance, `prisma migrate deploy`, `npx tsx prisma/seed.ts`, then `vitest run` with the same env CI uses. The developer's own `cmms` database was not read, written, or migrated at any point.

The first local run failed in one second with the exact message CI could not show:

```
Foreign key constraint violated on the constraint: `WorkOrder_reportedByUserId_fkey`
  at src/services/pmGeneration.ts:225
```

`generatePmWorkOrder` set `reportedByUserId: input.actorUserId`, and `src/services/scheduler.ts:159` calls it with the literal `actorUserId: 'scheduler'`. Seven tests in `pmGeneration.test.ts` died on it. **The scheduled PM path — the one that runs unattended with nobody watching — was entirely broken by E.3**, and it was broken by the specific thing E.3 added: a foreign key on a column fed a value that was never a user id.

The fix does not invent a user. A PM work order is raised by the *plan*, not reported by a person, so the reporter is the plan's own supervisor — the same value already used for `supervisorUserId`. One resolution rule now feeds both columns, so they cannot disagree:

```ts
const raisedByUserId = input.supervisorUserId ?? plan.createdBy;
```

`actorUserId` is the right answer to "who ran this" and was the wrong answer to "who reported this". Keeping it in `createdBy` and `modifiedBy`, where a sentinel is legitimate, and taking the attributable person for the reporter, is the distinction the SOW is actually asking for.

Second local run: **721 tests across 53 files, all passing**, including the five DB-backed cases for row 26, the five for row 19, the six for row 31, and the whole pre-existing suite.

The wider lesson, recorded because it cost three red runs: **the 512-case unit suite, `tsc -b` and `eslint` were all green while a foreign key was being violated on every scheduled work order in the system.** Nothing short of a real database executing the code finds that class of fault, and a local instance was available the whole time.

E.8 CI: run **36341077785**, exact SHA `96988dd0daacde47933bbee1389a431224fcfdd6`, **Backend and Frontend both `success`**. This is the first green backend run since E.2, and it is cumulative — it carries rows 26, 19 and 31 and every fix between them, so E.3 through E.8 are all verified on this one SHA.

#### Working practice, corrected: there is a local database

Earlier phases of this tracker recorded "no authorised local PostgreSQL" and treated the Docker daemon as the only route to a database. **A local PostgreSQL 18 service is running on 5432** and has been all along. Use it, with these constraints:

- **Never point this at the developer's `cmms` database.** It is a real, populated database and is not a test fixture. Create a throwaway one (`cmms_gate` was used) and drop it when finished.
- Credentials come from `backend/.env` (`DATABASE_URL`); the value is **quoted**, so strip the quotes before passing it to a child process or Prisma will reject the URL as malformed.
- Override per command with `$env:DATABASE_URL`; do not edit `.env` to repoint the project.
- Reproduce CI with: `prisma migrate deploy`, `npx tsx prisma/seed.ts`, then `vitest run`, with `JWT_SECRET`, `NODE_ENV=test` and `SEED_DEMO=1` set as in `.github/workflows/ci.yml`.

The full DB-backed suite — **721 tests across 53 files** — runs in about two minutes this way. That is a two-minute feedback loop instead of a nine-minute CI round trip with unreadable logs, and it is the only way to see a foreign-key or constraint fault at all. Prefer it over pushing a speculative fix.

#### E.9 — the green suite, and what it did not prove

The local run gave something no earlier phase had: a real answer to the question every one of the 20 held rows was waiting on. All 20 carried the same residual — *"never run against a live database"* — and the obvious move was to promote them together on the strength of 721/721.

That would have been wrong, and checking cost about ten minutes.

Each row's residual was re-read and then **grepped for against the actual test files**. The result is blunt: **19 of the 20 have no test that touches the clause at all.** Not a failing test — an absent one. The suite is green because it never asks the question.

| Held on | Why it is still held |
|---|---|
| §3.1.1 tree counts | Nothing in `backend/tests/` references an aggregated count or a descendant rollup. `functionalLocations.test.ts` asserts the list and the tree shape only. |
| §3.1.2 location rules | `equipment.test.ts` *selects* a leaf as a fixture (lines 13-24) so its own create case has somewhere valid to go. It never asserts a refusal. |
| §3.1.2 / §3.1.5 BOM | No `equipmentBom` test file. The string `/bom` appears in no route test. |
| §3.1.2 attachments | Upload/list/download/delete covered against a valid parent; the missing-parent 400 this row names is not. |
| §3.1.3 crafts | `crafts.test.ts` has two cases: the list and a 401. No `POST`, no `PUT`, none of the 409 retirement refusals. |
| §3.1.3 capacity | No capacity test file; `buildCapacityBoard` has never executed. |
| §3.1.4 task lists | Eight cases covering list/401/403/create/400/update/delete — none of per-step materials, the duplicate refusal, or zero-quantity. |
| §3.1.4 template copy | `taskListId` never appears in `workOrders.test.ts`. The copy path has never been called with a template. |
| §3.1.5 WO-operation materials | `workOrderMaterials.test.ts` covers reservations and plain CRUD, but never sets `operationId`. |
| §3.2.1 M3 on completion | No route test contains the string `M3` or `Completion Confirmation`. |
| §3.2.1 transition validity | `workOrders.test.ts:111` covers *work order* transitions — a different map in a different file. `notifications.test.ts` never drives the notification lifecycle map. |
| §3.2.2 mandatory pair | One fixture location, and no assertion of the at-least-one rule, the contradictory pair, or the derived location. |
| §3.2.3 link navigation | The only test reading `WorkOrderNotifLink` is `pmGeneration.test.ts:185`, which belongs to row 47. |
| §3.2.3 close on completion | No test completes a work order that has converted notifications behind it. |
| §3.3.3 prefix config | No **route** test exists. `tests/unit/systemConfig.test.ts` is static source-reading — 6 `readFileSync`, no `prisma`, no `api()`. |
| §3.3.3 operation update | `workOrderOperations.test.ts` has no `PUT /:id` case at all. The fix's entire subject is a value surviving a Zod parse. |
| §3.3.5 labour attribution | Every case sends an explicit `userId` (lines 65, 73, 85), so nothing proves the login is authoritative. |
| §3.5.2 cost splits | No `workOrderCostSplits` route test. `tests/unit/costSplits.test.ts` is static source-reading — 3 `readFileSync`, no `prisma`, no `api()`. Its "is mounted in the api" case greps the source rather than calling it. |

**One row was promoted: §3.3.3, the at-least-one-operation guard (row 129).** It was the single held row whose residual was genuinely a database question, and the answer was already in the suite. `workOrders.test.ts:278` *"refuses to plan a work order that has no operations, and allows it once one is added"* asserts against live PostgreSQL that the transition returns **409**, the message matches `/operation/i`, exactly one `AuditLogEntry` with `action: 'Blocked'` and `fieldName: 'status'` is written, the row is still `Draft` rather than half-moved — and then, after an operation is added, the same hop returns **200** with `status: 'Planned'`. `:314` separately pins the deliberate `Cancelled` exemption so a later tightening cannot strand draft work.

The general finding, and the reason the other 19 stay held: **a green suite is evidence about the tests that exist, not about clauses no test touches.** Nineteen rows were held on a reason that is now false — the database exists and the code has run against it — and replacing that with a precise, actionable statement of which clause is untested is worth more than a promotion would have been. Each of the 19 now names the test it needs.

Two more, for the record. The OpenAPI parser emits a non-fatal `YAMLSemanticError: Map keys must be unique; "400" is repeated at line 34, column 7` from `backend/src/routes/functionalLocations.ts` during unit runs; it fails no assertion and was already present, but it does mean that spec is not strictly valid YAML. And no row was found whose tests *fail* — there was nothing to record on that front, because the suite is green. "Untested" and "failing" are different findings and the matrix now says which is which.

Counts: **81 Met / 65 Partial / 35 Not Met / 8 Deferred / 15 Excluded / 10 Waived** across 214; §3 is **55 / 32 / 18 / 4 / 7 / 10** across 126. Both verified by re-deriving them from the Status column rather than transcribing.


### Phase D - Preventive maintenance, and the first rows promoted to `Met` (COMPLETE, VERIFIED)

Phase D closed the §3.4 Preventive Maintenance subsection and, as a side effect, **broke the deadlock that held 23 Phase B/C rows at `IMPLEMENTED, NOT VERIFIED`**. Those rows were never promoted because `backend/tests/routes/*.test.ts` had never executed against a live PostgreSQL. CI does exactly that — `Apply migrations`, `Seed test data`, `Test` — so from `479a7f7` onward every DB-backed case in this phase has genuinely run. That is the only reason a matrix row is marked `Met` in this phase.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| D.0 | Gate parity: `npm run gate` matching CI, DB step refusing to self-skip | ✅ | One command runs typecheck, lint, unit, and — only with an explicit opt-out — the DB-backed suite. A missing database is reported, not silently skipped. | `9668db5`, `da02540`, `98822b5` |
| D.1 | Item-level safety-checklist gate (row 35) | ✅ | A work order cannot start while a mandatory checklist item is unanswered. Items are nullable and start blank; `'NA'` is a deliberate answer, never a default. Clearing an answer re-arms the gate. | `9b2e9bd`, `369ff13`, `7b3a17a` |
| D.2 | PM plan fields, target list, meter thresholds (rows 39, 46, 47) | ✅ | `priority`, `generatedWorkOrderStatus`, `notificationId` and a `MaintenancePlanTarget` list, with migration `20260927100000_pm_plan_targets_and_fields`. Boundary validation on create **and** on partial update. | `638dbd6`, `c0496b0` |
| D.3 | Due-date engine (rows 40, 41, 42, 43) | ✅ | `backend/src/utils/pmDueRules.ts`, pure and fully unit-tested: calendar-correct month arithmetic, `endDate`, both horizon units, meter evaluation, `Combined` earliest-due. | `2fc199f` |
| D.4 | Generation service shared by scheduler and manual route (rows 45, 48) | ✅ | One `generatePmWorkOrder` used by both entry points, so the manual button and the nightly run can no longer produce different work orders. Idempotent on both. | `60f016b`, `479a7f7` |
| D.5 | DB-backed coverage for the whole PM path | ✅ | 15 route cases in `backend/tests/routes/pmGeneration.test.ts` plus 28 service unit cases, executed against PostgreSQL by CI. | `60f016b`, `479a7f7` |
| D.6 | Matrix and tracker reconciliation | ✅ | `docs/SOW_COMPLIANCE.md` §3.4 rows re-derived from code; §3 totals recounted from the Status column, not transcribed. | `1c14c25` |
| D.7 | Phase D gate | ✅ | Green CI run for the exact final SHA, both jobs, every step. | `7b3a17a`, `c0496b0` |

#### The gate, stated as raw output

Final SHA **`c0496b021b92d9d1fd45555800a5ba39846f897e`**, run **36333270532**, both jobs, every step `success`:

| Job | Result |
|---|---|
| Backend (`ubuntu-latest`) | **success** — Typecheck, Lint baseline, Apply migrations, Seed test data, Test |
| Frontend (`ubuntu-latest`) | **success** — Typecheck, Build, Test |

https://github.com/MohammedAlmaqan/CMMSproject/actions/runs/36333270532

`7b3a17a` is green on run 36332065608 and is the first Phase D SHA where every job and step passed. The documentation commit `1c14c259fa81fd4405e0bdddd8c584c4efb24dda` is green on run **36333857715**, both jobs, and changes no code. Locally, against that tree: `tsc -b` exits 0; the DB-free unit suite is **497 cases across 27 files**; `eslint src tests` reports **42** errors against a gate threshold of 50. `npm run gate` is `PARTIAL` locally because the DB step is skipped without authorisation — the CI runs above are the claim, not the local one.

#### Five defects found in this phase, and what each one actually was

**1. A 500 on every PM generation, in the code that was meant to unify it.** `60f016b` passed `tsc` and every DB-free test, then returned HTTP 500 for every generation path in CI. The shared service called `db.$transaction` on a value that is sometimes a transaction client and sometimes the root Prisma client; only the root has that method. Fixed in `479a7f7` with a client check, plus 28 DB-free service tests around the call. **This is the argument for the D.0 gate: a green local unit suite did not mean the feature worked.**

**2. The re-arm I added was too eager, and CI caught it in the next run.** `369ff13` re-armed a `Completed` checklist whenever any item was blank. That also downgraded a checklist a planner had deliberately signed off *before* filling in the answers, so the work order then failed with the generic "must be completed" instead of naming the unanswered item. `7b3a17a` restricts the downgrade to an update that itself removes an answer. The rule is now "correcting an answer re-arms the gate", not "a blank anywhere re-arms the gate".

**3. A fixture that asserted the wrong thing about the scheduler.** `pmGeneration.test.ts` expected a repeat scheduler run to report a *skip*. It reports *not due*: the generated cycle becomes the baseline, so the next cycle is outside the horizon. The skip counter is for a unique-index race, which is covered by the double-press case and the service unit tests. The assertion was wrong, not the scheduler.

**4. A fixture that sent a value the API correctly refuses.** `checklistItemUpdateSchema` is an enum of `Yes`/`No`/`NA`; the rewritten fixture answered an item with free text and was rejected with 400. The schema was right.

**5. Partial updates could create a plan that can never generate.** `maintenancePlanUpdateSchema` is `.partial()`, so the create-time cross-field rules could not run on a patch: `PUT {strategyType:'Meter'}` with no thresholds passed every field check and produced a plan that is active, schedulable, and permanently not due — indistinguishable, from the outside, from a plan that simply is not due yet. The same held for moving `startDate` past an existing `endDate` and for stripping the last target. `c0496b0` adds `planPatchIssues`, which applies those rules to the merged record, runs only the rules whose fields the patch touches, and is called before anything is written. The unit tests caught that my first version of that helper accepted both a patch *and* a hand-merged record — two places for one value to come from — so the helper now does the merging itself.

The fifth defect is the one worth carrying forward: **every one of these was invisible from the outside.** None threw, none logged an error, none failed a build. A plan that never generates and a checklist that stays unblocked look exactly like working software.

#### Matrix effect, stated exactly

Phase D moved **nine** rows from open to `Met`, all in §3.4: six from `Partial` (plan fields, strategy choice, time-based intervals, meter-based intervals, task-list copy, idempotency) and three from `Not Met` (call horizon, configurable work-order status, plan notification). §3.4.2's seasonal/exclusion row stays `Waived` — a recorded decision, not a gap.

Recounted from the Status column rather than transcribed: **all 214 clauses are now 73 Met, 70 Partial, 38 Not Met, 8 Deferred, 15 Excluded, 10 Waived**; **§3's 126 rows are 47 Met, 37 Partial, 21 Not Met, 4 Deferred, 7 Excluded, 10 Waived**. §3.4 is the only §3 subsection with no `Partial` and no `Not Met` row. `docs/DECISION_REGISTER.md` §1 carried the same arithmetic and was corrected in the same commit rather than left contradicting the matrix.

#### Not done, and deliberately out of Phase D

- **D-3, the technician-multiplier removal (row 49), is not done.** It stays in Phase E with row 49, and `backend/src/utils/costs.ts` was not touched.
- **D-4, the backup and restore drill, is not done.** It is Phase G and needs a live host, as recorded above.
- **D.5, the capacity board, was not revisited** beyond the C.17 fix; the PM-generated work orders now flow into it, which is the first time the board has had scheduler output to display.
- The Playwright `verify_g3*`–`verify_g6*` scripts still need a Vite server on port 3000 and were not re-run in this phase. They are frontend flows and Phase D changed no frontend.

### Phase F - DB-backed suites for the 19-hold residual rows (§3)

The E.11 boundary note deferred **19 §3 rows** that E.9 restated as *clauses whose behaviour no test exercises*: "The DB-backed suites that must exist before any of those 19 rows can move are **Phase F's work**." Phase F writes those suites against the same live-PostgreSQL pipeline every Phase D/E row was judged on, then re-derives the matrix Status column from what the suites prove. A row whose suite pins the implemented behaviour moves to `Met`; a row whose suite exposes a genuine gap stays `Partial`/`Not Met` *and names the residual anew* — Phase D's rule ("every one of these was invisible from the outside") is the reason the suites come first and the status second.

**On the letter F and the register's "Phase F".** The DECISION_REGISTER §5 worksheet labels its own §3-row grouping "**F** – Reporting, BI layer and the UAT pack (6.4.1, 6.4.2)". That is scope-freeze *worksheet* grouping, not a tracker phase letter. This tracker's Phase F is defined by the E.11 deferral note above, which is the operative definition in this document. The register's reporting/UAT rows are a separate workstream tracked under its own rows.

**F.0 — the 19-hold scope, stated as a test-construction plan.** E.9's table listed 18 held *clauses*; the count reconciles at 19 *matrix rows* because the "§3.1.2/§3.1.5 BOM" entry spans two rows. Every residual row is mapped below to its exact matrix row (`docs/SOW_COMPLIANCE.md` line = source of truth), its current Status, and the specific test that must exist before the status can move. No row is promoted by F.0; no matrix claim changes until the suite for that row is green.

| # | Held clause (E.9) | Matrix row — SOW § / requirement | `SOW_COMPLIANCE.md` | Status today | The test Phase F must add |
|---|---|---|---|---|---|
| F0a | §3.1.1 tree counts | §3.1.1 Display open work orders and notification count for each node | `:79` | Partial | `GET /api/functional-locations/tree` returns per-node own **and descendant** WO + notification counts; create counts under a child, assert the parent rolls them up. |
| F0b | §3.1.2 location rules | §3.1.2 Each equipment record assigned to exactly one functional location (lowest level) | `:81` | Partial | Creating equipment under a **non-leaf** location is refused (400/409); a leaf accepts; an update that picks a non-leaf is refused too. |
| F0c | §3.1.2/§3.1.5 BOM | §3.1.2 BOM: associate spare parts from the material catalog with an equipment | `:84` | Partial | `POST/PUT/DELETE /api/equipment/:id/bom` end-to-end: add a catalog material to the equipment BOM, update quantity, delete. |
| F0d | §3.1.2/§3.1.5 BOM | §3.1.5 Link materials to equipment BOM | `:96` | Partial | Same surface (this is the second half of the BOM clause); the material is reachable back from the equipment read. |
| F0e | §3.1.2 attachments | §3.1.2 Documents: attach manuals, datasheets, certificates to equipment | `:85` | Partial | Upload/list/download/delete against a valid parent (already covered) **plus the missing-parent 400** this row actually names. |
| F0f | §3.1.3 crafts | §3.1.3 Assign crafts to each work center, each with its own hourly rate | `:88` | Partial | `POST`/`PUT` craft route cases (create with rate, update) and the **409 retirement refusals** — a craft holding work orders refuses retirement. |
| F0g | §3.1.3 capacity | §3.1.3 Work centers and crafts used for scheduling and cost estimation | `:89` | Partial | `GET /api/work-centers/capacity` — `buildCapacityBoard` executes against live PostgreSQL; assert the board shape (intervals, craft slots, load vs capacity). |
| F0h | §3.1.4 task lists | §3.1.4 Task lists: reusable sets of operation steps with estimated labour hours, craft, and required materials | `:92` | Partial | Per-step `TaskListMaterial` CRUD, the duplicate-material refusal, and the zero-quantity refusal — the three gaps E.9 named. |
| F0i | §3.1.4 template copy | §3.1.4 Work orders can copy operations from a task list | `:94` | Partial | `POST /api/work-orders` with `taskListId` copies the operations (and per-step materials) into the draft work order. |
| F0j | §3.1.5 WO-operation materials | §3.1.5 Link materials to work order operations | `:97` | Partial | `POST` material against a specific `WorkOrderOperation` so the row carries `operationId`; the materials route never sets it in any existing test. |
| F0k | §3.2.1 M3 on completion | §3.2.1 M3 autogenerated when a work order is completed | `:104` | Not Met | Complete a work order and assert an M3 / "Completion Confirmation" notification is created inside the completion transaction and linked to the WO. |
| F0l | §3.2.1 transition validity | §3.2.1 Transition validity enforced (illegal transitions rejected) | `:106` | Not Met | Drive the **notification** lifecycle map (Open → In Process → Completed → (Converted)) — legal hops 200, illegal hops rejected. `workOrders.test.ts:111` covers the *work-order* map only. |
| F0m | §3.2.2 mandatory pair | §3.2.2 Key fields … Functional Location / Equipment (mandatory selection) | `:108` | Partial | At-least-one of FL/Equipment on notification create (400 when both absent), the contradictory pair, and the derived location consistency. |
| F0n | §3.2.3 link navigation | §3.2.3 System shows the relationship and allows navigation between notification and work order | `:115` | Partial | Bidirectional navigation: the WO detail serves its originating notification; the notification serves its WOs. Phase F must decide frontend (component) vs backend (link resources) split for this UI clause. |
| F0o | §3.2.3 close on completion | §3.2.3 After work order completion, notification status can be set to Completed manually or automatically | `:116` | Not Met | Complete a WO that has converted notifications behind it and assert their status flips to Completed (or a manual completion endpoint works). |
| F0p | §3.3.3 prefix config | §3.3.3 WO Number auto-generated with a configurable prefix | `:127` | Partial | **Route** test: set `woNumberPrefix` in `SystemConfig`, generate a WO, assert the number carries the configured prefix. No route test exists today. |
| F0q | §3.3.3 operation update | §3.3.3 Per operation: sequence, description, craft, planned hours, number of technicians, actual hours, status | `:130` | Partial | `PUT /api/work-orders/:id/operations/:operationId` — a full-field update where the changed value survives the Zod parse (the entire subject of the fix). |
| F0r | §3.3.5 labour attribution | §3.3.5 Technician identification via login; entries stamped with user and timestamp | `:140` | Partial | `POST` labour **without** a `userId` — the technician is derived from the authenticated session; a client-supplied `userId` cannot override it. |
| F0s | §3.5.2 cost splits | §3.5.2 Support cost splitting when a work order covers multiple cost centers (percentage allocation) | `:175` | Partial | `PUT /api/work-order-cost-splits` allocation with 100% validation and read-back through the WO cost breakdown, replacing the static source-reading unit test. |

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| F.0 | Phase F scope recorded (the 19-hold plan above) | ✅ | Every residual row mapped to its matrix row by `docs/SOW_COMPLIANCE.md` line; the 19 count reconciled (18 clauses; the BOM entry spans `:84` and `:96`); no row promoted and no matrix claim changed by the recording. | *this commit* |
| F.1 | Master-data write-path suites: tree counts, location rules, crafts, task lists, template copy (F0a, F0b, F0f, F0h, F0i) | ✅ | Five suites over live PostgreSQL; each asserts exactly the clause it names; rows promoted to `Met` only where the behaviour holds. | *this commit* |
| F.2 | BOM and operation-material suites (F0c, F0d, F0j) | ✅ | `POST/PUT/DELETE /api/equipment/:id/bom` and the operation-scoped material write are exercised end-to-end. | *this commit* |
| F.3 | Attachment missing-parent suite (F0e) | ✅ | Upload/list/download/delete all return 400 for a missing parent. | *this commit* |
| F.4 | Capacity-board suite (F0g) | ✅ | `buildCapacityBoard` runs against live data; board shape asserted. | *this commit* |
| F.5 | Notification lifecycle suites: M3, transition validity, mandatory pair, link navigation, close on completion (F0k–F0o) | ✅ | M3 auto-created on completion; notification transition map driven both ways; at-least-one rule asserted; navigation split decided (F0n); auto-close asserted. | *this commit* |
| F.6 | Work-order rules suites: prefix config, operation update (F0p, F0q) | ✅ | A route test proves the configured WO-number prefix; a `PUT` operation update survives the Zod parse. | *this commit* |
| F.7 | Labour attribution suite (F0r) | ✅ | Session-derived technician is authoritative; client-supplied `userId` cannot override. | *this commit* |
| F.8 | Cost-split suite (F0s) | ✅ | 100% validation and read-back over the route; the static source-reading unit test is superseded. | *this commit* |
| F.9 | Phase F gate: matrix recount, docs delta, green CI for the exact SHA | ✅ | Status column re-derived from the suites' outcomes; §3 counts recounted; every promotion cites its suite; green CI both jobs; report carries the Docs delta. Arithmetic reconciliation: 16 of the 19-hold set promoted, 3 held with residuals re-stated (89/97/175), plus row 103 outside the set = 17 Met moves; row 93 re-stated separately, never part of the 19. | *this commit* |

**Phase F boundary (this stop point).** F.0 is recorded above; the F.1–F.9 suites are the work. Phase F stops here for review before the first suite is written, so the scope — especially the F0n split decision and the three `Not Met` rows (F0k, F0l, F0o) whose code may already implement the clause — is agreed before tests start dictating matrix moves.

### Phase G — Non-functional and Operational Readiness (§6.4.3)

Started 2026-09-29. Phase G has **no §3 build rows**. Its only §3 clause (OAuth2, row 76) was waived under D-5; the non-functional work §6.4.3 demands is three rehearsals tracked under **§7 / D-4**, not in the §3 register:

1. **100-VU performance run** (§6.4.3) — `k6.exe` is held at `scripts\k6\k6.exe`, so this rehearses the §6.4.3 acceptance criterion.
2. **Backup/restore rehearsal under D-4** — live PostgreSQL + `PGPASSWORD` are held on this host, so the full `backup.bat` → `restore-drill.bat` drill can run. The **second backup target is not a Phase G blocker**: the daily `pg_dump` mechanism already works. **Superseded 2026-10-05:** the WAL/RPO proof that used to await a second target has since been rehearsed against one (see G.3), so it is no longer a pending verification.
3. **200-VU §4.1 test** — remains **deferred by recorded decision** (P2028 pool exhaustion), not attempted in Phase G.
4. **§4.2 TLS rehearsal** — **rehearsed on the host 2026-10-02** (G.4): IIS + ARR + URL Rewrite serve `cmms.local` over HTTPS with both limbs green. The site physical path was moved to `C:\inetpub\cmms-site` to escape the user-profile traverse chain (see G.4).

| # | Task | Status | Findings |
|---|---|---|---|
| G.0 | Phase G boundary: environment survey **on this host (corrected 2026-09-29)** | ✅ | Surveyed so the phase is planned around what actually exists. **Held:** `scripts\k6\k6.exe` v2.3.0 (portable binary, gitignored by design — this is what the §6.4.3 100-VU run needs); **IIS** with `W3SVC` **running** (Automatic) and port 80 serving `http://localhost` → 200; **URL Rewrite 2.1** and **ARR 3.0** installed and their modules load; live PostgreSQL 18 at `localhost:5432` with `PGPASSWORD` set and `cmms`/`cmms_gate` databases present; `pg_dump`/`psql`/`pg_restore` resolve under `C:\Program Files\PostgreSQL\18\bin` (already `backup.bat`/`restore-drill.bat`'s fallback); `python` 3.14.7; `app\dist` and `backend\dist` built. **Genuinely blocked at this boundary:** the §4.2 TLS rehearsal's IIS configuration steps (site binding, self-signed cert, hosts entry) require an **elevated** shell — this one is not — so HTTPS execution cannot start until the operator runs the documented IIS steps or an elevated session is provided; the §4.1 200-VU test is **deferred** by recorded decision (P2028 pool exhaustion), so it is not attempted; the D-4 **second backup target is not a Phase G blocker** — the daily `pg_dump` mechanism already works, and the WAL/RPO proof alone awaits the second target. Nothing was executed at this boundary recording. | `3ec798b` |
| G.1 | 100-VU performance run (§6.4.3) | 🔶 | `scripts/k6/acceptance.js` added as the 100-VU counterpart to `smoke.js` (2m ramp to 100 / 5m steady / 1m down, steady p95<2000ms + `http_req_failed<0.01` thresholds). First run exposed a real environment gap: the live `cmms` DB was **8 migrations behind** the repo (last applied `20260925145405`), so the read path 500'd on columns that did not exist yet and the run exited 99 (`http_req_failed` 99.64%). Per the standing rule, backed up `cmms` unconditionally, then `npx prisma migrate deploy` applied the 9 pending migrations; read path then verified 200/200/200 (login → list → detail). Re-run post-migration: steady `p(95)` **51.78 ms** (budget 2000 ms) with work-order **list + detail all HTTP 200** — the read path accepted 100 VUs cleanly — but the **login burst failed**: 55 of 200 logins returned HTTP 500 with **P2028** ("Unable to start a transaction in the given time"), i.e. Prisma connection-pool exhaustion; k6's per-VU login retry then tripped the 200/15-min `K6_MODE` limiter (16,161 × 429), driving `http_req_failed` to 28.45% and a second exit 99. **Verdict:** read path passes at 100 VUs; the login burst reproduces the recorded P2028 pool-exhaustion issue at higher load — the §4.3/D-4 `max_connections`+`connection_limit` fix (ADMIN_GUIDE 14.3) is confirmed as the blocker for both the §4.1 200-VU test and a clean §6.4.3 100-VU sign-off. Both raw runs (pre- and post-migration) are preserved as evidence the acceptance test works. | *this commit* |
| G.2 | D-4 full backup/restore drill (backup.bat → restore-drill.bat) | ✅ | `backup.bat` produced `cmms-2026-09-29-1551.sql` (673,414 bytes) + 75-file uploads snapshot, and after the migration `cmms-2026-09-29-1609.sql` (730,878 bytes) + 75-file snapshot. `restore-drill.bat` restored the newest dump into `cmms_restore_test`, queried **189** work orders, verified the attachment snapshot (75 files vs 75 live), dropped the drill database and printed **PASS** in **5.75 s**. D-4's full-backup/restore limb is now rehearsed on a live PostgreSQL host. | *this commit* |
| G.3 | D-4 WAL archiving + PITR (was: configuration only, proof pending second target) | ✅ | **Rehearsed on the host 2026-10-05 by `scripts/pitr-drill.ps1`**, which supplies the second target the row used to be blocked on. A throwaway cluster on port 5433 ran the ADMIN_GUIDE **7.8** settings with the target resolved to `C:\cmms-wal\wal`: `pg_stat_archiver` reported **6 archived / 0 failed**, observed commit-to-archive lag **1 s**, `archive_timeout=300` bounding worst-case loss to 5 min. The base backup (`-X none`) was then restored into a *second* throwaway cluster on 5434 and replayed from the archive to `recovery_target_time = 2026-10-05 17:29:45+03`, stopping before a committed transaction while keeping an earlier one: `recovery stopping before commit of transaction 962`, `selected new timeline ID: 2`, `archive recovery complete`, **340/340** work orders. Three defects surfaced that a config-only reading would have shipped: `copy` **cannot** be reused as `restore_command` on Windows (cmd parses the `/` in the relative `pg_wal/RECOVERYXLOG` as a switch, so 0 files transfer), `recovery.signal` is required or the cluster silently stops at the backup end LSN, and `pg_basebackup -X stream` leaves a truncated start segment that hides post-backup WAL in that segment. All three are documented in ADMIN_GUIDE 7.8. §4.3 row 262 moved `Not Met → Met`; row 261 stays `Partial` on the differential limb alone (its "pending the second backup target" wording is superseded). The target path is **deployment-configurable**, and `archive_mode` is still `off` on the live cluster — enabling it there is a deployment step, not part of this rehearsal. | *this commit* |
| G.4 | §4.2 TLS rehearsal | ✅ | **Rehearsed on the host 2026-10-02 by the operator in an elevated session.** The rehearsal first placed the site physical path under the user profile, where the static-file limb returned **HTTP 401.3** (handler StaticFile, `0x80070005`): read permission on `dist` is not enough, because Windows checks *traverse* on every ancestor directory, and the profile-folder chain cannot be granted without `takeown` + `icacls /reset`, both invasive. **Lesson: the IIS physical path must not be under `C:\Users\<user>\` — `C:\inetpub\<site>` needs no ACL work.** Fix: the site content was placed at `C:\inetpub\cmms-site` and the `cmms.local` physical path repointed in IIS Manager; no further ACL work. Both limbs then verified: `curl -k https://cmms.local/api/health` → `200`, `application/json; charset=utf-8`, `X-Powered-By: ARR/3.0`, `{"status":"ok",...}`; `curl -k https://cmms.local/dashboard` → `200`, `text/html`, SPA `<div id="root"></div>`. **Cleanup record — three grants left by the failed attempts, none affecting the working state; reverse commands for a future reader:** `icacls "C:\Users" /remove "IIS_IUSRS"`; `icacls "C:\Users\Injaz\Documents\Default Project\CMMSproject\app\dist" /remove "IIS AppPool\DefaultAppPool"`; `icacls "C:\Users\Injaz\Documents\Default Project\CMMSproject\app\dist" /remove "IIS_IUSRS"`. The `web.config` also remains in the original `app\dist`; the running site uses the `C:\inetpub\cmms-site` copy. | *this commit* |
| G.5 | ✅ | **GO approved by the owner 2026-10-03 and executed the same day against the live stack (backend on `:4000` with `K6_MODE=1` and a non-production `NODE_ENV`).** New `scripts/k6/capacity.js` - a single ramping-vus scenario (2m ramp to 200 / 5m hold / 1m down; thresholds `p(95)<2000` and `http_req_failed` `rate<0.01`), the same login -> list -> detail read path as `acceptance.js`. **Result: exit 0, `http_req_failed` 0.00%, p(95)=1.15 s (budget 2000 ms), p(90)=1.01 s, median 535 ms, `vus_max`=200, 73,718 checks 100% passed, 36,591 iterations.** The backend log across the window records **0 P2028 / 0×429 / 0×500**. The 27.53 s max request is a single login-burst outlier; the p95 budget is met. **Scope note:** `capacity.js` drives the read path only (login → list → detail), so the SOW §4.1 transactional-save (<1 s) limb is **not measured** and row 253 stays `Partial` on that residual. | `*this commit*` |
| G.6 | Fix P2028 pool exhaustion and re-run the 100-VU §6.4.3 acceptance to a **clean pass** | ✅ | One coherent story in three steps. **(1) Failing run (baseline, post-migration):** `acceptance.js` as introduced → exit 99, `http_req_failed` 16.78%; back-end login histogram 165×200 / 10069×429 / 35×500; read path fully inside budget (steady p95 92.81 ms). **What produced each failure:** the 500s were still Prisma P2028, but a different face — pool starvation was gone, queued logins now waited on the account row lock (`FOR UPDATE`) past Prisma's 5 s interactive-transaction timeout and Prisma rolled them back ("Transaction already closed… timeout was 5000 ms"); the 429s came from the script itself — its ramp+steady+rampdown layout creates **three fresh pools of 100 VUs = ~300 first-time logins**, over the 200/15-min `K6_MODE` ceiling its own header documents, and every failed VU re-logins each iteration, so the failures compounded. **(2) The fix (two parts + one script correction):** bcrypt comparison already moved out of the login transaction (row lock held only for fast accounting); pool sized via `?connection_limit=20&pool_timeout=30000` (note `pool_timeout` is ms); the login `$transaction` now passes `{ maxWait: 30000, timeout: 30000 }` (`backend/src/routes/auth.ts`) so login-waiters are allowed to start instead of being rolled back; `acceptance.js` reshaped to **one** ramping-vus scenario (2m→100 / 5m hold / 1m→0) so only ~100 VUs exist = ~100 first-time logins. The `K6_MODE` limiter in `backend/src/index.ts` was **not** changed (200/15-min ceiling intact — explicit requirement). **(3) Passing run:** exit 0, `http_req_failed` **0.00%**, p(95)=**235.65 ms** (budget 2000), 66,881 checks **100%** passed (login + WO list + WO detail), 33,300 iterations; back-end log confirms **0 P2028 and 101×200 / 0×429 / 0×500** logins. ADMIN_GUIDE 14.3 documents the full story; back-up `cmms-2026-09-29-1659.sql` taken before the fix era. | *this commit* |

**Phase G boundary (extended this stop point).** G.0 is the survey. With `k6.exe`, IIS+ARR and a live PostgreSQL + `PGPASSWORD` **all held on this host**, the §6.4.3 acceptance work was executed: the 100-VU performance run (G.1), the D-4 full backup/restore drill (G.2, **PASS**), and the WAL archiving configuration (G.3, proof recorded pending its second target). G.6 then resolved the blocker G.1 surfaced — Prisma P2028 on the login burst — and the 100-VU run now passes **cleanly** (0 P2028, 0×429, 0×500). The §4.2 TLS rehearsal (G.4) had both limbs green over HTTPS when rehearsed on 2026-10-02; the owner has since deployed the site live, and a re-verification on 2026-10-03 initially found the SPA limb green over HTTPS while the API health limb returned **502.3** only because no backend process was listening on `:4000`. With the backend started on `:4000`, both limbs re-verify green (`/api/health` → 200 JSON, `/dashboard` → 200 SPA over HTTPS), so §4.2 is promoted to `Met` and L30 is retired. The §4.1 200-VU test (G.5) is no longer deferred: the owner approved GO on 2026-10-03 and it was executed the same day - `capacity.js` at 200 VUs passed cleanly (p(95) 1.15 s, `http_req_failed` 0.00%, 0 P2028 / 0×429 / 0×500), so the §4.1 concurrency and screen-load limbs are met and promoted in the follow-up commit; row 253 stays `Partial` because `capacity.js` drives the read path only and the transactional-save limb is unmeasured. Phase G stops here for review.

---

### Phase R - Reporting, BI layer and the UAT pack (register Phase F, §3.5.3 / §3.7 / §6.4) - closed 2026-10-02

**Lettering.** These steps are `R.0`-`R.n`, not `F.0`-`F.n`. The tracker's `F.0`-`F.9` are taken: they were the DB-backed suites for the 19-hold residual rows, and that phase is complete. This phase is register **Phase F**, whose subject is reporting and the UAT pack. The two letters are unrelated work and reusing `F` would make every `F.n` citation ambiguous. "R" for reporting.

**Why this phase, and why now.** Of the register's open Build rows, this is the one that blocks go-live. §6.4 has **four** `Not Met` rows, and this phase targets two of them:

| §6.4 row | Criterion | In this phase? |
|---|---|---|
| 6.4 / a | All §3 functional requirements implemented **and pass UAT scripts** | **Yes** — this phase delivers the UAT pack. Stays `Not Met` regardless: the clause is a conjunction, and 14 §3 rows are still `Not Met` and 17 `Partial` at the time of this plan (R.8 recount: **7 `Not Met`, 10 `Partial`**). Closing it needs register Phase H as well. |
| 6.4 / b | All standard reports produce correct data **verified against manual calculation** | **Yes** — this is the phase's acceptance criterion. Closes when the reconciliation pack exists and passes. |
| 6.4 / c | No open Critical or Major defects at go-live | No. Downstream of a, b and Phase H. Not actionable as a build task. |
| 6.4 / d | Data migration accuracy > 99.9% | No. No client legacy dataset exists (§1.3, §5.7). Nothing to build; blocked on data, not code. |
| 6.4 / e | Performance at 100 concurrent users | Already `Met` (Phase G, 2026-09-29). Closed. |
| 6.4 / f | Documentation delivered | `Partial`, carries two §6.2 gaps tracked in the Phase I documentation work, not here. |

So this phase **closes one §6.4 row (b)**, **delivers the missing half of another (a)**, and leaves c and d untouched. The go-live-blocking set in the SOW matrix Summary is unchanged in count by this phase; row b is the only one of its members this work can move.

**The 14 Build rows, by name.** All from `docs/DECISION_REGISTER.md` §5, all `Build`, all currently below `Met`:

| Row | Clause | Requirement | Now |
|---|---|---|---|
| 51 | §3.5.3 | Costs summarisable by functional location hierarchy (rollup to any level) | Not Met |
| 52 | §3.5.3 | Costs summarisable by equipment | Not Met |
| 53 | §3.5.3 | Costs summarisable by work order type | Not Met |
| 54 | §3.5.3 | Costs summarisable by time period (year, quarter, month) | Partial |
| 58 | §3.7.1 | All reports filterable by date range, location, equipment, and work center | Not Met |
| 59 | §3.7.1 | All reports exportable to PDF and Excel (raw data) | Not Met |
| 60 | §3.7.1 | Work Order Backlog — count and total estimated hours by status, priority, work center | Partial |
| 61 | §3.7.1 | PM Compliance — (Completed PMs / Scheduled PMs) × 100 for a period | Partial |
| 62 | §3.7.1 | MTTR — average repair duration, per equipment/location | Partial |
| 63 | §3.7.1 | Maintenance Cost Summary — actual vs budget by cost center/location | Partial |
| 64 | §3.7.1 | Material Consumption Report — by material, work order, equipment | Partial |
| 65 | §3.7.2 | Backlog Hours by Work Center | Not Met |
| 66 | §3.7.2 | Top 10 Highest-Cost Equipment | Not Met |
| 67 | §3.7.2 | Notifications Awaiting Conversion | Partial |

Row 68 (dashboard realtime/drilldown) is `Waive` in the same phase and is not work.

#### R.0 - the 14-row scope, stated as a build plan

**What the code actually is today.** Measured 2026-09-29 against the running app, not from the matrix:

- `backend/src/routes/reports.ts` has exactly 7 report handlers. Six take `async (_req: Request, ...)` and **ignore the request entirely** — `:41` backlog, `:200` mtbf, `:291` mttr, `:371` cost-summary, `:447` downtime, `:533` material-consumption. Only `:127` pm-compliance reads `req.query` (`:129`, `year`/`month`). So row 58 is not a partial gap; six of seven reports cannot filter at all.
- Rows 65 and 66 have no handler and no screen. `app/src/pages/ReportsPage.tsx:212-218` lists exactly the seven that exist.
- Export is CSV only, built in the browser (`ReportsPage.tsx:185` `exportCSV`). There is no server-side export and no `.xlsx` dependency in `backend/package.json`. Row 59 needs a real xlsx writer; the PDF limb is **waived** under D-9 and is not rebuilt.
- There is **no SQL view layer** in the repository (`CREATE VIEW` returns nothing). D-13 committed the vendor to SQL views as SOW §5.2's stated alternative for the Client's BI tool. That is part of this phase, not a later one.
- Row 63's budget limb is **waived** under D-13 — actual-vs-planned variance is the deliverable, because the SOW contains no budget source.
- `backend/src/utils/costRules.ts` already computes per-WO planned and actual cost (`computeWorkOrderCosts`, `:97`, returning `plannedCost`/`actualCost` at `:140-141`). The rollups in rows 51-54 are aggregation over that, not new costing logic. `/cost-summary` (`:371`) today loads every work order and accumulates into a `Map` keyed on `costCenterCode` in application memory. Row 54's period axis is the one that must not re-derive time from a string.
- **`WorkOrder.plannedCost` and `actualCost` cannot be the rollup's base.** R.1 measured this on the live database: 4 work orders, 178 planned operation-hours, derived planned cost 135.00, and `plannedCost` reads 0 on 2 of the 4 rows — 90.00 and 45.00 of real planned labour sitting in the operations table while the column says zero. Summing the columns would have produced a confidently wrong report that passes every test written against it. The rollup therefore derives from the base tables through `computeWorkOrderCosts`, the same function the work-order detail uses, so a rollup total and a work order's own figures cannot disagree. The stale column is the subject of **R.9**.
> **R.9 revised this line twice, and the second revision is the one that counts.** As first written it read "the 90.00 row is a real defect, the 45.00 row is test residue; the honest figure is 1 of 4 rows stale in production." **That was half right, and wrong in the part that mattered.** Once R.9 D inventoried the live database with provenance rather than by pattern, *both* cited rows turned out to be fixtures: `765884b2-...` (WO-000097, the $90 row) had description `G4a verify` and came from plan `G4A-TEST`, and `51b43878-...` (the $45 row) came from a route test writing operations straight to Prisma. Neither is a production row, so **0 of the 4 measured rows demonstrate a production defect.**
>
> Both halves have to be held at once, and dropping either one is how this gets misread later. **The code defect was real and R.9 A fixed it:** of the four paths that create a work order, the two automated ones wrote the work order and its operations directly with Prisma and never called `recomputeWorkOrderCosts`, so a scheduler-generated work order would arrive with a $0.00 planned cost in production. **The rows that appeared to prove it were fixtures:** the live database held no production plan and no production work order at all — 31 plans, every one test debris. So the defect was found by reading the code path, not by the row count, and the row count was never evidence of anything. `scripts/verify/verify_b1.py` still prints the raw count because a count that quietly excluded rows would be worse than one explained here; its output should now be read as *what the measurement can and cannot see*.
- **Correction to what R.1 first concluded.** R.1's commit message blamed the write path: *"Creating or editing a `WorkOrderOperation` does not trigger it."* That is **wrong**, and R.9's investigation corrects it. `workOrderOperations.ts` recomputes on all three verbs — create `:142`, update `:230`, delete `:303`. The real cause is narrower and worse: of the four paths that create a work order, **the two automated ones never recompute at all**, because they write the work order and its operations directly with Prisma inside a transaction and never call `recomputeWorkOrderCosts`:

  | Path | Recomputes? | |
  |---|---|---|
  | `workOrders.ts:355` `POST /api/work-orders` | yes, `:490` | manual path, correct |
  | `workOrders.ts:538` `PUT /api/work-orders/:id` | yes, `:579` | manual path, correct |
    | `services/pmGeneration.ts:236` — PM scheduler | **no** | creates the WO, then one `workOrderOperation.create` per task-list step at `:265`, never recomputes. **This is the one real defect.** |
    | `routes/notifications.ts:594` — notification converted to a work order | n/a | **Also corrected by R.9.** This path creates *no operations at all*, so `plannedCost = 0` is correct there rather than a bug. Listed only because R.1 wrongly counted it. |

    So the manual route is sound, and of the automation **only the PM scheduler is broken**, which is the opposite of a cache that merely rots. The bulk of a Client's work orders arrives through the PM scheduler, so every generated work order carries $0.00 planned cost no matter what its task list says. `WO-000097` (`createdBy=scheduler`, `sourcePlanId` set) is the live instance.
- `/cost-summary` filters on `costCenterCode: { not: '' }` (`:374`) and **every one of the 4 live work orders has an empty cost centre**, so that endpoint returns zero rows today, not a wrong total. Row 63 is `Partial` for a shape reason and an empty-population reason at once, and both are named rather than discovered by a user.
- Work orders sit at mixed depths in the live location tree: 3 of the 4 are on `PL-01 > AR-001`, an **area** that itself has three children, and 1 is on the root `PL-01`. A rollup that only walked up from a leaf, or that summed children, would disagree with these figures.
- Nothing in the live data exercises actual cost: **0 of 178 operations carry `actualHours`, `WorkOrderMaterial` is empty, and only 1 external service cost exists.** The actual-cost half of every rollup axis is therefore correct by construction and **unexercised**. R.7's UAT pack must supply real actual-cost fixtures, and the matrices for rows 51-54 must not claim coverage they do not have.

**Sequence, in dependency order.** Rollups first, because the new reports and the SQL views both read them; filters before exports, because an export of an unfiltered report is the wrong deliverable; the UAT pack last, because it reconciles the finished reports.

| Step | Work | Rows |
|---|---|---|
| R.0 | This plan. Stops for review. | — |
| R.1 | Cost rollup engine: aggregate planned + actual cost by location (any hierarchy level), equipment, WO type, and period. One shared module, four axes, derived from the base tables rather than the `plannedCost`/`actualCost` columns — see the finding above. | 51, 52, 53, 54 |
| R.2 | Report filtering: a shared filter parser (date range, location incl. descendants, equipment, work center) applied to all 7 handlers. `pm-compliance` keeps its year/month and gains the rest. | 58 |
| R.3 | New reports: Backlog Hours by Work Center; Top 10 Highest-Cost Equipment; Notifications Awaiting Conversion. Route + service + screen tab each, following the existing 7-report pattern. | 65, 66, 67 |
| R.4 | Five existing reports fixed, each on its own clause — see the per-report table below. No lump pass. | 60, 61, 62, 63, 64 |
| R.5 | Server-side Excel export (`.xlsx`) for all reports. PDF stays waived under D-9. | 59 |
| R.6 | SQL view layer for the Client's BI tool, as D-13 committed. Views over the same aggregates, so a view total and a report total cannot drift. | **§5.2 `Not Met` → `Met`** |
| R.7 | **UAT pack**: independently recompute each report's figures and compare against the API's, per L15. This is the artifact §6.4 row b names. | 6.4 / b |
| R.8 | Matrix recount from the suites' outcomes, doc delta, green gate and CI on the exact SHA. | — |
| R.9 | **Cost-cache integrity.** Recompute inside the PM-generation transaction, backfill the existing rows, and stop `WorkOrderSnapshot` freezing a wrong figure. **Numbered last but sequenced next** — see below. | 3.5.1 evidence, 51-54, 54, 63 |
| R.10 | **`Craft.hourlyRate` fan-out.** A rate edit invalidates every work order carrying that craft and nothing recomputes them. **Delivered**: the rate edit re-costs every live work order carrying the craft in the same transaction. | 3.5.1 evidence, 63 |

**Why R.9 exists and why it runs before R.3.** R.1 found a live user-facing defect that has nothing to do with reporting, and left it tracked rather than absorbed. It is not a v1.1 item: `WorkOrderDetailPage` renders the cached column directly, so a user opening a scheduler-generated work order today is shown **$0.00** against real planned labour. It also has to land before R.7, because the UAT pack reconciles reports against independently recomputed figures — and after R.4 the reports will be *right* while the detail page is still *wrong*, so the pack would flag a disagreement that is a cache bug rather than a report bug. Reconciling in that state tests the wrong thing. The number is last because R.0's plan was accepted with R.1–R.8 and matrix rows already cite those step IDs; renumbering would invalidate accepted references for no gain.

**Consumers of `WorkOrder.plannedCost` / `WorkOrder.actualCost`, enumerated.** All six reach a user. None is a non-user read.

| # | Consumer | What a stale value does | Live impact |
|---|---|---|---|
| 1 | `app/src/pages/WorkOrderDetailPage.tsx:924-925` — "Planned Cost" and "Actual Cost" info cards, straight off the API | The work order shows a false cost. `:925` also colours the card red when `actualCost > plannedCost`, so a stale pair drives a **budget-warning signal** as well as a number. | 2 of 4 live work orders read wrong here — but see below: one is a real defect, one is test residue, so **1 of 4 is wrong in production.** |
| 2 | `app/src/pages/WorkOrderDetailPage.tsx:1924-1925` — the cost-history table, reading `WorkOrderSnapshot.plannedCost` / `actualCost` | A snapshot freezes whatever the column said at the time. This is the one consumer where the wrong value becomes **permanent and looks authoritative**, because it is presented as a historical record. | Latent: no snapshot yet carries a bad pair, and the fix must not create one. |
| 3 | `backend/src/routes/equipment.ts:609-610` — equipment detail `cost` and `plannedCost` | Per-asset cost understated; an asset's maintenance history reads as free. | 5 equipment rows exposed. |
| 4 | `backend/src/routes/dashboard.ts:224-233` — the cost-by-month widget | The dashboard's headline cost trend understates. This is the figure **matrix row 54 currently cites as its evidence**; the citation is to a function that reads the stale column. | Live on every dashboard load. |
| 5 | `backend/src/routes/reports.ts:388-395` — `/cost-summary` | Understated or empty. | R.4 rebuilds this on the rollup, so it self-heals — and it is the only consumer that does. |
| 6 | `backend/src/routes/workOrderCostSplits.ts:82-94` — allocates split percentages against `actualCost` | **The sharpest edge.** A percentage allocation applied to a stale or zero base produces splits that are internally consistent and externally wrong: the parts still add up to the wrong total, so the usual "do the splits reconcile?" check passes. | 0 `CostSplit` rows today, so nothing is wrong yet. This is the first thing that breaks the moment a split is created against a generated PM work order. |

**R.9's scope, in full.** (a) Call `recomputeWorkOrderCosts` inside the PM-generation transaction. (b) A one-shot backfill over every work order whose stored figures disagree with the derived ones, reporting the rows it changed. (c) Make `WorkOrderSnapshot` record the derived figure, not the cache, or it launders the defect into the audit trail. (d) Fix the route tests that write operations straight to Prisma, because they are what made the live database lie about its own consistency. (e) `Craft.hourlyRate` fan-out, which R.9 does **not** address — see below.

**Not in R.9:** anything about report shape, filtering or export. R.9 touches the cache, not the reports.

##### R.9 A - the PM path recomputes its own cost (delivered)

`recomputeWorkOrderCosts` takes an optional client, defaulting to the global one, so the fourteen existing call sites are unchanged. `pmGeneration.ts` calls it on the transaction client with the supervisor as actor, guarded by "the plan contributed operations". Live evidence, 11 checks from `backend/scripts/r9a-differential.ts`:

```
plan R9A-1790782086441: 2 operations at 50/h -> expected planned 100
PASS  a work order was generated, not skipped
PASS  stored plannedCost equals the figure derived from its own operations  [stored=100 derived=100]
PASS  stored plannedCost equals the hand-computed 2 x rate  [stored=100 expected=100]
PASS  the stored figure is not the default zero  [stored=100]
PASS  createdBy keeps the scheduler label  [scheduler]
PASS  the supervisor is what the foreign keys carry  [de5e0f3c-...-0655]
PASS  the cost change wrote an audit row naming the field  [1 row(s)]
PASS  the audit row names a real user, not the scheduler label  [de5e0f3c-...-0655]
PASS  the audit row records the move from zero  [0 -> 100]
PASS  the same cycle is skipped, not regenerated  [work order WO-000729 already exists for cycle ...]
PASS  a skipped generation writes no second audit row  [1 row(s)]
```

Seven unit cases in `tests/unit/pmGeneration.test.ts` cover what the live run cannot: that the read runs on the transaction client rather than the root (the stub only returns rows it created in the same transaction, so a non-zero result proves it), that the actor is the supervisor, that a plan with no operations recomputes nothing, and that the audit row names only the figure that moved.

**A limit stated rather than hidden.** The differential builds the plan it needs and removes it, because the live database holds no maintenance plan a check can borrow. What that proves is the part only a real transaction can: the recompute sees uncommitted rows, and its audit row satisfies a real foreign key. It does not exercise plan-selection or scheduling logic, which the scheduler's own tests already cover.

**Fact, recorded so the debris can be traced.** An early run of `r9a-differential.ts` failed on a foreign-key error *after* it had created its plan, and its cleanup was not in a `finally`, so plan `R9A-1790782065395` survived into the live database. A later gate run then generated three work orders from it (`WO-000728`, `WO-000774`, `WO-000775`), none of which any test cleaned up. A fixture leak is not a cosmetic problem here: a leaked plan is picked up by every subsequent scheduler run, so one stray row becomes several orphan work orders. R.9 D2 and D1 close both halves of that.

##### R.9 D - stop the test suite from writing to the live database (delivered)

**D's premise was wrong, and checking it is what found the real defect.** D was written as "seven route test files insert operations directly to Prisma, so a backfill gets undone by the next gate run." Tested, that is false: all seven clean up on success, and the work orders the recent gate runs created carried **correct** costs, because R.9 A already covers the PM path. What was actually happening is worse and quieter.

`tests/routes/pmGeneration.test.ts` calls the **real** `runSchedulerOnce()` sixteen times. Vitest runs test files in parallel against one shared live database, and `runSchedulerOnce` evaluates *every* active plan - so it generates work orders for plans **other test files created mid-flight**, and the test only deletes work orders matching its own `sourcePlanId`. One leaked plan becomes several work orders nobody claims. Demonstrated rather than argued: plan `R9A-1790782065395` was left behind at 15:27:45, and a gate run at 15:41:18 generated `WO-000774` and `WO-000775` from it, on cycle keys the differential never uses.

**What the database actually held** (`backend/scripts/r9d-inventory.ts`, full output in the commit message):

| | count | |
|---|---|---|
| maintenance plans | 31 | **1 live**, 30 soft-deleted; *every one a test fixture* - `G4A-TEST` 17, `PLAN-T*` 8, `G4B1-TEST` 3, `G4B2-TEST` 2, `R9A-*` 1 |
| work orders with a `sourcePlanId` | 17 | 4 open, 13 soft-deleted, **0 orphans** - all 31 plan rows still existed |
| open work orders with no source plan | 3 | WO-000063, WO-000064, WO-T1790267575210 |

There was **no legitimate maintenance plan in the database at all.** That also relocates R.1's evidence: `WO-000097`, the $90 row R.1 called a production defect, is itself fixture debris - description `G4a verify`, raised from plan `G4A-TEST`. The *code* defect was real and R.9 A fixed it; the row that appeared to prove it was a test artifact, exactly like the $45 row. Both rows R.1 cited were fixtures.

**Cleared on 2026-09-30** by `backend/scripts/r9d-clean-fixtures.ts`, authorised after the inventory was reviewed row by row: 31 plans, 17 work orders, 34 operations, 9 plan targets, 8 plan meters and 64 audit rows naming deleted records. Hard-deleted, not soft-deleted - leaving them soft-deleted is what made the live database unreadable as evidence in the first place. The three work orders with no source plan were deliberately left in place.

**Not cleared, and still on the Client's call:** 52 orphaned task lists (`TL-G34-*`, `TL-T*`, and the differential's own `R9A-1790782065261`). Two further task lists, `PM-PUMP-001` and `PM-MOTOR-001`, are **seed master data** - `createdBy=system`, real descriptions - and were referenced only by fixtures, so they are now unreferenced by any plan, which is a normal state for master data. Also untouched: 284 pre-existing soft-deleted work orders and 192 snapshots, which predate this work.

*Superseded in part:* the 52 figure above was D's count at that moment, not a fixed set, and it excluded the two seed rows. All 63 rows are now classified with zero ambiguous — see **R.9 D3-task-lists**. The seed-data call above is confirmed, and the `createdBy=system` reasoning is retained only as a caution: the same field reads `system` for the differential's fixture too.

**D1 — `runSchedulerOnce` takes the plans it is told to run.** `runSchedulerOnce(options?: { onlyPlanIds?: string[] })`; when the list is set it is added to the plan query, and when it is omitted the query is byte-for-byte what it was, so the startup run in `index.ts` and the Administrator `POST /run-scheduler` route still evaluate every active plan. An **empty** list means "evaluate nothing" rather than falling through to "evaluate everything" - `[]` is truthy, so the spread fires and Prisma matches no plan, which is the behaviour a test owning no plans needs. Both production callers are deliberately left unscoped; scoping them would be a silent behaviour change dressed as a test fix.

All 14 `runSchedulerOnce()` calls in `tests/routes/pmGeneration.test.ts` now name their own plan. Two tests were added rather than trusting the edit: one creates a second active, due plan, leaves it out of `onlyPlanIds`, and asserts it produced nothing while the named plan produced exactly one (`plansEvaluated` must be 1, so a filter that was accepted but ignored would fail); the other asserts an empty list yields `plansEvaluated: 0` and no work orders. The first deliberately never issues an unscoped run - proving the filter works must not itself cause the leak.

**D1 confirmed, and a second defect found while confirming it.** After D1, a full gate run of all 67 files left **no active plan and no work order generated from a foreign plan** - the contamination is gone, verified against the live database rather than inferred. What the gate *does* still leave behind is one soft-deleted plan `PLAN-T20260930184210` and one soft-deleted work order `WO-000957` (2 operations), both from `tests/routes/maintenancePlans.test.ts:6,105`, which soft-deletes its plan instead of hard-deleting it. Because the plan is soft-deleted it was never eligible for the scheduler, so it is not the D1 defect and does not reintroduce it - but it means a gate run still does not leave the database untouched. That is a different defect in a different file, and D3 is what should catch it rather than it being quietly deleted again after every run.

**D2 - the differential cannot leak, and the proof is a failure, not a success.** The original script cleaned up only on the happy path, and it had three ways to skip its own cleanup besides an outright crash. An early `return` when the generated work order was not found sat *above* the cleanup block, so the plan and task list were left behind on exactly that path. The cleanup was keyed off `result.workOrderId`, a return value that does not exist if the call producing it throws. And it would itself have failed on a `RESTRICT` from `WorkOrderSnapshot`, `CostSplit`, `WorkOrderChecklist`, `WorkOrderNotifLink`, `ExternalServiceCost` or `WorkOrderMaterial`, none of which it deleted - a cleanup that throws deletes nothing, because it ran inside one transaction.

Cleanup is now a `finally`, and the early `return` is gone, so the summary and the failure count print on every path including the missing-work-order one. Fixture rows are located from the **plan id** rather than from a returned work-order id, so anything the script created is found even when the value never came back; that also catches a work order a concurrent scheduler run minted from the same plan. Each delete runs independently and a step that cannot run is named and sets a non-zero exit code, because one unexpected row type leaving the other twenty tables untouched is precisely how the original leak stayed invisible. `WorkOrderSnapshot` and the cost/checklist/link tables are now deleted, and audit rows are removed for the plan and task list as well as the work order - `AuditLogEntry` holds no foreign key, so nothing else ever will.

**Verified by breaking it three times, because a green run proves nothing about a `finally`.** Injecting a throw after plan creation: exit 1, cleanup still ran, plan and task list gone. Injecting a throw *after* `generatePmWorkOrder` returned, so a work order existed but its id was never read: exit 1, cleanup reported `1 work order(s)` removed, found through `sourcePlanId` - which is the claim being made, so it is the case worth forcing. Uninjected, all 11 checks pass and the live database is unchanged. Both injections were removed and the file verified free of them before committing.

**D3 - a gate run now leaves the database as it found it.** Measured rather than assumed: one full gate run against a live database holding 38 tables and 5,434 rows added **220 rows across 14 tables**, from **20 of the 35** DB-backed test files. `workOrders.test.ts` alone accounted for 122. Three separate mechanisms were behind it, and none of them is "a test forgot a teardown".

The first is that the product's `DELETE` routes soft-delete, which is correct for a user and wrong for a fixture. A teardown that goes through the API leaves a row that is still a row, and `isDeleted` on the row is not a cleanup. The fix is a set of shared hard-delete helpers in `tests/helpers.ts`, one per aggregate, deleting child-first. The order is not a style preference: this schema is full of `RESTRICT` edges - a work order's snapshots, operations, cost splits, materials, checklists and external services all restrict it, a plan's meters restrict it, a craft is restricted by both kinds of operation, a work centre by crafts, plans, task lists and work orders. Most of the old teardowns ended in `.catch(() => {})`, so the `P2003` that a wrong order produces was swallowed and the rows stayed; nothing in the new helpers swallows, because a cleanup that cannot finish should fail the test loudly rather than leave evidence behind quietly.

The second is audit. `AuditLogEntry` names the record it describes and holds no foreign key, so deleting the record leaves the row behind describing something that no longer exists. It is written for the child rows too, not just the parent: operations, checklists and their items, cost splits, external services and material lines each leave an entry under their own id. Purge the parent's audit id and the audit table still grows as fast as the tables that *were* cleaned. Two activities cannot be cleaned by record id at all, because they audit master data under the acting user: a login updates the account's login state, and "mark every alert read" is a bulk event. Those are handled by snapshotting the ids that already exist and deleting only what a file *added*, because a blanket sweep by actor or timestamp is worse than the leak - those rows exist in the baseline, since the suite mints its tokens by logging in before any file runs, so deleting them wholesale shows up as rows **disappearing**, which breaks the invariance check just as surely as leaving them behind.

The third mechanism as originally recorded here was **wrong, and is corrected in its own entry below** — it named `auditMiddleware`'s fire-and-forget write as the cause, when that middleware has never been mounted. The mechanism that is real is the missing foreign key described in the second paragraph above. See **R.9 D3-audit** for the correction and the evidence.

**One more test was asserting on the database rather than on its own fixtures.** `capacityBoard.test.ts` asserted exact hour counts against the seeded `MECH`/`ELEC`/`INST` centres, so an unrelated undated work order left behind by an earlier run moved ELEC's `unscheduledHours` from 6 to 8 and failed a test that had nothing to do with it. It now creates its own three work centres and five crafts and asserts on those. That was not scope creep: D3's claim is that a gate run leaves the database as it found it, and a test whose result depends on data it does not own cannot be part of that claim. Its teardown also swallowed errors with `.catch(() => {})`, which is how the debris it was reading survived in the first place.

**New tool: `backend/scripts/r9d-db-invariance.ts`** snapshots the primary key of every table and compares. Soft-deleted rows are counted, precisely because a test that soft-deleted its fixture would otherwise be recorded as clean. Added and destroyed rows are reported separately, because a cleanup that deletes rows belonging to the baseline is as much a breach as one that leaks - and a check that only reported additions would have passed the first version of `purgeMaintenancePlans`.

Result: full gate 67 files / 913 tests, unit suite 32 files / 575 tests, all four verifiers, and `r9d-db-invariance.ts check` reports *the database holds exactly the same rows it did before the run*. Lint and typecheck clean.

**Two further cleanups, both authorised, both hard-deletes.** On 2026-10-01, four work orders left by `safetyChecklists.test.ts` runs made before that file's teardown was fixed - descriptions `gate test WO` and `test checklist WO`, which appear in no other file - along with their 2 operations, 4 checklists, 8 checklist items, 6 snapshots and 12 audit rows. And 5 work orders, 5 operations, 5 crafts and 3 work centres left by a `capacityBoard` run that failed while a helper branch was itself being corrected, identified by the stamp-suffixed `CAP*` codes that file generates. `WO-000063`, `WO-000064` and `WO-T1790267575210` remain, as decided.

**Still open, and still on the Client's call:** the orphaned task lists. Counted and classified in full since; see **R.9 D3-task-lists**, which supersedes the "63 rows, 60 fixture candidates" state left here.

##### R.9 D3-audit - the fire-and-forget claim was wrong, and here is what the evidence actually shows

D3 recorded a third residue mechanism as *"a real defect in the product, not in the tests"*: `auditMiddleware` wrote its audit entry with `void logAuditAction(...)`, the response reached the caller first, the caller deleted the record, and the audit row then landed naming a row that no longer existed. **That was not what happened, and the claim is withdrawn.**

The claim was falsifiable and was not tested before it was written down. `auditMiddleware` **has never been mounted**:

- `git log --all -S 'auditMiddleware' -- backend/src` returns exactly one commit, the initial implementation `6f6d944`. No commit adds a registration and no commit removes one.
- In that one commit's tree, the only `middleware/audit.ts` match is the definition itself; `index.ts` mounts `auditLogRoutes` and nothing else from that file.
- The current tree agrees: nothing imports `auditMiddleware` except the definition. Tests import only `changedFields` from that module.

So no request has ever passed through it, and **no production write path ever used the void form.** Every mutating route calls `logAuditAction`/`logFieldChanges`/`logAuditFieldChange` directly and awaits it.

The change made in `713bf16` (awaiting inside `auditMiddleware`) is therefore **latent hardening of dead code, not the fix for the measured residue, and it is recorded as such.** It is kept, because the fire-and-forget form is a real defect the moment anyone mounts the function, but it fixed nothing that was observed. The misleading comment inside the function has been rewritten to say so, and `index.ts:88` no longer claims a per-route audit middleware composes inside the Decimal wrapper — there is no such middleware.

**The real cause of the audit residue is the missing foreign key, already described in the second mechanism above:** `AuditLogEntry` names the record it describes and holds no FK, so a hard-deleted fixture leaves its trail behind. These are *awaited* writes that landed while the row still existed; the row went away afterwards. A race was never required, and the fix is purging audit rows by the ids the test created — which is what `purgeAudit` and D3's helpers now do.

Consequence for the D3 claim of "no residue": the fix and its evidence were unaffected. The residue was measured by row count in `AuditLogEntry`, the count dropped by the helper work, and no part of that depended on the middleware story.

##### R.9 D3-cleanup-errors - scope of the ban on swallowed teardown errors

D3 replaced teardown `.catch(() => {})` calls with hard-delete helpers that throw. A `.catch(() => {})` in `capacityBoard.test.ts` prompted the question of where the ban actually applies. **Stated explicitly, because it was implicit and that is the defect:**

- **G6a is not this ban, and its scope is narrower than it looks.** `scripts/verify/verify_g6a.py` greps **`app/src`** (the frontend) for two exact shapes, and skips `__tests__/` and `*.test.*` by design: (1) any import from `data/mockData`, and (2) `.catch(() => get().` — a silent in-memory store fallback that hides an API error behind cached data. Its own header says test files may name identifiers freely. Ban 2 is *not* `.catch(() => {})`, and G6a never scanned the backend.
- **Decision: the swallow ban covers backend test teardown.** Extending G6a itself would be the wrong instrument — G6a is a frontend trust-property check, and its production-only exclusion of `*.test.*` is a deliberate policy decision about *mock-data identifiers*, not about error handling. So the ban is recorded here as a separate backend-test rule.

The rule, in one line: **a teardown that cannot finish must fail the test loudly rather than leave evidence behind quietly.**

**Enforcement is not yet in place, and the current state is stated rather than implied: 68 occurrences remain across 13 backend test files**, all currently harmless because those files' delete order happens to be right — `r9d-db-invariance.ts` passes with them present. `locationCounts.test.ts` (11), `notifications.test.ts` (16), `equipment.test.ts` (6), `externalServiceCosts.test.ts` (6), `labor.test.ts` (5), `laborAttribution.test.ts` (5), `equipmentMeters.test.ts` (5), `locationPlacement.test.ts` (3), `safetyChecklists.test.ts` (3), `attachments.test.ts` (2), `comments.test.ts` (2), `functionalLocations.test.ts` (2), `templateCopy.test.ts` (2). **Decision 2026-10-02: deferred to v1.1 as `v1.1-7`, not left open.** All 68 are verified harmless today - the delete order in each file is correct and `r9d-db-invariance.ts` passes with them present, so the debt is regretted risk, not a live leak. The enforcement instrument is itself undecided (an ESLint `no-restricted-syntax` rule versus a gate grep), and choosing it is a lint-cleanup design decision that belongs with the v1.1 lint work rather than a phase-close edit; editing 68 teardowns across 13 files for zero current product effect is churn that can introduce `RESTRICT`-ordering failures of its own. The ban still binds going forward: no new or edited teardown may swallow an error, so this count cannot grow silently. See **v1.1-7**.

##### R.9 D3-task-lists - 63 counted, 63 classified, zero ambiguous

Supersedes the D-section note at line 1145 (52 orphaned) and D3's own "63 rows, 60 fixture candidates". Method: `backend/scripts/r9d-tasklist-provenance.ts`, which maps each row's **code shape** to the single file in this repository that writes that shape, then reports references. `createdBy` is not used as evidence anywhere — it is unreliable in both directions: the differential's fixture reads `system` because it took the schema default, and `TL-G34-*` rows carry two different seeded user ids.

| Count | Code shape | The one file that writes it | State |
|---|---|---|---|
| 1 | `PM-PUMP-001` | `backend/prisma/seed.ts:134` | **seed master data — keep** |
| 1 | `PM-MOTOR-001` | `backend/prisma/seed.ts:135` | **seed master data — keep** |
| 49 | `TL-T<stamp>` | `backend/tests/routes/taskLists.test.ts:6` | fixture, all soft-deleted |
| 8 | `TL-G34-<stamp>` | `scripts/verify/verify_g3_4.py:290` | fixture, all soft-deleted |
| 3 | `TL-CRF-<stamp>` | `backend/tests/routes/crafts.test.ts:147` | fixture, all **live** |
| 1 | `R9A-<stamp>` | `backend/scripts/r9a-differential.ts:127` | fixture, live |

**Zero rows are unmatched**, so nothing is ambiguous and nothing is left in place on a judgement call. All 61 fixtures are referenced by **zero** `MaintenancePlan` rows, so none is load-bearing.

**Why the count moved between reports — the earlier figures were not wrong, they were different denominators at different times.** 52 counted orphaned rows before `crafts.test.ts` and the differential had been re-run; 63 is the total including both seed rows and everything the suite has produced since. `TL-T*` rows are the growth term: one per `taskLists.test.ts` run, dated 2026-09-24 to 2026-10-01. The last survivor, `TL-T20261001111418`, was created at 11:14 UTC, **before** the `713bf16` teardown landed at 15:46 local — which is what a leak that has since been fixed looks like.

**The leak is verified fixed, not assumed fixed.** Running `tests/routes/taskLists.test.ts` alone after `713bf16`: 12 tests pass and the task-list count is unchanged at 63, with zero rows created in the preceding 15 minutes. `purgeTaskLists` hard-deletes child-first and its `afterAll` now fires; `rootIds` in that file is dead (declared and spread, never pushed) and is noted rather than relied on.

**Nothing is deleted by this entry.** The classification is the decision the Client asked for; the purge of the 61 is a separate destructive action and is not taken here.

##### R.9 D3-task-lists-audit - the other half of the same leak, which was an audit trail asserting something untrue

The purge of the 61 removed the rows and left the **audit half** of the identical leak: 156 `AuditLogEntry` rows naming `tableName = 'TaskList'`, all 156 orphaned because the record each one describes is gone. This entry reconciles them. Method: `backend/scripts/r9d-tasklist-audit-clean.ts`, read-only unless `--apply`, scoped to orphaned `TaskList` rows only.

**Why they are not harmless debris.** `GET /api/audit-log` (`src/routes/auditLog.ts:86`, Administrator-only) renders this table to a person. 156 rows in it claim that `admin` and `operator` created, edited and deleted 52 task lists **that do not exist**. That is not untidy history, it is the audit trail stating something untrue, and an audit trail that does that is worth less than no audit trail. R.9 B refused to *write* 78 audit rows for exactly this reason - permanent trail noise attributed to `admin` - so leaving 156 in place by hand would reintroduce through the back door what that entry declined to create at the front.

**Every row classified as fixture, on four independent signals, none of them `createdBy`:**

| Signal | Evidence |
|---|---|
| The values themselves | All 15 field-carrying rows hold the literal strings `old="test task list"` → `new="updated task list"`, copied from `tests/routes/taskLists.test.ts:54,74` |
| The authors | `operator <operator@cmms.local>` (98 rows) and `admin <admin@cmms.local>` (58 rows), both seeded demo accounts created 2026-09-24 11:56:46 |
| The lifecycle | 52 recordIds × exactly Create+Update+Delete, each triple completing in **50–233 ms**. No PM task list is created, edited and destroyed inside an eighth of a second. |
| The reach | Zero rows have a surviving `TaskList` behind them, so none can be joined to a record by any reader |

**Composition, recorded rather than summarised:** 52 Create, 52 Update, 52 Delete; 141 with `fieldName` null and 15 on `description`; spanning 2026-09-24T16:33:14Z .. 2026-10-01T11:14:20Z.

**The count is 52 and not 61, and the difference is the point.** Nine of the purged fixtures were written straight to the database by producers that bypass the API - `crafts.test.ts:147` and `r9a-differential.ts:127` use Prisma directly - and audit logging lives in the API service layer, so those rows never minted audit entries at all. The audit table was never a complete record of the leak, which is exactly why deleting by `tableName` alone would have been wrong and deleting by an audited-id list would have been luck.

**Already fixed, and this is what makes the deletion final rather than a pause.** `purgeTaskLists` has called `purgeAudit(ids)` since `713bf16`, so the leak is closed at the source and nothing regenerates these. The newest row is 2026-10-01T11:14:20Z, the same fixture run as the last leaked task list `TL-T20261001111418` that D3-task-lists names as surviving the old teardown. Four subsequent full-suite runs produced zero new `TaskList` audit rows.

**Applied, with the deletion itself under check.** `auditLogEntry` 4398 → 4242, `deleted=156`, matching the dry-run candidate count exactly or the script exits non-zero. The DB-invariance check was run across the deletion and reported `FAIL 156 pre-existing row(s) the run destroyed: AuditLogEntry -156` with every other table absent from the report - which is the correct reading here: the tool named precisely the authorised rows and nothing else. Re-baselined afterwards, a further full suite run (67 files / 933 tests) ended at `PASS the database holds exactly the same rows it did before the run`. Both seed task lists, their 3 and 2 operations, and their zero audit rows are untouched; the orphan test would have retained any row whose record existed.

**What this does not claim.** The same measurement finds orphaned audit rows on other tables - `WorkOrder` 173, `WorkOrderOperation` 126, `MaintenancePlan` 59, out of 4398 total. Those are **not** touched here: they were not part of the authorised purge, they have not been classified the way these 156 have been, and `WorkOrder` is the table R.9 B and R.10 both cite as live evidence. Reconciling them is its own piece of work with its own authorisation, and guessing at that scope from inside a task-list cleanup is how a cleanup stops being one.

##### R.9 B - the stale-cost scan (delivered: a scan, not a backfill)

**This row was authored under a premise that turned out to be false, and it is rewritten to say what was actually found.** The tracker originally called for a one-shot backfill over every work order whose stored figures disagree with the derived ones, reporting the rows it changed. That presumed live rows had stale costs. **They do not.** The only disagreement found was in 78 soft-deleted test debris rows. No live defect exists. Therefore the deliverable is the evidence of that scan, not the application of a backfill.

**The deliverable is the scan, and the headline is that there is nothing to repair in live data.** `backend/scripts/r9b-cost-backfill.ts` derives every work order's figures from its base relations with the same pure function the product uses (`computeWorkOrderCosts`, via `costs.ts`) and compares them to the stored columns. Dry run is the default; `--apply` would rewrite through `recomputeWorkOrderCosts`, so the repair path cannot diverge from the write path it repairs. **`--apply` was deliberately not run.**

```
MODE: DRY RUN (no writes)

=== SCAN ===
  work orders scanned        : 339
    not soft-deleted         : 3
    soft-deleted             : 336
  disagreeing with derived   : 78
    of which not deleted     : 0     <- the load-bearing line
    of which soft-deleted    : 78

=== MISMATCHES BY PROVENANCE ===
    78  NON-SCHEDULER / soft-deleted
```

**0 of the 3 live work orders disagree.** All 78 carry `sourcePlanId=null` and a `createdBy` that is a test user, so on R.9 D's own rule - a scheduler-generated work order has `createdBy='scheduler'` *and* a `sourcePlanId`, and anything without both was not made by the scheduler - **none of the 78 is a production row.** The live database does not lie about its own cost consistency, which is the thing R.1 originally alleged.

**The 78 are two families with different causes, and telling them apart is the result:**

**Family A - 66 rows, `stored planned=0`, `derived=90`.** Descriptions `G4a verify` and `updated test plan`, all type `PM`, all 2 operations. These are R.1's own signature, repeated 66 times: the row was created and its operations were then inserted **straight to Prisma**, bypassing the API, so no recompute ever ran and the columns stayed at their create-time zero. This is R.9 D's finding at scale, and it is *already fixed* - the route tests that did it now go through the API. Rows: `WO-000065`, `-000066`, `-000067`, `-000068`, `-000072`, `-000073`, `-000079`, `-000082`, `-000084`, `-000086`, `-000088`, `-000090`, `-000100`, `-000101`, `-000102`, `-000106`, `-000107`, `-000110`, `-000111`, `-000112`, `-000113`, `-000117`, `-000118`, `-000119`, `-000120`, `-000121`, `-000124`, `-000125`, `-000126`, `-000127`, `-000128`, `-000129`, `-000133`, `-000134`, `-000138`, `-000139`, `-000142`, `-000143`, `-000144`, `-000145`, `-000146`, `-000148`, `-000151`, `-000153`, `-000155`, `-000157`, `-000159`, `-000161`, `-000163`, `-000164`, `-000166`, `-000168`, `-000170`, `-000172`, `-000175`, `-000176`, `-000179`, `-000183`, `-000210`, `-000216`, `-000222`, `-000228`, `-000234`, `-000240`, `-000246`, `-000252`.

**Family B - 12 rows, `stored` *above* `derived`.** Description `copied from template`, type `CM`, from `templateCopy.test.ts`. `WO-001126`, `-001009`, `-000345`, `-000286`, `-000460`, `-000518`, `-001071`, `-000402`, `-000577`, `-000790`, `-000856`, `-000963`. The gap is not a missing recompute on this path - `workOrders.ts:490` **does** call `recomputeWorkOrderCosts` for a template copy, correctly, after the transaction commits. The gap is that the craft's rate moved afterwards and nothing recomputed the work order. **These 12 rows are live evidence of R.10, and they are why they were left alone:** correcting them would have erased the only proof in this database that the craft-rate fan-out is real.

**Why nothing was written, stated as a decision rather than an omission.** All 78 targets are soft-deleted rows no report or screen can reach, so a repair has no product effect. Against that, `recomputeWorkOrderCosts` writes one audit row per figure that moves, so repairing them would have added 78 audit entries attributed to the `admin` user - permanently, about records nobody will ever see. That is the same permanent-trail-noise problem D3 was written to remove, reintroduced by a repair. **Decision: record the scan, write nothing, and carry all 78 forward as named evidence.** All 78 are listed above by number and family so the set is auditable rather than summarised as a count.

##### R.9 C - the snapshot records the derived cost, not the cache (delivered)

The last limb of R.9: *"make `WorkOrderSnapshot` record the derived figure, not the cache, or it launders the defect into the audit trail."* This was the defect with the longest reach, because a snapshot is the one record a later reader trusts absolutely and there is **no update or delete surface for it anywhere in the API**. A stale figure frozen into a snapshot stops being a bug that can be corrected later and becomes a historical fact that cannot be.

**What it did.** `workOrders.ts:876` passed the row returned by `tx.workOrder.update(...)` straight into `serializeWorkOrderSnapshot`. That row carries `plannedCost`/`actualCost` from the stored columns - the cache. So every snapshot recorded whatever the cache happened to hold at that moment, with no check that it was right.

**What it does now.** Three changes, and the middle one is the one that matters:

1. `serializeWorkOrderSnapshot(row, derived?)` takes an optional derived-cost pair and substitutes it over the serialized row. The substitution lives in the serializer rather than at the call site so that **every** snapshot goes through it: a caller who forgets produces a visibly absent figure rather than a quietly wrong one.
2. The status-change route runs `recomputeWorkOrderCosts(workOrderId, actor, tx)` **inside the transaction, before the snapshot**, and passes its return value as `derived`. Running it in-transaction is not tidiness: `recomputeWorkOrderCosts` reads its base relations on the client it is given, and a global client cannot see rows this transaction has written but not yet committed, so it would compute zero. The recompute, the cache write, its audit rows and the snapshot now commit or roll back together.
3. `recomputeWorkOrderCosts` returns **the rounded figures it stored** rather than the raw ones from `computeWorkOrderCosts`. All 14 existing call sites discard the return value, so nothing depended on the old value; returning the stored pair is what lets the snapshot and the columns be the same number instead of two that can differ by a fraction of a cent.

The consequence worth stating: **the cache is repaired by taking a snapshot.** A status change now leaves the stored columns equal to the derived figures, so a corrupted cache is corrected by ordinary work-order lifecycle rather than waiting for a backfill. This is why R.9 B could decline to repair the 66 stale rows and still be right - the path that creates new work is fixed, and the old rows are soft-deleted debris with no reader.

**Verified by breaking it, because a green run proves nothing about this.** `tests/routes/workOrders.test.ts` adds a test that adds an operation, reads the derived cost back, corrupts *only the cache* with a direct Prisma write, then performs a status change. It asserts the snapshot carries the derived figure **and** that the cache has been repaired to match. With the overlay removed the test fails with `expected +0 to be 42.5` - the snapshot recorded the corrupted cache, which is exactly the laundering described above. Restored, the file's 22 tests pass. Three unit tests on the serializer cover the substitution, the unchanged old behaviour when no derived pair is passed, and a row that had no cost keys at all.

##### R.10 - `Craft.hourlyRate` fan-out (delivered)

A craft's `hourlyRate` change invalidates every work order carrying that craft, and `crafts.ts` had **zero** recompute calls, so nothing caught it. It raised three questions, answered below: whether a rate edit recomputes affected work orders in one transaction or defers to a batch; whether already-closed work orders are re-costed or left as historical record; and what happens when a craft is *deleted* while work orders still reference it, which tracking suspected fell back to a default rate. The decision on closed work orders was the one to settle first.

**Correction: the claim that "the live data cannot demonstrate any of this" was wrong.** It was written from R.1's four-row sample, where both rows had no craft attached and fell back to 45. **The live database holds 12 rows that demonstrate the fan-out directly**, found by R.9 B's scan as Family B:

- **The work orders.** 12 soft-deleted type-`CM` work orders from `templateCopy.test.ts`, description `copied from template`, each with 2 operations totalling 3 planned hours: `WO-000286`, `-000345`, `-000402`, `-000460`, `-000518`, `-000577`, `-000790`, `-000856`, `-000963`, `-001009`, `-001071`, `-001126`. Eleven store `plannedCost=165` against a derived `127.5`; `WO-000286` stores `172.5` against `135`.
- **The delta is exactly the craft rate.** 3 planned hours × the rate change, and nothing else: `165 ÷ 3 = 55`, `127.5 ÷ 3 = 42.5`; `172.5 ÷ 3 = 57.5`, `135 ÷ 3 = 45`. The operations carry attached crafts with no material or labour lines, so those inputs are zero and cannot account for the gap. The stored figure was computed at the old rate and the derived figure uses the current one.
- **The rate edit is in the audit trail.** Three `Craft`/`hourlyRate` audit rows on 2026-09-30 at 20:50:34, 20:51:04 and 20:51:20, each `42.50 → 55`. So the edit is recorded, and the affected work orders were not recomputed. Those three crafts, `CRF-U-1790801434436`, `CRF-U-1790801463623` and `CRF-U-1790801479983`, still sit at rate `55` while their sibling test crafts sit at `42.5`.

**This is why R.9 B wrote nothing.** Backfilling those 12 rows would have set the stored figure to the current derived one and erased the only in-database evidence that the fan-out exists - the defect would have become undemonstrable on live data, and R.10 would have fallen back on constructed fixtures for a defect the database was already showing. The rows are soft-deleted, so leaving them costs the product nothing.

**Delivered.** The three questions above are settled, and the reproduction is now regression coverage.

- **Closed work orders are re-costed too.** Nothing in the schema effective-dates a rate, so a stored figure already means "priced at the current rate", not "priced as of completion". The stored columns are the cache that R.9 made a cache, and `/top-cost-equipment` reads the stored figures while `/cost-summary` derives them; a fan-out that skipped closed work orders would make the two reports disagree about the same rows. Soft-deleted work orders are the one exception - no reader surfaces them, and re-costing them would erase the 12-row reproduction cited above.
- **The edit and the re-costs share one transaction.** `PUT /crafts/:id` wraps the craft update, its audit rows and every affected `recomputeWorkOrderCosts` call in a single interactive transaction (`TX_OPTIONS = { maxWait: 30000, timeout: 30000 }`, the same envelope `auth.ts` uses). A rate change that fans out to hundreds of work orders is not a write that should half-apply; a deferred batch stays available if the affected set ever outgrows the transaction budget.
- **Craft deletion needs no change, and the "default rate" premise was wrong.** A craft referenced by any operation or live task-list step is refused retirement with `409`, and that count carries no `isDeleted` filter, so a referenced craft cannot be deleted. The fallback for a genuinely absent craft is `0` (`num(null)` in `costRules.ts`), not a default rate. The unreachable delete path is therefore not a fan-out case.

**Verified by breaking it.** `tests/routes/crafts.test.ts` grows from 10 to 13 tests in a `craft rate fan-out (R.10)` block: a `40 -> 55` edit moves a corrupted cache from `0` to `110` and writes a `plannedCost` audit row, while a description-only edit leaves a planted `999` cache untouched and a soft-deleted work order's planted `7` untouched. `scripts/r10-differential.ts` reads the live database three ways - 0 of 3 live work orders mismatch their derived cost; all 12 Family B rows still show their exact pre-fix drift (`165 / 127.5`, `172.5 / 135`); and a rolled-back live fan-out proves `2h x 40 = 80`, then `110` after a `40 -> 55` edit, with no craft-row residue. Gate: **70 files / 980 tests, `ESLINT_ERRORS=41`**, CI green on the delivery SHA.

R.9 and R.10 make the numbers true; R.2 through R.7 make them reachable. Keeping them apart is what stops a reporting phase from being credited with a data-integrity repair.

##### R.3 - rows 65-67, as routes first and widgets second

Three reports, delivered as routes with the dashboard rendering them. Row 65 was **not** a missing report, and treating it as one would have hidden the defect it exists to name.

**Scope decision, recorded because the two sources disagreed.** The tracker's own R.3 line said *"route + service + screen tab each"*, while rows 65-67 sit under **SOW §3.7.2**, whose evidence column cites `DashboardPage.tsx` and `dashboard.ts` - and row 67's evidence already said the API *supplies* `openNotifications` and only the widget was missing. A third source settled it: **row 68's waiver** states that *"the underlying reports are delivered in rows 60-67"*, so rows 65-67 are the reports layer whatever surface draws them, and R.6 (views over the same aggregates) and R.7 (independently recompute each report) both need the routes to exist. Both were built: three routes are the source of truth, three widgets render them.

**Row 65 is a correction, and the old widget was answering a different question.** `DashboardPage.tsx:101-113` already had a "Backlog by Work Center" widget. It counted **work orders** per centre, and the SOW note says exactly that: *"The widget counts work orders per work center; it does not show backlog **hours**."* One work order carrying forty hours and one carrying forty minutes both counted as 1, so the bar chart could not answer a capacity question. `GET /api/reports/backlog-hours-by-work-center` sums `plannedHours` across the operations of every open work order, and the widget now draws that with `dataKey="backlogHours"`. The count is still returned, as `openWorkOrderCount`, because "ten hours across two work orders" and "ten hours across twenty work orders" are different stories.

**Every non-deleted work centre is listed, including the empty ones.** A centre absent from the report and a centre with nothing queued are different facts, and a capacity plan that cannot tell them apart reads the missing row as spare capacity.

**Row 66 ranks on committed cost, one figure per work order.** `GET /api/reports/top-cost-equipment` sums `actualCost` where a work order has any and `plannedCost` until then. Ranking on planned alone puts every unstarted job above the finished ones that already cost money; ranking on actual alone drops the planned backlog out of a report meant to inform planning; and adding the two together counts the same job twice, once as money reserved and once as money spent. Ties break on `equipmentId` so the top ten does not flicker between calls. Work orders with `equipmentId: null` are excluded - this is a ranking of assets, and an unattributed cost is not an asset a planner can act on.

**Row 67 is narrower than "open", on purpose.** `GET /api/reports/notifications-awaiting-conversion` counts `Open` and `In Process` only. `Converted` is excluded even though `OPEN_NOTIFICATION_STATUSES` in `locationCounts.ts` includes it, because that constant answers a different question - whether the *issue* is still open - whereas this row asks whether the work has been raised yet. The two questions get two reports rather than one flag.

**The notification report rejects `workCenterId` with a 400, and that is a deliberate break from the row-58 sweep.** Row 58 promises every report is filterable by work centre, and the shared test sweeps that filter across all seven existing reports. A notification names a location and, where there is one, an asset; it does **not** name a work centre, because work centres are assigned per work order rather than per asset - there is no `Equipment.workCenterId` to filter through. Accepting the filter and returning the unfiltered answer would hand the caller a number they believe they narrowed, which is the same class of wrong as the empty report row 58 exists to prevent. So the filter is a 400 carrying the reason, the shared sweep now covers the notification report with the filters it does support, and `tests/routes/reports.test.ts` asserts both halves: 200 with the supported filters, 400 with `workCenterId`.

**Verified by breaking it, on both sides.** The row-65 fixture is one work order carrying three operations of 3.5, 4 and 2.5 hours, because the three wrong answers are three different numbers: counting work orders gives 1, counting operations gives 3, summing planned hours gives 10. All three are asserted as deltas against a baseline read *before* the fixtures are created. Substituting `entry?.count` for the hours in the route fails both row-65 cases with `expected 1 to be close to 10`. On the frontend, restoring the counts-based widget - `dataKey="count"`, sourced from the report's `openWorkOrderCount` - fails with `Unable to find an element by: [data-testid="bar-backlogHours"]`. The dashboard test also holds one work order for `WC-1` in the store against a report of 10 hours, so a widget that reached back into the store would produce 1 and fail.

**A failed report says so instead of rendering a zero.** Each widget carries its own `unavailable` marker, because "no backlog" and "the backlog query failed" are different facts and a maintenance manager acting on the second would believe the plant is clear.

**Verification.** Backend `reports.test.ts` 13 → 29 tests; full gate `GATE PASSED (all steps, equivalent to CI)`, 67 files / 933 tests, `ESLINT_ERRORS=41` against a threshold of 50, typecheck clean. App suite 7 files / 26 tests, `tsc -b` clean, and app lint at 35 problems before and after - **zero added**. DB invariance across three consecutive full-suite runs: `PASS the database holds exactly the same rows it did before the run`.

**What R.3 deliberately did not do.** No Reports-tab screen: rows 65-67 are dashboard clauses under §3.7.2, and the routes plus widgets are what the rows name. R.6's views and R.7's independent recomputation are untouched and still depend on these routes, which is why they were built rather than deferred. The purge of the 61 task-list fixtures is unaffected by a reseed: `prisma/seed.ts` creates exactly `PM-PUMP-001` and `PM-MOTOR-001`, the two rows the purge kept.

##### R.4 - delivered: five clauses, five tests, no lump pass

Rows 60-64 promoted on the plan's own discipline: each row has its own fix, its own test, and its own evidence, and a row moved only when **its** test passed. All five handlers changed response shape, so this is a breaking API change the app had to absorb in the same step.

**Row 60 - `/backlog` is now three breakdowns of one open backlog.** The response was an array of `{status, count, totalPlannedHours}`; it is now `{byStatus, byPriority, byWorkCenter}`, where the three arrays partition the *same* set. That property is asserted, not assumed: the route test checks the three counts and the three hour totals are equal to each other, and `r4-differential.ts` checks the same against a raw `findMany` plus its own operation-hours `groupBy`. The work-centre axis is the **work orders' own** work centre (`WorkOrder.workCenterId`), joined to `WorkCenter.code`/`name`; it is deliberately not the PM plan's work centre, which is row 61's denominator question. One read of open work orders and one grouped sum of operation hours feed all three axes, so the slices cannot disagree with each other.

**Row 61 - the denominator finally comes from the schedule, not from raised work orders.** Old `/pm-compliance` divided completed PMs by `workOrder.count` where `type='PM'` and `createdDate` was in the month: numerator and denominator were the same population, so a plan that fell behind and raised nothing read as perfect compliance. The new handler derives the denominator from `MaintenancePlan`: `(strategyType != 'Meter')` plans × `cyclesInWindow(plan, monthStart, monthEnd).length × targetCount`, where `targetCount` is the plan's live targets (or 1 if it has none) and `Combined` plans count like `Time`. The numerator counts PM work orders reaching `Completed`/`Closed` whose `sourcePlanCycle` - the schedule's own `YYYY-MM-DD`, read through `baseCycleKey` and `parseDayStart` - falls inside the month. This compares schedule to schedule rather than completion date to period, so a March-due PM finished in April counts against March and only March. The month window is UTC throughout (the scheduler and the filter parser are UTC; a local boundary would shift cycles across the line) and is *intersected* with any caller `from`/`to`, not replaced by it. `year`/`month` are validated (1970-9999, 1-12) and a bad value is a `400`, not a silently different month. Meter-driven plans are excluded from the denominator **and counted**, with the exclusion and its reason returned in `excludedMeterPlans` and `exclusionNote` - a meter threshold has no calendar due date, so dropping it silently is the one thing this row must not do. A new pure helper `cyclesInWindow` in `backend/src/utils/pmDueRules.ts` does the schedule walk; the differential checks it against an independent hand-rolled step of the same schedule.

**Row 62 - MTTR gained the location axis, and the null-exclusion is now in the output.** Equipment rows stay (the clause names both axes) and location rows are added, joined through the breakdown's `functionalLocationId`. The old handler filtered out breakdowns with a null `actualStart`/`actualFinish`, which hid how many it dropped; the new one counts them in `excludedIncomplete` and reports that figure, so "no repairs measured" and "repairs measured, some unfinished" are distinguishable. Duration is still `actualFinish - actualStart`, grouped per equipment and per location.

**Row 63 - rebuilt on the R.1 rollups, and the documented period filter is real.** The handler now reads `loadCostRollup({from, to, ...})` and reports the same total two ways: `byCostCenter` accumulates each work order's derived cost at its own cost centre, and `byLocation` is `rollupByLocation`, so a location row carries its own figures *and* the subtree total a caller would see on the rollup report. `year`/`month` are honoured and validated (`400` otherwise), the month intersected with any `from`/`to`. The R.1 loader derives cost from operations/materials/services and ignores the stored `plannedCost`/`actualCost` cache, which is why the route-test fixtures drive cost through material lines rather than columns. The budget limb stays waived (D-13): `budgetNote` says so in the response rather than leaving the caller to guess why there is no budget figure. The OpenAPI block's false claim about "priority and work center" axes is corrected to the axes actually returned.

**Row 64 - two more breakdowns, and the cost arithmetic is fixed.** The response was `[{materialCode, description, totalQuantityUsed, totalCost, usageCount}]`; it is now `{byMaterial, byWorkOrder, byEquipment}` over the same lines. The correctness fix is the cost: the old code did `_sum: { unitCost }` and multiplied that summed unit cost by the summed quantity, which prices every unit at the average line cost times the whole quantity and is wrong whenever one material was issued at two different unit costs - and the error scales with the spread. Each line is now priced `actualQuantity × unitCost` and the line costs are summed, which is what `SUM(quantity × unitCost)` means. Work orders with no equipment land in a `NO_EQUIPMENT` bucket rather than vanishing, so consumption is never silently dropped.

**The frontend moved with the shapes.** `app/src/services/reportService.ts` carries typed interfaces for all five new shapes and typed getters; `app/src/pages/ReportsPage.tsx` reads the object responses (backlog priority chart and work-centre table; PM-scheduled figure plus the exclusion note; MTTR location chart plus the incomplete count; cost location table plus the budget note; material work-order and equipment tables) and its empty/CSV logic now derives from the primary breakdown of each object rather than `Array.isArray`. The API-response change was not left for a later step to rediscover.

**The tests pin the new answer against the old one, not just the new value.** Row 61's February case asserts `scheduledPM=1, completedPM=0`: February's monthly occurrence was due on the 15th and raised nothing, so the old `createdDate`-counted denominator has no raised work order to divide and cannot produce a scheduled count at all. Row 64 asserts the cost is 80 (`2×10 + 3×20`) **and** that it is not 150 (`5×30`), which is the old summed-rate product. Row 60 sums the three axes and requires the counts and hours to be equal, so an axis reading a different population fails the equality rather than passing on shape. Row 62 asserts `excludedIncomplete=1`, a figure the old null filter made unobservable. Row 63 reads the same fixtures as March 2026 (150/190/40) and then as April (empty), so a handler that ignores `month` reuses the March figures and fails the April case.

**Verification.** Backend `reports.test.ts` 29 → 45 tests (a new `report rows 60-64` block with self-contained fixtures; the seed creates zero `MaintenancePlan` rows, so row-61 fixtures are built and torn down in the file). Gate `GATE PASSED (all steps, equivalent to CI)`, 67 files / 949 tests, `ESLINT_ERRORS=41` against a threshold of 50, typecheck clean. App 7 files / 26 tests, `tsc -b` clean. DB invariance across three consecutive full-suite runs: `PASS the database holds exactly the same rows it did before the run` each time. `backend/scripts/r4-differential.ts` recomputes all five clauses from the base tables and passes on the live database.

**A limit on the live differential, stated rather than hidden.** The seeded database has no `MaintenancePlan` rows, no completed in-month PM work orders, no `EM` work orders, no current-month cost work orders and no material lines, so the differential's live checks are vacuously green on those axes. It proves the partition and totals properties it can, and it prints the zero counts instead of implying coverage; the per-clause behaviour is proven by the route tests' constructed fixtures, and row 61's schedule arithmetic is checked helper-against-hand-walk regardless of whether any plan is due.

**What R.4 deliberately did not do.** Rows 51-54 stay with R.1, promoted on the rollup engine's own evidence. R.6 (SQL views) and R.7 (independent recomputation, including deriving row 61's rate from `MaintenancePlan` by a route the handler does not take) are untouched. The PDF export limb stays waived, as does row 63's budget limb. No route was added for a Reports screen tab: all five rows are existing reports under §3.7.1, and the existing Reports page renders them.

##### R.4 - each existing report, named

"Lump pass" is how five unrelated rows get quietly marked `Met` by a single green suite. Each row below has its own fix, its own test, and its own evidence. A row is promoted when **its** test passes, not when the step ends.

| Row | Clause | What is wrong today | The specific fix |
|---|---|---|---|
| 60 | Work Order Backlog — count and total estimated hours by **status, priority, and work center** | `reports.ts:41` groups by `status` only (`:44`). `priority` and `work center` are absent from the handler, though `WorkOrder.priority` and `MaintenancePlan.workCenterId`/work-centre linkage exist. The response shape is `{status, count, totalPlannedHours}`, so a caller cannot get priority or work-center slices at all. | Add both dimensions to the grouping: `status` × `priority`, and a separate work-center grouping of the same backlog, since "and" reads as three available breakdowns rather than one three-way cube. The handler currently accumulates in application memory (`:59-73`) and loads every open work order (`:64`); grouping moves into the query. **`workCenter` here is work orders' own work centre, not the PM plan's** — a PM-derived denominator is row 61's question, not this one. |
| 61 | PM Compliance — (Completed PMs / **Scheduled PMs**) × 100 for a period | `reports.ts:137` sets the denominator to `workOrder.count` where `type = 'PM'` **and `createdDate` in the period** (`:141`). That counts PM work orders *raised* in the period, not PMs *scheduled* for it. Two distinct defects follow. (a) Numerator and denominator are the same population, so the rate measures "what share of PMs raised this month also finished this month" — a PM raised in March and finished in April counts against March and never appears in April. (b) `MaintenancePlan` (`schema.prisma`) holds the actual schedule — `strategyType`, `intervalValue`/`intervalUnit`, `startDate`/`endDate` — and is not consulted at all. | Denominator becomes the **time-based occurrences due in the period**, derived from `MaintenancePlan`, not from raised work orders. Numerator becomes the PM work orders that were **scheduled for** that period and reached `Completed`/`Closed` — a due-dated plan occurrence, not a `createdDate` window. Meter-driven plans (`strategyType = 'Meter'`) are not calendar-predictable and are excluded from the denominator with the exclusion stated in the response, not silently dropped. The R.7 recomputation must derive its expected rate from `MaintenancePlan` by a different route than the handler does, or the pack would agree with a wrong denominator by construction. |
| 62 | MTTR — average repair duration, **per equipment/location** | `reports.ts:291` groups by `equipmentId` only (`:308`). There is no location dimension; the handler never reads a location. It also filters `type: 'EM'` with `actualStart`/`actualFinish` non-null (`:296-300`), which is defensible for "repair duration", but the location axis the clause names simply does not exist in the output. | Add the location dimension. Equipment already resolves to a functional location through `Equipment`, so this is a join plus a second grouping, not new data. Keep per-equipment rows (the clause says "per equipment/location", both axes) and report duration as `actualFinish − actualStart` with the null-exclusion kept explicit in the output rather than implied. Same in-memory accumulation (`:310-319`) moves into the query. |
| 63 | Maintenance Cost Summary — actual vs budget by cost center/**location** | `reports.ts:371` groups by `costCenterCode` only (`:382-390`). Location is absent. Two further defects: the handler ignores the `year`/`month` parameters its own OpenAPI block documents (`:351-360`; the code takes `_req`, so the documented period filter is a fiction), and the block claims the result "breaks down by priority and work center" (`:346`) — which the implementation does not do under any axis. | Add location as a grouping alongside cost centre. Honour the documented period filter. **The budget limb stays waived under D-13** — no budget source exists in the SOW, so the deliverable is planned-vs-actual variance, and the row is promoted on that basis with the waiver cited in its evidence cell. Correct the OpenAPI description to match the axes actually returned. Rebuilt on the R.1 rollups. |
| 64 | Material Consumption Report — by material, **work order, and equipment** | `reports.ts:535` groups by `materialId` only. Work order and equipment breakdowns are absent, and the response carries only `usageCount` (`:563`), so a caller cannot attribute consumption to an asset. Separately, `:542` `_sum: { unitCost: true }` sums `unitCost` across work-order lines and then `:562` multiplies that sum by the total quantity. Where the same material was issued at two different unit costs, the result is arithmetically wrong — it charges every unit at the average line cost times the whole quantity, and the error scales with the spread. | Add the two missing breakdowns. Fix the cost arithmetic to `SUM(quantity × unitCost)` per line before grouping, so differing unit costs are weighted correctly. This is a correctness fix, not a feature: the current figure cannot be reconciled against a manual calculation, and R.7 would fail on it. |

Rows 51-54 are not in R.4. They are R.1's subject and are promoted on the rollup engine's own evidence. Row 54's period axis — year, quarter, month — is built there, from `createdDate`/`actualStart` on real columns, never by parsing a formatted date.

##### R.5 - delivered: the workbook is built on the server, and verified by a different parser

Row 59 promoted on its own evidence: every report has a server-side `.xlsx`. The PDF limb is not built, because D-9 waived it and the register already recorded that choice; the matrix row reads `Met` on the Excel limb with the waiver cited in its own cell.

**The writer has no dependency, which is a decision the verification has to compensate for.** `backend/src/utils/xlsx.ts` emits the OOXML zip directly — `node:zlib` for deflate, a hand-rolled CRC32. Adding `exceljs` or `xlsx` would have been one line and a supply chain; the format needed here is a handful of parts, so the trade is a small writer the project owns against a large dependency it does not. The risk in owning it is that the code and its test share the same misreading of the format, so the acceptance check is a *different* parser: `scripts/verify/verify_r5.py` opens the produced workbooks with `openpyxl` and asserts ZIP CRC, sheet presence, headers, cell types and values. A writer that agreed only with its own reader would fail there.

**A leading `=` is text, not a formula.** Cells are written as inline strings with no `<f>` element, so a description, a material code or a comment that begins with `=` is stored literally rather than executed when the workbook opens. That is the CSV-injection failure mode carried into a richer format. The verifier proves it: the probe workbook round-trips `=` as a string, `42` as a number, `True` as a boolean, and XML metacharacters unchanged.

**The export cannot drift from the JSON it mirrors.** The export route does not re-query. It invokes the same handler the JSON route invokes, through `captureJsonResponse` (`backend/src/utils/captureJsonResponse.ts`), and feeds the resulting body to `reportWorkbook` (`backend/src/utils/reportWorkbook.ts`). One handler per report means one definition of each figure; a change to a report changes both surfaces, and the `register()` table in `reports.ts` is the list of what exists. The route accepts the same filter parameters and propagates the same `400`s; an unknown report is a `404` naming the available keys.

**One sheet per breakdown, and scalar reports get a `Summary`.** `reportToWorkbook` maps each array under the body to its own titled sheet (By Status, By Priority, By Work Center, and so on) with a union-of-keys header row, and a body that is scalar figures becomes a `Summary` sheet. The report-title map covers all 10 endpoints, so `GET /export.xlsx` is uniform across them.

**The frontend's browser-built CSV is replaced, not supplemented.** `app/src/lib/api.ts` gained `api.download` (bearer header, blob, filename from `Content-Disposition`); `ReportsPage.tsx`'s `exportCSV` became `exportXlsx` and all seven export buttons download the server workbook. The old client-side serializer is gone, so there is one export path rather than two that can disagree.

**Verification.** `backend/tests/unit/xlsx.test.ts` — 14 tests on the writer and mapper (ZIP magic and required parts, numeric/boolean/inline cells, escaping, formula-like strings, control-character stripping, multi-sheet, sheet-name sanitising, `columnName` past Z, empty-workbook refusal). `backend/tests/routes/reportsExport.test.ts` — 6 route tests (401 unauthenticated; 404 unknown with `available`; 200 + xlsx content type + `PK` magic for all 10; filter pass-through with a `400` on `month=13`; the expected sheet names; `Summary` for `pm-compliance`). `scripts/verify/verify_r5.py` opened **10 live workbooks, 0 synthetic**, all parsing in openpyxl with no formula cells and the value probe intact; output in `screenshots/r5_xlsx_verify.txt`. Gate and app-suite numbers and DB invariance are recorded at the commit.

**What R.5 deliberately did not do.** It did not build PDF — waived under D-9, and building it would reverse a recorded decision without a new one. It did not add the SQL view layer, which is R.6 and answers §5.2, not §3.7.1. It did not change the JSON report shapes, so no consumer of the report routes changed.

##### R.6 - delivered: an additive view layer, and two independent readers agree

Row 286 (§5.2) promoted `Not Met` → `Met`. The clause is a disjunction — an embedded reporting engine *or* SQL views for external BI — and D-13 chose the SQL views limb. The matrix's old evidence was exact and is now false: there was no `CREATE VIEW`, and there are now twenty-three.

**Two of the three rows this moves were scope extensions, and are recorded as extensions.** R.0's scope was the 14 Build rows under §3.5.3 / §3.7.1 / §3.7.2 (rows 51-54 and 58-67), and R.0 named only **§5.2** for R.6. Row 211 (§3.7.3, ad-hoc query builder *or* a documented view layer) and register item D2 (ad-hoc reporting) were **not** among the 14. They are satisfied by the same layer — §3.7.3's clause is also a disjunction, and the views are its documented-view limb, so the evidence is the same file — but they are extensions from the R.0 scope, not deliverables the plan named. Promoting them is correct on their own evidence; attributing them to the plan would not be. The matrix cells for §3.7.3 and D2 say so in as many words.

**Additive by construction.** `backend/prisma/migrations/20261002160000_reporting_views/migration.sql` creates views only. No operational table was created or altered, and no route was changed. That is a deliberate departure from the plan sentence that said the reports would *"stop being hand-written TypeScript aggregations"*: rewriting the handlers to read the views would change application behaviour to satisfy a documentation clause, and would couple the API's output to the BI contract so a view tweak could move a report figure. Instead the views are a second contract over the same rows, and the agreement between them is what is proven.

**Three layers of views.** Dimensions resolve codes for a BI tool (`report_equipment`, `report_functional_location`, `report_work_center`, `report_craft`); facts carry one row per business object with its dimensions and the report's own cost derivation (`report_work_order`, `report_work_order_operation`, `report_material_consumption`, `report_notification`, `report_maintenance_plan`, and `report_pm_occurrence`, which generates each time-based plan's due dates with `generate_series`); aggregates expose the report figures (`report_backlog`, `report_backlog_hours_by_work_center`, `report_cost_by_cost_center`, `report_cost_by_location`, `report_downtime_by_equipment`, `report_mttr_by_equipment`, `report_mttr_by_location`, `report_mtbf_by_equipment`, the three material-consumption axes, `report_top_cost_equipment`, `report_notifications_awaiting_conversion`).

**The semantics are pinned to the reports, not re-invented.** Cost is derived from operations, materials and services with each line's own unit cost, rounded once at the end, matching `computeWorkOrderCosts`/`loadCostRollup` down to the per-work-order round. MTTR and MTBF count `EM` rows with both actual timestamps; MTBF spans the first-to-last **`actualStart`** and divides by `count - 1`, which is the report's definition rather than the more obvious `actualFinish`. `report_top_cost_equipment` reads the **stored** `plannedCost`/`actualCost` columns — because `/top-cost-equipment` does, ranking committed money rather than the derived sum. A location row is its own work orders plus its subtree, through a recursive CTE. Money columns are cast at the multiply so the Float measurement columns cannot introduce binary floating point drift.

**Two independent readers, so neither side proves itself.** `backend/scripts/r6-view-differential.ts` runs against the live seeded database and recomputes each aggregate from the base tables through Prisma, then compares it to the view — the same shape as the R.1/R.2/R.4 differentials, with no route code in the loop. `backend/tests/routes/reportsViews.test.ts` queries each view and the matching HTTP report and compares the figures. The first catches a view that disagrees with the domain maths; the second catches a view that disagrees with the API a user actually calls. The live run was **ALL PASS** — 23 views present, and backlog, cost, downtime/MTTR/MTBF, consumption, top-cost and notifications all reconciled.

**What R.6 deliberately did not do.** It did not build the query-builder limb: the clause is a disjunction, and the view layer is the limb D-13 chose, so shipping both would answer a different requirement. It did not move any route onto the views, for the reason above. It did not configure a BI tool or build a dashboard — the clause asks for the data layer, and a configured client is a new clause. It did not change a JSON report shape, so no report consumer is affected.

##### R.7 - delivered: every report reconciled by a third reader

Row 332 (§6.4 / b) promoted `Not Met` → `Met`, and L15 resolved. `scripts/verify/verify_r7.py` is the artifact the row's requirement names — a pack that recomputes each report's figures independently and compares them to the API's. A deterministic `r7fix-*` fixture (insert → reconcile → remove) drives all ten reports plus two filter probes: **27 checks, all pass**, and the live database is left with exactly the same row counts it had before the run.

**The numbers, not the shapes.** Every report's figures are held equal to an independently-written base-table SQL aggregate *and* to a hand calculation printed with its working: backlog by status/priority/work-centre, backlog hours by work centre, PM compliance (row 61), MTBF, MTTR, downtime, cost-summary by cost centre and location, material consumption on its three axes, top-cost equipment, and notifications awaiting conversion. The hand case is row 61's denominator: the plan's August cycle is derived by PostgreSQL `generate_series` **and** on paper (2026-06-15 + 1 month → one cycle, 2026-08-15, in the August window → `scheduledPM=1`), so a pack that imported `cyclesInWindow` could not have agreed by construction.

**Independence is enforced, not asserted.** The pack issues raw SQL over the base tables through `psql` and checks that no issued statement contains `report_[a-z]` — the R.6 views were already tied to the handlers, so reusing them would compare R.6 with itself. It imports neither the report service, the R.1 rollup, nor `pmDueRules`.

**Its footprint is measured.** Running the pack against the live seeded database and comparing row counts before and after gave **PASS — the database holds exactly the same rows it did before the run** (38 tables). Because a successful login always writes one `lastLogin` audit row by design, the invariance run supplies an existing token through `R7_TOKEN`, so the measured delta is the fixture's and not authentication's. Gate: **70 files / 977 tests**, `ESLINT_ERRORS=41`.

**One residual, stated.** The pack's date probe (January outside the window → empty; October → the three open work orders) exercises the filter boundary, but the fixture's work orders share one `createdDate`, so the R.2 note's "day-boundary behaviour against real spread-out data" is still not covered by a live fixture; it remains covered by unit tests only.

Yes — R.7 is an **independent recomputation**, and the distinction is the whole point of the step, because the thing that currently occupies the row is a shape check.

The matrix says so in its own words. L15: *"No report or dashboard is reconciled against a manual calculation"* → required: *"**a UAT pack that recomputes each report independently and compares totals**"*. And §6.4 row b, whose status is `Not Met`, carries the evidence `scripts/verify/verify_g5.py` (**"asserts HTTP 200 and response shape only"**) with the note *"No report has been reconciled against a manual calculation."* The row is held for exactly this reason, so R.7 answering it with another HTTP 200 would restate the gap in a new file.

Three properties make it a recomputation, and all three are testable:

1. **A third route to the number — not the first, not the second.** After R.6 there are already two readers of every report figure: the TypeScript handler (`reports.ts`, on the R.1 rollup) and the `report_*` SQL views, and the R.6 differential together with the route test already hold those two equal to each other. That makes the views **unavailable** to R.7 as an independent path — reusing them would compare R.6 with itself. The pack instead reads the **base tables with its own raw SQL through `psql`**: a different engine (PostgreSQL's planner, not Prisma or the TS helpers), hand-written queries with their own grouping and filter construction, and no import of the report service, the R.1 rollup, or any `report_*` view. It never names a `report_` view and asserts that about itself before it runs. This is the same discipline `r4-differential.ts` applied — a route the report does not take — carried one step further precisely because R.6 spent the obvious alternate route.
2. **It compares figures, not shape.** Totals, counts, rates and variances, to the cent and to the minute. `verify_g5.py` stays green and keeps doing its job — HTTP 200 and response shape, which is what it is for — and R.7 adds a different file that answers a different question. Neither substitutes for the other.
3. **It has a hand-computed case.** At least one report is reconciled against a figure a person calculated by hand from the raw rows, with the working shown. Automated differentials catch disagreement between two code paths; only a hand case catches a shared misreading of the clause, which is the failure mode that matters most when the denominator of a compliance rate is the question (row 61). The pack builds a deterministic fixture, states the expected figures by hand in the script, prints the working beside the API's answer, and removes the fixture again.

**The `cyclesInWindow` warning, repeated because R.7 is where it would be easiest to cheat.** `r4-differential.ts` deliberately re-walked the schedule by hand and compared `cyclesInWindow` to it rather than trusting the helper, because the report and an independent reader of the same tables must reach the same answer. R.7 has the same trap on the same clause: row 61's denominator is `cyclesInWindow`, so a pack that imported it would agree with a wrong denominator by construction — the exact failure mode row 61 exists to catch. The pack therefore derives the denominator from `MaintenancePlan` **without** `cyclesInWindow`: the automated path does it as PostgreSQL `generate_series` over the plan's own interval, and the hand case does it on paper.

R.1-R.5 promoted rows 51-54 and 60-67 on their own suites. R.7 is the first place the row 61 denominator is tested by anything outside the handler, and the first place every report's figures are reconciled against a second reader. Until a pack independent of both the handler and the views agrees with them, the `Met` on §6.4 row b is not earned — R.7 is what closes row b and L15.

**What is deliberately not in scope.** Phase H's 10 rows, including the row-24 calibration scope gate that needs the SOW owner's answer. G.5 200-VU, out of reach (G.4 TLS is now rehearsed). §6.4 rows c and d, neither of which is a build task. The PDF export limb, waived. The budget limb of row 63, waived.

**Promotion discipline.** A row moves to `Met` only on evidence from a suite that ran at a named SHA, with that run's CI ID cited. No row is promoted on the strength of a passing unit test alone — the E.9 finding was that a green suite is evidence about tests that exist, not about clauses no test touches. Where a row can only be partly delivered, the residual goes in the matrix Notes cell and the row stays where it is.

##### R.8 - delivered: a full recount, and the four rows the per-step promotions never revisited

Phase R's last planned step. The deliverable is a **recount**: the matrix's totals re-derived from the `Status` cell of every row, and the documents brought into line with what the rows have actually said since R.1-R.7. It found four rows still carrying their Phase F status, and the drift is the point of the step rather than a surprise.

**The finding: rows 51-54, the §3.5.3 cost-rollup axes, were still `Not Met`/`Partial`.** R.1 built the rollup engine — all four axes, 16 unit tests and 11 live differential checks — and its own commit (`2071189`) explicitly left rows 51-54 at `Not Met` because "no report calls it yet". R.4 then rebuilt `/cost-summary` on `rollupByLocation` and promoted its scope as **rows 60-64**; R.3 had promoted **65-67**. Neither named 51-54, and R.1's deliberate hold was never lifted. So the engine existed and was tested, the location axis reached a real report, and the four rows that own the clause still read as gaps. **This is a recount miss, not a missing feature** — the register's own framing is that 51-54 are one engine, and R.1 built that engine.

**The exact matrix effect.** All four rows move `→ Met`: three from `Not Met`, one (period) from `Partial`.

| Scope | Met | Partial | Not Met | Deferred | Excluded | Waived | Total |
|---|---|---|---|---|---|---|---|
| Sections 1-6 before R.8 | 114 | 44 | 24 | 7 | 15 | 10 | 214 |
| Sections 1-6 after R.8 | **118** | **43** | **21** | 7 | 15 | 10 | 214 |
| §3 before R.8 | 85 | 11 | 10 | 3 | 7 | 10 | 126 |
| §3 after R.8 | **89** | **10** | **7** | 3 | 7 | 10 | 126 |

Fully Met rises from 114/214 (53.3%) to **118/214 (55.1%)**; §3 is **89 of 126 (70.6%)**. The delta is exactly `+4 Met, −1 Partial, −3 Not Met`, and it is confined to §3.5.3 — no other row's status changed, and no count moved for any other reason.

**The doc delta is larger than the four rows, because the summaries had been frozen at Phase F.** The live rows had drifted to 114/44/24 through the per-step promotions while the Summary table still read 101/50/30 and its derived paragraph 102/50/29; §6.4 / a's note still read "14 are Not Met and 17 are Partial"; and the go-live section still said no UAT pack existed and no report had been reconciled. R.8 corrects all of it: the four row status cells in `SOW_COMPLIANCE.md`, the Summary table, the derived paragraph and its themes, the §6.4 / a note, and the go-live item list item 2. `DECISION_REGISTER.md` rows **51-54 and 58-67** are reconciled in the same pass, so the register's Phase F triage columns no longer contradict the matrix on any of the 14 Build rows.

**The residual the promotion keeps honest.** Only `rollupByLocation` reaches a report route (`/cost-summary`); `rollupByEquipment`, `rollupByWorkOrderType` and `rollupByPeriod` are exercised by R.1's unit tests and its live `r1-differential.ts`, not by a dedicated endpoint. The four row notes say so in as many words, so `Met` rests on the engine-and-tests evidence for all axes plus the surfaced report for the location axis, not on the pretence that four routes exist.

**Gate: 70 files / 977 tests, `ESLINT_ERRORS=41`** (CI threshold 50), unchanged from R.7 because R.8 is documentation plus the recount. CI runs on the exact commit SHA before this step is called done.

**R.0 stopped here for review, and R.1 has since been built.** R.1 was chosen as the first unit of work precisely because the rollup engine is the foundation the other six steps read, and a wrong total would propagate into every report, the SQL views, and the UAT pack that is supposed to catch exactly that. Its live-DB run is what exposed the stale `plannedCost`/`actualCost` columns, which is a finding the plan did not anticipate and could not have without running against real data. R.2 is the next unit.

| Step | Scope | Status | Verification | Evidence |
|---|---|---|---|---|
| R.0 | Phase R scope: 14 Build rows named, dependency order, §6.4 mapping, sequence R.1-R.8 | ✅ | Plan reviewed against the running app and the register; 14 rows reconciled with register Phase F. R.0 accepted with the R.4 rewrite, and the R.6/R.7 confirmations the plan carries. | `11ef241` / `2948602` |
| R.1 | Cost rollup engine, four axes, derived from base tables | ✅ | `backend/src/utils/costRollup.ts` (Prisma-free, the arithmetic) and `costRollupData.ts` (the loader). 16 unit tests, each axis carrying its own cases and the location axis measured against an independent reference implementation. `backend/scripts/r1-differential.ts` runs 11 live-DB checks: every axis preserves the grand total, own-totals count each work order exactly once, each root carries the whole tree, and per-WO figures agree with a separate `computeWorkOrderCosts` recomputation. Gate 66 files / 867 tests. | `2071189` |
| R.2 | Report filtering: shared parser on all 7 handlers | ✅ | `backend/src/utils/reportFilters.ts`: one parser, 27 unit tests. `backend/src/routes/reports.ts` gained `resolveReportScope` and all 7 handlers now filter. 10 new route tests. `backend/scripts/r2-differential.ts` runs 14 live-DB checks. Gate 67 files / 904 tests. | `17c95fb` |

**R.2 evidence.** The filter reaches the query, which is the part a status test cannot show. 14 live checks: an empty filter reproduces the unfiltered count, a window spanning every work order includes every work order, a window before any work order excludes all of them, the end of the range is inclusive of the whole final day, disjoint day windows partition the total exactly, an equipment and a work-centre filter each return precisely their own rows, a filter naming nothing returns nothing, and a location's subtree is never smaller than the node itself.

```
open work orders: 4
PASS  an empty filter reproduces the unfiltered count  [4 vs 4]
PASS  a window spanning every work order includes every work order  [4 vs 4]
PASS  a window before any work order excludes every work order  [0 matched]
PASS  the end of the range is inclusive of the whole final day  [4 vs 4 (4 on the final day)]
PASS  disjoint day windows partition the total  [4 vs 4 (all on 2026-09-24)]
PASS  an equipment filter returns exactly that equipment  [3 vs 3]
PASS  an equipment filter matching nothing returns nothing  [0 matched]
PASS  a work centre filter returns exactly that work centre  [4 vs 4]
PASS  location ba5f6065-...-9b7d5bd9b7b6 exact match  [3 vs 3]
PASS  location ba5f6065-...-9b7d5bd9b7b6 subtree  [3 vs 3 over 4 locations]
PASS  location ba5f6065-...-9b7d5bd9b7b6 subtree is never smaller than the node  [3 >= 3]
PASS  an unknown location returns nothing rather than everything  [0 matched]
PASS  every live location is reachable from some node  [6 of 6]
```

**R.0's "six of seven ignore the request" was re-verified against `2071189` and is accurate.** `downtime` was among them: it took `async (_req: Request, ...)` like the other five, so it could not filter. A later reading suggested otherwise and that reading was wrong; `git show 2071189:backend/src/routes/reports.ts` settles it. All 7 signatures now take `req`.

**Three decisions inside R.2 that the matrix does not record.**

- **A bad filter is a 400 with its reasons, never an empty report.** An empty result set reads as "nothing happened", which for a maintenance report is the most dangerous answer available. Unparseable dates, reversed ranges, a non-boolean descendant flag and a repeated parameter are all 400s carrying the specific complaint.
- **`to` is closed at the last millisecond of that day.** `to=2026-03-15` means all of the 15th. Treating it as midnight drops the final day of every month, and a month-end total that is quietly one day short is the kind of error that surfaces at audit.
- **Which date column a report filters is a property of the report, not of the filter.** `pm-compliance` keeps its own month window and *intersects* any `from`/`to` with it rather than replacing it, because its period is part of the report's contract. `material-consumption` filters through the parent work order. The others declare `createdDate`, `actualStart` or `actualFinish` at the call site. This is why `resolveReportScope` returns the filter and the scope separately instead of one merged `where`.

**A pre-existing contract defect found while wiring this up.** Three endpoints — `cost-summary`, `downtime`, `material-consumption` — already documented `year` and `month` in their `@openapi` blocks while their handlers took `async (_req: Request, ...)` and never read them. The published contract promised a period filter the server silently ignored, which is the same failure mode as row 58 one layer up. Those three `parameters:` blocks were removed rather than left standing; `pm-compliance` keeps its `year`/`month` because that handler genuinely reads them. All 7 endpoints now document exactly the parameters they honour, and each `parameters:` block is single, so the generated spec matches the code.

**A limit on the live evidence, stated rather than hidden.** All 4 open work orders were raised on 2026-09-24, so the live database cannot exercise a range that spans two days. The end-of-day inclusivity and month-boundary behaviour are therefore covered by unit tests, not by the differential. The differential proves the filter narrows and partitions; it cannot yet prove day-boundary behaviour against real spread-out data. R.7's fixture set should cover this.


  **R.1 evidence that is a finding, not a pass.** The differential prints the divergence between the stored columns and the derived figures every time it runs, because that is the fact the design rests on:

  ```
  derived from base tables : planned=135  actual=0
  stored WorkOrder columns : planned=0    actual=0
  stale stored plannedCost/actualCost rows: 2 of 4
    765884b2-5ea1-45f3-82f0-bf18fbabc783 derived=90 stored=0   <- FIXTURE (G4A-TEST); code path real, R.9 A
    51b43878-2841-4222-9673-0a87c8fc0b08 derived=45 stored=0   <- FIXTURE (route test); R.9 D
  ```

  **Read that count as "2 fixtures", not "1 real + 1 artefact" and not "2 real".** This line has been corrected twice, and the intermediate wording was wrong: it once called the $90 row a real defect. R.9 D's provenance inventory showed it was not — `765884b2-...` is WO-000097, description `G4a verify`, raised from plan `G4A-TEST`, and the live database contained 31 plans that were all test debris. **0 of these 4 rows is a production row.**

  What survives is the code defect, which was located by reading the write path rather than by counting rows: the two automated work-order creation paths never called `recomputeWorkOrderCosts`, so a scheduler-generated work order would reach a Client with a $0.00 planned cost. R.9 A fixed that, and its live differential proves it on a plan it builds and removes — it cannot be proven by any row in this table, because by the time D ran there were none. Provenance, not arithmetic, is the second line of defence: a PM work order has `createdBy = 'scheduler'` and a `sourcePlanId`, and anything without them was not made by the scheduler.

**What R.1 deliberately did not do.** It did not add the route or the screen — that is R.2/R.3, and R.4 rebuilds `/cost-summary` on this engine. It did not fix the stale `plannedCost`/`actualCost` columns, which is a real defect with a wider blast radius than one report and deserves its own step rather than being absorbed silently into a reporting phase. It did not add indexes; the plan's own volume assumption should settle that before the Client's data arrives, and a premature index on a 4-row table measures nothing.

#### Phase R close-out (closed 2026-10-02)

Phase R's numbered scope is R.0-R.10 and all ten are delivered. R.9 and R.10 were appended to the accepted R.1-R.8 plan precisely so nothing had to be renumbered; R.10 is the last item the plan names, and **there is no R.11**. Closing the phase carries four items, recorded here as decisions rather than left implicitly open:

1. **R.9 D is delivered, not in progress.** D1-D3 (scoping `runSchedulerOnce` to the plans it is told to run, a differential that cannot leak even on failure, and a gate run that leaves the database as it found it) landed in `949af23`, `713bf16` and `493bf10`; the heading was stale and is corrected above.
2. **The swallowed-teardown ban is deferred to v1.1, explicitly.** 68 harmless `.catch(() => {})` teardowns remain across 13 backend test files. All are verified harmless (`r9d-db-invariance.ts` passes with them present) and the enforcement instrument is undecided, so the cleanup is recorded as **v1.1-7** rather than left as an open R.9 row. The ban still binds new and edited teardowns.
3. **The 61 orphan fixture task lists are held on the Client's call.** Classified with zero ambiguity in R.9 D3-task-lists; the destructive purge is not taken.
4. **The other orphaned audit-row families are held for separate authorisation.** `WorkOrder` 173, `WorkOrderOperation` 126, `MaintenancePlan` 59 - not touched by the authorised task-list purge, not classified the way those 156 were, and `WorkOrder` is live evidence for both R.9 B and R.10. Reconciling them is its own piece of work with its own authorisation.

With those four recorded, Phase R is closed. Test floor at close: **70 files / 980 tests, `ESLINT_ERRORS=41`**, CI green on `ba7ed3e`.

---

### Phase H — Remaining §3 surface: cause codes, calibration and in-app alerts (register Phase H) — H.0 recorded 2026-10-02

**H.0 is a scope record, not a build.** It fixes the phase's row set, execution order and the one open gate before any Phase H code is written. Recording it does not cross the §6.4 calibration gate.

**Rows.** Phase H is the register's last build group: **10 Build rows** (§5 worksheet) and **5 Waives**. The build rows are **8, 20, 23, 24, 29, 36, 69, 70, 71, 72**. The waives are rows **37** (§3.3.8 threaded comments, D-12), **73** (§3.8 email delivery), **74** (§3.8 per-role opt-out), **75** (§3.9 responsive UI, D-6) and **77** (§3.10 bulk endpoints). Row 76 (§3.10 OAuth2, D-5) is **Phase G's** waive, not Phase H's — the register's §5 table sizes G as `0 | 1` and H as `10 | 5`, and `37 + 73 + 74 + 75 + 77 = 5`. (Corrected 2026-10-02: an earlier note wrongly listed row 76 in Phase H.)

| # | Clause | Requirement | Status | Decision | Note |
|---|---|---|---|---|---|
| 8 | §3.1.4 | Cause codes as root-cause categories | Partial | deferred D5 | feeds MTTR-by-cause (row 62); H.4 below — Met (9b1758c, run 37071130720); clause stays Partial for the failure-capture residual |
| 20 | §3.2.2 | Multiple notifications aggregated into one work order | Met | — | H.6 below — Met (e639d47, run 37127211546); uses row 23's priority rule |
| 23 | §3.3.1 | Emergency automatically sets highest priority | Met | — | H.1 below — Met (9b1758c, run 37071130720) |
| 24 | §3.3.1 | Calibration work orders with pass/fail tracking | Met | — | H.9 below — Met (761d0bb, run 37131906999); depth (ii) approved 2026-10-02 |
| 29 | §3.3.3 | Rich-text long-text field (job instructions, safety notes, completion remarks) | Met | — | H.3 below — Met (9b1758c, run 37071130720) |
| 36 | §3.3.8 | Any file type ≤10 MB | Partial | D-11 | H.2 below — Met (9b1758c, run 37071130720); clause stays Partial under D-11 |
| 69 | §3.8 | In-app alert: work-order assignment | Met | — | H.7 below — Met (761d0bb, run 37131906999) |
| 70 | §3.8 | In-app alert: overdue work orders | Met | — | H.8 below — Met (761d0bb, run 37131906999) |
| 71 | §3.8 | In-app alert: PM generation failure | Met | — | H.5 below — Met (ad428a1, run 37124329927) |
| 72 | §3.8 | In-app alert: new high-priority notification | Met | — | H.5 below — Met (ad428a1, run 37124329927) |

**Execution order (dependency depth).**
- **Layer A — independent, no shared piece:** 8, 23, 29, 36.
- **Layer B — two independent tracks:** (B1) alerts **71, 72** on one shared in-app alert model + emitter; (B2) notifications **20**, after row 23.
- **Layer C — deepest:** **69, 70** reuse the B1 emitter (70 additionally needs a scheduled sweep); **24** is last, its depth now confirmed (see below).

**Row-24 gate (§6.4) — closed 2026-10-02.** The SOW owner confirmed 2026-09-26 that the plant runs a calibration programme, so the clause applies. The real deliverable is larger than the register's "pass/fail label"; **the label-only version must not be built**, and the required depth was a scope clarification **the owner had to close, not a decision the vendor may make**. The written question is on record at `docs/ROW24_CALIBRATION_DEPTH_QUESTION.md`, dated **2026-10-02**, offering the register's two options — (i) pass/fail only, or (ii) full: as-found/as-left readings plus reference standard plus calibration due-date/interval. **The owner answered 2026-10-02, selecting (ii) full.** Row 24 is approved to build at that depth; the label-only version stays out.

**Approved defaults for the remaining rows.** Row 29: a multi-line long-text field (not WYSIWYG) unless the owner asks for bold/lists; row 8: seeded `CauseCode` master data, required when `breakdown = true`; row 69: alert to the assignee plus the work-centre supervisor; row 20: a link table so N notifications convert to one work order, which takes the highest of their priorities; row 70: a daily overdue sweep (cadence/timezone to be confirmed); in-app only (email waived, row 73) and no per-role opt-out matrix (row 74 waived); additive migrations per layer.

**H.0 boundary.** H.0 is recorded and the row-24 question is on record, so Layer A may start. Layers B and C follow in the order above; row 24 is now unblocked for Layer C at depth (ii). No Phase H row is promoted to `Met` until its suite passes at a named SHA. **Layer A promotion (2026-10-02):** rows 23, 29, 36 and 8 advanced to `Met` after green CI at `9b1758c` (workflow run 37071130720, backend job 111050575231); the clause status for rows 8 and 36 stays `Partial` for their documented residuals (failure capture; D-11 allowlist). Only `9b1758c` was CI'd; H.1–H.3 are verified through the descendant run, not by per-SHA CI. This is a deviation from the standing per-SHA rule, accepted for Layer A.

**H.1 — Row 23 (§3.3.1): an emergency work order is forced to the highest priority.** **Met** — the suite ran against live PostgreSQL in the local gate and is verified by green CI at `9b1758c` (workflow run 37071130720, backend job 111050575231); the matrix row moves to `Met`.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.1 | Row 23 — `EM` forces highest priority on every work-order write path | Met | `resolveWorkOrderPriority(type, requested)` (`backend/src/utils/workOrderRules.ts`) returns `High` for an `EM` type and the requested priority for every other type, and is applied on `POST /api/work-orders`, `PUT /api/work-orders/:id` and `POST /api/notifications/:id/convert-to-wo` (a breakdown notification becomes `EM`). `backend/tests/routes/emergencyPriority.test.ts` (7 cases, live PostgreSQL) drives all three paths. Negative injection: stubbing the rule to pass the requested priority through failed exactly the 4 `EM`-enforcement cases and left the 3 inverse cases green; reverted. **Met** — green CI at `9b1758c` (workflow run 37071130720). | b653d0b |

**H.2 — Row 36 (§3.3.8): a widened document allowlist with executables and scripts blocked.** **Met** — verified by green CI at `9b1758c` (workflow run 37071130720).

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.2 | Row 36 — widen the attachment allowlist under D-11, keep the 10 MB cap, block executables and scripts | Met | `backend/src/utils/uploadRules.ts` accepts images, PDF, text, CSV, office documents and CAD drawings by filename extension (case-insensitive), blocks a denylist of executable and script extensions whatever MIME is declared, and falls back to the MIME allowlist only for unrecognised extensions. The 10 MB cap is unchanged. `backend/tests/unit/uploadRules.test.ts` (DB-free) covers accept/block/fallback; `backend/tests/routes/attachments.test.ts` drives a `.dwg` upload (201), a `.exe` and `.ps1` refusal (400, nothing written) and a >10 MB refusal against live PostgreSQL. Archive formats are deliberately excluded (a container can carry an executable past a filename check). Negative injection: disabling the executable/script block failed exactly the 2 route cases and 1 unit case (18 passed); reverted. **Met** — green CI at `9b1758c` (workflow run 37071130720). | 8e4c4a0 |

**H.3 — Row 29 (§3.3.3): a long-text field for safety notes and completion remarks.** **Met** — verified by green CI at `9b1758c` (workflow run 37071130720).

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.3 | Row 29 — multi-line `safetyNotes` and `completionRemarks` on a work order, with create-page and detail-page capture | Met | Two nullable `text` columns (`WorkOrder.safetyNotes`, `WorkOrder.completionRemarks`) added by migration `20261002180000_work_order_long_text`, which deploys clean from scratch on a fresh database (16 migrations). `workOrderCreateSchema` accepts both as nullable strings bounded at 20000 chars; `POST /api/work-orders` and `PUT /api/work-orders/:id` persist them, and a partial update leaves the field it did not name untouched. `WorkOrderCreatePage` gains a Safety Notes textarea; `WorkOrderDetailPage` gains a Notes tab that loads, edits and saves both fields via `workOrderService.update`. `backend/tests/routes/workOrders.test.ts` adds 4 live-PostgreSQL cases (create multi-line, null default, set-then-clear one of two, over-bound 400). Negative injections, all reverted: (a) create ignoring the inputs failed exactly the create case; (b) the update block dropping the fields failed exactly the set/clear case; (c) removing the 20000-char bound failed exactly the bound case. **Met** — green CI at `9b1758c` (workflow run 37071130720). | 3de507f |

**H.4 — Row 8 (§3.1.4): cause codes as root-cause categories.** **Met** — verified by green CI at `9b1758c` (workflow run 37071130720). The approved default said the cause is "required when `breakdown = true`"; H.4 places that requirement at completion rather than creation, so a breakdown can be raised — including by converting a notification — before its cause is known, but it cannot be recorded as `Completed` until one is named.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.4 | Row 8 — a breakdown work order must name a `CauseCode` before it can be completed | Met | `WorkOrder.causeCodeId` (nullable) added by migration `20261002190000_work_order_cause_code`, which deploys clean from a fresh database (17 migrations). A new flat master-data route (`backend/src/routes/causeCodes.ts`: `GET`, `GET :id`, `POST`, `PUT`, `DELETE` on `/api/cause-codes`, with the Requester/Supervisor floors and field-diff auditing that `failureCodes.ts` established) makes the seeded list usable. `workOrderCreateSchema` accepts `causeCodeId` (nullable); `POST /api/work-orders` and `PUT /api/work-orders/:id` persist it, and the list and detail routes return the related `causeCode`. The rule (`isCompletionBlockedForMissingCause`, `backend/src/utils/workOrderRules.ts`) blocks a `Completed` transition when `breakdownFlag` is true and no cause is set, applied on the only path that can complete a work order (`PUT /api/work-orders/:id/status`); the cause is deliberately not required at creation. `backend/tests/routes/causeCodes.test.ts` (10 live-PostgreSQL cases) drives CRUD, RBAC, audit and soft-delete; `backend/tests/routes/breakdownCause.test.ts` (7 live-PostgreSQL cases) proves create/update persistence, the completion block, the set-then-complete inverse, the non-breakdown inverse, and that the update route cannot bypass the gate because it does not declare `status`. Negative injection: neutralising `isCompletionBlockedForMissingCause` failed exactly the one block case and left the six inverse cases green; reverted. **Met** — green CI at `9b1758c` (workflow run 37071130720). | 9b1758c |

**H.5 — Rows 71 and 72 (§3.8): one in-app alert emitter for PM-generation failures and high-priority notifications.** **Met** — verified by green CI at `ad428a1` (workflow run 37124329927; backend job 111206481371); the matrix rows move to `Met`. The alert row shape is now owned by `backend/src/services/alertService.ts`, and the three earlier one-off `systemAlert.create` sites (manual PM success, account lockout, scheduler-stale) route through it with no change in the rows they write. Two new emitters use it: a failed PM generation (manual and scheduled) raises `PM_Generation_Failed`, and a notification raised at `High` priority raises `High_Priority_Notification`. Both fan out to every active `Maintenance Planner` and `Maintenance Supervisor`; the manual generation route also alerts its caller. Emission is best-effort so a failed alert cannot mask the primary write. The suite passed in the full local gate (75 files / 1020 tests). Both rows move to `Met`.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.5 | Rows 71, 72 — a shared in-app alert service, PM-generation failure alerts on both paths, and a High-priority notification alert | Met | `backend/src/services/alertService.ts` exposes `createAlert(db, input)` (transaction-aware, so the account-lockout alert stays atomic within its transaction) and `emitAlertToRoles(db, roles, alert, extraUserIds)`, which writes one row per active recipient and de-duplicates. Row 71: `POST /api/maintenance-plans/:id/generate-wo` emits `PM_Generation_Failed` to the triage roles plus the caller when generation throws, and `runSchedulerOnce` (`backend/src/services/scheduler.ts`) emits the same to the triage roles on its per-plan failure catch; both relate the alert to the plan (`relatedEntityType: 'MaintenancePlan'`). Row 72: `POST /api/notifications` emits `High_Priority_Notification` to the triage roles when `priority === 'High'`, related to the notification. The pre-existing `PM_Generation` success, `Account_Lockout` and `Scheduler_Stale` inserts are refactored onto `createAlert`. `backend/tests/routes/pmGenerationAlerts.test.ts` (2 live-PostgreSQL cases) drives the manual and scheduler failures; `backend/tests/routes/notifications.test.ts` asserts the recipient set for a High notification. Negative injection: forcing `emitAlertToRoles` to write nothing failed exactly the 3 alert cases (2 row 71, 1 row 72) and left the other 12 green; reverted. **Met** — green CI at `ad428a1` (workflow run 37124329927). | ad428a1 |

**H.6 — Row 20 (§3.2.2): multiple notifications aggregated into one work order.** **Met** — green CI at `e639d47` (workflow run 37127211546). The aggregation is exposed as a **new additive collection route, `POST /api/notifications/convert-to-wo`**, taking `notificationIds[]`, rather than by widening the existing `POST /api/notifications/:id/convert-to-wo`. The single route is keyed to one notification in its path and is depended on by the UI, the existing tests and the H.4 breakdown-cause flow; accepting a body array there would make the path id ambiguous and force one handler to branch two contracts, whereas a separate route gives aggregation a clean N-in/one-out shape and leaves the single path byte-for-byte unchanged. No migration was needed: `WorkOrderNotifLink` already carries a composite `(workOrderId, notificationId)` primary key, which expresses N notifications to one work order, and the completion sweep in `workOrders.ts` already moves every linked notification `Converted → Completed` (row 22). The work order takes the highest of the set's priorities, with any breakdown making it an EM and therefore High (SOW 3.3.1); the set must share a functional location; equipment is used only when the whole set names the same asset; and the batch is all-or-nothing.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.6 | Row 20 — aggregate N notifications into one work order through a new collection route | Met | `convertNotificationsSchema` (`backend/src/utils/validation.ts`) requires a non-empty `notificationIds` array; `highestPriority` (`backend/src/utils/workOrderRules.ts`) ranks High > Medium > Low. `POST /api/notifications/convert-to-wo` (`backend/src/routes/notifications.ts`, Maintenance Planner floor) de-duplicates the ids, rejects a missing id (404) or an already-converted/non-convertible one (400) before writing anything, requires one shared functional location (400 otherwise), creates one work order with type `EM` when any notification is a breakdown else `CM`, with priority `resolveWorkOrderPriority(type, highestPriority(...))`, and writes one `WorkOrderNotifLink` row per notification plus a `Converted` status, all inside one transaction. The single route `POST /{id}/convert-to-wo` is unchanged. `backend/tests/routes/notificationAggregation.test.ts` (8 live-PostgreSQL cases) proves the N-to-1 links and the highest-priority rule, the EM override, the shared-location refusal, the equipment rule, the already-converted and missing-id refusals, the empty-array 400 and the role 403; `backend/tests/unit/notificationAggregationPriority.test.ts` (5 DB-free cases) proves the ranking. Negative injection: forcing `highestPriority` to return `Low` failed exactly 4 cases (1 route, 3 unit) and left the EM case green, where `resolveWorkOrderPriority` forces High; reverted. **Met** — green CI at `e639d47` (workflow run 37127211546). | e639d47 |

**H.7 — Row 69 (§3.8): an in-app alert when a work order is assigned.** **Met** — green CI at `761d0bb` (workflow run 37131906999). Assignment alerts reuse the B1 emitter rather than introducing a second mechanism: `WO_Assigned` is a new type on `backend/src/services/alertService.ts`, and `emitWorkOrderAlertSafely` fans it out best-effort so an alert failure cannot fail the work-order write. The recipient rule is the approved default — the assigned supervisor (`WorkOrder.supervisorUserId`) plus every active (`isDeleted = false`, `isActive = true`) user whose role is `Maintenance Supervisor` and whose `workCenterId` matches the work order's — de-duplicated, because the assigned supervisor may also be the work centre's and must not receive two rows. The assigned supervisor is named explicitly in the query rather than inferred from the role, because they can sit outside the work centre and a role-only query would miss them. The alert is emitted on `POST /api/work-orders` (always) and on `PUT /api/work-orders/:id` only when `supervisorUserId` actually changes, so a routine edit that echoes the same supervisor does not re-announce the job.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.7 | Row 69 — alert the assignee and the work centre's supervisors when a work order is raised or reassigned | Met | `ALERT_TYPE_WO_ASSIGNED`, `workOrderAlertRecipients` and `emitWorkOrderAlertSafely` in `backend/src/services/alertService.ts`. `POST /api/work-orders` emits on create; `PUT /api/work-orders/:id` emits when `supervisorUserId` changes, compared against the stored value, so an unchanged supervisor writes nothing. Recipients are the assigned supervisor plus each active Maintenance Supervisor in the work order's work centre, de-duplicated; the alert relates to the work order (`relatedEntityType: 'WorkOrder'`). `backend/tests/routes/workOrderAlerts.test.ts` (live PostgreSQL) proves the create recipients, the work-centre branch when the assignee is not a supervisor, the unchanged-supervisor no-op and the reassignment. Negative injection: renaming the type on both emit sites failed exactly the 3 assignment cases and left the 5 overdue cases green; reverted. **Met** — green CI at `761d0bb` (workflow run 37131906999). | 761d0bb |

**H.8 — Row 70 (§3.8): an in-app alert for overdue work orders.** **Met** — green CI at `761d0bb` (workflow run 37131906999). The PM scheduler evaluates maintenance plans; nothing looked at work orders that already existed, so this is a new sweep, `backend/src/services/overdueSweep.ts`, with `runOverdueSweepOnce(now)` (the testable unit) and `startOverdueScheduler()` (the cron). It is started from `backend/src/index.ts` alongside the PM scheduler, under `NODE_ENV !== 'test'`, and defaults to `0 3 * * *`, overridable with `OVERDUE_SWEEP_CRON` — the cadence was the one parameter the approved default left open. Overdue means undeleted, not in `Completed`/`Closed`/`Cancelled`, and `plannedFinish` not null and before `now`. Idempotency is per work order, not per run: the sweep reads the existing `WO_Overdue` alerts for its batch in one query and skips a work order that already has one, so a job that has been overdue for a week is announced once, not daily. Recipients are the same pair as H.7.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.8 | Row 70 — a daily sweep alerts on work orders past their planned finish, once per work order | Met | `ALERT_TYPE_WO_OVERDUE` in `backend/src/services/alertService.ts`; `runOverdueSweepOnce(now)` and `startOverdueScheduler()` in `backend/src/services/overdueSweep.ts`; the scheduler starts from `backend/src/index.ts` under `NODE_ENV !== 'test'` with cron `0 3 * * *` (env `OVERDUE_SWEEP_CRON`). The sweep selects undeleted work orders whose status is not `Completed`/`Closed`/`Cancelled` and whose `plannedFinish` is before `now`, loads the existing `WO_Overdue` alerts for the batch in one query, and skips any work order already announced, so the alert is idempotent per work order. Recipients are the assignee and the work centre's supervisors, the same rule as H.7. `backend/tests/routes/workOrderAlerts.test.ts` (live PostgreSQL) proves the first sweep announces the assignee and the work-centre supervisor, a second sweep adds nothing, and a future-finish order, a completed order and a null-finish order are all left alone. Negative injection: removing the already-announced check failed exactly the idempotency case and left the other 7 green; reverted. **Met** — green CI at `761d0bb` (workflow run 37131906999). | 761d0bb |

**H.9 — Row 24 (§3.3.1): calibration capture at the owner-selected full depth.** **Met** — green CI at `761d0bb` (workflow run 37131906999). The register's scope gate closed 2026-10-02 with option (ii) full, so the label-only version was not built. Seven nullable columns are added to `WorkOrder` by migration `20261003120000_work_order_calibration` (18 migrations from scratch): `calibrationResult` (`Pass`/`Fail`), `calibrationAsFound`, `calibrationAsLeft`, `calibrationReferenceStandard`, `calibrationDueDate`, and `calibrationIntervalValue` with `calibrationIntervalUnit` (`Days`/`Months`/`Years`). They ride the existing create and update routes — the H.3/H.4 precedent — so a calibration order is filled in as it is executed, and the reads return them with no extra endpoint. The completion rule `isCompletionBlockedForMissingCalibrationResult` is applied on `PUT /api/work-orders/:id/status` immediately after the breakdown-cause gate: a `CAL` order cannot be recorded `Completed` without a result, blocked (409), audited as `Blocked`, and read from the stored value so saving the result and completing are independent calls. The readings are deliberately not gated: the result is the clause's floor, and forcing the rest would block a job whose readings live on a certificate attached elsewhere. The detail page gains a calibration section in the Cause & Notes tab, shown only for `type: CAL`.

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.9 | Row 24 — calibration pass/fail, readings, reference standard and due date/interval, with a completion gate | Met | Seven nullable `WorkOrder` columns added by migration `20261003120000_work_order_calibration`, which deploys clean from a fresh database (18 migrations). `workOrderCreateSchema` (`backend/src/utils/validation.ts`) accepts `calibrationResult` (`Pass`/`Fail`), `calibrationAsFound`, `calibrationAsLeft`, `calibrationReferenceStandard`, `calibrationDueDate`, `calibrationIntervalValue` (positive integer) and `calibrationIntervalUnit` (`Days`/`Months`/`Years`); `POST /api/work-orders` and `PUT /api/work-orders/:id` persist them and an explicit `null` clears one. `isCompletionBlockedForMissingCalibrationResult` (`backend/src/utils/workOrderRules.ts`) blocks the `Completed` transition for a `CAL` order with no result on `PUT /api/work-orders/:id/status`, audited like the other transition guards. `WorkOrderDetailPage` shows a calibration section (result, due date, interval, reference standard, as-found, as-left) on a `CAL` order. `backend/tests/routes/calibration.test.ts` (6 live-PostgreSQL cases) proves full persistence and detail readback, null-clearing, the unknown-result 400, the completion block with its audit row, the set-then-complete inverse, and the non-CAL inverse. Negative injection: neutralising `isCompletionBlockedForMissingCalibrationResult` failed exactly the one block case and left the five inverse cases green; reverted. **Met** — green CI at `761d0bb` (workflow run 37131906999). | 761d0bb |

**H.10 - §6.2 documentation close-out (L31, L32).** **Met** - the documentation-delivery prerequisites are complete. L31 was a stale register note: `INSTALLATION_GUIDE.md` §3 already documents all nine environment variables. L32 was real: `screenshots/` is gitignored, so every `USER_MANUAL.md` image was broken in a fresh clone. The 19 referenced screenshots (18 User Manual + 1 Administrator Guide) were copied into the tracked `docs/images/` folder and the 20 references rewritten from `../screenshots/` to `images/`; `screenshots/` stays gitignored as test evidence. Three SOW rows move to `Met`: §6.2 User Manual (321), §6.2 Installation & Deployment Guide (323), and §6.4/f Documentation delivered (336). Green CI at `5dd4cb7` (workflow run 37141326175).

| # | Task | Status | Acceptance Criteria | Commit |
|---|---|---|---|---|
| H.10 | §6.2/§6.4-f documentation close-out - tracked User Manual screenshots and the install-guide env table | Met | `docs/images/` holds the 19 referenced screenshots; `USER_MANUAL.md` and `ADMIN_GUIDE.md` reference `images/...` and no longer `../screenshots/`; `git ls-files docs/images` returns 19. `INSTALLATION_GUIDE.md` documents all nine env vars. Promotes SOW rows 321, 323 and 336 to `Met`, closing L31 and L32. | `*this commit*` |

---

## Deferred to Post-Go-Live

- ERP integration
- Ad-hoc query builder / ad-hoc reporting
- Full-scale load testing at 500K-WO volume
- **Prisma connection-pool exhaustion on the login path (Prisma P2028 "Unable to start a transaction in the given time")** — surfaced by the 6.5 k6 smoke run, where 15 of ~140 concurrent logins returned HTTP 500 while the read path stayed healthy. This is a **Phase 8 blocker for the SOW §4.1 200-user load test only; it is NOT a v1.0.0 release blocker.** Requires Prisma connection-pool sizing + PostgreSQL `max_connections` tuning before the SOW §4.1 200-VU test. No fix attempted in Phase 6.

### Post-Phase-H sequencing (owner decisions 2026-10-03)

- **§4.1 200-VU test - executed (G.5); row 253 stays `Partial`.** The P2028 blocker was fixed in G.6 and the 100-VU run is clean; the 200-VU run passed 2026-10-03 (p(95) 1.15 s, `http_req_failed` 0.00%, 0 P2028 / 0×429 / 0×500), so the **concurrency (200 VUs) and screen-load (<2 s)** limbs are met. The **transactional-save (<1 s)** limb was **not measured** - `capacity.js` drives the read path only (login → list → detail), so no write endpoint is exercised and no separate save-latency percentile exists. Row 253 stays `Partial` on that residual (green CI at `6c2f482`, workflow run 37136744688). The D-4 second backup target remains the only ops dependency for the WAL/RPO proof.
- **Legacy data migration — held to last, not parallel.** The owner provides the legacy dataset only after the schema is frozen at the end of Phase H. Sequence: owner template → two-way worksheet → the importers the data needs → runbook → dry-run report → §6.4/d closes.
- **§6.4/f documentation - closed 2026-10-03 (H.10).** L31 was a stale note (the install guide already documents all nine env vars); L32 is resolved by tracking the referenced screenshots under `docs/images/` and rewriting the 20 references. SOW rows 321, 323 and 336 are `Met`; L31 and L32 are `RESOLVED`.
- **D-4 second backup target — closed 2026-10-05 (G.3).** This entry used to read: *§4.3 RPO (row 262) stays `Not Met` until a second backup target path is provided; nothing executable until then.* Superseded — `scripts/pitr-drill.ps1` supplied a local secondary target (`C:\cmms-wal\wal`) and **measured** the objective instead of asserting it: 6 segments archived / 0 failed, observed commit-to-archive lag 1 s, `archive_timeout=300` bounding worst-case loss to 5 min, and a PITR to a chosen `recovery_target_time` that kept 340/340 work orders. Row 262 moved `Not Met → Met`; row 261 stays `Partial` on the differential limb. The target path is deployment-configurable, and `archive_mode` is still `off` on the live cluster.
- **§3 Partial rows after Layer C promotion (9 rows, 7 themes).** §3.1.3 capacity board (89), §3.1.4 task-list equipment class, §3.1.4 cause-code failure residual, §3.1.5 job-level material lines (97), §3.2.2 View-Only notification-create, §3.3.8 file types ≤10 MB (147, D-11 waiver residual), §3.3.8 complete audit-log field-diff coverage (149, build residual), §3.5.2 cost-split editor (175), §3.6 change log. These are what §6.4/a rests on after H closes.
- **Non-§3 `Not Met` classification (recorded 2026-10-03 as 8 rows, 7 since).** All 7 sit outside §3 (0 `Not Met`). Four are outside the §6.4 acceptance frame and already mapped to v1.1 in L1–L36 (rows 40, 260, 298, 307); three are go-live blockers — the §6.4 / a, / b and / c acceptance criteria (rows 331, 334, 335). Rows 60, 64, 267 and 294 were in this set and are now `Met`; row 58 was `Waived` under D-18, row 269 refiled to Client Operations as `Deferred` under D-19, and **row 262 promoted to `Met` on 2026-10-05** once the D-4 rehearsal measured it. Full table in `SOW_COMPLIANCE.md` under "Non-§3 `Not Met` classification (7 rows)".
- **Post-H classification builds (owner decisions 2026-10-03) - sequence 60 → 64 → 267 → 294.** Build now, before go-live, each as its own logical commit with its own CI and promotion delta. **Row 60 (§2.2 Administrator user management) delivered and promoted to `Met`:** `POST /api/users` (bcrypt cost 10, 409 on duplicate active username) and `DELETE /api/users/:id` (soft delete, self-deactivation refused), plus an Add User form and per-row Deactivate on the Administration screen; 8 new DB-backed cases in `users.test.ts`; green CI at `581c1d0`, workflow run 37146679517. **Row 64 (§2.2 Requester reporter scoping) delivered and promoted to `Met`:** the notification list now filters `reportedByUserId` to the caller for the Requester role, so the Administration screen's "view own requests" text is true; 1 DB-backed case in `notifications.test.ts`; green CI at `4b00233`, workflow run 37147538004. **Row 267 (§4.5 ISO 14224 alignment) delivered and promoted to `Met`:** `docs/ISO_14224_MAPPING.md` maps the equipment, location, failure, maintenance, task and meter models to the ISO 14224 data categories field by field, and states the remaining gaps; documentation only; green CI at `6cb510f`, workflow run 37148106485. **Row 294 (§5.4 API versioning) delivered and promoted to `Met`:** the application routes and health checks now hang off one `apiRouter` mounted under both `/api` and `/api/v1`, with the login limiter on both prefixes; 4 DB-backed cases in `apiVersioning.test.ts` and the systemConfig mount assertion updated; green CI at `271e445`, workflow run 37149026522. The negative injection (commenting out the `/api/v1` mount) showed the unanchored source-scan regex still matched the commented line, so the mount assertions were anchored to line start; the injection then fails and the restored mount passes. Sequence complete. **Row 58 (§2.2 custom roles) was then `Waived` under D-18** — the six built-in roles cover a single-site plant — and **row 269 (§4.6 99.5% availability) refiled to Client Operations as `Deferred` under D-19**, the D-14 shape; both **accepted by the SOW owner on 2026-10-04**. No action: rows 40/307/335 (owner data), 262 (second backup target), 260 (closed by D-7), 298 (Waived D-5), 331/334 (go-live blockers).

- **Positive finding — the row-294 mount gate was blind until a negative injection exposed it.** The first version of the `systemConfig.test.ts` mount assertions used an unanchored regex (`apiRouter.use('/system-config'` and the two `app.use(...)` mounts), so commenting out `app.use('/api/v1', apiRouter)` in `backend/src/index.ts` still passed: the regex matched the commented-out line and the suite stayed green. Anchoring every assertion to the start of its line (`^app.use('/api/v1', apiRouter);` / `m`) made the injection fail as it should, and restoring the mount passed. Same class as the E.10 registry that would have "matched nothing and silently audited nothing" — a gate that cannot fail is worse than no gate, because its green is counted as evidence. Every new gate on this project gets a negative injection before it is trusted. Recorded at `d42ec77`, workflow run 37150726276.

- **Audit-trail sweep, Finding 1 (2026-10-04, docs-only).** The register's D-1 answer and this tracker's gate narrative were the last two places still quoting the **68 Build / 9 Waive** first-recorded tally. Both now carry an inline "superseded by §6.5 → 67 Build / 10 Waive" pointer; the originals are kept, so the flip stays auditable. Register §6.5 remains the authority (rows 24, 30, 75 net **Build −1 / Waive +1**). Outcome: no unannotated stale figure remains in either document, and no status moved.
- **Audit-trail sweep, Finding 2 (2026-10-04, docs-only) - no promotion is missing from the verifier.** The reverse check asked whether every build commit the tracker cites as promotion evidence also appears in `verify_a1.py`. It does not, by design: the tracker cites the **build** commit plus its CI run, while the verifier keys each entry to the commit whose diff **set the row's status**, and for a build-then-promote pair those are two different commits. Matched **by clause**, every promotion the tracker records has a verifier entry, and both scopes reconcile (`verify_a1.py` exit 0). So the literal-SHA mismatch is the anchor convention, not a coverage hole. The one real residual - a reader cannot tie a tracker's build SHA to the verifier's status commit without help - is closed by the cross-reference below. Outcome: all 31 verifier status commits reconciled against their tracker sections — 13 were already cited in the tracker or SOW, and the **18 that were cited nowhere** are now named here; no status moved.

#### Promotion-evidence ↔ verifier-status SHA cross-reference

**Anchor convention — read this before concluding anything from a SHA mismatch.** Tracker evidence cites the **build/step commit** and its CI workflow run; `verify_a1.py` stores the **status-setting commit**, meaning the commit whose diff moved the row's Status cell. For a build-then-promote pair those are two different commits, so the two SHA sets cannot line up in either direction. **A tracker SHA absent from the verifier's promotion lists is by design, not a missing promotion**, and a verifier SHA absent from the tracker means only that it had not been cited in prose yet — matched **by clause**, every promotion the tracker records has a verifier entry and both gates reconcile. This table is the join between the two conventions; nothing in a non-matching SHA implies a status is unpromoted.

Left column: the commit the tracker cites as the promotion evidence (build SHA, plus CI run where the tracker names one). Right column: the `verify_a1.py` promotion entry - clause, from→to, and the status-setting commit. A `=` marks a documentation-only promotion, where the evidence commit and the status-setting commit are the same. Every other row is a build-then-promote pair: the two SHAs differ by design, and this table is the join between them.

**Re-derive before extending.** Clause attributions here were read out of `scripts/verify/verify_a1.py` — `APPROVED_PROMOTIONS` (`:98-167`) and `APPROVED_ALL_ONLY_PROMOTIONS` (`:176-194`) — and reconciled against the matrix, **not** carried over from tracker prose or memory. That discipline earned its place: the first draft of this table carried **four** wrong clause attributions (rows 34 and 49 both belong to `722e1a3`; row 44 is not in the `1c14c25` range; row 27 is `at-least-one-operation`, not an op-guard) and only the re-derivation caught them. Anyone adding a row must take the clause, the transition and the commit straight from those two lists, then check the matrix row number — a clean pass last time is not evidence that the next one is clean.

| Tracker evidence | Verifier entry (clause; from→to; status commit) |
|---|---|
| Phase F recount `5fc4383` | §3 rows 2–6, 9, 11, 12, 14–16, 18, 21, 22, 25, 28, 33; PM/NM→M; `5fc4383` = |
| Phase D `7b3a17a` / `9b2e9bd` | §3.4.1–§3.4.3, rows 39–43 & 45–48 (row 44 excluded); PM/NM→M; `1c14c25` |
| Phase E green suite `6c5b926` | §3.3.3 at-least-one-operation; PM→M; `6c5b926` = |
| Phase C | §3.1.4 task lists per class, §3.3.3 at-least-one-operation; NM→PM (first hop); `f3fc1ad` |
| Phase E `722e1a3` | §3.3.6 travel/permit line items (NM→M), §3.5.1 planned cost (PM→M); `722e1a3` = |
| Phase E `e256ad1` | §3.3.3 Reported By; PM→M; `e256ad1` = |
| Phase E `96645ee` | §3.2.2 damages/observations; NM→M; `96645ee` = |
| Phase E `abb580f` | §3.3.4 material reservation; NM→M; `abb580f` = |
| Phase E `98c356e` | §3.3.5 labour cost; PM→M; `98c356e` = |
| Phase C safety gate | §3.3.7 safety gate; PM→M; `d56aa2e` |
| E.11 `8151746` | §3.6 work-order / equipment history, rows 55 & 56; NM/PM→M; `be2b092` |
| R.2 `17c95fb` | §3.7.1 report filtering; NM→M; `17c95fb` = |
| G.6 `40c852e` | §6.4 performance (100 VU); NM→M; `40c852e` = |
| H.4 Layer A `9b1758c` (run 37071130720) | §3.3.1 emergency, §3.3.3 long-text; NM→M; `7a08726` |
| H.5 Layer B1 `ad428a1` (run 37124329927) | §3.8 alert-pm-failure, alert-high-priority; PM/NM→M; `37957d5` |
| H.6 Layer B2 `e639d47` | §3.2.2 multiple-notifications; NM→M; `22d5292` |
| H.7/H.8/H.9 Layer C `761d0bb` (run 37131906999) | §3.3.1 calibration, §3.8 alert-assignment, alert-overdue; NM/PM→M; `f45c02f` |
| H.7 decisions, 200-VU GO `6c2f482` (run 37136744688) | §4.1 concurrency; D→PM; `b278eaa` |
| H.7 follow-up, IIS verified | §4.2 https; PM→M; `256c8e9` |
| H.10 `5dd4cb7` (run 37141326175) | §6.2 user-manual, deployment-guide, §6.4 docs-and-training; PM→M; `5dd4cb7` = |
| R.3 rows 65–67 | §3.7.2 backlog-hours, top10-cost, awaiting-conversion; NM/NM/PM→M; `ed5bcc6` |
| R.4 five reports | §3.7.1 backlog, pm-compliance, mttr, cost-summary, material-consumption; PM→M; `b9fedca` |
| R.5 xlsx export | §3.7.1 export; NM→M; `465f859` |
| R.6 view layer | §3.7.3 ad-hoc-query (D→M), §5.2 reporting-engine (NM→M); `4e883b3` |
| R.7 independent reconcile | §6.4 report-correctness; NM→M; `7e318bc` |
| R.8 full recount | §3.5.3 rollup-location/equipment/wo-type (NM→M), rollup-time (PM→M); `5a05acd` |
| Post-H row 60 `581c1d0` (run 37146679517) | §2.2 admin-user-management; NM→M; `80add36` |
| Post-H row 64 `4b00233` (run 37147538004) | §2.2 requester; NM→M; `60d4923` |
| Post-H row 267 `6cb510f` (run 37148106485) | §4.5 iso-14224; NM→M; `a0573bd` |
| Post-H row 294 `271e445` (run 37149026522) | §5.4 api-versioning; NM→M; `0a437eb` |
| Post-H D-18/D-19 decision | §2.2 custom-roles (NM→Waived), §4.6 availability (NM→Deferred); `1daa241` |
| Post-H row 8 `1e4b28c` (run 182) | SOW §3.1.4 failure capture, owner decision 2026-10-05; PM→M; `1e4b28c` = |

## Post-Go-Live Backlog (v1.1)

Schema findings raised during Phase 7 documentation (7.3). Triaged 2026-09-25: **no v1.0.0 scope change** — all are v1.1 items. Recorded against the SOW compliance matrix in 7.6.

| # | Finding | Impact | Status |
|---|---|---|---|
| v1.1-1 | ~~**Partly closed in H.4.** `CauseCode` is no longer orphaned — `WorkOrder.causeCodeId` references it, with a CRUD API and a completion rule (row 8). `FailureCode` and `Notification` remain unwired, so failure capture against a work order and cause/failure on notifications are still open.~~ **CLOSED — both limbs of row 8 are delivered; one limb of the original wording was a mis-attribution.** The H.4 limb stands (`WorkOrder.causeCodeId`, CRUD API, completion rule). The failure limb closed on owner decision 2026-10-05: `WorkOrder.failureCodeId` references `FailureCode` (migration `20261005120000_work_order_failure_code`, `ON DELETE SET NULL`), both work-order reads return `failureCode`, the audit field list covers it, and the work-order screen's Failure picker sets it — `backend/tests/routes/failureCapture.test.ts`, 11 cases. **Correction.** This entry also listed "cause/failure on notifications" as an open residual of §3.1.4. No §3 clause key-field supports that: §3.2.2 enumerates its notification fields (auto number, Type, Priority, Functional Location/Equipment, Reported By, Date & Time, Description, Breakdown indicator, Damages/observations) and a cause or failure code is not among them. It was recorded here as a residual of §3.1.4, which was an over-attribution, so it could not hold row 8 open. Cause/failure capture on a notification is still available as an enhancement — nothing is waived — but landing it needs an SOW reference that does not exist or a new owner decision. Carried as a fresh backlog item below rather than left to rot inside a closure note. | SOW compliance matrix (7.6) now records §3.1.4 as **Met** (142 Met / 31 Partial / 7 Not Met / 7 Deferred / 15 Excluded / 12 Waived = 214). Two engineering calls inside the closure: the failure code is a **new column rather than a reuse of `causeCodeId`**, because a failure is what was observed and a cause is why, so the breakdown completion rule stays keyed on `causeCodeId` alone; and there is **no completion gate on a failure code**, because no clause makes one mandatory and a blocking rule would be a requirement this system invented. Neither is a scope reduction. | **Closed — row 8 `Partial` → `Met`, owner decision 2026-10-05** |
| v1.1-2 | ~~`MaintenancePlan.functionalLocationId` is a nullable column with no `@relation`, unlike the required `workCenterId` and `taskListId`. The database does not enforce it.~~ | **CLOSED — mitigated, not removed.** F3 (`638dbd6`) / D-10 moved target-based planning onto `MaintenancePlanTarget`, whose `equipmentId` and `functionalLocationId` are real `@relation` foreign keys enforced by the DB (schema.prisma, F3). The plan row's own `functionalLocationId` remains as a nullable compatibility mirror of the first target with no `@relation`, but target-based planning no longer relies on it. | **Closed in F3** |
| v1.1-3 | ~~**Financial fields are `Float`, not `Decimal`** — `standardCost`, `currentCost`, `unitCost`, `plannedCost`, `actualCost`, `cost`, `percentage`, `hourlyRate`, `costRatePerHour`.~~ | **CLOSED — shipped in E.13 / D-17 (67449e6).** All seven monetary columns are `DECIMAL(12,2)` since migration `20260928170000_float_to_decimal`; quantities and durations deliberately stay binary float (D-17 scope). See the E.13 section for the wire-format precision trade-off. | **Closed in E.13** |
| v1.1-4 | Status and type columns are unenforced free text; permitted values exist only in schema comments. | Low — values are validated in the zod request schemas at the API boundary. | Deferred to v1.1 |
| v1.1-5 | ~~**`WorkOrderChecklistItem.response` cannot express "unanswered".** The column is a non-nullable `String` restricted by `checklistItemUpdateSchema` to `Yes`/`No`/`NA`, and the attach route pre-fills every item with `'NA'` — so a freshly attached checklist is indistinguishable from a fully answered one at the item level.~~ | **CLOSED — no residual.** This was the stated fix: "make `response` nullable, drop the `'NA'` pre-fill at attach time, and require an explicit response per template item." Phase D did exactly that. `response` is `String?`; attach creates every item with `response: null`; `checklistItemUpdateSchema` still restricts answers to `Yes`/`No`/`NA`, so an answer cannot be invented, but `null` is now accepted and means unanswered. The §3.3.7 gate enforces item-level acknowledgement and names the unanswered count in its 409, and clearing an answer re-arms the sign-off. Commits `9b2e9bd`, `369ff13`, `7b3a17a`; matrix row 35 moves `Partial` → `Met`. | **Closed in Phase D** |
| v1.1-6 | **`'Blocked'` is missing from the audit-log action filter dropdown** in the Administration screen. | Cosmetic. Entries display and search correctly today; the filter simply cannot isolate them. Triggered by R1 (`e049238`), which introduced the new `Blocked` action value. `AuditEntry.action` in `backend/src/middleware/audit.ts` already permits it and the DB column is free text, so this is a frontend list only. | Deferred to v1.1 |
| v1.1-7 | **68 swallowed teardown errors** - `.catch(() => {})` in 13 backend test files, banned by the rule stated in R.9 D3-cleanup-errors but not yet enforced. | Low - every occurrence is verified harmless today (the delete order in each file is correct and `r9d-db-invariance.ts` passes with them present), so this is regretted risk rather than a live leak; the danger is a future edit silently reintroducing one. The enforcement instrument (an ESLint rule versus a gate grep) is still to be chosen. | Deferred to v1.1 |
| v1.1-8 | **Audit the matrix, register and tracker for three classes of staleness: (a) clause attributions in Phase B–F prose against `verify_a1.py` and the matrix; (b) stale Notes; (c) any frozen count or citation.** (a) Read every clause/status/commit triple out of `APPROVED_PROMOTIONS` / `APPROVED_ALL_ONLY_PROMOTIONS`, then check each Phase B–F prose claim that names a clause or a promotion against it - the 31-row SHA-join re-derivation is the template. (b) For each Notes cell run `git log -L` on that line to find when it was last written, then cross-check it against the code commits that touched the behaviour it describes; a Note older than the commits describing its own subject is stale. This is how row 149 (§3.3.8 audit field diff) was caught: its Note still read "a small minority of write sites" after `8a155bf` had made field diffs compiler-enforced across ~20 route files and deleted the untyped `logAudit`. (c) Frozen counts and hardcoded citations, e.g. `verify_a1.py:98-167` / `:176-194`, which break silently when a list grows above the cited end and nothing fails; **prefer a symbolic reference ("the `APPROVED_PROMOTIONS` list") over a numeric range** unless a reader genuinely needs to jump to a line. **Re-derive denominators from source, not from prior counts. The 84→78 correction in the row-149 re-count shows frozen counts propagate.** **Not started, and deliberately not started now** - a cross-cutting docs pass whose right time is after Phase H close-out, not during it. Raised because the SHA-join table's first draft carried **4 wrong clause attributions out of 31** and row 149's Note survived two review passes stale: "docs written" has repeatedly coexisted with "docs verified" here. The point is that *docs done* must not silently mean *docs verified*. | No v1.0.0 status impact; documentation accuracy only. A stale Note or wrong attribution does not change a gate result, but it misdirects the next contributor and can hide real scope. | Open - scheduled after Phase H close-out |
| v1.1-9 | **Row 175 (§3.5.2) has no screen exposing the cost split editor.** The route is fully verified (`workOrderCostSplits.test.ts`, 18 cases, `e2a005d`) - whole-set replacement in one transaction, per-line delete, 100% validation, read-back against the `allocate()` oracle - so the percentage allocation is correct but not usable from the product. **Held for v1.1 on owner decision 2026-10-04** ("not on the critical path"). Pure UI: no ambiguity, no owner input, no migration, and the only one of the nine §3 `Partial` rows with no interpretive dependency at all, which makes it the safest deferral of the set. Smallest viable version when picked up: a cost-split tab on the work-order detail page over the existing routes. | §3.5.2 stays `Partial` at v1.0.0; percentage allocation across cost centres is not usable from the UI. No other clause depends on it. | Deferred to v1.1 (owner, 2026-10-04) |
| v1.1-10 | Cause/failure code on a `Notification`. | Low. `Notification` has no cause or failure field and the notification route sets none, so a notification is captured without a code and the code is entered later on the work order it converts to. Raised out of v1.1-1: it was recorded there as a residual of §3.1.4, but no §3 clause key-field requires it (§3.2.2 enumerates the notification fields and names no code), so it is an enhancement rather than a compliance residual. | Deferred to v1.1 — open item, needs an owner decision on scope |

**Verified, not deferred:** work orders are soft-deleted and their children are retained, per rule 3.4. Confirmed empirically against the database on 2026-09-25 for every populated child table — `WorkOrderOperation` (122 rows), `ExternalServiceCost` (1) and `WorkOrderNotifLink` (4) all retained their rows across `UPDATE "WorkOrder" SET "isDeleted"=true` with the parent row still present. `WorkOrderMaterial`, `CostSplit` and `WorkOrderChecklist` are currently empty, so they hold by the same mechanism but were not exercised. No action.

## Excluded (client clarifications)

- i18n / multilingual text (English only)
- Mobile camera access, offline capability, digital signatures
- Docker / Kubernetes containers (local Windows server deployment)
- Training materials (training conducted by IT team)
