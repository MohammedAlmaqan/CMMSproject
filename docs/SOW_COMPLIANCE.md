# SOW Compliance Matrix — CommandPulse CMMS

| | |
|---|---|
| **SOW reference** | `SCOPE OF WORK (SOW) — Computerized Maintenance Management System (CMMS) Module: Maintenance Management`, Document Version 1.0, dated 05 July 2026 |
| **Audit date** | 2026-09-26 |
| **Auditor / author** | CommandPulse CMMS build |
| **Audited revision** | `3679aa8` (`docs: user manual + administrator guide (7.5)`) on `main` |
| **Method** | Every row was verified against source, the running API contract, verify scripts, or the finalization tracker. Absence claims name the search scope. |

## How to read this document

Clause splitting: the SOW was decomposed at the sentence level. A single paragraph with N requirements became N rows. This is deliberately granular so a Partial can pinpoint which sub-requirement is missing; it also means the percentage counts weight each sub-requirement equally. A reviewer who reads the SOW at paragraph level may see fewer Met clauses than this table reports, not more.

**Status legend**

| Status | Meaning |
|---|---|
| **Met** | Requirement is implemented and traceable to code, an endpoint, a verify script, or a delivered artifact. |
| **Partial** | Requirement is implemented for part of its stated scope; the gap is named in Notes. |
| **Deferred** | Agreed with the Client to be delivered post-go-live. Listed again in full under *Deferred post-go-live*. |
| **Excluded** | Removed from scope by explicit Client decision. Listed again in full under *Excluded by Client decision*. |
| **Not Met** | Requirement is absent, contradicted, or unevidenced in v1.0.0. The gap is named in Notes. |

Notes are populated only for `Partial` and `Not Met`. Every row carries an evidence pointer.

> **Clause-number correction.** The commissioning request referenced “§7.3 Acceptance criteria”. The SOW has no section 7. Acceptance criteria is **§6.4** (`6.4 Acceptance Criteria`, four criteria at lines 334–338 of the extracted text). All acceptance rows below are therefore filed under §6.4, and §6.4 is listed as the requested acceptance mapping.

---

