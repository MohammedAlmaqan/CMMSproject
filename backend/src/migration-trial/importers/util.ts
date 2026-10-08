/** Small shared importer helpers. */
import type { ImportedRow } from './types.js';

/** Plain-word key for a row: the natural-key value when known, else its ordinal. */
export function ROW_KEY(known: unknown, row?: number): string {
  if (typeof known === 'string' && known !== '') return known;
  return row === undefined ? '<unknown>' : `<row ${row}>`;
}

/** Guard used by dataset importer `verify` hooks: all cells of a map match the
 * corresponding delivered fields, else return the describing lines. */
export function missingRefs(row: ImportedRow, created: Record<string, unknown>): string[] {
  const diffs: string[] = [];
  for (const r of row.refs) {
    const resolved = created[r.field];
    if (resolved === null || resolved === undefined || resolved === '') {
      diffs.push(`${r.field} was not resolved to an id (delivered ${String(resolved)})`);
    }
  }
  return diffs;
}