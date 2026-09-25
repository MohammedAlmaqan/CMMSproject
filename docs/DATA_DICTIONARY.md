# Data Dictionary — CMMS v1.0.0

**Source of truth:** [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
**Database:** PostgreSQL
**Scope:** all 35 models, grouped into 7 domains, one row per model. Verified against the
schema on 2026-09-25.
**Companion:** [`ER_DIAGRAM.md`](./ER_DIAGRAM.md)

## Conventions

These hold across the tables below. "Audit set" means `createdBy`, `createdDate`,
`modifiedBy`, `modifiedDate`.

| Convention | Detail |
| --- | --- |
| Table naming | Model name == table name. The schema declares no `@@map`. |
| Primary keys | `String @id @default(uuid())`, named `<model>Id`. Three exceptions noted per table. |
| Business codes | Plain `String` columns, **not** `@unique` in Prisma. Uniqueness is enforced by partial unique indexes created in migrations, scoped to `WHERE "isDeleted" = false`. A soft-deleted row releases its code for reuse. |
| Soft delete | `isDeleted Boolean @default(false)`. 18 of 35 tables. Queries must filter on it. |
| `modifiedDate` | `DateTime @updatedAt` on soft-deleted tables, so the application must set the value. `Attachment` deviates — see its row. |
| `createdBy` / `modifiedBy` | Free-text `String @default("system")`, holding a user id or the literal `system`. **Not** a foreign key, so a deleted or bad actor id will not be rejected. |
| Monetary / quantity values | `Float`, not `Decimal`. Exact-currency arithmetic on these columns will drift. |
| Status and type columns | Free-text `String`; allowed values are recorded only as schema comments, not as enums or check constraints. |
| Polymorphic links | `Comment` and `Attachment` point at their target via `entityType` + `entityId` with no foreign key. Integrity is the application's responsibility. |

### Audit coverage across the 35 tables

| Audit shape | Count | Tables |
| --- | --- | --- |
| Full audit set + `isDeleted` | 18 | `User`, `FunctionalLocation`, `Equipment`, `EquipmentMeter`, `MeterReading`, `WorkCenter`, `Craft`, `Material`, `FailureCode`, `CauseCode`, `TaskList`, `TaskListOperation`, `Notification`, `WorkOrder`, `LaborEntry`, `SafetyChecklistTemplate`, `MaintenancePlan`, `Attachment` |
| Full audit set, no `isDeleted` (hard deleted) | 2 | `WorkOrderOperation`, `WorkOrderChecklist` |
| `createdDate` only | 2 | `SystemAlert`, `Comment` |
| No audit columns | 13 | `RefreshToken`, `EquipmentBOMMaterial`, `WorkOrderNotifLink`, `WorkOrderMaterial`, `ExternalServiceCost`, `ChecklistItem`, `WorkOrderChecklistItem`, `MaintenancePlanMeter`, `CostSplit`, `AuditLogEntry`, `SystemConfig`, `SchedulerRun`, `SequenceCounter` |

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
| `WorkCenter` | Owning unit, with capacity and cost rate. | `workCenterId` PK; `code` (partial unique); `name`; `dailyCapacityHours Float`; `costRatePerHour Float`; `isActive` (default true) | none | Soft |
| `Craft` | Trade/skill available in a work centre. | `craftId` PK; `craftCode`; `description`; `hourlyRate Float` | `workCenterId` → `WorkCenter`, required | Soft |
| `Material` | Spare part master, with cost and stock. | `materialId` PK; `materialCode` (partial unique); `description`; `unitOfMeasure`; `standardCost Float`; `currentStock Float` (default 0) | none | Soft |
| `EquipmentBOMMaterial` | Bill of materials: parts standard to an asset. | `bomId` PK; `quantity Float` | `equipmentId` → `Equipment`; `materialId` → `Material`, both required | Hard |
| `FailureCode` | Hierarchical failure classification. | `failureCodeId` PK; `code`; `description`; `parentCodeId?` | `parentCodeId` → self, nullable. Self-referencing hierarchy. | Soft |
| `CauseCode` | Cause classification. **No foreign key anywhere and no referencing column in the schema** — see [Known gaps](#known-gaps). | `causeCodeId` PK; `code`; `description` | none | Soft |
| `TaskList` | Reusable standard job, scoped to a work centre. | `taskListId` PK; `code` (partial unique); `description`; `equipmentClass?`; `equipmentId?` | `workCenterId` → `WorkCenter`, required; `equipmentId` → `Equipment`, nullable | Soft |
| `TaskListOperation` | Ordered step in a task list. | `taskOperationId` PK; `sequenceNumber Int`; `description`; `plannedHours Float`; `numberOfTechnicians Int` | `taskListId` → `TaskList`; `craftId` → `Craft`, both required | Soft |

## Work Management

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `Notification` | Breakdown/maintenance request raised against an asset. | `notificationId` PK; `notificationNumber` (partial unique); `type` M1/M2/M3; `priority` High/Medium/Low; `description`; `breakdownFlag` (default false); `status` Open/In Process/Completed/Converted, default Open | `functionalLocationId` → `FunctionalLocation`, required; `equipmentId` → `Equipment`, nullable; `reportedByUserId` → `User`, required | Soft |
| `WorkOrder` | The central maintenance order. | `workOrderId` PK; `woNumber` (partial unique); `type` CM/PM/PdM/EM/CAL; `priority`; `status` default Draft across Draft, Planned, Scheduled, In Progress, Suspended, Completed, Closed, Cancelled; `description`; `costCenterCode` (default `""`); `internalOrder` (default `""`); `breakdownFlag`; `safetyCriticalFlag`; `plannedStart?`/`plannedFinish?`; `actualStart?`/`actualFinish?`; `plannedCost Float`; `actualCost Float`; `sourcePlanId?`; `sourcePlanCycle?` | `functionalLocationId` and `workCenterId` required; `equipmentId` nullable; `supervisorUserId` → `User`, required | Soft |
| `WorkOrderNotifLink` | Many-to-many join: notification converted into a work order. | composite PK `(workOrderId, notificationId)` | both required → `WorkOrder`, `Notification` | Hard |
| `WorkOrderOperation` | Ordered execution step on a work order. | `operationId` PK; `sequenceNumber Int`; `description`; `plannedHours Float`; `numberOfTechnicians Int` (default 1); `actualHours Float` (default 0); `status` Pending/In Progress/Completed, default Pending | `workOrderId` → `WorkOrder`; `craftId` → `Craft`, both required | Hard (full audit set) |
| `WorkOrderMaterial` | Part consumed on a work order. | `woMaterialId` PK; `plannedQuantity Float`; `actualQuantity Float` (default 0); `unitCost Float` (default 0); `reservationQuantity Float` (default 0) | `workOrderId` → `WorkOrder`; `materialId` → `Material`, both required | Hard |
| `LaborEntry` | Actual hours booked by a technician. | `laborEntryId` PK; `hoursWorked Float`; `entryDateTime` (default now); `notes?` | `operationId` → `WorkOrderOperation`; `userId` → `User`, both required | Soft |
| `ExternalServiceCost` | Vendor invoice line against a work order. | `serviceCostId` PK; `vendor`; `description`; `cost Float`; `invoiceRef` | `workOrderId` → `WorkOrder`, required | Hard |
| `CostSplit` | Percentage allocation of a work order to cost centres. | `splitId` PK; `costCenterCode`; `percentage Float` | `workOrderId` → `WorkOrder`, required | Hard |

## Safety

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `SafetyChecklistTemplate` | Reusable safety checklist definition. | `checklistTemplateId` PK; `name`; `description`; `isMandatory` (default false) | none | Soft |
| `ChecklistItem` | A question/step within a template. | `itemId` PK; `sequenceNumber Int`; `description` | `checklistTemplateId` → `SafetyChecklistTemplate`, required | Hard |
| `WorkOrderChecklist` | A template instantiated onto a work order. | `woChecklistId` PK; `status` Pending/In Progress/Completed, default Pending; `signedBy?`; `signedDate?` | `workOrderId` → `WorkOrder`; `checklistTemplateId` → `SafetyChecklistTemplate`, both required; `signedBy` → `User`, **nullable** | Hard (full audit set) |
| `WorkOrderChecklistItem` | Recorded response to one checklist item. | `woChecklistItemId` PK; `response` Yes/No/NA; `comment?` | `woChecklistId` → `WorkOrderChecklist`; `itemId` → `ChecklistItem`, both required | Hard |

## Preventive Maintenance

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `MaintenancePlan` | Preventive strategy producing scheduled work orders. | `planId` PK; `planCode` (partial unique on active rows only); `description`; `strategyType` Time/Meter/Combined; `intervalValue Int`; `intervalUnit` Days/Weeks/Months; `callHorizonValue Int` (default 7); `callHorizonUnit` Days/Units (default Days); `startDate`; `endDate?`; `activeFlag` (default true); `functionalLocationId?` | `workCenterId` → `WorkCenter` and `taskListId` → `TaskList`, both **required**; `equipmentId` → `Equipment`, nullable. `functionalLocationId` is a plain nullable column with **no** relation. | Soft |
| `MaintenancePlanMeter` | Meter trigger interval for a plan. | `planMeterId` PK; `meterInterval Float` | `planId` → `MaintenancePlan`; `meterId` → `EquipmentMeter`, both required | Hard |

## System

| Table | Purpose | Key fields | Foreign keys | Delete |
| --- | --- | --- | --- | --- |
| `AuditLogEntry` | Field-level change log. | `auditId` PK; `tableName`; `recordId`; `action` Create/Update/Delete; `fieldName?`; `oldValue?`; `newValue?`; `ipAddress?`; `timestamp` (default now). No audit columns of its own — appropriate for an append-only log. | `userId` → `User`, required | Hard |
| `SystemAlert` | In-app notification for one user. | `alertId` PK; `alertType` WO_Assigned/WO_Overdue/PM_Generation/High_Priority_Notification; `title`; `message`; `isRead` (default false); `createdDate` (default now); `relatedEntityType?`; `relatedEntityId?` — polymorphic, no FK | `userId` → `User`, required | Hard |
| `Comment` | Free-text comment on a work order, notification or equipment. | `commentId` PK; `entityType`; `entityId`; `content`; `createdDate` (default now) | `userId` → `User`, required. Target is polymorphic. | Hard |
| `Attachment` | File metadata; the bytes live under `backend/uploads/`. | `attachmentId` PK; `entityType`; `entityId`; `originalName`; `mimeType`; `sizeBytes Int`; `storagePath` (relative under `backend/uploads/`); `uploadedByUserId`; `createdBy` (**required, no default**); `modifiedBy` (**required, no default**); `modifiedDate` (`@default(now())`, **not** `@updatedAt`). Indexed on `(entityType, entityId, isDeleted)`. | none — `uploadedByUserId` is a plain string with no `USER` relation | Soft |
| `SystemConfig` | Key/value application settings. | `configId` PK; `key` `@unique`; `value` | none | Hard |
| `SchedulerRun` | PM scheduler execution record, with heartbeat for single-instance locking. | `schedulerRunId` PK; `hostname`; `pid Int`; `status` running/success/error; `startedAt`; `heartbeatAt`; `completedAt?`; `plansEvaluated Int`; `wosCreated Int`; `wosSkipped Int`; `errorMessage?`. Indexed on `(status, heartbeatAt)` and `(completedAt)`. | none | Hard |
| `SequenceCounter` | Document number allocation. | `code` PK (this table's PK is a `String` business key, not a generated uuid); `value Int` (default 0) | none | Hard |

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
4. **Costs and quantities are `Float`.** `standardCost`, `currentStock`, `unitCost`,
   `plannedCost`, `actualCost`, `cost`, `percentage`, `hourlyRate`, `costRatePerHour` and
   the quantity columns are all binary floating point. Rounding differences are expected.
5. **Status and type columns are unenforced free text.** The permitted values live only in
   schema comments; nothing at the database level rejects an unexpected value.
6. **Hard-deleted work-order children.** Work order operations, materials, external costs,
   cost splits and checklist records are physically removed, while the work order itself is
   soft deleted. Deleting a work order therefore removes execution history irrecoverably,
   and the work orders that remain soft deleted no longer have their operations.

## Verification

Reconcile the model count and this document after any schema change:

```powershell
# must be 35
(Select-String -Path backend\prisma\schema.prisma -Pattern '^model ').Count

# soft-delete split: 18 yes / 17 no
(Select-String -Path backend\prisma\schema.prisma -Pattern '^\s+isDeleted\s+Boolean').Count

# every model must appear exactly once in this document
$schema  = (Select-String -Path backend\prisma\schema.prisma -Pattern '^model (\w+)').Matches.Groups |
             Where-Object { $_ -and $_.Name -eq 1 } | ForEach-Object { $_.Value } | Sort-Object
$document = (Select-String -Path docs\DATA_DICTIONARY.md -Pattern '^\| `(\w+)`.*\| (Soft|Hard)').Matches.Groups |
             Where-Object { $_ -and $_.Name -eq 1 } | ForEach-Object { $_.Value } | Sort-Object
Compare-Object $schema $document
```

The row pattern is anchored on the `Soft`/`Hard` delete column so that it matches only the
seven domain tables and not the conventions table above them. `Compare-Object` must return
nothing, which proves the dictionary and the schema describe the same 35 tables. A
`Generated` migration diff is the final check for anything the schema file alone does not
show.
