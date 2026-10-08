/** WorkOrderNotifLink importer: 13 pair rows. Both keys are natural keys that
 * resolve to the linked rows' ids. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'WorkOrderNotifLink',
    model: 'WorkOrderNotifLink',
    pkField: 'workOrderId',
    rows: [],
    rejected: [],
  };

  const workOrderId = textCol({ required: true });
  const notificationId = textCol({ required: true });
  const createdBy = textCol({ required: true });
  const createdDate = dateCol({ required: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      const wo = workOrderId(row.cells['workOrderId'] ?? '', 'workOrderId');
      cell(b, 'workOrderId', wo);
      if (wo.kind === 'mapped') resolve(b, 'workOrderId', wo.value, 'WorkOrder', 'woNumber');
      const notif = notificationId(row.cells['notificationId'] ?? '', 'notificationId');
      cell(b, 'notificationId', notif);
      if (notif.kind === 'mapped') resolve(b, 'notificationId', notif.value, 'Notification', 'notificationNumber');
      cell(b, 'createdBy', createdBy(row.cells['createdBy'] ?? '', 'createdBy'));
      cell(b, 'createdDate', createdDate(row.cells['createdDate'] ?? '', 'createdDate'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: `${ROW_KEY(b.target.workOrderId)} / ${ROW_KEY(b.target.notificationId)}`,
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({
          row: row.number,
          key: `${ROW_KEY(b.target.workOrderId, row.number)} / ${ROW_KEY(b.target.notificationId)}`,
          reason: err.message,
        });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const workOrderNotifLinkImporter: DatasetImporter = {
  name: 'WorkOrderNotifLink',
  model: 'WorkOrderNotifLink',
  pkField: 'workOrderId',
  parse,
};