#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# B1  VERIFY — Phase B static gate
#
# Phase B closes six SOW 3.2 / 3.3 rows. The route behaviour itself needs a
# live PostgreSQL target, which the vendor does not hold, so this gate checks
# what CAN be checked without one:
#
#   1. the four code changes are present in the source
#   2. the lifecycle map and the attribution policy are pure modules, so they
#      are unit testable with no database, no jwt and no secret
#   3. neither pure module reaches for prisma, jwt, config or process.env
#   4. no .catch(() => ...) anywhere in src
#   5. no credential literal in any changed file
#
# Reads source files and the compliance matrix. Touches no database, no API,
# no .env, no credential.
#
# Usage: python scripts/verify/verify_b1.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import os
import re
import sys
import json
import tempfile
import subprocess

ROOT = r"C:\Users\Injaz\Documents\Default Project\CMMSproject"
BE = os.path.join(ROOT, "backend")
MATRIX = os.path.join(ROOT, "docs", "SOW_COMPLIANCE.md")
SCREEN = os.path.join(ROOT, "screenshots")

OUT = []
FAIL = []


def emit(line=""):
    OUT.append(line)
    print(line)


def check(label, ok, detail=""):
    if not ok:
        FAIL.append(label)
    mark = "OK" if ok else "FAIL"
    emit(f"  {label:<52} {mark}")
    if detail and not ok:
        emit(f"      {detail}")
    return ok


def read(rel):
    with open(os.path.join(BE, rel), "r", encoding="utf-8") as fh:
        return fh.read()


