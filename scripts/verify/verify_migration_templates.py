#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# MIGRATION-TEMPLATE GATE — docs/migration-templates/ vs schema.prisma
# Re-derives the template headers from the schema, never from this text:
#   1. Model accounting: every schema model is importable (has a fill-in
#      template) or one of the eight excluded runtime tables, and no other
#      model exists.
#   2. Fill-in files: one header-only *.csv per importable model; the header
#      is exactly the schema's scalar columns in order, and every required
#      (non-null, no default, not blank-on-import) column is present as a
#      header. No example rows ship in the fill-in files.
#   3. Example rows: one header + example per importable model under
#      examples/, and every required non-blank column carries a value so the
#      fabricated miniature plant stays coherent.
# EXCLUDED and IMPORT_ORDER are the delivery decisions the README records in
# prose; everything else is schema-derived.
# Usage: python scripts/verify/verify_migration_templates.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import csv
import io
import os
import re
import sys

REPO_ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SCHEMA = os.path.join(REPO_ROOT, "backend", "prisma", "schema.prisma")
OUT = os.path.join(REPO_ROOT, "docs", "migration-templates")
SCREEN = os.path.join(REPO_ROOT, "screenshots")

EXCLUDED = {
    "AuditLogEntry",
    "MaintenancePlanMeter",
    "RefreshToken",
    "SchedulerRun",
    "SequenceCounter",
    "SystemAlert",
    "SystemConfig",
    "WorkOrderSnapshot",
}

IMPORT_ORDER = [
    "WorkCenter", "Craft", "User", "FunctionalLocation", "Equipment",
    "EquipmentMeter", "Material", "EquipmentBOMMaterial", "MeterReading",
    "SafetyChecklistTemplate", "ChecklistItem", "FailureCode", "CauseCode",
    "TaskList", "TaskListOperation", "TaskListMaterial", "Notification",
    "MaintenancePlan", "MaintenancePlanTarget", "WorkOrder",
    "WorkOrderNotifLink", "WorkOrderOperation", "WorkOrderMaterial",
    "LaborEntry", "ExternalServiceCost", "CostSplit", "WorkOrderChecklist",
    "WorkOrderChecklistItem", "Comment", "Attachment",
]

SCALAR_TYPES = {"String", "Int", "Float", "Boolean", "DateTime", "Decimal", "Json"}

# Columns the importer must never read from a file: the audit stamp and the
# per-table runtime state the importer re-creates. Same set the README records.
ALWAYS_BLANK = {"createdBy", "createdDate", "modifiedBy", "modifiedDate", "isDeleted"}
PER_TABLE_BLANK = {
    "User": {"passwordHash", "failedLoginCount", "lockedUntil", "lastLogin"},
    "WorkOrder": set(),
}


def parse_model(lines, i):
    name = re.match(r"model\s+(\w+)\s*\{", lines[i]).group(1)
    fields = []
    j = i + 1
    while j < len(lines):
        line = lines[j]
        if line.rstrip().endswith("}"):
            break
        if line.startswith("model ") or line.startswith("enum "):
            break
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("@"):
            j += 1
            continue
        m = re.match(r"^(\w+)\s+(\w+)(\?)?\s*(.*)$", stripped)
        if not m:
            j += 1
            continue
        name_f, typ, qmark, tail = m.groups()
        if typ not in SCALAR_TYPES:
            j += 1
            continue  # relation field (Vendor Model @relation...)
        fields.append({
            "name": name_f,
            "nullable": bool(qmark),
            "has_default": "@default(" in stripped,
        })
        j += 1
    return name, fields


def load_schema():
    raw = io.open(SCHEMA, encoding="utf-8").read()
    lines = raw.split("\n")
    models = {}
    i = 0
    while i < len(lines):
        if lines[i].startswith("model "):
            name, fields = parse_model(lines, i)
            models[name] = fields
        i += 1
    return models


def blank_set(model):
    b = set(ALWAYS_BLANK)
    b.update(PER_TABLE_BLANK.get(model, set()))
    return b


