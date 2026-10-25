#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# BUNDLE VERIFY — handover-bundle documentation freshness gate (F6)
#
# The v1.6.4 handover bundle carried documentation from three different tags:
# INSTALLATION_GUIDE.md and RELEASE_NOTES.md were v1.6.3, ADMIN_GUIDE.md and
# USER_MANUAL.md were v1.6.4, and GO_LIVE_CHECKLIST.md matched neither. The
# bundle was assembled by copying files out of a working tree, so whatever a
# developer happened to have open travelled with it, and nothing failed.
#
# This gate compares every document the bundle ships against the tree of the tag
# it claims to describe, read with `git show <tag>:<path>` rather than from the
# working copy. Two differences are normalised away because they are artefacts
# of the platform, not content: a UTF-8 BOM, and CRLF (or a lone CR) against LF.
# Anything else is drift. Binary files are compared byte for byte.
#
# `--sync` copies the tag's version into the bundle before verifying, so the fix
# for a drift is a command rather than a manual copy. The copy list and the check
# list are the same list, which is the point: a gate with its own private idea of
# what should be there is how the drift happened.
#
# Usage: python scripts/verify/verify_bundle.py --tag v1.6.5
#        python scripts/verify/verify_bundle.py --tag v1.6.5 --sync
#        python scripts/verify/verify_bundle.py --tag v1.6.5 --bundle <path>
# Exit:  0 PASS  1 FAIL (drift or missing file)  2 usage
# ═══════════════════════════════════════════════════════════════════════
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WIDTH = 74

# (path inside the bundle, path in the repository, kind). Every document here is
# one the Client receives, so every one of them is checked.
DOCUMENTS = [
    ("docs/ADMIN_GUIDE.md", "docs/ADMIN_GUIDE.md", "text"),
    ("docs/API_REFERENCE.md", "docs/API_REFERENCE.md", "text"),
    ("docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md", "text"),
    ("docs/DATA_DICTIONARY.md", "docs/DATA_DICTIONARY.md", "text"),
    ("docs/ER_DIAGRAM.md", "docs/ER_DIAGRAM.md", "text"),
    ("docs/GO_LIVE_CHECKLIST.md", "docs/GO_LIVE_CHECKLIST.md", "text"),
    ("docs/INSTALLATION_GUIDE.md", "docs/INSTALLATION_GUIDE.md", "text"),
    ("docs/USER_MANUAL.md", "docs/USER_MANUAL.md", "text"),
    ("docs/migration-runbook.md", "docs/migration-runbook.md", "text"),
    ("docs/openapi.json", "docs/openapi.json", "text"),
    ("RELEASE_NOTES.md", "RELEASE_NOTES.md", "text"),
]

# Shipped by the bundle but written by hand into it: there is no repository copy
# to compare against. Named so the report does not imply full coverage.
NOT_IN_REPOSITORY = ["IT_DEPLOYMENT_GUIDE.md", "RELEASE_MANIFEST.md"]

# Screenshots are shipped from docs/images/ and are not covered by the list above.
IMAGE_DIR = "docs/images"


def git(*args):
    proc = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace").strip() + "\n")
        sys.exit(2)
    return proc.stdout


def normalise(data):
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def first_difference(bundle, repo):
    """Line number of the first differing line, or None when the two are equal."""
    a = bundle.split(b"\n")
    b = repo.split(b"\n")
    for index, (left, right) in enumerate(zip(a, b), start=1):
        if left != right:
            return index, left, right
    if len(a) != len(b):
        index = min(len(a), len(b))
        left = a[index] if index < len(a) else b""
        right = b[index] if index < len(b) else b""
        return index + 1, left, right
    return None


def preview(line):
    text = line.decode("utf-8", "replace").strip()
    return text[:100] + ("..." if len(text) > 100 else "")


def image_paths(tag):
    listing = git("ls-tree", "-r", "--name-only", tag, "--", IMAGE_DIR).decode("utf-8").split()
    return [(path, path, "binary") for path in listing]


