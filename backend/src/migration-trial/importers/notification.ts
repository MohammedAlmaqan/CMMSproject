/** Notification importer: 13 rows, at most one per paired work order. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol, boolCol, enumCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { notificationStatusSchema, notificationTypeSchema, prioritySchema } from '../../utils/validation.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'Notification',
    model: 'Notification',
    naturalKey: { field: 'notificationNumber', column: 'notificationNumber' },
    pkField: 'notificationId',
    rows: [],
    rejected: [],
  };

  const notificationNumber = textCol({ required: true });
  const type = enumCol(notificationTypeSchema, {});
  const priority = enumCol(prioritySchema, {});
  const functionalLocationId = textCol({ required: true });
  const equipmentId = textCol({});
  const reportedByUserId = textCol({ required: true });
  const description = textCol({ required: true });
  const damagesObservations = textCol({});
  const breakdownFlag = boolCol({ blankDefault: false });
  const status = enumCol(notificationStatusSchema, { blankDefault: 'Open' });
  const createdBy = textCol({ required: true });
  const createdDate = dateCol({ required: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'notificationNumber', notificationNumber(row.cells['notificationNumber'] ?? '', 'notificationNumber'));
      cell(b, 'type', type(row.cells['type'] ?? '', 'type'));
      cell(b, 'priority', priority(row.cells['priority'] ?? '', 'priority'));
      const fl = functionalLocationId(row.cells['functionalLocationId'] ?? '', 'functionalLocationId');
      cell(b, 'functionalLocationId', fl);
      if (fl.kind === 'mapped') resolve(b, 'functionalLocationId', fl.value, 'FunctionalLocation', 'locationCode');
      const eq = equipmentId(row.cells['equipmentId'] ?? '', 'equipmentId');
      cell(b, 'equipmentId', eq);
      if (eq.kind === 'mapped') resolve(b, 'equipmentId', eq.value, 'Equipment', 'equipmentCode');
      const reporter = reportedByUserId(row.cells['reportedByUserId'] ?? '', 'reportedByUserId');
      cell(b, 'reportedByUserId', reporter);
      if (reporter.kind === 'mapped') resolve(b, 'reportedByUserId', reporter.value, 'User', 'username');
      cell(b, 'description', description(row.cells['description'] ?? '', 'description'));
      cell(b, 'damagesObservations', damagesObservations(row.cells['damagesObservations'] ?? '', 'damagesObservations'));
      cell(b, 'breakdownFlag', breakdownFlag(row.cells['breakdownFlag'] ?? '', 'breakdownFlag'));
      cell(b, 'status', status(row.cells['status'] ?? '', 'status'));
      cell(b, 'createdBy', createdBy(row.cells['createdBy'] ?? '', 'createdBy'));
      cell(b, 'createdDate', createdDate(row.cells['createdDate'] ?? '', 'createdDate'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.notificationNumber),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.notificationNumber, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const notificationImporter: DatasetImporter = {
  name: 'Notification',
  model: 'Notification',
  naturalKey: { field: 'notificationNumber', column: 'notificationNumber' },
  pkField: 'notificationId',
  parse,
};