## 1. Introduction

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §1.1 | SOW is a complete, clarification-free statement of deliverables and technical specifications | Met | `SCOPE OF WORK CMMS.docx` (v1.0, 05 July 2026); clause inventory reproduced in this document | — |
| §1.2 | Replace paper/spreadsheet maintenance with a web-based CMMS covering locations, equipment, notifications, work orders, costs, history, reporting | Met | `backend/src/index.ts:199-222` (24 API groups mounted); `app/src/App.tsx`; `docs/ARCHITECTURE.md` | — |
| §1.3 | Deliver a production-ready module spanning master data → work order closure → cost analysis | Partial | `docs/HANDOFF.md`; this matrix | Master data, work orders, and costs are delivered; PM planning UI and mobile clients are not (see §3.4.1, §3.9) |
| §1.3 | System must be web-based, support mobile browsers/tablets, integrate with an existing ERP | Partial | `app/index.html:5` (`viewport` meta only, 0 responsive breakpoints in `app/src`); §3.9, §3.10 rows | Mobile viewport is not responsive; ERP is deferred by Client decision |
| §1.3 | Data migration from legacy Excel/paper records | Not Met | §5.7 rows; `CMMS_FINALIZATION_TRACKER.md:344` | No migration tooling beyond 2-entity CSV import; no runbook, no dry-run report |
| §1.3 | User and administrator documentation | Met | `docs/USER_MANUAL.md`, `docs/ADMIN_GUIDE.md` | — |
| §1.3 | Training for key users and IT staff | Excluded | §6.3 row; `CMMS_FINALIZATION_TRACKER.md:301-306` Removed from scope by explicit Client decision (see Excluded table, X7). | — |
| §1.3 | Three (3) months of warranty support post go-live | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` Operational obligation starting at go-live; not a build deliverable. | — |

---

## 2. System Objectives and Overview

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §2.1 | Centralized asset register — multilevel location hierarchy with all technical attributes | Met | `backend/prisma/schema.prisma:52-103`; `GET /api/functional-locations/tree` | — |
| §2.1 | Structured work management — end-to-end identification, planning, scheduling, execution, completion, closure | Partial | `backend/src/routes/workOrders.ts:19-28` (transition map), `:489`; `backend/src/services/scheduler.ts` | Backend lifecycle is enforced; no scheduling board or planning UI exists |
| §2.1 | Proactive maintenance — time-based and meter-based PM with automatic generation | Partial | `backend/src/services/scheduler.ts:114` (Time only) | Meter-based and Combined strategies are modelled but never generated; see §3.4.2 |
| §2.1 | Cost transparency — planned and actual labour, material, and service cost by WO, equipment, location | Partial | `backend/src/utils/costs.ts:19-43`; `backend/src/routes/reports.ts:370-396` | WO-level planned/actual/variance are Met; cost is summarisable by cost center only, not by location/equipment/type |
| §2.1 | Full traceability — immutable log of every status change, field modification, and user action | Partial | `backend/src/middleware/audit.ts:17-39`; `backend/src/routes/auditLog.ts:86-117` | Log exists and is non-editable, but old/new values are populated at only a minority of write sites; see §3.6 |
| §2.1 | Out-of-the-box reports for backlog, compliance, MTBF, MTTR, cost per asset/location | Partial | `GET /api/reports/{backlog,pm-compliance,mtbf,mttr,cost-summary,downtime,material-consumption}` | Seven endpoints exist; “cost per asset/location” is not deliverable — see §3.7.1 |
| §2.2 | RBAC with at least the six predefined roles | Met | `backend/src/middleware/auth.ts:45-52` (`roleHierarchy`); `backend/src/utils/validation.ts:302-304` Hierarchy order: Administrator > Maintenance Planner > Maintenance Supervisor > Technician > Requester > ViewOnly. | — |
| §2.2 | Additional custom roles must be definable | Not Met | `backend/prisma/schema.prisma` (no `Role`/`Permission` entity); `backend/src/middleware/auth.ts:45-52` (hardcoded `Record<Role, number>`) | Role set is a compile-time constant; no entity, route, or UI |
| §2.2 | Administrator — full system configuration, user management, master data maintenance, bulk import/export | Partial | `GET /api/users`; `PUT /api/users/:id`; `PUT /api/users/:id/password`; `POST /api/equipment/import`; `POST /api/materials/import` | No user-create or user-delete API (§2.2 row below); bulk is CSV for 2 entities only |
| §2.2 | Administrator — user management (create and deactivate users) | Not Met | `backend/src/routes/users.ts` (only list/read/update/password) | `POST /api/users` and `DELETE /api/users/:id` do not exist; provisioning is manual SQL, documented at `docs/ADMIN_GUIDE.md` |
| §2.2 | Maintenance Planner — create/plan work orders, manage maintenance plans, assign resources, view all data | Partial | `POST /api/work-orders`; `backend/src/routes/maintenancePlans.ts:279-445` (plan CRUD) | Plan management is API-only; no PM plan or task list screen exists (§3.4.1 row) |
| §2.2 | Maintenance Supervisor — approve work orders, review completed work, run reports | Partial | `backend/src/routes/workOrders.ts:19-28`; `app/src/pages/ReportsPage.tsx` | Approval/review present; the Close permission is not enforced server-side — see §3.3.2 |
| §2.2 | Technician — view assigned WOs, record labour and materials, change status within allowed transitions, raise notifications | Partial | `POST /api/work-orders/:id/labor`; `POST /api/work-orders/:id/materials`; `PUT /api/work-orders/:id/status`; `POST /api/notifications` | “View assigned” is not enforced: `GET /api/work-orders` returns every work order regardless of assignment |
| §2.2 | Requester (Operator) — create notifications, view status of their requests | Not Met | `backend/src/routes/notifications.ts:120` (`const where: any = { isDeleted: false }`) | The notification list applies no `reportedByUserId` filter, so Requesters see all notifications; the Administration screen text claiming otherwise is wrong |
| §2.2 | View-Only / Auditor — read access to all master data, work orders, history, reports | Met | Read routes use `authorizeMinRole('ViewOnly')` or lower; `GET /api/audit-log` is Administrator-gated | — |

---

## 3. Functional Requirements

### 3.1 Master Data Management

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.1.1 | Multilevel tree with unlimited depth (Plant → Area → Unit → Subunit) | Met | `backend/prisma/schema.prisma:66-67` (self-relation `parentId`); `GET /api/functional-locations/tree` Depth is unbounded; the self-referencing FK is the only structural constraint. | — |
| §3.1.1 | Key fields: Location Code (unique, manual or auto), Description, Parent, Location Type, Operational Status, Installation Date, GPS Coordinates, Safety Critical flag | Met | `backend/prisma/schema.prisma:52-59` All eight named attributes are present as columns. | — |
| §3.1.1 | Drag-and-drop restructuring of the hierarchy | Not Met | `app/src/pages/LocationsPage.tsx` (no drag handlers); 0 HTML5 drag or `@dnd-kit`/`react-dnd` references in `app/package.json` or `app/src` | Move is available only by editing the parent field through `PUT /api/functional-locations/:id` |
| §3.1.1 | Display all equipment installed at a location | Met | `GET /api/functional-locations/:id/equipment`; `app/src/pages/LocationsPage.tsx` | — |
| §3.1.1 | Display open work orders and notification count for each node | Partial | `app/src/pages/LocationsPage.tsx` (per-node fetches) | Counts are assembled client-side from per-node requests; no aggregate tree endpoint, so large hierarchies fan out one request per node |
| §3.1.1 | Full audit trail on changes | Met | `backend/src/middleware/audit.ts:17-39` applied to all functional-location write routes | — |
| §3.1.2 | Each equipment record assigned to exactly one functional location (lowest level) | Partial | `backend/prisma/schema.prisma:78` (`functionalLocationId` non-nullable FK) | Cardinality of exactly one is enforced by the schema; “lowest level” is not validated |
| §3.1.2 | Key fields incl. unique code (manual or auto), Name, Description, Manufacturer, Model, Serial Number, Asset Tag, Equipment Class, Criticality, Installation Date, Warranty Expiry, Operational Status | Met | `backend/prisma/schema.prisma:75-88`; `backend/src/utils/validation.ts` `equipmentCreateSchema` | — |
| §3.1.2 | Technical parameters as extensible key-value attributes | Met | `backend/prisma/schema.prisma` (`technicalParameters Json` on `Equipment`) Stored as a JSON column; the SOW requires the capability, not a dedicated UI. | — |
| §3.1.2 | BOM: associate spare parts from the material catalog with an equipment | Partial | `backend/prisma/schema.prisma` (`EquipmentBOMMaterial`); `backend/src/routes/equipment.ts` (BOM read) | Read-only: `EquipmentBOMMaterial` appears in no route handler, so there is no create/update/delete endpoint for BOM lines |
| §3.1.2 | Documents: attach manuals, datasheets, certificates to equipment | Partial | `backend/src/routes/attachments.ts` (`entityType` accepts `Equipment`) | The generic attachment API accepts the entity, but no equipment screen exposes an upload control |
| §3.1.2 | Meter/reading points with unit of measure and reading history | Met | `backend/prisma/schema.prisma:103-134` (`EquipmentMeter`, `MeterReading`); `POST /api/equipment-meters/:id/readings` | — |
| §3.1.3 | Work centers with capacity (hours/day) and cost rate per hour | Met | `backend/prisma/schema.prisma:140-141` (`dailyCapacityHours`, `costRatePerHour`) | — |
| §3.1.3 | Assign crafts to each work center, each with its own hourly rate | Partial | `backend/prisma/schema.prisma:156-171` (`Craft.workCenterId`, `hourlyRate`) | Schema is correct, but `backend/src/routes/crafts.ts` exposes GET only — crafts cannot be created or edited through the API |
| §3.1.3 | Work centers and crafts used for scheduling and cost estimation | Partial | `backend/src/utils/costs.ts:19-23` | Used for labour cost estimation; no scheduling view consumes capacity |
| §3.1.4 | Failure codes as hierarchical code groups | Met | `backend/prisma/schema.prisma:202-212`; `GET /api/failure-codes/tree` | — |
| §3.1.4 | Cause codes as root-cause categories | Partial | `backend/prisma/schema.prisma:215-224` | The model exists but `CauseCode` appears in **no route file**, so there is no API to manage or select cause codes |
| §3.1.4 | Task lists: reusable sets of operation steps with estimated labour hours, craft, and required materials | Partial | `backend/prisma/schema.prisma` (`TaskList`, `TaskListOperation`); `GET /api/task-lists`, `POST /api/task-lists` | Operations with hours and craft are modelled; required materials are not |
| §3.1.4 | Task lists associated with an equipment class or specific equipment | Not Met | `backend/prisma/schema.prisma` (`TaskList` has no `equipmentClass` or `equipmentId` column) | Templates are global only; scoping by class or equipment does not exist |
| §3.1.4 | Work orders can copy operations from a task list | Partial | `backend/src/routes/maintenancePlans.ts:558-571`; `backend/src/services/scheduler.ts:173-186` | Reachable only through PM generation. `POST /api/work-orders` has no `taskListId` field, so a manually created WO cannot copy a task list |
| §3.1.5 | Material master: Material Code, Description, Unit of Measure, Standard Cost, Current Stock (optional) | Met | `backend/prisma/schema.prisma:175-179`; `backend/src/routes/materials.ts:390-398` | — |
| §3.1.5 | Link materials to equipment BOM | Partial | `backend/prisma/schema.prisma` (`EquipmentBOMMaterial`) | Read-only, as above |
| §3.1.5 | Link materials to work order operations | Partial | `backend/prisma/schema.prisma:361-364` (`WorkOrderMaterial` has `workOrderId` only) | Materials attach to the work order, not to an individual operation |

### 3.2 Notification Management

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.2.1 | Notification types M1 (Malfunction), M2 (Maintenance Request), M3 (Completion Confirmation) | Partial | `backend/src/utils/validation.ts:152` | M1/M2/M3 are accepted values; M3 is never generated — see next row |
| §3.2.1 | M3 autogenerated when a work order is completed | Not Met | `backend/src/services/scheduler.ts`; status handler `backend/src/routes/workOrders.ts:508-523` | The completion path only writes the audit entry and updates the work order; it never creates a notification. `Notification.type = 'M3'` is reachable only via a direct `POST /api/notifications` |
| §3.2.1 | Lifecycle statuses Open → In Process → Completed → (optional) Converted | Met | `backend/src/utils/validation.ts:154`; `backend/src/routes/notifications.ts:477-520` | — |
| §3.2.1 | Transition validity enforced (illegal transitions rejected) | Not Met | `backend/src/routes/notifications.ts:314` (`status` set from body with no transition map) | Contrast with work orders, which do enforce transitions at `backend/src/routes/workOrders.ts:19-28`; any status can be set directly |
| §3.2.2 | Any authenticated user can create a notification | Partial | `backend/src/routes/notifications.ts:222` (`authorizeMinRole('Requester')`, so a View-Only session receives 403) | View-Only/Auditor is a valid authenticated role per §2.2 but cannot create notifications |
| §3.2.2 | Key fields: auto number, Type, Priority, Functional Location / Equipment (mandatory selection), Reported By, Date & Time, Description, Breakdown indicator, Damages/observations | Partial | `backend/src/utils/validation.ts:156-164`; `backend/prisma/schema.prisma:272-327` | Functional location is mandatory; **equipment is optional**, so the “mandatory selection” pair is not enforced. There is no damages/observations field — see next row |
| §3.2.2 | Damages/observations field | Not Met | `backend/prisma/schema.prisma:272-327` (notification columns) | Only `description` exists; no dedicated damages or observations capture |
| §3.2.2 | Ability to attach photos directly from mobile device | Excluded | §3.9 mobile rows; `CMMS_FINALIZATION_TRACKER.md:301-306` The server-side attachment API still accepts photo uploads; only the in-app mobile capture flow is out of scope. | — |
| §3.2.2 | Notification can be converted into a Work Order | Met | `POST /api/notifications/:id/convert`; `backend/src/routes/notifications.ts:477-520` | — |
| §3.2.2 | Multiple notifications aggregated into one work order | Not Met | `backend/src/utils/validation.ts:177-180` (`convertNotificationSchema` accepts only `workCenterId`, `supervisorUserId`) | The schema has no `notificationIds` array, so aggregation is not representable. `WorkOrderNotifLink` is a many-to-many table, but nothing writes more than one link per conversion |
| §3.2.2 | If breakdown is Yes, the resulting WO is marked Emergency automatically | Met | `backend/src/routes/notifications.ts:503` (`type: notification.breakdownFlag ? 'EM' : 'CM'`) | — |
| §3.2.3 | A notification can be linked to one or more work orders | Met | `backend/prisma/schema.prisma:329-337` (`WorkOrderNotifLink` composite PK) | — |
| §3.2.3 | System shows the relationship and allows navigation between notification and work order | Partial | `app/src/pages/NotificationDetailPage.tsx:197-222` (links out to work orders); `app/src/pages/WorkOrderDetailPage.tsx` (no notification list rendered) | Navigation works notification → work order; the reverse direction is not presented |
| §3.2.3 | After work order completion, notification status can be set to Completed manually or automatically | Not Met | `backend/src/routes/workOrders.ts:508-523` | Completion does not touch `Notification`; the status can only be changed by a separate `PUT /api/notifications/:id` call, which satisfies neither “automatically” nor the documented workflow |

### 3.3 Work Order Management

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.3.1 | Work order types CM, PM, PdM, EM, CAL | Met | `backend/src/utils/validation.ts:17` | — |
| §3.3.1 | Emergency automatically sets highest priority | Not Met | `backend/src/routes/notifications.ts:504` (copies the notification's priority verbatim) | No code path raises priority to High for `EM` work orders |
| §3.3.1 | Calibration work orders with pass/fail tracking | Not Met | `backend/src/utils/validation.ts:17` (`'CAL'` is an accepted type); no result/pass-fail column in `backend/prisma/schema.prisma` | The type exists as a label; calibration result capture does not |
| §3.3.2 | Mandatory status flow with the specified allowed transitions | Met | `backend/src/utils/validation.ts:4-13` (status enum); `backend/src/routes/workOrders.ts:19-28` (transition map) The transition graph matches the SOW status table row for row. | — |
| §3.3.2 | System must enforce state transitions based on user roles (e.g. only Supervisor may Close) | Met | `backend/src/routes/workOrders.ts:505-512` (`requireSupervisorForClose`, applied after `validate(workOrderStatusBodySchema)`); `backend/src/middleware/auth.ts:54` (`authorizeMinRole`); `backend/tests/routes/workOrders.test.ts` (Technician 403, Supervisor 200, Administrator 200) | The status endpoint keeps the Technician floor for every transition, and `Completed → Closed` additionally requires Maintenance Supervisor or Administrator. Enforced as a per-transition middleware that reuses `authorizeMinRole`, so the role hierarchy remains defined in one place. The UI's role-based hiding of Close is no longer the only control. |
| §3.3.3 | WO Number auto-generated with a configurable prefix | Partial | `backend/src/utils/sequence.ts:20-25` (reads `SystemConfig`) | Generation is wired to `SystemConfig`, but there is no API or UI to change the prefix; `app/src/pages/AdministrationPage.tsx` shows a hardcoded prefix |
| §3.3.3 | Header fields: Type, Priority, Status, Equipment/Functional Location (mandatory), Description, Reported By, Responsible Work Center, Assigned Supervisor, planned & actual start/finish, Breakdown flag, Safety critical flag | Partial | `backend/prisma/schema.prisma:286-327` | No `reportedByUserId` column on `WorkOrder` — the required header field is missing. Functional location is mandatory; equipment is optional |
| §3.3.3 | Each work order must contain at least one operation | Not Met | `backend/src/utils/validation.ts:26-40` (`workOrderCreateSchema` has no `operations` array) | A work order can be created with zero operations and none is required at status change |
| §3.3.3 | Per operation: sequence, description, craft, planned hours, number of technicians, actual hours, status (Pending/In Progress/Completed) | Partial | `backend/prisma/schema.prisma:342-348`; `backend/src/utils/validation.ts:48-57` | Columns exist, but the update handler `backend/src/routes/workOrderOperations.ts:218-229` strips `actualHours` and `status` from the request body, so a technician cannot record actual hours or operation status |
| §3.3.3 | Rich-text long-text field for job instructions, safety notes, completion remarks | Not Met | `backend/prisma/schema.prisma:342-348` (plain `String` columns only) | No rich-text or long-text field exists |
| §3.3.4 | Planned materials: select from catalog, specify planned quantity, system calculates planned material cost | Met | `backend/src/routes/workOrders.ts` `materials` sub-resource; `backend/src/utils/costs.ts:27` | — |
| §3.3.4 | Actual consumption recorded against each planned material line | Met | `backend/prisma/schema.prisma:361-364` (`actualQuantity`, `unitCost`) | — |
| §3.3.4 | Ad-hoc material can be added as a new line | Met | `POST /api/work-orders/:id/materials` accepts any `materialId` | — |
| §3.3.4 | Material issue entries must deduct from stock if inventory is managed inside the CMMS | Not Met | `currentStock` is written **only** in `backend/src/routes/materials.ts:188,206,398,487`; no work-order route touches it | Issuing material to a work order never reduces `Material.currentStock` |
| §3.3.4 | Vendor must implement a material reservation concept | Not Met | `backend/prisma/schema.prisma:366` (`reservedQuantity` column) | The column exists but is never written or read by any route — there is no reservation behaviour |
| §3.3.5 | Log time against a work order operation | Met | `backend/prisma/schema.prisma:374` (`LaborEntry.operationId`); `POST /api/work-orders/:id/labor` | — |
| §3.3.5 | Actual labour cost = hours × craft rate (from work center master) | Partial | `backend/src/utils/costs.ts:23` | Computed from `Craft.hourlyRate`; `WorkCenter.costRatePerHour` (`schema.prisma:141`) is never used in cost calculation |
| §3.3.5 | Multiple technicians can log time against the same operation | Met | `LaborEntry` rows keyed by `operationId`; repeated POSTs accumulate | — |
| §3.3.5 | Technician identification via login; entries stamped with user and timestamp | Partial | `backend/src/routes/labor.ts:142-152` | The API trusts a client-supplied `userId` instead of the authenticated session user, so labour time can be attributed to another technician. `createdBy`/`createdDate` are stamped from the session |
| §3.3.6 | External service entries (contractor name, service description, cost, invoice reference) | Met | `backend/prisma/schema.prisma:389-398` (`ExternalServiceCost`); `POST /api/work-orders/:id/services` | — |
| §3.3.6 | Additional miscellaneous costs (travel, permits) as line items | Not Met | `backend/prisma/schema.prisma:389-398` | `ExternalServiceCost` has no service-type or category discriminator, so travel and permits cannot be distinguished from contractor services |
| §3.3.7 | Optionally attach one or more checklist templates to each work order | Met | `POST /api/work-orders/:id/checklists` (`backend/src/routes/safetyChecklists.ts:260`); `SafetyChecklistTemplate` + `WorkOrderChecklist` | — |
| §3.3.7 | Checklists are simple forms with steps, each with Yes/No/NA and a comment field | Met | `backend/src/utils/validation.ts:126-127`; `SafetyChecklistItem` response columns | — |
| §3.3.7 | WO cannot be set to "In Progress" unless all mandatory safety checklists are acknowledged (sign-off via electronic signature) | Partial | `backend/src/routes/workOrders.ts:531-556` (gate on `newStatus === 'In Progress'`); `backend/src/middleware/audit.ts:9` (`action: 'Blocked'`); `backend/tests/routes/workOrders.test.ts` (409 while incomplete, 200 once Completed, 200 with no mandatory checklist) | The transition is now refused with **409** until every checklist on the work order whose template is `isMandatory` reads `Completed`, and the refusal is recorded as an `AuditLogEntry` with `action: 'Blocked'`. **Residual gap:** the gate enforces checklist *status*, not individual item responses. `WorkOrderChecklistItem.response` is a non-nullable `String` and the attach route pre-fills every item with `'NA'`, so an unanswered item is not representable and item-level acknowledgement cannot be evaluated. Electronic signature remains excluded per §3.9 and §4.5. Tracked as `v1.1-5` in the tracker. |
| §3.3.7 | Electronic signature on checklist sign-off | Excluded | §3.9 and §4.5 rows; `CMMS_FINALIZATION_TRACKER.md:301-306` `WorkOrderChecklist.signedBy` (`backend/prisma/schema.prisma:430-431`) captures only a typed name, not a signature. | — |
| §3.3.8 | Any file type may be attached up to 10 MB per file | Partial | `backend/src/routes/attachments.ts:35-44` (10 MB limit enforced); `:17-25` (MIME allowlist of 7 types) | The 10 MB cap is met, but “any file type” is not — the allowlist rejects unlisted MIME types |
| §3.3.8 | Threaded comments visible in the work order detail view, posted by any participant | Not Met | `backend/prisma/schema.prisma:534-543` (`Comment` has no `parentId`) | Comments are a flat list; there is no threading |
| §3.3.8 | Complete audit log recording user, timestamp, action, and old/new value for field modifications | Partial | `backend/src/middleware/audit.ts:17-39`; `backend/prisma/schema.prisma:505-518` | Columns are correct, but the helper is called with `oldValue`/`newValue` at only a small minority of write sites; most audit entries record the action and entity without the field diff |

### 3.4 Preventive Maintenance

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.4.1 | Plan fields: Plan Code, Description, Equipment/Functional Location (one or a list), Work Center, Task List template, Priority, associated Notifications | Partial | `backend/prisma/schema.prisma:459-494`; `backend/src/routes/maintenancePlans.ts:279-445` | Present: code, description, single `equipmentId`, `workCenterId`, `taskListId`. Missing: `priority`, and any notification association. “Or a list” of equipment is not supported — only one nullable `equipmentId` |
| §3.4.1 | Strategy: time-based, meter-based, or a combination, whichever is due first | Partial | `backend/src/utils/validation.ts:286`; `backend/src/services/scheduler.ts:114` (`strategyType: 'Time'` only) | All three values are accepted, but the scheduler evaluates **only** `Time`. `Meter` and `Combined` plans are silently never generated |
| §3.4.2 | Time-based: interval in days/weeks/months with fixed start date and optional end date | Partial | `backend/prisma/schema.prisma:467-472`; `backend/src/services/scheduler.ts:113-114` | Interval and start are honoured; `endDate` is stored but never evaluated, so expired plans keep generating work orders |
| §3.4.2 | Meter-based: meter associated with the equipment, interval value, support for multiple meters per plan | Partial | `backend/prisma/schema.prisma:486-494` (`MaintenancePlanMeter`); `GET /api/maintenance-plans/:id/meters` | Data model and read endpoint exist; there is no write endpoint to attach meters to a plan, and the scheduler never reads meter readings |
| §3.4.2 | Call Horizon: user-defined days/units ahead of due date during which generation occurs | Not Met | `backend/prisma/schema.prisma:469-470` (`callHorizonValue`, `callHorizonUnit`) | Both columns exist and have no write path in the plan API, and `callHorizon` appears **nowhere** in `backend/src/services/scheduler.ts` — generation happens on the due date only |
| §3.4.2 | Seasonal/exclusion blackout dates where generation is suppressed or shifted | Not Met | `backend/prisma/schema.prisma` (no blackout/exclusion model or column) | Not representable in the schema |
| §3.4.3 | Background scheduler runs daily (configurable) and evaluates all active plans | Met | `backend/src/services/scheduler.ts:226` (cron, default `0 2 * * *`); `backend/src/index.ts:243-244` Runs in-process behind a singleton advisory lock rather than as a separate process; see the §5.1 row. | — |
| §3.4.3 | When due date (factoring call horizon) is reached, create a Work Order populated from the plan's task list | Partial | `backend/src/services/scheduler.ts:137-192`; `:173-186` (operations copied from task list) | Work order and operations are created from the plan's task list, but the call-horizon factor does not exist |
| §3.4.3 | Created work order status Draft or Planned, configurable | Not Met | `backend/src/services/scheduler.ts:160` (hardcoded `status: 'Draft'`) | Also hardcoded at `backend/src/routes/maintenancePlans.ts:546`; the per-plan status choice required by the SOW is not configurable |
| §3.4.3 | If a plan has an associated notification, create it and link them | Not Met | `backend/prisma/schema.prisma:459-494` (no notification relation on `MaintenancePlan`) | The association cannot exist, so this is unreachable |
| §3.4.3 | Generation must be idempotent (no duplicate WO if the due date stays inside the horizon) | Partial | `backend/prisma/schema.prisma:502-503` (`@@unique([planId, periodStartDate])` on `GenerationLog`); `backend/src/services/scheduler.ts:190-192` | Unique constraint plus a pre-insert check. Note the manual `POST /api/maintenance-plans/:id/generate-wo` route does not share this guard |

### 3.5 Cost Management

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.5.1 | Planned Cost = planned labour hours × craft rate + planned materials × standard cost + planned services + other planned | Partial | `backend/src/utils/costs.ts:19-37` (planned labour `:19`, planned materials `:27`, totals `:36-37`) | Planned labour is computed as `plannedHours × numberOfTechnicians × craft.hourlyRate`, so the implementation multiplies by technician count where the SOW formula specifies only hours × craft rate. The SOW does not state whether planned hours are per technician or per operation, so this is a reading difference rather than a proven error, but it changes the planned total and must be confirmed with the Client |
| §3.5.1 | Actual Cost = actual labour hours × craft rate + actual material cost + actual service invoices + other actuals | Met | `backend/src/utils/costs.ts:31-45` | — |
| §3.5.1 | Variance (Actual – Planned) must be shown in reports | Met | `backend/src/routes/reports.ts:395`; `app/src/pages/ReportsPage.tsx:370-383` | — |
| §3.5.2 | All costs tagged with a Cost Center and optionally an internal order, on the work order header | Met | `backend/prisma/schema.prisma:301-302`; `GET /api/reports/cost-summary` filters on non-empty `costCenterCode` | — |
| §3.5.2 | Support cost splitting when a work order covers multiple cost centers (percentage allocation) | Partial | `backend/prisma/schema.prisma:496-503` (`CostSplit`) | The model exists and is returned by the work order read (`backend/src/routes/workOrders.ts:177`), but no route creates or updates splits, there is no UI, and no validation enforces that allocations total 100% |
| §3.5.3 | Costs summarisable by functional location hierarchy (rollup to any level) | Not Met | `backend/src/routes/reports.ts:370-396` (groups by `costCenterCode` only) | No location rollup in any cost report |
| §3.5.3 | Costs summarisable by equipment | Not Met | `backend/src/routes/reports.ts:370-396` | No cost grouping by equipment |
| §3.5.3 | Costs summarisable by work order type | Not Met | `backend/src/routes/reports.ts:370-396` | No cost grouping by type |
| §3.5.3 | Costs summarisable by time period (year, quarter, month) | Partial | `app/src/pages/DashboardPage.tsx:214-234` (month bucketing on the dashboard) | Month bucketing exists on the dashboard cost widget only; no year/quarter breakdown and no period filter on the cost report |
| §3.5.3 | Costs summarisable by cost center | Met | `backend/src/routes/reports.ts:381-396` | — |

### 3.6 History, Logs & Audit

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.6 | Work Order History: complete snapshot of the work order at each major status change, stored as immutable records | Not Met | `backend/prisma/schema.prisma` — no `WorkOrderSnapshot`/`WorkOrderHistory` model; no `snapshot` column | Only field-level audit rows are written (`backend/src/routes/workOrders.ts:526`). There is no per-status-change snapshot of the whole work order, so the SOW's “history” view of a work order cannot be reconstructed from the database alone |
| §3.6 | Equipment Maintenance History: chronological list of all work orders on an equipment with date, type, cost, downtime | Partial | `app/src/pages/EquipmentDetailPage.tsx:45` | Assembled client-side from work orders, capped at 200 rows; there is no dedicated history endpoint, so the chronology is truncated rather than complete |
| §3.6 | General change log: every create/update/delete on master data and transactions, including IP address and user | Partial | `backend/src/middleware/audit.ts:17-39`; `backend/src/routes/auditLog.ts:86-117` | IP address is captured on login but audit rows record user and timestamp; coverage of write sites is not exhaustive and old/new values are frequently absent |
| §3.6 | The log must be searchable and non-editable | Met | `GET /api/audit-log` supports filtering (`backend/src/routes/auditLog.ts:86-117`); only a GET route exists on `AuditLogEntry` Only a GET route exists on the audit model, so entries cannot be modified through the API. | — |

### 3.7 Reporting & Dashboards

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.7.1 | All reports filterable by date range, location, equipment, and work center | Not Met | `backend/src/routes/reports.ts:41, 199, 290, 370, 446, 532` all use `async (_req: Request, ...)`; only `:126` (`pm-compliance`) reads query parameters | Six of the seven reports ignore the request object entirely, so none of them can filter by date, location, equipment, or work center |
| §3.7.1 | All reports exportable to PDF and Excel (raw data) | Not Met | `app/src/pages/ReportsPage.tsx:185-201` (CSV only, built client-side); no `pdf`/`exceljs`/`xlsx`/`jspdf`/`pdfkit` in `backend/package.json` or `app/package.json` | CSV is offered, but the SOW names PDF and Excel and neither exists |
| §3.7.1 | Work Order Backlog — count and total estimated hours by status, priority, and work center | Partial | `backend/src/routes/reports.ts:41-78` (`groupBy` status at `:43`, hours at `:50`) | Counts by status and hours are returned; priority and work center are not grouped |
| §3.7.1 | PM Compliance — (Completed PMs / Scheduled PMs) × 100 for a given period | Partial | `backend/src/routes/reports.ts:126-176` | The ratio is computed and the period filter works, but the denominator is “PM work orders created in the month”, not the count of PMs *scheduled* for that period, so a backlogged plan is not counted against compliance |
| §3.7.1 | MTBF per equipment, based on breakdown work orders | Met | `backend/src/routes/reports.ts:199-245` (groups by `equipmentId` over breakdown work orders) | — |
| §3.7.1 | MTTR — average repair duration, per equipment/location | Partial | `backend/src/routes/reports.ts:290-324` (groups by `equipmentId`) | Equipment is delivered; the location dimension required by the SOW is absent |
| §3.7.1 | Maintenance Cost Summary — actual vs. **budget** by cost center/location | Partial | `backend/src/routes/reports.ts:370-396` | Actual-vs-planned variance is delivered by cost center. There is no budget data anywhere in the schema, and the location dimension is absent |
| §3.7.1 | Equipment Downtime Report — total downtime hours per equipment from emergency/corrective durations | Met | `backend/src/routes/reports.ts:446-488` | — |
| §3.7.1 | Material Consumption Report — by material, work order, and equipment | Partial | `backend/src/routes/reports.ts:532-542` (`groupBy` on material) | By material only; per work order and per equipment breakdowns are absent |
| §3.7.2 | Open Work Orders by Status (pie/bar) | Met | `app/src/pages/DashboardPage.tsx:180-218`; `GET /api/dashboard` | — |
| §3.7.2 | Overdue Work Orders (counter) | Met | `app/src/pages/DashboardPage.tsx:135-141`; `backend/src/routes/dashboard.ts:122-128` | — |
| §3.7.2 | Backlog Hours by Work Center | Not Met | `app/src/pages/DashboardPage.tsx:101-113` | The widget counts work orders per work center; it does not show backlog **hours** |
| §3.7.2 | PM Compliance Gauge | Met | `app/src/pages/DashboardPage.tsx:346-382` | — |
| §3.7.2 | Top 10 Highest-Cost Equipment | Not Met | `app/src/pages/DashboardPage.tsx`; `backend/src/routes/dashboard.ts` | No cost-ranked equipment widget on either side |
| §3.7.2 | Notifications Awaiting Conversion | Partial | `backend/src/routes/dashboard.ts:140-142` (returns `openNotifications`) | The API supplies the figure, but no dashboard widget renders it |
| §3.7.2 | Dashboard data is realtime and widgets offer drilldown | Not Met | `app/src/pages/DashboardPage.tsx` (no polling, no `setInterval` refresh); drilldowns navigate to unfiltered list routes such as `app/src/pages/WorkOrdersPage.tsx` | Data is fetched once on mount, so it is not realtime, and drilldown lands on the full list rather than a filtered subset |
| §3.7.3 | Ad-hoc query builder, or a documented view/stored-procedure layer for the Client's BI tool | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` Optional-but-desirable in the SOW; deferred with the reporting backlog (D2). | — |

