# CommandPulse CMMS Installer (Engine Only)

This directory contains the installer engine for a blank CMMS instance.
The wizard (.exe) is not included yet; run the engine directly with PowerShell.

## Quick start (blank install)
```powershell
# From an elevated PowerShell window
& "C:\path\to\installer\install.ps1" `
  -SourceBundle "C:\path\to\CommandPulse-CMMS-v1.6.2" `
  -InstallRoot "C:\CMMS" `
  -PgHost "localhost" -PgPort 5432 -PgUser "postgres" -DbName "cmms" `
  -PgPassword "..." `
  -SiteName "cmms" -HostHeader "cmms.local" `
  -Mode full
```

## Modes
- `full` - preflight, verify bundle, copy files, generate .env (ACL-locked), npm ci, prisma generate, prisma migrate deploy, pm2 start+save, verify health.
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

## Security
- `.env` is generated with a fresh CSPRNG JWT_SECRET and ACL-locked to SYSTEM, BUILTIN\Administrators, and the dynamically resolved current user. No hardcoded usernames.
- The live database `cmms` is never targeted by tests; use a throwaway database.
- No dumps, client data, or production secrets are copied.

## Logs
Logs are written to `%ProgramData%\CommandPulse\logs\install-<timestamp>.log`.