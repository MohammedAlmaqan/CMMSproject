import type {
  Craft,
  Equipment,
  EquipmentMeter,
  FailureCode,
  FunctionalLocation,
  MaintenancePlan,
  Material,
  SafetyChecklistTemplate,
  TaskList,
  WorkCenter,
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
} as const;

export type AuditedTable = keyof typeof AUDITED_FIELDS;
