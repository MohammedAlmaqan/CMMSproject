"""
Phase A disposition gate.

The signature requirement was withdrawn by the SOW owner on 2026-09-26, so this
gate no longer looks for a human signature. It checks the things that are still
mechanically checkable, and it is deliberately honest about the one thing that
is not:

  CHECKED   every §3 gap row is dispositioned Build or Waive, unambiguously
  CHECKED   every row carries a one-line reason
  CHECKED   every decision carries an answer
  CHECKED   every decision cited by a row actually exists
  CHECKED   the register's own claimed totals match the rows above them
  NOT CHECKED whether the dispositions are any good. That is judgement, and
            judgement is what was delegated. This gate cannot verify it and
            does not pretend to.

Exits 0 only when every check passes. It never writes the register and never
supplies a disposition, a reason or an answer on anyone's behalf.
"""
import io
import os
import re
import sys

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
REGISTER = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")
SCREEN = os.path.join(ROOT, "screenshots")
EVIDENCE = "a1_dispositions.txt"

EXPECT_ROWS = 77
VALID = ("Build", "Waive")
DECISION_RE = re.compile(r"^D-(\d+)$")

OUT = []


def emit(line=""):
    OUT.append(line)


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse():
    """Return worksheet rows, decision rows, rationale rows, phase summary."""
    rows, decisions, rationale, phase_rows = [], [], [], []
    for raw in io.open(REGISTER, "r", encoding="utf-8"):
        line = raw.strip()
        if not line.startswith("|"):
            continue
        c = cells(line)
        if not c:
            continue
        if c[0].isdigit() and len(c) == 8:
            rows.append({
                "n": int(c[0]),
                "clause": c[1],
                "status": c[3],
                "phase": c[4],
                "ref": c[5],
                "disp": c[6].replace("*", "").strip(),
                "reason": c[7],
            })
        elif re.match(r"^\*\*D-\d+\*\*$", c[0]) and len(c) >= 7:
            decisions.append({"id": c[0].strip("*"), "answer": c[6]})
        elif re.match(r"^\*\*D-\d+\*\*$", c[0]) and len(c) == 2:
            rationale.append({"id": c[0].strip("*"), "why": c[1]})
        elif re.match(r"^\*\*[B-H]\*\*$", c[0]) and len(c) == 4:
            phase_rows.append(c)
        elif len(c) > 1 and c[1] == "**Total**":
            phase_rows.append(c)
    return rows, decisions, rationale, phase_rows


