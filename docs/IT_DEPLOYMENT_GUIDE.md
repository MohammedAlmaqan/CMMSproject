# CommandPulse CMMS — IT Deployment Guide (v1.6.6)

Audience: the Client's IT team. This document is written for administrators who may
have **no prior experience** with Node.js, PostgreSQL, PM2 or IIS. Every command is
shown verbatim, every step states what "success" looks like, and every command that
needs Administrator rights is flagged. If a step produces output that does not match
the **Expected output** block, stop and read the **Troubleshooting** section
(§12) before continuing.

This guide is derived directly from the shipped artifacts in this handover bundle
(`v1.6.6`; *superseded 2026-10-29: previously v1.6.0 at commit `0c8874e5ccb0b86cc47377012da6f6a2046103fd`*). Where a value is fixed
by the shipped source, the source file and line are cited so a future reviewer can
re-derive it rather than trust this prose.

> **Read this first.** There are two supported deployment shapes. Choose one and
> follow only that section, start to finish:
>
> | Scenario | When to use | Section |
> |---|---|---|
> | **1 — Standard Enterprise Deployment (recommended)** | A central Windows Server that installs Node.js, PostgreSQL, PM2 and IIS normally. Serves any number of client laptops over HTTPS. | §5 |
> | **2 — Zero-Install Portable Server** | A host where IT will **not** allow Node.js or PostgreSQL to be installed globally. Requires a portable bundle that this handover bundle does **not** contain (see §6). | §6 |
>
> This bundle does **not** include a portable `node/` or `postgres/` folder.
> Scenario 2 therefore requires a separate portable bundle to be produced by the
> vendor; §6 states exactly what it must contain and documents the script that would
> drive it. Do not attempt Scenario 2 from this bundle alone.

---

## 1. What is in this bundle

| Directory | Contents | Notes |
|---|---|---|
| `frontend/` | `dist/` (the compiled single-page app) and `web.config` (IIS rules) | `dist/` holds `index.html` + three hashed asset files |
| `backend/` | `dist/` (93 compiled `.js` files), `prisma/` (schema + 22 migrations), `ecosystem.config.cjs`, `package.json`, `package-lock.json`, `.env.example` | The compiled API and worker. Source TypeScript is **not** shipped |
| `ops/` | `backup.bat`, `restore-drill.bat`, `build.bat`, `start.bat` | Operational scripts, byte-identical to the vendor's |
| `database/` | `cmms-2026-10-21-0013.sql` and its paired `cmms-2026-10-21-0013-uploads/` folder | A full dump of the operating database **and** the attachment bytes |
| `migration-templates/` | 30 CSV templates, 30 worked examples, `README.md` | For loading further legacy data |
| `docs/` | Installation Guide, User Manual, Admin Guide, API Reference, Architecture, ER Diagram, Data Dictionary, Go-Live Checklist, Migration Runbook, OpenAPI spec, screenshots | Reference material |
| `RELEASE_NOTES.md` | What changed in this release | |
| `SHA256SUMS.txt` | SHA-256 of every file, for integrity checks | See §4 |

---

## 2. Fixed facts this guide relies on

These are the non-negotiable values the shipped code expects. Change them only where
this guide says you may.

| Fact | Value | Where it is fixed |
|---|---|---|
| API default port | `4000` | `backend/src/index.ts:41`, `ecosystem.config.cjs:14` |
| API bind address in production | `127.0.0.1` (loopback) | `ecosystem.config.cjs:15` |
| Reverse-proxied API path | `/api/*` → `http://localhost:4000/api/*` | `frontend/web.config` |
| Frontend API base URL | `/api` (relative) | `app/src/lib/api.ts:1` (`VITE_API_URL \|\| '/api'`) |
| Database name | `cmms` | `ops/backup.bat:9`, `ops/restore-drill.bat:9` |
| PM2 app names | `cmms-api`, `cmms-worker` | `ecosystem.config.cjs:4,29` |
| Migration count in this release | 22 | `backend/prisma/migrations/` |
| Attachment root | `backend/uploads/<EntityType>/<entityId>/` | `ops/backup.bat:88` |

