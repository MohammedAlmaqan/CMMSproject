#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# A1  VERIFY — Phase A baseline freeze
#
# Parses docs/SOW_COMPLIANCE.md and asserts the frozen v1.0.0 clause
# inventory. This is the authority for every downstream count: the SOW
# matrix summary table is a hand-maintained claim, and Phase A's whole
# purpose is to stop the scope argument resting on it.
#
# Reads exactly one file (a markdown table). Touches no database, no API,
# no .env, no credential.
#
# Usage: python scripts/verify/verify_a1.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import os
import re
import sys

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
MATRIX = os.path.join(ROOT, "docs", "SOW_COMPLIANCE.md")
REGISTER = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")
SCREEN = os.path.join(ROOT, "screenshots")

STATUSES = ["Met", "Partial", "Not Met", "Deferred", "Excluded", "Waived"]

# Frozen v1.0.0 inventory, transcribed from the matrix summary table and
# independently re-derived by this script on every run.
#
# `Waived` was added 2026-09-26. Ten section 3 rows that were open at the
# Phase A freeze are now recorded as deliberately not built, so they carry a
# status of their own rather than continuing to read `Not Met`. That is a
# status change only: the v1.0.0 code is untouched, and the ten rows were
# still absent in v1.0.0. The Phase A worksheet still covers all 77 of them.
EXPECT_ALL_TOTAL = 214
EXPECT_ALL = {
    "Met": 64,
    "Partial": 74,
    "Not Met": 43,
    "Deferred": 8,
    "Excluded": 15,
    "Waived": 10,
}
EXPECT_S3_TOTAL = 126
EXPECT_S3 = {
    "Met": 38,
    "Partial": 41,
    "Not Met": 26,
    "Deferred": 4,
    "Excluded": 7,
    "Waived": 10,
}
# Three distinct sets, and conflating them is the error this gate exists to
# catch:
#   BUILD     rows still to be implemented. These are the 6.4.1 clause set.
#   WAIVED    in scope, open, then deliberately not built under a decision.
#   WORKSHEET BUILD + WAIVED = the 77 rows the Phase A register dispositioned.
#
# The worksheet is anchored on the REGISTER's 77 rows, not on the matrix status.
# Anchoring it on status meant any row promoted to Met silently dropped out of
# the worksheet, the count broke, and the register stopped lining up with the
# matrix. The register is the historical record of what Phase A decided, so the
# 77 must not move as later phases land; the BUILD count is what shrinks.
EXPECT_S3_BUILD = 66
EXPECT_S3_WAIVED = 11
EXPECT_S3_WORKSHEET = 77
GAP_STATUSES = ("Partial", "Not Met")
PHASES = ("B", "C", "D", "E", "F", "G", "H")
EXPECT_DECISIONS = [f"D-{n}" for n in range(2, 20)]

