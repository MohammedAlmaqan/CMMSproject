# Release notes

What changed in each release, most recent first. Every entry corresponds to
commits on `main`; the CI run at the tagged SHA is the evidence that the tree
was green when the tag was cut.

## v1.6.5

A manual end-to-end pass against v1.6.4 (`docs/E2E_V164_FINDINGS_PHASE1.md`)
found fourteen defects. This release closes all of them, tracked row by row in
`docs/E2E_V164_REMEDIATION_TRACKER.md`. Most were gaps between the API and the
screen: the endpoint existed, the dialog existed, and nothing in the interface
reached either. Two were not: a credential file travelled inside the handover
bundle, and the bundle's documentation was stale in a way no check could catch.

Application code is no longer frozen; the installer workstream's freeze ended
with this pass.

### What a user will notice

- **Sign out is in the sidebar, for every role.** The only Sign Out control was
  on `/administration`, which has an Administrator floor, so Technician,
  Requester, Maintenance Supervisor and Maintenance Planner had no in-app way to
  end a session. The profile block above it was a button that navigated to
  `/administration` for everyone, which for five of six roles was a dead click
  that redirected to `/dashboard` without explanation; it is now a display
  block, and the role-filtered navigation list already carries the Administration
  link. `d6518d8`.
- **An Administrator can reset a user's password.** The users table offered Edit
  and Deactivate only, so an account could be created and then never recovered.
  A per-row Password action mounts the existing dialog in `adminMode`, which
  posts `newPassword` alone and never asks for a current password the
  Administrator does not know. The dialog's header comment claimed this wiring
  already existed, which is why the gap survived review; the comment is
  corrected. `f2dac8e`.
- **The work-order header is editable.** Neither the supervisor nor the planned
  dates had an edit affordance after creation, so reassigning a job or moving a
  schedule was an API task. The details band gains **Edit details**, gated to
  Maintenance Supervisor, Maintenance Planner and Administrator; Technician is
  excluded deliberately. A finish before the start is refused, and the fields
  round-trip in local time rather than through a UTC slice that would shift every
  schedule by the viewer's offset. `a5c31c9`.
- **Scheduling collects the plan.** Both places that offer Schedule - the detail
  header and the list row - now open one dialog and send `plannedStart` and
  `plannedFinish` as part of the same status transition, so a scheduled job has a
  schedule. One request, one transaction, one audit entry. `9fac75f`, `d66dc84`.
- **Import and Export on four registers.** Equipment, Materials, Work Orders and
  Functional Locations share one toolbar and one contract: columns by name,
  `?dryRun=1` for a dry run, and one result shape of `created`, `updated` and
  `rejected[{row, reason}]`. Equipment and Materials reject the whole file when a
  row is bad; Work Orders and Functional Locations keep the rows they accepted
  and name the rest. `7b85685`, `d6eba45`, `258660e`. Documented in
  `docs/USER_MANUAL.md` section 3.4 and `docs/API_REFERENCE.md`.
- **One password floor, 12 characters.** The installer has always required 12;
  the API accepted 8, and three inputs in the app were labelled accordingly. A
  policy with two answers is not a policy, so the API and the UI were raised to
  the installer's floor and the refusal now states it. Existing shorter passwords
  still sign in - only creation and change are gated, so nobody is locked out
  mid-session. `5e8c062`.

### What an operator or reviewer will notice

- **The install root no longer carries a look-alike `.env`.** `Copy-Bundle`
  copied the whole `backend` folder and removed only `.env.deploy`, so
  `backend\.env.example` landed beside the generated file, opening with "Copy this
  file to .env" and carrying `your_password`. Every `backend\.env.*` is now
  removed rather than named one at a time, and the generated file is asserted
  complete before its ACL is applied: a surviving `__TOKEN__` or sample value
  fails the install with the cause named. `9c14f53`. This is the most plausible
  explanation for the v1.6.4 manual test's report of an installer `.env` full of
  placeholders; the generator was not at fault.
