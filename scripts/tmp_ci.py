import io, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GREEN183 = "green CI run 183"
GREEN186 = "green CI run 186"

# ===================================================================== matrix
p = "docs/SOW_COMPLIANCE.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
lines = raw.split(nl)

# --- row 8: backfill the SHA and the run, both now known
hits = [i for i, l in enumerate(lines) if l.startswith("| \u00a73.1.4 | Cause codes as root-cause categories |")]
assert len(hits) == 1, hits
i = hits[0]
old = "(owner decision 2026-10-05, this commit; workflow run in the commit message)"
new = f"(owner decision 2026-10-05, `1e4b28c`, {GREEN183.replace('183','182')})"
assert lines[i].count(old) == 1
lines[i] = lines[i].replace(old, new)
print("matrix row 8: sentinel -> 1e4b28c, run 182")

# --- rows 331 and 334: identical sentinel text, disambiguate by line
hits = [i for i, l in enumerate(lines)
        if "**CLOSED \u2014 `Not Met` \u2192 `Met` (owner decision 2026-10-05, this commit).**" in l]
assert len(hits) == 2, hits
a, b = hits

lines[a] = lines[a].replace(
    "(owner decision 2026-10-05, this commit)",
    f"(owner decision 2026-10-05, `c86e890`, {GREEN183})")
assert "All functional requirements listed" in lines[a]
print("matrix row 331: sentinel -> c86e890, run 183 GREEN")

lines[b] = lines[b].replace(
    "(owner decision 2026-10-05, this commit)",
    "(owner decision 2026-10-05, `d7c8b74`, **CI run pending** \u2014 see the note below)")
assert "No open Critical or Major defects" in lines[b]
lines[b] = lines[b].replace(
    "**CI verification outstanding, 2026-10-05.**",
    "**CI verification outstanding, 2026-10-05.**")
# append the pending-CI explanation to row 334's note
lines[b] = lines[b][:-2] + (
    " **CI run pending \u2014 `d7c8b74` has no green run of its own.** Workflow run 185 for that SHA completed "
    "`cancelled` with **zero steps executed** \u2014 both jobs, `Backend` and `Frontend` \u2014 which is the "
    "signature of the 2026-10-05 GitHub Actions incident (runner assignment failing, not a test failure: "
    "\"The job was not acquired by Runner of type hosted even after multiple attempts\"). Nothing in this "
    "commit's tree was executed, so nothing about it has been tested at its own SHA. **What the evidence "
    "actually is:** this promotion is documentation-only, and its identical content is green on descendant "
    f"run 186 (`4ff8814`), which contains `d7c8b74` as an ancestor \u2014 so the claim has been exercised, just "
    "not at this commit. That is recorded rather than smoothed over, because \"green CI at `d7c8b74`\" is not "
    "a citation anyone can check and I will not write it. **To close this:** re-run `d7c8b74` once Actions is "
    "healthy and backfill the run ID here, or cite run 186 as the content-level verification and say so "
    "plainly. |"
)
print("matrix row 334: sentinel -> d7c8b74 + pending-CI explanation")

io.open(p, "w", encoding="utf-8-sig", newline="").write(nl.join(lines))

# ==================================================================== register
p = "docs/DECISION_REGISTER.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
lines = raw.split(nl)
anchor = next(i for i, l in enumerate(lines) if l.startswith("**CI caveat, because it is easy to assume"))
if anchor is None:
    anchor = 0
entry = [
    "**CI verification ledger for the 2026-10-05 promotions \u2014 read this before citing any of them.**",
    "GitHub Actions failed to assign hosted runners throughout 2026-10-05 (status-page incident, actions",
    "degraded). Two commits had already been pushed when it began. The distinction that matters is between",
    "*a commit with a green run at its own SHA* and *a commit whose content is only covered by a descendant's",
    "run* \u2014 only the first supports the usual \"verified by green CI at `<sha>`\" citation.",
    "",
    "| Commit | What it promotes | Run | State |",
    "|---|---|---|---|",
    "| `1e4b28c` | row 8 \u00a73.1.4 failure capture `Partial`\u2192`Met` | 182 | **Green** |",
    "| `a0fa86d` | backfill of the row-8 SHA into the verifier and tracker | none | **No run was ever created.** Pushed in the same push as `c86e890`; Actions fires once per push at the tip SHA, so this commit has no run of its own. Its content is exercised by runs 183 and 186. |",
    "| `c86e890` | row 331 \u00a76.4 / a `Not Met`\u2192`Met` | 183 | **Green** |",
    "| `47e02a2` | \u00a73.5.2 cost-split deferral confirmation (no status change) | 184 | Queued when last checked |",
    "| `d7c8b74` | row 334 \u00a76.4 / b `Not Met`\u2192`Met` | 185 | **Cancelled, zero steps executed.** No green run at this SHA. Content is green on descendant run 186 (`4ff8814`). |",
    "| `4ff8814` | \u00a74.3 backup decision (no status change) | 186 | **Green** |",
    "",
    "**Two of these are genuinely unverified at their own SHA and are recorded as such: `a0fa86d` and",
    "`d7c8b74`.** Both are documentation-only, and both had their content exercised by a green run on a",
    "descendant commit, so the risk is small \u2014 but a small risk is not the same as a green run, and the",
    "matrix notes now say so in those words rather than implying verification that does not exist. **The one",
    "worth watching is `d7c8b74`**, because it is a status promotion: row 334 moves `Not Met`\u2192`Met` with no",
    "green run at the SHA that made the move. Nothing else in this set is a promotion without one.",
    "",
    "Not a billing or account problem, and nothing to fix in the repository \u2014 for the record: 2,000",
    "included minutes, 215 used, $0 charged, and the repo's own history of runs 177-182 is green.",
    "",
]
lines[anchor:anchor] = entry
io.open(p, "w", encoding="utf-8-sig", newline="").write(nl.join(lines))
print("register: CI verification ledger added")