def required_columns(fields, blank):
    return [
        f["name"] for f in fields
        if not f["nullable"] and not f["has_default"] and f["name"] not in blank
    ]


def read_rows(path):
    with io.open(path, encoding="utf-8", newline="") as fh:
        return list(csv.reader(fh))


def main():
    problems = []
    models = load_schema()

    excluded = [m for m in models if m in EXCLUDED]
    for m in sorted(EXCLUDED - set(models)):
        problems.append("excluded model %s not present in schema" % m)
    missing = [m for m in IMPORT_ORDER if m not in models]
    if missing:
        problems.append("IMPORT_ORDER names unknown models: %s" % missing)
    extra = [m for m in models if m not in EXCLUDED and m not in IMPORT_ORDER]
    if extra:
        problems.append("schema models neither excluded nor importable: %s" % extra)
    if len(IMPORT_ORDER) + len(EXCLUDED) != len(models):
        problems.append("accounting drift: %d importable + %d excluded != %d models" % (
            len(IMPORT_ORDER), len(EXCLUDED), len(models)))

    for model in IMPORT_ORDER:
        fields = models[model]
        schema_names = [f["name"] for f in fields]
        required = required_columns(fields, blank_set(model))

        path = os.path.join(OUT, model + ".csv")
        if not os.path.exists(path):
            problems.append("%s fill-in template missing" % model)
            continue
        rows = read_rows(path)
        if rows[0] != schema_names:
            problems.append("%s header mismatch: %s" % (model, rows[0]))
        missing_headers = [c for c in required if c not in rows[0]]
        if missing_headers:
            problems.append("%s header missing required columns: %s" % (model, missing_headers))
        if len(rows) != 1:
            problems.append("%s has %d rows; the fill-in template must be header-only" % (
                model, len(rows)))

        ex_path = os.path.join(OUT, "examples", model + ".csv")
        if not os.path.exists(ex_path):
            problems.append("%s example file missing under examples/" % model)
            continue
        ex_rows = read_rows(ex_path)
        if ex_rows[0] != schema_names:
            problems.append("examples/%s header mismatch: %s" % (model, ex_rows[0]))
        if len(ex_rows) != 2:
            problems.append("examples/%s must carry exactly one example row (has %d)" % (
                model, len(ex_rows)))
            continue
        ex = ex_rows[1]
        for f, val in zip(fields, ex):
            if f["name"] in blank_set(model):
                continue
            if not f["nullable"] and not f["has_default"] and not val.strip():
                problems.append("examples/%s.%s required but example blank" % (model, f["name"]))
        if len(ex) != len(schema_names):
            problems.append("examples/%s row length %d != header %d" % (
                model, len(ex), len(schema_names)))

    if problems:
        print("MIGRATION-TEMPLATE GATE: FAIL")
        for p in problems:
            print("  " + p)
        sys.exit(1)

    os.makedirs(SCREEN, exist_ok=True)
    with io.open(os.path.join(SCREEN, "migration_templates.txt"), "w",
                 encoding="utf-8", newline="\n") as fh:
        fh.write("MIGRATION-TEMPLATE GATE: PASS\n")
        fh.write("templates header-only: %d\n" % len(IMPORT_ORDER))
        fh.write("excluded runtime tables: %d\n" % len(excluded))
        fh.write("accounting: %d importable + %d excluded = %d models\n" % (
            len(IMPORT_ORDER), len(excluded), len(models)))
    print("=" * 68)
    print("MIGRATION-TEMPLATE GATE - docs/migration-templates/")
    print("=" * 68)
    print("importable templates (header-only): %d" % len(IMPORT_ORDER))
    print("excluded runtime tables           : %d" % len(excluded))
    print("schema models                     : %d" % len(models))
    print("every required column present as a header : OK")
    print("examples/ carries one row per template    : OK")
    print("[written] screenshots\\migration_templates.txt")
    print("=" * 68)
    print("MIGRATION-TEMPLATE GATE: PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()