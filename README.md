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
| Prisma migrations | 19 |
| Backend API route files | 27 |
| Backend route groups mounted | 27 |
| Backend test files | 81 `.test.ts` run by vitest (35 unit + 46 routes), 1084 tests executed (`vitest list` prints 1080: it counts each `it.each` template once, the runner expands them); 3 non-test support files (`helpers.ts`, `load-env.ts`, `setup.ts`) bring the tracked total to 84 |
| Frontend pages | 17 |
| Frontend service modules | 25 |
| Frontend test files | 8 |

*Re-derived 2026-10-08 against the repository at `3fbbea1`. The previous
table - 15 migrations, 26 route files and groups, 70 backend tests (33 + 37)
and a tracked total of 73, 23 service modules, 7 frontend tests - was written
before the 2026-10-02 to 2026-10-07 work and is kept here rather than
silently overwritten.*

## Implemented functionality

### Master data
- Hierarchical functional locations (plant → area → unit → sub-unit) with a tree endpoint.
- Equipment catalog with technical parameters, meter definitions, BOM materials, and CSV import/export.
- Work centers with associated crafts and hourly rates.
- Materials / spare parts with CSV import/export.
- Failure codes, cause codes, and task list templates with operations.
- Equipment meter readings over time.

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

### Preventive maintenance
- Maintenance plans with a strategy type (`Time`, `Meter`, `Combined`), a recurrence interval, and a call horizon (default 7 days).
- Meter-to-plan linkage via a per-plan meter interval (`MaintenancePlanMeter`).
- The scheduler auto-generates work orders for **Time**-based plans only.

### Reporting & dashboard
- Ten report endpoints. Seven are on the **Reports** screen (`backlog`, `pm-compliance`, `mtbf`, `mttr`, `cost-summary`, `downtime`, `material-consumption`); three back dashboard widgets (`backlog-hours-by-work-center`, `top-cost-equipment`, `notifications-awaiting-conversion`). Every report returns JSON **and** exports a server-built `.xlsx` workbook (`GET /api/reports/{report}/export.xlsx`), so the API is not JSON-only. `material-consumption` aggregates work order material issues, not meter readings.
- Dashboard KPIs, system alerts, and cost summary.
- CSV export exists for the **equipment** and **materials** master lists (`/export.csv`), with matching validated import.

### Administration & operations
- Role-based access control across six roles: `Administrator`, `Maintenance Planner`, `Maintenance Supervisor`, `Technician`, `Requester`, `View-Only`.
- User administration, including per-user password change.
- System alerts and account lockout after repeated failed logins.
- Read-only Administration screens for users and audit log. The **Settings** tab edits runtime configuration through `GET`/`PUT /api/system-config`.
- Rate limiting on the login route.
- Structured JSON logging (pino) to `logs/api-out.log` and `logs/api-err.log` under PM2.

## Not implemented

These are **not** present in the code. Do not plan around them:

- **No PDF export** of any kind; the PDF limb of SOW §3.7.1 is waived under D-9. Reports return JSON and export server-built `.xlsx` workbooks; CSV export exists only for the equipment and materials master lists.
- **No ERP integration** of any kind.
- **No internationalisation (i18n)**. The UI is English-only.
- **No interactive ad-hoc query builder.** Reports are ten fixed queries; the SOW §3.7.3 "documented view layer for the Client's BI tool" limb is delivered as 23 read-only `report_*` SQL views (`backend/prisma/migrations/20261002160000_reporting_views`).
- **No refresh tokens and no logout endpoint.** Auth is a stateless JWT; there are only `POST /api/auth/login` and `GET /api/auth/me`. A `RefreshToken` model exists in the schema but is unused. Sessions simply expire.
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

