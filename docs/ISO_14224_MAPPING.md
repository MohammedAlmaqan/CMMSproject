# ISO 14224 Field Mapping (SOW §4.5, row 267)

**Status:** Delivered 2026-10-03. Documentation only — no schema or API change.
**Source of truth:** `backend/prisma/schema.prisma`.
**Standard:** ISO 14224:2016, *Petroleum, petrochemical and natural gas
industries — Collection and exchange of reliability and maintenance data for
equipment*.

This document maps the CMMS data model to the ISO 14224 data categories and
records, honestly, where the model carries a taxonomy and where it does not.
It is the §4.5 deliverable: the SOW asks that the data model *align* with
ISO 14224, not that the application be certified against it.

## 1. Why ISO 14224, and what the SOW clause means

ISO 14224 defines a common taxonomy for reliability and maintenance data so
that failure and maintenance records collected at one plant can be exchanged
and compared with records from another. It organises the data into five
categories:

| # | ISO 14224 data category | What it records |
|---|---|---|
| 1 | Equipment data | Taxonomy of the physical asset and its attributes |
| 2 | Failure data | What failed, how, why and with what consequence |
| 3 | Maintenance data | What was done to restore or preserve the function |
| 4 | Operational data | How the asset is run (hours, starts, throughput) |
| 5 | Safety / environmental data | Whether the event affected people or the environment |

The standard does not mandate a schema. It mandates that each category's
fields exist somewhere, be consistently named, and use the standard's
code lists where a code list is defined. The mapping below is therefore
expressed as **covered / partly covered / absent** per field, not as a
compliance claim.

## 2. Asset-taxonomy mapping

ISO 14224 builds a fixed location hierarchy: *Industry → Business category →
Installation → Plant → Section / System → Equipment unit → Subunit*. The
CMMS expresses the lower half of that hierarchy across two models.

### 2.1 `FunctionalLocation`

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `locationCode` | Location / tag number | Covered |
| `locationType` (`Plant`, `Area`, `Unit`, `Sub-unit`, `System`) | Plant / Section / System level | Covered — the five levels map directly onto the standard's intermediate levels |
| `parentLocationId` | Location hierarchy (self-relation) | Covered |
| `description` | Location name / description | Covered |
| `installationDate` | Installation / commissioning date | Covered |
| `gpsCoordinates` | Installation location | Covered |
| `safetyCritical` | Safety-critical classification | Covered |
| `operationalStatus` | Operational status | Covered |

### 2.2 `Equipment`

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `equipmentCode` | Equipment tag / identification number | Covered |
| `name`, `description` | Equipment description | Covered |
| `equipmentClass` | Equipment class (ISO 14224 Annex A taxonomy) | Covered — free text, so the standard's class list is not enforced (see §6) |
| `manufacturer`, `model` | Manufacturer, model | Covered |
| `serialNumber` | Serial / equipment number | Covered |
| `assetTag` | Owner asset number | Covered |
| `functionalLocationId` | Parent location | Covered |
| `criticality` (`S`, `A`, `B`, `C`) | Criticality / importance | Covered |
| `installationDate`, `warrantyExpiryDate` | Dates of installation / warranty | Covered |
| `operationalStatus` (`Active`, `Inactive`, `Decommissioned`) | Equipment status | Covered |
| `technicalParameters` (JSON) | Technical / design data | Covered — open field, not enumerated |
| `meters` → `EquipmentMeter` | Operational data (see §5) | Covered |

### 2.3 `EquipmentBOMMaterial`

The bill of materials is the ISO 14224 *subunit / component* layer: the parts
that make up an equipment unit and can individually fail or be replaced.

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `equipmentId` + `materialId` | Equipment unit → component | Covered as a flat BOM |
| `quantity` | Component count | Covered |
| (absent) | Component-level failure reference | Absent — failures attach to the equipment unit, not a named subunit |

## 3. Failure-data mapping

ISO 14224 splits failure data into **failure mode** (the observable way the
equipment failed to perform), **failure cause / mechanism** (why it failed),
**detection method**, and **failure effect / severity**.

