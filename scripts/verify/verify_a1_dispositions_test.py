"""
Self-test for verify_a1_signed.py.

A gate that can never pass is useless. A gate that can never fail is worse.
This proves both halves: the Phase A sign-off gate reaches PASS on a fully
signed register, and rejects every partial or contradictory signing.

The real docs/DECISION_REGISTER.md is opened read-only. All mutation happens on
throwaway copies in the system temp directory. The test never signs anything for
real and never touches the shipped register.
"""
import io
import os
import re
import subprocess
import sys
import tempfile

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
REAL = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")
GATE = os.path.join(ROOT, "scripts", "verify", "verify_a1_signed.py")

SRC = io.open(REAL, encoding="utf-8").read()
RESULTS = []


def cells_of(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def render(cells):
    return "| " + " | ".join(cells) + " |"


def edit(text, pred, fn):
    """Apply fn(cells)->cells to every line in `text` matching pred."""
    out = []
    for line in text.split("\n"):
        if line.startswith("|") and pred(cells_of(line)):
            out.append(render(fn(cells_of(line))))
        else:
            out.append(line)
    return "\n".join(out)


def is_worksheet(c):
    return bool(c) and c[0].isdigit() and len(c) >= 7


def decision_id(c):
    m = re.match(r"^\*\*(D-\d+)\*\*$", c[0]) if c else None
    return m.group(1) if m else None


def set_box(text, rowno, build, waive):
    mark = lambda f: "x" if f else " "  # noqa: E731
    return edit(text,
                lambda c: is_worksheet(c) and int(c[0]) == rowno,
                lambda c: c[:6] + [f"[{mark(build)}] Build "
                                   f"[{mark(waive)}] Waive"] + c[7:])


def set_answer(text, did, val):
    return edit(text, lambda c: decision_id(c) == did, lambda c: c[:6] + [val])


def set_sign(text, role, name, date, sig):
    def pred(c):
        return bool(c) and role.lower() in c[0].lower() and not is_worksheet(c)
    return edit(text, pred, lambda c: c[:1] + [name, date, sig] + c[4:])


CLIENT_ROLES = ("SOW owner", "Maintenance / Finance", "IT", "Operations")


def sign_all(except_row=None, drop_answers=(), drop_sign=False, dbl_row=None,
             waive_row=None):
    """Build a synthetic register: signed, or signed with one specific flaw."""
    t = SRC
    for n in range(1, 78):
        if n == except_row:
            continue
        t = set_box(t, n, build=n != waive_row,
                    waive=n in (dbl_row, waive_row))
    for n in range(2, 17):
        did = f"D-{n}"
        t = set_answer(t, did, "" if did in drop_answers else "(a) answered")
    if not drop_sign:
        for role in CLIENT_ROLES:
            t = set_sign(t, role, "Alice Smith", "2026-01-01", "/s/ Alice Smith")
    return t


def run_gate(text):
    """Run the real gate against `text` in an isolated temp dir."""
    tmp = tempfile.mkdtemp(prefix="a1gate_")
    reg = os.path.join(tmp, "DECISION_REGISTER.md")
    scr = os.path.join(tmp, "screenshots")
    os.makedirs(scr)
    io.open(reg, "w", encoding="utf-8").write(text)
    gate = os.path.join(tmp, "gate.py")
    patched = io.open(GATE, encoding="utf-8").read()
    patched = patched.replace(
        'REGISTER = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")',
        f"REGISTER = {reg!r}")
    patched = patched.replace('SCREEN = os.path.join(ROOT, "screenshots")',
                              f"SCREEN = {scr!r}")
    io.open(gate, "w", encoding="utf-8").write(patched)
    return subprocess.run(
        [sys.executable, gate], capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        env=dict(os.environ, PYTHONIOENCODING="utf-8"))


def main():
    cases = [
        ("fully signed", sign_all(), 0),
        ("one disposition missing", sign_all(except_row=14), 1),
        ("first row missing", sign_all(except_row=1), 1),
        ("last row missing", sign_all(except_row=77), 1),
        ("one decision unanswered", sign_all(drop_answers=("D-16",)), 1),
        ("all decisions unanswered",
         sign_all(drop_answers=tuple(f"D-{n}" for n in range(2, 17))), 1),
        ("no signatures", sign_all(drop_sign=True), 1),
        ("both boxes ticked on one row", sign_all(dbl_row=20), 1),
        ("one row waived, rest built", sign_all(waive_row=20), 0),
    ]

    print("=" * 78)
    print("PHASE A SIGN-OFF GATE SELF-TEST")
    print("=" * 78)
    print("proves the gate can pass, and that no partial or contradictory")
    print("signing is accepted. Real register is read-only throughout.")
    print()

    failures = 0
    for label, text, expect in cases:
        r = run_gate(text)
        m = re.search(r"PHASE A GATE: ([A-Z ]+)", r.stdout)
        verdict = m.group(1).strip() if m else "NO OUTPUT"
        ok = r.returncode == expect
        failures += 0 if ok else 1
        print(f"  {label:<32} rc={r.returncode} expect={expect}  "
              f"{'OK' if ok else 'BAD':<5} {verdict}")
        if not ok:
            print("  " + "-" * 72)
            for l in r.stdout.split("\n")[-25:]:
                print("  " + l)
            if r.stderr.strip():
                print("  stderr: " + r.stderr[-500:])

    print()
    print("-" * 78)
    if failures:
        print(f"RESULT: FAIL - {failures} of {len(cases)} cases wrong")
    else:
        print(f"RESULT: PASS - all {len(cases)} cases behaved correctly")
    print("=" * 78)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
