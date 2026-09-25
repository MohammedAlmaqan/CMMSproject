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

1. Download PostgreSQL 15 or later from https://www.postgresql.org/download/windows/
2. Run installer, set postgres password when prompted
3. Add the installed PostgreSQL version's `bin` directory to system PATH
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

### Step 7: Enable HTTPS / TLS (IIS Reverse Proxy)

IIS terminates TLS and forwards plaintext to the Express API on loopback. The API never handles TLS itself, so no certificate configuration belongs in `backend\`.

**Prerequisites** — install both features (Server Manager > Add Features):

| Feature | Purpose |
|---------|---------|
| IIS URL Rewrite | Evaluates the inbound `/api/*` and SPA fallback rules |
| IIS Application Request Routing (ARR) | Proxies matched requests to the Node.js API on `http://localhost:4000` |

After installing ARR, open **IIS Manager > Server > Application Request Routing Cache > Proxy Settings**, tick **Enable proxy**, then set the action to **Rewrite to** `http://localhost:4000/api/*`.

**Test certificate** — for evaluation hosts create a self-signed certificate on the machine. Run PowerShell as Administrator, and replace the subject name if you use a different host:

```powershell
New-SelfSignedCertificate -DnsName "cmms.local" -CertStoreLocation "Cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(5)
```

For production, request a certificate from a public CA instead and never commit certificate files or private keys to this repository.

**Site binding** — create the site in IIS Manager with:

| Setting | Value |
|---------|-------|
| Site name | `cmms.local` |
| Physical path | `C:\CMMSproject\app\dist` (replace with the deployed path) |
| Binding | HTTPS, port 443, host header `cmms.local`, the certificate from the previous step |
| Backend | Node.js API already listening on `http://localhost:4000` |

**URL Rewrite rules** — add the following in IIS Manager under **cmms.local > URL Rewrite**, in this order:

1. Proxy API traffic (match URL `api/(.*)`, action **Rewrite** to `http://localhost:4000/api/{R:1}`).
2. SPA fallback for client-side routes (match URL `.*`, action **Rewrite** to `C:\CMMSproject\app\dist\index.html`, using the same deployed path as the site binding).

The first rule must stay above the second, otherwise every API call is rewritten to `index.html` and returns HTML instead of JSON.

**Forwarded headers** — IIS must tell the app that the original request was HTTPS, so add custom headers on the site: `X-Forwarded-Proto = https` and `X-Forwarded-For = {REMOTE_ADDR}`. Express does not read `req.protocol` today, so no backend change is required; if a future feature needs to build absolute HTTPS URLs, enable Express `trust proxy` at that time rather than now.

**Verify** — open the site over HTTPS and confirm the API is reachable through the proxy:

```cmd
curl -k https://cmms.local/api/health
```

The command must return HTTP 200 with the health payload. `-k` is required only for the self-signed test certificate; drop it once a trusted certificate is installed. Also add `127.0.0.1 cmms.local` to `C:\Windows\System32\drivers\etc\hosts` on the client machine so the name resolves locally.

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

### Automated Database Backup

`scripts\backup.bat` creates a plain SQL dump of the local `cmms` database at `localhost:5432` as `cmms-YYYY-MM-DD-HHmm.sql` under `backups\`. The password is read only from the `PGPASSWORD` environment variable and is never stored in the script or repository.

Run the following from an elevated Command Prompt after provisioning the machine-scoped credential. Replace the placeholder without committing the real value:

```cmd
setx PGPASSWORD "<postgres-password>" /M
```

Close and reopen the Command Prompt or OpenCode host so the new process inherits `PGPASSWORD`; `setx` does not update an already-running process. Do not print the variable. Then run a backup immediately with:

```cmd
cd /d C:\CMMSproject
scripts\backup.bat
```

The supported PostgreSQL server baseline is 15+. The backup script resolves `pg_dump` in this exact order: (1) use the first `pg_dump.exe` found on `PATH`; (2) only when the `PATH` lookup fails, use the local fallback `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`. The fallback identifies this machine's installed client and does not raise the server minimum above 15+.

### Retention Policy

The backup script keeps the newest 14 timestamped dumps and deletes older dumps after each successful backup. With one scheduled run per day, this provides 14 daily generations.

### Daily Schedule

Create a Windows Task Scheduler job that runs every day at 02:00. Replace both placeholders with the installed project path and a dedicated noninteractive service account. The account can read the machine-scoped `PGPASSWORD` and needs write access to the repository backup directory; `schtasks` prompts for that account's password without placing it in this command.

```cmd
set "CMMSPROJECT=C:\CMMSproject"
schtasks /Create /TN "CommandPulse CMMS Daily Backup" /TR "%CMMSPROJECT%\scripts\backup.bat" /SC DAILY /ST 02:00 /RU "BACKUP-SERVICE-ACCOUNT" /RL LIMITED /F
```

### Restore Drill

Run the restore drill periodically and after backup-policy changes:

```cmd
cd /d C:\CMMSproject
scripts\restore-drill.bat
```

The script selects the newest valid timestamped dump, restores it only into the disposable `cmms_restore_test` database, runs `SELECT count(*) FROM "WorkOrder";`, records elapsed restore time, drops the drill database, and verifies that it no longer exists. It never restores over the live `cmms` database.

### Recovery Objectives

- **RPO:** ≤ 24 hours because the database backup runs daily.
- **RTO:** 5.35 seconds measured on 2026-09-25 from drill start through the successful `WorkOrder` count query on the local dataset (84 rows; 306,826-byte dump). Re-run the drill after material database growth or infrastructure changes and update this measurement.

### Application Files

A PostgreSQL dump does not include physical files under `backend\uploads\`. Back up that directory separately with access controls that exclude `.env`, dependency folders, build output, and logs.


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
