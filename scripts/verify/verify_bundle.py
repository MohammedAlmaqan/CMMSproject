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
# A document that is genuinely bundle-only is declared in BUNDLE_ONLY with the
# reason, and compared automatically once a tag contains it. Coverage runs the
# other way too: every markdown document in the bundle must be declared, and
# every DOCUMENTS path must exist in the tag, so an omission fails instead of
# passing silently.
#
# Usage: python scripts/verify/verify_bundle.py --tag v1.6.5
#        python scripts/verify/verify_bundle.py --tag v1.6.5 --sync
#        python scripts/verify/verify_bundle.py --tag v1.6.5 --bundle <path>
#        python scripts/verify/verify_bundle.py --tag v1.6.5 --secrets
# Exit:  0 PASS  1 FAIL (drift, missing file or a credential file)  2 usage
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

# Shipped by the bundle but not compared by DOCUMENTS. Each entry says why, and
# - where the repository has a copy - it is compared automatically as soon as the
# tag contains it, so "added after the tag" cannot quietly become "never checked".
# (path inside the bundle, path in the repository or None, reason)
BUNDLE_ONLY = [
    (
        "IT_DEPLOYMENT_GUIDE.md",
        "docs/IT_DEPLOYMENT_GUIDE.md",
        "written into the v1.6.6 bundle; added to the repository at f773294, after the tag",
    ),
    (
        "RELEASE_MANIFEST.md",
        None,
        "generated per release; never committed",
    ),
]

# Folders the bundle ships that this gate does not read, each with the verifier
# that does own the subject. Naming them keeps the coverage claim honest.
BUNDLE_ONLY_DIRS = [
    ("migration-templates", "scripts/verify/verify_migration_templates.py"),
]

# Screenshots are shipped from docs/images/ and are not covered by the list above.
IMAGE_DIR = "docs/images"

# Files whose very presence in a bundle hands the Client a credential. The sample
# is the one exception: it is shipped on purpose and the installer reads it as a
# template. `backend/.env.deploy` reached the v1.6.4 bundle this way; the filename
# rule in .gitignore is the other half of the same guard.
ENV_ALLOWED = {".env.example"}


def secret_paths(bundle_root):
    """Every `*.env*` file in the bundle that is not the sample."""
    found = []
    for dirpath, dirnames, filenames in os.walk(bundle_root):
        dirnames[:] = [name for name in dirnames if name != "node_modules"]
        for name in filenames:
            if not name.startswith(".env") or name in ENV_ALLOWED:
                continue
            relative = os.path.relpath(os.path.join(dirpath, name), bundle_root)
            found.append(relative.replace(os.sep, "/"))
    return sorted(found)


def git(*args):
    proc = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace").strip() + "\n")
        sys.exit(2)
    return proc.stdout


def git_optional(*args):
    """stdout on success, None when git exits non-zero. For existence questions."""
    proc = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    return proc.stdout if proc.returncode == 0 else None


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


def bundle_markdown(bundle_root):
    """Every markdown document the bundle ships at its root or under docs/."""
    found = []
    for name in os.listdir(bundle_root):
        if name.lower().endswith(".md") and os.path.isfile(os.path.join(bundle_root, name)):
            found.append(name)
    docs = os.path.join(bundle_root, "docs")
    if os.path.isdir(docs):
        for dirpath, _, filenames in os.walk(docs):
            for name in filenames:
                if not name.lower().endswith(".md"):
                    continue
                full = os.path.join(dirpath, name)
                found.append(os.path.relpath(full, bundle_root).replace(os.sep, "/"))
    return sorted(found)


def check(tag, commit, bundle_root, sync, secrets):
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

    # Reverse assertion: a DOCUMENTS row that names a path the tag does not have
    # means the list and the tag have diverged. That is a failure, not silence.
    for _, repo_rel, _ in DOCUMENTS:
        if git_optional("cat-file", "-e", f"{tag}:{repo_rel}") is None:
            print(f"  FAIL    {repo_rel:<40} declared in DOCUMENTS but absent from tag {tag}")
            missing += 1
            failures.append(repo_rel)

    # Documents the bundle ships that DOCUMENTS does not compare. A repository
    # copy is compared as soon as the tag has it; otherwise the report says the
    # document is not in this tag, which is a different claim from "not in the
    # repository".
    print()
    print("  bundle-only documents:")
    for bundle_rel, repo_rel, reason in BUNDLE_ONLY:
        bundle_path = os.path.join(bundle_root, *bundle_rel.split("/"))
        if not os.path.exists(bundle_path):
            print(f"  MISSING {bundle_rel:<40} not in the bundle ({reason})")
            missing += 1
            failures.append(bundle_rel)
            continue
        if repo_rel is None:
            print(f"  NOT CHECKED {bundle_rel:<34} {reason}")
            continue
        if git_optional("cat-file", "-e", f"{tag}:{repo_rel}") is None:
            print(f"  NOT IN TAG  {bundle_rel:<34} absent from {tag}: {reason}")
            continue
        want = git("show", f"{tag}:{repo_rel}")
        with open(bundle_path, "rb") as handle:
            have = handle.read()
        if normalise(have) == normalise(want):
            print(f"  OK      {bundle_rel:<40} compared because {tag} has it")
            ok += 1
        else:
            print(f"  DRIFT   {bundle_rel:<40} {len(have):,} B vs {len(want):,} B (from {tag})")
            drift += 1
            failures.append(bundle_rel)

    # Coverage: every markdown document the bundle ships must be declared, so a
    # new document cannot travel unchecked. An unlisted file is a failure.
    print()
    declared = {bundle for bundle, _, _ in DOCUMENTS} | {bundle for bundle, _, _ in BUNDLE_ONLY}
    unlisted = [rel for rel in bundle_markdown(bundle_root) if rel not in declared]
    if unlisted:
        for rel in unlisted:
            print(f"  FAIL    {rel:<40} shipped but not declared in DOCUMENTS or BUNDLE_ONLY")
        missing += len(unlisted)
        failures.extend(unlisted)
    else:
        print("  coverage: every markdown document in the bundle is declared")
    for directory, verifier in BUNDLE_ONLY_DIRS:
        if os.path.isdir(os.path.join(bundle_root, directory)):
            print(f"  out of scope: {directory}/ is checked by {verifier}")

    print()
    print(f"  {len(entries)} compared entries: {ok} OK, {drift} drift, {missing} missing")

    leaked = []
    if secrets:
        leaked = secret_paths(bundle_root)
        print()
        if leaked:
            for path in leaked:
                print(f"  CRED    {path:<40} environment file must not ship")
            failures.extend(leaked)
        else:
            print(f"  CRED    none: no environment file except {', '.join(sorted(ENV_ALLOWED))}")

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
    parser.add_argument(
        "--secrets",
        action="store_true",
        help="also fail if the bundle ships an environment file other than .env.example",
    )
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

    result = check(args.tag, commit, bundle_root, args.sync, args.secrets)

    print()
    if result == 0:
        print(f"BUNDLE_DOCS PASS - every shipped document matches {args.tag}")
    elif args.sync:
        print("BUNDLE_DOCS FAIL - review the entries above; --sync does not overwrite a binary")
    else:
        print("BUNDLE_DOCS FAIL - rerun with --sync to take the tag's version, then review the diff")
    sys.exit(result)


if __name__ == "__main__":
    main()