# ---------------------------------------------------------------------------
# APPROVED PROMOTIONS
#
# The tallies above are the Phase A freeze (b6a3a1c). A later phase implementing
# a row is supposed to move it Partial/Not Met -> Met, which would make every
# exact equality above fail. Rather than weaken the gate, each promotion has to
# be listed here with the commit that justifies it, and the expected counts are
# derived from the freeze by applying this list. So an unlisted status change is
# still a FAIL, exactly as before, while a reviewed one is not noise.
#
# The list was compiled mechanically by replaying the git history of the matrix
# and, for each row whose status changed at or after the freeze, recording the
# commit that set the row's current status. Thirty-seven section 3 rows were
# promoted by R.2; the post-R.2 block below adds twenty-two more (the R close-
# out, Phase G.5, Phase H and the post-H sequence). One of them moved in two
# reviewed hops and is listed twice: row 27
# (each work order must contain at least one operation) went Not Met -> Partial
# in Phase C (f3fc1ad) and Partial -> Met when the DB-backed suite ran
# (6c5b926). expected_counts() applies any from/to pair, so both hops net to
# the same counts.
#
# Phase B (rows 14/15/16/22/33) was at one point held rather than promoted
# because its runtime behaviour had never been exercised against a live
# database. That is no longer true: the DB-backed suite has run, and the Phase F
# recount (5fc4383) promoted those rows along with the rest of the list.
#
# Format: (register row number, from status, to status, commit)
APPROVED_PROMOTIONS: list = [
    (2, "Partial", "Met", "5fc4383"),    # 3.1.1 open-node counts
    (3, "Partial", "Met", "5fc4383"),    # 3.1.2 equipment placement/BOM/documents
    (4, "Partial", "Met", "5fc4383"),    # 3.1.2
    (5, "Partial", "Met", "5fc4383"),    # 3.1.2
    (6, "Partial", "Met", "5fc4383"),    # 3.1.3 craft rates
    # SOW 3.1.4 "Cause codes as root-cause categories" (row 8) had two limbs.
    # H.4 (9b1758c) closed the cause limb. The failure limb - a managed
    # FailureCode list that no work order could name - closed on 2026-10-05
    # under owner decision 1: WorkOrder.failureCodeId references FailureCode,
    # both reads return it, and the work-order screen sets it
    # (migration 20261005120000_work_order_failure_code,
    # backend/tests/routes/failureCapture.test.ts). There is deliberately no
    # completion gate on a failure code, because SOW 3.2.2's notification
    # key-field list names none and no clause makes one mandatory. This entry
    # cannot cite its own commit because the status change and this wiring land
    # together; "this commit" is the sentinel the tracker already uses. Backfill
    # the SHA. Durable anchor: owner decision 2026-10-05, tracker v1.1-1.
    (8, "Partial", "Met", "1e4b28c"),  # 3.1.4 failure capture
    (9, "Partial", "Met", "5fc4383"),    # 3.1.4 task lists
    (10, "Not Met", "Partial", "f3fc1ad"),  # 3.1.4 task lists per class
    (11, "Partial", "Met", "5fc4383"),   # 3.1.4 task-list copy
    (12, "Partial", "Met", "5fc4383"),   # 3.1.5 material-to-operation link
    (14, "Partial", "Met", "5fc4383"),   # 3.2.1 notification types M1/M2
    (15, "Not Met", "Met", "5fc4383"),   # 3.2.1 M3 autogenerated
    (16, "Not Met", "Met", "5fc4383"),   # 3.2.1 transition validity
    (18, "Partial", "Met", "5fc4383"),   # 3.2.2 key fields
    (19, "Not Met", "Met", "96645ee"),   # 3.2.2 damages/observations
    (21, "Partial", "Met", "5fc4383"),   # 3.2.3 relationship and navigation
    (22, "Not Met", "Met", "5fc4383"),   # 3.2.3 notification status after close
    (25, "Partial", "Met", "5fc4383"),   # 3.3.3 per-operation fields
    (26, "Partial", "Met", "e256ad1"),   # 3.3.3 Reported By header field
    (27, "Not Met", "Partial", "f3fc1ad"),  # 3.3.3 at-least-one-operation (C.5)
    (27, "Partial", "Met", "6c5b926"),   # 3.3.3 DB-backed suite
    (28, "Partial", "Met", "5fc4383"),   # 3.3.3 WO number auto-generation
    (31, "Not Met", "Met", "abb580f"),   # 3.3.4 material reservation
    (32, "Partial", "Met", "98c356e"),   # 3.3.5 actual labour cost
    (33, "Partial", "Met", "5fc4383"),   # 3.3.5 labour attribution
    (34, "Not Met", "Met", "722e1a3"),   # 3.3.6 travel/permit line items
    (35, "Partial", "Met", "d56aa2e"),   # 3.3.7 safety gate
    (39, "Partial", "Met", "1c14c25"),   # 3.4.1 plan fields
    (40, "Partial", "Met", "1c14c25"),   # 3.4.1 strategy
    (41, "Partial", "Met", "1c14c25"),   # 3.4.2 time-based
    (42, "Partial", "Met", "1c14c25"),   # 3.4.2 meter-based
    (43, "Not Met", "Met", "1c14c25"),   # 3.4.2 call horizon
    (45, "Partial", "Met", "1c14c25"),   # 3.4.3 WO created on reaching due
    (46, "Not Met", "Met", "1c14c25"),   # 3.4.3 draft/planned configurable
    (47, "Not Met", "Met", "1c14c25"),   # 3.4.3 linked notification created
    (48, "Partial", "Met", "1c14c25"),   # 3.4.3 idempotent generation
    (49, "Partial", "Met", "722e1a3"),   # 3.5.1 planned cost
    (55, "Not Met", "Met", "be2b092"),   # 3.6 work order history
    (56, "Partial", "Met", "be2b092"),   # 3.6 equipment maintenance history
    (58, "Not Met", "Met", "17c95fb"),   # 3.7.1 report filtering (Phase R / R.2)

    # ---- post-R.2 promotions (re-derived from b6a3a1c..HEAD on 2026-10-03) ----
    # The block above was current at 2bf586b (R.2). Everything after it was added
    # by the Phase R close-out, Phase G.5, Phase H and the post-H sequence. Each
    # entry is keyed by SOW clause and carries the commit whose diff first set the
    # row's current status. Transitions are single-hop per row; a Not Met -> Met
    # row previously recorded as two hops still nets the same counts.
    ("3.2.2 multiple-notifications", "Not Met", "Met", "22d5292"),
    ("3.3.1 emergency-priority", "Not Met", "Met", "7a08726"),
    ("3.3.1 calibration", "Not Met", "Met", "f45c02f"),
    ("3.3.3 long-text", "Not Met", "Met", "7a08726"),
    ("3.5.3 rollup-location", "Not Met", "Met", "5a05acd"),
    ("3.5.3 rollup-equipment", "Not Met", "Met", "5a05acd"),
    ("3.5.3 rollup-wo-type", "Not Met", "Met", "5a05acd"),
    ("3.5.3 rollup-time", "Partial", "Met", "5a05acd"),
    ("3.7.1 export", "Not Met", "Met", "465f859"),
    ("3.7.1 backlog", "Partial", "Met", "b9fedca"),
    ("3.7.1 pm-compliance", "Partial", "Met", "b9fedca"),
    ("3.7.1 mttr", "Partial", "Met", "b9fedca"),
    ("3.7.1 cost-summary", "Partial", "Met", "b9fedca"),
    ("3.7.1 material-consumption", "Partial", "Met", "b9fedca"),
    ("3.7.2 backlog-hours", "Not Met", "Met", "ed5bcc6"),
    ("3.7.2 top10-cost", "Not Met", "Met", "ed5bcc6"),
    ("3.7.2 awaiting-conversion", "Partial", "Met", "ed5bcc6"),
    ("3.7.3 ad-hoc-query", "Deferred", "Met", "4e883b3"),
    ("3.8 alert-assignment", "Not Met", "Met", "f45c02f"),
    ("3.8 alert-overdue", "Not Met", "Met", "f45c02f"),
    ("3.8 alert-pm-failure", "Partial", "Met", "37957d5"),
    ("3.8 alert-high-priority", "Not Met", "Met", "37957d5"),

    # ---- owner-decision closures, 2026-10-04 (no code change) ----
    # These rows were already implemented or already correct and were held
    # Partial only by an owner interpretation. Unlike the entries above, the
    # justifying artefact is a decision, not an implementation commit, so the
    # decision ID in the matrix Notes is the durable anchor. The SHAs below
    # were backfilled 2026-10-06 from git blame on each row's Status cell:
    # each is the 2026-10-04 commit whose diff set the row's current status
    # and wired its verifier entry.
    ("3.2.2 notification-create (D-15)", "Partial", "Met", "6353ae69"),
    ("3.1.3 capacity-board (read-only reading)", "Partial", "Met", "8e193045"),
    ("3.3.8 file-type (D-11)", "Partial", "Waived", "76333df9"),
    ("3.1.4 task-list equipment association", "Partial", "Met", "7dea7ecb"),
    ("3.1.5 material-to-operation link", "Partial", "Met", "89dff117"),

    # Row 149 (SOW 3.3.8). The clause asks for old/new value on field
    # modifications, and the three permission-bearing PUT handlers now diff
    # per column. The six remaining handlers are an accepted residual recorded
    # as L37, not a status blocker; owner acceptance 2026-10-04.
    ("3.3.8 complete audit log", "Partial", "Met", "2e6cc44f"),

    # SOW 3.6 (row 188). 77 of 78 write handlers log; the one exception,
    # auth.ts POST /login, is a permanent ratified carve-out that the owner
    # placed outside this clause. Diff coverage is 3.3.8, not 3.6, and is
    # tracked on row 149 and L37; owner acceptance 2026-10-04.
    ("3.6 general change log", "Partial", "Met", "1d702458"),
]

