# Migration CSV templates

Fixes the input format for the legacy dataset by schema, so the owner can 
supply master data without guessing column names, types or foreign keys.
**These files are a specification**: filling them is the prerequisite to the 
trial run ([DATA_ASSESSMENT_REQUEST](../DATA_ASSESSMENT_REQUEST.md)), not the 
migration itself. Importers and the trial-run harness were built after the 
owner returned the filled samples (`dbd48af`). *This sentence previously read
"Importers and the trial-run harness are built only after the owner returns the
filled samples."*

- **Source of truth:** `backend/prisma/schema.prisma`, re-read to generate this 
  directory. Regenerate from the schema (not from this text) after any column, 
  relation or enum change to this catalog.
- **Files:** one `*.csv` per table migration can populate from legacy data - the
  header uses the exact column names and every required column is present as a
  header; there are **no example rows** in the fill-in files, the cells below the
  header are the owner's to fill. Fabricated example rows live separately in the
  [example rows](#the-example-rows) section, outside anything the owner will send
  back. UTF-8, first row is the header, RFC 4180 comma-separated, fields with comma
  or double-quote quoted and doubled.
- **Excluded tables** carry one reason each in [Exclusions](#exclusions).

## Fill order

Parents before children, in dependency order; a row must name only rows already 
imported. Work centres come first because both users and crafts carry a 
`workCenterId`. Self-referencing trees (`FunctionalLocation.parentLocationId`, 
`FailureCode.parentCodeId`) must list parents before children inside their file.

1. `WorkCenter.csv`
2. `Craft.csv`
3. `User.csv`
4. `FunctionalLocation.csv`
5. `Equipment.csv`
6. `EquipmentMeter.csv`
7. `Material.csv`
8. `EquipmentBOMMaterial.csv`
9. `MeterReading.csv`
10. `SafetyChecklistTemplate.csv`
11. `ChecklistItem.csv`
12. `FailureCode.csv`
13. `CauseCode.csv`
14. `TaskList.csv`
15. `TaskListOperation.csv`
16. `TaskListMaterial.csv`
17. `Notification.csv`
18. `MaintenancePlan.csv`
19. `MaintenancePlanTarget.csv`
20. `WorkOrder.csv`
21. `WorkOrderNotifLink.csv`
22. `WorkOrderOperation.csv`
23. `WorkOrderMaterial.csv`
24. `LaborEntry.csv`
25. `ExternalServiceCost.csv`
26. `CostSplit.csv`
27. `WorkOrderChecklist.csv`
28. `WorkOrderChecklistItem.csv`
29. `Comment.csv`
30. `Attachment.csv`

## Column conventions

- **Required**: non-nullable columns with no default and no server assignment. 
  `passwordHash` is the exception: the owner cannot hold a bcrypt hash, so the 
  importer fabricates a placeholder and real credentials are set afterwards 
  through the Administration user management.
- **Optional**: nullable columns, and non-nullable columns with a schema default 
  (a blank leaves the default).
- **Blank on import**: primary-key UUIDs (the server generates them), the audit 
  stamp (`createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`), `isDeleted` 
  (the importer writes `false`), and per-table runtime state such as 
  `User.failedLoginCount` / `lockedUntil` / `lastLogin` and `User.passwordHash`.
- **Foreign keys** are natural keys, not UUIDs: the CSV column keeps its schema 
  name but the value is the code the importer resolves. Composite keys join with a 
  dot, e.g. `meterId` = `EQUIP-01.Run hours`. Full mapping in the per-table notes. 
  `Comment.entityId` and `Attachment.entityId` are polymorphic: the value is the 
  natural key of the quoted record (`WorkOrder.woNumber`, `Notification.notificationNumber` 
  or `Equipment.equipmentCode`, matching the `entityType` value).
- **Dates**: ISO-8601. Date-only values (`2026-03-14`) are read as midnight UTC; 
  instants carry a time and zone (`2026-03-14T08:30:00Z`).
- **Booleans**: lowercase `true` / `false`.
- **Decimals** (`Decimal(12,2)`): plain two-decimal text, `315.40`. Floats and ints: 
  plain numbers, `8.5`, `2`.
- **JSON** (`Equipment.technicalParameters`): a JSON object; leave `{}` unless the 
  legacy system carried parameters worth carrying over.

## Per-table notes

### `WorkCenter`

the cost/manpower centres the plant is organised into; parent of users and crafts.

- Required: `code`, `name`, `dailyCapacityHours`, `costRatePerHour`
- Optional: `workCenterId`, `isActive`
- Foreign keys: _none_
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Craft`

the trades inside a work centre and the hourly rate each costs.

- Required: `workCenterId`, `craftCode`, `description`, `hourlyRate`
- Optional: `craftId`
- Foreign keys: `workCenterId` -> WorkCenter.code
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `User`

the people who log in and do work: staff list with role and home work centre.

- Required: `username`, `fullName`, `email`, `role`
- Optional: `userId`, `workCenterId`, `isActive`
- Foreign keys: `workCenterId` -> WorkCenter.code
- Value sets: `role`: Administrator, Maintenance Planner, Maintenance Supervisor, Technician, Requester, View-Only
- Blank on import: `passwordHash`, `failedLoginCount`, `lockedUntil`, `lastLogin`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `FunctionalLocation`

the plant hierarchy (Plant -> Area -> Unit -> Sub-unit); the master location tree every asset hangs off.

- Required: `locationCode`, `description`, `locationType`
- Optional: `functionalLocationId`, `parentLocationId`, `operationalStatus (Active, Inactive)`, `installationDate`, `gpsCoordinates`, `safetyCritical`
- Foreign keys: `parentLocationId` -> FunctionalLocation.locationCode (self; list parents before children)
- Value sets: `locationType`: Plant, Area, Unit, Sub-unit, System; `operationalStatus`: Active, Inactive
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Equipment`

the assets to be maintained, each mounted at one functional location.

- Required: `equipmentCode`, `name`, `description`, `functionalLocationId`, `manufacturer`, `model`, `serialNumber`, `assetTag`, `equipmentClass`, `criticality`
- Optional: `equipmentId`, `installationDate`, `warrantyExpiryDate`, `operationalStatus (Active, Inactive, Decommissioned)`, `technicalParameters`
- Foreign keys: `functionalLocationId` -> FunctionalLocation.locationCode
- Value sets: `criticality`: S, A, B, C; `operationalStatus`: Active, Inactive, Decommissioned
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `EquipmentMeter`

the meters installed on an equipment item that drive meter-based PM and carry condition history.

- Required: `equipmentId`, `meterName`, `unitOfMeasure`
- Optional: `meterId`, `lastReading`, `lastReadingDate`
- Foreign keys: `equipmentId` -> Equipment.equipmentCode
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Material`

the spare parts and consumables catalogued for issue to work orders and task lists.

- Required: `materialCode`, `description`, `unitOfMeasure`, `standardCost`
- Optional: `materialId`, `currentStock`
- Foreign keys: _none_
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `EquipmentBOMMaterial`

which equipment carries which materials on hand (bill of materials).

- Required: `equipmentId`, `materialId`, `quantity`
- Optional: `bomId`
- Foreign keys: `equipmentId` -> Equipment.equipmentCode; `materialId` -> Material.materialCode
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `MeterReading`

historic meter readings, so meter-based PM has a baseline when the system starts.

- Required: `meterId`, `readingValue`, `readingDate`
- Optional: `readingId`, `notes`
- Foreign keys: `meterId` -> Equipment.equipmentCode + '.' + EquipmentMeter.meterName
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `SafetyChecklistTemplate`

the safety checklists attachable to work orders (SOW 3.3.7).

- Required: `name`, `description`
- Optional: `checklistTemplateId`, `isMandatory`
- Foreign keys: _none_
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `ChecklistItem`

the steps inside a safety checklist template, in sequence.

- Required: `checklistTemplateId`, `sequenceNumber`, `description`
- Optional: `itemId`
- Foreign keys: `checklistTemplateId` -> SafetyChecklistTemplate.name
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `FailureCode`

the observable-failure code list (SOW 3.1.4 / 3.2.2), hierarchical.

- Required: `code`, `description`
- Optional: `failureCodeId`, `parentCodeId`
- Foreign keys: `parentCodeId` -> FailureCode.code (self; list parents before children)
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `CauseCode`

the root-cause code list (SOW 3.1.4) a breakdown must name at completion.

- Required: `code`, `description`
- Optional: `causeCodeId`
- Foreign keys: _none_
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `TaskList`

the reusable task lists (SOW 3.1.4) work orders copy their steps from.

- Required: `code`, `description`, `workCenterId`
- Optional: `taskListId`, `equipmentClass`, `equipmentId`
- Foreign keys: `equipmentId` -> Equipment.equipmentCode; `workCenterId` -> WorkCenter.code
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `TaskListOperation`

the steps of a task list, each with craft and planned duration.

- Required: `taskListId`, `sequenceNumber`, `description`, `craftId`, `plannedHours`, `numberOfTechnicians`
- Optional: `taskOperationId`
- Foreign keys: `taskListId` -> TaskList.code; `craftId` -> Craft.craftCode
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `TaskListMaterial`

the material a task-list step requires on the shelf before that step runs (SOW 3.1.4 / 3.1.5).

- Required: `taskOperationId`, `materialId`, `quantity`
- Optional: `taskListMaterialId`
- Foreign keys: `taskOperationId` -> TaskList.code + '.' + TaskListOperation.sequenceNumber; `materialId` -> Material.materialCode
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Notification`

the breakdown/defect reports raised against locations or equipment (SOW 3.2.x).

- Required: `notificationNumber`, `type`, `priority`, `functionalLocationId`, `reportedByUserId`, `description`
- Optional: `notificationId`, `equipmentId`, `damagesObservations`, `breakdownFlag`, `status (Open, In Process, Completed, Converted)`
- Foreign keys: `functionalLocationId` -> FunctionalLocation.locationCode; `equipmentId` -> Equipment.equipmentCode; `reportedByUserId` -> User.username
- Value sets: `priority`: High, Medium, Low; `status`: Open, In Process, Completed, Converted; `type`: M1, M2, M3
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `MaintenancePlan`

the time- and/or meter-based plans that generate work orders (SOW 3.4.x).

- Required: `planCode`, `description`, `workCenterId`, `taskListId`, `strategyType`, `intervalValue`, `intervalUnit`, `startDate`
- Optional: `planId`, `equipmentId`, `functionalLocationId`, `callHorizonValue`, `callHorizonUnit (Days, Units)`, `endDate`, `priority (High, Medium, Low)`, `generatedWorkOrderStatus (Draft, Planned)`, `notificationId`, `activeFlag`
- Foreign keys: `equipmentId` -> Equipment.equipmentCode; `functionalLocationId` -> FunctionalLocation.locationCode; `workCenterId` -> WorkCenter.code; `taskListId` -> TaskList.code; `notificationId` -> Notification.notificationNumber
- Value sets: `callHorizonUnit`: Days, Units; `generatedWorkOrderStatus`: Draft, Planned; `intervalUnit`: Days, Weeks, Months; `priority`: High, Medium, Low; `strategyType`: Time, Meter, Combined
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `MaintenancePlanTarget`

the assets a plan drives, for any plan wider than the single mirror in equipmentId.

- Required: `planId`
- Optional: `planTargetId`, `equipmentId`, `functionalLocationId`
- Foreign keys: `planId` -> MaintenancePlan.planCode; `equipmentId` -> Equipment.equipmentCode; `functionalLocationId` -> FunctionalLocation.locationCode
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrder`

the jobs to be executed; the central record the trial run measures.

- Required: `woNumber`, `type`, `priority`, `functionalLocationId`, `description`, `workCenterId`, `supervisorUserId`, `reportedByUserId`
- Optional: `workOrderId`, `status (Draft, Planned, Scheduled, In Progress, Suspended, Completed, Closed, Cancelled)`, `equipmentId`, `plannedStart`, `plannedFinish`, `actualStart`, `actualFinish`, `costCenterCode`, `internalOrder`, `breakdownFlag`, `safetyCriticalFlag`, `causeCodeId`, `failureCodeId`, `safetyNotes`, `completionRemarks`, `calibrationResult (Pass, Fail)`, `calibrationAsFound`, `calibrationAsLeft`, `calibrationReferenceStandard`, `calibrationDueDate`, `calibrationIntervalValue`, `calibrationIntervalUnit (Days, Months, Years)`, `plannedCost`, `actualCost`, `sourcePlanId`, `sourcePlanCycle`
- Foreign keys: `functionalLocationId` -> FunctionalLocation.locationCode; `equipmentId` -> Equipment.equipmentCode; `workCenterId` -> WorkCenter.code; `supervisorUserId` -> User.username; `reportedByUserId` -> User.username; `causeCodeId` -> CauseCode.code; `failureCodeId` -> FailureCode.code; `sourcePlanId` -> MaintenancePlan.planCode
- Value sets: `calibrationIntervalUnit`: Days, Months, Years; `calibrationResult`: Pass, Fail; `priority`: High, Medium, Low; `status`: Draft, Planned, Scheduled, In Progress, Suspended, Completed, Closed, Cancelled; `type`: CM, PM, PdM, EM, CAL
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrderNotifLink`

which work order was raised from which notification (the convert action).

- Required: `workOrderId`, `notificationId`
- Optional: _none_
- Foreign keys: `workOrderId` -> WorkOrder.woNumber; `notificationId` -> Notification.notificationNumber
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrderOperation`

the steps of a work order, each with craft and planned/actual hours.

- Required: `workOrderId`, `sequenceNumber`, `description`, `craftId`, `plannedHours`
- Optional: `operationId`, `numberOfTechnicians`, `actualHours`, `status (Pending, In Progress, Completed)`
- Foreign keys: `workOrderId` -> WorkOrder.woNumber; `craftId` -> Craft.craftCode
- Value sets: `status`: Pending, In Progress, Completed
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrderMaterial`

the materials issued to a work order, optionally to one specific operation (SOW 3.1.5).

- Required: `workOrderId`, `materialId`, `plannedQuantity`
- Optional: `woMaterialId`, `operationId`, `actualQuantity`, `unitCost`, `reservationQuantity`
- Foreign keys: `workOrderId` -> WorkOrder.woNumber; `materialId` -> Material.materialCode; `operationId` -> WorkOrder.woNumber + '.' + WorkOrderOperation.sequenceNumber
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `LaborEntry`

time charged by a user against a work-order operation.

- Required: `operationId`, `userId`, `hoursWorked`
- Optional: `laborEntryId`, `entryDateTime`, `notes`
- Foreign keys: `operationId` -> WorkOrder.woNumber + '.' + WorkOrderOperation.sequenceNumber; `userId` -> User.username
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `ExternalServiceCost`

contractor services and other cost line items (SOW 3.3.6).

- Required: `workOrderId`, `vendor`, `description`, `cost`, `invoiceRef`
- Optional: `serviceCostId`, `category`
- Foreign keys: `workOrderId` -> WorkOrder.woNumber
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `CostSplit`

the percentage allocation of a work order across cost centres (SOW 3.5.2).

- Required: `workOrderId`, `costCenterCode`, `percentage`
- Optional: `splitId`
- Foreign keys: `workOrderId` -> WorkOrder.woNumber
- Value sets: _none_
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrderChecklist`

an attached safety checklist on a work order, its completion state and signature.

- Required: `workOrderId`, `checklistTemplateId`
- Optional: `woChecklistId`, `status (Pending, In Progress, Completed)`, `signedBy`, `signedDate`
- Foreign keys: `workOrderId` -> WorkOrder.woNumber; `checklistTemplateId` -> SafetyChecklistTemplate.name; `signedBy` -> User.username
- Value sets: `status`: Pending, In Progress, Completed
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `WorkOrderChecklistItem`

the answered items of an attached checklist.

- Required: `woChecklistId`, `itemId`
- Optional: `woChecklistItemId`, `response (Yes, No, NA, or null when unanswered)`, `comment`
- Foreign keys: `woChecklistId` -> WorkOrder.woNumber + '.' + SafetyChecklistTemplate.name; `itemId` -> SafetyChecklistTemplate.name + '.' + ChecklistItem.sequenceNumber
- Value sets: `response`: Yes, No, NA, or null when unanswered
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Comment`

plain-text notes attached to work orders, notifications or equipment.

- Required: `entityType`, `entityId`, `userId`, `content`
- Optional: `commentId`
- Foreign keys: `userId` -> User.username
- Value sets: `entityType`: WorkOrder, Notification, Equipment
- Blank on import: `createdDate`, `createdBy`, `modifiedBy`, `modifiedDate`, `isDeleted`

### `Attachment`

files uploaded against work orders, notifications or equipment.

- Required: `entityType`, `entityId`, `originalName`, `mimeType`, `sizeBytes`, `storagePath`, `uploadedByUserId`
- Optional: `attachmentId`
- Foreign keys: `uploadedByUserId` -> User.username
- Value sets: `entityType`: 'WorkOrder' | 'Notification' | 'Equipment' (start with WorkOrder)
- Blank on import: `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `isDeleted`

## Exclusions

Runtime-only tables with no legacy source carry no template. Each is excluded for 
a different reason, so each reason is stated: 

- **`AuditLogEntry`** - the audit trail is written by the app's own middleware; importing rows would fabricate the ledger SOW 3.3.8 exists to guarantee.
- **`MaintenancePlanMeter`** - meter-driving intervals follow from the meter master and the plan's own strategy; there is no owner-authored source for the join row.
- **`RefreshToken`** - live session tokens; a legacy system has none, and importing one would mint a credential that was never issued.
- **`SchedulerRun`** - bookkeeping rows written by the scheduler process on each evaluation; nothing an operator records.
- **`SequenceCounter`** - runtime number-allocation state that the importer re-creates as it assigns codes, so there is nothing to bring over.
- **`SystemAlert`** - the in-app alert inbox is generated at runtime from work-order and notification events, not authored master data.
- **`SystemConfig`** - application configuration set at deployment, not legacy master data.
- **`WorkOrderSnapshot`** - the immutable, complete history captured at each status change (SOW 3.6); importing it would fake the audit record it exists to provide.

These eight are the entire exclusion set, and it is **runtime-only**: every
migratable domain table is represented above, including `Comment`, `Attachment`
and `MeterReading` (each has a template in the fill order). The eighth exclusion,
`WorkOrderSnapshot`, is the immutable status-change history captured at each
transition (SOW 3.6) - the same append-only audience as `AuditLogEntry`, not a
domain table a legacy system could populate.

## The example rows

Every example value is fabricated; none is live data. A row builds a single 
coherent miniature plant - `WC-01`, location `P-A.01`, pump `PMP-101`, seal 
`MAT-001`, task list `TL-01`, plan `PLAN-01`, one work order `WO-2026-0001` raised 
from notification `NTFY-0001` - so the composite keys line up if the owner wants 
to sanity-check cross-file references by hand.

The rows live in `examples/` as one `*.csv` per template, each carrying the same
header as its fill-in file with one example row beneath it. They are reference
material only: the owner fills the top-level `*.csv` files, never these.
