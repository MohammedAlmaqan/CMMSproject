import { describe, it, expect } from 'vitest';
import {
  buildDateWhere,
  buildScopeWhere,
  descendantLocationIds,
  parseDayStart,
  parseReportFilter,
} from '../../src/utils/reportFilters.js';
import type { ReportFilter } from '../../src/utils/reportFilters.js';

const ok = (query: Record<string, unknown>): ReportFilter => {
  const result = parseReportFilter(query);
  if (!result.ok) throw new Error(`expected a valid filter, got: ${result.errors.join('; ')}`);
  return result.filter;
};

const errors = (query: Record<string, unknown>): string[] => {
  const result = parseReportFilter(query);
  if (result.ok) throw new Error('expected the filter to be rejected');
  return result.errors;
};

describe('day parsing', () => {
  it('accepts a real calendar date', () => {
    expect(parseDayStart('2026-03-15')?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    expect(parseDayStart('2026-02-30')).toBeNull();
    expect(parseDayStart('2026-13-01')).toBeNull();
    expect(parseDayStart('2026-00-10')).toBeNull();
  });

  it('rejects a timestamp where a calendar day was asked for', () => {
    expect(parseDayStart('2026-03-15T10:00:00Z')).toBeNull();
    expect(parseDayStart('15-03-2026')).toBeNull();
    expect(parseDayStart('not a date')).toBeNull();
    expect(parseDayStart('')).toBeNull();
  });

  it('accepts a real leap day and rejects a fictional one', () => {
    expect(parseDayStart('2028-02-29')).not.toBeNull();
    expect(parseDayStart('2026-02-29')).toBeNull();
  });
});

describe('date range bounds', () => {
  it('closes the end of the range at the last millisecond of the final day', () => {
    const filter = ok({ from: '2026-03-01', to: '2026-03-15' });
    expect(filter.from?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(filter.to?.toISOString()).toBe('2026-03-15T23:59:59.999Z');
  });

  it('includes a work order raised at 23:59:59 on the final day', () => {
    const filter = ok({ to: '2026-03-15' });
    const lastMoment = new Date('2026-03-15T23:59:59.999Z');
    const nextMoment = new Date('2026-03-16T00:00:00.000Z');
    expect(filter.to!.getTime()).toBeGreaterThanOrEqual(lastMoment.getTime());
    expect(filter.to!.getTime()).toBeLessThan(nextMoment.getTime());
  });

  it('spans a month boundary without a day being lost or doubled', () => {
    const filter = ok({ from: '2026-01-31', to: '2026-02-01' });
    const days = (filter.to!.getTime() - filter.from!.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(2.0, 6);
    expect(filter.from!.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(filter.to!.toISOString()).toBe('2026-02-01T23:59:59.999Z');
  });

  it('handles a range that crosses a year boundary', () => {
    const filter = ok({ from: '2025-12-31', to: '2026-01-01' });
    expect(filter.from!.getUTCFullYear()).toBe(2025);
    expect(filter.to!.getUTCFullYear()).toBe(2026);
  });

  it('treats an open-ended range as unbounded rather than as an error', () => {
    expect(ok({ from: '2026-01-01' }).to).toBeNull();
    expect(ok({ to: '2026-01-01' }).from).toBeNull();
    expect(ok({}).from).toBeNull();
    expect(ok({}).to).toBeNull();
  });

  it('rejects a reversed range instead of quietly returning nothing', () => {
    expect(errors({ from: '2026-03-15', to: '2026-03-01' }).join(' ')).toMatch(/from must not be later than to/);
  });

  it('accepts a single-day range where from equals to', () => {
    const filter = ok({ from: '2026-03-15', to: '2026-03-15' });
    expect(filter.from!.getUTCDate()).toBe(15);
    expect(filter.to!.getUTCDate()).toBe(15);
    expect(filter.from!.getTime()).toBeLessThan(filter.to!.getTime());
  });
});

describe('malformed input', () => {
  it('rejects a date that cannot be parsed rather than dropping the filter', () => {
    expect(errors({ from: 'yesterday' }).join(' ')).toMatch(/from must be a calendar date/);
    expect(errors({ to: '2026-03-32' }).join(' ')).toMatch(/to must be a calendar date/);
  });

  it('treats an empty parameter as absent, not as a filter matching nothing', () => {
    const filter = ok({ from: '', to: '', equipmentId: '', workCenterId: '', functionalLocationId: '' });
    expect(filter.from).toBeNull();
    expect(filter.to).toBeNull();
    expect(filter.equipmentId).toBeNull();
    expect(filter.workCenterId).toBeNull();
    expect(filter.functionalLocationId).toBeNull();
  });

  it('rejects a repeated parameter instead of silently keeping one', () => {
    expect(errors({ equipmentId: ['a', 'b'] }).join(' ')).toMatch(/equipmentId was supplied 2 times/);
  });

  it('rejects a non-boolean descendant flag', () => {
    expect(errors({ includeDescendantLocations: 'yes' }).join(' ')).toMatch(/must be true or false/);
  });

  it('collects every problem rather than stopping at the first', () => {
    const query: Record<string, unknown> = { from: 'nope', to: 'also-nope' };
    query.workCenterId = ['x', 'y'];
    expect(errors(query).length).toBe(3);
  });

  it('reads the boolean flag strictly', () => {
    expect(ok({ includeDescendantLocations: 'true' }).includeDescendantLocations).toBe(true);
    expect(ok({ includeDescendantLocations: 'false' }).includeDescendantLocations).toBe(false);
  });
});

describe('location descendants', () => {
  const tree = [
    { functionalLocationId: 'plant', parentLocationId: null },
    { functionalLocationId: 'area', parentLocationId: 'plant' },
    { functionalLocationId: 'unit', parentLocationId: 'area' },
    { functionalLocationId: 'sub', parentLocationId: 'unit' },
    { functionalLocationId: 'other', parentLocationId: 'plant' },
  ];

  it('includes the whole subtree below a chosen location', () => {
    expect(descendantLocationIds('area', tree).sort()).toEqual(['area', 'sub', 'unit']);
  });

  it('does not walk sideways into a sibling branch', () => {
    expect(descendantLocationIds('area', tree)).not.toContain('other');
  });

  it('includes the root itself', () => {
    expect(descendantLocationIds('plant', tree).sort()).toEqual(['area', 'other', 'plant', 'sub', 'unit']);
  });

  it('terminates on a cycle instead of looping forever', () => {
    const cyclic = [
      { functionalLocationId: 'a', parentLocationId: 'b' },
      { functionalLocationId: 'b', parentLocationId: 'a' },
    ];
    expect(descendantLocationIds('a', cyclic).sort()).toEqual(['a', 'b']);
  });
});

describe('prisma fragments', () => {
  const filter = (over: Partial<ReportFilter> = {}): ReportFilter => ({
    from: null, to: null, functionalLocationId: null, includeDescendantLocations: false,
    equipmentId: null, workCenterId: null, ...over,
  });

  it('adds nothing when no dimension is set', () => {
    expect(buildScopeWhere(filter(), null)).toEqual({});
    expect(buildDateWhere(filter(), 'createdDate')).toBeNull();
  });

  it('applies each dimension independently', () => {
    const where = buildScopeWhere(filter({ equipmentId: 'eq-1', workCenterId: 'wc-1' }), null);
    expect(where).toEqual({ equipmentId: 'eq-1', workCenterId: 'wc-1' });
  });

  it('uses an explicit in-list for locations, never a single id, once descendants are expanded', () => {
    const where = buildScopeWhere(filter({ functionalLocationId: 'area' }), ['area', 'unit', 'sub']);
    expect(where.functionalLocationId).toEqual({ in: ['area', 'unit', 'sub'] });
  });

  it('omits the location clause when the expansion is empty rather than matching nothing', () => {
    expect(buildScopeWhere(filter({ functionalLocationId: 'area' }), [])).toEqual({});
  });

  it('puts the date bounds on the column the report declares', () => {
    const f = filter({ from: new Date('2026-03-01T00:00:00.000Z'), to: new Date('2026-03-15T23:59:59.999Z') });
    expect(buildDateWhere(f, 'actualFinish')).toEqual({
      actualFinish: { gte: new Date('2026-03-01T00:00:00.000Z'), lte: new Date('2026-03-15T23:59:59.999Z') },
    });
  });

  it('emits only the bound that was given', () => {
    const f = filter({ from: new Date('2026-03-01T00:00:00.000Z') });
    expect(buildDateWhere(f, 'createdDate')).toEqual({ createdDate: { gte: new Date('2026-03-01T00:00:00.000Z') } });
  });
});