- **Prisma connection-pool exhaustion under concurrent logins (resolved 2026-09-29).** The k6 smoke run showed a subset of ~140 simultaneous logins failing with Prisma `P2028` while the read path stayed healthy; the 100-VU acceptance run reproduced it at higher load (55/200 logins HTTP 500). Fixed by verifying the password outside the login transaction, sizing the Prisma pool (`connection_limit=20&pool_timeout=30000`) against `max_connections=100`, and raising the interactive-transaction ceilings (see ADMIN_GUIDE 14.3). The post-fix 100-VU run passes with 0 P2028. The SOW §4.1 200-user load test remains a **post-go-live** capacity exercise.
- **The 30-minute idle timeout is client-side only.** It exists and works (`useIdleTimeout`, wired into the app layout, 60-second warning, 3 passing tests), but it only clears local state and redirects to the login page. There is no logout endpoint and no token revocation, so the JWT remains valid server-side for its full 8 hours. Do not rely on it as a session control.
- **The Settings screen is partly live, partly static.** Only the two number-prefix rows load from `GET /api/system-config` and save through `PUT /api/system-config` (Administrator only), and the backend reads them when generating work order and notification numbers. The other rows shown (session timeout, PM scheduler time, audit retention, upload limit, password policy, language) are hardcoded display markup with no backing configuration, and nothing in the code enforces those values. Do not treat those labels as statements of what the backend enforces.
- **`npm audit` is not clean.** Production dependencies currently report 9 advisories in `backend` (6 high, 3 moderate) and 4 in `app` (3 high, 1 moderate); no criticals. The high-severity items are transitive: `prisma`/`@prisma/config`, `js-yaml`, `fast-uri`, `deepmerge-ts`, and `brace-expansion` on the backend; `react-router-dom` and `lodash` on the frontend. None is fixed yet. Review them before any public exposure.
- **Lint is not clean.** `npm run lint` reports a known baseline of errors in both packages (backend 41; frontend 28 + 2 warnings, all measured 2026-10-02). Types and tests pass; the lint debt is tracked and unfixed.
- **HTTPS/TLS termination is not configured.** The reference deployment assumes a reverse proxy in front of the app; `DATABASE_URL` uses `sslmode=disable` locally. Do not expose the API directly to the internet.
- **The IIS reverse-proxy deployment has not been executed end to end.** Treat it as untested.

## Project layout

```
CMMSproject/
├── app/                        # React SPA
│   └── src/
│       ├── components/         # layout, dashboard (incl. the R3F canvas)
│       ├── pages/              # 17 page components
│       ├── services/           # 25 API service modules
│       ├── store/              # Zustand
│       ├── types/              # TypeScript types
│       └── __tests__/          # 8 test files
├── backend/                    # Express API
│   ├── src/
│   │   ├── routes/             # 27 route files
│   │   ├── middleware/         # auth, RBAC, audit, validation
│   │   ├── services/           # scheduler and domain logic
│   │   └── utils/              # logger, csv, prisma client
│   ├── prisma/
│   │   ├── schema.prisma       # 38 models
│   │   ├── migrations/         # 19 migrations
│   │   └── seed.ts             # guarded demo seed
│   └── tests/                  # 81 test files + 3 support = 84 tracked
├── scripts/                    # Windows batch scripts, k6, verify scripts
├── docs/                        # all documentation; README.md is the only .md at the root
│   ├── CMMS_FINALIZATION_TRACKER.md
│   ├── INSTALLATION_GUIDE.md
│   └── ...                      # SOW_COMPLIANCE, API_REFERENCE, ARCHITECTURE, USER_MANUAL, ADMIN_GUIDE, DECISION_REGISTER, DATA_DICTIONARY, ER_DIAGRAM, WCAG-AUDIT, HANDOFF
├── backend\ecosystem.config.cjs  # PM2 process definition
└── .github/workflows/ci.yml
```

## Further reading

- `docs/INSTALLATION_GUIDE.md` — full Windows/IIS deployment, PM2, backup/restore, and k6 instructions.
- `docs/CMMS_FINALIZATION_TRACKER.md` — per-phase status, verification evidence, and deferred items.