The CMMS models the failure taxonomy in two code tables and links one of
them to the work order.

### 3.1 `CauseCode` — failure cause

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `code` | Cause code | Covered |
| `description` | Cause description | Covered |
| `WorkOrder.causeCodeId` | Link from a maintenance record to its cause | Covered — required on completion of a breakdown job, not at raise time |

The standard groups causes (design, fabrication/installation,
operation/maintenance, tools/other equipment, miscellaneous) and mechanisms
(mechanical, material, electrical, external influence, other). `CauseCode`
carries a flat code and description with no grouping field, so a cause can be
recorded but not rolled up into the standard's cause groups without an
external mapping (see §6).

### 3.2 `FailureCode` — failure mode

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `code` | Failure mode code | Covered |
| `description` | Failure mode description | Covered |
| `parentCodeId` | Failure-mode hierarchy | Covered (self-relation) |
| (no referencing column) | Link from a maintenance / failure record | **Absent** |

`FailureCode` exists as a hierarchical taxonomy but **no other model
references it** — there is no `WorkOrder.failureCodeId` and no
`Notification.failureCodeId`. The taxonomy can be maintained but not applied
to a real failure record. This is the open half of tracker v1.1-1 and is
carried as **L35**; it is the single largest alignment gap in this document.

### 3.3 `Notification` — failure / maintenance-request event

ISO 14224 records a failure event as an observation against an equipment unit
with a time stamp, a description of what was seen, and a failure consequence.

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `notificationNumber` | Event / record identification | Covered |
| `type` (`M1`, `M2`, `M3`) | Failure / maintenance notification type | Partly — the codes are CMMS-defined, not the standard's |
| `priority` | Severity / priority | Covered |
| `functionalLocationId`, `equipmentId` | Location and equipment of the event | Covered |
| `reportedByUserId` | Reporting / detection person | Covered |
| `createdDate` | Date and time of report | Covered |
| `description` | Event description | Covered |
| `damagesObservations` | Observed damage / failure effect | Covered |
| `breakdownFlag` | Failure vs. planned-maintenance distinction | Covered |
| `status` | Event lifecycle state | Covered |
| (absent) | Failure mode / mechanism reference | Absent — see §3.2 |
| (absent) | Failure detection method | Absent |
| (absent) | Failure impact / consequence code | Absent |

## 4. Maintenance-data mapping

ISO 14224 records maintenance as an activity against an equipment unit: the
maintenance *category* (preventive or corrective), the *activity* performed,
the resource and time consumed, and the resulting asset state.

### 4.1 `WorkOrder`

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `woNumber` | Maintenance record identification | Covered |
| `type` (`CM`, `PM`, `PdM`, `EM`, `CAL`) | Maintenance category — corrective, preventive/predictive, emergency, calibration | Covered |
| `priority` | Priority | Covered |
| `status` (`Draft` … `Closed`, `Cancelled`) | Maintenance-record lifecycle | Covered |
| `functionalLocationId`, `equipmentId` | Maintained item | Covered |
| `breakdownFlag` | Corrective vs. planned distinction | Covered |
| `causeCodeId` | Failure cause | Covered |
| `plannedStart`, `plannedFinish`, `actualStart`, `actualFinish` | Planned vs. actual times (downtime) | Covered |
| `operations` → `WorkOrderOperation` | Maintenance activities / tasks performed | Covered (per-step craft, planned hours, technicians) |
| `woMaterials` → `WorkOrderMaterial` | Spare parts consumed | Covered |
| `laborEntries` | Man-hours by craft/person | Covered |
| `externalServices` → `ExternalServiceCost` | Contractor / service activity | Covered |
| `plannedCost`, `actualCost` | Maintenance cost | Covered |
| `safetyNotes`, `completionRemarks` | Work performed / observations | Covered |
| `snapshots` → `WorkOrderSnapshot` | Immutable history at each status change | Covered |
| `calibrationResult`, `calibrationAsFound`, `calibrationAsLeft`, `calibrationReferenceStandard`, `calibrationDueDate`, `calibrationIntervalValue`, `calibrationIntervalUnit` | Calibration data | Covered (CAL jobs) |
| (absent) | Downtime duration as an explicit field | Partly — recoverable from `actualStart`/`actualFinish`; not stored as a field |
| (absent) | Failure mode reference | Absent — see §3.2 |