- **A credential file no longer ships.** The v1.6.4 bundle contained
  `backend\.env.deploy` - a 64-character `JWT_SECRET` and a `DATABASE_URL`
  naming database `cmms` - and `SHA256SUMS.txt` attested it by hash, so it was
  delivered as part of the release. `.gitignore` listed `.env` and
  `.env.local`, which does not cover `.env.deploy`. `.gitignore` now ignores
  `.env.*` and re-includes `.env.example`, at every depth, and
  `scripts/verify/verify_bundle.py --secrets` fails if an assembled bundle
  contains any `.env*` other than the sample. `3d6126c`.
- **The bundle's documentation is gated against its tag.** The v1.6.4 bundle
  carried documents from three different tags: `INSTALLATION_GUIDE.md` and
  `RELEASE_NOTES.md` were v1.6.3's, `GO_LIVE_CHECKLIST.md` matched neither and
  still said go-live had not happened, and only `ADMIN_GUIDE.md` and
  `USER_MANUAL.md` were v1.6.4's. The bundle is assembled by copying files out of
  a working tree, so whatever a developer had open travelled with it and nothing
  failed. `scripts/verify/verify_bundle.py` now compares all 11 shipped documents
  and `docs/images/*` against `git show <tag>:<path>`, normalising only a UTF-8
  BOM and CRLF; `--sync` repairs a drift from the tag rather than by hand.
  Re-derived against the preserved v1.6.4 bundle it reports the real defect:
  27 OK, 3 drift. `9450462`.
- **Mojibake is gone from the handover documents.** 38 runs of UTF-8 text that
  had been decoded as CP1252 were repaired in five files, including two that were
  visible on screen: the material line and the attachment separators on the
  equipment detail page. The installer tracker had been through the corruption
  twice, so its dashes were eight characters wide rather than three. Repaired by
  round-tripping each run back through CP1252, not by substitution. Leading
  byte-order marks on seven files are valid UTF-8 and were left alone. `693bbb1`.
- **v1.6.4 has release notes.** The tag shipped without an entry, and the commit
  titled "docs: add v1.6.4 release notes" changed three lines, all three turning
  an em dash into mojibake. The section is written from the six commits the tag
  contains and says so. The two misleading v1.6.4 commit messages are recorded as
  installer-tracker rows I-25 and I-26 rather than rewritten. `d630e12`,
  `78528a5`.

### Verification

`scripts/verify/verify_a1.py` (214 clause rows), `verify_a1_dispositions.py`
(77 of 77 rows dispositioned) and `verify_openapi.py` (150 operations across 95
paths) pass. Backend suite: 88 files, 1205 tests. App suite: 29 files, 177 tests.
The CI run at the tagged SHA is the evidence, not this paragraph.

### Known open items

Not fixed here, and not claimed as fixed:

- A work order may still be moved to `Scheduled` through the API with no dates.
  The dialog requires both, but the API does not (F5 option C was considered and
  not adopted, as the plan is often agreed after the job is queued).
- `PUT /api/work-orders/{id}` still has a Technician floor. Field-level
  authorisation does not exist in that route, so tightening it would also stop a
  technician editing a description; the Supervisor/Planner/Admin rule for the
  header edit is enforced in the UI only.
- CSV import/export remains absent for Work Centers, Crafts, Task Lists, Safety
  Checklists, Code Lists and Maintenance Plans - both the UI and the backend
  routes. The shared factory makes each one small; they were not approved for
  this release.
- Whether the `JWT_SECRET` and database password that travelled in the v1.6.4
  bundle are treated as disclosed is an owner decision. Neither value matches the
  current live configuration, but the file was delivered.

## v1.6.4

