# Working notes

Standing rules for how work is done in this repository. Added 2026-10-04 after a
reviewer correction; see "Commit discipline" below.

## Working practice

Recorded 2026-11-09. These are about how a pass is executed, not about what is
correct in the result; the rules below still decide whether a change is right.

- **Search before reading.** Prefer `grep` and symbol search to locate the code
  that matters, then read only the line ranges a hit points at. A whole-file read
  is for a file that is genuinely small or that the task is about end to end.
- **Test narrowly first.** Run the single test, verifier or clause a change
  touches, then the full suite at release and CI gates, or when the change
  plausibly crosses a module boundary.
- **Parallelise independent inspection.** Independent reads, searches and
  checks run together; a sequential chain is for steps that consume each other's
  output.
- **Do not repeat work already on screen.** A command whose result is in the
  transcript, or an unchanged file already read, is not re-run or re-read;
  refer to the earlier result instead.
- **Report at milestones.** Commentary states what changed and what was verified
  once it is true, not a running narration of each attempt.

## Commit discipline

- **Each distinct concern in a prompt is its own commit, even when small.** Do not
  merge unrelated edits into one commit just because they arrived in the same
  message or because splitting feels fussy. A reviewer approving one concern has
  not approved the next one, and a single `git revert` must be able to undo exactly
  one thing.
  - Counter-example, 2026-10-04: normalising nine phrasing sites, expanding the
    v1.1-8 audit entry and recording row 175 as v1.1-9 were committed together as
    `1bc7fc4` (6 insertions / 5 deletions). The reviewer accepted it and set the
    threshold explicitly: small is not a reason to bundle. Group by *concern*, not
    by size.
  - The test to apply: if the owner could plausibly say "I only approved the first
    half", it is two commits.
- One logical unit per commit, and it must leave the tree green. When a status
  change requires verifier expectations to move with it, both belong in the same
  commit — splitting them leaves a red gate in between.
- Never bundle a code change with a docs change unless they are the same concern.
- Before committing, re-read the diff. Do not trust an edit that was made from
  memory of the file's contents; re-read the actual line.

## Verification

- `scripts/verify/verify_a1.py` (clause inventory) and
  `scripts/verify/verify_a1_dispositions.py` (Phase A dispositions) must both pass
  before any commit is reported as done, and the matrix total must stay 214.
- A row closure authorised by an owner decision carries that decision ID and its
  date in the matrix Notes. Where the promotion entry in `verify_a1.py` cannot cite
  its own commit (because the status change and the verifier wiring land together),
  it uses `this commit` — the same sentinel the tracker already uses — and the
  decision ID is the durable anchor. Backfill the real SHA when one exists.
- Re-derive facts from source, never from prose written about that source. A clean
  previous pass is not evidence that the next one is clean.

## Data safety

- **The `cmms` database on `localhost:5432` is the live deployment target and, since
  2026-10-17, holds the Client's operational data.** *Superseded status, kept: this lead
  line read "but it does not yet hold the Client's operational data" until the cutover
  ran.* Corrected 2026-10-17: the B1 full legacy
  load of 2026-10-10 — **20,333 of 20,333 rows at 100.00%** (`1971686`, run 257) — ran in
  a throwaway schema (`cmms_trial_13648_1791663306666`) that the run created, migrated and
  then **dropped**; `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md` records that
  *"nothing in the app's `public` schema was touched"*. Live `cmms` instead held only a
  small dev/demo dataset (≈176 rows on 2026-10-17: `WorkOrder` 9, `Equipment` 5,
  `Notification` 1, `User` 11). The Client dataset reaches `cmms` only through the runbook
  §3 cutover, **executed 2026-10-17** (was *pending*; see `docs/migration-runbook.md`):
  **20,333 of 20,333 rows created, 0 rejected**, one transaction, against the verified
  backup `backups/cmms-2026-10-17-1823.sql`, report
  `docs/migration-templates/CUTOVER_REPORT_LIVE.md`. No seed script
  rebuilds `cmms` and no dump of it is committed to the repository, so a destructive
  statement against it is still neither recoverable nor revertable.