> **The pre-built frontend calls `/api` relatively.** Because `web.config` proxies
> `/api/*` to the local API, the compiled frontend works on **any** host name with
> **no** rebuild and **no** `VITE_API_URL` setting. Do **not** rebuild the frontend
> merely to change the server name — only rebuild if you change the proxy path.

---

## 3. Prerequisites (Scenario 1)

| Software | Version | Purpose | Check command |
|---|---|---|---|
| Windows Server | 2019 or 2022 | Host OS | `winver` |
| Node.js | **24 LTS** (24.19.0 verified) | Runs the API and worker | `node --version` |
| npm | 9+ (bundled with Node) | Installs backend dependencies | `npm --version` |
| PostgreSQL | **15+** (18.x verified) | Database server | `psql --version` |
| PM2 | Latest | Keeps the two Node processes alive | `pm2 --version` |
| IIS | 10+ | Serves the frontend + reverse proxy | IIS Manager opens |
| IIS URL Rewrite | — | Evaluates the `/api` and SPA rules | see §5.4 |
| IIS ARR | — | Proxies to the Node API | see §5.4 |

**Hardware minimums:** 2 CPU cores, 4 GB RAM, 10 GB free disk. **Recommended:**
4+ cores, 8+ GB RAM, 20+ GB SSD.

---

## 4. Before you begin — prerequisites checklist

Run these once, as Administrator, and confirm each line matches.

```cmd
node --version        REM expect: v24.x.y
npm --version         REM expect: 9.x or 10.x
pm2 --version         REM expect: 5.x or later
psql --version        REM expect: psql (PostgreSQL) 15.x or later
```

**Verify the bundle is intact (recommended).** From the folder that contains
`SHA256SUMS.txt`:

```powershell
Get-Content .\SHA256SUMS.txt | ForEach-Object {
  $h,$p = $_ -split ' {2}',2
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -ne $h) { "MISMATCH: $p" }
}
'Integrity check complete - any MISMATCH lines above must be resolved before deploying'
```

Expected output:

```
Integrity check complete - any MISMATCH lines above must be resolved before deploying
```

If any `MISMATCH:` line prints, **do not deploy** — re-copy the bundle.

---

## 5. Scenario 1 — Standard Enterprise Deployment (recommended)

### 5.1 Decide the deployment folder

This guide uses `C:\CMMS` as the **install root**. Replace it with your own path, but
be consistent: the path is referenced by IIS, PM2 and the backup scheduled task.

1. Create the folder:

```cmd
mkdir C:\CMMS
```

2. Copy the **contents** of the bundle into it so you end up with:

```
C:\CMMS\backend\
C:\CMMS\frontend\
C:\CMMS\database\
C:\CMMS\ops\
C:\CMMS\migration-templates\
C:\CMMS\docs\
C:\CMMS\RELEASE_MANIFEST.md
C:\CMMS\RELEASE_NOTES.md
C:\CMMS\SHA256SUMS.txt
```

> Keep the bundle's `frontend/` and `backend/` folders as shipped. The install
> procedure below treats `frontend/` as the site root and `backend/` as the app root.

### 5.2 Install Node.js, PostgreSQL, PM2

**Node.js** — download the 24 LTS installer from <https://nodejs.org/> and run it
with the default options. Verify: `node --version` → `v24.x.y`.

**PostgreSQL** — download 15+ from
<https://www.postgresql.org/download/windows/>, run the installer, and **write down
the `postgres` superuser password** you set (you will need it three times below).
Add PostgreSQL's `bin` directory to the system `PATH`:

```
C:\Program Files\PostgreSQL\18\bin
```

Verify: `psql --version` → `psql (PostgreSQL) 15.x` or later.

**PM2** — install globally:

```cmd
npm install -g pm2
```

Verify: `pm2 --version` → a version number, no error.

### 5.3 Create the database

PostgreSQL 18 was verified on the reference host; the SQL dump is a plain-text dump
that restores into any PostgreSQL **15+** server.

```cmd
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE cmms;"
```

Expected output:

```
CREATE DATABASE
```

### 5.4 Configure the backend `.env`

1. Copy the template:

```cmd
cd /d C:\CMMS\backend
copy .env.example .env
```

