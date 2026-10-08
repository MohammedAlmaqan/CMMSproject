/** Row-building helpers shared by the dataset importers. */
import type { ImportedCell, ImportedRow } from './types.js';
import type { ColumnRead } from './read.js';

/** Thrown for a row whose cells do not map cleanly; the importer turns it into a
 * rejected row with `reason`. */
export class RowError extends Error {}

export interface RowBuilder {
  target: Record<string, unknown>;
  provenance: Record<string, ImportedCell>;
  refs: ImportedRow['refs'];
}

/** Apply one column read to the builder: record the delivered value in `target`
 * and tag its provenance, or throw a RowError when the cell is unusable. */
export function cell<T>(b: RowBuilder, field: string, read: ColumnRead<T>): void {
  switch (read.kind) {
    case 'mapped':
      b.target[field] = read.value;
      b.provenance[field] = { kind: 'mapped', expected: read.value };
      return;
    case 'blank-to-null':
      b.target[field] = null;
      b.provenance[field] = { kind: 'blank-to-null' };
      return;
    case 'blank-to-default':
      b.target[field] = read.value;
      b.provenance[field] = { kind: 'blank-to-default', expected: read.value };
      return;
    case 'as-is-empty':
      b.target[field] = '';
      b.provenance[field] = { kind: 'as-is-empty' };
      return;
    case 'error':
      throw new RowError(`${field}: ${read.reason}`);
  }
}

/** Record a deterministic derived value (isDeleted=false, ...). */
export function derived(b: RowBuilder, field: string, value: unknown, note: string): void {
  b.target[field] = value;
  b.provenance[field] = { kind: 'derived', note };
}

/** Mark a ref'd FK field: the target holds a natural-key code that the harness
 * resolves to the referenced dataset's surrogate id before persisting. */
export function resolve(
  b: RowBuilder,
  field: string,
  code: string,
  dataset: string,
  column: string,
): void {
  b.provenance[field] = { kind: 'resolved', code, dataset, column };
  b.refs.push({ field, dataset, column });
}