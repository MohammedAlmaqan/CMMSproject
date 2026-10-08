/** Read-back comparison for the trial harness. Database-free. */
import type { ImportedCell } from './importers/index.js';

function fmt(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isDecimalLike(delivered: unknown): delivered is { toNumber: () => number } {
  return (
    typeof delivered === 'object' &&
    delivered !== null &&
    typeof (delivered as { toNumber?: unknown }).toNumber === 'function'
  );
}

/** Compare an expected delivered value with the value read back from the trial
 * database. Returns a human-readable discrepancy, or null when equal. */
export function compareValues(expected: unknown, delivered: unknown): string | null {
  if (delivered === null || delivered === undefined) {
    return `expected ${fmt(expected)} but got ${fmt(delivered)}`;
  }
  if (expected === null) return null;

  // Prisma returns DateTime columns as Date instances.
  if (delivered instanceof Date) {
    const e = new Date(String(expected));
    if (Number.isNaN(e.getTime())) return `cannot parse expected date "${expected}"`;
    return e.getTime() === delivered.getTime() ? null : `date ${fmt(delivered)} !== expected ${expected}`;
  }

  // Prisma returns Decimal columns as Decimal instances; compare numerically.
  if (isDecimalLike(delivered)) {
    return Number(delivered.toNumber()) === Number(expected)
      ? null
      : `decimal ${fmt(delivered)} !== expected ${expected}`;
  }

  if (typeof expected === 'object') {
    return JSON.stringify(delivered) === JSON.stringify(expected)
      ? null
      : `${fmt(delivered)} !== expected ${fmt(expected)}`;
  }

  return delivered === expected ? null : `${fmt(delivered)} !== expected ${fmt(expected)}`;
}

/** Verify one delivered row against its provenance. Enumerate the differences. */
export function verifyRow(
  provenance: Record<string, ImportedCell>,
  created: Record<string, unknown>,
): string[] {
  const diffs: string[] = [];
  for (const [field, cell] of Object.entries(provenance)) {
    switch (cell.kind) {
      case 'mapped':
      case 'blank-to-default': {
        const d = compareValues(cell.expected, created[field]);
        if (d !== null) diffs.push(`${field}: ${d}`);
        break;
      }
      case 'blank-to-null':
        if (created[field] !== null && created[field] !== undefined) {
          diffs.push(`${field}: expected null but got ${fmt(created[field])}`);
        }
        break;
      case 'as-is-empty':
        if (created[field] !== '') {
          diffs.push(`${field}: expected empty string but got ${fmt(created[field])}`);
        }
        break;
      case 'derived':
        // Deterministic derived fields are hard-checked; the dataset `verify`
        // hook covers the rest (passwordHash format, supervisor === reporter).
        if (field === 'isDeleted' && created[field] !== false) {
          diffs.push('isDeleted did not land false');
        }
        break;
      case 'resolved':
        // The reference was already enforced by the harness (a missing code row
        // rejects the import). Here we only assert that a resolution actually
        // happened: a value that is not the raw code and not empty.
        if (
          typeof created[field] !== 'string' ||
          created[field] === '' ||
          created[field] === cell.code
        ) {
          diffs.push(
            `${field}: FK to ${cell.dataset}.${cell.column}=${cell.code} was not resolved`,
          );
        }
        break;
    }
  }
  return diffs;
}