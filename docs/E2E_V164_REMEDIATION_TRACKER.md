# v1.6.5 remediation tracker

Tracks the fourteen findings from the v1.6.4 manual end-to-end test
(`docs/E2E_V164_FINDINGS_PHASE1.md`) through implementation, verification and
release. One row per finding. The **Commit** column is the durable anchor: a row
is only `Closed` when a commit exists that a reviewer can read.

- **Opened:** 2026-10-25
- **Baseline:** `v1.6.4` (`f245123`)
- **Release:** `v1.6.5`
- **Rule:** a row moves to `Closed` in the same commit that closes it, or in the
  next documentation-only commit when the closing work landed in several commits.

## Findings

| ID | Finding | Phase 1 verdict | State | Commit / evidence |
|----|---------|-----------------|-------|-------------------|
| F1 | Installer `.env` reported as containing placeholders | Not reproduced; look-alike sample files ship beside the real `.env` | Closed | `9c14f53` removes every `backend\.env.*` and asserts the generated file carries no `__TOKEN__` or sample value |
| F2 | No Sign Out for non-Administrators | Confirmed | Closed | `d6518d8` adds Sign out to the Sidebar for all roles |
| F3 | Administrator cannot reset a user's password in the UI | Confirmed | Closed | `f2dac8e` wires the per-row Password action to the existing `adminMode` dialog |
| F4 | Work-order header (Supervisor, planned dates) cannot be edited | Confirmed | Closed | `a5c31c9` adds the Edit details band. UI gate is Supervisor/Planner/Admin; the API's `PUT /work-orders/:id` floor is deliberately left at Technician+ (no field-level authorisation exists there, and raising it would also block technician edits) - reported, not changed. Re-examined 2026-10-25 for the owner's field-check question and left UI-only: `plannedStart`/`plannedFinish` are settable at the Technician floor through `PUT /work-orders/:id/status` (the workflow walkers in `backend/tests/routes/workOrders.test.ts` reach `Scheduled` with a technician token), so a field-level guard on the `PUT /:id` path alone would be partial and bypassable, not clean |
| F5 | "Schedule" sets status without collecting dates | Confirmed | Closed | API `9fac75f` accepts `plannedStart`/`plannedFinish` on the status route and applies them in the same update; app `d66dc84` sends them from one shared dialog. Option C (refusing Scheduled with no dates) left open in v1.6.5; adopted 2026-10-25 for v1.6.6 and implemented in `febe835` (decision below) |
| F6 | Handover bundle ships stale documentation | Confirmed | Closed | Gate `9450462`: `scripts/verify/verify_bundle.py` compares the 11 shipped documents and `docs/images/*` against `git show <tag>:<path>` and adds `--sync`. Re-derived against the preserved v1.6.4 bundle: 27 OK, 3 drift (`GO_LIVE_CHECKLIST.md`, `INSTALLATION_GUIDE.md`, `RELEASE_NOTES.md`), 0 missing. The v1.6.5 bundle was then assembled from the tag, `--sync` corrected the one document that had drifted since assembly (`RELEASE_NOTES.md`, the corrected test count), and `--tag v1.6.5 --secrets` reports **30 entries, 0 drift, 0 missing, `CRED none`**. Bundle `CommandPulse-CMMS-v1.6.5`: 226 files, 7,144,895 B, `SHA256SUMS.txt` over 225 entries re-verified with 0 mismatches. Row closed after the tag was cut, because the bundle is assembled from the final tree |
| F7 | Most data pages have no import/export | Confirmed, asymmetric | Closed | P1 `7b85685` gives the four routes one contract (header by name, `strict`/`partial`, `?dryRun=1`, one result shape); P2 `d6eba45` adds `export.csv` for Work Orders and Functional Locations and `258660e` adds the shared toolbar to both, so all four modules now have UI and both directions. Docs `121bf25`, `d46d1cc`. Consequence: equipment and materials report CSV outcomes in the toolbar, not the page toast. Six modules remained out of scope in v1.6.5; all six were added for v1.6.6 on 2026-10-25 (decision below): `024d476` work centres, `4b552b2` crafts, `c0f96d9` task lists, `0dfa21a` safety checklists, `2495f82` cause codes, `14e9684` failure codes, `cb5037a` maintenance plans, plus export-only `94a7c16` notifications and `b8e1049` users; `d676f7b` adds their route tests |
| A1 | Bundle ships `backend/.env.deploy` with a concrete JWT secret | Confirmed (security) | Closed | `3d6126c`: `.gitignore` ignores `.env.*` with `!.env.example`, and `verify_bundle.py --secrets` fails on any `.env*` in a bundle except the sample. Measured against the preserved v1.6.4 bundle it names `backend/.env.deploy`; with that file removed the same run passes. The file was listed in `SHA256SUMS.txt` and carried a 64-character `JWT_SECRET` and a `DATABASE_URL` for database `cmms` - neither value equals the current live one, but both were concrete. The delivered bundle is preserved as-is; whether the copy the Client holds is treated as disclosed is an owner decision (below). Owner decision 2026-10-25: accepted as disclosed - the live JWT secret is not rotated, and the v1.6.6 release notes carry the disclosure and tell holders of v1.6.4 to upgrade |
| A2 | `backend/.env.example` reaches the install root | Confirmed | Closed | `9c14f53`, same copy rule as F1 |
| A3 | Two v1.6.4 commit messages describe work not in the commit | Confirmed | Closed | Messages stay as committed; the record is `d630e12` (rows I-25/I-26 in `docs/INSTALLER_TRACKER.md`) and `78528a5` (the `v1.6.4` release-notes section, derived from `db33058`, `75ab60d`, `d5741a1`, `7238b6a`, `da42aea`, `f245123` rather than from any message about them) |
| A4 | Mojibake in tracked handover documents | Confirmed | Closed | `693bbb1` repairs 38 CP1252-double-encoded runs in 5 files (`INSTALLATION_GUIDE.md` 27, `INSTALLER_TRACKER.md` 3, `RELEASE_NOTES.md` 3, `EquipmentDetailPage.tsx` 4 incl. the user-visible `—` and `·`, `workOrderCostSplits.test.ts` 1). Re-derived: no remaining run decodes to different valid UTF-8. Leading BOMs on 7 files left alone, recorded |
| A5 | Two password floors for one credential (12 installer / 8 API) | Confirmed | Closed | `5e8c062` raises the API and UI to 12 |
| A6 | Installation guide promises a reset path the product lacks | Confirmed | Closed | Product side `f2dac8e` + `5e8c062`; guide `12ac772` names the path |
| A7 | Sidebar profile button is a dead click for five of six roles | Confirmed | Closed | `d6518d8` makes the profile block display-only |

