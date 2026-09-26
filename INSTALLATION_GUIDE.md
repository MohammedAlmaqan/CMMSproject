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
npx prisma migrate deploy
npx tsc
scripts\seed-demo.bat

REM Frontend
cd CMMSproject\app
copy .env.example .env.local
REM Edit .env.local if API URL differs
npm install
npm run build
```

`scripts\seed-demo.bat` populates demo data and refuses to run against a
production database. It sets the `SEED_DEMO` guard variable itself, so
there is no need to export anything first. To start with an empty
database instead, skip that line.

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

**Bind the API to loopback first.** The API sets `trust proxy = 1`, which makes it trust one hop of `X-Forwarded-For`. That is correct behind a proxy, but it also means any client that can reach port 4000 *directly* can forge that header and defeat the login rate limiter entirely. Binding to loopback removes the direct route. Before starting the API behind IIS, set this in `backend\.env`:

```ini
# Use 127.0.0.1 so port 4000 is not externally reachable. Leave the 0.0.0.0
# default only for direct-access development.
BIND_HOST=127.0.0.1
```

Restart the API after changing it and confirm the startup log records the bind address:

```
CMMS API server running on port 4000 (bound to 127.0.0.1)
```

> Leave `BIND_HOST=0.0.0.0` only for local development with no reverse proxy. It is the default in `.env.example` purely so a fresh dev checkout works without extra steps — it is **not** a safe production value.

**Firewall rule (defense-in-depth)** — even bound to loopback, block inbound TCP 4000 from anywhere but the local host. Run PowerShell as Administrator, replacing the profile names with those in use on the host:

```powershell
New-NetFirewallRule -DisplayName "CMMS API 4000 loopback only" -Direction Inbound -Action Block -Protocol TCP -LocalPort 4000 -RemoteAddress 127.0.0.1,::1 -Profile Any
New-NetFirewallRule -DisplayName "CMMS API 4000 block external" -Direction Inbound -Action Block -Protocol TCP -LocalPort 4000 -RemoteAddress Any -Profile Any
```

The second rule is the important one: it denies inbound 4000 from every non-loopback address, so the port stays unreachable even if `BIND_HOST` is later mis-set or IIS is removed. Verify the effective state with:

```powershell
Get-NetFirewallRule -DisplayName "CMMS API 4000*" | Get-NetFirewallPortFilter
```

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
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API | http://localhost:3000 |
| `LOG_LEVEL` | Pino log level | info |
| `BIND_HOST` | Interface the API listens on | 0.0.0.0 |
| `PM_SCHEDULER_CRON` | Cron expression driving the PM scheduler | 0 2 * * * |

These eight are every variable the API reads, and they match
`backend\.env.example` line for line. `backend\.env` is loaded by Node's own
`--env-file` flag at launch rather than by a dotenv library, so a missing
variable silently falls back to its default, except `JWT_SECRET`, which
fails fast rather than starting insecurely.

`BIND_HOST` and `PM_SCHEDULER_CRON` need care on a server. See
[Enabling HTTPS / TLS](#step-7-enable-https--tls-iis-reverse-proxy) before
exposing the API, and confirm your ARR rewrite overwrites `X-Forwarded-For`
rather than appending to it.

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

### Application Files (attachments)

A PostgreSQL dump contains only `Attachment.storagePath` — a relative pointer. The attachment **bytes** live on disk under `backend\uploads\<EntityType>\<entityId>\`, so a SQL dump alone cannot restore them.

`scripts\backup.bat` therefore snapshots that directory in the same run, immediately after the SQL dump is finalised, into a folder whose name pairs with the dump:

```
backups\cmms-2026-09-25-0200.sql            <- SQL
backups\cmms-2026-09-25-0200-uploads\       <- matching attachment snapshot
```

The snapshot is produced with `xcopy /I /E /Y` and is subject to the same 14-generation retention, so the two always age out together. If `backend\uploads\` does not yet exist (nothing has ever been uploaded), the snapshot is skipped with a notice and the SQL backup still succeeds. An `xcopy` failure is fatal: the script reports the error and exits non-zero rather than leaving a dump that silently implies its attachments are safe.

> **Restoring onto a fresh host requires BOTH halves.** Restore the SQL dump **and** the `-uploads` folder with the matching timestamp. Restoring only the SQL leaves every attachment row pointing at a file that is not there, and every download 404s. Copy the `-uploads` folder to `backend\uploads\` on the target host before starting the API.

### Retention Policy

The backup script keeps the newest 14 timestamped dumps and the newest 14 `-uploads` snapshots, deleting older ones after each successful backup. With one scheduled run per day, this provides 14 daily generations of each.

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

It also asserts the paired attachment snapshot. After the `WorkOrder` query it measures file counts in the `-uploads` folder belonging to the same timestamp and in the live `backend\uploads\` tree. If attachments exist live but the paired snapshot is missing or empty, the drill **fails** — a green SQL restore is not evidence that the backup is complete. A dataset with no attachments at all passes with an explicit "nothing to assert" note, so fresh installs do not report a false red.

### Recovery Objectives

- **RPO:** ≤ 24 hours because the database backup runs daily.
- **RTO:** 5.35 seconds measured on 2026-09-25 from drill start through the successful `WorkOrder` count query on the local dataset (84 rows; 306,826-byte dump). Re-run the drill after material database growth or infrastructure changes and update this measurement.

### Application Files

See [Application Files (attachments)](#application-files-attachments) above — attachment snapshots are now produced automatically by `scripts\backup.bat` and verified by the restore drill.


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
npx prisma migrate deploy
npx tsc

REM 3. Rebuild frontend
cd CMMSproject\app
npm install
npm run build

REM 4. Restart services
pm2 restart cmms-api
```

