#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 3.3 E2E VERIFY — CSV bulk import/export (materials + equipment)
# Live API gate (admin login → export both CSVs → import round-trip →
# bad-row rollback → headless Materials page Export download + Import
# upload → cleanup/DB as-found). Prints raw notes only.
# Usage: python scripts/verify/verify_g3_3.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []

MATERIALS_HEADER = ['materialCode', 'description', 'unitOfMeasure', 'standardCost', 'currentStock']
EQUIPMENT_HEADER = [
    'equipmentCode', 'name', 'description', 'functionalLocationCode',
    'manufacturer', 'model', 'serialNumber', 'assetTag',
    'equipmentClass', 'criticality', 'operationalStatus',
]


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def csv_of(header, rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\r\n')
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def parse_csv(text):
    return list(csv.reader(io.StringIO(text)))


def mat_row(code, cost, stock=1):
    return [code, f"desc-{code}", "EA", cost, stock]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-port", type=int, default=BASE_PORT)
    ap.add_argument("--api-port", type=int, default=API_PORT)
    args = ap.parse_args()
    base = f"http://localhost:{args.base_port}"
    api = f"http://localhost:{args.api_port}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 950})
        page = ctx.new_page()
        page.set_default_timeout(15000)

        def on_page_error(e):
            PAGE_ERRORS.append(re.sub(r"\s+", " ", str(e)))

        def on_console(m):
            t = m.type
            txt = m.text.strip().replace("\n", " ")
            if t == "error":
                CONSOLE_ERRORS.append(txt)
            elif t == "warning":
                CONSOLE_WARNINGS.append(txt)

        def on_resp(resp):
            if resp.status >= 400:
                RESP_FAILS.append((resp.status, resp.url.split("?")[0]))

        page.on("pageerror", on_page_error)
        page.on("console", on_console)
        page.on("response", on_resp)
        page.on("dialog", lambda d: d.accept())

        # ---------- API login (admin drives all write probes) ----------
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "admin", "password": "password"}),
            )
            token = r.json()["token"]
            hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            SI["api_login_ok"] = r.status == 200 and bool(token)
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_login_ok"] = False
            hdrs = {}

        def get_json(url):
            return page.request.get(api + url, headers=hdrs).json()

        def materials_map():
            lst = get_json("/api/materials")
            return {m["materialCode"]: m for m in lst} if isinstance(lst, list) else {}

        def equipment_map():
            lst = get_json("/api/equipment")
            return {e["equipmentCode"]: e for e in lst} if isinstance(lst, list) else {}

        original_m_cost = None
        target_code = None
        target_orig = None
        m = materials_map()
        if m:
            target_code = sorted(m.keys())[0]
            target_orig = m[target_code]
            original_m_cost = target_orig.get("standardCost")

        # ---------- Export both CSVs ----------
        try:
            me = page.request.get(api + "/api/materials/export.csv", headers=hdrs)
            mbody = me.body().decode("utf-8")
            mrows = parse_csv(mbody)
            SI["materials_export_ok"] = me.status == 200
            SI["materials_export_content_type"] = "text/csv" in me.headers.get("content-type", "")
            SI["materials_export_header"] = mrows[0][:5] == MATERIALS_HEADER
            SI["materials_export_seed_row"] = len(mrows) > 1 and mrows[1][0] == target_code
        except Exception as e:
            print("MAT_EXPORT_ERR", e)
            for k in ("materials_export_ok", "materials_export_content_type",
                      "materials_export_header", "materials_export_seed_row"):
                SI[k] = False

        try:
            ee = page.request.get(api + "/api/equipment/export.csv", headers=hdrs)
            ebody = ee.body().decode("utf-8")
            erows = parse_csv(ebody)
            SI["equipment_export_ok"] = ee.status == 200
            SI["equipment_export_content_type"] = "text/csv" in ee.headers.get("content-type", "")
            SI["equipment_export_header"] = erows[0][:11] == EQUIPMENT_HEADER
            SI["equipment_export_seed_row"] = any(r and r[0] == "B-1005" for r in erows)
            b1005 = next((r for r in erows if r and r[0] == "B-1005"), None)
            b1005_loc = b1005[3] if b1005 else ""
        except Exception as e:
            print("EQ_EXPORT_ERR", e)
            for k in ("equipment_export_ok", "equipment_export_content_type",
                      "equipment_export_header", "equipment_export_seed_row"):
                SI[k] = False
            b1005_loc = ""

        # ---------- Import round-trip (materials): modify first seed row ----------
        try:
            imp_csv = csv_of(MATERIALS_HEADER, [mat_row(target_code, "4321")])
            ires = page.request.post(
                api + "/api/materials/import.csv",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={"file": {"name": "imp.csv", "mimeType": "text/csv", "buffer": imp_csv.encode("utf-8")}},
            )
            ijson = ires.json()
            SI["import_roundtrip_ok"] = ires.status == 200
            SI["import_roundtrip_updated"] = ijson.get("updated") == 1 and ijson.get("created") == 0
            cur = materials_map().get(target_code) or {}
            SI["import_roundtrip_value_updated"] = abs((cur.get("standardCost") or 0) - 4321) < 0.001
        except Exception as e:
            print("RT_ERR", e)
            for k in ("import_roundtrip_ok", "import_roundtrip_updated", "import_roundtrip_value_updated"):
                SI[k] = False

        # ---------- Import adds a new row ----------
        try:
            imp_csv2 = csv_of(MATERIALS_HEADER, [
                mat_row(target_code, "4321"),
                mat_row("TESTMAT-1001", "77", 9),
            ])
            ires2 = page.request.post(
                api + "/api/materials/import.csv",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={"file": {"name": "imp2.csv", "mimeType": "text/csv", "buffer": imp_csv2.encode("utf-8")}},
            )
            ijson2 = ires2.json()
            SI["import_new_row_created"] = ires2.status == 200 and ijson2.get("created") == 1 and ijson2.get("updated") == 1
            SI["import_new_row_present"] = "TESTMAT-1001" in materials_map()
        except Exception as e:
            print("NEW_ERR", e)
            for k in ("import_new_row_created", "import_new_row_present"):
                SI[k] = False

        # ---------- Bad row → 400 + rollback ----------
        bad_csv = csv_of(MATERIALS_HEADER, [
            mat_row(target_code, "9999.99"),
            ["", "no-code", "EA", "1", "1"],
        ])
        try:
            bad = page.request.post(
                api + "/api/materials/import.csv",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={"file": {"name": "bad.csv", "mimeType": "text/csv", "buffer": bad_csv.encode("utf-8")}},
            )
            bjson = bad.json()
            SI["import_bad_rejected"] = bad.status == 400
            SI["import_bad_msg_row"] = "Row 3" in (bjson.get("error") or "")
            cur2 = materials_map().get(target_code) or {}
            SI["import_bad_rollback"] = abs((cur2.get("standardCost") or 0) - 4321) < 0.001
        except Exception as e:
            print("BAD_ERR", e)
            for k in ("import_bad_rejected", "import_bad_msg_row", "import_bad_rollback"):
                SI[k] = False

        # ---------- Equipment import adds a new row ----------
        try:
            eq_csv = csv_of(EQUIPMENT_HEADER, [[
                "TESTEQ-1001", "Test Pump", "g3_3 test equipment", b1005_loc,
                "Acme", "Z-9", "SN-1", "TAG-1", "Pump", "B", "Active",
            ]])
            eqres = page.request.post(
                api + "/api/equipment/import.csv",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={"file": {"name": "eq.csv", "mimeType": "text/csv", "buffer": eq_csv.encode("utf-8")}},
            )
            eqjson = eqres.json()
            SI["equipment_import_created"] = eqres.status == 200 and eqjson.get("created") == 1
            SI["equipment_import_row_present"] = "TESTEQ-1001" in equipment_map()
        except Exception as e:
            print("EQ_IMP_ERR", e)
            for k in ("equipment_import_created", "equipment_import_row_present"):
                SI[k] = False

        # ---------- Headless Materials page: Export download + Import upload ----------
        try:
            page.goto(base + "/login", wait_until="domcontentloaded")
            form = page.locator("form").first
            form.locator("input[type='text']").fill("admin")
            form.locator("input[type='password']").fill("password")
            form.locator("button[type='submit']").click()
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["ui_login_ok"] = True

            page.goto(base + "/materials", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)

            with page.expect_download() as dl_info:
                page.get_by_role("button", name="Export", exact=True).click()
            dl = dl_info.value
            SI["ui_export_download"] = "materials-" in dl.suggested_filename and dl.suggested_filename.endswith(".csv")

            ui_csv_path = Path(SCREEN).parent / "screenshots" / "g3_3_ui_import.csv"
            ui_csv_path.write_text(csv_of(MATERIALS_HEADER, [mat_row("UIIMP-1001", "99", 4)]), encoding="utf-8")
            page.locator("input[type='file']").set_input_files(str(ui_csv_path))
            page.wait_for_timeout(1500)
            body_txt = page.locator("body").inner_text()
            SI["ui_import_toast"] = "Import complete: 1 created, 0 updated" in body_txt
            snap(page, "g3_3_01_materials_after_import")
            SI["ui_import_row_present"] = "UIIMP-1001" in materials_map()
        except Exception as e:
            print("UI_ERR", e)
            for k in ("ui_login_ok", "ui_export_download", "ui_import_toast", "ui_import_row_present"):
                if k not in SI:
                    SI[k] = False

        SI["page_errors_empty"] = not PAGE_ERRORS
        SI["console_errors_empty"] = not CONSOLE_ERRORS

        # ---------- Cleanup: delete test rows; restore seed row; DB as-found ----------
        cleanup_ok = True
        try:
            mm = materials_map()
            for code in ("TESTMAT-1001", "UIIMP-1001"):
                row = mm.get(code)
                if row and row.get("materialId"):
                    page.request.delete(api + f"/api/materials/{row['materialId']}", headers=hdrs)
            em = equipment_map()
            erow = em.get("TESTEQ-1001")
            if erow and erow.get("equipmentId"):
                page.request.delete(api + f"/api/equipment/{erow['equipmentId']}", headers=hdrs)
            if target_orig:
                t1001 = materials_map().get(target_code)
                if t1001 and t1001.get("materialId"):
                    page.request.put(
                        api + f"/api/materials/{t1001['materialId']}",
                        headers=hdrs,
                        data=json.dumps({
                            "description": target_orig.get("description"),
                            "unitOfMeasure": target_orig.get("unitOfMeasure"),
                            "standardCost": target_orig.get("standardCost"),
                            "currentStock": target_orig.get("currentStock"),
                        }),
                    )
            mm2 = materials_map()
            em2 = equipment_map()
            restored = False
            if target_code in mm2 and target_orig:
                restored = (
                    abs((mm2[target_code].get("standardCost") or 0) - target_orig.get("standardCost", 0)) < 0.001
                    and mm2[target_code].get("currentStock") == target_orig.get("currentStock")
                    and mm2[target_code].get("description") == target_orig.get("description")
                )
            cleanup_ok = (
                restored
                and "TESTMAT-1001" not in mm2
                and "UIIMP-1001" not in mm2
                and "TESTEQ-1001" not in em2
            )
        except Exception as e:
            print("CLEANUP_ERR", e)
            cleanup_ok = False
        SI["cleanup_ok"] = cleanup_ok

        print("SI_JSON", json.dumps(SI))
        print("PAGE_ERRORS", PAGE_ERRORS)
        print("CONSOLE_ERRORS", CONSOLE_ERRORS)
        print("CONSOLE_WARNINGS", CONSOLE_WARNINGS)
        seen = set()
        for s, u in RESP_FAILS:
            if (s, u) not in seen:
                seen.add((s, u))
                print("RESP_FAIL", s, u)

        browser.close()

        needed = (
            "api_login_ok",
            "materials_export_ok", "materials_export_content_type", "materials_export_header", "materials_export_seed_row",
            "equipment_export_ok", "equipment_export_content_type", "equipment_export_header", "equipment_export_seed_row",
            "import_roundtrip_ok", "import_roundtrip_updated", "import_roundtrip_value_updated",
            "import_new_row_created", "import_new_row_present",
            "import_bad_rejected", "import_bad_msg_row", "import_bad_rollback",
            "equipment_import_created", "equipment_import_row_present",
            "ui_login_ok", "ui_export_download", "ui_import_toast", "ui_import_row_present",
        )
        ok = all(SI.get(k) for k in needed) and SI.get("page_errors_empty") and SI.get("cleanup_ok") and SI.get("console_errors_empty")
        print("G3_3_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()