States: `Open`, `In progress`, `Blocked`, `Closed`.

## Errata

- `96f32dd` ("docs: close seven tracker rows") names "A3-to-be" in its message,
  but A3 was not closed by it: that commit closed seven rows, not eight, and A3's
  own evidence is the subject of A3 rather than something it can close. The row
  table above is authoritative; the message is left as committed because history
  is not rewritten.
- The v1.6.4 bundle's `RELEASE_MANIFEST.md` states "453 files, 15.6 MB" and
  asserts the size in an unclosed parenthesis; the bundle it describes holds 226
  files totalling 7,083,969 B, and its own `SHA256SUMS.txt` lists 225 of them.
  Found while assembling v1.6.5, which counts its own contents instead of
  inheriting the figure. The v1.6.4 bundle is left as delivered.

## Approved scope

Owner decisions of 2026-10-25, with the engineering call recorded where it
differs:

| Item | Owner decision | Engineering call |
|------|----------------|------------------|
| F2 / A7 | Sign Out in the global Sidebar for all roles; fix the non-admin profile target | Adopted; the role-filtered nav list already carries the Administration link, so the profile block became a non-interactive display rather than gaining a menu |
| F3 | Wire the reset dialog; raise the password floor to 12 | Adopted, API and UI together (A5) |
| F4 | Supervisor, Planner and Administrator may edit the header | Adopted |
| F5 | Option B — atomic API extension accepting dates on the status route | Adopted, plus ordered-pair validation on the dates themselves |
| F6 | Cut `v1.6.5`; fix the mojibake; write proper release notes | Adopted; also adds a bundle-vs-tag verification gate so it cannot recur |
| F7 | P1 and P2 for Work Orders and Locations first | Adopted; other modules left out of scope, recorded as open |
| A1 | Remove `.env.deploy` from the bundle | Adopted, plus a build-time guard |

