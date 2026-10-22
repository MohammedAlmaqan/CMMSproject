# CommandPulse CMMS installer

This directory contains the installer for a blank CMMS instance, in three layers:

| Layer | Path | What it is |
|---|---|---|
| Engine | `install.ps1` | One self-contained PowerShell script: detect-and-report preflight, bundle integrity, copy, `.env`, npm/Prisma/migrate, PM2, health. |
| Harness | `tests\run-tests.ps1` | Runs the engine against a throwaway database and asserts the contract. Never part of a production install. |
| Wizard | `wizard\CommandPulse.iss` | Inno Setup 6 wrapper that collects the parameters and calls the engine. |

The wizard is optional: the engine is parameterised end to end, so the same script
runs from the wizard, from an IT runbook, or from a CI job.

The wizard refuses the database name `cmms` and a database page whose name is empty,
validates the API port range, and stops with a non-zero engine exit code instead of
reporting a successful install. The engine itself also refuses an API port that is
already listening, so the health check cannot be answered by another service.

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

## Quick start (blank install)
```powershell
# From an elevated PowerShell window
& "C:\path\to\installer\install.ps1" `
  -SourceBundle "C:\path\to\CommandPulse-CMMS-v1.6.2" `
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
| `-DbName` | `cmms` | Database to create/use |
| `-ApiPort` | `4000` | Port the API listens on |
| `-BindHost` | `127.0.0.1` | Address the API binds to |
| `-SiteName` | `cmms.local` | Host name used for CORS and the optional IIS site |
| `-CorsOrigins` | derived from `-SiteName` | Explicit CORS origin list |
| `-AppNamePrefix` | (none) | Prefix for the PM2 application names |
| `-PrismaEnginesPath` | (none) | Folder holding prebuilt Prisma engine binaries |
| `-Mode` | `full` | `full`, `verify` or `uninstall` |

## Modes
- `full` - preflight, verify bundle, copy files, generate .env (ACL-locked), npm ci, prisma generate, prisma migrate deploy, pm2 start+save, verify health. It refuses an API port that is already listening, so the health check cannot be answered by another service.
- `verify` - run health checks against an existing install (no file copy, no migrations).
- `uninstall` - remove engine-created artifacts only (does not drop the database).

## Prerequisites (detected, not auto-installed)
- Node.js >= 24
- npm >= 9
- PM2 (global)
- PostgreSQL >= 15 client tools on PATH or known install location
- IIS (optional; warned only)
- IIS URL Rewrite (optional; warned only)
- IIS ARR (optional; warned only)

## What the engine creates
```
<InstallRoot>\
  backend\      application, node_modules, .env, logs\, uploads\
  frontend\     the published frontend sources
  site\         the built frontend (index.html, assets\, web.config) ready for IIS
  docs\, ops\, migration-templates\
```

`backend\ecosystem.install.config.cjs` is generated next to the shipped
`ecosystem.config.cjs`. The shipped file pins `PORT` and `BIND_HOST`, and PM2
applies the ecosystem `env` over the process environment, so an install on a
different port needs its own ecosystem file. The shipped file is never
modified. The generated file must keep the `.config.cjs` naming: PM2 only
treats a file with that pattern as an ecosystem definition, and starts a
plain `.cjs` file as an application script.

## PM2 application names
On Windows PM2 keeps a single daemon per user account. `PM2_HOME` relocates
PM2's logs and `dump.pm2` but it does not create a second daemon, so two
installs on one host share one process table. The application name is the only
thing that keeps them apart:

- without `-AppNamePrefix` the names are `cmms-api` and `cmms-worker`
- with `-AppNamePrefix "cmms2-"` they become `cmms2-api` and `cmms2-worker`

An install replaces any existing application that already holds one of its
names. Uninstall deletes only the names that install owns; it never runs
`pm2 kill`, which would stop every application in the daemon.

## Security
- `.env` is generated with a fresh CSPRNG JWT_SECRET and ACL-locked to SYSTEM, BUILTIN\Administrators, and the dynamically resolved current user. No hardcoded usernames.
- The resolved PostgreSQL password is redacted from the install log and from every captured command-output file. `pm2 jlist` is not used: PM2 returns the full environment block of every application, which is how an earlier revision wrote `PGPASSWORD` to disk.
- The live database `cmms` is never targeted by tests; the harness creates and drops a throwaway database. The engine itself writes only to `-DbName`, which defaults to `cmms` - on the live host that is the production database, so a test or side-by-side install must pass a new name, and the engine warns when `cmms` is selected.
- No dumps, client data, or production secrets are copied. The `database\` folder is excluded and the Prisma migrations under `backend\prisma\migrations\` are kept, because they are the schema history the install applies.

## Timeouts
Every external command runs under a hard timeout and is killed if it exceeds
it, so a stalled download cannot leave the installer hanging: `npm ci` 1800s,
`prisma generate` and `prisma migrate deploy` 900s, `pm2` 300s.

## Logs
Logs are written to `%ProgramData%\CommandPulse\logs\install-<timestamp>.log`.

Logs written before the redaction fix still contain the PostgreSQL password.
`tools\Redact-InstallerLogs.ps1` reports them by file name and occurrence count;
`-Apply` rewrites the value to `***`. Redaction does not make a leaked password
safe, so rotate the database credential after running it.

## Tests
`tests\run-tests.ps1` runs the engine against a throwaway database and a
scratch install root, then asserts the contract. It gives the install a unique
PM2 application name prefix and deletes only those names afterwards; it never
runs `pm2 kill`, and it asserts that the live `cmms-api` / `cmms-worker` are
untouched and still serving.

The verdict is written to `%ProgramData%\CommandPulse\logs\installer-test-<timestamp>.log`
next to the engine log. That file starts with the throwaway database name and the
PM2 prefix, then records every assertion and the final `RESULT:` line, so a run
is auditable after the console closes.