# One more row has moved since the freeze and it is NOT a section 3 clause, so
# it never appears in EXPECT_S3: SOW 6.4 "Performance test shows response times
# within §4.1 limits under a simulated load of 100 concurrent users" went
# Not Met -> Met when the 100-VU acceptance run passed cleanly after the G.6
# P2028 fix. It applies only against the all-rows baseline (EXPECT_ALL).
#
# Format: (clause label, from status, to status, commit)
APPROVED_ALL_ONLY_PROMOTIONS: list = [
    ("6.4 performance", "Not Met", "Met", "40c852e"),

    # post-R.2 all-scope changes, re-derived from b6a3a1c..HEAD on 2026-10-03.
    # These are non-section-3 clauses, so they move EXPECT_ALL only.
    ("2.2 custom-roles", "Not Met", "Waived", "1daa241"),
    ("2.2 admin-user-management", "Not Met", "Met", "80add36"),
    ("2.2 requester", "Not Met", "Met", "60d4923"),
    ("4.1 concurrency", "Deferred", "Partial", "b278eaa"),
    # SOW 4.1 "Support up to 200 concurrent users, screen load < 2 s,
    # transactional save < 1 s" (row 253). Deferred -> Partial recorded the
    # 200-VU capacity run; the save limb stayed partial because capacity.js
    # drives the read path only. C12 supplied the missing measurement:
    # scripts/k6/write.js now drives a PUT /api/work-orders/:id per iteration at
    # the same 200 concurrent users and records save_latency separately. At a
    # realistic cadence the save p(95) is 89.4 ms, inside the 1 s budget (the
    # 3.47 s tight-loop figure is a stress bound, not the acceptance figure).
    # The owner reviewed that evidence and authorised the promotion on
    # 2026-10-10; the status change and this wiring landed together, and the
    # real SHA (3b44914) is now recorded here. The date plus the row-253 note
    # are the durable anchors.
    ("4.1 concurrency", "Partial", "Met", "3b44914"),
    ("4.2 https", "Partial", "Met", "256c8e9"),
    ("4.5 iso-14224", "Not Met", "Met", "a0573bd"),
    ("4.6 availability", "Not Met", "Deferred", "1daa241"),
    ("5.2 reporting-engine", "Not Met", "Met", "4e883b3"),
    ("5.4 api-versioning", "Not Met", "Met", "0a437eb"),
    ("6.2 user-manual", "Partial", "Met", "5dd4cb7"),
    ("6.2 deployment-guide", "Partial", "Met", "5dd4cb7"),
    ("6.4 report-correctness", "Not Met", "Met", "7e318bc"),
    ("6.4 docs-and-training", "Partial", "Met", "5dd4cb7"),

    # SOW 4.3 "RPO < 1 hour" (row 262). The blocker this row named was the
    # absence of a second backup target, so the drill supplies one and measures
    # the objective instead of asserting it: on 2026-10-05 scripts/pitr-drill.ps1
    # archived WAL to a local secondary path and restored to a chosen
    # recovery_target_time. Observed commit-to-archive lag 1 s, with
    # archive_timeout=300 bounding worst-case loss to 5 minutes. The archive
    # target is deployment-configurable, and archive_mode is still off on the
    # live cluster, so this records a proven and re-runnable mechanism rather
    # than a live host that is already archiving. Owner acceptance 2026-10-05.
    ("RPO < 1 hour", "Not Met", "Met", "f341a46"),

    # SOW 6.4 "All functional requirements listed in 3 are implemented and pass
    # UAT scripts" (row 331) is a conjunction over section 3, so it was Not Met
    # while any section 3 row stayed open. Two things closed it on 2026-10-05.
    # The UAT-pack limb closed at R.7 (7e318bc, above). The implementation limb
    # closed when the last two open rows resolved: 3.1.4 moved Partial -> Met in
    # 1e4b28c (failure capture), and 3.5.2 is held for v1.1 on owner decision
    # 2026-10-04, a deferral of a sub-clause rather than an open defect. The
    # section 3 tally re-derived from the Status column is 126 rows: 104 Met,
    # 11 Waived, 7 Excluded, 3 Deferred, 1 Partial, 0 Not Met. Owner accepted this
    # limb conditionally on 2026-10-05, on the explicit condition that it must not
    # close on acceptance alone; the condition was row 8 landing first, and it did.
    # No row was reclassified to make the arithmetic work. "this commit" because
    # the status change and this entry land together; backfill the SHA.
    ("6.4 implementation", "Not Met", "Met", "c86e890"),

    # SOW 6.4 "No open Critical or Major defects at go-live" (row 334). The clause
    # is scoped to Critical and Major, and the two defects that were release-blocking
    # are remediated and verified: 3.3.7 safety-checklist gating and 3.3.2
    # role-enforced transitions are both Met on the DB-backed suites, with 3.3.5
    # labour attribution and 3.2.1/3.2.3 notification generation closed at Phase F
    # and the UAT pack delivered at R.7. Four WCAG findings remain open and the
    # owner reviewed each by name on 2026-10-05 and accepted them for v1.1; they are
    # now named backlog items (v1.1-11..14) rather than prose. Worth recording that
    # docs/WCAG-AUDIT.md carries no severity scale at all, so "none of these four is
    # Critical or Major" rests on the audit's own "acceptable for light pass"
    # heading and the per-item mitigating factor it records, not on a recorded
    # severity judgement. The missing Command Palette focus trap is the item most
    # likely to be argued up, since a focus trap is a real 2.1 AA criterion. Not a
    # waiver: no row moved to Waived. Green CI at this SHA, run 185 (attempt 4).
    ("6.4 defects", "Not Met", "Met", "d7c8b74 (green CI run 185, attempt 4)"),

    # SOW 4.2 "Row-level data access control if multisite/cost-centre separation is required
    # (optional, TBD)" (row 260). The clause is conditional, so the question was never whether
    # per-cost-centre scoping exists but whether it is required. The owner answered 2026-10-05:
    # multisite cost-centre separation is not required for a single-site plant - the same fact
    # D-18 rested on - so the condition is false and the clause is satisfied by its own terms.
    # No code is expected and no gap is outstanding, which makes this a status move rather than
    # a build or a waiver: nothing was declined, and nothing was left unbuilt. "this commit"
    # because the status change and this entry must land together for the gate to stay green;
    # backfilled the real SHA once its push-run was in. Durable anchor: decision D-7, confirmed by
    # the SOW owner 2026-10-05, and the row-260 Note in SOW_COMPLIANCE.md.
    ("4.2 multisite-cost-centre", "Not Met", "Met", "59c38b5 (green CI run 189 at e4d3f95)"),

    # SOW 5.5 "Authentication via OAuth2 / OpenID Connect, with Azure AD or
    # on-premises AD integration" (row 298). Waived under decision D-5, which
    # named §5.5 and §3.10 together and was owner-accepted 2026-09-26: no Azure
    # AD or on-premises AD is available, and retained first-party JWT login was
    # recorded as a formal SOW 5.5 deviation. Row 76 (§3.10) already carried
    # Waived from the same decision; row 298 never moved. This is exactly the
    # case the Waived status exists for - a documented, closing-decision record
    # rather than a silent Not Met - and D-5's own outcome says "waived as a
    # formal, documented SOW 5.5 deviation", matching the register closing note
    # "the 5.5 deviation stands as documented in D-5". Not a build and not a
    # deferral: nothing is unbuilt and nothing reopened. Promotion commit
    # 5a65ab8 (green CI run 193). Durable anchor: decision D-5, its 2026-09-26
    # owner confirmation, and the row-298 Note in SOW_COMPLIANCE.md.
    ("5.5 oauth2", "Not Met", "Waived", "5a65ab8"),

    # SOW 1.3 "Data migration from legacy Excel/paper records" (row 40),
    # SOW 5.7 "A data migration runbook and a dry-run report before final
    # cutover" (row 307) and SOW 6.4 / d "Data migration accuracy > 99.9% for
    # master data; historical work order statuses correctly mapped" (row 335).
    # All three moved Not Met -> Met on 2026-10-10 when the B1 full legacy load
    # landed: the Client's full dataset was extracted by
    # scripts/migration/extract_full_dataset.py and loaded by the migration-trial
    # harness at 20,333/20,333 rows correct = 100.00% against the 99.9% target
    # (TRIAL_RUN_REPORT_FULL.md), every dropped or merged source row is logged
    # (FULL_LOAD_LEDGER.json), and the migration runbook is delivered
    # (docs/migration-runbook.md). None of the three is a section 3 row, so this
    # applies only against the all-rows baseline (EXPECT_ALL). The status change
    # and the verifier wiring landed together in 1971686, which is recorded here.
    # Durable anchor: the B1 closure-log row in docs/GAP_REGISTER.md.
    ("1.3 data-migration", "Not Met", "Met", "1971686"),
    ("5.7 migration-runbook", "Not Met", "Met", "1971686"),
    ("6.4 migration-accuracy", "Not Met", "Met", "1971686"),
]


