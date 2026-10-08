/** WorkCenter importer: 4 rows, parents before children, no FK beyond itself. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, floatCol, decimalCol, boolCol } from './read.js';
import { cell, derived, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'WorkCenter',
    model: 'WorkCenter',
    naturalKey: { field: 'code', column: 'code' },
    pkField: 'workCenterId',
    rows: [],
    rejected: [],
  };

  const code = textCol({ required: true });
  const name = textCol({ required: true });
  const dailyCapacityHours = floatCol({ required: true });
  const costRatePerHour = decimalCol({ required: true });
  const isActive = boolCol({ blankDefault: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'code', code(row.cells['code'] ?? '', 'code'));
      cell(b, 'name', name(row.cells['name'] ?? '', 'name'));
      cell(b, 'dailyCapacityHours', dailyCapacityHours(row.cells['dailyCapacityHours'] ?? '', 'dailyCapacityHours'));
      cell(b, 'costRatePerHour', costRatePerHour(row.cells['costRatePerHour'] ?? '', 'costRatePerHour'));
      cell(b, 'isActive', isActive(row.cells['isActive'] ?? '', 'isActive'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.code),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.code), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const workCenterImporter: DatasetImporter = {
  name: 'WorkCenter',
  model: 'WorkCenter',
  naturalKey: { field: 'code', column: 'code' },
  pkField: 'workCenterId',
  parse,
};