def main():
    emit("=" * 72)
    emit("PHASE A DISPOSITION GATE - docs/DECISION_REGISTER.md")
    emit("=" * 72)
    emit(f"register : {os.path.relpath(REGISTER, ROOT)}")
    emit("authority: vendor-decided under delegation (NOT a client signature)")
    emit()

    if not os.path.exists(REGISTER):
        emit("FATAL: register not found at")
        emit(f"       {REGISTER}")
        print("\n".join(OUT))
        return 1

    rows, decisions, rationale, phase_rows = parse()
    failures = []

    # --- 1. every row dispositioned unambiguously -------------------------
    emit("-" * 72)
    emit(f"1. DISPOSITIONS   {len(rows)}/{EXPECT_ROWS} rows parsed")
    emit("-" * 72)
    if len(rows) != EXPECT_ROWS:
        failures.append(f"worksheet row count {len(rows)} != {EXPECT_ROWS}")
    bad_disp = [r for r in rows if r["disp"] not in VALID]
    emit(f"   invalid or ambiguous dispositions : {len(bad_disp)}")
    for r in bad_disp[:8]:
        emit(f"     row {r['n']:>2} {r['clause']:<9} -> {r['disp']!r}")
    if bad_disp:
        failures.append(f"{len(bad_disp)} row(s) not exactly Build or Waive")

    counts = {d: sum(1 for r in rows if r["disp"] == d) for d in VALID}
    emit(f"   Build {counts['Build']}   Waive {counts['Waive']}   "
         f"total {counts['Build'] + counts['Waive']}")
    if counts["Build"] + counts["Waive"] != len(rows):
        failures.append("Build + Waive does not equal the row count")
    if not bad_disp:
        emit("   every row carries exactly one disposition")

    # --- 2. every row reasoned --------------------------------------------
    emit()
    emit("-" * 72)
    emit("2. REASONS        one line per row")
    emit("-" * 72)
    no_reason = [r for r in rows if not r["reason"].strip()]
    emit(f"   rows without a reason : {len(no_reason)}")
    for r in no_reason[:8]:
        emit(f"     row {r['n']:>2} {r['clause']}")
    if no_reason:
        failures.append(f"{len(no_reason)} row(s) with no reason")
    waives = [r for r in rows if r["disp"] == "Waive"]
    thin = [r for r in waives if len(r["reason"].split()) < 4]
    emit(f"   waives with a substantive reason : {len(waives) - len(thin)}/{len(waives)}")
    for r in thin[:8]:
        emit(f"     row {r['n']:>2} reason too short: {r['reason']!r}")
    if thin:
        failures.append(f"{len(thin)} waive(s) without a real business reason")

    # --- 3. decisions answered --------------------------------------------
    emit()
    emit("-" * 72)
    emit(f"3. DECISIONS      {len(decisions)} defined")
    emit("-" * 72)
    unanswered = [d["id"] for d in decisions if not d["answer"].strip()]
    emit(f"   answered     : {len(decisions) - len(unanswered)}/{len(decisions)}")
    if unanswered:
        emit(f"   unanswered   : {', '.join(unanswered)}")
        failures.append(f"{len(unanswered)} decision(s) unanswered")
    else:
        emit("   every decision carries an answer")

    # --- 4. every decision carries a rationale -----------------------------
    emit()
    emit("-" * 72)
    emit(f"4. RATIONALE      {len(rationale)} recorded")
    emit("-" * 72)
    r_ids = {r["id"] for r in rationale}
    thin_why = [r for r in rationale if len(r["why"].split()) < 5]
    missing_why = [d["id"] for d in decisions if d["id"] not in r_ids]
    emit(f"   decisions with a rationale : {len(decisions) - len(missing_why)}/{len(decisions)}")
    if missing_why:
        emit(f"   missing                    : {', '.join(missing_why)}")
        failures.append(f"{len(missing_why)} decision(s) with no rationale")
    else:
        emit("   every decision states why it was decided that way")
    emit(f"   rationales under 5 words    : {len(thin_why)}")
    for r in thin_why[:5]:
        emit(f"     {r['id']}: {r['why']!r}")
    if thin_why:
        failures.append(f"{len(thin_why)} rationale(s) too thin to be useful")

    # --- 5. decision references resolve -----------------------------------
    emit()
    emit("-" * 72)
    emit("5. REFERENCES     decision IDs cited by rows")
    emit("-" * 72)
    known = {d["id"] for d in decisions}
    deferred = set()
    dangling, cited, deferred_cited = [], set(), set()
    for r in rows:
        ref = r["ref"].strip()
        if ref in ("", "-"):
            continue
        m = DECISION_RE.match(ref)
        if m and ref in known:
            cited.add(ref)
        elif ref.lower().startswith("deferred d"):
            deferred_cited.add(ref)
            m2 = re.match(r"deferred d(\d+)", ref, re.I)
            if m2:
                deferred.add(int(m2.group(1)))
        else:
            dangling.append((r["n"], ref))
    emit(f"   Phase A decisions cited : {len(cited)} -> {', '.join(sorted(cited, key=lambda d: int(d.split('-')[1])))}")
    emit(f"   matrix deferred cited  : {len(deferred_cited)} -> {', '.join(sorted(deferred_cited))}")
    emit(f"   dangling references    : {len(dangling)}")
    for n, ref in dangling[:8]:
        emit(f"     row {n} cites {ref!r}, which is not a decision in this register")
    if dangling:
        failures.append(f"{len(dangling)} dangling decision reference(s)")

    orphan = sorted(known - cited, key=lambda d: int(d.split("-")[1]))
    emit(f"   decisions no row cites : {len(orphan)} -> {', '.join(orphan) if orphan else 'none'}")
    emit("     (expected for decisions on 4.x / 5.x / 6.4 clauses, which are")
    emit("      outside the 3 register; informational, not a failure)")

    # --- 6. the register's own totals must match its own rows --------------
    emit()
    emit("-" * 72)
    emit("6. SELF-CONSISTENCY  claimed totals vs computed")
    emit("-" * 72)
    if not phase_rows:
        failures.append("phase summary Total row not found")
        emit("   FATAL: phase summary Total row not found")
    else:
        tot = phase_rows[-1]
        try:
            claim_b = int(tot[2].replace("*", ""))
            claim_w = int(tot[3].replace("*", ""))
        except (IndexError, ValueError):
            claim_b = claim_w = -1
            failures.append("phase summary Total row is unparseable")
        ok = claim_b == counts["Build"] and claim_w == counts["Waive"]
        emit(f"   phase table claims : Build {claim_b}  Waive {claim_w}")
        emit(f"   worksheet computes : Build {counts['Build']}  Waive {counts['Waive']}")
        emit(f"   agreement          : {'OK' if ok else 'MISMATCH'}")
        if not ok:
            failures.append("phase summary totals disagree with the worksheet")

        # per-phase agreement
        phase_claim = {}
        for c in phase_rows[:-1]:
            m = re.match(r"^\*\*([B-H])\*\*$", c[0])
            if m:
                try:
                    phase_claim[m.group(1)] = (int(c[2]), int(c[3]))
                except (IndexError, ValueError):
                    pass
        bad_phase = []
        for p in "BCDEFGH":
            ids = [r for r in rows if r["phase"] == p]
            cb = sum(1 for r in ids if r["disp"] == "Build")
            cw = sum(1 for r in ids if r["disp"] == "Waive")
            pc = phase_claim.get(p)
            if pc is None or pc != (cb, cw):
                bad_phase.append((p, pc, (cb, cw)))
        emit(f"   per-phase agreement: {'OK' if not bad_phase else 'MISMATCH'}")
        for p, pc, comp in bad_phase:
            emit(f"     phase {p}: table says {pc}, rows say {comp}")
        if bad_phase:
            failures.append(f"{len(bad_phase)} phase row(s) disagree with the worksheet")

    # --- what this gate does not check -------------------------------------
    emit()
    emit("-" * 72)
    emit("NOT CHECKED BY THIS GATE")
    emit("-" * 72)
    emit("   Whether the dispositions are correct. Completeness, internal")
    emit("   consistency and traceability to the matrix are verified above.")
    emit("   Engineering judgement is not, and cannot be. The 10 waives are")
    emit("   scope reductions; the SOW owner confirmed all six Phase A flags on")
    emit("   2026-09-26, but a waive can still be reversed by the owner at any")
    emit("   time, and doing so re-opens the row.")

    # --- verdict -----------------------------------------------------------
    emit()
    emit("=" * 72)
    if failures:
        emit(f"PHASE A DISPOSITION GATE: NOT PASSED - {len(failures)} check(s) failed")
        for f in failures:
            emit(f"   FAILED: {f}")
    else:
        emit("PHASE A DISPOSITION GATE: PASSED - all 77 rows dispositioned and reasoned")
        emit(f"   Build {counts['Build']} / Waive {counts['Waive']}; "
             f"{len(decisions)} decisions answered; totals self-consistent")
    emit("=" * 72)

    os.makedirs(SCREEN, exist_ok=True)
    with io.open(os.path.join(SCREEN, EVIDENCE), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\n")
    print("\n".join(OUT))
    print(f"\n[written] {os.path.relpath(os.path.join(SCREEN, EVIDENCE), ROOT)}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
