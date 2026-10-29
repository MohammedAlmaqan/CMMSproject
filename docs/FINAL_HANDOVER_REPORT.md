# FINAL HANDOVER AUDIT REPORT

**System:** CommandPulse CMMS (on-prem Windows; React/Vite SPA + Express/Prisma API + PostgreSQL 18)
**Audit type:** Independent pre-handover release audit — read-only against application and live database
**Auditor role:** Senior Release Manager (no prior project context)
**Audited commit:** `aad6a9134b5d541375d8f2ee3c7072e8ea6f7ebd` (`main`)
**Audit date:** 2026-10-19 (host local time, UTC+3)
**Report file:** `docs/FINAL_HANDOVER_REPORT.md` — the only file written by this audit

**Safety declaration:** No application code was changed. No test, seed, migration or script was
executed against the live `cmms` database. The destructive backend test suite ran against a
throwaway database `cmms_audit` (created, migrated, seeded, tested, dropped — proven below).
The only writes the audit caused to `cmms` were the application's own audit-log row created by
the required admin login for UI verification (see Domain 3, integrity re-check).

---

## Domain 1 — Source Code & Version Control

### 1.1 Working tree status

Command:

```
git status --short
```

Raw output:

```
 M app/.env.example
 M app/components.json
 M app/eslint.config.js
 M app/index.html
 M app/postcss.config.js
 M app/src/__tests__/NotificationsPage.test.tsx
 M app/src/__tests__/PreventiveMaintenancePage.test.tsx
 M app/src/lib/utils.ts
 M app/src/services/alertService.ts
 M app/src/services/commentService.ts
 M app/src/services/workOrderMaterialService.ts
 M app/src/services/workOrderOperationService.ts
 M app/tailwind.config.js
 M app/tsconfig.app.json
 M app/tsconfig.json
 M app/tsconfig.node.json
 M backend/src/utils/prisma.ts
 M backend/tsconfig.json
 M scripts/start.bat
?? docs/migration-templates/dataset/
```

These 19 entries are **line-ending (CRLF/LF) artifacts of `core.autocrlf=true`, not content
changes**. Proof — the same tree measured with end-of-line differences ignored:

Command:

```
git diff --ignore-cr-at-eol --stat
```

Raw output: *(empty — zero content differences)*

```
(empty)
```

