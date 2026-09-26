"""
Phase A sign-off gate.

Distinct from verify_a1.py on purpose:
  verify_a1.py          = structural integrity. Does the register still match the
                          matrix? Must always be green.
  verify_a1_signed.py   = the contractual gate. Has the Client actually decided
                          anything? Red until they have, and that redness is the
                          honest state of the project, not a defect.

This script reports three outstanding counts:
  1. the 77 worksheet rows without a Build/Waive disposition
  2. the 15 decisions without an Answer
  3. the sign-off block without a Client signature

Exit 0 only when all three are zero. It never edits the register and never
supplies a disposition, an answer or a signature on the Client's behalf.
"""
import io
import os
import re
import sys

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
REGISTER = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")
SCREEN = os.path.join(ROOT, "screenshots")
EVIDENCE = "a1_signoff.txt"

EXPECT_ROWS = 77
EXPECT_DECISIONS = 15
REQUIRED_SIGNATORIES = 4  # Client roles; vendor lead is not the gate

OUT = []


def emit(line=""):
    OUT.append(line)


def parse():
    """Return worksheet rows, decision answer cells, and sign-off table cells."""
    rows, answers, signatories = [], [], []
    in_signoff = False
    with io.open(REGISTER, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if line.startswith("### Sign-off"):
                in_signoff = True
                continue
            if in_signoff and line.startswith("###"):
                in_signoff = False
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if cells and cells[0].isdigit() and len(cells) >= 7:
                rows.append(cells)
            m = re.match(r"^\| \*\*(D-\d+)\*\* \|", line)
            if m and len(cells) >= 7:
                answers.append((m.group(1), cells[6]))
            if in_signoff and cells[0].lower().startswith("role"):
                continue
            if in_signoff and cells and cells[0].lower().startswith("client"):
                signatories.append(cells)
    return rows, answers, signatories


def main():
    emit("=" * 70)
    emit("PHASE A SIGN-OFF GATE — docs/DECISION_REGISTER.md")
    emit("=" * 70)
    emit(f"register      : {os.path.relpath(REGISTER, ROOT)}")
    emit()

    if not os.path.exists(REGISTER):
        emit("FATAL: register not found at")
        emit(f"       {REGISTER}")
        print("\n".join(OUT))
        return 1

    rows, answers, signatories = parse()

    # --- 1. dispositions -------------------------------------------------
    chosen, undecided = [], []
    for cells in rows:
        disposition = cells[6]
        # resolved when exactly one of the two boxes is ticked
        ticked = len(re.findall(r"\[[xX]\]", disposition))
        if ticked == 1:
            chosen.append(cells[1])
        else:
            undecided.append((cells[1], disposition))

    emit("-" * 70)
    emit(f"1. DISPOSITIONS   {len(chosen)}/{EXPECT_ROWS} decided")
    emit("-" * 70)
    if undecided:
        emit(f"   outstanding: {len(undecided)}")
        for clause, disp in undecided[:5]:
            emit(f"     {clause:<10} {disp}")
        if len(undecided) > 5:
            emit(f"     ... and {len(undecided) - 5} more")
    else:
        emit("   all rows carry exactly one Build/Waive disposition")

    # --- 2. decision answers ---------------------------------------------
    unanswered = [d for d, ans in answers if not ans]
    emit()
    emit("-" * 70)
    emit(f"2. DECISIONS      {len(answers) - len(unanswered)}/{EXPECT_DECISIONS} answered")
    emit("-" * 70)
    if unanswered:
        emit(f"   outstanding: {', '.join(unanswered)}")
    else:
        emit("   all decisions carry a Client answer")

    # --- 3. signatures ----------------------------------------------------
    signed, unsigned = 0, []
    for cells in signatories:
        name = cells[1] if len(cells) > 1 else ""
        sig = cells[3] if len(cells) > 3 else ""
        if name and sig:
            signed += 1
        else:
            unsigned.append(cells[0])
    emit()
    emit("-" * 70)
    emit(f"3. SIGNATURES     {signed}/{REQUIRED_SIGNATORIES} Client signatories")
    emit("-" * 70)
    if unsigned:
        for role in unsigned:
            emit(f"   unsigned: {role}")
    else:
        emit("   all required Client signatories present")

    # --- verdict ----------------------------------------------------------
    outstanding = len(undecided) + len(unanswered) + len(unsigned)
    emit()
    emit("=" * 70)
    if outstanding:
        emit(f"PHASE A GATE: NOT PASSED - {outstanding} item(s) outstanding")
        emit("")
        emit("  The vendor cannot clear these. Each requires a Client act:")
        emit("    - a Build/Waive disposition on a worksheet row")
        emit("    - an Answer against a decision")
        emit("    - a name and signature in the sign-off block")
        emit("")
        emit("  No further engineering phase is planned or started until this")
        emit("  gate passes. v1.0.0 remains the shipped tag and is not re-cut.")
    else:
        emit("PHASE A GATE: PASSED - scope frozen by Client signature")
    emit("=" * 70)

    os.makedirs(SCREEN, exist_ok=True)
    with io.open(os.path.join(SCREEN, EVIDENCE), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\n")
    print("\n".join(OUT))
    print(f"\n[written] {os.path.relpath(os.path.join(SCREEN, EVIDENCE), ROOT)}")

    return 1 if outstanding else 0


if __name__ == "__main__":
    sys.exit(main())