The installer could produce an installation nobody could sign in to. A migrated
database has no users, and the API only lets an existing Administrator create
accounts, so a blank install had no way past the login screen. This release
closes that gap. Application code (`backend/`, `app/`) is unchanged from v1.6.3.

- **The installer creates the first Administrator.** A new helper,
  `installer/admin/create-admin.cjs`, is copied into the installed backend and run
  from there, so `@prisma/client` and `bcryptjs` resolve from the application's
  own `node_modules` and the hash is the one the API would have written (bcrypt,
  cost 10). It writes one Administrator and refuses to write a second: an
  existing active Administrator is exit 10 and leaves the database untouched, a
  taken username is exit 11, rejected details are exit 12. `db33058`.
- **The credentials are not exposed on the way in.** The account travels as one
  JSON object on stdin - never in `argv` and never in the environment, so it
  cannot be read from the process list or a PM2 environment dump - and the
  ACL-restricted temp file it arrives in is deleted after the copy. The install
  log records that an Administrator was created, not the password. `db33058`,
  `install.ps1`.
- **The wizard asks for the account.** A new **Administrator Account** page
  collects username, full name, email, password and a confirmation, and validates
  them before the page turns: username 3-32 characters from letters, digits, dot,
  underscore and hyphen; a well-formed email; a password of at least 12
  characters, not the username itself and not one of the common defaults. The
  password fields are masked and repeated. `75ab60d`.
- **The installer harness covers it.** `installer/tests/run-tests.ps1` now tests
  the contract end to end: the `User` row exists as an active Administrator, the
  stored hash is bcrypt rather than plaintext, the temp file is gone, the account
  signs in and comes back with the Administrator role, and a wrong password is
  refused with 401. `7238b6a`.
- **The guide tells operators to use it.** `docs/INSTALLATION_GUIDE.md` gains a
  **First sign-in** section: sign in with the account the installer created, and
  do not rely on the `admin` / `password` demo seed, which exists only for
  development and must not survive on a real deployment. `da42aea`.
- **Released as 1.6.4.** Wizard version bumped in `d5741a1`.

Written 2026-10-25, after the tag: v1.6.4's last commit was titled "docs: add
v1.6.4 release notes" and added none, so this section is derived from the six
commits the tag contains rather than from any message about them. Recorded as
tracker I-25 in `docs/INSTALLER_TRACKER.md`.

## v1.6.3

The installer workstream, closed. The standalone installer under `installer/` is
tracked in `docs/INSTALLER_TRACKER.md`. Application code (`backend/`, `app/`) is
unchanged from v1.6.2; this release is the installer and the bundle it delivers.
This section was listed as `Unreleased — installer workstream` before the tag
was cut.

- **The wizard now runs its page setup.** It declared `OnInitializeWizard`, which
  Inno never calls, and cast each page edit to `TEdit`, which raised
  `Cannot cast an object`; the defaults were written to a `TEdit` that does not
  exist and the password read back from it was always empty. The setup is now an
  `InitializeWizard` procedure, and every default and read uses `Page*.Values`.
  `9de8853`.
- **The install step no longer fails with a type mismatch.** The password temp
  file name used `GetDateTimeString('hhmmss', '', '')`; the separator and
  placeholder arguments must be characters, so the Install click aborted with
  `Type Mismatch`. It now passes `#0, #0`. `9de8853`.
- **The wizard finds its bundle beside or inside the setup program.** When the
  compiled setup sits at the bundle root, the old unconditional
  `<setup folder>\CommandPulse-CMMS-v<version>` default pointed at a folder that
  cannot exist; the default now prefers that sibling folder when it exists and
  falls back to the setup program's own folder. `4bc446f`.
- **Verified end to end on 2026-10-22.** The compiled wizard was driven through
  every page; the engine log records the values the GUI collected (database
  `cmms_wizard_test`, API `http://127.0.0.1:4111`, a scratch install root), the
  health check returned 200, and the throwaway applications, database and files
  were removed afterwards. Evidence: `9de8853`.
