# Trial-run report - migration sample

Run 2026-10-08T17:59:28.709Z (UTC) against the sample in `docs/migration-templates/*.filled.csv` at commit `cba06e3`, in the throwaway schema `cmms_trial_1712_1791482350316` on localhost:5432. The schema was created, migrated with `prisma migrate deploy` and dropped by this run; nothing in the app's `public` schema was touched.

Mapping rules in force are the current state of `docs/migration-templates/FILL_REPORT.md`; the SCE widening (commit `5aa0094`) is in force, so `Equipment.criticality` accepts `S > A > B > C` and the sampled SCE rows carry the literal `S`. Accuracy is defined in `docs/DATA_ASSESSMENT_REQUEST.md`: a row is correct when it is not rejected and every mapped field arrives value-unchanged; unmapped source fields are listed, never hidden. Blank cells land as documented per column (null, schema default, or the as-received empty string) and are reported below, not counted as wrong rows.

## Summary

| Dataset | Total | Mapped | Rejected | Correct | Accuracy | Import time |
|---|---|---|---|---|---|---|
| WorkCenter | 4 | 4 | 0 | 4 | 100.00% | 103 ms |
| User | 2 | 2 | 0 | 2 | 100.00% | 492 ms |
| FunctionalLocation | 22 | 22 | 0 | 22 | 100.00% | 444 ms |
| Equipment | 9 | 9 | 0 | 9 | 100.00% | 154 ms |
| Material | 14 | 14 | 0 | 14 | 100.00% | 421 ms |
| Notification | 13 | 13 | 0 | 13 | 100.00% | 337 ms |
| WorkOrder | 13 | 13 | 0 | 13 | 100.00% | 324 ms |
| WorkOrderNotifLink | 13 | 13 | 0 | 13 | 100.00% | 152 ms |
| Comment | 1 | 1 | 0 | 1 | 100.00% | 16 ms |
| **Overall** | 91 | 91 | 0 | 91 | 100.00% | 1956 ms |

Overall accuracy: 100.00% (91 / 91). Target 99.9%. Target met.

## Per-dataset detail

### WorkCenter (`WorkCenter` model)

- total rows: 4
- mapped rows: 4
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 4
- accuracy: 100.00% (4 / 4) (target 99.9%)
- elapsed to import the sample: 2.1 ms mapping + 101 ms persist

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
- elapsed to import the sample: 465 ms mapping + 27 ms persist

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

- total rows: 22
- mapped rows: 22
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 22
- accuracy: 100.00% (22 / 22) (target 99.9%)
- elapsed to import the sample: 1.7 ms mapping + 443 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `functionalLocationId` | not carried (server-generated or blank-on-import default) |
| `locationCode` | mapped - source value delivered verbatim |
| `description` | mapped - source value delivered verbatim |
| `parentLocationId` | nullable - blank src -> null; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode; FK reference - resolved to the FunctionalLocation row by locationCode |
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

- total rows: 9
- mapped rows: 9
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 9
- accuracy: 100.00% (9 / 9) (target 99.9%)
- elapsed to import the sample: 12 ms mapping + 143 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `equipmentId` | not carried (server-generated or blank-on-import default) |
| `equipmentCode` | mapped - source value delivered verbatim |
| `name` | mapped - source value delivered verbatim |
| `description` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `manufacturer` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim |
| `model` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `serialNumber` | blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; mapped - source value delivered verbatim; blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `assetTag` | mapped - source value delivered verbatim |
| `equipmentClass` | mapped - source value delivered verbatim; blank kept as empty string (as-received "no data"); mapped - source value delivered verbatim |
| `criticality` | mapped - source value delivered verbatim |
| `installationDate` | nullable - blank src -> null |
| `warrantyExpiryDate` | nullable - blank src -> null |
| `operationalStatus` | blank src -> "Active" (schema default) |
| `technicalParameters` | blank src -> {} (schema default) |
| `createdBy` | blank src -> "system" (schema default); mapped - source value delivered verbatim; blank src -> "system" (schema default); blank src -> "system" (schema default); blank src -> "system" (schema default); blank src -> "system" (schema default); mapped - source value delivered verbatim |
| `createdDate` | mapped - source value delivered verbatim |
| `modifiedBy` | blank src -> "system" (schema default); mapped - source value delivered verbatim; blank src -> "system" (schema default); blank src -> "system" (schema default); blank src -> "system" (schema default); blank src -> "system" (schema default); blank src -> "system" (schema default); mapped - source value delivered verbatim; mapped - source value delivered verbatim |
| `modifiedDate` | mapped - source value delivered verbatim |
| `isDeleted` | derived - isDeleted=false on import (README convention) |

Unmapped source fields:

- CSV columns not carried: `equipmentId`


### Material (`Material` model)

- total rows: 14
- mapped rows: 14
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 14
- accuracy: 100.00% (14 / 14) (target 99.9%)
- elapsed to import the sample: 0.8 ms mapping + 420 ms persist

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

- total rows: 13
- mapped rows: 13
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 13
- accuracy: 100.00% (13 / 13) (target 99.9%)
- elapsed to import the sample: 1.3 ms mapping + 336 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `notificationId` | not carried (server-generated or blank-on-import default) |
| `notificationNumber` | mapped - source value delivered verbatim |
| `type` | mapped - source value delivered verbatim |
| `priority` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `equipmentId` | FK reference - resolved to the Equipment row by equipmentCode; nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode; nullable - blank src -> null; nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode |
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

- total rows: 13
- mapped rows: 13
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 13
- accuracy: 100.00% (13 / 13) (target 99.9%)
- elapsed to import the sample: 2.3 ms mapping + 321 ms persist

Mapped columns and what happened to each cell:

| Column | Delivery on import |
|---|---|
| `workOrderId` | not carried (server-generated or blank-on-import default) |
| `woNumber` | mapped - source value delivered verbatim |
| `type` | mapped - source value delivered verbatim |
| `priority` | mapped - source value delivered verbatim |
| `status` | mapped - source value delivered verbatim |
| `functionalLocationId` | FK reference - resolved to the FunctionalLocation row by locationCode |
| `equipmentId` | FK reference - resolved to the Equipment row by equipmentCode; nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode; nullable - blank src -> null; nullable - blank src -> null; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode; FK reference - resolved to the Equipment row by equipmentCode |
| `description` | mapped - source value delivered verbatim |
| `workCenterId` | FK reference - resolved to the WorkCenter row by code |
| `supervisorUserId` | derived - blank supervisorUserId backfilled to reportedByUserId (owner decision; app conversion convention) |
| `reportedByUserId` | FK reference - resolved to the User row by username |
| `plannedStart` | mapped - source value delivered verbatim |
| `plannedFinish` | mapped - source value delivered verbatim |
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

- total rows: 13
- mapped rows: 13
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 13
- accuracy: 100.00% (13 / 13) (target 99.9%)
- elapsed to import the sample: 1.3 ms mapping + 150 ms persist

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

- total rows: 1
- mapped rows: 1
- rejected rows: 0 (0 at mapping, 0 at persist)
- correct rows: 1
- accuracy: 100.00% (1 / 1) (target 99.9%)
- elapsed to import the sample: 0.6 ms mapping + 16 ms persist

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