Command (git's own confirmation of the mechanism):

```
git diff --check
```

Raw output (representative lines — all files report the same LF→CRLF conversion notice):

```
warning: in the working copy of 'app/.env.example', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'backend/tsconfig.json', LF will be replaced by CRLF the next time Git touches it
...
```

**Verdict:** the working tree is clean of uncommitted application code. The untracked
`docs/migration-templates/dataset/` directory is the Client's legacy dataset, excluded from
version control by standing rule (contains production data).

### 1.2 Current tip commits

Command:

```
git log --oneline -5
```

Raw output:

```
aad6a91 docs(handoff): final handover note - UI Gap Closure workstream (Task 2) closed, Playwright sweep 20/20, vite base fix e8b0d29
e8b0d29 fix(app): absolute asset base so deep routes load in production
9a856f0 docs: close GAP N2 and tracker v1.1-14 citing C8 green CI run 344
ded46d7 docs: close out UI gap-closure workstream records (tracker v1.1-9/11-17, GAP U1-U3+N1)
65d296d docs(matrix): promote §3.5.2 cost-split editor Partial -> Met (owner decision 5)
```

Command:

```
git rev-parse HEAD
```

Raw output:

```
aad6a9134b5d541375d8f2ee3c7072e8ea6f7ebd
```

### 1.3 Release tags

Command:

```
git tag -l
```

Raw output:

```
v1.0.0
v1.1.0
v1.2.0
v1.2.1
v1.3.0
```

Command:

```
git show-ref --tags
```

Raw output:

```
386fe3c0ef395815c94bbb667cc24e8064ae621f refs/tags/v1.0.0
c2154e8bef6c1d4409ff5d38a311ee4d29a6ee85 refs/tags/v1.1.0
8a29576c59407d0972417f6ef0f4d72b3243c20b refs/tags/v1.2.0
882965db3de44a292091d016d54184fc7ffc4f71 refs/tags/v1.2.1
b1f3bf83b127b88be2395ed45606ee6871f78e65 refs/tags/v1.3.0
```

Command (every tag's commit must be an ancestor of `main` — no missing/dangling releases):

```
foreach ($t in (git tag -l)) { $c=(git rev-list -n1 $t); ... git merge-base --is-ancestor $c HEAD ... }
```

Raw output:

```
v1.0.0 -> 0d941dfafeb22965c11624a9e744afe57c1ad609 ancestor=YES
v1.1.0 -> 5e2c4789b831b249cfc4d853829642682c80c641 ancestor=YES
v1.2.0 -> a995e77ad6ad929a3120131a6d821422139ef6f4 ancestor=YES
v1.2.1 -> 2313b0221d1bc3e1903e663a2f5e9de17745dbc2 ancestor=YES
v1.3.0 -> e5ffc007dd084d17d420e2220233636ba07c8deb ancestor=YES
```

**Verdict:** five release tags exist, none missing, all reachable from `main`.

### 1.4 README build/run instructions

Command:

```
Test-Path README.md
Select-String -Path README.md -Pattern 'npm install|npm run|prisma|seed|port' ...
```

Raw output (extract of `## Quick start (Windows)`):

```
### 1. Create the database

psql -U postgres -c "CREATE DATABASE cmms;"

### 2. Backend

cd backend
npm install
copy .env.example .env
REM edit .env: set DATABASE_URL and a strong JWT_SECRET
npx prisma generate
npx prisma migrate deploy

Start the API: npm run dev          (listens on http://localhost:4000)
Worker: npm run worker:dev          (separate process since C11; production: ecosystem.config.cjs → cmms-api + cmms-worker)

### 3. Demo data (fresh installs only)
The seed is deliberately guarded: refuses to run unless SEED_DEMO=1 and NODE_ENV is not production.
scripts\seed-demo.bat

### 4. Frontend
cd app
npm install
copy .env.example .env.local
npm run dev
```

**Verdict:** `README.md` exists and contains complete build/run instructions.

---

## Domain 2 — Build & Continuous Integration

### 2.1 CI pipeline

Command:

```
Get-ChildItem .github\workflows
Get-Content .github\workflows\ci.yml
```

Raw output (structure):

```
Name     Length
----     ------
ci.yml   3025

name: CI
on:
  push:
    branches: [ main ]
  pull_request:
jobs:
  backend:   # ubuntu-latest + postgres:15 service; npm ci → prisma generate → tsc --noEmit
             # → eslint (≤50 errors baseline) → prisma migrate deploy → seed → npm test
  frontend:  # ubuntu-latest; npm ci → tsc -b → vite build → npm test
```

### 2.2 Most recent CI run on `main`

Command:

```
GET https://api.github.com/repos/MohammedAlmaqan/CMMSproject/actions/runs/39168011118
```

Raw output:

```
run_number=347
id=39168011118
head_sha=aad6a9134b5d541375d8f2ee3c7072e8ea6f7ebd
head_branch=main
event=push
status=completed
conclusion=success
html_url=https://github.com/MohammedAlmaqan/CMMSproject/actions/runs/39168011118
job=Frontend (ubuntu-latest) status=completed conclusion=success started=2026-10-18T21:28:49Z completed=2026-10-18T21:29:49Z
job=Backend (ubuntu-latest) status=completed conclusion=success started=2026-10-18T21:28:49Z completed=2026-10-18T21:30:26Z
```

`head_sha` equals `HEAD` (`aad6a91…`). Last five runs on `main`, same query (`?branch=main&per_page=5`):

```
run 347 id 39168011118 sha aad6a91 event=push status=completed conclusion=success
run 346 id 39161157807 sha e8b0d29 event=push status=completed conclusion=success
run 345 id 39156536616 sha 9a856f0 event=push status=completed conclusion=success
run 344 id 39156019888 sha ded46d7 event=push status=completed conclusion=success
run 343 id 39150559365 sha 3ce1bec event=push status=completed conclusion=success
```

**Verdict:** green CI at the exact audited SHA — run 347, both jobs success.

### 2.3 Local test suites

**FRONTEND** (safe — no database), command `npm test` in `app/`:

Raw output:

```
✓ src/__tests__/ReportsPage.test.tsx (1 test) 352ms

 Test Files  19 passed (19)
      Tests  99 passed (99)
   Start at  01:25:33
   Duration  90.81s

FRONTEND_TEST_EXIT=0
```

**BACKEND** (destructive) — executed against a **throwaway database only**. Safety procedure
as a single detached script; raw log:

Command (script steps, verbatim from `%TEMP%\opencode\audit_backend_tests.log`):

```
=== STEP 1: drop (if exists) + create throwaway database cmms_audit ===
NOTICE:  database "cmms_audit" does not exist, skipping
DROP DATABASE
CREATE DATABASE
=== STEP 2: point DATABASE_URL at cmms_audit (value not printed) ===
DATABASE_URL database name: cmms_audit
=== STEP 3: prisma migrate deploy ===
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "cmms_audit", schema "public" at "localhost:5432"
MIGRATE_EXIT=0
=== STEP 4: seed (guarded demo seed, SEED_DEMO=1, NODE_ENV=test) ===
SEED_EXIT=0
=== STEP 5: backend test suite (vitest run) ===
 Test Files  88 passed (88)
      Tests  1190 passed (1190)
   Duration  332.94s (setup 77%, tests 20%, transform 1%, import 1%)
TEST_EXIT=0
=== STEP 6: drop throwaway database cmms_audit ===
DROP_EXIT=0
RESULT_EXIT=0
EXIT=0
```

Proof the throwaway was dropped and `cmms` untouched by the run:

Command: `psql -U postgres -d postgres -c "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1;"`

Raw output (no `cmms_audit`):

```
        datname
------------------------
 cmms
 cmms_ci
 cmms_cutover_clone
 cmms_cutover_rehearsal
 cmms_e2e
 cmms_gate
 cmms_gate_fresh
 postgres
(8 rows)
```

**Verdict:** frontend 99/99 pass, exit 0; backend **1190/1190 pass across 88 files**, exit 0,
on `cmms_audit`; throwaway dropped. Live `cmms` never targeted.

### 2.4 Mandatory project gates

Command: `python scripts\verify\verify_a1.py` then `python scripts\verify\verify_a1_dispositions.py`

Raw output (exit codes):

```
verify_a1 exit=0
verify_a1_dispositions exit=0
```

---

## Domain 3 — Database & Data Integrity

### 3.1 Database running and accessible

Command: `C:\Program Files\PostgreSQL\18\bin\pg_isready.exe -h localhost -p 5432 -U postgres`

Raw output:

```
localhost:5432 - accepting connections
exit=0
```

Command: `psql -U postgres -d cmms -c "SELECT current_database(), version();"`

Raw output:

```
 current_database |                             version
------------------+------------------------------------------------------------------
 cmms             | PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit
(1 row)
```

### 3.2 Core entity row counts (live `cmms`, read-only `SELECT COUNT(*)`)

Command: `psql -w -h localhost -p 5432 -U postgres -d cmms -f audit_counts.sql`

Raw output:

```
       entity       | count
--------------------+-------
 Attachment         |     0
 AuditLogEntry      | 20463
 CostSplit          |     6
 Equipment          |  6127
 FunctionalLocation |   463
 LaborEntry         |     0
 MaintenancePlan    |     0
 Material           |  5687
 Notification       |  2163
 User               |     3
 WorkCenter         |     5
 WorkOrder          |  2181
 WorkOrderMaterial  |     0
 WorkOrderOperation |     7
(14 rows)
```

The system is populated with the Client's migrated operational dataset (20,333 rows loaded at
cutover 2026-10-17; the counts above are the post-cutover live state). Zero-count tables
(`Attachment`, `LaborEntry`, `MaintenancePlan`, `WorkOrderMaterial`) reflect what the legacy
dataset contained — reported as fact, not treated as a defect.

### 3.3 Integrity re-check after the audit (no test/seeding against `cmms`)

Same command re-run at the end of the audit:

Raw output:

```
       entity       | count
--------------------+-------
 Attachment         |     0
 AuditLogEntry      | 20464
 CostSplit          |     6
 Equipment          |  6127
 FunctionalLocation |   463
 LaborEntry         |     0
 MaintenancePlan    |     0
 Material           |  5687
 Notification       |  2163
 User               |     3
 WorkCenter         |     5
 WorkOrder          |  2181
 WorkOrderMaterial  |     0
 WorkOrderOperation |     7
(14 rows)
```

**Every entity is identical; `AuditLogEntry` moved 20463 → 20464 (+1).** That single row is the
application's own authentication audit entry written by the admin login the UI verification in
Domain 5 required. No other write occurred.

### 3.4 Backup mechanism and most recent backup

Command: `Get-ChildItem backups | Sort-Object Name -Descending`

Raw output (newest first):

```
Name                         Length  LastWriteTime
cmms-2026-10-18-0200-uploads         10/18/2026 2:00:07 AM
cmms-2026-10-18-0200.sql     9224097 10/18/2026 2:00:04 AM
cmms-2026-10-17-2257.sql     9262771 10/17/2026 10:57:50 PM
cmms-2026-10-17-1905.sql     9254347 10/17/2026 7:05:12 PM
cmms-2026-10-17-1903.sql     9254347 10/17/2026 7:03:02 PM
cmms-2026-10-17-1823.sql      155254 10/17/2026 6:23:45 PM
cmms-2026-10-17-1702.sql      150955 10/17/2026 5:02:37 PM
cmms-2026-10-17-1701.sql      150955 10/17/2026 5:01:33 PM
cmms-2026-09-29-1659.sql      730878 9/29/2026 4:59:54 PM
... (14-generation retention, plus paired -uploads attachment snapshots)
```

- **Most recent backup:** `backups\cmms-2026-10-18-0200.sql`, **9,224,097 bytes**, written
  2026-10-18 02:00 (nightly), with a paired `cmms-2026-10-18-0200-uploads` attachment snapshot.
- Mechanism: `scripts\backup.bat` (`pg_dump --no-owner --no-privileges`, temp-file → atomic
  move, empty-dump guard, 14-generation retention, uploads snapshot).

Command: `Get-ScheduledTask -TaskName '*CMMS*'`

Raw output:

```
TaskName                      State
CommandPulse CMMS Daily Backup  Ready
CommandPulse CMMS PM2 Resurrect  Ready
```

### 3.5 Migrations fully applied

Command: `psql -U postgres -d cmms -f audit_migrations.sql` (`SELECT migration_name, finished_at FROM _prisma_migrations`)

Raw output — all 22 rows (finished dates 2026-10-09 for the baseline set, 2026-10-17 for the three latest):

```
                  migration_name                  |  finished
--------------------------------------------------+------------
 20260924142537_init_baseline                     | 2026-10-09
 20260924150000_partial_unique_index              | 2026-10-09
 20260924160000_f3_remaining_partial_indexes      | 2026-10-09
 20260924170000_add_attachment                    | 2026-10-09
 20260925145405_add_account_lockout               | 2026-10-09
 20260926090000_task_list_and_operation_materials | 2026-10-09
 20260927090000_checklist_response_nullable       | 2026-10-09
 20260927100000_pm_plan_targets_and_fields        | 2026-10-09
 20260927110000_service_cost_category             | 2026-10-09
 20260927120000_work_order_reported_by            | 2026-10-09
 20260927130000_notification_damages_observations | 2026-10-09
 20260928151746_work_order_snapshot               | 2026-10-09
 20260928160000_soft_delete_sweep                 | 2026-10-09
 20260928170000_float_to_decimal                  | 2026-10-09
 20261002160000_reporting_views                   | 2026-10-09
 20261002180000_work_order_long_text              | 2026-10-09
 20261002190000_work_order_cause_code             | 2026-10-09
 20261003120000_work_order_calibration            | 2026-10-09
 20261005120000_work_order_failure_code           | 2026-10-09
 20261009120000_status_and_type_check_constraints | 2026-10-17
 20261014120000_refresh_token_last_used           | 2026-10-17
 20261015120000_alert_type_scheduler_stale        | 2026-10-17
(22 rows)
```

Command: `npx prisma migrate status` (in `backend/`, against live `cmms` — read-only status check)

Raw output:

```
Datasource "db": PostgreSQL database "cmms", schema "public" at "localhost:5432"
22 migrations found in prisma/migrations
Database schema is up to date!
exit=0
```

**Verdict:** 22 migration folders on disk = 22 rows in `_prisma_migrations`; Prisma reports the
schema up to date. No pending migrations.

---

## Domain 4 — Infrastructure & Deployment

### 4.1 Hosting model

- **Frontend:** Microsoft IIS/10.0 serves the built SPA from `C:\inetpub\cmms-site` over HTTPS
  (HTTP.SYS, port 443), reverse-proxying `/api` to the API on loopback.
- **Backend:** PM2 (`backend/ecosystem.config.cjs`, fork mode) runs `cmms-api` (port 4000) and
  `cmms-worker` (cron jobs).

Command: `curl -k -I https://cmms.local/`

Raw output:

```
HTTP/1.1 200 OK
Content-Length: 402
Content-Type: text/html
Server: Microsoft-IIS/10.0
```

Command: `netstat -ano | Select-String LISTENING` (app ports)

Raw output:

```
TCP    0.0.0.0:443            0.0.0.0:0              LISTENING       4
TCP    0.0.0.0:5432           0.0.0.0:0              LISTENING       5936
TCP    127.0.0.1:4000         0.0.0.0:0              LISTENING       8404
TCP    [::]:443               [::]:0                 LISTENING       4
TCP    [::]:5432              [::]:0                 LISTENING       5936
```

### 4.2 Process status

Command: `pm2 ls`

Raw output:

```
┌────┬────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┐
│ id │ name           │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ ...
├────┼────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┤
│ 1  │ cmms-api       │ default     │ 1.0.0   │ fork    │ 8404     │ 3h     │ 2    │ online    │ 0.4%     │ ...
│ 0  │ cmms-worker    │ default     │ 1.0.0   │ fork    │ 8736     │ 3h     │ 2    │ online    │ 0%       │ ...
└────┴────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┘
```

Command: `pm2 jlist | node <parser>`

Raw output:

```
name=cmms-worker status=online restarts=2 pid=8736 created=2026-10-18T19:11:01.461Z
name=cmms-api status=online restarts=2 pid=8404 created=2026-10-18T19:10:54.562Z
pm2 exit=0
```

Both apps online and stable (uptime 3 h; restart count 2 = the deliberate restart performed
during the documented deployment of `e8b0d29`, not crash loops).

### 4.3 API health endpoint

Command: `Invoke-WebRequest -Uri http://127.0.0.1:4000/api/health -UseBasicParsing`

Raw output:

```
HTTP 200
{"status":"ok","timestamp":"2026-10-18T22:22:32.587Z"}
```

Command: `curl -k https://cmms.local/api/health` (through the IIS production path)

Raw output:

```
{"status":"ok","timestamp":"2026-10-18T22:23:07.548Z"}
HTTP_CODE=200
```

### 4.4 Network security

Command: `netsh advfirewall firewall show rule name="CMMS API 4000 block external"`

Raw output:

```
Rule Name:                            CMMS API 4000 block external
Enabled:                              Yes
Direction:                            In
Profiles:                             Domain,Private,Public
Protocol:                             TCP
LocalPort:                            4000
Action:                               Block
Ok.
```

Command: `netsh advfirewall show allprofiles`

Raw output (per profile — Domain, Private, Public):

```
State                                 ON
Firewall Policy                       BlockInbound,AllowOutbound
State                                 ON
Firewall Policy                       BlockInbound,AllowOutbound
State                                 ON
Firewall Policy                       BlockInbound,AllowOutbound
```

Port 5432 exposure check:

Command: `Select-String -Path fw_rules.txt -Pattern '5432'` and `-Pattern 'Postgres'` over the
full inbound rule dump (`netsh advfirewall firewall show rule name=all dir=in`, 3,942 lines)

Raw output: *(no matches for either pattern — no inbound ALLOW rule exists for PostgreSQL or
port 5432; with the default `BlockInbound` policy, external 5432 is blocked)*

```
(empty)
```

API exposure layers (defence in depth):

Command: `Select-String -Path backend\ecosystem.config.cjs -Pattern 'BIND_HOST'`

Raw output:

```
15: BIND_HOST: '127.0.0.1',
```

Combined with `netstat`: the API listens only on `127.0.0.1:4000` (not externally reachable at
all), the firewall additionally blocks 4000 on every profile, and PostgreSQL — though bound to
`0.0.0.0` by its installer default — has **no** allow rule under a `BlockInbound` policy.
The production entry point is IIS :443 only.

**Verdict:** network security configured; DB and API not reachable from external networks per
firewall/bind configuration. *(Empirical test from a second machine on the LAN is recommended
as a post-handover exercise — the audit host cannot originate a true external probe of itself.)*

---

## Domain 5 — Application & UI Verification

Method: headless Chromium (Playwright, system Chrome, `headless: true`, 1440×900) against the
production URL `https://cmms.local`, logging in as `admin`. The spec asserted zero uncaught
page errors and zero console errors across the whole session.

Command (detached):

```
npx playwright test audit_ui.spec.ts --config=playwright.config.ts
```

Raw output:

```
Running 1 test using 1 worker

SCREENSHOT_1=audit-shots/01-dashboard.png url=https://cmms.local/dashboard
SCREENSHOT_2=audit-shots/02-work-orders-list.png url=https://cmms.local/work-orders
SCREENSHOT_3=audit-shots/03-work-order-detail.png url=https://cmms.local/work-orders/fdfd91a8-8073-4439-9e8d-1f41a80b43a2
CONSOLE_ERROR_COUNT=0
PAGE_ERROR_COUNT=0
AUDIT_UI_RESULT=PASS
  ok 1 audit_ui.spec.ts:6:5 › audit: dashboard, work orders list, work order detail load without errors (17.5s)

  1 passed (20.2s)
EXIT=0
```

Screens (each awaited for content, network-idle, then captured):

1. **Dashboard** — loaded at `https://cmms.local/dashboard` after admin login.
2. **Work Orders list** — loaded at `https://cmms.local/work-orders`, waited for the
   `N work orders` server total.
3. **Work Order detail** — clicked the first row; detail loaded at
   `https://cmms.local/work-orders/fdfd91a8-8073-4439-9e8d-1f41a80b43a2`, waited for `WO-\d+`.

Screenshot evidence (captured over the production URL):

Command: `Get-ChildItem audit-shots | ForEach-Object { ... Get-FileHash ... }`

Raw output:

```
01-dashboard.png  bytes=65909  sha256=C950AE7F9A1230854E3499240A21D1D0C5A13184CC18BA8DF0E0F4CA51E755EE
02-work-orders-list.png  bytes=118139  sha256=5CB86FA47DAA9B7AAFC973F4F868677281094E119B88889FC88C17DD342C4EAC
03-work-order-detail.png  bytes=63465  sha256=8601B1EEDFF7E05CE07A73A48469602AAE53433D63ADB845CFF25958C2997FA2
```

(Stored at `%TEMP%\opencode\ui-verify\audit-shots\` — screenshots are audit artifacts and were
deliberately not committed to the repository.)

Additional production-asset check (regression guard for the fixed Vite `base` bug):

Command: `curl -k -o NUL -w "%{http_code} %{content_type}" https://cmms.local/assets/index-BAbKW9-6.js`

Raw output:

```
HTTP_CODE=200 CONTENT_TYPE=application/javascript
```

**Verdict:** all three required screens load over the production URL with **0 console errors,
0 uncaught page errors**.

---

## Domain 6 — Final Release Decision

### Audit PASSED: The system is ready for handover.

Summary of the evidence behind the decision:

| # | Domain | Result | Anchor evidence |
|---|--------|--------|-----------------|
| 1 | Source & version control | PASS | Clean content tree (`git diff --ignore-cr-at-eol --stat` empty); HEAD `aad6a91`; 5 tags, all ancestors of `main`; README with build/run instructions |
| 2 | Build & CI | PASS | Run 347 at `aad6a91` = success (both jobs); local frontend 99/99; local backend 1190/1190 on throwaway `cmms_audit`; gates `verify_a1`/`verify_a1_dispositions` exit 0 |
| 3 | Database & integrity | PASS | `pg_isready` accepting; live counts captured twice (identical except +1 audit row from this audit's own login); newest backup `cmms-2026-10-18-0200.sql` (9,224,097 bytes) via nightly scheduled task; 22/22 migrations, "up to date" |
| 4 | Infrastructure & deployment | PASS | IIS :443 + PM2 both apps `online` (3 h, no crash loops); `/api/health` 200 via loopback and via production HTTPS; firewall ON/BlockInbound, API bound to loopback with an extra block rule, no 5432 allow rule |
| 5 | Application & UI | PASS | Playwright 1 passed / 0 failed: dashboard, list, detail; `CONSOLE_ERROR_COUNT=0`, `PAGE_ERROR_COUNT=0`; 3 screenshots (SHA-256 recorded); JS asset served with correct MIME |
| 6 | Decision | **PASSED** | — |

Non-blocking observations recorded for the owner (none stop handover):

1. The login form's `<label>` elements are not programmatically associated with their inputs
   (no `htmlFor`/`id`), so screen readers do not announce them — cosmetic a11y gap on one form.
2. Row counts of `LaborEntry`, `MaintenancePlan`, `WorkOrderMaterial`, `Attachment` are 0 in the
   migrated dataset (facts about the source data, not defects).
3. PostgreSQL binds `0.0.0.0:5432`; protection relies on the Windows Firewall `BlockInbound`
   policy (verified: no allow rule). A LAN-side connection test from a second machine is a
   recommended post-handover check.
4. The audit added exactly one `AuditLogEntry` row via its required admin login (Domain 3.3).

**Authorisation exercised with this report:** push this report as
`docs: final handover audit report`, then tag the pushed commit `v1.4.0` and push the tag.

---

> **Note (2026-10-28):** This report predates later RBAC/UI closures and some post-audit changes; see CMMS_FINALIZATION_TRACKER.md and HANDOFF.md for current authoritative state. Superseded details are preserved above.
