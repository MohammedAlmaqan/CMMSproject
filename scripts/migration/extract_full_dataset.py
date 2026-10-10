#!/usr/bin/env python3
"""Extract the full legacy CMMS dataset into the trial-run ``*.filled.csv`` set.

This is the B1 "full load" extractor. It reads the raw Client workbooks kept
(untracked) under ``docs/migration-templates/dataset/`` and emits the nine
in-scope CSVs in the exact column contract the trial-run importers expect, plus
a machine-readable exclusion ledger recording every source row that was dropped
or merged and why.

The reviewed 13/9/14-row sample under ``docs/migration-templates/`` is left
untouched: this script writes to a separate output directory (``--out``). Feed
that directory to the harness with ``TRIAL_RUN_CSV_DIR``.

Cleaning policy (owner decision, 2026-10-10): keep the full 2,259-row WO set and
the full master sets, cleaned to a loadable set with every exclusion logged.
  1. Drop WO rows whose type is E3_Non-Maintenance (no value in the CM/PM/PdM/
     EM/CAL schema; FILL_REPORT already marks these out of scope).
  2. Drop WO rows with a blank or '#N/A' functional location, a blank job
     description, or a creator that is not one of the two sample users.
  3. Keep-first on duplicate woNumber and duplicate notificationNumber (partial
     unique indexes on the natural key reject a second row otherwise).
  4. Blank the WO/notification equipment FK when the source Equip# has no
     Equipment master row (0 / 1 / '#N/A' / a malformed key).
  5. Drop Equipment rows with a blank TechIdentNo., a blank functional location,
     a blank name/description, a blank criticality, or a duplicate TechIdentNo.
  6. Aggregate Materials by material code (stock summed; standard cost from the
     A-NEW vetted value/quantity, falling back to every batch when no A-NEW).
  7. Fold the one lowercase 'i_elec' work centre to 'I_ELEC'.

Only the standard library writes CSV; openpyxl reads the .xlsx/.xlsm sources.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import OrderedDict, defaultdict

try:
    import openpyxl
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write("openpyxl is required (pip install openpyxl)\n")
    raise

CRITICALITY = {"H": "A", "M": "B", "L": "C", "S": "S", "A": "A", "B": "B", "C": "C"}
WO_TYPE = {"E1_Corrective Maintenance": "CM", "E2_Preventive Maintenance": "PM"}
NOTIF_TYPE = {"CM": "M1", "PM": "M2"}
WO_STATUS = {"TECO": "Completed", "Released": "Scheduled", "WPART": "Suspended"}
KNOWN_USERS = ("khaled9", "xghilanwe")
WORKCENTER_NAMES = OrderedDict([
    ("I_MECH", "mechanical goup"),
    ("I_ELEC", "electrical group"),
    ("I_INST", "instrumentaiton and controlsystem group"),
    ("I_INSP", "plant inspection group"),
    ("I_CIVIL", "civil group"),
])

# WO&Notf column indexes
W_WO, W_NOTIF, W_WC, W_TYPE, W_ACTIVITY, W_EQUIP, W_FL = 0, 1, 2, 3, 4, 5, 6
W_DESC, W_FLDESC, W_STATUS, W_CREATED, W_BSTART, W_BFINISH, W_CREATOR, W_NOTE = 7, 9, 13, 14, 17, 18, 19, 26
# Equip list column indexes
E_SORT, E_FULLDESC, E_NUMBER, E_DESC, E_CODE, E_FL, E_LOC, E_FLDESC = 0, 1, 2, 3, 4, 5, 6, 7
E_SERIAL, E_MODEL, E_ABC, E_CHBY, E_CHON, E_CRBY, E_CRON, E_MFR, E_CLASS = 14, 16, 17, 27, 28, 41, 42, 76, 106


def user_of(value: str) -> str:
    low = (value or "").strip().lower()
    return low if low in KNOWN_USERS else ""


def d10(value: str) -> str:
    value = (value or "").strip()
    return value[:10] if len(value) >= 10 and value[4] == "-" else ""


def num(value: str) -> float:
    try:
        return float(value or 0)
    except ValueError:
        return 0.0


def num_str(value: float) -> str:
    return str(int(value)) if value == int(value) else f"{value}"


def location_type(code: str) -> str:
    depth = len(code.split("-"))
    if depth <= 3:
        return {1: "Plant", 2: "Area", 3: "Unit"}[depth]
    return "Sub-unit" if depth == 4 else "System"


def write_csv(path: str, header: list[str], rows: list[list[str]]) -> None:
    def q(value: str) -> str:
        return '"' + value.replace('"', '""') + '"' if any(c in value for c in '",\n\r') else value

    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(",".join(q(h) for h in header) + "\n")
        for row in rows:
            if len(row) != len(header):
                raise SystemExit(f"{path}: row has {len(row)} fields, header has {len(header)}")
            fh.write(",".join(q("" if c is None else str(c)) for c in row) + "\n")


def load_rows(ws):
    header = None
    for raw in ws.iter_rows(min_row=1, values_only=True):
        vals = ["" if c is None else str(c).strip() for c in raw]
        if header is None:
            if any(vals):
                header = vals
            continue
        if all(v == "" for v in vals):
            continue
        yield vals


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    default_dataset = os.path.normpath(os.path.join(here, "..", "..", "docs", "migration-templates", "dataset"))
    ap = argparse.ArgumentParser(description="Full-dataset extractor for the trial-run CSVs.")
    ap.add_argument("--dataset", default=default_dataset)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pm", default="PM Tracker_V2_Updated.xlsm")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    ledger: dict[str, object] = OrderedDict()

    wo_rows: list[list[str]] = []
    eq_rows: list[list[str]] = []
    mat_rows: list[list[str]] = []
    wb = openpyxl.load_workbook(os.path.join(args.dataset, args.pm), read_only=True, data_only=True, keep_vba=True)
    for ws in wb.worksheets:
        if ws.title == "WO&Notf":
            wo_rows = list(load_rows(ws))
        elif ws.title == "Equip list":
            eq_rows = list(load_rows(ws))
        elif ws.title == "Materials":
            mat_rows = list(load_rows(ws))
    wb.close()
    ledger["source_rows"] = {"WO&Notf": len(wo_rows), "Equip list": len(eq_rows), "Materials": len(mat_rows)}

    # ------------------------------------------------------------------ Equipment
    eq_excl: dict[str, int] = defaultdict(int)
    fl_desc: dict[str, str] = {}
    fl_loc_prefix: dict[str, str] = {}
    eq_fl_values: set[str] = set()
    eq_codes: set[str] = set()
    eq_number_to_code: dict[str, str] = {}
    equipment: list[list[str]] = []
    eq_seen: set[str] = set()
    for r in eq_rows:
        if r[E_NUMBER] and r[E_CODE]:
            eq_number_to_code.setdefault(r[E_NUMBER], r[E_CODE])
        fl = r[E_FL]
        if fl and fl != "#N/A":
            eq_fl_values.add(fl)
            if fl not in fl_desc and r[E_FLDESC]:
                fl_desc[fl] = r[E_FLDESC]
            parts = fl.split("-")
            for i in range(2, len(parts)):  # skip the depth-1 root prefix
                pref = "-".join(parts[:i])
                if pref not in fl_loc_prefix and r[E_LOC]:
                    fl_loc_prefix[pref] = r[E_LOC]
        code = r[E_CODE]
        if not code:
            eq_excl["blank equipmentCode"] += 1
            continue
        if code in eq_seen:
            eq_excl["duplicate equipmentCode"] += 1
            continue
        if not fl or fl == "#N/A":
            eq_excl["blank/#N/A functionalLocation"] += 1
            continue
        crit = CRITICALITY.get(r[E_ABC].upper(), "")
        if not crit:
            eq_excl["blank/unknown criticality"] += 1
            continue
        name = r[E_DESC] or r[E_FULLDESC]
        desc = r[E_FULLDESC] or r[E_DESC]
        if not name or not desc:
            eq_excl["blank name/description"] += 1
            continue
        eq_seen.add(code)
        eq_codes.add(code)
        row = [""] * 20
        row[1], row[2], row[3], row[4] = code, name, desc, fl
        row[5], row[6], row[7] = r[E_MFR], r[E_MODEL], r[E_SERIAL]
        row[8], row[9], row[10] = r[E_SORT] or code, r[E_CLASS], crit
        row[15], row[16] = user_of(r[E_CRBY]), d10(r[E_CRON])
        row[17], row[18] = user_of(r[E_CHBY]), d10(r[E_CHON]) or d10(r[E_CRON])
        equipment.append(row)
    ledger["equipment_excluded"] = dict(eq_excl)
    ledger["equipment_emitted"] = len(equipment)

    # --------------------------------------------------------- FunctionalLocations
    wo_fldesc: dict[str, str] = {}
    fl_codes: set[str] = set(eq_fl_values)
    for r in wo_rows:
        fl = r[W_FL]
        if fl and fl != "#N/A":
            fl_codes.add(fl)
            if r[W_FLDESC] and fl not in wo_fldesc:
                wo_fldesc[fl] = r[W_FLDESC]
    for code in list(fl_codes):
        parts = code.split("-")
        for i in range(1, len(parts)):
            fl_codes.add("-".join(parts[:i]))
    fl_codes.discard("")
    fl_codes.discard("#N/A")

    fl_rows: list[list[str]] = []
    for code in sorted(fl_codes, key=lambda c: (len(c.split("-")), c)):
        parts = code.split("-")
        parent = "-".join(parts[:-1]) if len(parts) > 1 else ""
        desc = fl_desc.get(code) or fl_loc_prefix.get(code) or wo_fldesc.get(code) or code
        row = [""] * 14
        row[1], row[2], row[3], row[4] = code, desc, parent, location_type(code)
        fl_rows.append(row)
    ledger["functionalLocations_emitted"] = len(fl_rows)

    # ---------------------------------------------------------------- WorkCenters
    wc_seen: list[str] = []
    for r in wo_rows:
        wc = r[W_WC]
        if not wc:
            continue
        if wc not in WORKCENTER_NAMES and wc.lower() == "i_elec":
            wc = "I_ELEC"
        if wc not in WORKCENTER_NAMES:
            WORKCENTER_NAMES[wc] = wc
        if wc not in wc_seen:
            wc_seen.append(wc)
    workcenters = []
    for code in wc_seen:
        row = [""] * 11
        row[1], row[2], row[3], row[4] = code, WORKCENTER_NAMES[code], "8", "0"
        workcenters.append(row)
    ledger["workCenters_emitted"] = len(workcenters)

    # ---------------------------------------------------------------------- Users
    users = []
    for u in KNOWN_USERS:
        row = [""] * 16
        row[1], row[3], row[4], row[5] = u, u, f"{u}@migration.local", "Technician"
        users.append(row)
    ledger["users_emitted"] = len(users)

    # ----------------------------------------------------------------- Materials
    by_code: dict[str, list] = defaultdict(list)
    mat_excl: dict[str, int] = defaultdict(int)
    for r in mat_rows:
        if not r[0]:
            mat_excl["blank materialCode"] += 1
            continue
        by_code[r[0]].append(r)
    materials = []
    for code, rows in by_code.items():
        desc = next((x[1] for x in rows if x[1]), "")
        uom = next((x[5] for x in rows if x[5]), "")
        anew = [x for x in rows if x[7] == "A-NEW"]
        costing = anew if anew else rows
        sum_unres = sum(num(x[4]) for x in costing)
        cost = (sum(num(x[8]) for x in costing) / sum_unres) if sum_unres > 0 else 0.0
        stock = sum(num(x[4]) for x in rows)
        row = [""] * 11
        row[1], row[2], row[3], row[4], row[5] = code, desc, uom, f"{cost:.2f}", num_str(stock)
        materials.append(row)
    ledger["materials_merged_rows"] = len(mat_rows) - len(by_code)
    ledger["materials_excluded"] = dict(mat_excl)
    ledger["materials_emitted"] = len(materials)

    # -------------------------------------------- WOs, notifications, links, notes
    def resolve_eq(value: str) -> str:
        """Map a WO/notification Equip# to an emitted equipmentCode.

        The legacy WO sheet carries either a TechIdentNo. (col E_CODE) or the
        numeric SAP Equipment number (col E_NUMBER); the equipment master key is
        the TechIdentNo., so translate the numeric form through the master.
        """
        if value and value in eq_codes:
            return value
        mapped = eq_number_to_code.get(value, "")
        return mapped if mapped in eq_codes else ""

    wo_excl: dict[str, int] = defaultdict(int)
    loadable: list[list[str]] = []
    for r in wo_rows:
        if not r[W_WO]:
            wo_excl["blank woNumber"] += 1
            continue
        wtype = WO_TYPE.get(r[W_TYPE], "")
        if not wtype:
            wo_excl[f"unmapped WO type ({r[W_TYPE] or 'blank'})"] += 1
            continue
        fl = r[W_FL]
        if not fl or fl == "#N/A":
            wo_excl["blank/#N/A functionalLocation"] += 1
            continue
        if not r[W_DESC]:
            wo_excl["blank job description"] += 1
            continue
        wc = "I_ELEC" if r[W_WC].lower() == "i_elec" else r[W_WC]
        if wc not in WORKCENTER_NAMES:
            wo_excl[f"unknown workCentre ({r[W_WC]})"] += 1
            continue
        if not user_of(r[W_CREATOR]):
            wo_excl[f"creator not a known user ({r[W_CREATOR]})"] += 1
            continue
        loadable.append(r)

    dup: dict[str, int] = defaultdict(int)
    wos: list[list[str]] = []
    kept: list[list[str]] = []
    wo_seen: set[str] = set()
    for r in loadable:
        wow = r[W_WO]
        if wow in wo_seen:
            dup["duplicate woNumber"] += 1
            continue
        wo_seen.add(wow)
        kept.append(r)
        wc = "I_ELEC" if r[W_WC].lower() == "i_elec" else r[W_WC]
        eq = resolve_eq(r[W_EQUIP])
        row = [""] * 39
        row[1], row[2], row[3], row[4] = wow, WO_TYPE[r[W_TYPE]], "Medium", WO_STATUS.get(r[W_STATUS], "")
        row[5], row[6], row[7], row[8] = r[W_FL], eq, r[W_DESC], wc
        row[10], row[11], row[12] = user_of(r[W_CREATOR]), d10(r[W_BSTART]), d10(r[W_BFINISH])
        row[32], row[33] = user_of(r[W_CREATOR]), d10(r[W_CREATED])
        wos.append(row)

    notifications: list[list[str]] = []
    ntf_seen: set[str] = set()
    for r in loadable:
        n = r[W_NOTIF]
        if not n:
            continue
        if n in ntf_seen:
            dup["duplicate notificationNumber"] += 1
            continue
        ntf_seen.add(n)
        eq = resolve_eq(r[W_EQUIP])
        row = [""] * 16
        row[1], row[2], row[3] = n, NOTIF_TYPE[WO_TYPE[r[W_TYPE]]], "Medium"
        row[4], row[5], row[6], row[7] = r[W_FL], eq, user_of(r[W_CREATOR]), r[W_DESC]
        row[11], row[12] = user_of(r[W_CREATOR]), d10(r[W_CREATED])
        notifications.append(row)

    links: list[list[str]] = []
    for r in kept:
        if r[W_NOTIF] not in ntf_seen:
            continue
        row = [""] * 7
        row[0], row[1], row[2], row[3] = r[W_WO], r[W_NOTIF], user_of(r[W_CREATOR]), d10(r[W_CREATED])
        links.append(row)

    comments: list[list[str]] = []
    for r in kept:
        if not r[W_NOTE]:
            continue
        row = [""] * 10
        row[1], row[2], row[3], row[4] = "WorkOrder", r[W_WO], user_of(r[W_CREATOR]), r[W_NOTE]
        row[5], row[6] = d10(r[W_CREATED]), user_of(r[W_CREATOR])
        comments.append(row)

    ledger["workOrders_excluded"] = dict(wo_excl)
    ledger["duplicates_dropped"] = dict(dup)
    ledger["equipment_fk_blanked_unresolved"] = sum(
        1 for r in kept if r[W_EQUIP] and not resolve_eq(r[W_EQUIP])
    )
    ledger["workOrders_emitted"] = len(wos)
    ledger["notifications_emitted"] = len(notifications)
    ledger["workOrderNotifLinks_emitted"] = len(links)
    ledger["comments_emitted"] = len(comments)

    write_csv(os.path.join(args.out, "WorkCenter.filled.csv"),
              ["workCenterId", "code", "name", "dailyCapacityHours", "costRatePerHour", "isActive",
               "createdBy", "createdDate", "modifiedBy", "modifiedDate", "isDeleted"], workcenters)
    write_csv(os.path.join(args.out, "User.filled.csv"),
              ["userId", "username", "passwordHash", "fullName", "email", "role", "workCenterId", "isActive",
               "failedLoginCount", "lockedUntil", "lastLogin", "createdBy", "createdDate", "modifiedBy",
               "modifiedDate", "isDeleted"], users)
    write_csv(os.path.join(args.out, "FunctionalLocation.filled.csv"),
              ["functionalLocationId", "locationCode", "description", "parentLocationId", "locationType",
               "operationalStatus", "installationDate", "gpsCoordinates", "safetyCritical", "createdBy",
               "createdDate", "modifiedBy", "modifiedDate", "isDeleted"], fl_rows)
    write_csv(os.path.join(args.out, "Equipment.filled.csv"),
              ["equipmentId", "equipmentCode", "name", "description", "functionalLocationId", "manufacturer",
               "model", "serialNumber", "assetTag", "equipmentClass", "criticality", "installationDate",
               "warrantyExpiryDate", "operationalStatus", "technicalParameters", "createdBy", "createdDate",
               "modifiedBy", "modifiedDate", "isDeleted"], equipment)
    write_csv(os.path.join(args.out, "Material.filled.csv"),
              ["materialId", "materialCode", "description", "unitOfMeasure", "standardCost", "currentStock",
               "createdBy", "createdDate", "modifiedBy", "modifiedDate", "isDeleted"], materials)
    write_csv(os.path.join(args.out, "Notification.filled.csv"),
              ["notificationId", "notificationNumber", "type", "priority", "functionalLocationId", "equipmentId",
               "reportedByUserId", "description", "damagesObservations", "breakdownFlag", "status", "createdBy",
               "createdDate", "modifiedBy", "modifiedDate", "isDeleted"], notifications)
    write_csv(os.path.join(args.out, "WorkOrder.filled.csv"),
              ["workOrderId", "woNumber", "type", "priority", "status", "functionalLocationId", "equipmentId",
               "description", "workCenterId", "supervisorUserId", "reportedByUserId", "plannedStart",
               "plannedFinish", "actualStart", "actualFinish", "costCenterCode", "internalOrder",
               "breakdownFlag", "safetyCriticalFlag", "causeCodeId", "failureCodeId", "safetyNotes",
               "completionRemarks", "calibrationResult", "calibrationAsFound", "calibrationAsLeft",
               "calibrationReferenceStandard", "calibrationDueDate", "calibrationIntervalValue",
               "calibrationIntervalUnit", "plannedCost", "actualCost", "createdBy", "createdDate", "modifiedBy",
               "modifiedDate", "isDeleted", "sourcePlanId", "sourcePlanCycle"], wos)
    write_csv(os.path.join(args.out, "WorkOrderNotifLink.filled.csv"),
              ["workOrderId", "notificationId", "createdBy", "createdDate", "modifiedBy", "modifiedDate",
               "isDeleted"], links)
    write_csv(os.path.join(args.out, "Comment.filled.csv"),
              ["commentId", "entityType", "entityId", "userId", "content", "createdDate", "createdBy",
               "modifiedBy", "modifiedDate", "isDeleted"], comments)

    with open(os.path.join(args.out, "EXCLUSION_LEDGER.json"), "w", encoding="utf-8") as fh:
        json.dump(ledger, fh, indent=2)
    print(json.dumps(ledger, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
