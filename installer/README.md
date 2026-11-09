# CommandPulse CMMS installer

This directory contains the installer for a blank CMMS instance, in three layers:

| Layer | Path | What it is |
|---|---|---|
| Engine | `install.ps1` | One self-contained PowerShell script: detect-and-report preflight, bundle integrity, copy, `.env`, npm/Prisma/migrate, Windows service registration, health. |
| Harness | `tests\run-tests.ps1` | Runs the engine against a throwaway database and asserts the contract. Never part of a production install. |
| Admin helper | `admin\create-admin.cjs` | Creates the first Administrator in a blank database, using the installed backend's own Prisma client and bcrypt. |
| Wizard | `wizard\CommandPulse.iss` | Inno Setup 6 wrapper that collects the parameters and calls the engine. |

The wizard is optional: the engine is parameterised end to end, so the same script
runs from the wizard, from an IT runbook, or from a CI job.

The wizard probes the database when the database page is answered: a name that
does not exist is created, an existing CommandPulse database needs an explicit
Yes before it is upgraded, and a database this installer does not own is refused.
It also refuses a database page whose name is empty, validates the API port
range, and stops with a non-zero engine exit code instead of reporting a
successful install. The engine itself repeats the classification and refuses an
API port that is already listening, so the health check cannot be answered by
another service.

## Where the wizard puts its files

The wizard keeps Inno Setup's **Select Destination Location** page. That page
chooses where the setup program's own payload goes - the engine, the service
scripts, the vendored WinSW wrapper, the admin helper and this README - and
defaults to `C:\Program Files (x86)\CommandPulse\CMMS` on a 64-bit host. It does
**not** choose where the application is installed: that is the Source Bundle
page, and the bundle's `backend\`, `frontend\` and documents are copied there.

On a production server the two locations are different by design: the payload is
a fixed copy of the installer, and the application sits in its own directory.
When the Source Bundle page points at this repository - as it does on the
development host - the run leaves a second tree under `Program Files (x86)`.
That copy is inert and safe to leave; it is not the running application and it is
not a second installation. Delete it only after checking the services' WinSW
wrapper paths, which point at the install root, not at `{app}`.

## Build the wizard

`build-wizard.ps1` locates `ISCC.exe` (on `PATH`, in `%LOCALAPPDATA%\Programs\Inno Setup 6`,
or in Program Files) and compiles to `installer\out\`:

```powershell
& ".\installer\build-wizard.ps1"
# or: & ".\installer\build-wizard.ps1" -OutputDir "D:\build\cmms" -IsccPath "C:\path\to\ISCC.exe"
```

The compiled `Setup_CommandPulse.exe` is gitignored. From v1.6.3 it is published at the
root of the release bundle and listed in that bundle's `SHA256SUMS.txt`, so the
verified artifact travels with the files it installs. The wizard looks for
`<setup folder>\CommandPulse-CMMS-v<version>` first and falls back to the setup
program's own folder, so it works both when the setup program sits beside the
extracted bundle and when it sits inside it.

### Reproducible builds

The setup program must be a function of the commit that ships it: build the tag
twice, on two machines or two checkouts, and the bytes must match. Two things
made that untrue up to v1.6.9, and both are now pinned rather than left to the
developer's machine.

- **Line endings.** ISCC embeds the files named in `[Files]` byte for byte.
  `installer\.gitattributes` sets `eol=lf` for this directory, so a clone, a
  worktree and a CI checkout all hand it the same bytes. Without that rule a
  checkout inherits `core.autocrlf`; rebuilding the v1.6.9 tag from an LF
  checkout and from a normal CRLF checkout gave 2,327,289 and 2,327,521 bytes.
- **Timestamps.** ISCC records each source file's last-write time in the setup
  data, so identical bytes built from the working tree and from a fresh
  extraction of the same commit differed by checkout time (2,327,324 against
  2,327,289 bytes). The script now copies only the `[Files]` entries into
  `installer\out\.stage` and stamps every one with a fixed date before
  compiling, so the checkout's mtimes never reach the artifact and a stray file
  in a glob cannot either.

The script refuses to compile from a tree with uncommitted or untracked changes
under `installer\` (pass `-AllowDirty` for a throwaway build you will not
publish) and refuses a payload file that is not LF, naming the files to
re-materialise. It prints the commit, the ISCC version parsed from the compiler
banner, and a SHA-256 digest over the payload, then the hash of the compiled
program:

```text
Commit  : <40-hex commit>
Tree    : clean
Payload : <64-hex digest> (13 entries, LF, mtime 2020-01-01 00:00:00)
ISCC    : <resolved ISCC.exe path>
Source  : ...\installer\out\.stage\installer\wizard\CommandPulse.iss
Version : Inno Setup 6.7.3
SHA256  : <64-hex hash of Setup_CommandPulse.exe>
```

A release build is: check out the tag, confirm `Tree : clean`, build twice into
two output directories, and confirm the two `SHA256` lines are equal. That hash
is what the bundle records. A different compiler version is a different
artifact even from the same payload, so the version is recorded beside it.

## Quick start (blank install)
```powershell
# From an elevated PowerShell window
& "C:\path\to\installer\install.ps1" `
  -SourceBundle "C:\path\to\CommandPulse-CMMS-v1.6.7" `
  -InstallRoot "C:\CMMS" `
  -PgHost "localhost" -PgPort 5432 -PgUser "postgres" -DbName "cmms" `
  -PgPasswordEnv "CMMS_PGPASSWORD" `
  -ApiPort 4000 -BindHost "127.0.0.1" -SiteName "cmms.local" `
  -Mode full
