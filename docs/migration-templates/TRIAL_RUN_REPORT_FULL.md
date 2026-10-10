# Trial-run report - migration sample

Run 2026-10-10T20:16:53.763Z (UTC) against the sample in `docs/migration-templates/*.filled.csv` at commit `3b44914`, in the throwaway schema `cmms_trial_13648_1791663306666` on localhost:5432. The schema was created, migrated with `prisma migrate deploy` and dropped by this run; nothing in the app's `public` schema was touched.

Mapping rules in force are the current state of `docs/migration-templates/FILL_REPORT.md`; the SCE widening (commit `5aa0094`) is in force, so `Equipment.criticality` accepts `S > A > B > C` and the sampled SCE rows carry the literal `S`. Accuracy is defined in `docs/DATA_ASSESSMENT_REQUEST.md`: a row is correct when it is not rejected and every mapped field arrives value-unchanged; unmapped source fields are listed, never hidden. Blank cells land as documented per column (null, schema default, or the as-received empty string) and are reported below, not counted as wrong rows.

## Summary

| Dataset | Total | Mapped | Rejected | Correct | Accuracy | Import time |
|---|---|---|---|---|---|---|
| WorkCenter | 5 | 5 | 0 | 5 | 100.00% | 40 ms |
| User | 2 | 2 | 0 | 2 | 100.00% | 324 ms |
| FunctionalLocation | 463 | 463 | 0 | 463 | 100.00% | 2830 ms |
| Equipment | 6127 | 6127 | 0 | 6127 | 100.00% | 31326 ms |
| Material | 5687 | 5687 | 0 | 5687 | 100.00% | 24489 ms |
| Notification | 2160 | 2160 | 0 | 2160 | 100.00% | 11231 ms |
| WorkOrder | 2170 | 2170 | 0 | 2170 | 100.00% | 15367 ms |
| WorkOrderNotifLink | 2170 | 2170 | 0 | 2170 | 100.00% | 8615 ms |
| Comment | 1549 | 1549 | 0 | 1549 | 100.00% | 6294 ms |
| **Overall** | 20333 | 20333 | 0 | 20333 | 100.00% | 99609 ms |

Overall accuracy: 100.00% (20333 / 20333). Target 99.9%. Target met.

## Per-dataset detail

### WorkCenter (`WorkCenter` model)

- total rows: 5
- mapped rows: 5
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 5
- accuracy: 100.00% (5 / 5) (target 99.9%)
- elapsed to import the sample: 1.7 ms mapping + 38 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `workCenterId` | not carried (server-generated or blank-on-import default) |
| `code` | mapped - source value delivered verbatim |
| `name` | mapped - source value delivered verbatim |
| `dailyCapacityHours` | mapped - source value delivered verbatim |
| `costRatePerHour` | mapped - source value delivered verbatim |
| `isActive` | blank src -> true (schema default) |
| `createdBy` | not carried (server-generated or blank-on-import default) |
| `createdDate` | not carried (server-generated or blank-on-import default) |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `workCenterId`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`


### User (`User` model)

- total rows: 2
- mapped rows: 2
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 2
- accuracy: 100.00% (2 / 2) (target 99.9%)
- elapsed to import the sample: 306 ms mapping + 18 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `userId` | not carried (server-generated or blank-on-import default) |
| `username` | mapped - source value delivered verbatim |
| `passwordHash` | derived - placeholder hash fabricated on import (README); real credentials are set afterwards through Administration |
| `fullName` | mapped - source value delivered verbatim |
| `email` | mapped - source value delivered verbatim |
| `role` | mapped - source value delivered verbatim |
| `workCenterId` | nullable - blank src -> null |
| `isActive` | blank src -> true (schema default) |
| `failedLoginCount` | blank src -> 0 (schema default) |
| `lockedUntil` | nullable - blank src -> null |
| `lastLogin` | nullable - blank src -> null |
| `createdBy` | not carried (server-generated or blank-on-import default) |
| `createdDate` | not carried (server-generated or blank-on-import default) |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `userId`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`


### FunctionalLocation (`FunctionalLocation` model)

