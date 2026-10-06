# Owner Action Sheet — go-live decisions

Seven items need your answer. Thirteen more I will close without you. Nothing else is waiting.

**Table 1 — Owner decisions**

| # | What it is (plain English) | What's missing | Your answer needed | Your recommendation | Risk if deferred |
|---|---|---|---|---|---|
| 1 | Recording why equipment failed, against the work order, from a maintained code list | The failure-code list is built and fully manageable. Nothing records a failure against a work order — the work order has no failure field, so the list cannot be used | Build the recording before go-live, or accept that failures cannot be recorded at v1.0.0 | **Build it before go-live.** The list already exists, so this is one field on the work order plus a capture control, and it is the input to the MTBF and MTTR reports you already have | MTBF and MTTR stay uncomputable from recorded data, and a maintained code list sits unused |
| 2 | Splitting one work order's cost across several cost centres by percentage | The allocation is correct and fully tested. No screen exposes it, so it can only be done through the API | Confirm the deferral already recorded to v1.1, or pull it into v1.0.0 | **Confirm the v1.1 deferral.** You decided this on 2026-10-04 as not on the critical path, and the arithmetic is already proven against an independent calculation | Low. Allocation is available by API, nobody is blocked, and no report depends on a screen for it |
| 3 | The go-live criterion that every functional requirement is both built and covered by the UAT scripts | The UAT pack is delivered and reconciles every report against the source data. Two requirements are partial — items 1 and 2 above | Accept go-live with those two partial, or hold go-live until both close | **Accept go-live with the two partials once item 1 is answered.** No functional requirement is absent, both residuals are narrow, and the UAT pack already proves the reporting layer | The acceptance criterion stays formally open and sign-off has no clean basis |
| 4 | The go-live criterion that no critical or major defects are outstanding | The two authorization defects found at first pass are fixed and verified. The accessibility audit leaves four remaining items judged acceptable: command-palette focus trap, some unnamed controls on the work-order detail page, chart-axis contrast, and title-attribute-only accessible names on icon buttons | Confirm the defect position is acceptable for go-live | **Confirm it.** Nothing open prevents a user completing maintenance work; the four accessibility items are named, pass a scripted check, and are carried as v1.1 work | The criterion stays open on a judgement call only you can make, while the remediation is already done or scheduled |
| 5 | Loading your existing equipment, materials, locations and open work orders before go-live | Importers exist for equipment and materials, CSV only. Open work orders and locations have none, and there is no runbook or trial-run report — because no one has supplied the data | Supply the legacy dataset and accept a trial-run report as the accuracy evidence, or go live with history left behind | **Supply the dataset and accept the trial-run report.** It is your data and the only route to the accuracy figure; the tooling is not complete without something to load | Go-live starts with no maintenance history, so reliability and cost reporting begin from zero and prior-year comparison is impossible |
| 6 | Backing up only what changed since the last full backup | Full backups and continuous transaction-log archiving are both built and rehearsed, giving a measured five-minute worst-case loss. Differential backup is not built | Accept transaction-log recovery as the mechanism, or commission differential backup | **Accept it and do not build it.** Recovery granularity is already five minutes — finer than any differential interval — and an incremental chain adds retention coupling without reducing loss | Low if accepted. If it is neither built nor formally waived, the requirement stays open at acceptance |
| 7 | Restricting what each user can see to their own site or cost centre | No list route narrows records to a user's own cost centre or site, so anyone with access sees everything. The requirement is written as optional and to be determined, so it was never answered | Confirm you do not need it for a single site, or require it | **Confirm you do not need it.** You recorded a single-site plant when deciding roles, and per-user scoping would touch every list route and every report | An unanswered requirement stays open at acceptance. Deferring the decision costs more than deferring the work, because scoping later touches every read path |

**Table 2 — Engineering tasks I will close on my own**

| Task | One-line summary | When |
|---|---|---|
| Write-path load measurement | Add a work order create/update scenario to the 200-user run and report save latency separately from reads | next pass |
| Session security | Server-side idle expiry, refresh rotation, logout that revokes the presented token, and technician identity taken from the session rather than the request | next pass |
| Frontend access control | Filter navigation and routes by role so restricted users never land on a forbidden page | next pass |
| Total recovery time | Measure host rebuild and the attachment store, not only the database restore | next pass |
| Test hygiene | Enforce the ban on swallowed teardown errors and clear the 68 existing sites | next pass |
| Documentation accuracy sweep | Re-verify every clause attribution, note and frozen count against source — five are already stale (see note 8) | next pass |
| Planning and intake screens | Maintenance-plan list, create and edit; an on-demand scheduler run; a notification intake form so reporters stop using the API | v1.1 |
| Master-data editing and bulk access | Screens for the bill-of-material, cost-split and meter write endpoints that already exist; edit/remove for plan meter thresholds; JSON bulk endpoints for locations; a query grammar for filtered collections | v1.1 |
| Email and alert preferences | The four in-app alerts already fire; add email delivery of them and per-user opt-out | v1.1 |
| Audit completeness | Per-column old/new values on the six remaining update handlers, enforced at the middleware boundary, plus the configurable 7-year audit purge job | v1.1 |
| Migration tooling | Importers for open work orders and functional locations, a runbook, and a trial-run harness | v1.1, once the dataset arrives |
| Accessibility polish | Focus trap for the command palette, named controls on the work order detail page, axis contrast on charts | v1.1 |
| Database constraints | Enforced status and type values at the database rather than only in the API schema | v1.1 |

\* Not on this sheet because not go-live-blocking: the 61 orphan fixture task lists and the orphaned audit rows on WorkOrder/WorkOrderOperation/MaintenancePlan remain held on the owner's authorisation. Decision can wait until after go-live.

---

**Notes**

1. Matrix row 8, §3.1.4. `backend/src/routes/failureCodes.ts` is mounted with full CRUD and a hierarchy route; `backend/prisma/schema.prisma` gives `WorkOrder` a `causeCodeId` and no failure column.
2. Matrix row 175, §3.5.2. `backend/tests/routes/workOrderCostSplits.test.ts` (18 cases); deferral recorded in `docs/CMMS_FINALIZATION_TRACKER.md` as v1.1-9, owner, 2026-10-04.
3. Matrix row 331, §6.4. `scripts/verify/verify_r7.py`. Cited by row number because the matrix labels its acceptance criteria inconsistently between sections.
4. Matrix row 334, §6.4. `docs/WCAG-AUDIT.md` ("Known remaining gaps") and `scripts/verify/verify_g3_5.py`.
5. Matrix rows 40 and 307 (§1.3, §5.7) and row 335 (§6.4). Importers exist only at `POST /api/equipment/import` and `POST /api/materials/import`.
6. Matrix row 261, §4.3. `scripts/pitr-drill.ps1`, rehearsed 2026-10-05: 1-second commit-to-archive lag, `archive_timeout=300`.
7. Matrix row 260, §4.2. `docs/DECISION_REGISTER.md` D-18 records the single-site plant.
8. Building Table 2 from source rather than from the limitations register found five entries describing work that has since been delivered: no task-list screen (the page exists), no meter or combined PM strategy (all three are evaluated, with end date and call horizon honoured), hard-coded generated status (per-plan Draft or Planned, honoured), read-only bill-of-material lines and cost splits (both have write endpoints), and no system-generated alerts (all four fire in-app). Correcting those is the sweep above, not new work.