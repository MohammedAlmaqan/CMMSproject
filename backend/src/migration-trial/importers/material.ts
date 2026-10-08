/** Material importer: 14 rows. standardCost and currentStock are the owner-rule
 * figures carried from the fill report; audit columns are blank-on-import. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, decimalCol, floatCol } from './read.js';
import { cell, derived, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'Material',
    model: 'Material',
    naturalKey: { field: 'materialCode', column: 'materialCode' },
    pkField: 'materialId',
    rows: [],
    rejected: [],
  };

  const materialCode = textCol({ required: true });
  const description = textCol({ required: true });
  const unitOfMeasure = textCol({ required: true });
  const standardCost = decimalCol({ required: true });
  const currentStock = floatCol({ required: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'materialCode', materialCode(row.cells['materialCode'] ?? '', 'materialCode'));
      cell(b, 'description', description(row.cells['description'] ?? '', 'description'));
      cell(b, 'unitOfMeasure', unitOfMeasure(row.cells['unitOfMeasure'] ?? '', 'unitOfMeasure'));
      cell(b, 'standardCost', standardCost(row.cells['standardCost'] ?? '', 'standardCost'));
      cell(b, 'currentStock', currentStock(row.cells['currentStock'] ?? '', 'currentStock'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.materialCode),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.materialCode, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const materialImporter: DatasetImporter = {
  name: 'Material',
  model: 'Material',
  naturalKey: { field: 'materialCode', column: 'materialCode' },
  pkField: 'materialId',
  parse,
};