- total rows: 463
- mapped rows: 463
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 463
- accuracy: 100.00% (463 / 463) (target 99.9%)
- elapsed to import the sample: 5.2 ms mapping + 2825 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `functionalLocationId` | not carried (server-generated or blank-on-import default) |
| `locationCode` | mapped - source value delivered verbatim |
| `description` | mapped - source value delivered verbatim |
| `parentLocationId` | nullable - blank src -> null; FK reference - resolved to the FunctionalLocation row by locationCode |
| `locationType` | mapped - source value delivered verbatim |
| `operationalStatus` | blank src -> "Active" (schema default) |
| `installationDate` | nullable - blank src -> null |
| `gpsCoordinates` | nullable - blank src -> null |
| `safetyCritical` | blank src -> false (schema default) |
| `createdBy` | not carried (server-generated or blank-on-import default) |
| `createdDate` | not carried (server-generated or blank-on-import default) |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `functionalLocationId`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`


### Equipment (`Equipment` model)

- total rows: 6127
- mapped rows: 6127
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 6127
- accuracy: 100.00% (6127 / 6127) (target 99.9%)
- elapsed to import the sample: 180 ms mapping + 31146 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `equipmentId` | not carried (server-generated or blank-on-import default) |
| `equipmentCode` | mapped - source value delivered verbatim |
| `name` | mapped - source value delivered verbatim |
| `description` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `manufacturer` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `model` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `serialNumber` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `assetTag` | mapped - source value delivered verbatim |
| `equipmentClass` | mapped - source value delivered verbatim; blank kept as empty string (as-received "no data") |
| `criticality` | mapped - source value delivered verbatim |
| `installationDate` | nullable - blank src -> null |
| `warrantyExpiryDate` | nullable - blank src -> null |
| `operationalStatus` | blank src -> "Active" (schema default) |
| `technicalParameters` | blank src -> {} (schema default) |
| `createdBy` | blank src -> "system" (schema default); mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `modifiedBy` | blank src -> "system" (schema default); mapped - source value delivered verbatim |
| `modifiedDate` | mapped - source value delivered verbatim |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `equipmentId`


### Material (`Material` model)

- total rows: 5687
- mapped rows: 5687
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 5687
- accuracy: 100.00% (5687 / 5687) (target 99.9%)
- elapsed to import the sample: 44 ms mapping + 24445 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `materialId` | not carried (server-generated or blank-on-import default) |
| `materialCode` | mapped - source value delivered verbatim |
| `description` | mapped - source value delivered verbatim |
| `unitOfMeasure` | mapped - source value delivered verbatim |
| `standardCost` | mapped - source value delivered verbatim |
| `currentStock` | mapped - source value delivered verbatim |
| `createdBy` | not carried (server-generated or blank-on-import default) |
| `createdDate` | not carried (server-generated or blank-on-import default) |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `materialId`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`


### Notification (`Notification` model)

- total rows: 2160
- mapped rows: 2160
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 2160
- accuracy: 100.00% (2160 / 2160) (target 99.9%)
- elapsed to import the sample: 44 ms mapping + 11187 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `notificationId` | not carried (server-generated or blank-on-import default) |
| `notificationNumber` | mapped - source value delivered verbatim |
| `type` | mapped - source value delivered verbatim |
| `priority` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `equipmentId` | nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode |
| `reportedByUserId` | FK reference - resolved to the User row by username |
| `description` | mapped - source value delivered verbatim |
| `damagesObservations` | nullable - blank src -> null |
| `breakdownFlag` | blank src -> false (schema default) |
| `status` | blank src -> "Open" (schema default) |
| `createdBy` | mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `notificationId`, `modifiedBy`, `modifiedDate`
- workbook columns with no delivered counterpart (from FILL_REPORT 'Unmapped / excluded source fields'):
  - `Equip Discrp` - duplicate of canonical source field - filled elsewhere
  - `F.L Discrp` - duplicate of canonical source field - filled elsewhere
  - `reference1` - no template target
  - `Number of Employee:` - excluded by decision - required source absent (work-order operations)
  - `Duration / Employee` - excluded by decision - required source absent (work-order operations)
  - `Total Duration` - excluded by decision - required source absent (work-order operations)
  - `E3 / MCP rows` - excluded by decision - requires application change


### WorkOrder (`WorkOrder` model)