- **Never seed, clear, drop, migrate or write to `cmms` from a test, a repro, a verifier or
  a migration run.** All test and verification work targets a throwaway database made for
  the purpose; `cmms_gate`, `cmms_gate_fresh`, `cmms_c1`, `cmms_c11` and
  `cmms_restore_test` have all been used that way.
  - **The one authorised exception, added 2026-10-17:** the SOW §5.7 cutover loader
    (`backend/src/migration-trial/cutover.ts`) may write the Client dataset into `cmms`.
    It *is* the cutover, not a test, repro, verifier or dry run, and it is the only thing
    permitted to write to `cmms`. It writes only the nine tables the importers own,
    additively, in one transaction that rolls the whole load back on any rejected row; it
    refuses unless `CUTOVER_ALLOW_DB=1` is set and the host is `localhost`, and it refuses
    a second run. A fresh `scripts/backup.bat` snapshot is a precondition of every run.
    Nothing else — not `prisma migrate` or `db push`, not a seed, not a verifier — may
    write to `cmms`.
- **`backend/scripts/gate.mjs` reads `DATABASE_URL`, and `backend/.env` points it at
  `cmms`**, so a gate run with the default environment targets the real database. This is
  the hazard the tracker's E.9 working-practice note names: *"Never point this at the
  developer's `cmms` database"* (`CMMS_FINALIZATION_TRACKER.md`, E.9). Override per command
  with `$env:DATABASE_URL`; do not edit `.env` to repoint the project.
- `backend/tests/load-env.ts` fills only variables that are **unset**, so an explicit
  `DATABASE_URL` in the environment wins over `.env`.
- **Live backup posture (2026-10-17, amended 2026-11-03):** both Step 2 go-live controls
  are now active on this host. The Windows task `CommandPulse CMMS Daily Backup` runs
  `scripts\backup.bat` daily at 02:00. *Superseded 2026-11-03, original kept: it ran "as
  the interactive user `Injaz` (runs only while logged on)" — a recorded deviation from
  the dedicated-service-account template, accepted for this single-user laptop — which is
  why it delivered nothing on 11-02 and 11-03: this laptop sleeps at 02:00
  (`Kernel-Power` id 42).* It now runs as **`NT AUTHORITY\SYSTEM`** (`S-1-5-18`,
  `LogonType=ServiceAccount`, `HighestAvailable`) with `WakeToRun` set and
  `StartWhenAvailable` retained, so delivery no longer depends on anyone being logged on;
  no credential is stored in the task, and `PGPASSWORD` still comes from the
  machine-scoped variable, which SYSTEM inherits. PostgreSQL runs
  `archive_mode=on` with `archive_command` copying each WAL segment to `C:\cmms-wal\wal`
  (`archive_timeout=300`), verified 2026-10-17 (`pg_stat_archiver` `archived_count=1`,
  `failed_count=0`). Go-live detail: `docs/GO_LIVE_CHECKLIST.md` items 2-3.