# ===================================================================== tracker
p = "docs/CMMS_FINALIZATION_TRACKER.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
lines = raw.split(nl)

repl = [
    ("| Post-H row 331 `this commit` \u2014 SOW \u00a76.4 \u00a73-implementation limb, accepted conditionally "
     "2026-10-05 on failure capture landing (`1e4b28c`, run 182); NM\u2192M; `this commit` = |",
     f"| Post-H row 331 `c86e890` (run 183) \u2014 SOW \u00a76.4 \u00a73-implementation limb, accepted "
     f"conditionally 2026-10-05 on failure capture landing (`1e4b28c`, run 182); NM\u2192M; `c86e890` = |"),
    ("\u00a73.1.4 failure capture `1e4b28c` = |",
     f"\u00a73.1.4 failure capture `1e4b28c` (run 182); \u00a73.5.2 note itself `47e02a2` (run 184 queued) = |"),
    ("| Owner decisions 2026-10-05 \u2014 SOW \u00a76.4 defect limb, four WCAG residuals accepted for v1.1 "
     "(v1.1-11..14), no code; NM\u2192M; `this commit` = |",
     "| Owner decisions 2026-10-05 \u2014 SOW \u00a76.4 defect limb, four WCAG residuals accepted for v1.1 "
     "(v1.1-11..14), no code; NM\u2192M; `d7c8b74`, **CI run 185 cancelled by the 2026-10-05 Actions "
     "incident \u2014 no green run at this SHA, content green on descendant run 186** = |"),
    ("row 261 stays `Partial`, L28 closed, no code = |",
     f"row 261 stays `Partial`, L28 closed, no code; `4ff8814` (run 186) = |"),
]
for old, new in repl:
    hits = [i for i, l in enumerate(lines) if l == old]
    assert len(hits) == 1, (old[:60], len(hits))
    lines[hits[0]] = new
print("tracker: 4 citation lines backfilled")

anchor = next(i for i, l in enumerate(lines) if l.startswith("## Post-Go-Live Backlog (v1.1)"))
lines[anchor:anchor] = [
    "## Pending CI verification (2026-10-05 GitHub Actions incident)",
    "",
    "GitHub Actions failed to assign hosted runners on 2026-10-05. Two commits pushed during the incident",
    "have **no green run at their own SHA**: `a0fa86d` (never had a run created \u2014 it shared a push with",
    "`c86e890`) and `d7c8b74` (run 185 cancelled with zero steps executed). Both are documentation-only and",
    "both had their content exercised by green runs on descendant commits, so neither is unverified in fact;",
    "what is missing is a checkable citation. `d7c8b74` is the one to watch, because it is a status promotion",
    "(row 334 `Not Met`\u2192`Met`). **To close this section:** once Actions is healthy, re-run those two SHAs",
    "and replace each with its run ID. Green in the meantime: `1e4b28c` (182), `c86e890` (183), `4ff8814` (186).",
    "",
]
io.open(p, "w", encoding="utf-8-sig", newline="").write(nl.join(lines))
print("tracker: pending-CI section added")

# ==================================================================== verifier
p = "scripts/verify/verify_a1.py"
raw = io.open(p, encoding="utf-8", newline="").read()
pairs = [
    ('("6.4 implementation", "Not Met", "Met", "this commit"),',
     '("6.4 implementation", "Not Met", "Met", "c86e890"),'),
    ('("6.4 defects", "Not Met", "Met", "this commit"),',
     '("6.4 defects", "Not Met", "Met", "d7c8b74 (CI run 185 cancelled by the 2026-10-05 Actions'
     ' incident; content green on descendant run 186)"),'),
    ('("RPO < 1 hour", "Not Met", "Met", "this commit"),',
     '("RPO < 1 hour", "Not Met", "Met", "f341a46"),'),
]
for old, new in pairs:
    assert raw.count(old) == 1, (old, raw.count(old))
    raw = raw.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(raw)
print("verifier: 3 sentinels resolved (c86e890, d7c8b74, f341a46)")