def expected_counts(baseline, promotions):
    """Baseline counts adjusted by the approved promotions.

    Section 3 promotions apply to both baselines; the caller adds the
    all-scope (non-section-3) promotion list to the all-rows baseline only.
    """
    counts = dict(baseline)
    for _n, frm, to, _c in promotions:
        if frm in counts:
            counts[frm] -= 1
        if to in counts:
            counts[to] += 1
    return counts



def match_worksheet(reg_rows, s3_rows):
    """Pair each register disposition row with its matrix row.

    Keyed on clause + requirement rather than position, so a matrix row changing
    status cannot shift the pairing. Returns (pairs, unmatched_register,
    unmatched_matrix) where each pair is (register_row, matrix_row_or_None).
    """
    index = {}
    for m in s3_rows:
        index.setdefault((m["clause"], clean(m["requirement"])), []).append(m)

    pairs = []
    used = set()
    unmatched_reg = []
    for r in reg_rows:
        key = (r["clause"], clean(r["requirement"]))
        bucket = index.get(key)
        if not bucket:
            pairs.append((r, None))
            unmatched_reg.append(r["n"])
            continue
        # A duplicate requirement text within one clause would make this
        # ambiguous; take them in document order rather than silently reusing
        # the first.
        chosen = None
        for m in bucket:
            if id(m) not in used:
                chosen = m
                break
        if chosen is None:
            pairs.append((r, None))
            unmatched_reg.append(r["n"])
        else:
            used.add(id(chosen))
            pairs.append((r, chosen))

    unmatched_matrix = [m for m in s3_rows if id(m) not in used]
    return pairs, unmatched_reg, unmatched_matrix


