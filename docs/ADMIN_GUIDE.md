# CommandPulse CMMS - Administrator Guide

Audience: IT staff, database administrators, and operations staff responsible for deploying, configuring, and running CommandPulse CMMS.

Scope: day-two operations of an **already installed** system - configuration, database administration, user administration, the preventive maintenance scheduler, backup and recovery, audit, and troubleshooting.

For the initial installation itself, see the [Installation & Deployment Guide](../INSTALLATION_GUIDE.md). That document covers hardware sizing, Node.js and PostgreSQL installation, PM2 setup, the IIS reverse proxy, and HTTPS.

**This guide documents what the system does today.** Features that are not implemented are listed in [section 13](#13-deferred-and-not-implemented), not described as if they were available.

Related documents:

- [User Manual](USER_MANUAL.md) - the guide you give to plant users
- [API Reference](API_REFERENCE.md) - all 114 endpoints across 71 paths
- [Architecture](ARCHITECTURE.md) - design decisions and measured performance
- [Handoff](HANDOFF.md) - known open risks carried into production

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Runtime topology and the single-instance rule](#2-runtime-topology-and-the-single-instance-rule)
3. [Configuration](#3-configuration)
4. [Database operations](#4-database-operations)
5. [Scheduler operations](#5-scheduler-operations)
6. [User administration](#6-user-administration)
7. [Backup and recovery](#7-backup-and-recovery)
8. [Audit log](#8-audit-log)
9. [Logs](#9-logs)
10. [Health checks and monitoring](#10-health-checks-and-monitoring)
11. [Load testing](#11-load-testing)
12. [Security posture](#12-security-posture)
13. [Deferred and not implemented](#13-deferred-and-not-implemented)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

| Requirement | Detail |
|---|---|
| Node.js | The version pinned in `backend/package.json`; the installation guide uses the current LTS |
| PostgreSQL | Local server, database `cmms`, role `postgres` - these names are **hardcoded** in the backup scripts, see [7.1](#71-connection-details-are-hardcoded) |
| PostgreSQL client tools | `pg_dump.exe` and `psql.exe` on `PATH`, or at `C:\Program Files\PostgreSQL\18\bin\` |
| Process manager | PM2 (recommended) or NSSM Windows services |
| Reverse proxy | IIS with the ARR module, for HTTPS termination |
| Disk | Enough space for the `backups\` folder to hold 14 daily dumps plus 14 attachment snapshots, and for `backend\uploads\` |

---

## 2. Runtime topology and the single-instance rule

The deployment has three processes:

| Process | Default port | Serves |
|---|---|---|
| Backend API (`backend/dist/index.js`) | `4000` | JSON API, interactive API docs at `/api-docs`, OpenAPI JSON at `/api-docs.json` |
| Frontend (built `app/dist` served by IIS) | `443` via IIS | The web application |
| PostgreSQL | `5432` | All data |

**The frontend and the API are separate origins.** The browser calls the API on a different port, so the API's `CORS_ORIGINS` must include the exact frontend origin or every request fails in the browser while working fine from `curl`. This is the single most common cause of "the app loads but shows no data".

![API docs](../screenshots/g6b_06_api_docs.png)

### 2.1 Only one backend instance may run the scheduler

The preventive maintenance scheduler takes a database-backed startup lock on boot. If a second instance finds a live lock - a `SchedulerRun` row in `running` state with a heartbeat newer than 5 minutes, from a different host or process - it **refuses to start the scheduler** and logs a message, but it keeps serving the API normally.

Consequences you must plan for:

- Running two API instances behind a load balancer is supported for API traffic, but **only one of them will generate preventive maintenance work orders**. The other is harmless but idle.
- This is deliberate. It prevents duplicate work orders if a second instance is ever started.
- If an instance is killed hard, the lock is considered stale after 5 minutes and a new instance may take over.
- A rolling restart will briefly have one instance refusing the lock. That is expected; do not "fix" it by deleting `SchedulerRun` rows.

---

## 3. Configuration

Configuration is entirely by environment variable. The backend reads `backend/.env`; the frontend is compiled with `app/.env.local`. **There is no settings screen that writes configuration** - the Administration screen's Settings tab is read-only, and changing any value here requires an edit and a restart.

> The configuration table in section 3 of the [Installation Guide](../INSTALLATION_GUIDE.md#3-configuration) lists only four variables. **This section is the complete set.** The installation guide's table is a subset, not a contradiction.

### 3.1 Backend variables - `backend/.env`

| Variable | Purpose | Default | When to change it |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Required**, no default | When the database host, port, database name, or credentials change. See the pool guidance in [14.3](#143-prisma-p2028---connection-pool-exhaustion) |
| `JWT_SECRET` | Secret used to sign session tokens | **Required**, no default | Generate a new long random value at install. Rotate only with a plan: every issued token becomes invalid and all users must sign in again |
| `JWT_EXPIRES_IN` | Token lifetime in **seconds** | `28800` (8 hours) | Lower it to shorten exposure on a shared workstation; raise it for long shifts. Changing it does not revoke tokens already issued |
| `PORT` | TCP port the API listens on | `4000` | When another service already owns 4000. The frontend's `VITE_API_URL` and the IIS proxy rule must be changed to match |
| `CORS_ORIGINS` | Comma-separated list of browser origins permitted to call the API | `http://localhost:3000` | **Always**, when the frontend is served from anywhere other than `http://localhost:3000`. Use full origins including scheme, host, and port, with no trailing slash. A mismatch produces a blank screen with no data and a CORS error in the browser console |
| `BIND_HOST` | Interface the API binds to | `0.0.0.0` | Set to `127.0.0.1` whenever the API sits behind IIS on the same host. This is what keeps port 4000 off the network. See [12.1](#121-network-exposure) |
| `LOG_LEVEL` | Log verbosity. One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | `info` | Raise to `debug` only while diagnosing. `silent` disables logging entirely. An unrecognised value is ignored and falls back to `info` rather than failing to start |
| `PM_SCHEDULER_CRON` | Cron expression for the nightly PM generation run | `0 2 * * *` (02:00 daily, **server local time**) | When the plant's maintenance window differs from 02:00, or to run more or less often. Five-field `node-cron` syntax. **The scheduler evaluates due dates, not a rolling window, so changing this does not backfill missed runs** - see [5.4](#54-when-a-run-is-missed) |

### 3.2 Runtime-only variables

These are read from the process environment but are deliberately not in `.env.example`, because setting them by accident is dangerous:

| Variable | Purpose | Effect | When to set it |
|---|---|---|---|
| `NODE_ENV` | Standard Node environment flag | `production` **blocks the demo seed** and **blocks the `K6_MODE` rate-limit override** | Always set to `production` on a live system |
| `K6_MODE` | Raises the sign-in rate limit from 20 to **200 requests per 15 minutes** | Disables a brute-force protection | **Only** during a load test, and only with `NODE_ENV` **not** set to `production`. Refused in production by design. See [11](#11-load-testing) |

### 3.3 Frontend variable - `app/.env.local`

| Variable | Purpose | Default | When to change it |
|---|---|---|---|
| `VITE_API_URL` | Base URL of the backend API, including `/api` | `http://localhost:4000/api` | When the API is not on the same machine as the browser, or the port differs. This value is **baked into the built bundle**: after changing it you must rebuild the frontend (`npm run build` in `app\`), otherwise the change has no effect |

### 3.4 After changing any variable

```cmd
cd CMMSproject\backend
pm2 restart ecosystem.config.cjs
```

Changes to `PM_SCHEDULER_CRON`, `BIND_HOST`, `PORT`, or any database setting require a restart. A frontend `VITE_API_URL` change additionally requires a rebuild and redeploy of `app\dist`.

---

## 4. Database operations

### 4.1 Applying the schema

There are two supported paths, and they are **not** interchangeable.

**Recommended - migrations (has history, repeatable):**

```cmd
cd CMMSproject\backend
npx prisma generate
npx prisma migrate deploy
```

The repository carries five migrations under `backend\prisma\migrations\`, from the baseline through the account-lockout change. `migrate deploy` applies only those not yet applied and never drops data.

**The documented installation path - `migrate deploy`:**

```cmd
cd CMMSproject\backend
npx prisma migrate deploy
```

This is the only schema command the installation guide gives, for both a fresh install and an update. On an empty database it applies the full migration history in order, which is equivalent to creating the schema directly.

**`db push` is retired and should not be used against this project.** `db push` synchronises the database to `schema.prisma` by creating and altering tables directly. It does not record a migration history, so a later `migrate deploy` has no baseline to work from, and it will **drop a column** if one is removed from the schema without a migration to match. If you have already run `db push` on a database that matters, resolve `_prisma_migrations` before deploying; otherwise the first `migrate deploy` will attempt to re-apply the baseline against existing tables.

### 4.2 Regenerating the client

```cmd
cd CMMSproject\backend
npx prisma generate
```

Required after any change to `schema.prisma`, and after a fresh `npm install`. A stale client is a common cause of "the field does not exist" errors.

### 4.3 Demo data

```cmd
scripts\seed-demo.bat
```

**`seed-demo.bat` is destructive.** It wipes every table, including all work orders and notifications, then reloads the demo dataset. The seed refuses to run unless `SEED_DEMO=1` is set and `NODE_ENV` is not `production`. Never run it on a system holding real data.

### 4.4 Useful read-only queries

```sql
-- Work order volume by status
SELECT status, count(*) FROM "WorkOrder" WHERE "isDeleted" = false GROUP BY status ORDER BY status;

-- Users and their state
SELECT username, "fullName", role, "isActive", "lockedUntil", "lastLogin"
FROM "User" WHERE "isDeleted" = false ORDER BY role, username;

-- Recent scheduler runs
SELECT "startedAt", "completedAt", status, "plansEvaluated", "wosCreated", "wosSkipped", "errorMessage"
FROM "SchedulerRun" ORDER BY "startedAt" DESC LIMIT 10;

-- Attachment rows whose file bytes are missing on disk
SELECT a."attachmentId", a."storagePath" FROM "Attachment" a
WHERE a."isDeleted" = false ORDER BY a."uploadedDate" DESC;
```

The last query lists attachments the database believes in. Cross-check it against the files actually present under `backend\uploads\` - a row with no matching file is a broken attachment, and is exactly the failure mode the restore drill asserts against.

---

## 5. Scheduler operations

The scheduler generates work orders from preventive maintenance plans whose due date has arrived. It is the only part of the system that writes data on a timer.

### 5.1 Check the scheduler is actually running

```cmd
curl -s http://localhost:4000/api/health/scheduler
```

This endpoint requires **no authentication**, so it can be polled by a monitor. Responses:

| Status | Meaning | Action |
|---|---|---|
| `200` with `"status":"ok"` | A run completed within the last 25 hours. `lastSuccessAt` and `minutesSinceSuccess` are included | Healthy |
| `503` with `"status":"stale"` | No successful run in over 25 hours, **or** there has never been one | Investigate - see [5.3](#53-when-the-scheduler-reports-stale) |
| `503` with `"status":"stale"` and all fields `null` | The health query itself failed, usually a database connectivity problem | Check the database before anything else |

On a system that has just been installed and has never run, expect `503` until the first successful run. That is a cold start, not a fault.

### 5.2 Running the scheduler manually

**There is no button for this in the application.** The Preventive Maintenance page is read-only apart from a per-plan *Generate* action. The run endpoint requires an Administrator token:

```cmd
curl -s -X POST http://localhost:4000/api/maintenance-plans/run-scheduler ^
  -H "Authorization: Bearer <ADMIN_TOKEN>" ^
  -H "Content-Type: application/json"
```

The response reports `ranAt`, `plansEvaluated`, `wosCreated`, `wosSkipped`, and an `errors` array. To get a token, sign in as an Administrator:

```cmd
curl -s -X POST http://localhost:4000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"<your password>\"}"
```

Use a manual run to confirm a new plan produces a work order before waiting for the nightly schedule. The run is idempotent for a given plan on a given due date - running it twice will not create two work orders for the same plan and due date; the second run is counted as skipped. A non-empty `errors` array means individual plans failed; the run still completes.

### 5.3 When the scheduler reports stale

Work through these in order:

1. **Is the API running?** `curl -s http://localhost:4000/api/health`. If this fails, the problem is the service, not the scheduler.
2. **Is the instance that owns the lock alive?** Check the logs for `startup lock acquired` versus `disabled - lock held by`. If every instance reports a lock held by another process, a hard-killed instance may have left a lock that has not yet aged past 5 minutes. Wait and restart; do not delete `SchedulerRun` rows by hand.
3. **Has a run been attempted at all?** Query `SchedulerRun` as in [4.4](#44-useful-read-only-queries). No row at all means cron never fired, so check `PM_SCHEDULER_CRON` syntax and that the process has been up across the trigger time. Note the expression is evaluated in **server local time** - a daylight-saving change or a server in another time zone will shift the run.
4. **Did runs fail?** A `SchedulerRun` with `status = 'error'` has the reason in `errorMessage`.
5. **Do the plans have everything they need?** A plan missing an equipment record, a work center, or a task list can fail per-plan without failing the run. The `errors` array in the manual run response names them.

A stale scheduler raises a `Scheduler_Stale` **SystemAlert** against an active Administrator, at most once per 25 hours. The alert is visible on the Dashboard.

### 5.4 When a run is missed

The scheduler evaluates each plan's due date at the moment it runs. It does **not** re-run a missed window when the process starts. If the server was down at 02:00 and starts at 09:00, that night's generation does not happen automatically.

Recovery is either:

- Trigger a manual run as in [5.2](#52-running-the-scheduler-manually) - the plans are due by their date, so they are generated then; or
- Restart the service close to the scheduled time on the following night.

This matters for a plant that takes the API down overnight for maintenance: move the window with `PM_SCHEDULER_CRON`, or accept that a missed night requires a manual run.

---

## 6. User administration

All six roles exist in the same table. The UI has **no create, edit, or delete user screen**; the Administration screen's Users & Roles tab is read-only. Several procedures therefore have no API endpoint at all and are done in the database. This section is the supported procedure for each.

All SQL below uses the quoted `"User"` table, which is case-sensitive. Substitute the `userId`, not the username, in the API calls.

### 6.1 Create a user

**There is no `POST /api/users` endpoint and no create screen.** The only way to add a user is a direct insert. Generate the bcrypt hash first - the application hashes with a cost factor of 10, the same as the seed:

```cmd
cd CMMSproject\backend
node -e "const b=require('bcryptjs');b.hash(process.argv[1],10).then(h=>console.log(h))" "the new password"
```

Then insert. `userId` is a UUID; supply one explicitly:

```sql
INSERT INTO "User" ("userId", username, "passwordHash", "fullName", email, role, "isActive", "createdBy")
VALUES (
  gen_random_uuid(),
  'jsmith',
  '<bcrypt hash from the step above>',
  'Jane Smith',
  'jsmith@example.com',
  'Technician',
  true,
  'system'
);
```

Rules that must be respected:

- `role` must be exactly one of `Administrator`, `Maintenance Planner`, `Maintenance Supervisor`, `Technician`, `Requester`, `View-Only`. The value is a free-text column with no constraint, so a typo produces a user that appears in no permission level and can sign in but do nothing. Verify with the query in [4.4](#44-useful-read-only-queries) after inserting.
- `username` is unique only across non-deleted rows, enforced by a partial unique index. A deleted user may reuse their username.
- `workCenterId` is optional and links a Technician to a work center; leave it `NULL` if unsure.
- Do not insert the user with a known or shared password. Communicate it directly and have them change it.

Because this write bypasses the application, **it is not written to the audit log.** Note the creation out of band, and prefer provisioning through a script so it is repeatable.

### 6.2 List users and their state

The API, as an Administrator:

```
GET /api/users?take=200
```

Or read the database directly using the query in [4.4](#44-useful-read-only-queries). The Users & Roles tab shows the same information in the UI, read-only.

### 6.3 Disable and re-enable a user

```
PUT /api/users/{userId}
{ "isActive": false }
```

To re-enable, send `"isActive": true`. This is written to the audit log with the field name and old and new values.

Two things to know:

- Disabling takes effect at the user's **next** sign-in attempt. It does not terminate a session already in progress, and there is no server-side session revocation in this system - see [13](#13-deferred-and-not-implemented).
- A disabled account returns the same generic `Invalid credentials` as a wrong password. This is deliberate, to avoid confirming which usernames exist. When a user insists their password is right, check the active flag.

### 6.4 Clear an account lockout

**There is no API endpoint for this**, and the update schema does not accept the relevant fields. A lockout normally clears itself after 30 minutes; clear it early only when a genuine user is blocked.

```sql
UPDATE "User"
SET "lockedUntil" = NULL, "failedLoginCount" = 0
WHERE username = 'jsmith' AND "isDeleted" = false;
```

Notes:

- The failed-attempt count that actually drives lockout is derived from `LoginFailure` rows in the **audit log** within the previous 15 minutes, not from the `failedLoginCount` column. Clearing the column resets the stored counter but does not delete those audit rows, so if five real failures have just occurred, the account can lock again on the next attempt. That is correct behaviour - do not delete audit rows to work around it.
- A successful sign-in clears the stored counter and stamps `lastLogin`.
- A locked account returns **HTTP 423**, not 401 or 403. If you are scripting against the login endpoint, 423 means "locked", 401 means "bad credentials or inactive".

### 6.5 Reset a password

```
PUT /api/users/{userId}/password
{ "newPassword": "<the new password>" }
```

Administrator only. **It does not require the target user's current password** - that is the point of an administrative reset, but it means any Administrator can take over any account. The reset is written to the audit log. There is no separate "must change on next sign-in" flag, so treat the reset value as final and have the user set their own afterwards.

### 6.6 Review users and roles in the UI

**Administration → Users & Roles** is a read-only list: username, full name, email, role, active flag, and last sign-in. Use it to answer "who has access, and who has actually been signing in" - `lastLogin` distinguishes an active account from a dormant one.

The **RBAC Configuration** panel on the same screen is fixed text, is not editable, and does not reflect enforcement. One line is inaccurate: it states a Requester can "view own requests", but the Notifications list is not filtered by reporter and shows every notification to every signed-in user. Use the real behaviour documented in the [User Manual](USER_MANUAL.md#54-follow-up-the-status-of-notifications).

### 6.7 Delete or decommission a user

**There is no user delete endpoint and no delete button.** Deleting users is done with a soft delete, consistent with the rest of the system:

```sql
UPDATE "User"
SET "isDeleted" = true, "isActive" = false, "modifiedBy" = 'admin'
WHERE username = 'jsmith';
```

This removes the account from every list and blocks sign-in while **preserving the historical record** - their name remains on work orders, labor entries, comments, and audit entries, which is what makes those records auditable. This is the reason to soft delete rather than `DELETE`: a hard delete would orphan the historical attribution.

A soft-deleted user's username becomes reusable, because uniqueness is enforced only across non-deleted rows. This is also the mechanism behind the unique-index behaviour in [6.1](#61-create-a-user).

If the username must never be reused, prefer disabling ([6.3](#63-disable-and-re-enable-a-user)) over deleting.

---

## 7. Backup and recovery

### 7.1 Connection details are hardcoded

`scripts\backup.bat` and `scripts\restore-drill.bat` hardcode the connection:

```
PGHOST=localhost   PGPORT=5432   PGDATABASE=cmms   PGUSER=postgres
```

If your database is not on `localhost`, is not named `cmms`, or does not use the `postgres` role, **you must edit the scripts.** They read no connection environment variables. The only variable they do read is `PGPASSWORD`, which must be present in the environment.

They locate the PostgreSQL tools by looking for `pg_dump.exe` / `psql.exe` on `PATH`, then falling back to the hardcoded path `C:\Program Files\PostgreSQL\18\bin\`. If you run a different major version, edit `PG_DUMP` and `PSQL` or put the tools on `PATH`.

### 7.2 Running a backup

```cmd
set PGPASSWORD=<the postgres password>
scripts\backup.bat
```

The script, in order:

1. Writes to `backups\cmms-<timestamp>.sql.tmp` and refuses to publish a zero-byte file, so a truncated dump is never mistaken for a good one.
2. Moves the temp file to `backups\cmms-YYYY-MM-DD-HHmm.sql` only on success. The name is local time, `HHmm`.
3. Prunes the dumps, keeping the **newest 14**.
4. Snapshots attachments to `backups\cmms-<timestamp>-uploads\` and prunes to the **newest 14** snapshots.
5. Prints the file, its size in bytes, the attachment state, and the retention rule.

It exits non-zero if `PGPASSWORD` is unset, if the tools are missing, if `pg_dump` fails or produces nothing, or if retention cleanup fails. **A non-zero exit still means the SQL dump may already exist** - read the output before assuming you have no backup.

The upload snapshot uses `xcopy`, whose exit code 4 means "no files found", and this is treated as a failure. If `backend\uploads` does not exist at all, the snapshot is skipped with a message and the backup still succeeds - that is the correct outcome on a system where no attachment has ever been uploaded.

### 7.3 Attachment backups must stay paired

`pg_dump` captures only `Attachment.storagePath`, a relative pointer. The bytes live under `backend\uploads\<EntityType>\<entityId>\` and **would not survive a restore from the SQL dump alone** - every attachment would 404 while the database looked perfectly healthy.

The dump and the upload snapshot are therefore a matched pair, joined by name:

```
cmms-2026-09-25-0200.sql        <- database
cmms-2026-09-25-0200-uploads\   <- the same night's attachment bytes
```

**Never restore a dump without its matching `-uploads` folder, and never delete one of the pair.** The retention pruning handles both sides with the same 14-deep rule, so under normal operation the pairs stay aligned.

Restoring the attachment side means copying the snapshot's contents over `backend\uploads\`, preserving the `<EntityType>\<entityId>\` structure, so that the relative paths in the database resolve.

### 7.4 Scheduling the daily backup

Create a Windows Scheduled Task running `scripts\backup.bat` daily, and set `PGPASSWORD` in the task's environment. The script refuses to run without it - this is the one piece of configuration that is not in a `.env` file, and it is the most common reason a scheduled backup silently stops working.

Prune behaviour keeps 14 days, so a daily task gives a two-week rollback window.

### 7.5 Restore drill - do this on a schedule

```cmd
set PGPASSWORD=<the postgres password>
scripts\restore-drill.bat
```

This is deliberately non-destructive. It:

1. Picks the **newest** `cmms-*.sql` in `backups\`.
2. Drops and recreates a scratch database, **`cmms_restore_test`** - never the live database.
3. Restores the dump into it and runs a `WorkOrder` count query to prove the data is readable.
4. Asserts the paired `-uploads` snapshot exists and is non-empty whenever the live tree has attachments. A dataset with no attachments correctly does not fail here.
5. Drops the scratch database, confirms it is gone, and prints the elapsed seconds.

It prints `PASS` only if all of that succeeded, and cleans up the scratch database even on failure.

**Run the drill on a schedule, not only at install.** A backup that has never been restored is an assumption, not a backup.

### 7.6 Recovery objectives

- **RPO - up to 24 hours.** The backup is daily, so a failure between runs can lose a day's work.
- **RTO - measured, not designed.** The installation guide records a 5.35 second restore measured on 2026-09-25 against a local dataset of 84 work orders and a 306,826-byte dump. That is a restore of the *database into a scratch database on the same host*; it excludes application rebuild time, IIS configuration, and the attachment restore. Re-measure after meaningful database growth or any infrastructure change, and record the new figure rather than quoting the old one.

The two together mean a nightly backup gives you a working system again within minutes, but potentially a day of data loss. If the plant cannot accept a day of loss, the daily schedule is the thing to change - the tooling supports a more frequent run, because retention and naming are time-based.

### 7.7 Full system recovery order

1. Confirm PostgreSQL is running and the `cmms` database exists.
2. Restore the newest `backups\cmms-*.sql` into `cmms`.
3. Copy the matching `cmms-*-uploads\` contents over `backend\uploads\`, preserving structure.
4. Re-apply the schema with `npx prisma migrate deploy` if the code has moved on from the dump.
5. Rebuild the backend (`scripts\build.bat`) and the frontend, and restart via PM2.
6. Verify `curl -s http://localhost:4000/api/health`, then sign in and confirm attachments resolve.

---

## 8. Audit log

`AuditLogEntry` is append-only through the application: there is no API to update or delete an entry, only to read them. The UI is **Administration → Audit Log**, filterable by table, action, and free text, and paginated. Only Administrators can read it; every other role receives an error on that tab.

What is recorded:

| Event | Detail |
|---|---|
| Sign-in success | A `User` / `Update` / `lastLogin` entry with the IP address |
| Failed sign-in | A `User` / `Run` / `LoginFailure` entry. **These rows are the authority for account lockout** - see [6.4](#64-clear-an-account-lockout) |
| Account lockout | A `SystemAlert` of type `Account_Lockout` against the user, plus the user row update |
| Field changes | Table, record, field name, old value, new value, acting user, IP |
| Attachments | Upload and delete, including who and when |
| Authentication events | Sign-in and lockout, with `req.ip`, which depends on `trust proxy` - see [12.3](#123-proxy-trust-and-recorded-ip-addresses) |

What is **not** recorded, and must be understood before treating the audit log as complete:

- **User creation.** There is no create endpoint, so users inserted per [6.1](#61-create-a-user) leave no audit trail. This is the most important gap here.
- Direct database writes generally, including the soft delete in [6.7](#67-delete-or-decommission-a-user) and the lockout clear in [6.4](#64-clear-an-account-lockout). These leave no audit entry, though the resulting `LoginFailure` history still constrains lockout behaviour.
- Reads. There is no read logging, so the log cannot answer "who looked at this record".

The log has no automatic purge, so it grows indefinitely. Because it is the lockout authority, **do not prune `LoginFailure` rows** - doing so can only lower a user's failure count, but the retention decision should be made deliberately. If you must reduce volume, archive the whole table to a separate database or a timestamped export before deleting anything, and keep recent `LoginFailure` rows intact.

---

## 9. Logs

The backend logs through Pino, at the level set by `LOG_LEVEL`.

- **Under PM2**, logs go to `backend\logs\out.log` and `backend\logs\err.log`.
- Useful startup lines: `startup lock acquired (pid@host, run <id>)`, `[scheduler] started cron="<expression>"`, and `listening on <host>:<port>`.
- Log rotation is configured in `ecosystem.config.cjs` and described in the [Installation Guide](../INSTALLATION_GUIDE.md#log-rotation-pm2-logrotate). Confirm rotation is actually active on a long-running host; an unrotated log will eventually fill the disk, and the failure then looks like an application fault.
- Stale-scheduler health conditions are logged with `[scheduler] stale health detected - SystemAlert created`.

Do not paste raw logs into a shared channel. Log lines can contain usernames, IP addresses, and record identifiers.

---

## 10. Health checks and monitoring

| Endpoint | Auth | Use |
|---|---|---|
| `GET /api/health` | None | Liveness. Returns `{"status":"ok","timestamp":"..."}`. Poll this for uptime |
| `GET /api/health/scheduler` | None | Scheduler freshness. See [5.1](#51-check-the-scheduler-is-actually-running) |
| `GET /api-docs` | None | Interactive API documentation for every endpoint |
| `GET /api-docs.json` | None | The OpenAPI document, suitable for client generation |

The two health endpoints are unauthenticated so a monitor can reach them, which means **anything that can reach the API port can read them.** They expose no user data, but keep the port bound to `127.0.0.1` behind IIS so they are not internet-reachable - see [12.1](#121-network-exposure).

Suggested monitoring:

- Poll `/api/health` for uptime; alert on failure.
- Poll `/api/health/scheduler` and alert on `503`. Note that a `503` is expected on a brand-new system until the first run, so suppress it for the first 25 hours after install.
- Alert on the appearance of `Scheduler_Stale` SystemAlerts, which is the user-visible signal of the same condition.
- Watch the age of the newest file in `backups\`. If it is older than about 26 hours, the daily backup has stopped - the most consequential thing to monitor, because a silently dead backup is discovered only at restore time.

---

## 11. Load testing

The k6 smoke test verifies the main authenticated read path stays healthy and responsive against a single local backend. The installation guide covers installing k6, running the smoke test, and the `K6_MODE` limiter override.

Two constraints that are not negotiable:

- **`K6_MODE=1` must never be set on a live system.** It raises the sign-in rate limit from 20 to 200 per 15 minutes, removing brute-force protection. The application refuses the override when `NODE_ENV=production`; rely on that guard and do not work around it.
- **The smoke test is not a capacity proof.** It is a 50-VU sanity check, not the 200-concurrent-user requirement, which remains deferred. Do not quote smoke-test numbers as evidence of capacity. See [13](#13-deferred-and-not-implemented).

---

## 12. Security posture

Stated plainly, including the gaps. This is a defensible baseline for an internal plant system, not a hardened public-facing one.

### 12.1 Network exposure

- The API binds `0.0.0.0` by default, which exposes port 4000 to the network. **Set `BIND_HOST=127.0.0.1` when IIS proxies on the same host**, so the port is reachable only from the loopback interface. The installation guide's IIS section makes this change; keep it in place.
- Serve the frontend over HTTPS via IIS. Tokens travel in an `Authorization` header on every request, so plain HTTP exposes them to anyone on the path.
- Helmet is enabled, which sets the standard hardening headers. **Content-Security-Policy is deliberately disabled**, so the application does not set a CSP. The application is a static SPA with no inline scripts and would support a strict policy; adding one is a reasonable hardening step, but it is not configured today.

### 12.2 Authentication controls

| Control | Behaviour |
|---|---|
| Password storage | bcrypt |
| Sign-in rate limit | 20 requests per 15 minutes per IP, returning `429` |
| Account lockout | 5 failures within 15 minutes locks the account for 30 minutes, returning `423` |
| Token lifetime | `JWT_EXPIRES_IN`, default 8 hours |
| Idle timeout | 30 minutes with a 60-second warning, **in the browser only** |
| Generic failure message | A wrong password, and a disabled or deleted account, both return `Invalid credentials`, so the endpoint does not confirm which usernames exist |

Not implemented, and material to a security review: server-side session revocation, multi-factor authentication, forced password rotation, and a "must change password" flag. See [13](#13-deferred-and-not-implemented).

### 12.3 Proxy trust and recorded IP addresses

The API is configured with `trust proxy` set to 1. Behind exactly one reverse proxy - the documented IIS setup - `req.ip` is therefore the client's address, which is what appears in the audit log. This value is **hardcoded**, not configurable.

If you change the topology - a second proxy, a load balancer in front of IIS, or no proxy at all - the recorded IP address will be wrong, silently. Behind two proxies every log entry will show the address of your own proxy. If you change the topology, review the IP addresses in the audit log before trusting them, and remember that a user can appear to sign in from an unexpected address without anything being wrong.

### 12.4 Access control

Authorization is enforced by the server on every endpoint, with a role hierarchy: Administrator > Maintenance Planner > Maintenance Supervisor > Technician > Requester > View-Only. A higher role inherits the permissions of every role below it.

The frontend is **not** consistently role-aware: all ten navigation items are shown to everyone, most screens render regardless of role, and only a few controls are hidden client-side. Enforcement is the server's job, and a refused write returns `403`. Treat the UI as a convenience, never as the security boundary. A user who can see a Save button is not thereby permitted to save.

### 12.5 Secrets

- `JWT_SECRET` and the database password are the two secrets that matter. `JWT_SECRET` must be long and random and must not be committed.
- `backend\.env`, `app\.env.local`, and the `backups\` folder must never be committed to version control.
- `PGPASSWORD` for the backup task is held in the scheduled task's environment, outside the repository.
- Rotate `JWT_SECRET` only deliberately, and expect every session to end.

---

## 13. Deferred and not implemented

Recorded here so that nobody plans an operation around a feature that does not exist. Each is a known gap, not a defect discovered at runtime.

| Item | Status |
|---|---|
| **200-concurrent-user capacity test** | **Deferred post-go-live.** Blocked on the Prisma pool issue in [14.3](#143-prisma-p2028---connection-pool-exhaustion). Do not quote the k6 smoke numbers as capacity evidence |
| Prisma connection-pool exhaustion (`P2028`) | Open post-go-live issue. Fix documented in [14.3](#143-prisma-p2028---connection-pool-exhaustion) |
| IIS `curl` verification | Untested; the HTTPS path in the installation guide has not been verified end to end |
| User create / delete API | Never implemented. Database procedure in [6.1](#61-create-a-user) and [6.7](#67-delete-or-decommission-a-user) |
| User create audit trail | Not possible while creation bypasses the application. See [8](#8-audit-log) |
| Lockout clear / user edit API | No endpoint exists; `lockedUntil` is not in the accepted update schema |
| PM plan and task list screens | No UI. The Preventive Maintenance page is read-only plus a per-plan Generate action. API only (`/api/maintenance-plans`, `/api/task-lists`) |
| Notification create screen | No UI. The command palette entry navigates to the list and opens no form. `POST /api/notifications` only |
| Manual scheduler trigger screen | No UI. `POST /api/maintenance-plans/run-scheduler` only |
| System settings screen | Read-only. Configuration is environment-only |
| Content-Security-Policy | Disabled. See [12.1](#121-network-exposure) |
| Server-side session revocation | Not implemented. Disabling a user takes effect at their next sign-in only |
| Multi-factor authentication | Not implemented |
| Forced password change / expiry | Not implemented. A reset password stays in force |
| Read logging | Not implemented. The audit log cannot answer who viewed a record |
| Notifications scoped to the reporter | Not implemented. Every user sees all notifications, contrary to the text on the Administration screen |
| Notification email | Not implemented. Alerts surface on the Dashboard only |
| Automatic log pruning | Not implemented. The audit log grows without bound |

---

## 14. Troubleshooting

Work top to bottom. Most faults are configuration, and the first three checks resolve the majority.

### 14.1 The application loads but shows no data

Almost always CORS. The API rejects the browser's request, so every call fails while the same request from `curl` succeeds.

1. Open the browser developer console and read the error. A CORS failure names the origin it rejected.
2. Compare the origin in the error with `CORS_ORIGINS`. The value must match **exactly** - scheme, host, and port, with no trailing slash.
3. Restart the backend after changing it. `CORS_ORIGINS` is read at startup.
4. Confirm the API is up independently: `curl -s http://localhost:4000/api/health`.

### 14.2 The API is not reachable from the network

1. Confirm the process is running - `pm2 list`, or `pm2 logs` for a startup crash.
2. Confirm the port: `netstat -ano | findstr 4000`.
3. Confirm the bind address. `BIND_HOST=127.0.0.1` intentionally makes the port unreachable from other machines. If you have set it and need direct access, that is a security regression - use the proxy instead.
4. Check Windows Firewall for an inbound rule on the port.
5. Check the IIS site and the ARR proxy rule, and confirm the application pool is running.

### 14.3 Prisma `P2028` - connection pool exhaustion

**Symptom:** a burst of requests, especially simultaneous sign-ins, returns HTTP 500 with `PrismaClientKnownRequestError` `P2028`, "Unable to start a transaction in the given time". Simple reads usually stay healthy, so a monitor watching only the read path will not see it.

**Cause:** the Prisma client uses its default connection pool - roughly `2 x CPU cores + 1` - and every sign-in opens a transaction to serialise the failure count. A burst of concurrent sign-ins can exhaust it. This was observed during the k6 smoke run: 15 of 140 concurrent logins failed this way while the read path stayed inside its latency budget.

**Fix:** size the pool explicitly in `DATABASE_URL` and raise PostgreSQL's connection limit to match.

```
postgresql://USER:PASSWORD@HOST:5432/cmms?connection_limit=20&pool_timeout=20
```

Then in `postgresql.conf`:

```
max_connections = 100
```

and restart PostgreSQL and the API. Choose `connection_limit` so that **all** application instances together stay well below `max_connections` - each instance opens its own pool, so three instances at `connection_limit=20` need 60 connections, plus room for your administrative sessions and the restore drill. A too-large `connection_limit` turns pool exhaustion into PostgreSQL connection exhaustion, which is a harder outage.

This remains an open post-go-live item and should be resolved before any 200-user test.

### 14.4 A user cannot sign in

| Error | Cause | Action |
|---|---|---|
| `Invalid credentials` | Wrong password, or the account is disabled or deleted | Confirm the active flag with the query in [4.4](#44-useful-read-only-queries) |
| `Account temporarily locked` (`423`) | Five failures in 15 minutes | Wait 30 minutes, or clear it per [6.4](#64-clear-an-account-lockout) |
| `429` | More than 20 sign-in attempts from that IP in 15 minutes | Wait 15 minutes. If it is legitimate traffic, look for a script retrying, or confirm `K6_MODE` is not set |

If a user is signing in correctly and is still refused, check for a lockout **first** - a correct password inside the lockout window still returns `423`.

### 14.5 A work order change is refused

1. Read the error. `403` means the role is not permitted - this is enforcement working, not a fault. Remember the hierarchy: a higher role inherits everything below it.
2. Check the status. Only the transitions in the [User Manual](USER_MANUAL.md#11-reference-the-work-order-lifecycle) are accepted; an invalid transition is rejected. **Closed is final** - there is no reopen.
3. Check whether the screen is simply misleading you. Several controls are visible to roles that cannot use them.

### 14.6 No work orders are being generated from PM plans

1. `curl -s http://localhost:4000/api/health/scheduler` - see [5.3](#53-when-the-scheduler-reports-stale).
2. Is the plan's **Next Due** date actually reached? Generation is driven by the due date, not by the plan's age.
3. Is the plan active?
4. Does the plan have the equipment, work center, and task list it needs? A missing reference fails that plan and appears in the manual run's `errors` array.
5. Run it manually ([5.2](#52-running-the-scheduler-manually)) and read the response - `plansEvaluated`, `wosCreated`, `wosSkipped`, and `errors` distinguish "nothing was due" from "everything failed".

### 14.7 The backup did not run

1. `PGPASSWORD` unset in the scheduled task environment - the single most common cause. The script exits immediately with a clear message.
2. Connection details are hardcoded to `localhost:5432`, database `cmms`, role `postgres`. If yours differ, the scripts need editing - see [7.1](#71-connection-details-are-hardcoded).
3. `pg_dump.exe` / `psql.exe` not on `PATH` and not at the PostgreSQL 18 fallback path.
4. The `backups\` folder is not writable by the task's account.
5. Check the file age: if the newest dump is older than about 26 hours, the task is not running at all.

### 14.8 A restore left every attachment broken

The SQL dump restored, but attachments 404. The dump contains only the relative `storagePath`; the bytes are in the paired `-uploads` snapshot. Copy that snapshot's contents over `backend\uploads\`, preserving the `<EntityType>\<entityId>\` structure, then restart the API. See [7.3](#73-attachment-backups-must-stay-paired). Run the restore drill per [7.5](#75-restore-drill---do-this-on-a-schedule) - it asserts exactly this, and exists so that this failure is caught before a real recovery rather than during one.

### 14.9 Unexpected audit log IP addresses

See [12.3](#123-proxy-trust-and-recorded-ip-addresses). `trust proxy` is hardcoded to 1 and assumes exactly one reverse proxy. If the topology changed, the recorded addresses are wrong. If **every** entry shows your proxy's own address, there are two proxies in the path.

### 14.10 A query or view is missing a field

The Prisma client is probably stale relative to the schema:

```cmd
cd CMMSproject\backend
npx prisma generate
pm2 restart ecosystem.config.cjs
```

If the column is genuinely absent from the database, apply the schema with `npx prisma migrate deploy` - see [4.1](#41-applying-the-schema) for why `db push` is the wrong tool on a live database.
