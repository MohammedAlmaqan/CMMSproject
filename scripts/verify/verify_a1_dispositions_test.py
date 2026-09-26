"""
Self-test for verify_a1_dispositions.py.

A gate that can never pass is useless. A gate that can never fail is worse.
This proves both halves: the Phase A disposition gate reaches PASS on a fully
decided register, and rejects every incomplete, ambiguous or self-contradictory
state.

The real docs/DECISION_REGISTER.md is opened read-only. All mutation happens on
throwaway copies in the system temp directory.
"""
import io
import os
import re
import subprocess
import sys
import tempfile

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
REAL = os.path.join(ROOT, "docs", "DECISION_REGISTER.md")
GATE = os.path.join(ROOT, "scripts", "verify", "verify_a1_dispositions.py")

SRC = io.open(REAL, encoding="utf-8").read()
RESULTS = []


def cells_of(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def render(c):
    return "| " + " | ".join(c) + " |"


def edit(text, pred, fn):
    out = []
    for line in text.split("\n"):
        if line.startswith("|") and pred(cells_of(line)):
            out.append(render(fn(cells_of(line))))
        else:
            out.append(line)
    return "\n".join(out)


def is_worksheet(c):
    return bool(c) and c[0].isdigit() and len(c) == 8


def is_decision(c):
    return bool(c) and bool(re.match(r"^\*\*D-\d+\*\*$", c[0])) and len(c) >= 7


def is_rationale(c):
    return bool(c) and bool(re.match(r"^\*\*D-\d+\*\*$", c[0])) and len(c) == 2


def set_disp(text, rowno, value):
    return edit(text, lambda c: is_worksheet(c) and int(c[0]) == rowno,
                lambda c: c[:6] + [value] + c[7:])


def set_reason(text, rowno, value):
    return edit(text, lambda c: is_worksheet(c) and int(c[0]) == rowno,
                lambda c: c[:7] + [value])


def set_answer(text, did, value):
    return edit(text, lambda c: is_decision(c) and c[0] == f"**{did}**",
                lambda c: c[:6] + [value])


def clear_rationale(text, did):
    return edit(text, lambda c: is_rationale(c) and c[0] == f"**{did}**",
                lambda c: [c[0], ""])


def set_total(text, b, w):
    return edit(text, lambda c: len(c) > 1 and c[1] == "**Total**",
                lambda c: c[:2] + [f"**{b}**", f"**{w}**"])


def set_phase_counts(text, b, w):
    return edit(text, lambda c: bool(re.match(r"^\*\*[B-H]\*\*$", c[0])) and len(c) == 4,
                lambda c: c[:2] + [str(b), str(w)])


def set_ref(text, rowno, value):
    return edit(text, lambda c: is_worksheet(c) and int(c[0]) == rowno,
                lambda c: c[:5] + [value] + c[6:])


def run_gate(text):
    tmp = tempfile.mkdtemp(prefix="a1disp_")
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
    waived = [n for n, c in
              ((int(cells_of(l)[0]), cells_of(l)[6]) for l in SRC.split("\n")
               if l.startswith("|") and cells_of(l) and cells_of(l)[0].isdigit()
               and len(cells_of(l)) == 8)
              if "Waive" in c]

    cases = [
        ("as decided (baseline)", SRC, 0),
        ("one row undispositioned", set_disp(SRC, 14, "**[ ]**"), 1),
        ("first row undispositioned", set_disp(SRC, 1, " "), 1),
        ("ambiguous: both Build and Waive", set_disp(SRC, 20, "**Build** **Waive**"), 1),
        ("invalid disposition value", set_disp(SRC, 5, "**Maybe**"), 1),
        ("one waive with no reason", set_reason(SRC, waived[0], " "), 1),
        ("waive reason too thin", set_reason(SRC, waived[1], "n/a"), 1),
        ("one decision unanswered", set_answer(SRC, "D-16", " "), 1),
        ("one rationale missing", clear_rationale(SRC, "D-9"), 1),
        ("dangling decision reference", set_ref(SRC, 40, "D-99"), 1),
        ("totals disagree with rows", set_total(SRC, 99, 9), 1),
        ("per-phase counts wrong", set_phase_counts(SRC, 3, 3), 1),
    ]

    print("=" * 78)
    print("PHASE A DISPOSITION GATE SELF-TEST")
    print("=" * 78)
    print(f"baseline register: {len(waived)} waives, 68 builds, 16 decisions")
    print("each case mutates a throwaway copy; the real register is read-only")
    print()

    failures = 0
    for label, text, expect in cases:
        r = run_gate(text)
        m = re.search(r"PHASE A DISPOSITION GATE: ([A-Z ]+)", r.stdout)
        verdict = m.group(1).strip() if m else "NO OUTPUT"
        ok = r.returncode == expect
        failures += 0 if ok else 1
        print(f"  {label:<32} rc={r.returncode} expect={expect}  "
              f"{'OK' if ok else 'BAD':<5} {verdict}")
        if not ok:
            print("  " + "-" * 72)
            for l in r.stdout.split("\n")[-20:]:
                print("  " + l)
            if r.stderr.strip():
                print("  stderr: " + r.stderr[-400:])

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