- total rows: 2170
- mapped rows: 2170
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 2170
- accuracy: 100.00% (2170 / 2170) (target 99.9%)
- elapsed to import the sample: 283 ms mapping + 15084 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `workOrderId` | not carried (server-generated or blank-on-import default) |
| `woNumber` | mapped - source value delivered verbatim |
| `type` | mapped - source value delivered verbatim |
| `priority` | mapped - source value delivered verbatim |
| `status` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `equipmentId` | nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode |
| `description` | mapped - source value delivered verbatim |
| `workCenterId` | FK reference - resolved to the WorkCenter row by code |
| `supervisorUserId` | derived - blank supervisorUserId backfilled to reportedByUserId (owner decision; app conversion convention) |
| `reportedByUserId` | FK reference - resolved to the User row by username |
| `plannedStart` | nullable - blank src -> null; mapped - source value delivered verbatim |
| `plannedFinish` | nullable - blank src -> null; mapped - source value delivered verbatim |
| `actualStart` | nullable - blank src -> null |
| `actualFinish` | nullable - blank src -> null |
| `costCenterCode` | blank src -> "" (schema default) |
| `internalOrder` | blank src -> "" (schema default) |
| `breakdownFlag` | blank src -> false (schema default) |
| `safetyCriticalFlag` | blank src -> false (schema default) |
| `causeCodeId` | nullable - blank src -> null |
| `failureCodeId` | nullable - blank src -> null |
| `safetyNotes` | nullable - blank src -> null |
| `completionRemarks` | nullable - blank src -> null |
| `calibrationResult` | nullable - blank src -> null |
| `calibrationAsFound` | nullable - blank src -> null |
| `calibrationAsLeft` | nullable - blank src -> null |
| `calibrationReferenceStandard` | nullable - blank src -> null |
| `calibrationDueDate` | nullable - blank src -> null |
| `calibrationIntervalValue` | nullable - blank src -> null |
| `calibrationIntervalUnit` | nullable - blank src -> null |
| `plannedCost` | blank src -> "0.00" (schema default) |
| `actualCost` | blank src -> "0.00" (schema default) |
| `createdBy` | mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |
| `sourcePlanId` | nullable - blank src -> null |
| `sourcePlanCycle` | nullable - blank src -> null |

Unmapped source fields:

- CSV columns not carried: `workOrderId`, `modifiedBy`, `modifiedDate`
- workbook columns with no delivered counterpart (from FILL_REPORT 'Unmapped / excluded source fields'):
  - `Equip Discrp` - duplicate of canonical source field - filled elsewhere
  - `F.L Discrp` - duplicate of canonical source field - filled elsewhere
  - `reference1` - no template target
  - `Number of Employee:` - excluded by decision - required source absent (work-order operations)
  - `Duration / Employee` - excluded by decision - required source absent (work-order operations)
  - `Total Duration` - excluded by decision - required source absent (work-order operations)
  - `E3 / MCP rows` - excluded by decision - requires application change


### WorkOrderNotifLink (`WorkOrderNotifLink` model)

- total rows: 2170
- mapped rows: 2170
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 2170
- accuracy: 100.00% (2170 / 2170) (target 99.9%)
- elapsed to import the sample: 22 ms mapping + 8592 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `workOrderId` | FK reference - resolved to the WorkOrder row by woNumber |
| `notificationId` | FK reference - resolved to the Notification row by notificationNumber |
| `createdBy` | mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `modifiedBy`, `modifiedDate`


### Comment (`Comment` model)

- total rows: 1549
- mapped rows: 1549
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 1549
- accuracy: 100.00% (1549 / 1549) (target 99.9%)
- elapsed to import the sample: 20 ms mapping + 6275 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `commentId` | not carried (server-generated or blank-on-import default) |
| `entityType` | mapped - source value delivered verbatim |
| `entityId` | mapped - source value delivered verbatim |
| `userId` | FK reference - resolved to the User row by username |
| `content` | mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `createdBy` | mapped - source value delivered verbatim |
| `modifiedBy` | not carried (server-generated or blank-on-import default) |
| `modifiedDate` | not carried (server-generated or blank-on-import default) |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `commentId`, `modifiedBy`, `modifiedDate`
