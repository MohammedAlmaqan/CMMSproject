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
EXPECT_S3_BUILD = 67
EXPECT_S3_WAIVED = 10
EXPECT_S3_WORKSHEET = 77
GAP_STATUSES = ("Partial", "Not Met")
PHASES = ("B", "C", "D", "E", "F", "G", "H")
EXPECT_DECISIONS = [f"D-{n}" for n in range(2, 18)]

# ---------------------------------------------------------------------------
# APPROVED PROMOTIONS
#
# The tallies above are the Phase A freeze. A later phase implementing a row is
# supposed to move it Partial/Not Met -> Met, which would make every exact
# equality above fail. Rather than weaken the gate, each promotion has to be
# listed here with the commit that justifies it, and the expected counts are
# derived from the freeze by applying this list. So an unlisted status change is
# still a FAIL, exactly as before, while a reviewed one is not noise.
#
# Phase B (rows 14/15/16/17/22/33) is deliberately absent: the code landed but
# its runtime behaviour was never exercised against a live database, so the owner
# directed that the statuses be held rather than promoted. That decision is
# recorded in CMMS_FINALIZATION_TRACKER.md.
#
# Phase C contributes two entries, both Not Met -> Partial rather than -> Met,
# because in both cases the *defect* is gone but the row still cannot be called
# satisfied. expected_counts() applies any from/to pair, not just promotions to
# Met, so these are modelled by the same mechanism; they are listed separately
# below only so the distinction is visible to a reader.
#
#   reg 9  (§3.1.4) task lists were modellable but had no screen at all, so the
#           row read Not Met. C.14 built the CRUD surface; it is now Partial.
#   reg 27 (§3.3.3) a work order could reach a field-work status with zero
#           operations. C.5 added the guard; it is now Partial.
#
# Both are section 3 rows, so both apply to EXPECT_ALL and EXPECT_S3 alike. The
# register's own Status column is the freeze-time value and is deliberately not
# compared against the matrix (see B.7); reg row 9 is recorded there as Partial
# even though the matrix row was Not Met at the freeze, so the `from` below is
# the *matrix* status, which is what expected_counts() is reconciling against.
#
# Format: (register row number, from status, to status, commit)
APPROVED_PROMOTIONS: list = [
    (9, "Not Met", "Partial", "5f4a7e0"),
    (27, "Not Met", "Partial", "f2f3bf6"),
]


def expected_counts(baseline, promotions):
    """Baseline counts adjusted by the approved promotions.

    Only section 3 promotions are modelled, because a promotion in section 4 or
    5 would have to be listed against the all-rows baseline instead.
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
    exp_all = expected_counts(EXPECT_ALL, APPROVED_PROMOTIONS)
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
            emit(f"    register row {n}: {frm} -> {to}  ({c})")
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
        if clean(m["requirement"]) != r["requirement"]:
            req_mismatch.append((i + 1, clean(m["requirement"])[:50], r["requirement"][:50]))
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
    # The register's Build count is frozen at 67. The matrix build set shrinks
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
