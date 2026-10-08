/** WorkOrder importer: 13 rows. supervisorUserId is blank by owner decision and
 * backfilled to the reporter (creator), mirroring the converter convention. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol, boolCol, decimalCol, intCol, enumCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { prioritySchema, workOrderStatusSchema, workOrderTypeSchema } from '../../utils/validation.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'WorkOrder',
    model: 'WorkOrder',
    naturalKey: { field: 'woNumber', column: 'woNumber' },
    pkField: 'workOrderId',
    rows: [],
    rejected: [],
  };

  const woNumber = textCol({ required: true });
  const type = enumCol(workOrderTypeSchema, {});
  const priority = enumCol(prioritySchema, {});
  const status = enumCol(workOrderStatusSchema, {});
  const functionalLocationId = textCol({ required: true });
  const equipmentId = textCol({});
  const description = textCol({ required: true });
  const workCenterId = textCol({ required: true });
  const supervisorUserId = textCol({});
  const reportedByUserId = textCol({ required: true });
  const plannedStart = dateCol();
  const plannedFinish = dateCol();
  const actualStart = dateCol();
  const actualFinish = dateCol();
  // Optional (nullable) columns per the templates README line 283; a blank
  // source cell is an absent value, so it lands null rather than a fabricated "".
  const costCenterCode = textCol({});
  const internalOrder = textCol({});
  const breakdownFlag = boolCol({ blankDefault: false });
  const safetyCriticalFlag = boolCol({ blankDefault: false });
  const causeCodeId = textCol({});
  const failureCodeId = textCol({});
  const safetyNotes = textCol({});
  const completionRemarks = textCol({});
  const calibrationResult = textCol({});
  const calibrationAsFound = textCol({});
  const calibrationAsLeft = textCol({});
  const calibrationReferenceStandard = textCol({});
  const calibrationDueDate = dateCol();
  const calibrationIntervalValue = intCol({});
  const calibrationIntervalUnit = textCol({});
  const plannedCost = decimalCol({ blankDefault: '0.00' });
  const actualCost = decimalCol({ blankDefault: '0.00' });
  const createdBy = textCol({ required: true });
  const createdDate = dateCol({ required: true });
  const sourcePlanId = textCol({});
  const sourcePlanCycle = textCol({});

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'woNumber', woNumber(row.cells['woNumber'] ?? '', 'woNumber'));
      cell(b, 'type', type(row.cells['type'] ?? '', 'type'));
      cell(b, 'priority', priority(row.cells['priority'] ?? '', 'priority'));
      cell(b, 'status', status(row.cells['status'] ?? '', 'status'));
      const fl = functionalLocationId(row.cells['functionalLocationId'] ?? '', 'functionalLocationId');
      cell(b, 'functionalLocationId', fl);
      if (fl.kind === 'mapped') resolve(b, 'functionalLocationId', fl.value, 'FunctionalLocation', 'locationCode');
      const eq = equipmentId(row.cells['equipmentId'] ?? '', 'equipmentId');
      cell(b, 'equipmentId', eq);
      if (eq.kind === 'mapped') resolve(b, 'equipmentId', eq.value, 'Equipment', 'equipmentCode');
      cell(b, 'description', description(row.cells['description'] ?? '', 'description'));
      const wc = workCenterId(row.cells['workCenterId'] ?? '', 'workCenterId');
      cell(b, 'workCenterId', wc);
      if (wc.kind === 'mapped') resolve(b, 'workCenterId', wc.value, 'WorkCenter', 'code');
      const reporter = reportedByUserId(row.cells['reportedByUserId'] ?? '', 'reportedByUserId');
      cell(b, 'reportedByUserId', reporter);
      if (reporter.kind === 'mapped') resolve(b, 'reportedByUserId', reporter.value, 'User', 'username');

      // supervisorUserId: blank by owner decision; resolved at import to the
      // reporter (creator) so the required FK names an existing user - the
      // convention the application already uses when converting a notification
      // (notifications.ts: supervisor defaults to the reporting user).
      const supervisor = supervisorUserId(row.cells['supervisorUserId'] ?? '', 'supervisorUserId');
      if (supervisor.kind === 'blank-to-null' || supervisor.kind === 'as-is-empty') {
        const backfilled = String(b.target.reportedByUserId ?? '');
        b.target.supervisorUserId = backfilled;
        b.provenance.supervisorUserId = {
          kind: 'derived',
          note: 'blank supervisorUserId backfilled to reportedByUserId (owner decision; app conversion convention)',
        };
        b.refs.push({ field: 'supervisorUserId', dataset: 'User', column: 'username' });
      } else {
        cell(b, 'supervisorUserId', supervisor);
        if (supervisor.kind === 'mapped') resolve(b, 'supervisorUserId', supervisor.value, 'User', 'username');
      }

      cell(b, 'plannedStart', plannedStart(row.cells['plannedStart'] ?? '', 'plannedStart'));
      cell(b, 'plannedFinish', plannedFinish(row.cells['plannedFinish'] ?? '', 'plannedFinish'));
      cell(b, 'actualStart', actualStart(row.cells['actualStart'] ?? '', 'actualStart'));
      cell(b, 'actualFinish', actualFinish(row.cells['actualFinish'] ?? '', 'actualFinish'));
      cell(b, 'costCenterCode', costCenterCode(row.cells['costCenterCode'] ?? '', 'costCenterCode'));
      cell(b, 'internalOrder', internalOrder(row.cells['internalOrder'] ?? '', 'internalOrder'));
      cell(b, 'breakdownFlag', breakdownFlag(row.cells['breakdownFlag'] ?? '', 'breakdownFlag'));
      cell(b, 'safetyCriticalFlag', safetyCriticalFlag(row.cells['safetyCriticalFlag'] ?? '', 'safetyCriticalFlag'));
      cell(b, 'causeCodeId', causeCodeId(row.cells['causeCodeId'] ?? '', 'causeCodeId'));
      cell(b, 'failureCodeId', failureCodeId(row.cells['failureCodeId'] ?? '', 'failureCodeId'));
      cell(b, 'safetyNotes', safetyNotes(row.cells['safetyNotes'] ?? '', 'safetyNotes'));
      cell(b, 'completionRemarks', completionRemarks(row.cells['completionRemarks'] ?? '', 'completionRemarks'));
      cell(b, 'calibrationResult', calibrationResult(row.cells['calibrationResult'] ?? '', 'calibrationResult'));
      cell(b, 'calibrationAsFound', calibrationAsFound(row.cells['calibrationAsFound'] ?? '', 'calibrationAsFound'));
      cell(b, 'calibrationAsLeft', calibrationAsLeft(row.cells['calibrationAsLeft'] ?? '', 'calibrationAsLeft'));
      cell(b, 'calibrationReferenceStandard', calibrationReferenceStandard(row.cells['calibrationReferenceStandard'] ?? '', 'calibrationReferenceStandard'));
      cell(b, 'calibrationDueDate', calibrationDueDate(row.cells['calibrationDueDate'] ?? '', 'calibrationDueDate'));
      cell(b, 'calibrationIntervalValue', calibrationIntervalValue(row.cells['calibrationIntervalValue'] ?? '', 'calibrationIntervalValue'));
      cell(b, 'calibrationIntervalUnit', calibrationIntervalUnit(row.cells['calibrationIntervalUnit'] ?? '', 'calibrationIntervalUnit'));
      cell(b, 'plannedCost', plannedCost(row.cells['plannedCost'] ?? '', 'plannedCost'));
      cell(b, 'actualCost', actualCost(row.cells['actualCost'] ?? '', 'actualCost'));
      cell(b, 'createdBy', createdBy(row.cells['createdBy'] ?? '', 'createdBy'));
      cell(b, 'createdDate', createdDate(row.cells['createdDate'] ?? '', 'createdDate'));
      cell(b, 'sourcePlanId', sourcePlanId(row.cells['sourcePlanId'] ?? '', 'sourcePlanId'));
      cell(b, 'sourcePlanCycle', sourcePlanCycle(row.cells['sourcePlanCycle'] ?? '', 'sourcePlanCycle'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.woNumber),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.woNumber, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

function verify(created: Record<string, unknown>): string[] {
  const diffs: string[] = [];
  if (created.supervisorUserId !== created.reportedByUserId) {
    diffs.push('derived supervisorUserId did not land equal to reportedByUserId');
  }
  return diffs;
}

export const workOrderImporter: DatasetImporter = {
  name: 'WorkOrder',
  model: 'WorkOrder',
  naturalKey: { field: 'woNumber', column: 'woNumber' },
  pkField: 'workOrderId',
  parse,
  verify,
};