SI = {}
OUT = []


def emit(line=""):
    OUT.append(line)
    print(line)


def parse_matrix(path):
    """Return every clause row as (clause, requirement, status, notes)."""
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            if not raw.startswith("|"):
                continue
            cells = raw.split("|")
            if len(cells) < 5:
                continue
            status = cells[3].strip()
            if status not in STATUSES:
                continue
            clause = cells[1].strip().lstrip("§").strip()
            rows.append(
                {
                    "clause": clause,
                    "requirement": cells[2].strip(),
                    "status": status,
                    "evidence": cells[4].strip(),
                    "notes": cells[5].strip() if len(cells) > 5 else "",
                }
            )
    return rows


def is_s3(clause):
    return clause == "3" or clause.startswith("3.")


def clean(text):
    """Normalise a matrix cell for comparison against the register copy."""
    for ch in ("**", "`"):
        text = text.replace(ch, "")
    text = text.replace("|", "/")
    text = text.replace("\u00d7", "x")  # multiplication sign vs plain x
    return " ".join(text.split())


def parse_register(path):
    """Return the disposition worksheet rows and the decision IDs defined."""
    rows = []
    decisions = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            # worksheet row: | n | clause | requirement | status | phase | decision | ...
            if len(cells) >= 6 and cells[0].isdigit():
                rows.append(
                    {
                        "n": int(cells[0]),
                        "clause": cells[1].lstrip("§").strip(),
                        "requirement": cells[2],
                        "status": cells[3],
                        "phase": cells[4],
                        "decision": cells[5],
                        "disposition": cells[6] if len(cells) > 6 else "",
                    }
                )
            # decision table row: | **D-2** | clause | question | ...
            elif len(cells) >= 3 and cells[0].strip("*").startswith("D-"):
                decisions.append(cells[0].strip("*").strip())
    return rows, decisions


def tally(rows):
    counts = {s: 0 for s in STATUSES}
    for r in rows:
        counts[r["status"]] += 1
    return counts


