# Working notes

Standing rules for how work is done in this repository. Added 2026-10-04 after a
reviewer correction; see "Commit discipline" below.

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
- **Every commit carries `Co-Authored-By: Claude Opus 4.8 (1M context)
  <noreply@anthropic.com>`.** Attribution is not optional and is not a
  docs-only concern: a commit without the trailer is missing required metadata
  regardless of what else it changes.
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

- **The `cmms` database on `localhost:5432` holds the Client's migrated operational data,
  not a fixture.** The B1 full legacy load of 2026-10-10 landed **20,333 of 20,333 rows at
  100.00%** (`1971686`, run 257; see `docs/migration-runbook.md` and
  `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md`). No seed script rebuilds it and no
  dump of it is committed to the repository, so a destructive statement against it is
  neither recoverable nor revertable.
- **Never seed, clear, drop, migrate or write to `cmms` from a test, a repro, a verifier or
  a migration run.** All test and verification work targets a throwaway database made for
  the purpose; `cmms_gate`, `cmms_gate_fresh`, `cmms_c1`, `cmms_c11` and
  `cmms_restore_test` have all been used that way.
- **`backend/scripts/gate.mjs` reads `DATABASE_URL`, and `backend/.env` points it at
  `cmms`**, so a gate run with the default environment targets the real database. This is
  the hazard the tracker's E.9 working-practice note names: *"Never point this at the
  developer's `cmms` database"* (`CMMS_FINALIZATION_TRACKER.md`, E.9). Override per command
  with `$env:DATABASE_URL`; do not edit `.env` to repoint the project.
- `backend/tests/load-env.ts` fills only variables that are **unset**, so an explicit
  `DATABASE_URL` in the environment wins over `.env`.

## Documentation accuracy

- Every count, clause attribution and line-number citation in the docs is a claim
  that can rot silently. `git log -L` on a Notes line tells you when it was last
  written; cross-check against the commits that touched the behaviour it describes.
  This was the `v1.1-8` sweep, closed 2026-10-16 (see the `v1.1-8` row in
  `docs/CMMS_FINALIZATION_TRACKER.md`); the rule remains standing.
- Preserve history rather than overwriting it. When a figure is superseded, keep the
  original and add a pointer; do not silently restate it.
- Prefer symbolic references ("the `APPROVED_PROMOTIONS` list") over hardcoded line
  ranges, which break without failing when a list grows above them.

## Scope discipline

- Do only what was asked. Open items are not implicitly in scope, and an audit
  finding is not a work order.
- Distinguish engineering calls from scope/acceptance calls, and say which is which
  without deciding the owner's part for them.