```

The PostgreSQL password is never passed on the command line, where it would be
visible in the process list. Supply it either as a `SecureString`
(`-PgPassword`) or through the name of an environment variable
(`-PgPasswordEnv`).

## Parameters
| Parameter | Default | Meaning |
|---|---|---|
| `-SourceBundle` | (required for `full`) | Folder holding the published bundle, with `SHA256SUMS.txt` |
| `-InstallRoot` | `C:\CMMS` | Where the application is installed |
| `-PgHost` / `-PgPort` / `-PgUser` | `localhost` / `5432` / `postgres` | PostgreSQL target |
| `-PgPassword` | - | Password as a `SecureString` |
| `-PgPasswordEnv` | - | Name of an environment variable holding the password |
| `-DbName` | `cmms` | Database to use. Classified by state before anything is copied: absent is created, empty is migrated, an existing CommandPulse database needs `-AllowExistingDatabase`, a foreign one is always refused |
| `-ApiPort` | `4000` | Port the API listens on |
| `-BindHost` | `127.0.0.1` | Address the API binds to |
| `-SiteName` | `cmms.local` | Host name used for CORS and the optional IIS site |
| `-SitePath` | resolved from `-SiteName` | Folder the web server serves. The engine asks IIS for the site's physical path and replaces its `assets\`, keeping the host's own `web.config`; pass this where the browser's host name is not the IIS site name |
| `-CorsOrigins` | derived from `-SiteName` | Explicit CORS origin list |
| `-AppNamePrefix` | (none) | Prefix for the Windows service names; also used to find a legacy PM2 pair from a 1.6.x install |
| `-ServiceAccount` | `LocalSystem` | Account the two services run as. `LocalSystem` starts at boot with no password |
| `-ServiceAccountPassword` | (none) | Password for a non-built-in `-ServiceAccount`, as a `SecureString` |
| `-DependOnPostgres` | off | Add an SCM dependency from the CMMS services to the local PostgreSQL service. Off by default; see [Windows services](#windows-services) |
| `-PrismaEnginesPath` | (none) | Folder holding prebuilt Prisma engine binaries |
| `-AdminFile` | (none) | JSON file with the first Administrator: `{"username","fullName","email","password"}`. The wizard always supplies it; a headless install may omit it and the database is then left with no user. |
| `-Mode` | `full` | `full`, `verify`, `uninstall` or `probe` |
| `-ProbeOut` | (none) | With `-Mode probe`, write the classification as one JSON object to this path |
| `-AllowExistingDatabase` | off | Permit the install to apply migrations to an existing CommandPulse database |

## Database target policy
The engine decides what to do from the state of the database on the server, not from
its name. The check runs before any file is copied, so a refusal leaves the host and
the database untouched.

| State | How it is recognised | Without `-AllowExistingDatabase` | With it |
|---|---|---|---|
| `Absent` | no row in `pg_database` | create it, then migrate | create it, then migrate |
| `Empty` | exists, 0 tables in `public` | migrate | migrate |
| `CommandPulse` | `public._prisma_migrations` exists | **refuse, exit 4** | migrate (upgrade) |
| `Foreign` | exists, tables, no migration history | **refuse, exit 4** | **refuse, exit 4** |

`cmms` is not special-cased any more: it is refused when it exists as a CommandPulse
database, which is exactly the state that matters, and it is created on a host that
has never run CommandPulse. `-Mode probe` returns the same four-way classification
without writing anything, which is how the wizard asks before it upgrades.

## Modes
- `full` - preflight, verify bundle, classify/create the database, copy files, generate .env (ACL-locked), install dependencies, prisma generate, prisma migrate deploy, register and start the Windows services, verify health, deploy the compiled frontend to the web server. An upgrade stages the dependencies while the running services keep serving, and accepts an API port held by this install's own application (a `CommandPulseCMMS*.exe` wrapper's node child, or a legacy PM2 process) because it replaces that application in place. Any other listener on the port is refused, so the health check cannot be answered by a different service.
- `verify` - run health checks against an existing install (no file copy, no migrations).
- `uninstall` - remove engine-created artifacts only (does not drop the database).
- `probe` - classify the target database and write `-ProbeOut` JSON; copies nothing and writes nothing.

## Upgrades
The engine treats an existing CommandPulse database with `-AllowExistingDatabase` as an
upgrade, and the steps that can take minutes run while the old application keeps
serving:

1. `backend\.env` is copied to `backend\.env.bak.<RunStamp>` and the copy is given the
   same ACL as the original before `.env` is rewritten. The five most recent backups are
   kept; older ones are removed.
2. `npm ci`, `prisma generate` and `prisma migrate deploy` run against a staged copy in
   `backend\.install-stage`, with the install's own `.env`. A failure there leaves the
   installed application and its `node_modules` untouched and still running.
3. The replacement service is rendered from a template (`installer\service\Install-CmmsServices.ps1`) and validated before anything is stopped. A registration failure leaves the existing service untouched: the new wrapper is not installed until the XML is complete.
4. The applications are stopped only for the dependency swap, which is two directory renames (retried for several seconds, because the running process holds the Prisma engine DLL). Both services are then started again; if the start does not reach `Running` and answer its health check, the engine restores the previously installed dependencies and reports failure.
5. The compiled frontend is deployed to the folder the web server actually serves,
   after the new API answers its health check, so the browser never gets a new build
   pointed at an old backend. A failure there exits 5 while leaving the application
   running.

## Windows services
The installer registers two services from a vendored WinSW wrapper
(`tools\winsw\WinSW.NET461.exe`, MIT, .NET Framework 4.6.1+, no network access
needed):

| Service | Script | Start | Account |
|---|---|---|---|
| `CommandPulseCMMSAPI` | `backend\dist\index.js` | Automatic | `LocalSystem` |
| `CommandPulseCMMSWorker` | `backend\dist\worker.js` | Automatic | `LocalSystem` |

Both start at boot with nobody logged on. Each `*.xml` beside the wrapper under
`backend\service\` fixes the working directory to `backend` (Prisma reads
`.env` relative to it), sets `NODE_ENV=production`, and gives only the API
`PORT`/`BIND_HOST`. WinSW restarts a crashed child with a 10/30/60 s backoff and
then keeps retrying; `stoptimeout` is 20 s. Logs roll by size in `backend\logs\`
(10 MB, eight files).

**Default: no PostgreSQL dependency.** The API does not query the database at
boot (Prisma connects lazily and `/api/health` is database-free), and the worker
is retried indefinitely until PostgreSQL appears. A hard dependency would let a
slow PostgreSQL crash recovery block the API entirely - which happened on
2026-11-03. `-DependOnPostgres` opts into SCM ordering when the site's
PostgreSQL service starts reliably.

A `SYSTEM` Scheduled Task `CommandPulse CMMS Health Watchdog` polls
`/api/health` every five minutes and restarts the API after three consecutive
failures; see `service\health-watchdog.ps1`.

## Prerequisites (detected, not auto-installed)
- Node.js >= 24
- npm >= 9
- .NET Framework >= 4.6.1 (WinSW wrapper), included on Windows 10 / Server 2016+
- An elevated PowerShell window (registering a service needs it)
- PostgreSQL >= 15 client tools on PATH or known install location
- IIS (optional; warned only)
- IIS URL Rewrite (optional; warned only)
- IIS ARR (optional; warned only)

## What the engine creates
```
<InstallRoot>\
  backend\      application, node_modules, .env, logs\, uploads\, service\ (generated)
  frontend\     the published frontend sources
  site\         the built frontend (index.html, assets\, web.config) ready for IIS
  docs\, ops\, migration-templates\