2. Open `C:\CMMS\backend\.env` in Notepad and set these values. The complete file
   should look like the block below — this is the **supported production shape**:

```ini
# Database connection. Replace <PGPASSWORD> with the postgres password you set.
DATABASE_URL="postgresql://postgres:<PGPASSWORD>@localhost:5432/cmms?connection_limit=20&pool_timeout=30000"

# JWT signing secret. MUST be replaced with a long random string (see step 3).
JWT_SECRET="<PASTE-A-LONG-RANDOM-SECRET-HERE>"

# Session / token lifetimes (seconds and milliseconds). Defaults are production-safe.
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=28800
SESSION_IDLE_MS=1800000

# Server
PORT=4000

# Allowed browser origins (comma-separated). Behind IIS the browser talks to
# https://cmms.local, so list that exact origin.
CORS_ORIGINS=https://cmms.local

# Logging
LOG_LEVEL=info

# Bind to loopback: port 4000 must not be reachable from the network.
BIND_HOST=127.0.0.1

# Preventive-maintenance scheduler cron (02:00 daily by default).
PM_SCHEDULER_CRON=0 2 * * *
```

3. **Generate a real `JWT_SECRET`.** Do not keep the placeholder. On the server:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Copy the printed 64-character string into `JWT_SECRET` (keep the quotes).

> **How `.env` is actually loaded (important).** The application does **not** use
> Node's `--env-file` flag and there is no `dotenv` call in the source. Prisma Client
> loads `backend/.env` into the process environment as a side effect of
> `new PrismaClient()` in `backend/src/utils/prisma.ts`, which is imported before any
> code reads `JWT_SECRET`. This works, but it means **`backend/.env` must be present
> in the folder PM2 starts the app from** (`C:\CMMS\backend`). If `JWT_SECRET` is
> missing, the API refuses to start (see §12, "JWT errors"). Keep `.env` in
> `C:\CMMS\backend` and never delete it.

4. **Install dependencies and generate the Prisma client:**

```cmd
cd /d C:\CMMS\backend
npm ci
npx prisma generate
```

Expected output (abridged):

```
added <n> packages ...
✔ Generated Prisma Client (v6.x.x) ...
```

> Use `npm ci` (not `npm install`) so the exact versions in `package-lock.json` are
> used. `npm ci` requires `package-lock.json`, which the bundle ships.

5. **Apply the database schema:**

```cmd
npx prisma migrate deploy
```

Expected output (abridged):

```
22 migrations found in prisma/migrations
Applying migration `20260924142537_init_baseline`
...
All migrations have been successfully applied.
```

> Note the **22 migrations**. A different count means you are not deploying the release this guide describes.

### 5.5 Load the data (restore the dump) — only if migrating from the operating site

Skip this step for a **fresh empty** install. Do **not** skip it if this server is
replacing the machine that currently runs CommandPulse, because the dump *is* the
live data.

> **The dump is plain SQL** (`pg_dump` without `-Fc`). Restore it with `psql -f`.
> **Never** use `pg_restore` on it.

```cmd
cd /d C:\CMMS
psql -U postgres -h localhost -p 5432 -d cmms -v ON_ERROR_STOP=1 -f database\cmms-2026-10-21-0013.sql
```

Expected output (abridged): a stream of `CREATE TABLE`, `COPY <n>`, `ALTER TABLE`
lines, ending with no `ERROR:` line. At the prompt an error stops the restore; if one
appears, note the table named and report it before retrying.

**Restore the attachment bytes too — both halves are required.** A SQL dump contains
only `Attachment.storagePath` (a relative pointer). The file bytes live in the paired
folder and must be copied into `backend\uploads`:

```cmd
mkdir C:\CMMS\backend\uploads
robocopy "C:\CMMS\database\cmms-2026-10-21-0013-uploads" "C:\CMMS\backend\uploads" /E
```

Expected output: `robocopy` prints a summary ending `Ended : ...` with `Dirs`, `Files`
counts and `0` failures. **Restoring the SQL without the uploads folder leaves every
attachment download returning "not found".**

### 5.6 Start the API and the scheduler worker with PM2

