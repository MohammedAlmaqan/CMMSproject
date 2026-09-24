#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
# 3.4  E2E VERIFY — Consistent delete strategy
# Live API gate (admin login → host WO → per-route create→DELETE→absent →
# headless page absence of deleted items). Prints DELETED_IDS for the
# companion psql step that proves DB side (hard routes: row GONE; soft
# routes: row present with isDeleted=true).
# Usage: python scripts/verify/verify_g3_4.py
# Exit:  0 PASS  1 FAIL
# ═══════════════════════════════════════════════════════════════════════
import argparse
import json
import re
import sys
import time
from playwright.sync_api import sync_playwright

BASE_PORT = 3000
API_PORT = 4000
SCREEN = r"C:\Users\Injaz\Documents\Default Project\CMMSproject\screenshots"

SI = {}
PAGE_ERRORS = []
CONSOLE_ERRORS = []
CONSOLE_WARNINGS = []
RESP_FAILS = []
DELETED_IDS = []


def snap(page, label):
    try:
        page.screenshot(path=f"{SCREEN}\\{label}.png")
    except Exception as e:
        print(f"SNAP_FAIL {label}: {e}")


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

        # ---------- Login UI (operator) ----------
        page.goto(base + "/login", wait_until="domcontentloaded")
        form = page.locator("form").first
        form.locator("input[type='text']").fill("operator")
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

        # ---------- Resolve live master-data ids (seed regenerates UUIDs) ----------
        def one_id(url, key):
            try:
                rr = page.request.get(api + url, headers=hdrs)
                d = rr.json()
                if isinstance(d, dict):
                    d = d.get("data") or d.get("items") or []
                return d[0].get(key) if isinstance(d, list) and d else None
            except Exception:
                return None

        resolved = {}
        for url, key in [
            ("/api/functional-locations?take=1", "functionalLocationId"),
            ("/api/work-centers?take=1", "workCenterId"),
            ("/api/equipment?take=1", "equipmentId"),
            ("/api/materials?take=1", "materialId"),
        ]:
            resolved[key] = one_id(url, key)
        try:
            wc = page.request.get(api + f"/api/work-centers/{resolved['workCenterId']}", headers=hdrs).json()
            resolved["craftId"] = wc.get("crafts", [{}])[0].get("craftId")
        except Exception as e:
            print("CRAFT_RESOLVE_ERR", e)
            resolved["craftId"] = None
        resolved["supervisorUserId"] = one_id("/api/users?take=1", "userId")
        try:
            tpl = page.request.get(api + "/api/safety-checklists/templates", headers=hdrs).json()
            tpl = tpl.get("data") or tpl if isinstance(tpl, dict) else tpl
            resolved["checklistTemplateId"] = tpl[0].get("checklistTemplateId") if tpl else None
        except Exception as e:
            print("TPL_RESOLVE_ERR", e)
            resolved["checklistTemplateId"] = None
        SI["test_ids_resolved"] = all(
            resolved.get(k) for k in ["functionalLocationId", "workCenterId", "equipmentId", "materialId", "craftId", "supervisorUserId", "checklistTemplateId"]
        )

        # ---------- Host work order (nests the child-route probes) ----------
        wo_id = None
        try:
            wr = page.request.post(
                api + "/api/work-orders",
                headers=hdrs,
                data=json.dumps({
                    "type": "CM",
                    "priority": "Medium",
                    "description": "g3_4 host wo",
                    "functionalLocationId": resolved["functionalLocationId"],
                    "workCenterId": resolved["workCenterId"],
                    "supervisorUserId": resolved["supervisorUserId"],
                }),
            )
            wo = wr.json()
            wo_id, wo_num = wo.get("workOrderId"), wo.get("woNumber")
            SI["host_wo_created"] = wr.status == 201 and bool(wo_id)
        except Exception as e:
            print("WO_CREATE_ERR", e)
            SI["host_wo_created"] = False

        def absent_from_list(url):
            try:
                d = page.request.get(api + url, headers=hdrs).json()
                if isinstance(d, dict):
                    d = d.get("data") or []
                return d is not None and len(d) == 0
            except Exception:
                return False

        qs = f"workOrderId={wo_id}" if wo_id else "workOrderId=none"

        # H1: workOrderOperations DELETE (hard, documented exception)
        op1 = None
        try:
            rr = page.request.post(
                api + "/api/work-order-operations",
                headers=hdrs,
                data=json.dumps({"workOrderId": wo_id, "sequenceNumber": 1, "description": "g34 will-hard-delete", "craftId": resolved["craftId"], "plannedHours": 1, "numberOfTechnicians": 1}),
            )
            op1 = rr.json().get("operationId")
            SI["hard_op_create"] = rr.status == 201
            dl = page.request.delete(api + f"/api/work-order-operations/{op1}", headers=hdrs)
            SI["hard_op_delete"] = dl.status == 200
            SI["hard_op_absent"] = absent_from_list(f"/api/work-order-operations?{qs}")
            if op1:
                DELETED_IDS.append(f"WorkOrderOperation:{op1}")
        except Exception as e:
            print("H1_ERR", e)
            SI["hard_op_create"] = SI["hard_op_delete"] = SI["hard_op_absent"] = False

        # H2: workOrderMaterials DELETE (hard, documented exception)
        try:
            rr = page.request.post(
                api + "/api/work-order-materials",
                headers=hdrs,
                data=json.dumps({"workOrderId": wo_id, "materialId": resolved["materialId"], "plannedQuantity": 1}),
            )
            mid = rr.json().get("woMaterialId")
            SI["hard_mat_create"] = rr.status == 201
            dl = page.request.delete(api + f"/api/work-order-materials/{mid}", headers=hdrs)
            SI["hard_mat_delete"] = dl.status == 200
            SI["hard_mat_absent"] = absent_from_list(f"/api/work-order-materials?{qs}")
            if mid:
                DELETED_IDS.append(f"WorkOrderMaterial:{mid}")
        except Exception as e:
            print("H2_ERR", e)
            SI["hard_mat_create"] = SI["hard_mat_delete"] = SI["hard_mat_absent"] = False

        # H3: externalServiceCosts DELETE (hard, documented exception)
        try:
            rr = page.request.post(
                api + "/api/external-services",
                headers=hdrs,
                data=json.dumps({"workOrderId": wo_id, "vendor": "G34V", "description": "g34 hard", "cost": 10}),
            )
            sid = rr.json().get("serviceCostId")
            SI["hard_svc_create"] = rr.status == 201
            dl = page.request.delete(api + f"/api/external-services/{sid}", headers=hdrs)
            SI["hard_svc_delete"] = dl.status == 200
            SI["hard_svc_absent"] = absent_from_list(f"/api/external-services?{qs}")
            if sid:
                DELETED_IDS.append(f"ExternalServiceCost:{sid}")
        except Exception as e:
            print("H3_ERR", e)
            SI["hard_svc_create"] = SI["hard_svc_delete"] = SI["hard_svc_absent"] = False

        # H4: comments DELETE (hard, documented exception)
        try:
            rr = page.request.post(
                api + "/api/comments",
                headers=hdrs,
                data=json.dumps({"entityType": "WorkOrder", "entityId": wo_id, "content": "g34 comment to hard-delete"}),
            )
            cid = rr.json().get("commentId")
            SI["hard_cmt_create"] = rr.status == 201
            dl = page.request.delete(api + f"/api/comments/{cid}", headers=hdrs)
            SI["hard_cmt_delete"] = dl.status == 200
            SI["hard_cmt_absent"] = absent_from_list(f"/api/comments?entityType=WorkOrder&entityId={wo_id}")
            if cid:
                DELETED_IDS.append(f"Comment:{cid}")
        except Exception as e:
            print("H4_ERR", e)
            SI["hard_cmt_create"] = SI["hard_cmt_delete"] = SI["hard_cmt_absent"] = False

        # H5: workOrderChecklist DELETE (hard, documented exception; items cascade hard)
        cl_id = None
        try:
            rr = page.request.post(
                api + f"/api/safety-checklists/work-order/{wo_id}/attach",
                headers=hdrs,
                data=json.dumps({"checklistTemplateId": resolved["checklistTemplateId"]}),
            )
            cl_id = rr.json().get("woChecklistId")
            SI["hard_cl_create"] = rr.status == 201
            dl = page.request.delete(api + f"/api/safety-checklists/work-order-checklist/{cl_id}", headers=hdrs)
            SI["hard_cl_delete"] = dl.status == 200
            SI["hard_cl_absent"] = absent_from_list(f"/api/safety-checklists/work-order/{wo_id}")
            if cl_id:
                DELETED_IDS.append(f"WorkOrderChecklist:{cl_id}")
        except Exception as e:
            print("H5_ERR", e)
            SI["hard_cl_create"] = SI["hard_cl_delete"] = SI["hard_cl_absent"] = False

        # S3: labor DELETE (soft — LaborEntry has isDeleted)
        op2 = None
        try:
            rr = page.request.post(
                api + "/api/work-order-operations",
                headers=hdrs,
                data=json.dumps({"workOrderId": wo_id, "sequenceNumber": 2, "description": "g34 labor op", "craftId": resolved["craftId"], "plannedHours": 1, "numberOfTechnicians": 1}),
            )
            op2 = rr.json().get("operationId")
            lr = page.request.post(
                api + "/api/labor",
                headers=hdrs,
                data=json.dumps({"operationId": op2, "userId": resolved["supervisorUserId"], "hoursWorked": 1}),
            )
            lid = lr.json().get("laborEntryId")
            SI["soft_labor_create"] = lr.status == 201
            dl = page.request.delete(api + f"/api/labor/{lid}", headers=hdrs)
            SI["soft_labor_delete"] = dl.status == 200
            SI["soft_labor_absent"] = absent_from_list(f"/api/labor?{qs}")
            if lid:
                DELETED_IDS.append(f"LaborEntry:{lid}")
        except Exception as e:
            print("S3_ERR", e)
            SI["soft_labor_create"] = SI["soft_labor_delete"] = SI["soft_labor_absent"] = False

        def absent_matching_code_list(url):
            try:
                d = page.request.get(api + url, headers=hdrs).json()
                if isinstance(d, dict):
                    d = d.get("data") or []
                code = f"TL-G34-{stamp % 10**8}"
                return d is not None and not any(t.get("code") == code for t in d)
            except Exception:
                return False

        # S1+S2: taskList create→PUT replace-ops (soft) → DELETE (soft)
        tl_id = opA = opB = None
        stamp = int(time.time())
        try:
            tl_body = {
                "code": f"TL-G34-{stamp % 10**8}",
                "description": "g3_4 soft task list",
                "workCenterId": resolved["workCenterId"],
                "operations": [{"sequenceNumber": 1, "description": "g34 op A", "craftId": resolved["craftId"], "plannedHours": 1, "numberOfTechnicians": 1}],
            }
            tr = page.request.post(api + "/api/task-lists", headers=hdrs, data=json.dumps(tl_body))
            tl = tr.json()
            tl_id = tl.get("taskListId")
            opA = tl.get("operations", [{}])[0].get("taskOperationId")
            SI["tasklist_create"] = tr.status == 201
            rep = page.request.put(
                api + f"/api/task-lists/{tl_id}",
                headers=hdrs,
                data=json.dumps({"operations": [{"sequenceNumber": 1, "description": "g34 op B", "craftId": resolved["craftId"], "plannedHours": 2, "numberOfTechnicians": 1}]}),
            )
            updated = rep.json()
            shown = updated.get("operations") or []
            opB = shown[0].get("taskOperationId") if shown else None
            SI["tasklist_replace_ops_ok"] = rep.status == 200 and len(shown) == 1 and shown[0].get("description") == "g34 op B"
            if opA:
                DELETED_IDS.append(f"TaskListOperation:{opA}")
            dl = page.request.delete(api + f"/api/task-lists/{tl_id}", headers=hdrs)
            SI["tasklist_delete"] = dl.status == 200
            gd = page.request.get(api + f"/api/task-lists/{tl_id}", headers=hdrs)
            SI["tasklist_get_after_delete_404"] = gd.status == 404
            SI["tasklist_absent_from_list"] = absent_matching_code_list("/api/task-lists")
            if tl_id:
                DELETED_IDS.append(f"TaskList:{tl_id}")
        except Exception as e:
            print("S1S2_ERR", e)
            SI["tasklist_create"] = SI["tasklist_replace_ops_ok"] = SI["tasklist_delete"] = False
            SI["tasklist_get_after_delete_404"] = SI["tasklist_absent_from_list"] = False

        # S4: workOrder DELETE (soft — primary boundary)
        try:
            dl = page.request.delete(api + f"/api/work-orders/{wo_id}", headers=hdrs)
            SI["wo_delete"] = dl.status == 200
            gd = page.request.get(api + f"/api/work-orders/{wo_id}", headers=hdrs)
            SI["wo_get_after_delete_404"] = gd.status == 404
            if wo_id:
                DELETED_IDS.append(f"WorkOrder:{wo_id}")
        except Exception as e:
            print("S4_ERR", e)
            SI["wo_delete"] = SI["wo_get_after_delete_404"] = False

        # ---------- Headless: deleted items no longer appear on the UI ----------
        page.goto(base + "/work-orders", wait_until="domcontentloaded")
        try:
            page.locator("body").wait_for(timeout=10000)
            body = page.locator("body").inner_text()
            SI["wo_number_hidden"] = not wo_num or wo_num not in body
        except Exception:
            SI["wo_number_hidden"] = False
        snap(page, "g3_4_01_work_orders_after_delete")
        page.goto(base + "/task-lists", wait_until="domcontentloaded")
        try:
            page.locator("body").wait_for(timeout=10000)
            body = page.locator("body").inner_text()
            SI["task_code_hidden"] = not tl_id or f"TL-G34-{stamp % 10**8}" not in body
        except Exception:
            SI["task_code_hidden"] = False
        snap(page, "g3_4_02_task_lists_after_delete")

        print("DELETED_IDS", ",".join(DELETED_IDS))
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
            SI.get("ui_login_ok")
            and SI.get("api_token_ok")
            and SI.get("test_ids_resolved")
            and SI.get("host_wo_created")
            and SI.get("hard_op_create") and SI.get("hard_op_delete") and SI.get("hard_op_absent")
            and SI.get("hard_mat_create") and SI.get("hard_mat_delete") and SI.get("hard_mat_absent")
            and SI.get("hard_svc_create") and SI.get("hard_svc_delete") and SI.get("hard_svc_absent")
            and SI.get("hard_cmt_create") and SI.get("hard_cmt_delete") and SI.get("hard_cmt_absent")
            and SI.get("hard_cl_create") and SI.get("hard_cl_delete") and SI.get("hard_cl_absent")
            and SI.get("soft_labor_create") and SI.get("soft_labor_delete") and SI.get("soft_labor_absent")
            and SI.get("tasklist_create") and SI.get("tasklist_replace_ops_ok")
            and SI.get("tasklist_delete") and SI.get("tasklist_get_after_delete_404") and SI.get("tasklist_absent_from_list")
            and SI.get("wo_delete") and SI.get("wo_get_after_delete_404")
            and SI.get("wo_number_hidden") and SI.get("task_code_hidden")
            and not PAGE_ERRORS
        )
        print("G3_4_EXIT", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()