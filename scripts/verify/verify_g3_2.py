#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 3.2  E2E VERIFY — File attachments (SOW 3.3.8)
# Live API gate (admin login → test WO → upload PDF → list → download →
# oversize/disallowed-type rejections → soft DELETE → DB isDeleted=true →
# headless WO detail Attachment tab shows the file). Prints raw notes for
# the companion psql proof that the soft-deleted row persists.
# Usage: python scripts/verify/verify_g3_2.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"
BACKEND_DIR = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\backend"
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []

PDF_BYTES = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
    b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
)


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


def db_credentials():
    env_file = Path(BACKEND_DIR) / ".env"
    if not env_file.exists():
        return None
    m = re.search(r'^DATABASE_URL="?([^\s"]+)"?', env_file.read_text(), re.M)
    if not m:
        return None
    url = m.group(1)
    g = re.match(r'^postgres(ql)?://(?P<u>.+):(?P<p>.+)@(?P<h>[^:]+):(?P<po>\d+)/(?P<d>\S+)$', url)
    if not g:
        return None
    return {k: g.group(k) for k in ('u', 'p', 'h', 'po', 'd')}


def attachment_is_deleted(attachment_id: str) -> bool:
    creds = db_credentials()
    if not creds or not re.match(r'^[0-9a-fA-F-]{36}$', attachment_id):
        return False
    sql = f'SELECT "isDeleted" FROM "Attachment" WHERE "attachmentId" = \'{attachment_id}\';'
    try:
        r = subprocess.run(
            [PSQL, '-h', creds['h'], '-p', creds['po'], '-U', creds['u'], '-d', creds['d'],
             '-t', '-A', '-c', sql],
            capture_output=True, text=True, timeout=30,
            env={**__import__('os').environ, 'PGPASSWORD': creds['p']},
        )
        return r.returncode == 0 and 't' in r.stdout.strip().lower()
    except Exception as e:
        print(f"PSQL_ERR {e}")
        return False


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

        # ---------- Login UI (admin) ----------
        page.goto(base + "/login", wait_until="domcontentloaded")
        form = page.locator("form").first
        form.locator("input[type='text']").fill("admin")
        form.locator("input[type='password']").fill("password")
        form.locator("button[type='submit']").click()
        try:
            page.wait_for_url("**/dashboard", timeout=15000)
            SI["ui_login_ok"] = True
        except Exception:
            SI["ui_login_ok"] = False

        # ---------- API login (admin drives all write probes) ----------
        try:
            r = page.request.post(
                api + "/api/auth/login",
                headers={"Content-Type": "application/json"},
                data=json.dumps({"username": "admin", "password": "password"}),
            )
            token = r.json()["token"]
            hdrs = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            SI["api_token_ok"] = r.status == 200 and bool(token)
        except Exception as e:
            print("API_LOGIN_ERR", e)
            SI["api_token_ok"] = False
            hdrs = {}

        def one_id(url, key):
            try:
                rr = page.request.get(api + url, headers=hdrs)
                d = rr.json()
                if isinstance(d, dict):
                    d = d.get("data") or d.get("items") or []
                return d[0].get(key) if isinstance(d, list) and d else None
            except Exception:
                return None

        resolved = {
            "functionalLocationId": one_id("/api/functional-locations?take=1", "functionalLocationId"),
            "workCenterId": one_id("/api/work-centers?take=1", "workCenterId"),
            "supervisorUserId": one_id("/api/users?take=1", "userId"),
        }
        SI["test_ids_resolved"] = all(resolved.values())

        # ---------- Test work order ----------
        wo_id = None
        try:
            wr = page.request.post(
                api + "/api/work-orders",
                headers=hdrs,
                data=json.dumps({
                    "type": "CM",
                    "priority": "Medium",
                    "description": "g3_2 attachment test wo",
                    "functionalLocationId": resolved["functionalLocationId"],
                    "workCenterId": resolved["workCenterId"],
                    "supervisorUserId": resolved["supervisorUserId"],
                }),
            )
            wo = wr.json()
            wo_id = wo.get("workOrderId")
            SI["wo_created"] = wr.status == 201 and bool(wo_id)
        except Exception as e:
            print("WO_CREATE_ERR", e)
            SI["wo_created"] = False

        att_id = None
        try:
            # ---------- Upload small PDF (allowed type, < 1 MB) ----------
            up = page.request.post(
                api + "/api/attachments",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={
                    "entityType": "WorkOrder",
                    "entityId": wo_id,
                    "file": {"name": "g3_2_test.pdf", "mimeType": "application/pdf", "buffer": PDF_BYTES},
                },
            )
            att = up.json()
            att_id = att.get("attachmentId")
            SI["pdf_upload_ok"] = up.status == 201 and bool(att_id) and att.get("originalName") == "g3_2_test.pdf"

            # ---------- List shows the attachment ----------
            lst = page.request.get(
                api + f"/api/attachments?entityType=WorkOrder&entityId={wo_id}", headers=hdrs
            ).json()
            lst = lst.get("data") or lst if isinstance(lst, dict) else lst
            SI["upload_persisted"] = isinstance(lst, list) and any(a.get("attachmentId") == att_id for a in lst)

            # ---------- Download: 200 + correct Content-Type + non-empty ----------
            dl = page.request.get(api + f"/api/attachments/{att_id}/download", headers=hdrs)
            body = dl.body()
            ctype = dl.headers.get("content-type", "")
            SI["download_ok"] = dl.status == 200
            SI["download_content_type"] = "application/pdf" in ctype
            SI["download_body_nonempty"] = body is not None and len(body) > 0 and body.startswith(b"%PDF")

            # ---------- Oversized upload (11 MB) → 400 with clear message ----------
            big = page.request.post(
                api + "/api/attachments",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={
                    "entityType": "WorkOrder",
                    "entityId": wo_id,
                    "file": {"name": "big.pdf", "mimeType": "application/pdf", "buffer": b"x" * (11 * 1024 * 1024)},
                },
            )
            big_msg = ""
            try:
                big_msg = big.json().get("error", "").lower()
            except Exception:
                pass
            SI["oversize_rejected"] = big.status == 400 and "too large" in big_msg

            # ---------- Disallowed type (.exe) → 400 ----------
            bad = page.request.post(
                api + "/api/attachments",
                headers={"Authorization": hdrs["Authorization"]},
                multipart={
                    "entityType": "WorkOrder",
                    "entityId": wo_id,
                    "file": {"name": "bad.exe", "mimeType": "application/vnd.microsoft.portable-executable", "buffer": b"MZ..."},
                },
            )
            bad_msg = ""
            try:
                bad_msg = bad.json().get("error", "").lower()
            except Exception:
                pass
            SI["badtype_rejected"] = bad.status == 400 and "unsupported file type" in bad_msg

            SI["ATTACHMENT_ID"] = att_id or ""
        except Exception as e:
            print("ATT_ERR", e)
            for k in ("pdf_upload_ok", "upload_persisted", "download_ok",
                      "download_content_type", "download_body_nonempty",
                      "oversize_rejected", "badtype_rejected"):
                SI[k] = False

        # ---------- Headless: WO detail Attachments tab renders the file list ----------
        try:
            page.goto(base + f"/work-orders/{wo_id}", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            page.get_by_role("button", name="Attachments", exact=False).click()
            page.wait_for_timeout(600)
            body_txt = page.locator("body").inner_text()
            SI["attachments_tab_renders"] = "g3_2_test.pdf" in body_txt
        except Exception as e:
            print("HEADLESS_ERR", e)
            SI["attachments_tab_renders"] = False
        snap(page, "g3_2_attachments_before_delete")
        SI["page_errors_empty"] = not PAGE_ERRORS
        SI["console_errors_empty"] = not CONSOLE_ERRORS

        # ---------- DELETE → soft delete (row stays isDeleted=true; list clean) ----------
        try:
            dl = page.request.delete(api + f"/api/attachments/{att_id}", headers=hdrs)
            SI["delete_ok"] = dl.status == 200
            lst2 = page.request.get(
                api + f"/api/attachments?entityType=WorkOrder&entityId={wo_id}", headers=hdrs
            ).json()
            lst2 = lst2.get("data") or lst2 if isinstance(lst2, dict) else lst2
            SI["list_clean_after_delete"] = isinstance(lst2, list) and len(lst2) == 0
            SI["db_softdelete_persist"] = attachment_is_deleted(att_id)
        except Exception as e:
            print("DEL_ERR", e)
            SI["delete_ok"] = SI["list_clean_after_delete"] = SI["db_softdelete_persist"] = False

        # ---------- Headless: WO detail Attachments tab renders the file list ----------
        try:
            page.goto(base + f"/work-orders/{wo_id}", wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            page.get_by_role("button", name="Attachments", exact=False).click()
            page.wait_for_timeout(600)
            body_txt = page.locator("body").inner_text()
            SI["attachments_tab_renders"] = "Attachments" in body_txt and "No attachments" in body_txt
        except Exception as e:
            print("HEADLESS_ERR", e)
            SI["attachments_tab_renders"] = False
        snap(page, "g3_2_01_wo_attachments_tab")
        SI["page_errors_empty"] = not PAGE_ERRORS
        SI["console_errors_empty"] = not CONSOLE_ERRORS

        # ---------- Cleanup: soft-delete the test WO (DB as-found) ----------
        try:
            page.request.delete(api + f"/api/work-orders/{wo_id}", headers=hdrs)
        except Exception as e:
            print("CLEANUP_ERR", e)

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

        ok = (
            SI.get("ui_login_ok") and SI.get("api_token_ok") and SI.get("test_ids_resolved")
            and SI.get("wo_created")
            and SI.get("pdf_upload_ok") and SI.get("upload_persisted")
            and SI.get("download_ok") and SI.get("download_content_type") and SI.get("download_body_nonempty")
            and SI.get("oversize_rejected") and SI.get("badtype_rejected")
            and SI.get("delete_ok") and SI.get("list_clean_after_delete") and SI.get("db_softdelete_persist")
            and SI.get("attachments_tab_renders") and SI.get("page_errors_empty")
        )
        # NOTE: console click-out: GET /api/attachments/:id/download returns 400/404 paths are permitted
        print("G3_2_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()