### Logs

The API logs structured JSON. Every access line carries the HTTP method, full path, response status, duration in milliseconds, and the acting `userId` when the request was authenticated:

```json
{"level":30,"time":"2026-09-25T15:52:06.797Z","service":"cmms-api","req":{"method":"GET","path":"/api/failure-codes"},"userId":"7b1fcaa3-76e5-4489-850a-5f7f9fd2b081","res":{"status":200},"responseTime":14,"msg":"GET /api/failure-codes 200"}
```

Levels are `info` (30) for 2xx, `warn` (40) for 4xx, and `error` (50) for 5xx. Application code uses the shared `backend\src\utils\logger.ts` instance instead of `console.*`, so the whole stream is machine-parseable. Set `LOG_LEVEL` to `debug` or `trace` for more detail; it defaults to `info` and an unrecognised value falls back to `info` rather than failing to boot. Authorization headers, cookies, and password fields are redacted before a line is written, and query strings are dropped from the logged path, so tokens must never be passed in a URL.

```cmd
REM Stream logs
pm2 logs cmms-api

REM Application logs are in:
CMMSproject\backend\logs\api-out.log
CMMSproject\backend\logs\api-err.log
```

`ecosystem.config.cjs` sets `merge_logs: true`, so PM2 keeps one combined stream; `api-err.log` only receives entries PM2 itself routes to stderr (for example, crashes before the logger is ready).

### Log Rotation (pm2-logrotate)

PM2 writes to disk forever unless rotation is configured, so install `pm2-logrotate` once per host and keep it running alongside PM2:

```cmd
cd C:\CMMSproject\backend
npm install -g pm2-logrotate
pm2 install pm2-logrotate
```

Configure it to rotate daily, retain 14 generations, cap each file at 10 MB, and gzip archives:

```cmd
pm2 set pm2-logrotate:rotationInterval daily
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm
```

The retained archives land next to the live file as `api-out.log.YYYY-MM-DD_HH-mm.gz` and are pruned to the newest 14. Confirm the module is attached and check the schedule with:

```cmd
pm2 list
pm2 conf pm2-logrotate:retain
```

