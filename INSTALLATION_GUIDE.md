# CommandPulse CMMS — Installation & Deployment Guide

## 1. System Requirements

### Hardware Requirements (Windows Server)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 10 GB free | 20+ GB SSD |
| Network | Any | 100 Mbps+ |

### Software Prerequisites

| Software | Version | Required For |
|----------|---------|--------------|
| Windows Server | 2019 / 2022 | Hosting |
| Node.js | 20 LTS | Backend + Frontend |
| npm | 9+ | Package management |
| PostgreSQL | 15+ | Database |
| IIS (optional) | 10+ | Reverse proxy for production |
| PM2 (recommended) | Latest | Process management |

---

## 2. Installation Steps

### Step 1: Install Node.js

1. Download Node.js 20 LTS from https://nodejs.org/
2. Run installer with default options
3. Verify installation:
```cmd
node --version
npm --version
```

### Step 2: Install PostgreSQL

1. Download PostgreSQL 17+ from https://www.postgresql.org/download/windows/
2. Run installer, set postgres password when prompted
3. Add PostgreSQL `bin` directory to system PATH (typically `C:\Program Files\PostgreSQL\17\bin`)
4. Create database:
```cmd
psql -U postgres -c "CREATE DATABASE cmms;"
```

### Step 3: Install PM2 (Recommended)

```cmd
npm install -g pm2
```

### Step 4: Build the Application

Run the build script or manually:

```cmd
cd CMMSproject\scripts
build.bat
```

**Manual Build:**

```cmd
REM Backend
cd CMMSproject\backend
copy .env.example .env
REM Edit .env with your database connection string
npm install
npx prisma generate
npx prisma db push
npx tsc
npx tsx prisma\seed.ts

REM Frontend
cd CMMSproject\app
copy .env.example .env.local
REM Edit .env.local if API URL differs
npm install
npm run build
```

### Step 5: Start the Application

**Option A: Using PM2 (Recommended)**

```cmd
cd CMMSproject\backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

**Option B: Using Windows Services**

Create two Windows services (using NSSM - Non-Sucking Service Manager):

```cmd
REM Backend service
nssm install CMMS-API "C:\Program Files\nodejs\node.exe" "C:\CMMSproject\backend\dist\index.js"

REM Start service
nssm start CMMS-API
```

### Step 6: Serve Frontend

**Option A: IIS**

1. Open IIS Manager
2. Add new website, point physical path to `C:\CMMSproject\app\dist`
3. Bind to port 80 or 443
4. Add URL Rewrite rule to proxy `/api/*` requests to `http://localhost:4000/api/*`

**Option B: Static File Server (simple)**

```cmd
cd CMMSproject\app
npm install -g serve
serve dist -l 3000
```

---

## 3. Configuration

### Backend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | Token lifetime (seconds) | 28800 (8h) |
| `PORT` | API server port | 4000 |

### Frontend (.env.local)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | http://localhost:4000/api |

---

## 4. Verification

After installation, verify the application is running:

```cmd
REM Check API health
curl http://localhost:4000/api/health

REM Check API docs
curl http://localhost:4000/api-docs

REM Test login
curl -X POST http://localhost:4000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"password\"}"
```

---

## 5. Backup & Recovery

### Database Backup

```cmd
REM Full backup
pg_dump -U postgres cmms > cmms_backup_YYYYMMDD.sql

REM Restore
psql -U postgres -d cmms < cmms_backup_YYYYMMDD.sql
```

### Application Backup

```cmd
REM Backup entire project directory
xcopy C:\CMMSproject C:\backup\CMMSproject_YYYYMMDD /E /I
```

---

## 6. Maintenance

### Updating the Application

```cmd
REM 1. Pull latest code
git pull

REM 2. Rebuild backend
cd CMMSproject\backend
npm install
npx prisma generate
npx prisma db push
npx tsc

REM 3. Rebuild frontend
cd CMMSproject\app
npm install
npm run build

REM 4. Restart services
pm2 restart cmms-api
```

### Logs

```cmd
REM PM2 logs
pm2 logs cmms-api

REM Application logs are in:
CMMSproject\backend\logs\error.log
CMMSproject\backend\logs\out.log
```

---

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 4000 already in use | Change PORT in backend\.env |
| Port 3000 already in use | Change port in app\vite.config.ts |
| Database connection refused | Check PostgreSQL service is running |
| JWT errors | Regenerate JWT_SECRET in .env |
| Frontend API calls fail | Check VITE_API_URL in .env.local |
| CORS errors | Backend has CORS enabled by default |