def main():
    emit("=" * 70)
    emit("A1 BASELINE FREEZE — docs/SOW_COMPLIANCE.md clause inventory")
    emit("=" * 70)
    emit(f"source file      : {os.path.relpath(MATRIX, ROOT)}")
    emit(f"source bytes     : {os.path.getsize(MATRIX)}")
    emit()

    if not os.path.exists(MATRIX):
        emit("FATAL: matrix not found")
        return 1

    rows = parse_matrix(MATRIX)
    all_counts = tally(rows)
    s3_rows = [r for r in rows if is_s3(r["clause"])]
    s3_counts = tally(s3_rows)

    # ---------- scope 1: all 214 clauses ----------
    emit("-" * 70)
    emit(f"SCOPE 1 — all clauses (expected {EXPECT_ALL_TOTAL})")
    emit("-" * 70)
    emit(f"clause rows parsed : {len(rows)}")
    SI["all_total"] = len(rows)
    SI["all_total_ok"] = len(rows) == EXPECT_ALL_TOTAL
    exp_all = expected_counts(
        EXPECT_ALL, APPROVED_PROMOTIONS + APPROVED_ALL_ONLY_PROMOTIONS
    )
    for s in STATUSES:
        got = all_counts[s]
        ok = got == exp_all[s]
        SI[f"all_{s.lower().replace(' ', '_')}"] = got
        SI[f"all_{s.lower().replace(' ', '_')}_ok"] = ok
        label = f"expected {exp_all[s]:>4}"
        if exp_all[s] != EXPECT_ALL[s]:
            label += f" (freeze {EXPECT_ALL[s]}, less approved promotions)"
        emit(f"  {s:<10} {got:>4}   {label}   {'OK' if ok else 'MISMATCH'}")
    emit(f"  {'TOTAL':<10} {sum(all_counts.values()):>4}   expected {EXPECT_ALL_TOTAL:>4}")

    if APPROVED_ALL_ONLY_PROMOTIONS:
        emit()
        emit("  all-scope promotions applied to the all-rows freeze:")
        for n, frm, to, c in APPROVED_ALL_ONLY_PROMOTIONS:
            emit(f"    {n}: {frm} -> {to}  ({c})")

    # ---------- scope 2: section 3 functional clauses ----------
    emit()
    emit("-" * 70)
    emit(f"SCOPE 2 — SOW section 3 functional (expected {EXPECT_S3_TOTAL})")
    emit("-" * 70)
    emit(f"clause rows parsed : {len(s3_rows)}")
    SI["s3_total"] = len(s3_rows)
    SI["s3_total_ok"] = len(s3_rows) == EXPECT_S3_TOTAL
    exp_s3 = expected_counts(EXPECT_S3, APPROVED_PROMOTIONS)
    if APPROVED_PROMOTIONS:
        emit(f"  approved promotions applied to the freeze: {len(APPROVED_PROMOTIONS)}")
        for n, frm, to, c in APPROVED_PROMOTIONS:
            emit(f"    promotion {n}: {frm} -> {to}  ({c})")
        emit()
    for s in STATUSES:
        got = s3_counts[s]
        ok = got == exp_s3[s]
        SI[f"s3_{s.lower().replace(' ', '_')}"] = got
        SI[f"s3_{s.lower().replace(' ', '_')}_ok"] = ok
        label = f"expected {exp_s3[s]:>4}"
        if exp_s3[s] != EXPECT_S3[s]:
            label += f" (freeze {EXPECT_S3[s]}, less approved promotions)"
        emit(f"  {s:<10} {got:>4}   {label}   {'OK' if ok else 'MISMATCH'}")

    # ---------- section 3 by subsection ----------
    emit()
    emit("-" * 70)
    emit("SCOPE 2 breakdown — rows per section 3 subsection")
    emit("-" * 70)
    sub = {}
    for r in s3_rows:
        parts = r["clause"].split(".")
        key = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else r["clause"]
        sub[key] = sub.get(key, 0) + 1

    def subkey(k):
        a, b = k.split(".")
        return (int(a), int(b))

    for k in sorted(sub, key=subkey):
        gaps = sum(
            1
            for r in s3_rows
            if r["clause"].split(".")[0:2] == k.split(".")
            and r["status"] in GAP_STATUSES
        )
        emit(f"  {k:<6} rows {sub[k]:>3}   in-scope gaps {gaps:>3}")
        SI[f"sub_{k.replace('.', '_')}"] = sub[k]

    # ---------- the number Phase A actually turns on ----------
    # The BUILD set is read off the matrix, because that is the live state.
    # The worksheet is read off the register, because that is the frozen Phase A
    # decision record and must stay 77 as later phases promote rows to Met.
    gaps = [r for r in s3_rows if r["status"] in GAP_STATUSES]
    waived = [r for r in s3_rows if r["status"] == "Waived"]
    emit()
    emit("-" * 70)
    emit("SOW 6.4.1 SCOPE — section 3 build set, waivers, and worksheet")
    emit("-" * 70)
    emit("BUILD set: matrix rows neither Deferred, Excluded nor Waived. Each must reach Met.")
    emit("WAIVED: in scope and open at the Phase A freeze, then deliberately not built.")
    emit("WORKSHEET: the 77 register rows, anchored on the register, not on matrix status,")
    emit("          so promoting a row to Met does not remove it from the worksheet.")
    emit()
    emit(f"  already met      : {s3_counts['Met']} Met")
    emit(f"  BUILD set        : {len(gaps)}   baseline {EXPECT_S3_BUILD}   "
         f"{'OK' if len(gaps) <= EXPECT_S3_BUILD else 'MISMATCH, set grew'}")
    if len(gaps) < EXPECT_S3_BUILD:
        emit(f"    (down {EXPECT_S3_BUILD - len(gaps)} from the Phase A freeze: "
             f"rows implemented since)")
    emit(f"    Partial        : {sum(1 for r in gaps if r['status'] == 'Partial')}")
    emit(f"    Not Met        : {sum(1 for r in gaps if r['status'] == 'Not Met')}")
    emit(f"  WAIVED           : {len(waived)}   expected {EXPECT_S3_WAIVED}   "
         f"{'OK' if len(waived) == EXPECT_S3_WAIVED else 'MISMATCH'}")
    emit(f"  build + waived   : {len(gaps) + len(waived)}   "
         f"{'OK' if len(gaps) + len(waived) + s3_counts['Met'] == EXPECT_S3_TOTAL else 'see reconciliation'}")
    emit(f"  already out      : {s3_counts['Deferred']} Deferred + {s3_counts['Excluded']} Excluded"
         f" = {s3_counts['Deferred'] + s3_counts['Excluded']}")
    reconciled = (
        s3_counts["Met"] + len(gaps) + len(waived)
        + s3_counts["Deferred"] + s3_counts["Excluded"]
    )
    emit(f"  reconciliation   : {s3_counts['Met']} Met + {len(gaps)} build"
         f" + {len(waived)} waived + {s3_counts['Deferred']} Def"
         f" + {s3_counts['Excluded']} Exc"
         f" = {reconciled} (must equal {EXPECT_S3_TOTAL})")
    SI["s3_build"] = len(gaps)
    # The build set only ever shrinks as rows are implemented. Failing only when
    # it grows catches a row silently reopened, while letting real progress pass.
    SI["s3_build_ok"] = len(gaps) <= EXPECT_S3_BUILD
    SI["s3_waived"] = len(waived)
    SI["s3_waived_ok"] = len(waived) == EXPECT_S3_WAIVED
    SI["s3_reconciliation_ok"] = reconciled == EXPECT_S3_TOTAL
    emit()
    emit(f"  6.4.1 is therefore {'SATISFIABLE' if len(gaps) == 0 else 'NOT MET'} at v1.0.0:")
    emit(f"  {len(gaps)} of {EXPECT_S3_TOTAL} section 3 clauses remain to be built,")
    emit(f"  and {len(waived)} more are waived and will not be built in any phase.")

    # ---------- build set, raw ----------
    emit()
    emit("-" * 70)
    emit("BUILD SET REGISTER (clause | status | requirement)")
    emit("-" * 70)
    for i, r in enumerate(gaps, 1):
        req = r["requirement"]
        if len(req) > 96:
            req = req[:93] + "..."
        emit(f"{i:>3}. {r['clause']:<8} {r['status']:<9} {req}")

    emit()
    emit("-" * 70)
    emit("WAIVED REGISTER (clause | requirement)")
    emit("-" * 70)
    for i, r in enumerate(waived, 1):
        req = r["requirement"]
        if len(req) > 96:
            req = req[:93] + "..."
        emit(f"{i:>3}. {r['clause']:<8} {req}")

    # ---------- register cross-check ----------
    emit()
    emit("-" * 70)
    emit("REGISTER CROSS-CHECK — docs/DECISION_REGISTER.md vs the matrix")
    emit("-" * 70)
    if not os.path.exists(REGISTER):
        emit("FATAL: register not found")
        return 1

    reg_rows, reg_decisions = parse_register(REGISTER)
    SI["register_rows"] = len(reg_rows)
    emit(f"worksheet rows        : {len(reg_rows)}   expected {EXPECT_S3_WORKSHEET}   "
         f"{'OK' if len(reg_rows) == EXPECT_S3_WORKSHEET else 'MISMATCH'}")
    SI["register_rows_ok"] = len(reg_rows) == EXPECT_S3_WORKSHEET

    emit(f"decisions defined     : {len(reg_decisions)}   expected {len(EXPECT_DECISIONS)}   "
         f"{'OK' if len(reg_decisions) == len(EXPECT_DECISIONS) else 'MISMATCH'}")
    emit(f"                       {', '.join(reg_decisions)}")
    SI["register_decisions_ok"] = sorted(reg_decisions) == sorted(EXPECT_DECISIONS)

    # Every register row is paired with its matrix row on clause + requirement,
    # not on position. Pairing by position is what made the worksheet fragile: a
    # single promoted or reworded row shifted every later pairing and reported
    # mismatches that did not exist.
    pairs, unmatched_reg, unmatched_matrix = match_worksheet(reg_rows, s3_rows)
    SI["s3_worksheet"] = len(reg_rows)
    SI["s3_worksheet_ok"] = len(reg_rows) == EXPECT_S3_WORKSHEET
    SI["worksheet_unmatched_register"] = len(unmatched_reg)
    SI["worksheet_unmatched_matrix"] = len(unmatched_matrix)

    emit()
    emit("  worksheet pairing (register row -> matrix row, on clause+requirement):")
    emit(f"    paired            : {len(pairs) - len(unmatched_reg)}   of {len(reg_rows)}")
    emit(f"    register unmatched: {len(unmatched_reg)}   "
         f"{'OK' if not unmatched_reg else 'MISMATCH'}")
    if unmatched_reg:
        emit(f"      register rows with no matrix row: {unmatched_reg[:10]}")

    # The matrix rows with no register row must be exactly the ones that were
    # never in the Phase A worksheet, i.e. Met, Deferred and Excluded. Asserting
    # that turns "some rows did not pair" from a vague note into an invariant: a
    # genuinely missing row, or a build row that silently lost its register
    # entry, fails here instead of scrolling past.
    OUT_OF_WORKSHEET = ("Met", "Deferred", "Excluded")
    stray = [m for m in unmatched_matrix if m["status"] not in OUT_OF_WORKSHEET]
    stray_counts = {}
    for m in unmatched_matrix:
        stray_counts[m["status"]] = stray_counts.get(m["status"], 0) + 1
    detail = ", ".join(f"{v} {k}" for k, v in sorted(stray_counts.items()))
    emit(f"    matrix unpaired   : {len(unmatched_matrix)}   {detail}")
    emit(f"      expected to be exactly the Met/Deferred/Excluded rows that were never")
    emit(f"      in the Phase A worksheet: {len(unmatched_matrix) - len(stray)} of {len(unmatched_matrix)}")
    SI["matrix_stray_rows_ok"] = not stray
    if stray:
        for m in stray[:10]:
            emit(f"      STRAY {m['clause']} {m['status']} {m['requirement'][:60]}")
    else:
        emit(f"      OK, no build or waived row lost its register entry")

    clause_mismatch = []
    req_mismatch = []
    phase_bad = []
    decision_bad = []
    for i, (r, m) in enumerate(pairs):
        if m is None:
            continue
        if m["clause"] != r["clause"]:
            clause_mismatch.append((i + 1, m["clause"], r["clause"]))
        if clean(m["requirement"]) != clean(r["requirement"]):
            req_mismatch.append((i + 1, clean(m["requirement"])[:50], clean(r["requirement"])[:50]))
        if r["phase"] not in PHASES:
            phase_bad.append((i + 1, r["phase"]))
        if r["decision"] != "-" and not (
            r["decision"] in reg_decisions
            or re.match(r"^deferred D\d+$", r["decision"])
        ):
            decision_bad.append((i + 1, r["decision"]))

    # Status is deliberately NOT compared here any more. The register's status
    # column is the status at the Phase A freeze; the matrix status advances as
    # phases land. Comparing them would fail every time a row is legitimately
    # promoted, which is precisely the change the phase is meant to make. The
    # disposition column (Build/Waive) is the frozen decision and is still
    # checked, below.
    status_drift = [
        (r["n"], m["status"], r["status"])
        for r, m in pairs
        if m is not None and m["status"] != r["status"]
    ]
    if status_drift:
        emit()
        emit("  matrix status has advanced past the Phase A freeze on these rows:")
        for n, ms, rs in status_drift[:12]:
            emit(f"      register row {n}: freeze {rs!r} -> matrix {ms!r}")
        if len(status_drift) > 12:
            emit(f"      ... and {len(status_drift) - 12} more")
    SI["status_advanced_rows"] = len(status_drift)

    # The matrix and the register each hold a copy of the same disposition.
    # Comparing them to the frozen counts is what stops a waive being recorded
    # in one document and forgotten in the other.
    reg_build = [r for r in reg_rows if r["disposition"].replace("*", "") == "Build"]
    reg_waive = [r for r in reg_rows if r["disposition"].replace("*", "") == "Waive"]
    emit()
    emit("  matrix vs register disposition totals:")
    emit(f"    matrix BUILD set      : {len(gaps):>3}   register Build : {len(reg_build):>3}   "
         f"{'OK' if len(gaps) == len(reg_build) else 'see note'}")
    emit(f"    matrix WAIVED         : {len(waived):>3}   register Waive : {len(reg_waive):>3}   "
         f"{'OK' if len(waived) == len(reg_waive) else 'MISMATCH'}")
    # The register's Build count is frozen at 66. The matrix build set shrinks
    # as rows reach Met, so a lower matrix figure is progress, not a drift.
    # The register side is still the authority for what was decided.
    SI["matrix_register_build_ok"] = len(gaps) <= len(reg_build)
    SI["matrix_register_waived_ok"] = len(waived) == len(reg_waive)
    if len(gaps) < len(reg_build):
        emit(f"    note: matrix build set has fallen {len(reg_build) - len(gaps)} below the")
        emit(f"          frozen register count, i.e. {len(reg_build) - len(gaps)} build row(s) now Met.")
    # A row the matrix calls Waived must be dispositioned Waive, and vice
    # versa. This catches a waive flipped on one side only, and unlike status it
    # is a frozen decision that must never drift.
    flip = [
        (r["n"], m["status"], r["disposition"].replace("*", ""))
        for r, m in pairs
        if m is not None
        and (m["status"] == "Waived") != (r["disposition"].replace("*", "") == "Waive")
    ]
    SI["waive_direction_ok"] = not flip
    emit(f"    waive direction       : {'OK' if not flip else str(len(flip)) + ' MISMATCH'}")
    for n, ms, ds in flip[:10]:
        emit(f"      row {n}: matrix {ms!r} vs register {ds!r}")

    for label, bad in (
        ("clause", clause_mismatch),
        ("requirement text", req_mismatch),
        ("phase value", phase_bad),
        ("decision reference", decision_bad),
    ):
        ok = not bad
        SI[f"register_{label.replace(' ', '_')}_ok"] = ok
        emit(f"  {label:<20}: {'OK' if ok else str(len(bad)) + ' MISMATCH'}")
        for entry in bad[:10]:
            emit(f"      row {entry[0]}: {entry[1]!r} vs {entry[2]!r}")

    # phase distribution
    dist = {}
    for r in reg_rows:
        dist[r["phase"]] = dist.get(r["phase"], 0) + 1
    emit()
    emit("  phase distribution (worksheet rows):")
    for p in PHASES:
        emit(f"    {p}: {dist.get(p, 0)}")
    SI["register_phase_total_ok"] = sum(dist.values()) == EXPECT_S3_WORKSHEET
    emit(f"    total: {sum(dist.values())}   "
         f"{'OK' if sum(dist.values()) == EXPECT_S3_WORKSHEET else 'MISMATCH'}")

    gated = [r for r in reg_rows if r["decision"] != "-"]
    emit(f"  rows gated on a decision: {len(gated)}   "
         f"ungated: {len(reg_rows) - len(gated)}")

    # ---------- verdict ----------
    failures = [k for k, v in SI.items() if k.endswith("_ok") and v is False]
    SI["failures"] = len(failures)
    emit()
    emit("=" * 70)
    if failures:
        emit(f"A1 BASELINE FREEZE: FAIL — {len(failures)} assertion(s) failed")
        for f in failures:
            emit(f"  FAILED: {f}")
    else:
        emit("A1 BASELINE FREEZE: PASS — frozen inventory re-derived from source")
    emit("=" * 70)

    os.makedirs(SCREEN, exist_ok=True)
    with open(os.path.join(SCREEN, "a1_baseline.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\n")
    print(f"\n[written] {os.path.relpath(os.path.join(SCREEN, 'a1_baseline.txt'), ROOT)}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
