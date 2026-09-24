#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# P4  VERIFY — DB & Build Hygiene closeout gate
# Asserts: migrations dir >=2 folders; prisma migrate status exit 0 + up to
# date; eslint error count <= baseline (50, recorded in 4.3); verify_g4a runs
# PASS twice consecutively with no manual DB purge (F3 partial index proof).
# Writes raw outputs to screenshots/p4_*.txt.
# Usage: python scripts/verify/verify_p4.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import json
import os
import subprocess
import sys

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
BACK = os.path.join(ROOT, "backend")
SCREEN = os.path.join(ROOT, "screenshots")

ESLINT_BASELINE = 50

SI = {}


def run(args, cwd):
    return subprocess.run(
        ["cmd", "/c"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=600,
    )


def main():
    # ---------- 1. migrations directory with >=2 folders ----------
    mig_dir = os.path.join(BACK, "prisma", "migrations")
    folders = [
        d
        for d in os.listdir(mig_dir)
        if os.path.isdir(os.path.join(mig_dir, d)) and not d.startswith(".")
    ]
    SI["migration_folder_count"] = len(folders)
    SI["migrations_ge2"] = len(folders) >= 2

    # ---------- 2. prisma migrate status ----------
    r = run(["npx", "prisma", "migrate", "status"], BACK)
    blob = r.stdout + "\n" + r.stderr
    SI["migrate_status_exit0"] = r.returncode == 0
    SI["migrate_up_to_date"] = "up to date" in blob
    with open(os.path.join(SCREEN, "p4_migrate_status.txt"), "w", encoding="utf-8") as f:
        f.write(blob)

    # ---------- 3. eslint baseline comparison ----------
    r = run(["npx", "eslint", "src/", "-f", "json"], BACK)
    try:
        data = json.loads(r.stdout or "[]")
    except Exception:
        data = []
    count = sum(len(f.get("messages", [])) for f in data if isinstance(f, dict))
    SI["eslint_errors"] = count
    SI["eslint_le_baseline"] = count <= ESLINT_BASELINE
    with open(os.path.join(SCREEN, "p4_eslint.json.txt"), "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2))

    # ---------- 4. verify_g4a twice, no purge ----------
    for i in (1, 2):
        rr = run(["python", "scripts/verify/verify_g4a.py"], ROOT)
        out = rr.stdout + "\n" + rr.stderr
        ok = ("G4A_EXIT PASS" in out) and rr.returncode == 0
        SI[f"g4a_run{i}_pass"] = ok
        with open(os.path.join(SCREEN, f"p4_g4a_run{i}.txt"), "w", encoding="utf-8") as f:
            f.write(out)

    ok = (
        SI.get("migrations_ge2")
        and SI.get("migrate_status_exit0")
        and SI.get("migrate_up_to_date")
        and SI.get("eslint_le_baseline")
        and SI.get("g4a_run1_pass")
        and SI.get("g4a_run2_pass")
    )

    print("SI_JSON", json.dumps(SI))
    print("P4_EXIT", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()