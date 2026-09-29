import { z } from 'zod';

export interface ReportFilter {
  from: Date | null;
  to: Date | null;
  functionalLocationId: string | null;
  includeDescendantLocations: boolean;
  equipmentId: string | null;
  workCenterId: string | null;
}

export type ReportFilterResult =
  | { ok: true; filter: ReportFilter }
  | { ok: false; errors: string[] };

const emptyFilter = (): ReportFilter => ({
  from: null,
  to: null,
  functionalLocationId: null,
  includeDescendantLocations: false,
  equipmentId: null,
  workCenterId: null,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function singleValue(value: unknown, name: string, errors: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    errors.push(`${name} was supplied ${value.length} times; pass it once`);
    return null;
  }
  if (typeof value !== 'string') {
    errors.push(`${name} must be a single value`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseDayStart(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * A calendar-day range, closed at both ends. `to` is the last millisecond of
 * that day, because a report that silently drops the final day of the window
 * is the kind of wrong that nobody notices until a month-end total does not
 * tie out.
 */
export function parseReportFilter(query: Record<string, unknown>): ReportFilterResult {
  const errors: string[] = [];
  const filter = emptyFilter();

  const fromRaw = singleValue(query.from, 'from', errors);
  const toRaw = singleValue(query.to, 'to', errors);

  if (fromRaw !== null) {
    const parsed = parseDayStart(fromRaw);
    if (parsed === null) errors.push(`from must be a calendar date as YYYY-MM-DD, got "${fromRaw}"`);
    else filter.from = parsed;
  }
  if (toRaw !== null) {
    const parsed = parseDayStart(toRaw);
    if (parsed === null) errors.push(`to must be a calendar date as YYYY-MM-DD, got "${toRaw}"`);
    else filter.to = new Date(parsed.getTime() + 86_400_000 - 1);
  }

  if (filter.from !== null && filter.to !== null && filter.from.getTime() > filter.to.getTime()) {
    errors.push('from must not be later than to');
  }

  filter.functionalLocationId = singleValue(query.functionalLocationId, 'functionalLocationId', errors);
  filter.equipmentId = singleValue(query.equipmentId, 'equipmentId', errors);
  filter.workCenterId = singleValue(query.workCenterId, 'workCenterId', errors);

  const descendantRaw = singleValue(query.includeDescendantLocations, 'includeDescendantLocations', errors);
  if (descendantRaw !== null) {
    if (descendantRaw === 'true') filter.includeDescendantLocations = true;
    else if (descendantRaw === 'false') filter.includeDescendantLocations = false;
    else errors.push(`includeDescendantLocations must be true or false, got "${descendantRaw}"`);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, filter };
}

export const reportFilterQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  functionalLocationId: z.string().optional(),
  includeDescendantLocations: z.string().optional(),
  equipmentId: z.string().optional(),
  workCenterId: z.string().optional(),
});

/**
 * The Prisma fragment for the shared dimensions. Date is left to the caller
 * because which date column a report filters on is a property of the report,
 * not of the filter: a backlog report and a downtime report do not share one.
 */
export function buildScopeWhere(
  filter: ReportFilter,
  locationIds: string[] | null
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (locationIds !== null && locationIds.length > 0) where.functionalLocationId = { in: locationIds };
  if (filter.equipmentId !== null) where.equipmentId = filter.equipmentId;
  if (filter.workCenterId !== null) where.workCenterId = filter.workCenterId;
  return where;
}

export function buildDateWhere(
  filter: ReportFilter,
  column: 'createdDate' | 'plannedStart' | 'actualStart' | 'actualFinish'
): Record<string, unknown> | null {
  if (filter.from === null && filter.to === null) return null;
  const bounds: Record<string, Date> = {};
  if (filter.from !== null) bounds.gte = filter.from;
  if (filter.to !== null) bounds.lte = filter.to;
  return { [column]: bounds };
}

export function descendantLocationIds(rootId: string, locations: Array<{ functionalLocationId: string; parentLocationId: string | null }>): string[] {
  const children = new Map<string, string[]>();
  for (const location of locations) {
    if (location.parentLocationId === null) continue;
    const siblings = children.get(location.parentLocationId) ?? [];
    siblings.push(location.functionalLocationId);
    children.set(location.parentLocationId, siblings);
  }
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return [...out];
}
