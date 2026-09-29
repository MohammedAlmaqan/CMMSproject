# Data Dictionary — CMMS v1.0.0

**Source of truth:** [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
**Database:** PostgreSQL
**Scope:** all 38 models, grouped into 7 domains, one row per model. Verified against the
schema on 2026-09-25; re-verified against 38 models on 2026-09-29 (additions: `TaskListMaterial`, `MaintenancePlanTarget`, `WorkOrderSnapshot`).
**Companion:** [`ER_DIAGRAM.md`](./ER_DIAGRAM.md)

## Conventions

These hold across the tables below. "Audit set" means `createdBy`, `createdDate`,
`modifiedBy`, `modifiedDate`.

| Convention | Detail |
| --- | --- |
| Table naming | Model name == table name. The schema declares no `@@map`. |
| Primary keys | `String @id @default(uuid())`, named `<model>Id`. Three exceptions noted per table. |
| Business codes | Plain `String` columns, **not** `@unique` in Prisma. Uniqueness is enforced by partial unique indexes created in migrations, scoped to `WHERE "isDeleted" = false`. A soft-deleted row releases its code for reuse. |
| Soft delete | `isDeleted Boolean @default(false)`. 34 of 38 tables. Queries must filter on it. The four exceptions are deliberate and documented in their rows: `RefreshToken` (revoked, not deleted), `AuditLogEntry` (immutable append-only, the purge-with-retention target of §4.3), `WorkOrderSnapshot` (immutable history) and `SequenceCounter` (numeric semaphore). |
| `modifiedDate` | `DateTime @updatedAt` on soft-deleted tables, so the application must set the value. `Attachment` deviates — see its row. |
| `createdBy` / `modifiedBy` | Free-text `String @default("system")`, holding a user id or the literal `system`. **Not** a foreign key, so a deleted or bad actor id will not be rejected. |
| Monetary values | `Decimal(12,2)` since D-17/E.13 (`costRatePerHour`, `hourlyRate`, `standardCost`, `plannedCost`, `actualCost`, `unitCost`, `ExternalServiceCost.cost`). Quantity / duration / percentage values stay `Float`; exact-currency arithmetic on those still drifts, but monetary figures now round-trip exactly. |
| Status and type columns | Free-text `String`; allowed values are recorded only as schema comments, not as enums or check constraints. |
| Polymorphic links | `Comment` and `Attachment` point at their target via `entityType` + `entityId` with no foreign key. Integrity is the application's responsibility. |

### Audit coverage across the 38 tables

| Audit shape | Count | Tables |
| --- | --- | --- |
| Full audit set + `isDeleted` | 34 | The 18 pre-existing tables, plus `WorkOrderOperation`, `WorkOrderChecklist`, `TaskListMaterial` (which had the audit set and gained `isDeleted`) and the 13 that gained the whole set in the E.12 sweep: `EquipmentBOMMaterial`, `WorkOrderNotifLink`, `WorkOrderMaterial`, `ExternalServiceCost`, `ChecklistItem`, `WorkOrderChecklistItem`, `MaintenancePlanTarget`, `MaintenancePlanMeter`, `CostSplit`, `Comment`, `SystemAlert`, `SystemConfig`, `SchedulerRun` |
| Full audit set, no `isDeleted` | 0 | (none left after the E.12 sweep) |
| `createdDate` only | 0 | (none left after the E.12 sweep — former members `SystemAlert` and `Comment` gained the full set) |
| No audit columns | 4 | `RefreshToken`, `AuditLogEntry`, `SequenceCounter`, `WorkOrderSnapshot` (immutable by design — see the System section row) |

---

## Identity & Access

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `User` | Login identity, role and lockout state. | `userId` PK; `username` (partial unique); `passwordHash`; `fullName`; `email`; `role` free text — Administrator, Maintenance Planner, Maintenance Supervisor, Technician, Requester, View-Only; `workCenterId?`; `isActive`; `failedLoginCount` (default 0); `lockedUntil?`; `lastLogin?` | `workCenterId` → `WorkCenter.workCenterId`, nullable | Soft (`isDeleted`) |
| `RefreshToken` | Issued refresh tokens for session renewal. | `tokenId` PK; `token` `@unique`; `expiresAt`; `revoked` (default false); `createdAt` | `userId` → `User.userId`, required | Hard |

## Location & Assets

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `FunctionalLocation` | Plant / Area / Unit / Sub-unit / System hierarchy. | `functionalLocationId` PK; `locationCode` (partial unique); `description`; `locationType` free text; `operationalStatus` (default Active); `installationDate?`; `gpsCoordinates?` free text; `safetyCritical` (default false) | `parentLocationId` → self, nullable. Self-referencing hierarchy. | Soft |
| `Equipment` | Asset register, one row per maintainable item. | `equipmentId` PK; `equipmentCode` (partial unique); `name`; `description`; `manufacturer`; `model`; `serialNumber`; `assetTag`; `equipmentClass`; `criticality` A/B/C; `operationalStatus` Active/Inactive/Decommissioned; `installationDate?`; `warrantyExpiryDate?`; `technicalParameters Json` (default `{}`) | `functionalLocationId` → `FunctionalLocation`, **required** | Soft |
| `EquipmentMeter` | A measured point on an asset; carries the last known value. | `meterId` PK; `meterName`; `unitOfMeasure`; `lastReading Float` (default 0); `lastReadingDate?` | `equipmentId` → `Equipment`, required | Soft |
| `MeterReading` | Time-series reading values for a meter. | `readingId` PK; `readingValue Float`; `readingDate`; `notes?` | `meterId` → `EquipmentMeter`, required | Soft |

## Org & Master Data

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `WorkCenter` | Owning unit, with capacity and cost rate. | `workCenterId` PK; `code` (partial unique); `name`; `dailyCapacityHours Float`; `costRatePerHour Decimal(12,2)`; `isActive` (default true) | none | Soft |
| `Craft` | Trade/skill available in a work centre. | `craftId` PK; `craftCode`; `description`; `hourlyRate Decimal(12,2)` | `workCenterId` → `WorkCenter`, required | Soft |
| `Material` | Spare part master, with cost and stock. | `materialId` PK; `materialCode` (partial unique); `description`; `unitOfMeasure`; `standardCost Decimal(12,2)`; `currentStock Float` (default 0) | none | Soft |
| `EquipmentBOMMaterial` | Bill of materials: parts standard to an asset. | `bomId` PK; `quantity Float` | `equipmentId` → `Equipment`; `materialId` → `Material`, both required | Soft |
| `FailureCode` | Hierarchical failure classification. | `failureCodeId` PK; `code`; `description`; `parentCodeId?` | `parentCodeId` → self, nullable. Self-referencing hierarchy. | Soft |
| `CauseCode` | Cause classification. **No foreign key anywhere and no referencing column in the schema** — see [Known gaps](#known-gaps). | `causeCodeId` PK; `code`; `description` | none | Soft |
| `TaskList` | Reusable standard job, scoped to a work centre. | `taskListId` PK; `code` (partial unique); `description`; `equipmentClass?`; `equipmentId?` | `workCenterId` → `WorkCenter`, required; `equipmentId` → `Equipment`, nullable | Soft |
| `TaskListOperation` | Ordered step in a task list. | `taskOperationId` PK; `sequenceNumber Int`; `description`; `plannedHours Float`; `numberOfTechnicians Int` | `taskListId` → `TaskList`; `craftId` → `Craft`, both required | Soft |
| `TaskListMaterial` | Material planned for a task-list operation. | `taskListMaterialId` PK; `quantity Float` | `taskOperationId` → `TaskListOperation`; `materialId` → `Material`, both required. Unique on `(taskOperationId, materialId)` | Soft |

## Work Management

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `Notification` | Breakdown/maintenance request raised against an asset. | `notificationId` PK; `notificationNumber` (partial unique); `type` M1/M2/M3; `priority` High/Medium/Low; `description`; `breakdownFlag` (default false); `status` Open/In Process/Completed/Converted, default Open | `functionalLocationId` → `FunctionalLocation`, required; `equipmentId` → `Equipment`, nullable; `reportedByUserId` → `User`, required | Soft |
| `WorkOrder` | The central maintenance order. | `workOrderId` PK; `woNumber` (partial unique); `type` CM/PM/PdM/EM/CAL; `priority`; `status` default Draft across Draft, Planned, Scheduled, In Progress, Suspended, Completed, Closed, Cancelled; `description`; `costCenterCode` (default `""`); `internalOrder` (default `""`); `breakdownFlag`; `safetyCriticalFlag`; `plannedStart?`/`plannedFinish?`; `actualStart?`/`actualFinish?`; `plannedCost Decimal(12,2)`; `actualCost Decimal(12,2)`; `sourcePlanId?`; `sourcePlanCycle?` | `functionalLocationId` and `workCenterId` required; `equipmentId` nullable; `supervisorUserId` → `User`, required; `reportedByUserId` → `User` (`@relation("ReportedBy")`), required (added `20260927120000_work_order_reported_by`) | Soft |
| `WorkOrderNotifLink` | Many-to-many join: notification converted into a work order. | composite PK `(workOrderId, notificationId)` | both required → `WorkOrder`, `Notification` | Soft |
| `WorkOrderOperation` | Ordered execution step on a work order. | `operationId` PK; `sequenceNumber Int`; `description`; `plannedHours Float`; `numberOfTechnicians Int` (default 1); `actualHours Float` (default 0); `status` Pending/In Progress/Completed, default Pending | `workOrderId` → `WorkOrder`; `craftId` → `Craft`, both required | Soft |
| `WorkOrderMaterial` | Part consumed on a work order. | `woMaterialId` PK; `plannedQuantity Float`; `actualQuantity Float` (default 0); `unitCost Decimal(12,2)` (default 0); `reservationQuantity Float` (default 0) | `workOrderId` → `WorkOrder`; `materialId` → `Material`, both required | Soft |
| `LaborEntry` | Actual hours booked by a technician. | `laborEntryId` PK; `hoursWorked Float`; `entryDateTime` (default now); `notes?` | `operationId` → `WorkOrderOperation`; `userId` → `User`, both required | Soft |
| `ExternalServiceCost` | Vendor invoice line against a work order. | `serviceCostId` PK; `vendor`; `description`; `cost Decimal(12,2)`; `invoiceRef` | `workOrderId` → `WorkOrder`, required | Soft |
| `CostSplit` | Percentage allocation of a work order to cost centres. | `splitId` PK; `costCenterCode`; `percentage Float` | `workOrderId` → `WorkOrder`, required | Soft |

## Safety

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `SafetyChecklistTemplate` | Reusable safety checklist definition. | `checklistTemplateId` PK; `name`; `description`; `isMandatory` (default false) | none | Soft |
| `ChecklistItem` | A question/step within a template. | `itemId` PK; `sequenceNumber Int`; `description` | `checklistTemplateId` → `SafetyChecklistTemplate`, required | Soft |
| `WorkOrderChecklist` | A template instantiated onto a work order. | `woChecklistId` PK; `status` Pending/In Progress/Completed, default Pending; `signedBy?`; `signedDate?` | `workOrderId` → `WorkOrder`; `checklistTemplateId` → `SafetyChecklistTemplate`, both required; `signedBy` → `User`, **nullable** | Soft |
| `WorkOrderChecklistItem` | Recorded response to one checklist item. | `woChecklistItemId` PK; `response` Yes/No/NA, or null when unanswered (`String?`); `comment?` | `woChecklistId` → `WorkOrderChecklist`; `itemId` → `ChecklistItem`, both required | Soft |

## Preventive Maintenance

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `MaintenancePlan` | Preventive strategy producing scheduled work orders. | `planId` PK; `planCode` (partial unique on active rows only); `description`; `strategyType` Time/Meter/Combined; `intervalValue Int`; `intervalUnit` Days/Weeks/Months; `callHorizonValue Int` (default 7); `callHorizonUnit` Days/Units (default Days); `startDate`; `endDate?`; `activeFlag` (default true); `functionalLocationId?` | `workCenterId` → `WorkCenter` and `taskListId` → `TaskList`, both **required**; `equipmentId` → `Equipment`, nullable. `functionalLocationId` is a plain nullable column with **no** relation. | Soft |
| `MaintenancePlanMeter` | Meter trigger interval for a plan. | `planMeterId` PK; `meterInterval Float` | `planId` → `MaintenancePlan`; `meterId` → `EquipmentMeter`, both required | Soft |
| `MaintenancePlanTarget` | Equipment or location a plan schedules against. | `planTargetId` PK; `equipmentId?`; `functionalLocationId?`. CASCADE: deleting the plan takes its targeting with it — the row is only meaningful as part of the plan's definition. NULLs not part of a unique constraint, and a CHECK requires at least one target (see [Known gaps](#known-gaps)). | `planId` → `MaintenancePlan` (`onDelete: Cascade`); `equipmentId` → `Equipment`, `functionalLocationId` → `FunctionalLocation`, both nullable | Soft |

## System

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `AuditLogEntry` | Field-level change log. | `auditId` PK; `tableName`; `recordId`; `action` Create/Update/Delete; `fieldName?`; `oldValue?`; `newValue?`; `ipAddress?`; `timestamp` (default now). No audit columns of its own — appropriate for an append-only log. | `userId` → `User`, required | Hard |
| `SystemAlert` | In-app notification for one user. | `alertId` PK; `alertType` WO_Assigned/WO_Overdue/PM_Generation/High_Priority_Notification; `title`; `message`; `isRead` (default false); `createdDate` (default now); `relatedEntityType?`; `relatedEntityId?` — polymorphic, no FK; full audit set + `isDeleted` (E.12 sweep) | `userId` → `User`, required | Soft |
| `Comment` | Free-text comment on a work order, notification or equipment. | `commentId` PK; `entityType`; `entityId`; `content`; `createdDate` (default now); full audit set + `isDeleted` (E.12 sweep) | `userId` → `User`, required. Target is polymorphic. | Soft |
| `Attachment` | File metadata; the bytes live under `backend/uploads/`. | `attachmentId` PK; `entityType`; `entityId`; `originalName`; `mimeType`; `sizeBytes Int`; `storagePath` (relative under `backend/uploads/`); `uploadedByUserId`; `createdBy` (**required, no default**); `modifiedBy` (**required, no default**); `modifiedDate` (`@default(now())`, **not** `@updatedAt`). Indexed on `(entityType, entityId, isDeleted)`. | none — `uploadedByUserId` is a plain string with no `USER` relation | Soft |
| `SystemConfig` | Key/value application settings. | `configId` PK; `key` (**partial unique index** in the E.12 migration — no longer `@unique`, so a soft-deleted row releases its key for reuse); `value` | none | Soft |
| `SchedulerRun` | PM scheduler execution record, with heartbeat for single-instance locking. | `schedulerRunId` PK; `hostname`; `pid Int`; `status` running/success/error; `startedAt`; `heartbeatAt`; `completedAt?`; `plansEvaluated Int`; `wosCreated Int`; `wosSkipped Int`; `errorMessage?`. Indexed on `(status, heartbeatAt)` and `(completedAt)`. | none | Soft |
| `SequenceCounter` | Document number allocation. | `code` PK (this table's PK is a `String` business key, not a generated uuid); `value Int` (default 0) | none | Hard |
| `WorkOrderSnapshot` | Append-only copy of a work order at each status change. | `snapshotId` PK; `workOrderId`; `status` (repeated for queryability); `snapshot` (a complete `Json` copy — every scalar field, dates ISO, keys sorted); `takenByUserId`; `takenAt` (default now). Indexed on `(workOrderId, takenAt)`. **Immutable by design**: no `isDeleted`/`modifiedBy`/`modifiedDate` and no update or delete surface anywhere — this is what "stored as an immutable record" means. | `workOrderId` → `WorkOrder` (`onDelete: Restrict`); `takenByUserId` → `User` | Hard |

---

## Known gaps

Documented because the schema is the contract, and these are places where it does not yet
enforce what the domain implies.

1. **Failure and cause codes are not connected to work.** `FailureCode` and `CauseCode`
   exist as reference tables with hierarchies, but no column in `WorkOrder`, `Notification`
   or `WorkOrderOperation` references either of them. Failure/cause analysis cannot be
   recorded against a work order in the current schema.
2. **`MaintenancePlan.functionalLocationId` is unenforced.** The column is present and
   nullable but has no `@relation`, so a plan can hold an id for a location that does not
   exist, or none at all, even though `workCenterId` and `taskListId` are required.
3. **Polymorphic references have no integrity.** `Comment`, `Attachment` and the
   `relatedEntity*` pair on `SystemAlert` can point at a missing or wrong-type row. The
   same applies to `createdBy`/`modifiedBy`/`uploadedByUserId`, which are free text.
4. **Monetary columns are `DECIMAL(12,2)`; quantity columns remain `Float`.** The seven monetary columns (`standardCost`, `unitCost`, `plannedCost`, `actualCost`, `cost`, `hourlyRate`, `costRatePerHour`) are exact `Decimal(12,2)` since D-17/E.13 and round-trip exactly. `currentStock` and the quantity / duration hours / `percentage` columns are still binary floating point, so arithmetic on those drifts and needs `roundMoney`. |
5. **Status and type columns are unenforced free text.** The permitted values live only in
   schema comments; nothing at the database level rejects an unexpected value.
6. **Four tables are not soft-deletable by design.** The E.12 sweep brought every remaining child, join and configuration table onto `isDeleted`, so the former hard-deleted-children gap is closed. The only exceptions are `RefreshToken` (revoked, never deleted), `SequenceCounter` (a numeric semaphore), and the immutable append-only `AuditLogEntry` and `WorkOrderSnapshot` (§3.6). The §4.3 purge job with the 7-year retention default is still a seed comment only — nothing in the application archives or purges audit rows yet.

## Verification

Reconcile the model count and this document after any schema change:

```powershell
# must be 38
(Select-String -Path backend\prisma\schema.prisma -Pattern '^model ').Count

# soft-delete split: 34 yes / 4 no
(Select-String -Path backend\prisma\schema.prisma -Pattern '^\s+isDeleted\s+Boolean').Count

# every model must appear exactly once in this document
$schema  = (Select-String -Path backend\prisma\schema.prisma -Pattern '^model (\w+)').Matches.Groups |
             Where-Object { $_ -and $_.Name -eq 1 } | ForEach-Object { $_.Value } | Sort-Object
$document = (Select-String -Path docs\DATA_DICTIONARY.md -Pattern '^\| `(\w+)`.*\| (Soft|Hard)').Matches.Groups |
             Where-Object { $_ -and $_.Name -eq 1 } | ForEach-Object { $_.Value } | Sort-Object
Compare-Object $schema $document
```

The row pattern is anchored on the `Soft`/`Hard` delete column so that it matches only the
table rows and not the conventions table above them. `Compare-Object` must return
nothing, which proves the dictionary and the schema describe the same 38 tables. A
`Generated` migration diff is the final check for anything the schema file alone does not
show.