Rotate on size as well as on schedule, since a burst of traffic can exceed 10 MB inside a single day. `pm2 set pm2-logrotate:max_size 10M` is evaluated continuously by the module, so the daily interval and the size cap apply together.

---

## 7. Load Testing (k6)

### Install the k6 portable binary

k6 is not required on the server. Download the portable Windows archive, extract the single executable into `scripts\k6\`, and invoke it by path. **Do not add it to `PATH`** and do not run the installer.

| Item | Value |
|------|-------|
| Download URL (k6 v2.3.0) | `https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-windows-amd64.zip` |
| Extracted binary | `scripts\k6\k6.exe` |
| Latest release index | `https://github.com/grafana/k6/releases/latest` |

```powershell
cd C:\CMMSproject
Invoke-WebRequest -Uri "https://github.com/grafana/k6/releases/download/v2.3.0/k6-v2.3.0-windows-amd64.zip" -OutFile "$env:TEMP\k6.zip"
Expand-Archive -LiteralPath "$env:TEMP\k6.zip" -DestinationPath "scripts\k6" -Force
Move-Item "scripts\k6\k6-v2.3.0-windows-amd64\k6.exe" "scripts\k6\k6.exe" -Force
Remove-Item "scripts\k6\k6-v2.3.0-windows-amd64" -Recurse -Force
scripts\k6\k6.exe version
```

`k6.exe` is about 67 MB and is deliberately listed in `.gitignore`; only `scripts\k6\smoke.js` is version-controlled.

### K6_MODE login rate-limit override

The login endpoint allows 20 attempts per 15 minutes per source IP, which a 50-VU run would trip immediately. Setting `K6_MODE=1` raises that ceiling to 200 per 15 minutes:

```cmd
cd C:\CMMSproject\backend
set K6_MODE=1
node --env-file=.env dist\index.js
```

The override requires `NODE_ENV !== 'production'`; setting `K6_MODE=1` on a production host has no effect. It activates only when `K6_MODE` is exactly `1` **and** `NODE_ENV` is not `production`; on a production host the limit stays at 20 regardless. **Never set `K6_MODE` on a production host** — it weakens brute-force protection that the account lockout depends on. Remove it with `set K6_MODE=` when finished.

### Run the smoke test

```cmd
cd C:\CMMSproject
scripts\k6\k6.exe run scripts\k6\smoke.js
```

The script drives 50 VUs through a 2-minute ramp, 5 minutes at steady state, and a 1-minute ramp-down, exercising login → `GET /api/work-orders?take=10` → `GET /api/work-orders/:id`. Each VU signs in once and then loops the read path; signing in on every iteration would exceed even the 200/15min ceiling. There is no server-side logout endpoint because access tokens are stateless JWTs, so the session ends client-side in `teardown()`. Override the target and credentials with `BASE_URL`, `CMMS_USER`, `CMMS_PASS`, and `THINK_TIME`.

Thresholds that fail the run: `http_req_duration{scenario:steady}` p95 must stay under 2000 ms, and `http_req_failed` must stay under 1%.

### Scope: this is not the SOW §4.1 capacity proof

SOW §4.1 requires the system to support **200 concurrent users**. That requirement is **deferred to post-go-live** and is not demonstrated by this test. The 50-VU run is a smoke sanity check that the main authenticated read path stays healthy and responsive against a single local backend; it is not a capacity or saturation measurement, and its numbers must not be quoted as evidence for the 200-user clause. Closing the §4.1 gap requires a production-like environment and a separate capacity exercise.

---

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 4000 already in use | Change PORT in backend\.env |
| Port 3000 already in use | Change port in app\vite.config.ts |
| Database connection refused | Check PostgreSQL service is running |
| JWT errors | Regenerate JWT_SECRET in .env |
| Frontend API calls fail | Check VITE_API_URL in .env.local |
| CORS errors | Backend has CORS enabled by default |
