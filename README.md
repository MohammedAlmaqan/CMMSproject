# CommandPulse CMMS

[![CI](https://github.com/MohammedAlmaqan/CMMSproject/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MohammedAlmaqan/CMMSproject/actions/workflows/ci.yml)

A maintenance management system covering master data, notifications, work orders, preventive maintenance planning, and standard reports — built as a React SPA over an Express/Prisma API on PostgreSQL.

This README describes what the code in this repository actually does today. Known gaps are listed explicitly in [Not implemented](#not-implemented) and [Known issues](#known-issues) rather than being papered over.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Frontend (SPA) │────▶│  Backend (API)  │────▶│  PostgreSQL  │
│  React 19       │     │  Express + TS   │     │  Prisma ORM  │
│  Vite 7         │     │  JWT auth       │     │  migrations  │
│  Tailwind 3     │     │  pino logging   │     │              │
└─────────────────┘     └─────────────────┘     └──────────────┘
       :3000                    :4000
```

- Frontend dev server proxies `/api` to the backend, so the browser talks to a single origin in development.
- Swagger UI is served by the API itself at `/api-docs`.
- The database schema is **migration-managed**. `prisma db push` is retired — use `prisma migrate deploy`.

## Scale of the codebase

These counts are the actual current state, not aspirations:

| Thing | Count |
|-------|-------|
| Prisma models | 38 |
| Prisma migrations | 22 |
| Backend API route files | 27 |
| Backend route groups mounted | 27 |
| Backend test files | 88 `.test.ts` run by vitest (39 unit + 49 routes), 1180 tests executed (`vitest list` prints 1176: it counts each `it.each` template once, and the runner expands the two 3-case `it.each` templates in `laborAttribution.test.ts` into six); 3 non-test support files (`helpers.ts`, `load-env.ts`, `setup.ts`) bring the tracked total to 91 |
| Frontend pages | 20 |
| Frontend service modules | 27 |
| Frontend test files | 28 (153 tests) |

*Re-derived 2026-10-20 against the repository at `e5de737`. This table moved
from the 2026-10-16 re-derivation: frontend pages 17→20 (`EquipmentForm`-backed
equipment create/edit, the crafts, code-lists and safety-checklist screens added
by the UI gap-closure workstream), frontend service modules 26→27
(`equipmentMeterService.addReading`), frontend test files 13→28 and 153 tests as
the Build Now set (G1-G10) and the gap-closure workstream added component tests.
The 2026-10-16 values (frontend pages 17, service modules 26, test files 13) and,
before them, the 2026-10-08 re-derivation — migrations 19→22, backend test files
81→88 (35 + 46 → 39 + 49), executed tests 1084→1180, frontend service modules
25→26 and frontend test files 8→13 — are kept here rather than silently
overwritten.*

## Implemented functionality

### Master data
- Hierarchical functional locations (plant → area → unit → sub-unit) with a tree endpoint.
- Equipment catalog with technical parameters, meter definitions, BOM materials, and CSV import/export. Equipment is created and edited from the UI (`EquipmentForm`, reachable from the list **Add Equipment** control and the detail-page **Edit** control), with criticality `S`/`A`/`B`/`C`.
- Work centers with associated crafts and hourly rates, created and edited from the UI (code, name, daily capacity hours, cost rate, active flag; retired by deactivating, not deleting).
- Materials / spare parts with CSV import/export, plus row-level create and edit from the UI (code, description, unit of measure, standard cost, current stock).
- Failure codes, cause codes, and task list templates with operations, each with their own management screen (`/crafts`, `/code-lists`, `/task-lists`).
- Equipment meter readings: an **Add reading** form in the meter card of the equipment detail page appends to the readings history through `POST /api/equipment-meters/{id}/readings` (Technician+), rather than overwriting the latest value.

### Work management
- Five work order types: `CM`, `PM`, `PdM`, `EM`, `CAL`.
- Eight-status lifecycle: `Draft → Planned → Scheduled → In Progress → Suspended → Completed → Closed`, plus `Cancelled`, with guarded transitions.
- Operations/tasks with craft assignment.
- Work order material reservations and consumption.
- Labour entries recorded against operations.
- External service costs and cost splits.
- Safety checklist templates and per-work-order checklist completion.
- Comments on work orders, notifications, equipment, and maintenance plans.
- File attachments with upload, download, and delete.
- Audit trail on mutating operations.

### Notifications
- `M1` (Malfunction), `M2` (Request), `M3` (Completion) with a breakdown/emergency flag.
- Conversion of a notification into a work order.
- Editing of a notification (type, priority, description, location, equipment, damages, breakdown flag) from its detail page; the edit control is hidden once the notification is `Converted`, since the linked work order owns the truth from that point.

### Preventive maintenance
- Maintenance plans with a strategy type (`Time`, `Meter`, `Combined`), a recurrence interval, and a call horizon (default 7 days).
- Meter-to-plan linkage via a per-plan meter interval (`MaintenancePlanMeter`).
- The scheduler auto-generates work orders for **Time**-based plans only.

### Reporting & dashboard
- Ten report endpoints. Seven are on the **Reports** screen (`backlog`, `pm-compliance`, `mtbf`, `mttr`, `cost-summary`, `downtime`, `material-consumption`); three back dashboard widgets (`backlog-hours-by-work-center`, `top-cost-equipment`, `notifications-awaiting-conversion`). Every report returns JSON **and** exports a server-built `.xlsx` workbook (`GET /api/reports/{report}/export.xlsx`), so the API is not JSON-only. `material-consumption` aggregates work order material issues, not meter readings.
- The **Reports** screen carries a filter bar - from/to dates, functional location, equipment, work centre, and an include-descendant-locations toggle - applied to all seven reports and their exports. A rejected filter surfaces the backend's reason, since the API validates the parameters and returns a 400.
- Dashboard KPIs, system alerts, and cost summary.
- CSV export exists for the **equipment** and **materials** master lists (`/export.csv`), with matching validated import.
### Administration & operations
- Role-based access control across six roles: `Administrator`, `Maintenance Planner`, `Maintenance Supervisor`, `Technician`, `Requester`, `View-Only`.
- User administration: an **Add User** form, a per-row profile **edit** (role, full name, email, work centre, active flag) and a per-row **Deactivate** control on the Administration screen, plus a self-service **Change password** dialog in the global sidebar.
- System alerts and account lockout after repeated failed logins.
- Administration screens for users and audit log. The **Settings** tab edits runtime configuration through `GET`/`PUT /api/system-config`.
- Rate limiting on the login route.
- Structured JSON logging (pino) to `logs/api-out.log` / `logs/api-err.log` (API) and `logs/worker-out.log` / `logs/worker-err.log` (scheduler worker) under PM2.

## Not implemented

These are **not** present in the code. Do not plan around them:

- **No PDF export** of any kind; the PDF limb of SOW §3.7.1 is waived under D-9. Reports return JSON and export server-built `.xlsx` workbooks; CSV export exists only for the equipment and materials master lists.
- **No ERP integration** of any kind.
- **No internationalisation (i18n)**. The UI is English-only.
- **No interactive ad-hoc query builder.** Reports are ten fixed queries; the SOW §3.7.3 "documented view layer for the Client's BI tool" limb is delivered as 23 read-only `report_*` SQL views (`backend/prisma/migrations/20261002160000_reporting_views`).
- **Session security (refresh rotation and revocable logout) is delivered from C1 (2026-10-15).** Auth is a short-lived bearer JWT (15 minutes) plus a rotating httpOnly refresh cookie; the auth endpoints are `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/refresh` and `POST /api/auth/logout`, and the `RefreshToken` table is the session store. This line previously read "No refresh tokens and no logout endpoint ... A `RefreshToken` model exists in the schema but is unused."
- **No SMTP/email sending.** Notifications are in-app records only.
- **Meter-based and Combined PM plans are stored but not auto-generated.** The scheduler only selects `strategyType: 'Time'` plans.

## Prerequisites

- **Node.js 20 LTS or 24** — CI pins Node 24, and the project is developed and verified on Node 24.19.0 / npm 11.
- **PostgreSQL 15+**, reachable from the backend.
- Windows is the supported deployment target (`scripts\*.bat`). The toolchain is cross-platform, but the batch deployment path is what is exercised.

## Quick start (Windows)

### 1. Create the database

```cmd
psql -U postgres -c "CREATE DATABASE cmms;"
```

### 2. Backend

```cmd
cd backend
npm install
copy .env.example .env
REM edit .env: set DATABASE_URL and a strong JWT_SECRET
npx prisma generate
npx prisma migrate deploy
```

Start the API:

```cmd
npm run dev
```

The API listens on `http://localhost:4000`. Confirm it is alive:

```cmd
curl http://localhost:4000/api/health
```

The background scheduler (PM generation, overdue sweep, audit retention) is a **separate
process** since C11, so `npm run dev` alone does not run it. To run the job worker beside
the API in development:

```cmd
npm run worker:dev
```

In production both processes are started together from `ecosystem.config.cjs` (apps
`cmms-api` and `cmms-worker`); see the Installation Guide.

> In PowerShell, `copy .env.example .env` is `Copy-Item .env.example .env`.

### 3. Demo data (fresh installs only)

The seed is deliberately **guarded**: it refuses to run unless `SEED_DEMO=1` and `NODE_ENV` is not `production`, because it destructively wipes every table including work orders and notifications.

```cmd
scripts\seed-demo.bat
```

### 4. Frontend

```cmd
cd app
npm install
copy .env.example .env.local
npm run dev
```

- Frontend: <http://localhost:3000>
- API: <http://localhost:4000>
- Swagger: <http://localhost:4000/api-docs>

## Demo accounts

**Demo credentials only — every account below uses the password `password`. Change or delete them before any shared or production deployment.**

| Username | Role | Can do |
|----------|------|--------|
| `admin` | Administrator | Everything, incl. user management |
| `planner` | Maintenance Planner | Planning, work orders, master data import |
| `supervisor` | Maintenance Supervisor | Supervise work, manage checklist/attachments |
| `tech1`, `tech2` | Technician | Execute operations, record labour and checklists |
| `operator` | Requester | Raise notifications, comment, upload files |
| `auditor` | View-Only | Read-only across the system |

The `admin` and `operator` accounts are the fastest way to see the two ends of the workflow: raising a request as `operator`, then approving and executing it as `admin`.

## API endpoint groups

All routes are under `/api`. Full request/response schemas are in Swagger at `/api-docs`.

| Group | Path |
|-------|------|
| Health | `/api/health`, `/api/health/scheduler` |
| Auth | `/api/auth/login`, `/api/auth/me` |
| Functional locations | `/api/functional-locations` |
| Equipment | `/api/equipment` (incl. `export.csv`, `import.csv`) |
| Equipment meters | `/api/equipment-meters` |
| Work centers | `/api/work-centers` |
| Crafts | `/api/crafts` |
| Materials | `/api/materials` (incl. `export.csv`, `import.csv`) |
| Failure codes | `/api/failure-codes` |
| Task lists | `/api/task-lists` |
| Notifications | `/api/notifications` |
| Work orders | `/api/work-orders` |
| Work order operations | `/api/work-order-operations` |
| Work order materials | `/api/work-order-materials` |
| Work order cost splits | `/api/work-order-cost-splits` |
| Labour | `/api/labor` |
| External services | `/api/external-services` |
| Maintenance plans | `/api/maintenance-plans` |
| Safety checklists | `/api/safety-checklists` |
| Reports | `/api/reports` |
| Dashboard | `/api/dashboard` |
| Alerts | `/api/alerts` |
| Comments | `/api/comments` |
| Attachments | `/api/attachments` |
| Audit log | `/api/audit-log` |
| Users | `/api/users` |
| System config | `/api/system-config` |

## Technology stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3 |
| State | Zustand 5 |
| Charts | Recharts 2 |
| 3D | React Three Fiber 9 (animated dashboard KPI canvas) |
| Validation (UI) | Zod 4 |
| Backend | Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 15+ |
| Auth | JWT + bcrypt, six-role RBAC |
| Logging | pino, pino-http |
| Process manager | PM2 (optional; `backend\ecosystem.config.cjs`) |
| Load testing | k6 (`scripts/k6/smoke.js`, `scripts/k6/acceptance.js`) |
| API docs | Swagger / OpenAPI 3 |

## Windows scripts

| Script | Purpose |
|--------|---------|
| `scripts\build.bat` | Install, `prisma generate`, `migrate deploy`, build backend and frontend |
| `scripts\start.bat` | Start the API (PM2 if present, else `node dist/index.js`) and the frontend dev server |
| `scripts\backup.bat` | Database backup |
| `scripts\restore-drill.bat` | Verify a backup actually restores |
| `scripts\pitr-drill.ps1` | Prove WAL archiving + point-in-time recovery and measure the RPO (ADMIN_GUIDE 7.8) |
| `scripts\seed-demo.bat` | **Destructive** demo reseed, fresh installs only |
| `scripts\verify\` | One-off per-phase verification scripts left over from the finalization work (Python/TS) |
| `scripts\k6\smoke.js` | k6 smoke test |
| `scripts\k6\acceptance.js` | k6 100-VU acceptance (SOW 6.4.3) — the `k6.exe` binary is not committed |

## Development commands

```cmd
:: backend
cd backend
npm run dev          :: watch mode via tsx
npm run build        :: tsc -> dist/
npm test             :: vitest
npm run lint

:: frontend
cd app
npm run dev
npm run build        :: tsc -b && vite build
npm test             :: vitest
npm run lint
```

## Known issues

- **Prisma connection-pool exhaustion under concurrent logins (resolved 2026-09-29).** The k6 smoke run showed a subset of ~140 simultaneous logins failing with Prisma `P2028` while the read path stayed healthy; the 100-VU acceptance run reproduced it at higher load (55/200 logins HTTP 500). Fixed by verifying the password outside the login transaction, sizing the Prisma pool (`connection_limit=20&pool_timeout=30000`) against `max_connections=100`, and raising the interactive-transaction ceilings (see ADMIN_GUIDE 14.3). The post-fix 100-VU run passes with 0 P2028. The SOW §4.1 200-user load test was executed and passed on 2026-10-03 (tracker G.5), and the transactional-save limb was measured at C12 (2026-10-10), so §4.1 no longer waits on a post-go-live exercise. *This sentence previously read that the 200-user load test "remains a **post-go-live** capacity exercise", superseded by that run.*
- **Session security is now server-side (C1, 2026-10-15).** The 30-minute idle timeout still runs in the browser (`useIdleTimeout`, wired into the app layout, 60-second warning) as the UX warning, but the server enforces the same limit independently. The access token is short-lived (15 minutes by default) and carries a `sid` claim naming a refresh session; `POST /api/auth/refresh` rotates that session and `POST /api/auth/logout` revokes it, so an idle or logged-out session is refused server-side rather than only in the browser. This line previously read "The 30-minute idle timeout is client-side only ... the JWT remains valid server-side for its full 8 hours. Do not rely on it as a session control", superseded by C1.
- **The Settings screen separates configurable settings from fixed ones.** The editable rows load from `GET /api/system-config` and save through `PUT /api/system-config` (Administrator only): the work-order and notification number prefixes and the audit-log retention period, all read by the backend when generating numbers or purging audit history. The remaining rows are read-only and labelled "fixed configuration" - session timeout (30 minutes, enforced server-side since C1; see above), PM scheduler (the server cron, default 02:00 via `PM_SCHEDULER_CRON`), the 10 MB attachment upload cap, the bcrypt-with-lockout password policy, and the English-only build. They state the value in force; they are not configurable from the screen.
- **`npm audit` production advisories: app clean, backend one residual.** As of 2026-10-10 `npm audit --omit=dev` reports **0** advisories in the app and **3** in the backend, all one advisory — `deepmerge-ts <8`, reached through `@prisma/config` → `prisma`. That package is a devDependency and only an *optional* peer of `@prisma/client`, and this repo has no `prisma.config.*`, so the vulnerable path is unreachable at runtime; no stable Prisma fixes it yet (`7.10.0` still pins `deepmerge-ts` `7.1.5`), so re-examining is deferred to a stable Prisma bump rather than forced with an `overrides` pin. The dev-only Tailwind 3 / PostCSS advisories also remain (they need `tailwindcss@4`, a breaking change). The figures this line previously carried — `9 … no criticals` in the backend and `4` in the app — understated the backend: re-measured from source it held **10**, including a critical `proxy-addr` IP-spoofing advisory. Those, plus the backend `express`/`body-parser`/`qs`, `js-yaml`, `fast-uri` and `brace-expansion` items and the app's `react-router-dom`/`lodash`/`fflate`, are patched at run 248 (`ad93610`).
- **Lint debt is cleared.** `npm run lint` is clean in both packages as of 2026-10-10 — backend and frontend each report **0 errors, 0 warnings** — and CI enforces it (run 246, `cfc6108`). The figures this line previously carried (backend 41; frontend 28 + 2 warnings, measured 2026-10-02) were already stale: the pre-sweep baselines re-measured from source on 2026-10-08 were backend 43 and frontend 29 + 2 warnings.
- **HTTPS/TLS is terminated by the IIS/ARR front end.** Verified against the live site on 2026-10-03: `curl -k https://cmms.local/api/health` returns 200 `{"status":"ok"}` and `/dashboard` returns the SPA over HTTPS (matrix §4.2, line 256). `DATABASE_URL` still uses `sslmode=disable` for the local database connection, and the API should still not be exposed directly to the internet. This line previously read "HTTPS/TLS termination is not configured", superseded by that live deployment.
- **The IIS reverse-proxy deployment has been executed and verified.** IIS/ARR rewrites `^api/(.*)` to `http://localhost:4000/api/{R:1}` and served both the API health limb and the dashboard SPA over HTTPS on 2026-10-03 (see the line above). This line previously read "has not been executed end to end. Treat it as untested", superseded by that verification.

## Project layout

```
CMMSproject/
├── app/                        # React SPA
│   └── src/
│       ├── components/         # layout, dashboard (incl. the R3F canvas)
│       ├── pages/              # 20 page components
│       ├── services/           # 27 API service modules
│       ├── store/              # Zustand
│       ├── types/              # TypeScript types
│       └── __tests__/          # 28 test files
├── backend/                    # Express API
│   ├── src/
│   │   ├── routes/             # 27 route files
│   │   ├── middleware/         # auth, RBAC, audit, validation
│   │   ├── services/           # scheduler and domain logic
│   │   └── utils/              # logger, csv, prisma client
│   ├── prisma/
│   │   ├── schema.prisma       # 38 models
│   │   ├── migrations/         # 22 migrations
│   │   └── seed.ts             # guarded demo seed
│   └── tests/                  # 88 test files + 3 support = 91 tracked
├── scripts/                    # Windows batch scripts, k6, verify scripts
├── docs/                        # all documentation; README.md is the only .md at the root
│   ├── CMMS_FINALIZATION_TRACKER.md
│   ├── INSTALLATION_GUIDE.md
│   └── ...                      # SOW_COMPLIANCE, API_REFERENCE, ARCHITECTURE, USER_MANUAL, ADMIN_GUIDE, DECISION_REGISTER, DATA_DICTIONARY, ER_DIAGRAM, WCAG-AUDIT, HANDOFF
├── backend\ecosystem.config.cjs  # PM2 process definition
└── .github/workflows/ci.yml
```

## Further reading

- `RELEASE_NOTES.md` — what changed in each release, most recent first.
- `docs/INSTALLATION_GUIDE.md` — full Windows/IIS deployment, PM2, backup/restore, and k6 instructions.
- `docs/CMMS_FINALIZATION_TRACKER.md` — per-phase status, verification evidence, and deferred items.
