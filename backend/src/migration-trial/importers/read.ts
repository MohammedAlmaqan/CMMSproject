/**
 * Column readers for the trial importers.
 *
 * A reader turns one raw CSV cell into a `ColumnRead`: either a delivered value
 * tagged with how the blank case was handled, or an error that rejects the row.
 * Readers are pure and database-free.
 */
import { z } from 'zod';

export type ColumnRead<T> =
  | { kind: 'mapped'; value: T }
  | { kind: 'blank-to-null' }
  | { kind: 'blank-to-default'; value: T }
  | { kind: 'as-is-empty' }
  | { kind: 'error'; reason: string };

type Args =
  | { required?: boolean; asIs?: boolean; blankDefault?: undefined; values?: readonly string[] }
  | { required?: boolean; asIs?: boolean; blankDefault: string; values?: readonly string[] };

function blankHandling(args: Args, label: string): ColumnRead<string> {
  if (args.blankDefault !== undefined) {
    return { kind: 'blank-to-default', value: args.blankDefault };
  }
  if (args.asIs) return { kind: 'as-is-empty' };
  if (args.required) return { kind: 'error', reason: `${label} is blank but required` };
  return { kind: 'blank-to-null' };
}

/** Free-text cell: required (blank rejected), nullable, as-is-empty, or blank-default. */
export function textCol(args: Args = {}): (raw: string, label: string) => ColumnRead<string> {
  return (raw, label) => {
    if (raw === '') return blankHandling(args, label);
    if (args.values && !args.values.includes(raw)) {
      return { kind: 'error', reason: `${label}: "${raw}" is not one of ${args.values.join(', ')}` };
    }
    return { kind: 'mapped', value: raw };
  };
}

/** Date-only cell `YYYY-MM-DD`, normalised to the midnight UTC ISO instant the
 * README defines for date-only source values. Blank is null (or required). */
export function dateCol(args: { required?: boolean } = {}): (raw: string, label: string) => ColumnRead<string> {
  return (raw, label) => {
    if (raw === '') {
      if (args.required) return { kind: 'error', reason: `${label} is blank but required` };
      return { kind: 'blank-to-null' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { kind: 'error', reason: `${label}: "${raw}" is not a date-only YYYY-MM-DD value` };
    }
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { kind: 'error', reason: `${label}: "${raw}" is not a valid date` };
    }
    return { kind: 'mapped', value: parsed.toISOString() };
  };
}

/** Boolean cell (`true`/`false`) with an optional blank default. */
export function boolCol(args: { blankDefault?: boolean } = {}): (raw: string, label: string) => ColumnRead<boolean> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      return { kind: 'error', reason: `${label}: blank cannot be inferred` };
    }
    if (raw === 'true') return { kind: 'mapped', value: true };
    if (raw === 'false') return { kind: 'mapped', value: false };
    return { kind: 'error', reason: `${label}: "${raw}" is not true or false` };
  };
}

function numberCell(raw: string, label: string, isInt: boolean): ColumnRead<number> {
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return { kind: 'error', reason: `${label}: "${raw}" is not a number` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || (isInt && !Number.isInteger(value))) {
    return { kind: 'error', reason: `${label}: "${raw}" is not a ${isInt ? 'whole ' : ''}number` };
  }
  return { kind: 'mapped', value };
}

export function floatCol(args: { required?: boolean; blankDefault?: number } = {}): (raw: string, label: string) => ColumnRead<number> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      if (args.required) return { kind: 'error', reason: `${label}: blank but required` };
      return { kind: 'blank-to-null' };
    }
    return numberCell(raw, label, false);
  };
}

export function intCol(args: { required?: boolean; blankDefault?: number } = {}): (raw: string, label: string) => ColumnRead<number> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      if (args.required) return { kind: 'error', reason: `${label}: blank but required` };
      return { kind: 'blank-to-null' };
    }
    return numberCell(raw, label, true);
  };
}

/**
 * Decimal(12,2) cell. The delivered value is the canonical two-place string so
 * the schema's scale is made explicit; storage and read-back go through Prisma's
 * Decimal, which the harness compares numerically.
 */
export function decimalCol(args: { required?: boolean; blankDefault?: string } = {}): (raw: string, label: string) => ColumnRead<string> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      if (args.required) return { kind: 'error', reason: `${label}: blank but required` };
      return { kind: 'blank-to-null' };
    }
    if (!/^(?:\d+(?:\.\d{1,2})?)$/.test(raw)) {
      return { kind: 'error', reason: `${label}: "${raw}" is not a decimal with at most two places` };
    }
    const [whole, frac] = raw.split('.');
    return { kind: 'mapped', value: frac === undefined ? `${whole}.00` : `${whole}.${frac.padEnd(2, '0')}` };
  };
}

/** Json cell (technicalParameters). Comma-free values arrive already decoded;
 * the column is blank on the sample, and a non-blank value must be a JSON object. */
export function jsonCol(args: { blankDefault?: unknown } = {}): (raw: string, label: string) => ColumnRead<unknown> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      return { kind: 'blank-to-null' };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { kind: 'error', reason: `${label}: JSON value must be an object` };
      }
      return { kind: 'mapped', value: parsed };
    } catch {
      return { kind: 'error', reason: `${label}: "${raw}" is not valid JSON` };
    }
  };
}

/** Enum cell validated against one of the canonical zod enums in validation.ts. */
export function enumCol<Values extends Record<string, string>>(
  schema: z.ZodEnum<Values>,
  args: { blankDefault?: Values[keyof Values] } = {},
): (raw: string, label: string) => ColumnRead<Values[keyof Values]> {
  return (raw, label) => {
    if (raw === '') {
      if (args.blankDefault !== undefined) return { kind: 'blank-to-default', value: args.blankDefault };
      return { kind: 'blank-to-null' };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'error', reason: `${label}: ${parsed.error.issues[0]?.message ?? 'invalid enum value'}` };
    }
    return { kind: 'mapped', value: parsed.data };
  };
}