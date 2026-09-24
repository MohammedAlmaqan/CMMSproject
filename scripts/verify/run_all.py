#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 5.4 REGRESSION FLEET WRAPPER — runs the committed verify scripts in
# sequence with a delay so the auth rate limiter (20 / 15 min per IP)
# is not saturated, and reports an aggregate table.
# A 429 (or any exit 1 presenting 429 in output) triggers a single retry
# after a cooldown. Exit: 0 all pass  1 any fail (after retries).
# Usage: python scripts/verify/run_all.py [--delay 60] [--scripts ...]
# ═══════════════════════════════════════════════════════════════════════
import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

DEFAULT_SCRIPTS = [
    "verify_g3_4.py",
    "verify_g3_5.py",
    "verify_g3_5a.py",
    "verify_g4a.py",
    "verify_g4b1.py",
    "verify_g4b2.py",
    "verify_g5.py",
    "verify_g6a.py",
    "verify_g6b.py",
    "verify_p4.py",
    "verify_g5_3.py",
]


def run_one(script, delay):
    out_lines = []
    status = "?"
    notes = []
    for attempt in (1, 2):
        if attempt == 2:
            notes.append("429 retried after cooldown")
            time.sleep(120)
        proc = subprocess.run(
            [sys.executable, str(HERE / script)],
            capture_output=True,
            text=True,
            timeout=600,
        )
        tail = (proc.stdout or "").strip().splitlines()[-10:]
        out_lines.extend(tail)
        code = proc.returncode
        if code == 0:
            status = "PASS 0"
            break
        if "429" in (proc.stdout or ""):
            notes.append("saw 429")
            continue
        status = f"FAIL {code}"
        break
    for line in out_lines:
        print(f"    {line}")
    return status, "; ".join(notes) or "-"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delay", type=float, default=60.0)
    ap.add_argument("--scripts", nargs="*", default=DEFAULT_SCRIPTS)
    args = ap.parse_args()

    results = []
    for i, script in enumerate(args.scripts):
        print(f"===== [{i + 1}/{len(args.scripts)}] {script} =====")
        status, notes = run_one(script, args.delay)
        results.append((script, status, notes))
        if i < len(args.scripts) - 1:
            time.sleep(args.delay)

    print("\n===== 5.4 REGRESSION TABLE =====")
    print("script | exit code | notes")
    all_ok = True
    for script, status, notes in results:
        print(f"{script} | {status} | {notes}")
        all_ok = all_ok and status.startswith("PASS")

    print("FLEET_EXIT", "PASS" if all_ok else "FAIL")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()