### 3.8 Alerts & Notifications (System-Generated)

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.8 | In-app alert: work order assignment to technician/supervisor | Not Met | `WO_Assigned` appears only in documentation comments (`backend/src/routes/auditLog.ts` doc block) and test fixtures; no alert-emitting call site | Assignment writes no `SystemAlert` |
| §3.8 | In-app alert: overdue work orders (not completed by due date) | Not Met | `WO_Overdue` exists only as an alert-type string in the codebase and is never passed to the alert service; no scheduler path emits it | The daily scheduler (`backend/src/services/scheduler.ts:226`) does not evaluate overdue work orders |
| §3.8 | In-app alert: PM generation failure | Partial | `backend/src/routes/maintenancePlans.ts:578` (success alert on manual generation) | A success alert is created for manual generation; no failure alert is emitted by any path, and the daily scheduler creates no alerts at all |
| §3.8 | In-app alert: new high-priority notification raised | Not Met | `backend/src/routes/notifications.ts:231` (creates the notification only) | No `SystemAlert` row is written when a High-priority notification is raised |
| §3.8 | Email delivery of alerts | Not Met | No `nodemailer`/`smtp` dependency in `backend/package.json`; no mail transport or queue in `backend/src`; `docs/ARCHITECTURE.md` records email as not implemented | Alerts are in-app database rows only; there is no mail path at all |
| §3.8 | Configuration by role/user to opt in or out of specific alert types | Not Met | `backend/prisma/schema.prisma` (no alert-preference entity) | No preference model, route, or UI; every in-app alert is mandatory |

