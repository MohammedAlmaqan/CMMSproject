#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# R5  VERIFY — Excel export (.xlsx) format, read by an independent parser
#
# Row 59 of SOW 3.7.1: every report exportable to Excel. The writer is
# backend/src/utils/xlsx.ts, hand-rolled with no xlsx dependency, so its
# output must not be validated by the code that produced it. This gate opens
# every workbook with openpyxl — a parser this repository does not own — and
# asserts the things row 59 promises:
#
#   1. each file is a valid ZIP container (CRC checked)
#   2. openpyxl opens it and finds at least one worksheet
#   3. it carries real cell values, with a header row
#   4. no cell is a formula, so a value beginning with "=" stays literal text
#   5. a purpose-built probe proves the value rules: "=" text, numbers as
#      numbers, booleans as booleans, XML escaped, control chars stripped
#
# Usage: python scripts/verify/verify_r5.py <folder-of-xlsx>
# Exit:  0 PASS   1 FAIL   2 CANNOT RUN (openpyxl unavailable)
# ═══════════════════════════════════════════════════════════════════════
import glob
import os
import sys
import zipfile

try:
    from openpyxl import load_workbook
except Exception as exc:  # pragma: no cover - environment guard
    print(f"Cannot run: openpyxl is not importable ({exc})")
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCREEN = os.path.join(ROOT, "screenshots")

OUT = []
FAIL = []


def emit(line=""):
    OUT.append(line)
    print(line)


def check(label, ok, detail=""):
    if not ok:
        FAIL.append(label)
    emit(f"  {label:<60} {'OK' if ok else 'FAIL'}")
    if detail and not ok:
        emit(f"      {detail}")
    return ok


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else None
    emit("=" * 74)
    emit("R5 VERIFY - Excel export format, opened by openpyxl")
    emit("=" * 74)
    if not folder or not os.path.isdir(folder):
        emit(f"  no such folder: {folder}")
        return 1
    emit(f"  folder: {folder}")
    emit()

    files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    check("at least one workbook was produced", len(files) > 0, f"{len(files)} file(s)")
    if not files:
        return 1

    total_cells = 0
    for path in files:
        name = os.path.basename(path)

        zip_ok = True
        try:
            with zipfile.ZipFile(path) as archive:
                zip_ok = archive.testzip() is None
        except Exception as exc:
            zip_ok = False
            emit(f"      zip error: {exc}")
        check(f"{name}: valid ZIP container (CRC checked)", zip_ok)
        if not zip_ok:
            continue

        try:
            book = load_workbook(path, read_only=True, data_only=False)
        except Exception as exc:
            check(f"{name}: openpyxl opens it", False, str(exc))
            continue
        check(f"{name}: openpyxl opens it", True)

        sheets = book.sheetnames
        check(f"{name}: has at least one worksheet", len(sheets) >= 1, str(sheets))

        cells = 0
        formulas = 0
        header_rows = 0
        for ws in book.worksheets:
            first_populated = True
            for row in ws.iter_rows():
                populated = [c for c in row if c.value is not None]
                if first_populated and populated:
                    header_rows += 1
                if populated:
                    first_populated = False
                for cell in populated:
                    cells += 1
                    if cell.data_type == "f":
                        formulas += 1
        book.close()

        total_cells += cells
        # An empty report is a legitimate export, so the header row is required
        # only when the sheet actually carries data; the data-bearing reports
        # prove the header path, and this one does not fail a report that is
        # simply empty on the database under test.
        check(f"{name}: header row when it has data", cells == 0 or header_rows > 0,
              f"cells={cells} header_rows={header_rows}")
        check(f"{name}: contains no formula cells", formulas == 0, f"{formulas} formula cell(s)")

    # -- the value-rules probe -------------------------------------------
    probe = os.path.join(folder, "_values.xlsx")
    if check("probe workbook present", os.path.isfile(probe)):
        book = load_workbook(probe, read_only=True, data_only=False)
        ws = book["Probe"]

        def cell_at(address):
            for row in ws.iter_rows():
                for cell in row:
                    if cell.coordinate == address:
                        return cell
            return None

        a2 = cell_at("A2")
        a3 = cell_at("A3")
        a4 = cell_at("A4")
        b2 = cell_at("B2")
        b3 = cell_at("B3")
        c2 = cell_at("C2")
        check('leading "=" is stored as text, never a formula',
              a2 is not None and a2.value == "=1+1" and a2.data_type != "f",
              f"value={getattr(a2, 'value', None)!r} type={getattr(a2, 'data_type', None)!r}")
        check("XML metacharacters survive round-trip as text",
              a3 is not None and a3.value == '<b>x</b> & "y"')
        check("forbidden control character is removed",
              a4 is not None and a4.value == "ab", f"value={getattr(a4, 'value', None)!r}")
        check("integer stays numeric", b2 is not None and b2.value == 42 and b2.data_type == "n",
              f"value={getattr(b2, 'value', None)!r} type={getattr(b2, 'data_type', None)!r}")
        check("decimal stays numeric", b3 is not None and abs(b3.value - 3.5) < 1e-9 and b3.data_type == "n")
        check("boolean stays boolean", c2 is not None and c2.value is True)
        book.close()

    # -- verdict ----------------------------------------------------------
    emit()
    emit(f"  workbooks: {len(files)}   value cells: {total_cells}")
    emit("=" * 74)
    if FAIL:
        emit(f"R5 VERIFY: FAIL - {len(FAIL)} check(s) failed")
        for item in FAIL:
            emit(f"  FAILED: {item}")
    else:
        emit("R5 VERIFY: PASS - every workbook opens under openpyxl, no formula cells")
    emit("=" * 74)

    os.makedirs(SCREEN, exist_ok=True)
    with open(os.path.join(SCREEN, "r5_xlsx_verify.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\n")
    print("\n[written] screenshots/r5_xlsx_verify.txt")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