## Approved scope, 2026-10-25 (second round - `v1.6.6`)

The four items `v1.6.5` closed as reported-but-not-changed, or left out of
scope, were put back to the owner and decided in one round. The decisions and
the engineering call for each:

| Item | Owner decision | Engineering call |
|------|----------------|------------------|
| F5 | Attempt option C - refuse a transition to `Scheduled` with no dates at the API - but only if it is proven not to break existing live data; otherwise accept as a documented limitation | Adopted as option C (`febe835`). The guard fires only on the transition *into* `Scheduled` and reads the pair the row will hold after the update, so a re-schedule that restates no dates still succeeds. Read-only against live `cmms` before adopting: 27 rows are `Scheduled` and 7 of those are undated; none is re-validated and every transition out (`In Progress`, `Planned`, `Cancelled`) still works, so no row is trapped and no backfill or migration is needed. Clients that scheduled without dates now get a 400 naming the missing field |
| F7 | Extend CSV to all remaining modules through the shared factory: Work Centers, Crafts, Task Lists, Safety Checklists, Code Lists (cause and failure codes) and PM Plans. Notifications and Users export-only | Adopted. Six import modules and two export-only registers (`94a7c16`, `b8e1049`); notifications and users have no import route, so the notification lifecycle and credential handling keep their single path. Every new import is `strict` at the `Maintenance Planner` floor. Crafts re-cost affected work orders inside the transaction through a new opt-in `txOptions`, mirroring the R.10 single-craft update. A flat file cannot carry a plan's target list or meters, so the plan import is header-level: it creates one target for generation to read and never changes an existing plan's target or thresholds, and it refuses a Meter/Combined plan that has none |
| F4 | Accept UI-only gating unless a minimal field-level check is "clean and does not risk breaking other update paths" | UI-only, no code change. The header fields the UI gates are `supervisorUserId`, `plannedStart` and `plannedFinish`; the dates are writable at the Technician floor through `PUT /work-orders/:id/status`, so a field-level guard on `PUT /work-orders/:id` alone would be partial and bypassable. Recorded in the F4 row rather than shipped as a half guard |
| A1 | Accepted: do not rotate the live JWT secret; add a note to the `v1.6.5` release notes that the `v1.6.4` bundle's credentials are disclosed and users should upgrade | Adopted. No rotation, no further bundle surgery; the `v1.6.6` release notes carry the disclosure and point at `v1.6.5` |

## Out of scope for v1.6.5

Recorded so the boundary is explicit, not implied:

- CSV import/export UI for Work Centers, Crafts, Task Lists, Safety Checklists,
  Code Lists and PM Plans. Their backend routes do not exist either. F7's shared
  factory makes each one small, but they were not approved for this release.
- Enforcing "a work order may not be `Scheduled` without dates" (F5 option C).
  Option B was chosen; the strict rule remains an open acceptance question.
- Rotating the `JWT_SECRET` that travelled inside the v1.6.4 bundle (A1). It is
  removed from v1.6.5; whether the v1.6.4 copy is treated as disclosed is an
  owner security decision.

All three were decided on 2026-10-25 for `v1.6.6`: the first two were taken up
(see the second-round table above) and A1 was accepted as disclosed with no
rotation.