```

`backend\service\` is generated by the installer and is gitignored: it holds the
WinSW wrapper copies and their XML. Do not edit it by hand; re-run the installer.
The service XML is the authority for port, bind address, environment and
dependency.

`site\` is the install's own copy of the compiled frontend. On a host where IIS
already serves the site, the engine also updates that site's physical folder
(`-SitePath`, or the path recorded for `-SiteName`), replacing `assets\` and
verifying every copied file by SHA-256; the site's `web.config` is kept because
it carries the host's proxy binding. If no site can be resolved the engine logs
a warning and leaves the web server alone rather than guessing a path.

## First Administrator
A migrated database has no users, and the application only lets an existing
Administrator create accounts, so a blank install would be unreachable. After
`prisma migrate deploy` and before the services start, the engine runs
`admin\create-admin.cjs` from the installed `backend` directory:

- the helper resolves `@prisma/client` and `bcryptjs` from the installed
  application, so the stored hash is what the API's `bcrypt.compare` expects
  (cost 10);
- the row is `role = 'Administrator'`, `isActive = true`,
  `createdBy = 'installer'`;
- the account is written once. If an active Administrator already exists the
  helper exits 10 and the engine logs a warning and continues; a username
  already in use exits 11 and fails the install; rejected details exit 12.

The password never travels on a command line or in the environment. The
wizard writes all four fields as JSON into a random-named, ACL-restricted temp
file, the engine reads it, and the password is piped to the helper on stdin.
The engine deletes the file as soon as it has read it, and the wizard deletes
it after the engine exits and again on abort. Neither the password nor a
password hash is written to the install log.

The wizard's page enforces the same rules the helper re-checks: username
3-32 characters of `A-Z a-z 0-9 . _ -`, a single email address, and a password
of at least 12 characters that differs from the username and is not a common
default. The application's own login policy still applies after that.

## Service names
Two installs on one host are told apart by their service names, not by a shared
process manager:

- without `-AppNamePrefix` the services are `CommandPulseCMMSAPI` and
  `CommandPulseCMMSWorker`
- with `-AppNamePrefix "cmms2-"` they become `CommandPulseCMMScmms2API` and
  `CommandPulseCMMScmms2Worker` (the prefix is stripped to alphanumerics)

The same prefix is used to find and stop a legacy PM2 pair (`cmms2-api`,
`cmms2-worker`) from a 1.6.x installation. Uninstall removes only the services,
watchdog task and PM2 names that install owns; it never runs `pm2 kill`, which
would stop every application in the daemon.

## Security
- `.env` is generated with a fresh CSPRNG JWT_SECRET and ACL-locked to SYSTEM, BUILTIN\Administrators, and the dynamically resolved current user. No hardcoded usernames.
- The resolved PostgreSQL password is redacted from the install log and from every captured command-output file. `pm2 jlist` is not used: PM2 returns the full environment block of every application, which is how an earlier revision wrote `PGPASSWORD` to disk. The service account password is passed to the service script in the environment, never on a command line.
- The live database `cmms` is never targeted by tests; the harness creates and drops a throwaway database. The engine classifies `-DbName` before it copies anything, so an existing CommandPulse database (including `cmms` on this host) is refused with exit 4 unless `-AllowExistingDatabase` is passed, and a database with tables but no CommandPulse migration history is refused with or without it.
- No dumps, client data, or production secrets are copied. Only files the bundle itself carries are removed, so a `database\` folder or `*.sql` dump that was already in the install root belongs to the operator and is left in place; the Prisma migrations under `backend\prisma\migrations\` are kept, because they are the schema history the install applies.
- An upgrade backs up `backend\.env` to `.env.bak.<RunStamp>` before rewriting it, gives the copy the same ACL, and keeps the five most recent backups. `Copy-Bundle` never deletes either name.
- The first-Administrator password is registered with the same redaction list as the PostgreSQL password, and it is passed to the helper on stdin only. The Administrator JSON temp file is ACL-restricted to the installing account, deleted by the engine and again by the wizard.

## Timeouts
Every external command runs under a hard timeout and is killed if it exceeds
it, so a stalled download cannot leave the installer hanging: `npm ci` 1800s,
`prisma generate` and `prisma migrate deploy` 900s, the service script 1800s.

## Logs
Logs are written to `%ProgramData%\CommandPulse\logs\install-<timestamp>.log`.

Logs written before the redaction fix still contain the PostgreSQL password.
`tools\Redact-InstallerLogs.ps1` reports them by file name and occurrence count;
`-Apply` rewrites the value to `***`. Redaction does not make a leaked password
safe, so rotate the database credential after running it.

## Tests
`tests\run-tests.ps1` runs the engine against a throwaway database and a
scratch install root, then asserts the contract. It does not pre-create the
database: the first install proves the engine creates an absent target. It then
checks the other three states - probe reports `CommandPulse`, `Empty` and
`Foreign`; an existing CommandPulse database is refused with exit 4 without the
switch and upgraded with it; a foreign database is refused even with the switch
and its table survives. It gives the install a unique Windows service name
prefix and removes only those services and that watchdog task afterwards; it
never runs `pm2 kill`, and it asserts that the live install's own services are
untouched and still serving.

The verdict is written to `%ProgramData%\CommandPulse\logs\installer-test-<timestamp>.log`
next to the engine log. That file starts with the throwaway database name and the
service prefix, then records every assertion and the final `RESULT:` line, so a run
is auditable after the console closes.

The harness also supplies a random Administrator password and asserts that the
account exists with a bcrypt hash, that `POST /api/auth/login` returns a token
for it, that a wrong password is rejected with 401, and that the password does
not appear anywhere in the install log.

A final section upgrades the same install in place with the engine's `full` mode
and asserts the properties the 2026-11-01 live upgrade did not have: the API
service's wrapper pid changes without the service disappearing (a 250 ms health
poller records the gap), the service still runs this install's wrapper, `.env.bak.<stamp>`
holds the previous JWT secret while the live `.env` holds a different one, the
operator's `.sql` dumps and `database\` folder survive, the staging folder is
removed, and the folder the web server serves matches the new build while keeping
its planted `web.config`.
