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
| I-07 | Wizard shortcuts and uninstall icon point at files the wizard never installs | Open | Installer | - |
| I-08 | Wizard bundle-path default assumes the `.exe` sits inside the bundle | Open | Installer | - |
| I-09 | Harness verdict and throwaway database name are not persisted | Open | Installer | - |
| I-10 | No CI job covers `installer/` | Open | Installer | - |
| I-11 | Existing `%ProgramData%\CommandPulse\logs` files hold the PostgreSQL password in plaintext | Open | Installer | - |
| I-12 | `docs/GO_LIVE_CHECKLIST.md` says go-live has not happened and that the live DB is at 19/22 migrations | Open | Installer | - |
| I-13 | `docs/CMMS_FINALIZATION_TRACKER.md` headline status and v1.1-23 backlog are stale | Open | Installer | - |
| I-14 | `docs/DECISION_REGISTER.md` still names `v1.2.1` as the current deployment anchor | Open | Installer | - |
| I-15 | `docs/HANDOFF.md` state block predates v1.5/v1.6 and the installer workstream | Open | Installer | - |
| I-16 | `README.md` project layout omits `installer/` | Open | Installer | - |
| I-17 | `RELEASE_NOTES.md` has no installer entry | Open | Installer | - |
| I-18 | Throwaway databases left on the host: `cmms_cutover_clone`, `cmms_cutover_rehearsal`, `cmms_e2e`, `cmms_gate`, `cmms_gate_fresh`, `cmms_installer_test_983071564` | Open | Owner | - |
| I-19 | Wizard compile path is not reproducible; `ISCC.exe` is only at `%LOCALAPPDATA%\Programs\Inno Setup 6` and `OutputDir` was a developer temp path | Open | Installer | - |
| I-20 | Release bundle contained the compiled `.exe` and was outside `SHA256SUMS.txt` | Closed | Owner | Exe moved out 2026-10-22; verified 453 files / 13.66 MB with 452 hashes and 0 problems |

## Closed history

Rows are kept above so the whole workstream is visible in one place. This section records
what a closure actually changed, in order, once the closing commit exists.