The backend is **two** processes: the API (`dist/index.js`) and the scheduler worker
(`dist/worker.js`). `ecosystem.config.cjs` defines both, so one command starts both.

```cmd
cd /d C:\CMMS\backend
pm2 start ecosystem.config.cjs
pm2 save
```

Expected output (abridged):

```
[PM2] Applying action restartProcessId on app [cmms-api]...
[PM2] [cmms-api](0) ✓
[PM2] [cmms-worker](1) ✓
```

Confirm both are **online**:

```cmd
pm2 list
```

Expected: a table with two rows, `cmms-api` and `cmms-worker`, both `status = online`.

```cmd
pm2 describe cmms-api
```

Look for the line `running` / `online` and the script path
`C:\CMMS\backend\dist\index.js`.

**Autostart after reboot (Windows).** `pm2 startup` is a Linux-only command and
**fails on Windows** with `Error: Init system not found` — do not run it. Instead,
register a Scheduled Task that runs `pm2 resurrect` at logon:

```cmd
schtasks /Create /TN "CommandPulse CMMS PM2 Resurrect" /TR "cmd /c pm2 resurrect" /SC ONLOGON /RL HIGHEST /F
```

> The task runs in the logon user's context, so it must run as the account that owns
> the PM2 home directory. On a shared server, register it for a dedicated account and
> confirm that account can reach `pm2`. Per-user PM2 daemons do **not** share apps.

### 5.7 Serve the frontend through IIS

#### 5.7.1 Install the two IIS features (Server Manager > Add Roles and Features)

| Feature | Why |
|---|---|
| IIS URL Rewrite | Evaluates the `/api` and SPA-fallback rules in `web.config` |
| IIS Application Request Routing (ARR) | Proxies matched requests to `http://localhost:4000` |

After installing ARR, open **IIS Manager → (server) → Application Request Routing
Cache → Server Proxy Settings** and tick **Enable proxy**; apply.

#### 5.7.2 Create the site

In IIS Manager: **Sites → Add Website**, with:

