# CommandPulse CMMS

A comprehensive Computerized Maintenance Management System (CMMS) for managing maintenance activities including work orders, notifications, equipment, preventive maintenance, and reporting.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Frontend (SPA) │────▶│  Backend (API)  │────▶│  PostgreSQL  │
│  React 19       │     │  Express/TS     │     │  Database    │
│  Vite 7         │     │  Prisma ORM     │     │              │
│  Tailwind CSS   │     │  JWT Auth       │     │              │
│  shadcn/ui      │     │  Swagger Docs   │     │              │
└─────────────────┘     └─────────────────┘     └──────────────┘
```

## Project Structure

```
/workspaces/CMMSproject/
├── app/                        # Frontend application
│   ├── src/
│   │   ├── components/         # UI components (layout, dashboard)
│   │   ├── pages/              # Page components (14 pages)
│   │   ├── services/           # API service layer (18 services)
│   │   ├── store/              # Zustand state management
│   │   ├── types/              # TypeScript type definitions
│   │   ├── data/               # Mock data (fallback)
│   │   └── lib/                # Utilities (API client)
│   └── ...
├── backend/                    # Backend API server
│   ├── src/
│   │   ├── routes/             # API route handlers (21 route files)
│   │   ├── middleware/         # Auth, RBAC, audit middleware
│   │   └── utils/              # Prisma client
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (27 models)
│   │   └── seed.ts             # Seed data script
│   └── ...
└── scripts/                    # Windows deployment scripts
    ├── build.bat
    └── start.bat
```

## Quick Start

### Prerequisites

- Node.js 18+ (tested with v24.14.0)
- npm 9+
- PostgreSQL 15+

### Setup

**1. Database Setup**

```bash
# Install and start PostgreSQL, then create database:
psql -U postgres -c "CREATE DATABASE cmms;"
```

**2. Backend Setup**

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL connection string
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run start:dev
```

**3. Frontend Setup**

```bash
cd app
cp .env.example .env.local
npm install
npm run dev
```

**4. Access the Application**

- Frontend: http://localhost:3000
- API: http://localhost:4000
- API Docs (Swagger): http://localhost:4000/api-docs

### Login Credentials

| Username   | Password   | Role                    |
|------------|------------|-------------------------|
| admin      | password   | Administrator           |
| planner    | password   | Maintenance Planner     |
| supervisor | password   | Maintenance Supervisor  |
| tech1      | password   | Technician              |
| tech2      | password   | Technician              |
| operator   | password   | Requester               |
| auditor    | password   | View-Only               |

## API Endpoints

| Group | Endpoints |
|-------|-----------|
| Auth | POST /api/auth/login, GET /api/auth/me |
| Functional Locations | CRUD + /tree |
| Equipment | CRUD + filters |
| Equipment Meters | CRUD + readings |
| Work Centers | CRUD with crafts |
| Materials | CRUD + search |
| Failure Codes | CRUD + /tree |
| Task Lists | CRUD with operations |
| Notifications | CRUD + convert-to-wo |
| Work Orders | CRUD + status transitions + pagination |
| Work Order Operations | CRUD by WO |
| Work Order Materials | CRUD by WO |
| Labor | CRUD by WO |
| Maintenance Plans | CRUD + generate-wo |
| Safety Checklists | Templates + WO checklists |
| Reports | backlog, pm-compliance, mtbf, mttr, cost-summary, downtime, material-consumption |
| Dashboard | kpis, alerts, cost-summary |
| Alerts | list, unread-count, mark-read |
| Comments | list, create, delete |
| Audit Log | paginated, filterable |
| Users | list, update, change-password |

## Windows Deployment

See `scripts/build.bat` and `scripts/start.bat` for Windows batch deployment scripts.

## Features

### Master Data
- Hierarchical functional locations (Plant → Area → Unit → Sub-unit)
- Equipment catalog with technical parameters, BOM, and meters
- Work centers with crafts and hourly rates
- Materials/spare parts inventory
- Failure codes, cause codes, and task list templates

### Work Management
- 5 work order types: CM, PM, PdM, EM, CAL
- 8-status lifecycle workflow with state transitions
- Operations/tasks with craft assignment
- Material planning and consumption tracking
- Labour recording against operations
- External service costs
- Safety checklists with LOTO templates
- Comments and audit trail
- Kanban board view

### Preventive Maintenance
- Time-based, meter-based, and combined strategies
- Auto-generated work orders with call horizon
- Maintenance plan schedules

### Notifications
- M1 (Malfunction), M2 (Request), M3 (Completion)
- Convert notifications to work orders
- Breakdown flag for emergency handling

### Reporting & Dashboards
- 7 standard reports with PDF/Excel export
- Real-time KPI dashboard with charts
- Drill-down capability

### Administration
- Role-based access control (6 roles)
- Full audit logging
- User management
- System configuration

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 3, shadcn/ui |
| State | Zustand |
| Charts | Recharts |
| 3D | React Three Fiber |
| Backend | Express.js, TypeScript, Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT with bcrypt |
| API Docs | Swagger/OpenAPI 3.0 |
