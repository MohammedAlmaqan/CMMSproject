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
| Prisma models | 35 |
| Prisma migrations | 5 |
| Backend API route files | 24 |
| Backend route groups mounted | 24 |
| Backend test files | 24 (156 tests) |
| Frontend pages | 16 |
| Frontend service modules | 22 |
| Frontend test files | 6 |

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
- Seven standard reports: `backlog`, `pm-compliance`, `mtbf`, `mttr`, `cost-summary`, `downtime`, `material-consumption`. **All return JSON.** `material-consumption` aggregates work order material issues, not meter readings.
- Dashboard KPIs, system alerts, and cost summary.
- CSV export exists for the **equipment** and **materials** master lists (`/export.csv`), with matching validated import.

### Administration & operations
- Role-based access control across six roles: `Administrator`, `Maintenance Planner`, `Maintenance Supervisor`, `Technician`, `Requester`, `View-Only`.
- User administration, including per-user password change.
- System alerts and account lockout after repeated failed logins.
- Read-only Administration screens for users, audit log, and RBAC. The **Settings** tab is a static display only — there is no configuration API and nothing in it can be edited.
- Rate limiting on the login route.
- Structured JSON logging (pino) to `logs/api-out.log` and `logs/api-err.log` under PM2.

## Not implemented

These are **not** present in the code. Do not plan around them:

- **No PDF export** of any kind. Reports are JSON only; the only export format is CSV, and only for equipment and materials.
- **No ERP integration** of any kind.
- **No internationalisation (i18n)**. The UI is English-only.
- **No ad-hoc query builder or ad-hoc reporting.** Reports are seven fixed queries.
- **No Kanban board view.** The work order list is a table.
- **No refresh tokens and no logout endpoint.** Auth is a stateless JWT; there are only `POST /api/auth/login` and `GET /api/auth/me`. A `RefreshToken` model exists in the schema but is unused. Sessions simply expire.
- **No SMTP/email sending.** Notifications are in-app records only.
- **No editable system configuration.** The Administration → Settings screen is hardcoded markup. The backend reads a `wo_number_prefix` value from the `SystemConfig` table when generating work order numbers, but exposes no endpoint to change it.
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
| Load testing | k6 (`scripts/k6/smoke.js`) |
| API docs | Swagger / OpenAPI 3 |

## Windows scripts

| Script | Purpose |
|--------|---------|
| `scripts\build.bat` | Install, `prisma generate`, `migrate deploy`, build backend and frontend |
| `scripts\start.bat` | Start the API (PM2 if present, else `node dist/index.js`) and the frontend dev server |
| `scripts\backup.bat` | Database backup |
| `scripts\restore-drill.bat` | Verify a backup actually restores |
| `scripts\seed-demo.bat` | **Destructive** demo reseed, fresh installs only |
| `scripts\verify\` | One-off per-phase verification scripts left over from the finalization work (Python/TS) |
| `scripts\k6\smoke.js` | k6 smoke test (the `k6.exe` binary is not committed) |

## Development commands

```cmd
:: backend
cd backend
npm run dev          :: watch mode via tsx
npm run build        :: tsc -> dist/
npm test             :: vitest (24 files, 156 tests)
npm run lint

:: frontend
cd app
npm run dev
npm run build        :: tsc -b && vite build
npm test             :: vitest
npm run lint
```

## Known issues

- **Prisma connection-pool exhaustion under concurrent logins.** The k6 smoke run showed a subset of ~140 simultaneous logins failing with Prisma `P2028` (connection pool timeout) while the read path stayed healthy. This needs Prisma pool sizing plus PostgreSQL `max_connections` tuning, and it blocks the SOW §4.1 200-user load test. It is a **post-go-live** item, not a v1.0.0 blocker.
- **The 30-minute idle timeout is client-side only.** It exists and works (`useIdleTimeout`, wired into the app layout, 60-second warning, 3 passing tests), but it only clears local state and redirects to the login page. There is no logout endpoint and no token revocation, so the JWT remains valid server-side for its full 8 hours. Do not rely on it as a session control.
- **The Settings screen is hardcoded and partly aspirational.** Its 30-minute session timeout happens to match the client hook, but it is not read from any configuration, and other rows it shows (audit retention window, upload limit) are not enforced anywhere in code. Do not treat it as documentation of the running system.
- **`npm audit` is not clean.** Production dependencies currently report 9 advisories in `backend` (6 high, 3 moderate) and 4 in `app` (3 high, 1 moderate); no criticals. The high-severity items are transitive: `prisma`/`@prisma/config`, `js-yaml`, `fast-uri`, `deepmerge-ts`, and `brace-expansion` on the backend; `react-router-dom` and `lodash` on the frontend. None is fixed yet. Review them before any public exposure.
- **Lint is not clean.** `npm run lint` reports a known baseline of errors in both packages (backend ~49, frontend ~32 + 2 warnings). Types and tests pass; the lint debt is tracked and unfixed.
- **HTTPS/TLS termination is not configured.** The reference deployment assumes a reverse proxy in front of the app; `DATABASE_URL` uses `sslmode=disable` locally. Do not expose the API directly to the internet.
- **The IIS reverse-proxy deployment has not been executed end to end.** Treat it as untested.

## Project layout

```
CMMSproject/
├── app/                        # React SPA
│   └── src/
│       ├── components/         # layout, dashboard (incl. the R3F canvas)
│       ├── pages/              # 16 page components
│       ├── services/           # 22 API service modules
│       ├── store/              # Zustand
│       ├── types/              # TypeScript types
│       └── __tests__/          # 6 test files
├── backend/                    # Express API
│   ├── src/
│   │   ├── routes/             # 24 route files
│   │   ├── middleware/         # auth, RBAC, audit, validation
│   │   ├── services/           # scheduler and domain logic
│   │   └── utils/              # logger, csv, prisma client
│   ├── prisma/
│   │   ├── schema.prisma       # 35 models
│   │   ├── migrations/         # 5 migrations
│   │   └── seed.ts             # guarded demo seed
│   └── tests/                  # 24 test files
├── scripts/                    # Windows batch scripts, k6, verify scripts
├── CMMS_FINALIZATION_TRACKER.md
├── INSTALLATION_GUIDE.md
├── backend\ecosystem.config.cjs  # PM2 process definition
└── .github/workflows/ci.yml
```

## Further reading

- `INSTALLATION_GUIDE.md` — full Windows/IIS deployment, PM2, backup/restore, and k6 instructions.
- `CMMS_FINALIZATION_TRACKER.md` — per-phase status, verification evidence, and deferred items.
