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
 *
 * `derived` exists because a snapshot is a permanent record and the cost columns
 * are only a cache of the base relations (R.9). Serializing the cache would freeze
 * a possibly-stale figure into the one place a later reader trusts absolutely,
 * and the staleness would then be indistinguishable from a real historical fact.
 * A snapshot is therefore taken at a moment when a recompute has just run, and the
 * derived figures are substituted over the serialized row here. The substitution is
 * in this function rather than at the call site so that every snapshot goes
 * through it: a caller that forgets produces a visibly absent figure rather than a
 * quietly wrong one.
 */
export function serializeWorkOrderSnapshot(
  row: Record<string, unknown>,
  derived?: { plannedCost: number; actualCost: number }
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
  if (derived) {
    out.plannedCost = derived.plannedCost;
    out.actualCost = derived.actualCost;
  }
  return out as Prisma.InputJsonObject;
}