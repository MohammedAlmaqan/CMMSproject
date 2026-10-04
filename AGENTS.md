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

## Documentation accuracy

- Every count, clause attribution and line-number citation in the docs is a claim
  that can rot silently. `git log -L` on a Notes line tells you when it was last
  written; cross-check against the commits that touched the behaviour it describes.
  This is the `v1.1-8` sweep, still open.
- Preserve history rather than overwriting it. When a figure is superseded, keep the
  original and add a pointer; do not silently restate it.
- Prefer symbolic references ("the `APPROVED_PROMOTIONS` list") over hardcoded line
  ranges, which break without failing when a list grows above them.

## Scope discipline

- Do only what was asked. Open items are not implicitly in scope, and an audit
  finding is not a work order.
- Distinguish engineering calls from scope/acceptance calls, and say which is which
  without deciding the owner's part for them.