def main():
    emit("=" * 74)
    emit("B1 VERIFY - Phase B static gate (no database required)")
    emit("=" * 74)
    emit()

    trans = read(os.path.join("src", "utils", "transitions.ts"))
    attrib = read(os.path.join("src", "utils", "attribution.ts"))
    roles = read(os.path.join("src", "utils", "roles.ts"))
    notif = read(os.path.join("src", "routes", "notifications.ts"))
    wos = read(os.path.join("src", "routes", "workOrders.ts"))
    labor = read(os.path.join("src", "routes", "labor.ts"))

    # Handler-scoped slices. A whole-file substring check cannot tell the POST
    # handler from the PUT handler, so deleting the guard from one of them while
    # leaving the other intact would still pass. Slice on the route boundaries.
    def slice_between(src, start, end):
        i = src.find(start)
        j = src.find(end, i + 1) if i >= 0 else -1
        return src[i:j] if i >= 0 and j > i else ""

    labor_post = slice_between(labor, "router.post('/'", "router.put('/:id'")
    labor_put = slice_between(labor, "router.put('/:id'", "router.delete('/:id'")
    check("labour.ts POST handler located for scoped checks", bool(labor_post))
    check("labour.ts PUT handler located for scoped checks", bool(labor_put))

    # -- 1. the four behavioural changes ---------------------------------
    emit("-" * 74)
    emit("1. Phase B behaviour present in source")
    emit("-" * 74)
    # row 16 + row 22
    check("row 16  notification PUT rejects illegal transitions",
          "canTransition(existing.status, status)" in notif)
    check("row 16  illegal transition returns 400 with allowed targets",
          "allowedTransitions" in notif and "transitionTargets" in notif)
    check("row 16  rejected transition is audited as Blocked",
          re.search(r"action:\s*'Blocked'", notif) is not None)
    check("row 16  convert path also validates the lifecycle",
          "canTransition(notification.status, 'Converted')" in notif)
    # row 15
    check("row 15  work order completion autogenerates an M3 notification",
          re.search(r"type:\s*'M3'", wos) is not None)
    check("row 15  M3 is created inside the status-change transaction",
          "prisma.$transaction(async (tx)" in wos and "tx.notification.create" in wos)
    # row 22
    check("row 22  linked notifications move to Completed on completion",
          re.search(r"canTransition\(notif\.status, 'Completed'\)", wos) is not None)
    check("row 22  completion side effects are atomic with the status change",
          wos.index("prisma.$transaction") < wos.index("tx.notification.create"))
    # row 33
    check("row 33  labour POST uses the shared attribution policy",
          "resolveAttributedUser" in labor_post)
    check("row 33  labour POST rejects an override with 403, not a coercion",
          "attributed.rejected" in labor_post and "status(403)" in labor_post)
    check("row 33  labour PUT rejects an override with 403 too",
          "attributed?.rejected" in labor_put and "status(403)" in labor_put)
    check("row 33  an applied override is audited with old and new values",
          "outcome === 'override'" in labor and "oldValue" in labor)
    check("row 33  a blocked override is audited",
          re.search(r"action:\s*'Blocked'", labor) is not None)
    # row 17
    check("row 17  notification create still requires Requester or above",
          "router.post('/', authorizeMinRole('Requester')" in notif)

    # -- 2. purity, so the policy is testable without a database ----------
    emit()
    emit("-" * 74)
    emit("2. Policy modules are pure (unit testable with no DB, no secret)")
    emit("-" * 74)
    for name, src in (("utils/transitions.ts", trans),
                      ("utils/attribution.ts", attrib),
                      ("utils/roles.ts", roles)):
        # Inspect import statements only. Matching raw text would trip over the
        # module's own comment saying it has no prisma import.
        imports = "\n".join(
            ln for ln in src.split("\n")
            if re.match(r"\s*(import\b|const .*=\s*require\(|.*\brequire\()", ln)
        )
        bad = [t for t in ("prisma", "jsonwebtoken", "config.js", "process.env")
               if t in imports]
        check(f"{name} imports no prisma/jwt/config/env", not bad,
              "found: " + ", ".join(bad))
    check("utils/attribution.ts imports only the role hierarchy",
          re.search(r"^import \{[^}]*\} from '\./roles\.js';",
                    attrib, re.M) is not None)

    # -- 3. the unit suites exist and are wired up ------------------------
    emit()
    emit("-" * 74)
    emit("3. Unit suites present and runnable without the integration setup")
    emit("-" * 74)
    unit_dir = os.path.join(BE, "tests", "unit")
    suites = sorted(f for f in os.listdir(unit_dir) if f.endswith(".test.ts")) \
        if os.path.isdir(unit_dir) else []
    check("tests/unit has suites", len(suites) >= 2, str(suites))
    for s in suites:
        emit(f"      {s}")
    cfg = os.path.join(BE, "vitest.unit.config.ts")
    check("vitest.unit.config.ts exists", os.path.isfile(cfg))
    if os.path.isfile(cfg):
        c = read("vitest.unit.config.ts")
        # Match the config key, not the comment that explains why it is absent.
        check("unit config declares no setupFiles key (no .env, no live DB)",
              re.search(r"^\s*setupFiles\s*:", c, re.M) is None)
        check("unit config includes only tests/unit", "tests/unit" in c)
    import json
    with open(os.path.join(BE, "package.json"), "r", encoding="utf-8") as fh:
        pkg = json.load(fh)
    check("package.json has a test:unit script",
          "test:unit" in pkg.get("scripts", {}))

    # -- 3b. run the unit suite, so a skipped test cannot hide ------------
    emit()
    emit("-" * 74)
    emit("3b. Unit suite actually executes and passes (no DB, no secret)")
    emit("-" * 74)
    vitest = os.path.join(BE, "node_modules", ".bin", "vitest.cmd")
    if not os.path.isfile(vitest):
        check("vitest binary present", False, vitest)
    else:
        # Use the JSON reporter and parse the report, rather than scraping
        # human-readable output. Colour codes and wording change between
        # vitest versions; the report fields do not.
        report = os.path.join(
            tempfile.gettempdir(), "phaseB_unit_report.json")
        if os.path.exists(report):
            os.remove(report)
        try:
            proc = subprocess.run(
                [vitest, "run", "--config", "vitest.unit.config.ts",
                 "--reporter=json", "--outputFile=" + report],
                cwd=BE, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=600)
        except subprocess.TimeoutExpired:
            check("unit suite completes", False, "timed out")
            proc = None
        if proc is not None and not os.path.exists(report):
            check("unit suite produced a report", False,
                  (proc.stdout or proc.stderr or '')[-400:])
        if proc is not None and os.path.exists(report):
            import json as _json
            with open(report, "r", encoding="utf-8") as fh:
                rep = _json.load(fh)
            n_total = rep.get("numTotalTests", 0)
            n_passed = rep.get("numPassedTests", 0)
            n_failed = rep.get("numFailedTests", 0)
            n_pending = rep.get("numPendingTests", 0)
            emit(f"  total cases                 : {n_total}")
            emit(f"  passed                     : {n_passed}")
            emit(f"  failed                     : {n_failed}")
            emit(f"  pending/skipped            : {n_pending}")
            check("unit suite exits 0", proc.returncode == 0)
            check("unit report marked successful", rep.get("success") is True)
            check("unit suite has no failures", n_failed == 0,
                  f"{n_failed} failed")
            check("unit suite has no skipped cases", n_pending == 0,
                  f"{n_pending} skipped")
            check("every case in the report was actually counted",
                  n_total == n_passed + n_failed + n_pending,
                  f"total={n_total} passed={n_passed} "
                  f"failed={n_failed} pending={n_pending}")
            check("unit suite is non-trivial", n_total >= 20,
                  f"only {n_total} cases")
            try:
                os.remove(report)
            except OSError:
                pass

    # -- 4. no swallowed errors ------------------------------------------
    emit()
    emit("-" * 74)
    emit("4. No swallowed errors")
    emit("-" * 74)
    offenders = []
    for dirpath, _dirs, files in os.walk(os.path.join(BE, "src")):
        for f in files:
            if not f.endswith(".ts"):
                continue
            p = os.path.join(dirpath, f)
            with open(p, "r", encoding="utf-8") as fh:
                for n, line in enumerate(fh, 1):
                    if ".catch(" in line and re.search(
                            r"\.catch\(\s*(\(\s*\)|function)", line):
                        offenders.append(
                            f"{os.path.relpath(p, BE)}:{n}")
    check("no .catch(() => ...) in backend/src", not offenders,
          ", ".join(offenders))

    # -- 5. no credential literals ---------------------------------------
    emit()
    emit("-" * 74)
    emit("5. No credential literal in any file this phase touched")
    emit("-" * 74)
    touched = [trans, attrib, roles, notif, wos, labor]
    leak = re.compile(
        r"(PGPASSWORD\s*=\s*['\"]|JWT_SECRET\s*=\s*['\"][^'\"]+['\"]"
        r"|password\s*[:=]\s*['\"][^'\"]+['\"])", re.I)
    hits = [i for i, s in enumerate(touched) if leak.search(s)]
    check("no inline credential in changed backend files", not hits,
          f"files {hits}")

    # -- 6. the matrix still reconciles ----------------------------------
    emit()
    emit("-" * 74)
    emit("6. Matrix reconciliation unchanged by Phase B code work")
    emit("-" * 74)
    import collections
    rows = []
    with open(MATRIX, "r", encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("|"):
                continue
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(c) == 5 and c[0].startswith("\u00a7"):
                rows.append(c)
    s3 = [r for r in rows if r[0].split(".")[0] in ("\u00a73", "3")]
    cnt = collections.Counter(r[2] for r in s3)
    build = cnt["Partial"] + cnt["Not Met"]
    total = len(s3)
    emit(f"  section 3 rows        : {total}   expected 126   "
         f"{'OK' if total == 126 else 'MISMATCH'}")
    emit(f"  build set             : {build}   expected 67   "
         f"{'OK' if build == 67 else 'MISMATCH'}")
    emit(f"  waived                : {cnt['Waived']}   expected 10   "
         f"{'OK' if cnt['Waived'] == 10 else 'MISMATCH'}")
    check("section 3 still totals 126", total == 126)
    check("build set still 67 (Phase B code does not move the matrix yet)",
          build == 67)
    check("waived still 10", cnt["Waived"] == 10)
    recon = cnt["Met"] + build + cnt["Waived"] + cnt["Deferred"] + cnt["Excluded"]
    emit(f"  reconciliation        : {cnt['Met']} Met + {build} build + "
         f"{cnt['Waived']} waived + {cnt['Deferred']} Def + {cnt['Excluded']} Exc"
         f" = {recon}")
    check("reconciles to 126", recon == 126)

    # -- verdict ---------------------------------------------------------
    emit()
    emit("=" * 74)
    if FAIL:
        emit(f"B1 VERIFY: FAIL - {len(FAIL)} check(s) failed")
        for f in FAIL:
            emit(f"  FAILED: {f}")
    else:
        emit("B1 VERIFY: PASS - Phase B static gate clean")
    emit()
    emit("NOT VERIFIED BY THIS GATE")
    emit("  The runtime behaviour of rows 14, 15, 16, 22 and 33 needs a live")
    emit("  PostgreSQL target. tests/routes/*.test.ts is a real integration")
    emit("  suite: it loads .env, signs JWTs with the real secret and requires")
    emit("  seeded users. It was NOT run, because no live target is held and")
    emit("  no credential may be read. The pure policy those routes depend on")
    emit("  is covered by tests/unit, which needs none of that.")
    emit("=" * 74)

    os.makedirs(SCREEN, exist_ok=True)
    with open(os.path.join(SCREEN, "b1_phaseb.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\n")
    print(f"\n[written] screenshots/b1_phaseb.txt")

    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
