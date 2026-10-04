import type {
  Craft,
  CauseCode,
  Equipment,
  EquipmentMeter,
  FailureCode,
  FunctionalLocation,
  MaintenancePlan,
  Material,
  SafetyChecklistTemplate,
  TaskList,
  User,
  WorkCenter,
  WorkOrder,
  WorkOrderOperation,
} from '@prisma/client';

/** Only real columns of the model may be listed, so a typo is a compile error
 *  rather than a field that silently never matches and never gets audited. */
type AuditedColumns<T> = readonly (keyof T & string)[];

/**
 * The business columns of each master-data table that an edit is audited
 * against.
 *
 * System columns are omitted on purpose: `createdBy`, `createdDate`,
 * `modifiedBy`, `modifiedDate`, `isDeleted` and the primary key change on
 * essentially every write, so including them would mean the trail is mostly a
 * record of its own bookkeeping. A row is worth auditing when a human can tell
 * from it what was actually edited.
 *
 * Kept in one file because "which columns are auditable" is a compliance
 * decision (SOW 3.6), not something to be re-decided implicitly at each of a
 * dozen call sites. The column names are taken from the Prisma schema and
 * checked against the generated model types at compile time.
 */
export const AUDITED_FIELDS = {
  Equipment: [
    'equipmentCode', 'name', 'description', 'functionalLocationId', 'manufacturer',
    'model', 'serialNumber', 'assetTag', 'equipmentClass', 'criticality',
    'installationDate', 'warrantyExpiryDate', 'operationalStatus', 'technicalParameters',
  ] satisfies AuditedColumns<Equipment>,

  FunctionalLocation: [
    'locationCode', 'description', 'parentLocationId', 'locationType',
    'operationalStatus', 'installationDate', 'gpsCoordinates', 'safetyCritical',
  ] satisfies AuditedColumns<FunctionalLocation>,

  Material: [
    'materialCode', 'description', 'unitOfMeasure', 'standardCost', 'currentStock',
  ] satisfies AuditedColumns<Material>,

  WorkCenter: [
    'code', 'name', 'dailyCapacityHours', 'costRatePerHour', 'isActive',
  ] satisfies AuditedColumns<WorkCenter>,

  Craft: [
    'workCenterId', 'craftCode', 'description', 'hourlyRate',
  ] satisfies AuditedColumns<Craft>,

  FailureCode: [
    'parentCodeId', 'code', 'description',
  ] satisfies AuditedColumns<FailureCode>,

  CauseCode: [
    'code', 'description',
  ] satisfies AuditedColumns<CauseCode>,

  TaskList: [
    'code', 'description', 'equipmentClass', 'equipmentId', 'workCenterId',
  ] satisfies AuditedColumns<TaskList>,

  EquipmentMeter: [
    'equipmentId', 'meterName', 'unitOfMeasure', 'lastReading', 'lastReadingDate',
  ] satisfies AuditedColumns<EquipmentMeter>,

  MaintenancePlan: [
    'planCode', 'description', 'equipmentId', 'functionalLocationId', 'workCenterId',
    'taskListId', 'strategyType', 'intervalValue', 'intervalUnit', 'callHorizonValue',
    'callHorizonUnit', 'startDate', 'endDate', 'priority', 'generatedWorkOrderStatus',
    'notificationId', 'activeFlag',
  ] satisfies AuditedColumns<MaintenancePlan>,

  SafetyChecklistTemplate: [
    'name', 'description', 'isMandatory',
  ] satisfies AuditedColumns<SafetyChecklistTemplate>,

  // Transactional tables, not master data, but they carry the edits an
  // investigator actually asks about. Added when SOW 3.3.8's coverage was
  // re-measured and these three were closed.

  User: [
    'username', 'fullName', 'email', 'role', 'workCenterId', 'isActive',
  ] satisfies AuditedColumns<User>,
  // `passwordHash` is absent on purpose: a diff would put the old and new
  // secret in an audit row, so the password endpoint stays action-only. Nor are
  // `failedLoginCount`, `lockedUntil` or `lastLogin`, which are lockout state
  // written by the login path rather than edits an administrator makes.

  WorkOrder: [
    'type', 'priority', 'status', 'functionalLocationId', 'equipmentId',
    'description', 'workCenterId', 'supervisorUserId', 'reportedByUserId',
    'plannedStart', 'plannedFinish', 'actualStart', 'actualFinish',
    'costCenterCode', 'internalOrder', 'breakdownFlag', 'safetyCriticalFlag',
    'causeCodeId', 'safetyNotes', 'completionRemarks', 'calibrationResult',
    'calibrationAsFound', 'calibrationAsLeft', 'calibrationReferenceStandard',
    'calibrationDueDate', 'calibrationIntervalValue', 'calibrationIntervalUnit',
  ] satisfies AuditedColumns<WorkOrder>,
  // `plannedCost` and `actualCost` are absent because `utils/costs.ts` already
  // diffs them on every recompute; listing them here would log the same change
  // twice. `woNumber` and `sourcePlanId`/`sourcePlanCycle` are absent because
  // they are generated once at creation and never edited.

  WorkOrderOperation: [
    'sequenceNumber', 'description', 'craftId', 'plannedHours',
    'numberOfTechnicians', 'actualHours', 'status',
  ] satisfies AuditedColumns<WorkOrderOperation>,
} as const;

export type AuditedTable = keyof typeof AUDITED_FIELDS;