### 3.9 Mobile Access Requirements

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.9 | Responsive web interface that functions on tablets and smartphones without installing software | Not Met | 0 Tailwind breakpoint classes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) and 0 `@media` rules across `app/src`; `app/index.html:5` sets the viewport meta only; sidebar navigation is fixed-width with no mobile drawer | The viewport tag alone does not produce a responsive layout. On a phone the fixed sidebar and multi-column tables overflow horizontally, so the interface is not usable on a small screen |
| §3.9 | A dedicated mobile app is optional but may be proposed | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` Not proposed; the repository contains no native mobile project. | — |
| §3.9 | Camera access to attach photos to notifications/work orders | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` Removed by explicit Client decision (X2). | — |
| §3.9 | Offline capability for labour entry, synced when connectivity returns | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306`; no service worker, IndexedDB, or sync queue in `app/src` Removed by explicit Client decision (X3). | — |
| §3.9 | Digital signature capture for checklists and work completion | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` Removed by explicit Client decision (X4). | — |
| §3.9 | Mobile: responsive PWA or native | Excluded | `app/index.html` (no `<link rel="manifest">`, no service worker registration) The PWA option is removed along with the mobile-specific features (X2-X4). | — |

### 3.10 Integration Points

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §3.10 | ERP integration: import/update Equipment and Functional Location master from ERP | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` No ERP client, connector, or inbound sync job exists in `backend/src`. | — |
| §3.10 | Export actual material consumption for financial posting | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` `GET /api/reports/material-consumption` returns the data, but no posting-oriented export contract exists. | — |
| §3.10 | Export labour hours to HR/payroll system | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` | — |
| §3.10 | Published, well-documented REST API for all entities | Met | `docs/openapi.json` (OpenAPI 3.0.0, 71 paths / 114 operations, `bearerAuth`); Swagger UI at `/api-docs`; `docs/API_REFERENCE.md` Every mounted router carries `@openapi` JSDoc annotations. | — |
| §3.10 | API must use JSON | Met | `backend/src/index.ts` (Express JSON middleware); all payloads validated with Zod in `backend/src/utils/validation.ts` | — |
| §3.10 | API must use OAuth2 authentication | Not Met | `backend/src/middleware/auth.ts:21` (`Bearer` token check); `backend/src/index.ts:132` (`bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`) | Authentication is first-party JWT login, not OAuth2. There is no authorization-code, client-credentials, or token endpoint, and no third-party identity provider integration |
| §3.10 | API must include bulk endpoints for master data | Partial | `POST /api/equipment/import`; `POST /api/materials/import` (CSV multipart) | Two entities only, CSV rather than a JSON array, and functional locations have no bulk path. Functional Location is named explicitly in §5.4 |

---

## 4. Non-Functional Requirements

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §4.1 | Support up to 200 concurrent users, screen load < 2 s, transactional save < 1 s | Deferred | `docs/ARCHITECTURE.md:263-264`; `scripts/k6/smoke.js:30-51` (50 VUs, 2 min ramp / 5 min steady / 1 min down) The 50-VU smoke run passed both configured thresholds: p(95) 36.19 ms against a 2000 ms budget, `http_req_failed` 0.04% (15/37,265 requests). | — |
| §4.1 | Database handles 500,000 work orders and 100,000 equipment records without degradation | Deferred | `CMMS_FINALIZATION_TRACKER.md:301-306` (500K-WO volume deferred) No volume test has been run; the P2028 pool-exhaustion defect (D4) would surface first at this scale. | — |
| §4.1 | Architecture allows horizontal scaling with stateless web and API tiers | Partial | API holds no session state (JWT in `backend/src/middleware/auth.ts:21`); `backend/src/services/scheduler.ts` singleton lock | The API tier is stateless and scales horizontally, but the in-process scheduler is a single-instance design, so tier scaling and scheduler correctness must be reconciled before multi-node deployment |
| §4.2 | All communication encrypted via HTTPS (TLS 1.2+) | Partial | `docs/ADMIN_GUIDE.md:580` (IIS/HTTPS instructions); no TLS termination in `backend/src` (plain HTTP listener) | TLS is delegated to IIS in the documented Windows deployment, which satisfies the design intent, but the HTTPS configuration has been **documented and not executed**, so it is unverified |
| §4.2 | Passwords hashed with bcrypt/PBKDF2 | Met | `backend/src/routes/auth.ts:2` (`BCRYPT_ROUNDS = 12`); `bcrypt.hash`/`bcrypt.compare` in the login path | — |
| §4.2 | Account lockout after 5 failed attempts | Met | `backend/src/routes/auth.ts:11-13` (5/15/30-minute escalating lockouts); `verify_g3_2.py` lockout assertions | — |
| §4.2 | Session timeout after 30 minutes of inactivity | Partial | `app/src/hooks/useIdleTimeout.ts` (30-minute browser timeout, 60-second warning) | The timeout is **client-side only**. The server issues an 8-hour JWT (`backend/src/routes/auth.ts`) with no idle-expiry claim, so an unattended session stays valid on the server and a stolen token is not revoked |
| §4.2 | Row-level data access control if multisite/cost-centre separation is required (optional, TBD) | Not Met | `backend/src/middleware/auth.ts:45-52` (role hierarchy only) | The SOW marks this optional and to be determined, so it is not a v1.0.0 gap to close; it is recorded here because the requirement is unanswered and there is no per-user or per-cost-centre scoping on any list route |
| §4.3 | Database supports full, differential, and transaction log backups | Partial | `scripts/backup.bat` (`pg_dump --format=custom`, full only) | Full backups are automated; there is no differential or transaction-log (WAL archiving) configuration, so point-in-time recovery is not available |
| §4.3 | RPO < 1 hour | Not Met | `scripts/backup.bat` (daily schedule); `docs/ADMIN_GUIDE.md:441-446` | A daily schedule gives an RPO of up to 24 hours, three times the objective. Recovery is also untested against a mid-day failure |
| §4.3 | RTO < 4 hours | Partial | `docs/ADMIN_GUIDE.md` (measured 5.35 s full restore) | Restore is measured for the database only; total RTO including host rebuild and attachment store is not measured |
| §4.3 | Soft delete: all deletions logical via IsDeleted, except audit log purging with configurable retention (default 7 years) | Partial | 18 of 35 models in `backend/prisma/schema.prisma` carry `isDeleted`; `backend/prisma/seed.ts:161` (7-year value) | Child, join, and configuration tables (for example `WorkOrderMaterial`, `LaborEntry`, `CostSplit`, `EquipmentBOMMaterial`) have no `isDeleted` and are hard-deleted. No audit purge job or retention setting exists — the 7-year default is a seed comment only |
| §4.4 | Modern UX, keyboard-navigable, WCAG 2.1 Level AA wherever possible | Partial | `docs/WCAG-AUDIT.md` (committed audit with findings and severities); global command palette in `app/src`; skip link in `app/src/App.tsx` | Keyboard navigation and focus management are largely in place, but the audit records unresolved findings, and the fixed sidebar and colour-coded statuses noted there remain open |
| §4.4 | Multilanguage support, English required, Arabic desirable, text externalized for translation | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306`; no i18n library in `app/package.json` The English-required baseline is met by the single-language UI. | — |
| §4.5 | Data model for equipment and maintenance records should align with ISO 14224 | Not Met | `ISO 14224` returns **no match** across all tracked `.md`, `.ts`, `.tsx`, and `.prisma` files | No alignment assessment, mapping table, or documentation exists. The SOW wording is “should align”, so this is a documentation gap rather than a functional defect, but it is currently unevidenced |
| §4.5 | Work order approvals support 21 CFR Part 11 compliant electronic signatures (user ID, password reauthentication, signature meaning) | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` (e-signatures removed) There is no password reauthentication or signature-meaning capture anywhere in the codebase. | — |
| §4.6 | 99.5% availability during business hours 07:00–19:00, Sunday–Thursday | Not Met | No uptime monitoring, alerting, or availability measurement in the repository; `backend/src/index.ts` health routes report process liveness only (`/api/health`, `/api/health/scheduler`) | Availability has never been measured. `GET /api/health/scheduler` reports `PM health degraded — last run 25h ago` on an idle system, which indicates the staleness threshold is tuned for a daily cron rather than for availability monitoring |
| §4.6 | Planned maintenance windows agreed in advance | Deferred | No change-management or maintenance-window tooling; `docs/ADMIN_GUIDE.md` An operational process rather than a system feature; to be agreed at go-live. | — |

---

## 5. Technical Architecture & Database Design

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §5.1 | Presentation tier: single-page application (Angular, React, or Vue) consuming REST APIs | Met | `app/` (React 18 + TypeScript + Vite); all data access via `/api` calls | — |
| §5.1 | Application/API tier: stateless backend implementing business logic | Met | `backend/` (Node.js + Express); JWT bearer, no server-side session store | — |
| §5.1 | Data tier: relational database (PostgreSQL or SQL Server) with full audit support | Met | `backend/prisma/schema.prisma` (PostgreSQL); audit middleware on write routes | — |
| §5.1 | Background service: **separate process** for PM scheduling, email notifications, report generation | Partial | `backend/src/services/scheduler.ts` started in-process from `backend/src/index.ts:243-244`; singleton lock at `scheduler.ts:38-56` | Scheduling runs inside the API process guarded by an advisory lock rather than as a separate service, so a multi-node deployment would need the lock to remain correct. Email notification and report generation services do not exist at all |
| §5.2 | Backend: Node.js 20 LTS or later | Met | `backend/package.json`; `.github/workflows/ci.yml:44,92` (`node-version: 24`) | — |
| §5.2 | Frontend: React 18+ with TypeScript | Met | `app/package.json` (React 18, TypeScript 5) | — |
| §5.2 | Database: PostgreSQL 15+ | Met | `backend/prisma/schema.prisma` (`provider = "postgresql"`); `.github/workflows/ci.yml:20-21` (`postgres:15`) | — |
| §5.2 | Mobile: responsive PWA or native | Excluded | §3.9 rows; `app/index.html` (no manifest, no service worker) The PWA option is removed along with the mobile-specific features (X2-X4). | — |
| §5.2 | Reporting: embedded reporting engine (JasperReports, DevExpress) or SQL views for external BI | Not Met | No reporting engine in `backend/package.json`; no `CREATE VIEW` or `CREATE MATERIALIZED VIEW` in `backend/prisma/migrations/**` | Reports are hand-written TypeScript aggregations. No SQL view layer exists for the Client's BI tool, which also blocks the deferred §3.7.3 ad-hoc reporting item |
| §5.2 | Source control: Git with full commit history delivered | Met | `git log --oneline` (134 commits on `main`) | — |
| §5.3 | Normalized schema including at minimum the 18 named tables | Met | `backend/prisma/schema.prisma` — all 18 SOW-named tables exist: FunctionalLocation, Equipment, EquipmentMeter, WorkCenter, Craft, Notification, WorkOrder, WorkOrderOperation, WorkOrderMaterial, LaborEntry, ExternalServiceCost, MaintenancePlan, MaintenancePlanMeter, TaskList/TaskListOperation, SafetyChecklistTemplate/WorkOrderChecklist, AuditLog | — |
| §5.3 | All tables carry CreatedBy, CreatedDate, ModifiedBy, ModifiedDate, IsDeleted | Partial | 18 of 35 models carry `isDeleted` | Child and join tables (`WorkOrderMaterial`, `LaborEntry`, `CostSplit`, `EquipmentBOMMaterial`, `WorkOrderNotifLink`, `WorkOrderChecklistItem`) and configuration tables (`SystemConfig`, `SequenceCounter`, `SchedulerRun`, `RefreshToken`) lack `isDeleted` and are hard-deleted, contradicting §4.3 |
| §5.3 | Audited tables must have corresponding AuditLog entries | Partial | `backend/src/middleware/audit.ts:17-39` wired to master-data and work-order routes | Not every write route registers the audit helper, so some transaction and child-row changes are unlogged |
| §5.3 | Foreign keys defined for all listed relationships | Partial | `backend/prisma/schema.prisma:459-494` | `MaintenancePlan.functionalLocationId` is a plain scalar with **no** `FunctionalLocation` relation and no foreign key constraint |
| §5.4 | RESTful API for all CRUD operations on master data and work orders | Partial | `docs/openapi.json` (71 paths / 114 operations) | Read, create, and update are broadly complete; deletes are absent on several entities and there is no `POST /api/users`. Master-data child collections (BOM lines, cost splits, plan meters) are read-only |
| §5.4 | Standard HTTP methods with JSON payloads | Met | `backend/src/routes/*.ts`; Zod validation in `backend/src/utils/validation.ts` | — |
| §5.4 | API versioning via URL path (e.g. `/api/v1/`) | Not Met | `backend/src/index.ts:199-222` mounts all groups unversioned (`/api/...`); `docs/openapi.json` has no version segment | No version prefix exists on any route, so the path shown in the SOW is not implemented |
| §5.4 | Bulk endpoints for Equipment and Functional Locations (`POST /api/v1/equipment/bulk` with JSON array) | Partial | `POST /api/equipment/import`; `POST /api/materials/import` | CSV multipart rather than a JSON array, Equipment only — **Functional Locations, named explicitly in the SOW, has no bulk endpoint** |
| §5.4 | OData or similar filtering/pagination for GET collections ($filter, $top, $skip) | Partial | `backend/src/routes/*.ts` conventional `skip`/`take` query parameters | Pagination exists, but there is no OData or comparable query grammar: no `$filter`, `$top`, `$skip`, `$orderby`, or `$select` parsing, so external consumers cannot issue the documented queries |
| §5.4 | Detailed Swagger/OpenAPI 3.0 documentation delivered | Met | `docs/openapi.json` (`openapi: '3.0.0'`); `backend/src/index.ts:123`; Swagger UI at `/api-docs`; `docs/API_REFERENCE.md` 71 paths and 114 operations across all 24 routers. | — |
| §5.5 | Authentication via OAuth2 / OpenID Connect, with Azure AD or on-premises AD integration | Not Met | `backend/src/routes/auth.ts:115` (`POST /api/auth/login` with local credentials); no OAuth2/OIDC library in `backend/package.json` | No OAuth2 or OIDC flow, no authorization-code or client-credentials grant, and no directory integration. This is a documented SOW deviation, not an implementation gap |
| §5.5 | JWT access tokens with refresh token rotation | Partial | `RefreshToken` model in `backend/prisma/schema.prisma`; `backend/src/middleware/auth.ts:21` | `backend/src/routes/auth.ts` exposes only `POST /login` and `GET /me` — there is no refresh or logout endpoint, and the string `refreshToken` appears **nowhere** in `backend/src`, so tokens are never rotated or revoked |
| §5.5 | All API calls must include a valid Bearer token | Partial | `backend/src/middleware/auth.ts:21`; public routes in `backend/src/index.ts:199-222` | Authentication is enforced on business routes. The public surface is `/api/health`, `/api/health/scheduler`, `/api/auth/login`, `/api-docs`, and `/api-docs.json`; `/api/health/scheduler` exposes plan counts and last-run state unauthenticated |
| §5.5 | Authorization enforced on both frontend routes and API endpoints using RBAC | Partial | API: `authorizeMinRole(...)` on every protected route. Frontend: `app/src/App.tsx` (all 10 navigation items render for every role) | The API enforces roles correctly, so this is defence in depth rather than a security hole. The frontend renders modules a role cannot use, which produces 403 pages instead of hiding the capability |
| §5.6 | Delivered as Docker containers (compose file) for all components | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306`; no `Dockerfile` or `docker-compose.yml` in the repository Removed by explicit Client decision (X5). | — |
| §5.6 | Kubernetes manifests if the customer requires orchestration (optional) | Excluded | No manifests in the repository; `CMMS_FINALIZATION_TRACKER.md:301-306` Optional in the SOW and removed by explicit Client decision (X6). | — |
| §5.6 | Database connection string configurable via environment variables | Met | `backend/src/utils/config.ts`; `backend/prisma/schema.prisma` (`env("DATABASE_URL")`); `.env.example` | — |
| §5.6 | Environment-specific configuration via `.env` files or config maps | Met | `backend/.env.example`; `app/.env.example`; `INSTALLATION_GUIDE.md` | — |
| §5.7 | Import tools to validate and load legacy Excel/CSV data | Partial | `POST /api/equipment/import`; `POST /api/materials/import` (`backend/src/routes/materials.ts:140-210`); `scripts/seed-demo.bat` | Equipment and materials only, CSV only. Open work orders and functional locations — the other two named datasets — have no importer |
| §5.7 | A data migration runbook and a dry-run report before final cutover | Not Met | No migration runbook or dry-run report in `docs/` | Not produced; the Client's digitized legacy data has not been loaded |

---

## 6. Project Deliverables

| SOW § | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| §6.1 | Full source code of all components in a Git repository | Met | `backend/`, `app/`, `scripts/`, `docs/` on `main`; database schema and migrations under `backend/prisma/` | — |
| §6.1 | Compiled/deployable artifacts and CI/CD pipeline scripts | Partial | `.github/workflows/ci.yml` (build, migrate, seed, test on PostgreSQL 15 + Node 24) | CI is in place and green. Deployable container artifacts are excluded by Client decision, so delivery is a source-and-pipeline handoff rather than an image handoff |
| §6.1 | Database creation and seed data scripts | Met | `backend/prisma/migrations/` (5 migrations); `backend/prisma/seed.ts`; `scripts/seed-demo.bat` | — |
| §6.2 | System Architecture Document with components and deployment diagram | Met | `docs/ARCHITECTURE.md` | — |
| §6.2 | Database Schema Document — ER diagram and data dictionary | Met | `docs/ER_DIAGRAM.md`; `docs/DATA_DICTIONARY.md` | — |
| §6.2 | API Documentation — Swagger/OpenAPI and integration guide | Met | `docs/openapi.json`; `/api-docs`; `docs/API_REFERENCE.md` (114 operations documented) | — |
| §6.2 | User Manual — step-by-step instructions for each role, with screenshots | Partial | `docs/USER_MANUAL.md` (role-by-role walkthroughs, 19 screenshot references) | The prose and structure are delivered, but `screenshots/` is listed in `.gitignore:14` and **0 screenshot files are tracked by Git**, so every image reference is broken in a fresh clone. The deliverable cannot be reviewed as delivered |
| §6.2 | Administrator Guide — configuration, backup/restore, user management, PM scheduler setup | Met | `docs/ADMIN_GUIDE.md` The user-management section documents the manual SQL provisioning gap recorded at §2.2. | — |
| §6.2 | Installation & Deployment Guide — prerequisites, deployment steps, environment variables | Partial | `INSTALLATION_GUIDE.md:203-218` (configuration tables); `backend/.env.example`; `app/.env.example` | The configuration tables document 5 of the 9 environment variables the application reads. `CORS_ORIGINS`, `LOG_LEVEL`, `BIND_HOST`, and `PM_SCHEDULER_CRON` are undocumented there; `BIND_HOST` and `PM_SCHEDULER_CRON` have non-obvious production implications and are only covered in `docs/ADMIN_GUIDE.md` |
| §6.3 | Training: Administrator/IT (1 day), Core Users (2 days), End Users (1 day) | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` Removed by explicit Client decision (X7). | — |
| §6.3 | Training materials (slides, handouts) and recorded sessions | Excluded | `CMMS_FINALIZATION_TRACKER.md:301-306` Removed by explicit Client decision (X7). | — |

### 6.4 Acceptance Criteria

| SOW § | Criterion | Status | Evidence | Notes |
|---|---|---|---|---|
| §6.4 | All functional requirements listed in §3 are implemented and pass UAT scripts | Not Met | This matrix (§3.1-§3.10) | Of the 126 §3 requirements, 35 are Not Met and 42 are Partial; no §3 subsection is fully satisfied. No UAT script pack exists - `scripts/verify/` holds implementation-verification scripts, not business UAT |
| §6.4 | All standard reports produce correct data verified against manual calculation | Not Met | `scripts/verify/verify_g5.py` (asserts HTTP 200 and response shape only) | No report has been reconciled against a manual calculation, and six of the seven reports cannot be filtered at all (§3.7.1) |
| §6.4 | Performance test shows response times within §4.1 limits under simulated load of 100 concurrent users | Not Met | `scripts/k6/smoke.js:30-51` (50 VUs); `docs/ARCHITECTURE.md:263-264` | The highest tested load is 50 VUs. The 100-VU acceptance run has not been performed, and the separate 200-VU §4.1 test is deferred |
| §6.4 | No open Critical or Major defects at go-live | Not Met | This matrix; `docs/WCAG-AUDIT.md` | The two authorization defects that were release-blocking at first pass (§3.3.7 safety-checklist gating, §3.3.2 role enforcement on Close) are remediated; the WCAG audit carries unresolved findings, and §3.3.5 labour attribution, §3.2.1/§3.2.3 notification generation and the absent UAT pack remain open |
| §6.4 | Data migration accuracy > 99.9% for master data; historical work order statuses correctly mapped | Not Met | §5.7 rows; `backend/prisma/seed.ts` (demo data only) | No client data has been migrated, so no accuracy figure exists |
| §6.4 | Documentation delivered and training completed | Partial | `docs/` (6 documents, all delivered); `CMMS_FINALIZATION_TRACKER.md:301-306` | Documentation is delivered, subject to the two §6.2 gaps (untracked screenshots, incomplete env table). Training is excluded by Client decision, so this criterion cannot be fully satisfied as written |

---

## Deferred post-go-live

Agreed with the Client for delivery after go-live. Each item is **not** a v1.0.0 blocker.

> **How this table relates to the matrix.** The eight items below are *deferred work items*. They are not one-to-one with the matrix rows marked `Deferred`: a matrix row is marked `Deferred` only when the **entire** clause is out of v1.0.0 scope. Several items below are partial remedies for clauses that are therefore marked `Partial` or `Not Met` — for example D7 (one missing foreign key) leaves §5.3 `Partial`, and D5 (missing cause-code wiring) leaves §3.1.4 `Partial`. The clause-level status always reflects what the client can use today, not when the fix is scheduled.

| # | Item | SOW § | Evidence / tracker reference |
|---|---|---|---|
| D1 | ERP integration — inbound Equipment and Functional Location master sync | §3.10, §1.3 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| D2 | Ad-hoc reporting — query builder or documented view/stored-procedure layer for the Client's BI tool | §3.7.3 | `CMMS_FINALIZATION_TRACKER.md:301-306`; blocked behind the missing SQL view layer (§5.2) |
| D3 | 200-user load test | §4.1 | `CMMS_FINALIZATION_TRACKER.md:301-306`; `docs/ARCHITECTURE.md:264` |
| D4 | PostgreSQL connection-pool sizing and `max_connections` tuning to clear P2028 | §4.1 | `docs/ARCHITECTURE.md:263` (15 of 140 logins returned HTTP 500 under 50-VU load) |
| D5 | CauseCode and FailureCode wiring into notifications and work orders | §3.1.4 | `CMMS_FINALIZATION_TRACKER.md:301-306`; `CauseCode` has no route in `backend/src/routes/` |
| D6 | `Float` → `Decimal` migration for all monetary and quantity columns | §5.3 | `CMMS_FINALIZATION_TRACKER.md:301-306`; floating-point cost columns in `backend/prisma/schema.prisma` |
| D7 | `MaintenancePlan.functionalLocationId` foreign-key relation | §5.3 | `CMMS_FINALIZATION_TRACKER.md:301-306`; `backend/prisma/schema.prisma:459-494` |
| D8 | Database-enforced enums to replace free-text status and type columns | §5.3 | `CMMS_FINALIZATION_TRACKER.md:301-306`; status columns are `String` in `backend/prisma/schema.prisma` and validated only in `backend/src/utils/validation.ts` |

---

## Excluded by Client decision

Removed from scope by explicit Client agreement. These are recorded as `Excluded`, **not** as failures, and should not be re-litigated at acceptance.

> **How this table relates to the matrix.** The seven items below are *scope exclusions*, and they resolve the 15 matrix rows marked `Excluded` — one exclusion can settle several clauses. X4 (electronic signatures), for example, closes §3.3.7 checklist sign-off, §3.9 signature capture, and §4.5 21 CFR Part 11 at the same time.

| # | Item | SOW § | Evidence / tracker reference |
|---|---|---|---|
| X1 | Multilanguage / i18n support, including Arabic and externalized text resources | §4.4 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| X2 | Mobile camera capture for photos | §3.9 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| X3 | Offline labour entry with background sync | §3.9 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| X4 | Digital / electronic signature capture on checklists and work completion | §3.9, §3.3.7, §4.5 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| X5 | Docker container delivery | §5.6, §6.1 | `CMMS_FINALIZATION_TRACKER.md:301-306` |
| X6 | Kubernetes orchestration manifests | §5.6 | `CMMS_FINALIZATION_TRACKER.md:301-306` (optional in the SOW) |
| X7 | Training delivery and training materials | §6.3, §1.3 | `CMMS_FINALIZATION_TRACKER.md:301-306` |

---

## Known limitations in v1.0.0 and v1.1 remediation

Every limitation acknowledged in the B.5 documentation, plus the gaps this audit surfaced, mapped to a v1.1 remediation row. No item here is deferred or excluded by Client agreement; all are in-scope shortfalls.

| # | Limitation | SOW § | Evidence | v1.1 remediation row |
|---|---|---|---|---|
| L1 | No create/edit/delete screen for maintenance plans; plan management is API-only | §3.4.1, §2.2 | `backend/src/routes/maintenancePlans.ts:279-445`; no plan form in `app/src/pages/` | **V1.1-PM-UI** — maintenance plan list, create, and edit screens with strategy, interval, call horizon, and blackout fields |
| L2 | No create/edit screen for task lists or their operations | §3.1.4 | `GET`/`POST /api/task-lists` exist; no task list page in `app/src/pages/` | **V1.1-PM-UI** — task list template editor with operation sequence, craft, planned hours, and required materials |
| L3 | No notification-create form; reporters must use the API | §3.2.2 | `POST /api/notifications` (`backend/src/routes/notifications.ts:222`); no create control in `app/src/pages/NotificationsPage.tsx` | **V1.1-NOTIF-UI** — notification intake form with location, equipment, priority, breakdown flag, and photo attachment |
| L4 | No manual scheduler-run button; triggering requires an Administrator API call | §3.4.3 | `POST /api/maintenance-plans/run-scheduler`; no control in `app/src/pages/` | **V1.1-PM-UI** — scheduler status card with last run, next run, stale warning, and manual-run action for Administrators |
| L5 | No user-create or user-delete API; onboarding is manual SQL | §2.2 | `backend/src/routes/users.ts` (list/read/update/password only) | **V1.1-USERS** — `POST /api/users`, `DELETE /api/users/:id`, plus a Users administration screen with role assignment and deactivation |
| L6 | Administration screen states “Requester: view own requests”, but the API returns every notification to everyone | §2.2 | `backend/src/routes/notifications.ts:120`; incorrect text at `app/src/pages/AdministrationPage.tsx:291` | **V1.1-RBAC** — correct the role matrix text **and** add a reporter-scoping filter so Requesters actually see only their own notifications |
| L7 | Frontend renders all 10 modules for every role, so restricted users land on 403 pages | §5.5 | `app/src/App.tsx` (unfiltered navigation) | **V1.1-RBAC** — filter navigation and routes by the authenticated user's role from the same role hierarchy the API uses |
| L8 | Idle timeout is browser-only; the 8-hour JWT stays valid server-side and is never revoked | §4.2 | `app/src/hooks/useIdleTimeout.ts`; `backend/src/routes/auth.ts:115`; no refresh or logout route | **V1.1-SEC** — server-side idle expiry, refresh-token rotation, and logout that revokes the presented token |
| L9 | Labour time accepts a client-supplied `userId` instead of the session user | §3.3.5 | `backend/src/routes/labor.ts:142-152` | **V1.1-SEC** — derive the technician from the authenticated session and ignore client-supplied identity |
| L10 | ~~The Close transition is gated at Technician server-side~~ — **RESOLVED** in `206e1de`; `Completed → Closed` now requires Maintenance Supervisor or Administrator | §3.3.2 | `backend/src/routes/workOrders.ts:505-512` (`requireSupervisorForClose`) | Closed. Per-transition role policy added, reusing `authorizeMinRole`; Technician floor unchanged for the other transitions. Tests: Technician 403, Supervisor 200, Administrator 200 |
| L11 | ~~Work orders can be moved to In Progress with unacknowledged mandatory safety checklists~~ — **PARTIALLY RESOLVED** in `e049238`; the transition is refused with 409 until mandatory checklists read `Completed` | §3.3.7 | `backend/src/routes/workOrders.ts:531-556`; residual gap in `WorkOrderChecklistItem.response` | Partially closed. Status-level gating and a `Blocked` audit row are in place. Item-level acknowledgement is not evaluable while `response` is non-nullable and pre-filled with `NA`; see `v1.1-5` |
| L12 | Meter-based and Combined PM strategies never generate work orders; `endDate` and `callHorizon` are ignored | §3.4.2, §3.4.3 | `backend/src/services/scheduler.ts:114`; `callHorizon` absent from the scheduler | **V1.1-PM-ENGINE** — evaluate meter and combined strategies, honour call horizon and end date, and add the blackout/exclusion calendar |
| L13 | Generated work order status is hardcoded to Draft | §3.4.3 | `backend/src/services/scheduler.ts:160`; `backend/src/routes/maintenancePlans.ts:546` | **V1.1-PM-ENGINE** — per-plan Draft/Planned choice and plan-to-notification creation with linking |
| L14 | Six of the seven standard reports accept no filters and cannot export PDF or Excel | §3.7.1 | `backend/src/routes/reports.ts:41,199,290,370,446,532` (`async (_req)`); `app/src/pages/ReportsPage.tsx:185-201` | **V1.1-REPORTING** — date/location/equipment/work-center filters on all reports, PDF and Excel export, and a documented SQL view layer for BI |
| L15 | No report or dashboard is reconciled against a manual calculation | §6.4 | `scripts/verify/verify_g5.py` (HTTP 200 assertions only) | **V1.1-UAT** — a UAT pack that recomputes each report independently and compares totals |
| L16 | Equipment BOM lines, cost splits, and plan meters are read-only | §3.1.2, §3.5.2, §3.4.2 | `EquipmentBOMMaterial`, `CostSplit`, `MaintenancePlanMeter` appear in no write route | **V1.1-MASTER** — write endpoints and screens for BOM lines, cost splits with 100% validation, and plan meters |
| L17 | Cause codes have no API at all | §3.1.4 | `CauseCode` absent from `backend/src/routes/` | **D5** (deferred) — cause code management and wiring into notifications and work orders |
| L18 | Monetary and quantity columns are floating point | §5.3 | `backend/prisma/schema.prisma` (`Float` cost/stock fields) | **D6** (deferred) — migrate to `Decimal` |
| L19 | Status and type columns are free text, validated only in application code | §5.3 | `backend/prisma/schema.prisma` (`String` status columns); `backend/src/utils/validation.ts` | **D8** (deferred) — database-level enums or check constraints |
| L20 | No API versioning; all routes are mounted unversioned | §5.4 | `backend/src/index.ts:199-222`; `docs/openapi.json` has no version segment | **V1.1-API** — introduce `/api/v1` with the current routes preserved behind a compatibility layer |
| L21 | No bulk endpoint for functional locations; bulk is CSV-only for two entities | §3.10, §5.4 | `POST /api/equipment/import`, `POST /api/materials/import` | **V1.1-API** — JSON-array bulk endpoints for equipment, functional locations, and materials |
| L22 | No OData or comparable query grammar on GET collections | §5.4 | Conventional `skip`/`take` only in `backend/src/routes/*.ts` | **V1.1-API** — `$filter`, `$top`, `$skip`, `$orderby`, `$select` support |
| L23 | Authentication is first-party JWT, not OAuth2 / OpenID Connect | §3.10, §5.5 | `backend/src/routes/auth.ts:115`; `backend/src/index.ts:132` (`type: 'http'`) | **V1.1-SEC** — OAuth2/OIDC authorization-code and client-credentials flows with Azure AD integration, behind a feature flag |
| L24 | No system-generated alerts, no email transport, and no alert opt-out preferences | §3.8, §5.1 | No mail dependency in `backend/package.json`; no alert-preference entity; no `SystemAlert` writes on assignment, overdue, or high-priority notification | **V1.1-ALERTS** — alert emission for the four required events, an email worker, and per-user alert preferences |
| L25 | No work order snapshot at status changes | §3.6 | No snapshot model in `backend/prisma/schema.prisma`; only field-level audit rows | **V1.1-AUDIT** — immutable work order snapshot per major status change, exposed through an equipment maintenance history endpoint |
| L26 | Audit log old/new values are populated at only a minority of write sites | §3.3.8, §3.6 | `backend/src/middleware/audit.ts:17-39`; callers that omit the value arguments | **V1.1-AUDIT** — enforce old/new capture at the middleware boundary and cover every write route |
| L27 | Child, join, and configuration tables are hard-deleted, so no audit trail survives | §4.3, §5.3 | 18 of 35 models carry `isDeleted` | **V1.1-DATA** — soft delete across all transactional tables and a configurable audit purge job with a 7-year default |
| L28 | Backups are full-only and daily, so the 1-hour RPO is not met | §4.3 | `scripts/backup.bat` (`pg_dump` full, daily); `docs/ADMIN_GUIDE.md:441-446` | **V1.1-OPS** — WAL archiving and differential backups, plus a documented point-in-time recovery drill against the 1-hour RPO |
| L29 | Availability has never been measured; the scheduler health probe reports a spurious degraded state | §4.6 | No uptime monitoring in the repository; `/api/health/scheduler` reports degraded after 25h idle | **V1.1-OPS** — uptime and error-rate monitoring against the 99.5% business-hours target, with a scheduler staleness threshold matched to the configured cron |
| L30 | No TLS termination is verified; HTTPS is documented for IIS but was never executed | §4.2 | `docs/ADMIN_GUIDE.md:580`; `backend/src` listens on plain HTTP | **V1.1-OPS** — execute and evidence the IIS HTTPS configuration, including TLS 1.2+ and HSTS |
| L31 | Installation guide documents only 5 of the 9 environment variables the app reads | §6.2 | `INSTALLATION_GUIDE.md:203-218` (4 backend + 1 frontend row); `backend/.env.example` (8 vars); `app/.env.example` (1 var) | **V1.1-DOCS** — document `CORS_ORIGINS`, `LOG_LEVEL`, `BIND_HOST`, and `PM_SCHEDULER_CRON` in the installation guide, including the IIS `BIND_HOST=127.0.0.1` guidance and the scheduler cron, and cross-reference the admin guide |
| L32 | User Manual screenshots are gitignored, so every image reference is broken in a fresh clone | §6.2 | `.gitignore:14` (`screenshots/`); `git ls-files screenshots` returns 0 files | **V1.1-DOCS** — commit the screenshot set, or replace the images with checked-in relative paths and regenerate the 19 references |
| L33 | P2028 connection-pool exhaustion returns HTTP 500 on login under concurrency | §4.1 | `docs/ARCHITECTURE.md:263` (15 of 140 logins); threshold-only monitoring did not catch it | **D4** (deferred) — Prisma pool sizing and PostgreSQL `max_connections` tuning, with a login-specific error-rate threshold |
| L34 | No legacy data import for open work orders or functional locations, and no migration runbook or dry-run report | §5.7, §6.4 | `POST /api/equipment/import` and `/api/materials/import` only | **V1.1-MIGRATION** — importers for the Client's three named datasets, a migration runbook, and a dry-run report evidencing > 99.9% accuracy |
| L35 | No ISO 14224 alignment assessment exists | §4.5 | `ISO 14224` returns no match in any tracked file | **V1.1-DOCS** — an ISO 14224 field-mapping assessment for equipment and maintenance records |
| L36 | 17 models lack `isDeleted`, and several documented relationships have no foreign key | §4.3, §5.3 | `backend/prisma/schema.prisma:459-494`; `MaintenancePlan.functionalLocationId` has no relation | **L19**/**D7** (deferred) — complete the standard-column and foreign-key set across the schema |