- **Live application posture (2026-10-17):** *Superseded 2026-11-03 by the entry
  below; kept as written.* PM2 runs both apps from
  `backend/ecosystem.config.cjs` — `cmms-api` (fork, port 4000) and `cmms-worker` (fork)
  are `online` as user `Injaz`, and `pm2 save` wrote `dump.pm2`. IIS serves the frontend
  from `C:\inetpub\cmms-site` (its `web.config` reverse-proxies `/api` to
  `http://localhost:4000`); the stale build was replaced 2026-10-17 with `app\dist` (new
  asset hashes) and verified over `https://cmms.local` (200 for `/`, the JS/CSS/chunk
  assets, `/dashboard` and `/api/health`). PM2 autostart is registered as the *logon*
  Scheduled Task `CommandPulse CMMS PM2 Resurrect` (`pm2 resurrect`), and the firewall
  rule `CMMS API 4000 block external` is active on all profiles — loopback stays reachable
  (Windows Firewall does not filter loopback), so the IIS proxy keeps working. The API is
  pinned to loopback (`BIND_HOST: '127.0.0.1'` in `backend/ecosystem.config.cjs`), so port
  4000 is not externally reachable even without the firewall rule. The worker's PM,
  overdue and audit-retention crons run in `cmms-worker`; it only starts when PM2 counts
  as an entry point, because PM2's fork container sets `process.argv[1]` to its own
  container script rather than `dist/worker.js` (see `backend/src/worker.ts`). No
  boot-order autostart and no service account: both apps run as the interactive user
  `Injaz`.
- **Live application posture (2026-11-03):** the application now runs as two native
  Windows services, not PM2. `CommandPulseCMMSAPI` and `CommandPulseCMMSWorker` are
  `Running`, `StartType Automatic`, account `LocalSystem`, with **no** SCM dependency on
  PostgreSQL, and start at boot with nobody logged on. PM2 entries are gone
  (`dump.pm2` has 0 apps; `dump.pm2.before-services` is the rollback copy) and the
  `CommandPulse CMMS PM2 Resurrect` logon task has been removed. A `SYSTEM` Scheduled
  Task `CommandPulse CMMS Health Watchdog` runs every 5 minutes, polls
  `http://127.0.0.1:4000/api/health` and restarts `CommandPulseCMMSAPI` after 3
  consecutive failures (`backend\logs\watchdog.{log,json}`). `postgresql-x64-18` is
  also under SCM (`Running`/`Automatic`/`NetworkService`); it previously ran as an
  orphaned manual postmaster, so a reboot now brings it up properly. Verified
  2026-11-03 by a simulated reboot: the CMMS services started in 0.9 s **without** the
  database, `/api/health` returned 200, and the worker recovered by itself when
  PostgreSQL arrived. IIS, the firewall rule and the loopback bind are unchanged.
  The services load `backend/.env` because their working directory is `backend`;
  WinSW retries a crashing process indefinitely (proved with a throwaway service:
  9 restarts in 41 s on a single `onfailure restart`). Detail:
  `docs/ADMIN_GUIDE.md` §2.2 and §15, `installer/service/Install-CmmsServices.ps1`.

## Documentation accuracy

- Every count, clause attribution and line-number citation in the docs is a claim
  that can rot silently. `git log -L` on a Notes line tells you when it was last
  written; cross-check against the commits that touched the behaviour it describes.
  This was the `v1.1-8` sweep, closed 2026-10-16 (see the `v1.1-8` row in
  `docs/CMMS_FINALIZATION_TRACKER.md`); the rule remains standing.
- **Dated reconciliations are reference records, not live status pages.** The
  2026-11-09 reconciliation at `v1.6.11` (`3423b89`) lives in
  `docs/PROJECT_STATE_RECONCILIATION.md`: the v1.0 assessment is preserved verbatim and
  later corrections are v1.1 entries under a revision-history table, so a superseded
  finding is never edited away. Its register is as of that date; `SOW_COMPLIANCE.md`,
  `CMMS_FINALIZATION_TRACKER.md` and `verify_a1.py` remain the live authority.
- Preserve history rather than overwriting it. When a figure is superseded, keep the
  original and add a pointer; do not silently restate it.
- Prefer symbolic references ("the `APPROVED_PROMOTIONS` list") over hardcoded line
  ranges, which break without failing when a list grows above them.

## Scope discipline

- Do only what was asked. Open items are not implicitly in scope, and an audit
  finding is not a work order.
- Distinguish engineering calls from scope/acceptance calls, and say which is which
  without deciding the owner's part for them.