### 4.2 `MaintenancePlan`

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `planCode`, `description` | Maintenance plan identification | Covered |
| `strategyType` (`Time`, `Meter`, `Combined`) | Preventive-maintenance trigger type | Covered |
| `intervalValue`, `intervalUnit`, `callHorizonValue`, `callHorizonUnit` | Predetermined maintenance interval | Covered |
| `startDate`, `endDate` | Plan validity | Covered |
| `priority` | Priority | Covered |
| `generatedWorkOrderStatus` | Target state of the generated maintenance record | Covered |
| `notificationId` | Associated notification | Covered |
| `taskListId` → `TaskList` | Standard job / procedure | Covered |
| `targets` → `MaintenancePlanTarget`, `planMeters` → `MaintenancePlanMeter` | Maintained item(s) and meter triggers | Covered |

### 4.3 `TaskList` / `TaskListOperation` / `TaskListMaterial`

The task list is the ISO 14224 *maintenance procedure*: an ordered set of
activities with the craft, planned hours and parts each step requires.

| CMMS field | ISO 14224 concept | Coverage |
|---|---|---|
| `code`, `description` | Procedure identification | Covered |
| `equipmentClass`, `equipmentId`, `workCenterId` | Applies-to and resource scope | Covered |
| `TaskListOperation.sequenceNumber`, `description`, `craftId`, `plannedHours`, `numberOfTechnicians` | Ordered maintenance activities and resources | Covered |
| `TaskListMaterial` | Parts required per step | Covered |

## 5. Operational-data mapping

| CMMS model / field | ISO 14224 concept | Coverage |
|---|---|---|
| `EquipmentMeter.meterName`, `unitOfMeasure` | Operational parameter (e.g. running hours, starts, throughput) | Covered |
| `EquipmentMeter.lastReading`, `lastReadingDate` | Current operational value | Covered |
| `MeterReading.readingValue`, `readingDate` | Operational-data time series | Covered |
| `MaintenancePlanMeter.meterInterval` | Meter-based maintenance trigger | Covered |

## 6. Alignment gaps (stated plainly)

The model aligns with ISO 14224 at the taxonomy and record level. Four gaps
remain, all recorded against the SOW matrix and none a v1.0.0 blocker:

1. **Failure-mode application (L35 / v1.1-1).** `FailureCode` is a maintained
   taxonomy with no foreign key into `WorkOrder` or `Notification`. Failure
   mode can be defined but not recorded against a failure. Closing this is a
   schema change (a nullable `failureCodeId` on `WorkOrder` and/or
   `Notification`) and is deferred to v1.1.
2. **Code lists are free text.** `equipmentClass`, `CauseCode.code`,
   `FailureCode.code`, `WorkOrder.type` and the status columns are validated
   against CMMS-defined values, not against the standard's Annex A / code
   lists. This is deliberate (V1.1-4 in the tracker): the plant's own codes
   govern. The mapping to ISO code lists is external.
3. **No failure detection method or consequence code.** ISO 14224 records how
   a failure was detected and its consequence (safety, environment, production,
   cost). The CMMS captures `damagesObservations` and `safetyCriticalFlag`, but
   not a detection-method or consequence enumerations.
4. **No subunit-level failure.** Failures attach to the `Equipment` unit; the
   BOM is flat and does not carry a failure reference. Component-level
   reliability analysis therefore needs the free-text description.

## 7. Conclusion

The CMMS records all five ISO 14224 data categories. Equipment and
location taxonomy, maintenance data and operational data are fully
represented; failure data is represented through `CauseCode` and
`Notification` but the `FailureCode` taxonomy is not yet wired to a record.
The gaps in §6 are additive fields or foreign keys, not model redesigns, and
are tracked against the SOW matrix (**L35**, v1.1-1, V1.1-4). This document
satisfies SOW §4.5's requirement that the data model align with ISO 14224.
