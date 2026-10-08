/** Comment importer: the single sampled WO&Notf `Note` row. entityId is a plain
 * string (the WO number); userId resolves to the creator. */
import type { TrialCsvRow } from './csv.js';
import type { DatasetResult, DatasetImporter } from './types.js';
import { textCol, dateCol, enumCol } from './read.js';
import { cell, derived, resolve, RowError, type RowBuilder } from './build.js';
import { ROW_KEY } from './util.js';
import { commentEntityTypeSchema } from '../../utils/validation.js';

function parse(rows: TrialCsvRow[]): DatasetResult {
  const result: DatasetResult = {
    name: 'Comment',
    model: 'Comment',
    pkField: 'commentId',
    rows: [],
    rejected: [],
  };

  const entityType = enumCol(commentEntityTypeSchema, {});
  const entityId = textCol({ required: true });
  const userId = textCol({ required: true });
  const content = textCol({ required: true });
  const createdDate = dateCol({ required: true });
  const createdBy = textCol({ required: true });

  for (const row of rows) {
    const b: RowBuilder = { target: {}, provenance: {}, refs: [] };
    try {
      cell(b, 'entityType', entityType(row.cells['entityType'] ?? '', 'entityType'));
      cell(b, 'entityId', entityId(row.cells['entityId'] ?? '', 'entityId'));
      const user = userId(row.cells['userId'] ?? '', 'userId');
      cell(b, 'userId', user);
      if (user.kind === 'mapped') resolve(b, 'userId', user.value, 'User', 'username');
      cell(b, 'content', content(row.cells['content'] ?? '', 'content'));
      cell(b, 'createdDate', createdDate(row.cells['createdDate'] ?? '', 'createdDate'));
      cell(b, 'createdBy', createdBy(row.cells['createdBy'] ?? '', 'createdBy'));
      derived(b, 'isDeleted', false, 'isDeleted=false on import (README convention)');
      result.rows.push({
        row: row.number,
        key: ROW_KEY(b.target.entityId),
        target: b.target,
        provenance: b.provenance,
        refs: b.refs,
      });
    } catch (err) {
      if (err instanceof RowError) {
        result.rejected.push({ row: row.number, key: ROW_KEY(b.target.entityId, row.number), reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return result;
}

export const commentImporter: DatasetImporter = {
  name: 'Comment',
  model: 'Comment',
  pkField: 'commentId',
  parse,
};