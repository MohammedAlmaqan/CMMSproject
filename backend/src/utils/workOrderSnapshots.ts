import type { Prisma } from '@prisma/client';

/**
 * Serialize a work-order row into the JSON stored on WorkOrderSnapshot.
 *
 * The shape is deliberately lossless for the scalar record and deterministic:
 * DateTime values become ISO strings and keys are sorted, so two snapshots of
 * the same row render identically and consecutive snapshots can be diffed
 * cleanly. `undefined` is dropped (it cannot be represented in JSON); null is
 * kept so an optional column that is genuinely empty stays empty rather than
 * being confused with a value that vanished.
 *
 * D-17: the monetary columns are DECIMAL(12,2), and Prisma hands them back as
 * Decimal instances. A Json column cannot store one, so Decimals are written as
 * numbers (duck-typed on toNumber, so this module needs no Prisma value import
 * and is robust to the Decimal class identity). The snapshot therefore keeps
 * exactly what the API serves.
 */
export function serializeWorkOrderSnapshot(
  row: Record<string, unknown>
): Prisma.InputJsonObject {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    const value = row[key];
    if (value === undefined) continue;
    if (value === null) {
      out[key] = null;
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (
      typeof value === 'object' &&
      !(value instanceof Date) &&
      'toNumber' in value &&
      typeof value.toNumber === 'function'
    ) {
      out[key] = Number((value as { toNumber: () => number }).toNumber());
    } else if (typeof value === 'object') {
      out[key] = serializeWorkOrderSnapshot(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as Prisma.InputJsonObject;
}