- **The bundle ships the verified setup artifact.** From this release
  `Setup_CommandPulse.exe` is published at the bundle root and listed in
  `SHA256SUMS.txt`, so the artifact that was tested is the artifact the client
  receives. This supersedes the v1.6.2 posture, where the exe was deliberately
  left outside the manifest (tracker I-20).

Earlier corrective work in this workstream:

- **Credentials are redacted from install logs**, and logs written before the
  fix are scrubbed by `installer/tools/Redact-InstallerLogs.ps1` (report by
  default, `-Apply` to rewrite). `474490f`, `a812729`.
- **The engine states that `cmms` is its default target** instead of claiming the
  live database is never touched. `e64ed82`.
- **The wizard no longer defaults to the live database** (`cmms_install`, with
  `cmms` refused), refuses a port that is already serving, aborts when the engine
  fails, hands the password over in a randomly named ACL-locked temp file, ships
  no test harness and no shortcuts to files it does not install, resolves the
  default bundle beside Setup, and builds reproducibly into `installer/out`.
  `678c0fb`, `5b32a30`, `2000964`, `1a845dd`, `75a4146`, `bfc0a24`, `851520f`,
  `51ed695`.
- **The harness persists its verdict** next to the engine log and derives the
  bundle path instead of hardcoding a developer machine. `4caab81`, `ac26583`.