def check(tag, commit, bundle_root, sync):
    entries = DOCUMENTS + image_paths(tag)
    print(f"  bundle : {bundle_root}")
    print(f"  commit : {commit[:7]}  (tag {tag})")
    print("  rule   : UTF-8 BOM stripped and CRLF -> LF for text; binary byte for byte")
    print()

    ok = drift = missing = 0
    failures = []

    for bundle_rel, repo_rel, kind in entries:
        bundle_path = os.path.join(bundle_root, *bundle_rel.split("/"))
        try:
            want = git("show", f"{tag}:{repo_rel}")
        except SystemExit:
            print(f"  FAIL    {bundle_rel:<40} not in the tag's tree")
            missing += 1
            failures.append(bundle_rel)
            continue

        if not os.path.exists(bundle_path):
            if sync:
                os.makedirs(os.path.dirname(bundle_path), exist_ok=True)
                with open(bundle_path, "wb") as handle:
                    handle.write(want)
                print(f"  SYNCED  {bundle_rel:<40} created from {tag}")
                ok += 1
                continue
            print(f"  MISSING {bundle_rel:<40} not in the bundle")
            missing += 1
            failures.append(bundle_rel)
            continue

        with open(bundle_path, "rb") as handle:
            have = handle.read()

        if kind == "binary":
            same = have == want
        else:
            have_norm = normalise(have)
            want_norm = normalise(want)
            same = have_norm == want_norm

        if same:
            print(f"  OK      {bundle_rel:<40} {len(want):,} B")
            ok += 1
            continue

        if sync and kind == "text":
            with open(bundle_path, "wb") as handle:
                handle.write(want)
            print(f"  SYNCED  {bundle_rel:<40} replaced from {tag}")
            ok += 1
            continue

        if sync:
            print(f"  FAIL    {bundle_rel:<40} binary differs and --sync will not overwrite it")
            drift += 1
            failures.append(bundle_rel)
            continue

        drift += 1
        failures.append(bundle_rel)
        detail = ""
        if kind == "text":
            difference = first_difference(normalise(have), normalise(want))
            if difference:
                line, left, right = difference
                detail = (
                    f"\n            first difference at line {line}"
                    f"\n            bundle: {preview(left)}"
                    f"\n            tag   : {preview(right)}"
                )
        print(f"  DRIFT   {bundle_rel:<40} {len(have):,} B vs {len(want):,} B{detail}")

    print()
    print(
        f"  {len(entries)} entries: {ok} OK, {drift} drift, {missing} missing"
    )
    if NOT_IN_REPOSITORY:
        print(f"  not checked (written into the bundle, not in the repository): {', '.join(NOT_IN_REPOSITORY)}")
    return 0 if not failures else 1


def main():
    parser = argparse.ArgumentParser(description="Compare a handover bundle's documents against a tag.")
    parser.add_argument("--tag", required=True, help="tag the bundle claims to describe, e.g. v1.6.5")
    parser.add_argument(
        "--bundle",
        default=None,
        help="bundle directory (default: <repo parent>/CommandPulse-CMMS-<tag>)",
    )
    parser.add_argument("--sync", action="store_true", help="copy the tag's version into the bundle first")
    args = parser.parse_args()

    commit = git("rev-parse", "--verify", f"{args.tag}^{{commit}}").decode("utf-8").strip()
    bundle_root = args.bundle or os.path.join(
        os.path.dirname(ROOT), f"CommandPulse-CMMS-{args.tag}"
    )

    print("=" * WIDTH)
    print(f"BUNDLE VERIFY - {args.tag} documentation " + ("sync and gate" if args.sync else "freshness gate"))
    print("=" * WIDTH)

    if not os.path.isdir(bundle_root):
        print(f"  FAIL  bundle directory not found: {bundle_root}")
        print()
        print("BUNDLE_DOCS FAIL")
        sys.exit(1)

    result = check(args.tag, commit, bundle_root, args.sync)

    print()
    if result == 0:
        print(f"BUNDLE_DOCS PASS - every shipped document matches {args.tag}")
    else:
        print("BUNDLE_DOCS FAIL - rerun with --sync to take the tag's version, then review the diff")
    sys.exit(result)


if __name__ == "__main__":
    main()