---

## Summary

| Status | All clauses | §3 functional only (126 rows) |
|---|---|---|
| Met | 64 | 38 |
| Partial | 75 | 42 |
| Not Met | 52 | 35 |
| Deferred | 8 | 4 |
| Excluded | 15 | 7 |
| **Total rows** | **214** | **126** |

Fully Met across 64 of 214 clauses (30%). The §3 functional requirements — the core of the SOW — are 38 Met, 42 Partial, and 35 Not Met out of 126, so **no §3 subsection is fully satisfied end to end**.

**Requirements that block go-live** (Not Met, no Client deferral or exclusion):

1. **§3.3.5 — labour time is attributed from a client-supplied user ID**, so recorded labour cost and traceability can be falsified from the browser.
2. **§3.2.1 / §3.2.3 — M3 notifications are never generated and notification status never follows work order completion**, breaking the lifecycle the SOW specifies.
3. **§6.4 — no UAT pack exists and no report has been reconciled against a manual calculation**, so the acceptance criteria cannot currently be evidenced.

**Remediated since the first pass of this matrix** (no longer blocking): §3.3.2 role enforcement on Close is now `Met`; §3.3.7 is now `Partial` with the residual item-response gap tracked as `v1.1-5`. See the B.6 Blocker Remediation section of `CMMS_FINALIZATION_TRACKER.md`.

**Honest overall position.** The platform is a strong, well-documented foundation: 35 normalised tables, 114 documented API operations, six working role tiers, enforced work order state transitions, working time-based PM generation, idempotent generation, and seven report endpoints. What is missing is concentrated in three areas: **workflow surfaces that were specified but never built** (PM planning UI, notification intake, alert generation, user provisioning), **write paths for models that were designed but never exposed** (BOM, cost splits, plan meters, cause codes), and **mobile, alerts, and non-functional controls** (responsive layout, email, OAuth2, API versioning, availability measurement). Two of the three blocking items above are authorization defects rather than missing features, and both are small, well-localised changes in `backend/src/routes/workOrders.ts` and `backend/src/routes/labor.ts`.