- **CI has an Installer job**: every `installer/*.ps1` must parse, no `C:\Users\`
  developer path may appear, and the tracker must validate. `ac26583`.
- **Docs reconciled with the live host**: go-live ran 2026-10-17, `cmms` is 22/22
  migrations, the finalization tracker headline is current, and the decision
  register names `v1.6.2` (`a8a4223`) as the code anchor.

## v1.6.2

A security patch: one code default made fail-safe, and the filesystem access to
the credentials file restricted. Behaviour is unchanged for the documented
IIS-behind-reverse-proxy deployment.

- **`BIND_HOST` defaults to `127.0.0.1`.** `backend/src/index.ts` bound `0.0.0.0`
  by default, relying on `backend/.env` (or the PM2 ecosystem file) to set
  loopback. A deployment that omitted the variable — or launched the API from a
  working directory where `.env` is not picked up — bound every interface and
  exposed port 4000. With `trust proxy = 1`, a client that can reach port 4000
  directly can spoof `X-Forwarded-For` and defeat the login rate limiter, so the
  default is now loopback-only and `0.0.0.0` is an explicit opt-in for
  direct-access development. `d4288bc`.
- **`.env` access restricted.** `backend/.env` holds `JWT_SECRET`, the sole
  access-token signing key (no denylist, no rotation), so read access to the file
  is privilege escalation. `docs/GO_LIVE_CHECKLIST.md` gains a Security controls
  item restricting `backend/.env` and the bundle's `backend/.env.deploy` to
  SYSTEM / Administrators / the service account with inheritance removed.
  `a8a4223`.

Operational closure on the live host (2026-10-21), recorded in go-live item 12:
the live `JWT_SECRET` was rotated and PM2 restarted, so all pre-existing sessions
are invalidated; both `.env` files were re-ACL'd, dropping the non-administrator
local-group ACEs.

## v1.6.1

Documentation corrections after v1.6.0. No code, schema, endpoint or behaviour
change; the release touches `docs/` and the root `README.md` only.

- **`.env` loading corrected.** `docs/ARCHITECTURE.md` and
  `docs/INSTALLATION_GUIDE.md` said `backend/.env` was loaded by Node's
  `--env-file` flag. It is loaded by Prisma Client's bundled dotenv loader at
  `new PrismaClient()`; no application `dotenv` call and no `--env-file` flag
  exist. The working-directory consequence (`.env` resolves against the
  process cwd, so the API must launch from `backend/` or `JWT_SECRET` is
  absent and the process exits at boot) is now recorded. `0bbb940`.
- **Project-layout claim corrected.** The root `README.md` project tree called
  `README.md` "the only .md at the root"; `RELEASE_NOTES.md` has been there
  since v1.6.0 and `AGENTS.md` is also present. `69e4ecc`.

The handover bundle for this release additionally ships `IT_DEPLOYMENT_GUIDE.md`
and `backend/.env.deploy` (bundle-only, not tracked in git) and refreshes the
bundled `docs/` copies to match this tree.

## v1.6.0

The **Build Now** set from the Functional Completeness Audit
(`docs/ARCHITECTURAL_EVALUATION.md`, Appendix D). Ten gaps where an already-built,
already-tested API had no screen. Every item is frontend-only: no migration, no
schema change, no new endpoint. Closes G1-G10; the Defer set (G11-G18) is
unchanged.

### Fixed

- **G1 - labour logging for non-admins.** The work-order labour technician picker
  now loads from `GET /api/users/options` (Requester+) instead of the
  Administrator-only `GET /api/users`, so a technician or supervisor can record
  labour again. `425a833`.

### Added

- **G2 - change password.** A self-service **Change password** dialog in the
  global sidebar, calling `PUT /api/users/{userId}/password`; an Administrator
  can reset another user from the same dialog without supplying the current
  password. `45a15d8`.
- **G3 - edit a user.** The Administration users table gains a per-row **Edit**
  control (role, full name, email, work centre, active flag) over
  `PUT /api/users/{userId}`. `7cce927`.
- **G4 - equipment create and edit.** A shared `EquipmentForm` reachable from an
  **Add Equipment** button on the equipment list and an **Edit** control on the
  detail page, covering the `equipmentUpdateSchema` fields including criticality
  `S`/`A`/`B`/`C`. `603e3fa`.
- **G5 - material create and edit.** Row-level create and per-row edit on the
  materials page (code, description, unit of measure, standard cost, current
  stock). No delete button, deliberately - see G16. `c19a8ec`.
- **G6 - work-centre create and edit.** Create and per-card edit on the
  work-centres page (code, name, daily capacity hours, cost rate, active flag);
  retirement is by deactivation, not delete. `f21d286`.
- **G7 - meter readings.** An **Add reading** form in the equipment detail meters
  tab, calling the new `equipmentMeterService.addReading` ->
  `POST /api/equipment-meters/{id}/readings` (Technician+), appending to the
  readings history instead of overwriting the latest value. `192a64a`.
- **G8 - report filters.** A filter bar on the Reports screen (from/to dates,
  functional location, equipment, work centre, include-descendant-locations
  toggle), applied to all seven reports and their `.xlsx` exports. `cb2aa09`.
- **G9 - edit a notification.** An inline edit form on the notification detail
  page (type, priority, description, location, equipment, damages, breakdown
  flag), hidden once the notification is `Converted`. `3929a5f`.

### Removed

- **G10 - dead header controls.** The global header's inert **Filter** and
  **Export** buttons were removed. `e5de737`.

### Notes

- No database change: the release touches the `app/` package only. The API
  endpoints it uses already existed, already ran in production, and are already
  covered by the backend test suite, so no backend test was changed.
- Frontend test count moved 134 -> 153 (component tests for each new control:
  happy path, API error surfaced, role floor hides the control).

## Earlier releases

- **v1.5.0** - UI gap-closure workstream: crafts management screen, cause/failure
  code lists, safety-checklist template editing, the work-order cost-split editor
  and notification delete; plus server-side session security (rotating refresh
  token, revocable logout).
- **v1.4.0** - audit-log retention job, overdue sweep and PM scheduler moved to a
  separate worker process; report SQL views.
- **v1.3.0** - legacy dataset import harness and the reporting views.
- **v1.2.1**, **v1.2.0**, **v1.1.0** - see the tagged commits for detail.
- **v1.0.0** - first release.