| Setting | Value |
|---|---|
| Site name | `cmms` (any label) |
| Physical path | `C:\CMMS\frontend` (this is the folder containing `dist\` and `web.config`) |
| Binding | HTTPS, port 443, host header `cmms.local`, your certificate |

`web.config` (shipped in `frontend\`) already contains both rules:

1. Proxy: `^api/(.*)` → `http://localhost:4000/api/{R:1}`
2. SPA fallback: everything that is not a real file → `/index.html`

> **The rules must stay in that order** (proxy first). The shipped `web.config` is
> already correct; do not reorder the rules. Do not delete `web.config`.
>
> **`frontend\dist\` vs `frontend\`.** Point IIS at `frontend\`, **not**
> `frontend\dist\`. `web.config` lives at `frontend\web.config` and its SPA fallback
> serves `index.html` from the site root; the built files `index.html` and `assets\`
> sit beside `web.config` in the bundle. *(If you instead deploy only the `dist`
> folder, copy `web.config` into it first.)*

#### 5.7.3 Certificate and name resolution

For a **test/evaluation** host, create a self-signed certificate (Administrator):

```powershell
New-SelfSignedCertificate -DnsName "cmms.local" -CertStoreLocation "Cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(5)
```

For production, use a certificate from a public CA instead. **Never** commit
certificate files or private keys to the repository.

Add the host name to the client's `hosts` file so it resolves locally:

```
127.0.0.1   cmms.local
```

(`C:\Windows\System32\drivers\etc\hosts`, opened as Administrator.)

### 5.8 Firewall

Block inbound TCP 4000 from the network and leave 443 open (Administrator):

```powershell
New-NetFirewallRule -DisplayName "CMMS API 4000 block external" -Direction Inbound -Action Block -Protocol TCP -LocalPort 4000 -RemoteAddress Any -Profile Any
```

Verify:

```powershell
Get-NetFirewallRule -DisplayName "CMMS API 4000*" | Get-NetFirewallPortFilter
```

> Windows Firewall does **not** filter loopback traffic, so blocking 4000 inbound does
> **not** break the IIS→API path on `127.0.0.1:4000`. Do **not** add an `-Action Allow`
> rule scoped to loopback IPv6: `New-NetFirewallRule` rejects the `::1` literal with
> `0x80070057`, and even a corrected allow rule cannot re-open loopback because block
> rules win.

### 5.9 First-run verification (Scenario 1)

```cmd
REM 1. API answers directly on loopback
curl http://localhost:4000/api/health

REM 2. API docs are served
curl http://localhost:4000/api-docs

REM 3. Through IIS over HTTPS (drop -k once a trusted cert is installed)
curl -k https://cmms.local/api/health
```

Expected output for step 1 and 3:

```json
{"status":"ok","timestamp":"2026-10-21T00:32:51.134Z"}
```

Then open `https://cmms.local/` in a browser and sign in with a real account from the
restored data. **A successful sign-in means the full chain (IIS → proxy → API →
database) is working.**

> **Do not use the demo accounts** `admin` / `planner` / `tech1` / `password` on a
> site restored from live data — those belong to the vendor's demo dataset. Use the
> accounts present in *your* restored `User` table.

---

## 6. Scenario 2 — Zero-Install Portable Server

> **This bundle does not contain a portable runtime.** There is no `node/` and
> no `postgres/` folder inside it, and no `Start-Server.bat`. Scenario 2 can only be
> run from a **separate portable bundle** that the vendor must build. The draft this
> guide was expanded from described this scenario as if it were ready; it is not.
> Everything below specifies what that bundle must contain and how to drive it, so the
> requirement is unambiguous rather than implied.

A portable bundle must add, alongside the same `backend/`, `frontend/`, `database/`,
`ops/` and `docs/` folders:

```
portable\
  node\            <- extracted Node.js 24 win-x64 ZIP (node.exe)
  postgres\        <- extracted PostgreSQL 15+ win-x64 ZIP (bin\, data\)
  data\            <- portable PostgreSQL data directory (initialised on first run)
  Start-Server.bat <- starts Postgres, then the API, then a static frontend server
  Stop-Server.bat  <- stops them
```

`Start-Server.bat` must, in order:

1. Initialise/start portable PostgreSQL from `portable\postgres\data` on port 5432
   (using `portable\postgres\bin\pg_ctl.exe`).
2. Create the `cmms` database if absent and restore `database\*.sql` (+ the
   `-uploads` folder to `backend\uploads`) on first run.
3. Start the API: `portable\node\node.exe backend\dist\index.js` with
   `BIND_HOST=0.0.0.0` (no IIS in this topology) and `DATABASE_URL` pointing at the
   portable Postgres.
4. Start a static server for `frontend\dist` on port 3000 **with SPA fallback and an
   `/api` proxy to `http://localhost:4000`** — a plain static server that lacks these
   two behaviours will show a blank page on refresh and fail all API calls.

Firewall for portable mode (Administrator):

```powershell
New-NetFirewallRule -DisplayName "CMMS Portable Frontend 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
New-NetFirewallRule -DisplayName "CMMS Portable API 4000"      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000
```

> **Portable mode has no reverse proxy, so `BIND_HOST=0.0.0.0` is required** — the API
> must accept connections from the laptops. This is a deliberate security trade-off:
> the API is directly reachable, and because it sets `trust proxy = 1`, a client that
> can reach port 4000 can forge `X-Forwarded-For` and weaken the login rate limiter.
> Portable mode is acceptable **only** on a trusted, firewalled LAN. Prefer Scenario 1
> for anything internet-facing.

---

## 7. Environment configuration reference (audited)

This table is the **authoritative** list of environment variables the shipped code
reads, with the file and behaviour for each.

### 7.1 Backend — `backend\.env`

| Variable | Required? | Default if unset | Read at | Effect |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | none — Prisma fails | Prisma schema `env("DATABASE_URL")` | PostgreSQL connection string. Add `?connection_limit=20&pool_timeout=30000` |
| `JWT_SECRET` | **Yes** | none — **process refuses to start** | `backend/src/utils/config.ts:1` | Signs access tokens |
| `ACCESS_TOKEN_TTL` | No | `900` (15 min) | `config.ts:16` | Access-token lifetime, seconds |
| `JWT_EXPIRES_IN` | No | — | `config.ts:18` | **Legacy alias** for `ACCESS_TOKEN_TTL`, honoured only if `ACCESS_TOKEN_TTL` is unset |
| `REFRESH_TOKEN_TTL` | No | `28800` (8 h) | `config.ts:23` | Absolute session lifetime, seconds |
| `SESSION_IDLE_MS` | No | `1800000` (30 min) | `config.ts:28` | Server-side idle window, **milliseconds** |
| `PORT` | No | `4000` | `index.ts:41` | API listen port |
| `CORS_ORIGINS` | No | `http://localhost:3000` | `index.ts:50` | Comma-separated allowed origins. **Set to your real site origin** |
| `LOG_LEVEL` | No | `info` | logger | `debug`/`trace` for detail |
| `BIND_HOST` | No | `127.0.0.1` (*corrected v1.6.6 from v1.6.0*) | `index.ts:48` | Interface to listen on. `127.0.0.1` behind IIS |
| `PM_SCHEDULER_CRON` | No | `0 2 * * *` | worker | PM scheduler cadence |
| `OVERDUE_SWEEP_CRON` | No | `0 3 * * *` | worker | Daily overdue sweep |
| `AUDIT_RETENTION_CRON` | No | `0 4 * * *` | worker | Audit-row purge |
| `K6_MODE` | No | unset | `index.ts:58` | **Test only.** Raises login limit; inert unless `NODE_ENV != production`. Never set in production |

### 7.2 Frontend — `app\.env.local` (only if you rebuild)

| Variable | Default | Read at | Effect |
|---|---|---|---|
| `VITE_API_URL` | `/api` | `app/src/lib/api.ts:1` and three sibling services | API base URL baked into the build |

> **Deploying the shipped `frontend\dist` requires no frontend `.env`.** The default
> `/api` is already baked in, and `web.config` proxies it.

### 7.3 Findings from the environment audit

The audit compared all three env files against the code and found the following.
Each is either corrected in this guide or flagged for the vendor.

1. **The deployed `backend\.env` on the reference host is stale and incomplete.**
   It still carries the legacy `JWT_EXPIRES_IN` and is **missing** `CORS_ORIGINS`,
   `BIND_HOST`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `SESSION_IDLE_MS` and
   `PM_SCHEDULER_CRON`. The API works there **only** because `ecosystem.config.cjs`
   supplies `BIND_HOST` and `PORT` in its `env` block. A plain `node dist\index.js`
   (or a manual PM2 start without the ecosystem file) on that host would bind
   `0.0.0.0` and expose port 4000. **This guide's §5.4 gives the complete file.**
2. **`.env.example` ships `BIND_HOST=0.0.0.0`, which is not a safe production value.**
   The file's own comment says so. §5.4 sets `127.0.0.1`.
3. **`.env.example` sets `CORS_ORIGINS=http://localhost:3000`.** Behind IIS the browser
   origin is `https://cmms.local`; leaving the default causes the browser to reject the
   API responses. §5.4 sets the real origin. *(Same-origin `/api` calls through the
   proxy are not affected by CORS, but any direct cross-origin call is.)*
4. **`SESSION_IDLE_MS` and the TTLs are milliseconds/seconds respectively** — mixing
   them up silently breaks sessions. Values are annotated in the table above.
5. **No `dotenv` usage and no `--env-file`.** Several older docs claim `.env` is read
   via Node's `--env-file` flag. It is not: loading happens through Prisma's bundled
   `.env` reader at `new PrismaClient()`. Practical consequence: **`backend\.env` must
   sit in the PM2 working directory**, or `JWT_SECRET` is undefined and the API will
   not boot. This is flagged as item 1 in §13.
6. **No production `DATABASE_URL` or `JWT_SECRET` is hardcoded anywhere in the bundle.**
   Verified: the only credential-looking string in the shipped `frontend\dist` bundle
   is `admin`/`password` in nothing — the frontend has no secrets. `backend\dist` reads
   both from the environment only.
7. **The frontend bundle is secret-free and host-independent** (relative `/api`), so it
   can be redeployed under any host name without a rebuild.

---

## 8. Operating the deployment

### 8.1 Common PM2 commands

```cmd
pm2 list                       REM both apps and their status
pm2 logs                       REM stream both logs
pm2 logs cmms-api              REM API only
pm2 restart cmms-api cmms-worker
pm2 stop ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 delete ecosystem.config.cjs
pm2 save                       REM persist the current process list
```

Log files (per `ecosystem.config.cjs`):

```
C:\CMMS\backend\logs\api-out.log
C:\CMMS\backend\logs\api-err.log
C:\CMMS\backend\logs\worker-out.log
C:\CMMS\backend\logs\worker-err.log
```

The worker's `[scheduler] ...` lines appear **only** in the worker logs.

### 8.2 Log rotation (`pm2-logrotate`)

PM2 writes to disk forever unless rotation is configured. Install once per host:

```cmd
npm install -g pm2-logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:rotationInterval daily
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm
pm2 list
pm2 conf pm2-logrotate:retain
```

### 8.3 Backups (`ops\backup.bat`)

The backup produces a plain SQL dump **and** a matching attachment snapshot.

1. Provision the database password as a **machine-scoped** variable so the scheduled
   task can read it (Administrator). **Do not print it, do not commit it:**

```cmd
setx PGPASSWORD "<postgres-password>" /M
```

Close and reopen the command prompt so the new value is inherited.

2. Run a manual backup:

```cmd
cd /d C:\CMMS
ops\backup.bat
```

Expected output (abridged):

```
Creating backup: C:\CMMS\backups\cmms-2026-10-21-0013.sql
Attachment snapshot: C:\CMMS\backups\cmms-2026-10-21-0013-uploads (227 file(s))
Backup completed successfully.
File: C:\CMMS\backups\cmms-2026-10-21-0013.sql
Size: 9305515 bytes
Attachments: OK, 227 file(s)
Retention: newest 14 dumps + newest 14 attachment snapshots
```

3. Schedule it daily at 02:00:

```cmd
schtasks /Create /TN "CommandPulse CMMS Daily Backup" /TR "C:\CMMS\ops\backup.bat" /SC DAILY /ST 02:00 /RU "<service-account>" /RL LIMITED /F
```

> On a **laptop**, clear the power conditions, or the task stays *Queued* on battery:
> `DisallowStartIfOnBatteries=false`, `StopIfGoingOnBatteries=false`,
> `StartWhenAvailable=true`. On a shared server, use a dedicated non-interactive
> account that can read `PGPASSWORD` and write `C:\CMMS\backups`.

### 8.4 Restore drill (`ops\restore-drill.bat`)

Run periodically (not as a substitute for backups):

```cmd
cd /d C:\CMMS
ops\restore-drill.bat
```

It restores the newest dump **into a throwaway `cmms_restore_test` database only**,
runs `SELECT count(*) FROM "WorkOrder";`, restores and reads back the attachment
snapshot, rebuilds and restarts the backend, checks `/api/health`, then drops the drill
database. **It never touches the live `cmms` database.** Expected final line:

```
PASS: dump restored, WorkOrder query succeeded, attachment store restored and read back, backend rebuilt and serving /api/health, drill database dropped.
```

### 8.5 Updating to a future patch bundle

```cmd
pm2 stop ecosystem.config.cjs
REM 1. Replace backend\dist, frontend\dist and frontend\web.config from the new bundle
REM 2. If the patch ships new migrations:
cd /d C:\CMMS\backend
npx prisma migrate deploy
pm2 start ecosystem.config.cjs
pm2 save
```

**Do not mix files from two bundle versions.** Never rebuild the frontend just to
change a server name.

---

## 9. Expected "success" outputs at a glance

| Check | Command | Success looks like |
|---|---|---|
| Node | `node --version` | `v24.x.y` |
| Postgres | `psql --version` | `psql (PostgreSQL) 15+` |
| PM2 running | `pm2 list` | `cmms-api`, `cmms-worker` both `online` |
| API direct | `curl http://localhost:4000/api/health` | `{"status":"ok",...}` |
| API via IIS | `curl -k https://cmms.local/api/health` | `{"status":"ok",...}` |
| Site | browser `https://cmms.local/` | login page, then dashboard after sign-in |
| Migrations | `npx prisma migrate deploy` | `22 migrations ... successfully applied` |
| Backup | `ops\backup.bat` | `Backup completed successfully.` |
| Restore drill | `ops\restore-drill.bat` | `PASS: dump restored, ...` |

---

## 10. Security notes

- **`BIND_HOST=127.0.0.1`** (Scenario 1) keeps port 4000 off the network even though
  the API itself sets `trust proxy = 1`. Without it, a client that reaches 4000
  directly can forge `X-Forwarded-For` and defeat the login rate limiter.
- **`CORS_ORIGINS`** must list the exact browser origin (`https://cmms.local`).
- **`JWT_SECRET`** must be long and random; the app refuses to start without it.
- **ARR must overwrite `X-Forwarded-For`, not append to it.** With exactly one trusted
  hop, an appending proxy lets a client prepend a forged value.
- **Never** set `K6_MODE` in production.
- **Never** commit `.env`, certificates or private keys.
- The **demo** accounts (`admin`/`password`, etc.) are for the vendor's demo dataset
  only; a site restored from live data uses the accounts in its own `User` table.

---

## 11. Migration templates (loading more legacy data)

`migration-templates\` holds one CSV per importable table plus worked examples. The
authoritative fill order (parents before children) is in
`migration-templates\README.md`; the loader is the vendor's trial-run harness. These
templates are a **specification**, not an import tool — the Client fills them and the
vendor runs the import. This bundle does not ship the importer source.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `JWT_SECRET environment variable is required` and the API exits | `.env` missing or not in the PM2 working directory | Ensure `C:\CMMS\backend\.env` exists with `JWT_SECRET` set; `pm2 restart` from `C:\CMMS\backend` |
| Site loads but every API call returns HTML | `web.config` rules missing or reordered | Restore the shipped `web.config`; the `api/` rule must come **before** the SPA rule |
| `502`/`Bad Gateway` from IIS | ARR proxy not enabled, or API not on 4000 | Enable proxy in ARR Cache settings; `pm2 list` shows `cmms-api` online; `curl http://localhost:4000/api/health` |
| API works on `localhost` but not via `https://cmms.local` | `cmms.local` not resolving, or cert binding wrong | Add `127.0.0.1 cmms.local` to `hosts`; check the 443 binding |
| CORS error in the browser console | `CORS_ORIGINS` does not include the site origin | Set `CORS_ORIGINS=https://cmms.local`; `pm2 restart cmms-api` |
| Login "Too many requests" | 20 attempts / 15 min per IP reached | Wait 15 minutes. Do **not** set `K6_MODE` in production |
| Attachments return "not found" after restore | `-uploads` folder was not copied | Copy `database\cmms-...-uploads\` into `backend\uploads\` |
| Port 4000 already in use | Another process holds it | `netstat -ano \| findstr :4000`, then `taskkill /PID <pid> /F`; or change `PORT` in `.env` |
| `npx prisma migrate deploy` says "already applied" | DB already at this release's schema | Normal on re-run; no action |
| Backup says `PGPASSWORD must be set` | Machine variable not visible to the process | Re-open the shell after `setx PGPASSWORD ... /M` |

---

## 13. Open items for the vendor (found during this audit)

These do not block deployment; each is recorded so it is not lost.

1. **Older documentation states `.env` is loaded via Node's `--env-file` flag.** It is
   loaded by Prisma's bundled `.env` reader instead. This guide documents the actual
   behaviour; the older wording in `docs\INSTALLATION_GUIDE.md` should be reconciled
   in a future bundle.
2. **The reference host's deployed `backend\.env` is stale** (see §7.3 item 1). It
   relies on `ecosystem.config.cjs` for `BIND_HOST`/`PORT`, which is correct but means
   the `.env` alone is not a complete production config. §5.4 gives the complete file.

---

*End of guide.* This file is maintained at `docs/IT_DEPLOYMENT_GUIDE.md` in the repository and ships in every handover bundle. *Superseded wording, kept: "This file ships only inside the handover bundle and is not committed to the application source repository" — true until it was added to the repository at `f773294` (2026-10-29).*
