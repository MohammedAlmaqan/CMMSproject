# Installer workstream tracker

**Opened:** 2026-10-22
**Scope:** `installer/`, the CI gate that covers it, and the documentation that describes
them. Application code (`backend/`, `app/`) is frozen at `v1.6.2` and is out of scope.
**Source of truth:** the repository. Where this table and the code disagree, the code wins
and the table is wrong.

## How to update

- One row per distinct concern. Do not merge concerns to keep the table short.
- `State` is exactly one of `Open`, `In progress`, `Blocked`, `Closed`.
- A `Closed` row carries the commit that closed it, or - for an owner action outside the
  repository - the evidence that closed it. `-` is not evidence.
- Do not delete rows or rewrite a closure. Add a row for follow-up work and leave the
  original in place.
- The table is checked by `installer/tests/check-tracker.ps1` in CI. A malformed row fails
  the build.

## Rows

| ID | Concern | State | Owner | Evidence |
|---|---|---|---|---|
| I-01 | Engine log can carry a child process environment block, including `PGPASSWORD` | Closed | Installer | this commit |
| I-02 | Engine claims the live `cmms` database "is never a target" while defaulting `-DbName` to `cmms` | Closed | Installer | this commit |
| I-03 | Wizard defaults the database name to `cmms` and the API port to `4000`, both of which collide with the live host | Closed | Installer | Default changed to `cmms_install` and `cmms` refused in 678c0fb; occupied-port guard and wizard port validation in this commit |
| I-04 | Wizard ignores the engine exit code and can report success after a failed install | Closed | Installer | this commit |
| I-05 | Wizard writes the PostgreSQL password to an unrestricted plaintext temp file | Closed | Installer | this commit |
| I-06 | Wizard payload ships the engine test harness to the production target | Closed | Installer | this commit |
| I-07 | Wizard shortcuts and uninstall icon point at files the wizard never installs | Closed | Installer | this commit |
| I-08 | Wizard bundle-path default assumes the `.exe` sits inside the bundle | Closed | Installer | this commit |
| I-09 | Harness verdict and throwaway database name are not persisted | Closed | Installer | this commit |
| I-10 | No CI job covers `installer/` | Closed | Installer | this commit |
| I-11 | Existing `%ProgramData%\CommandPulse\logs` files hold the PostgreSQL password in plaintext | Closed | Installer | this commit; `tools\Redact-InstallerLogs.ps1 -Apply` redacted 80 occurrences in 8 files, re-scan clean |
| I-12 | `docs/GO_LIVE_CHECKLIST.md` says go-live has not happened and that the live DB is at 19/22 migrations | Closed | Installer | this commit |
| I-13 | `docs/CMMS_FINALIZATION_TRACKER.md` headline status and v1.1-23 backlog are stale | Closed | Installer | this commit; G.1 marked resolved by G.6, Phase F counts labelled historical with the R.8 recount, v1.1-23 recorded as partly delivered |
| I-14 | `docs/DECISION_REGISTER.md` still names `v1.2.1` as the current deployment anchor | Closed | Installer | this commit |
| I-15 | `docs/HANDOFF.md` state block predates v1.5/v1.6 and the installer workstream | Closed | Installer | this commit |
| I-16 | `README.md` project layout omits `installer/` | Closed | Installer | this commit |
| I-17 | `RELEASE_NOTES.md` has no installer entry | Open | Installer | - |
| I-18 | Throwaway databases left on the host: `cmms_cutover_clone`, `cmms_cutover_rehearsal`, `cmms_e2e`, `cmms_gate`, `cmms_gate_fresh`, `cmms_installer_test_983071564` | Open | Owner | - |
| I-19 | Wizard compile path is not reproducible; `ISCC.exe` is only at `%LOCALAPPDATA%\Programs\Inno Setup 6` and `OutputDir` was a developer temp path | Closed | Installer | this commit |
| I-20 | Release bundle contained the compiled `.exe` and was outside `SHA256SUMS.txt` | Closed | Owner | Exe moved out 2026-10-22; verified 453 files / 13.66 MB with 452 hashes and 0 problems |
| I-21 | Harness default `-SourceBundle` was a developer-machine path | Closed | Installer | this commit |
| I-22 | The PostgreSQL credential was exposed on disk and must be rotated | Open | Owner | - |

## Closed history

Rows are kept above so the whole workstream is visible in one place. This section records
what a closure actually changed, in order, once the closing commit exists.
