# Release notes

What changed in each release, most recent first. Every entry corresponds to
commits on `main`; the CI run at the tagged SHA is the evidence that the tree
was green when the tag was cut.

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
