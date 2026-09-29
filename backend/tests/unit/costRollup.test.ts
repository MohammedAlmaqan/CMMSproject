import { describe, it, expect } from 'vitest';
import {
  formatPeriodKey,
  periodKeyFor,
  rollupByEquipment,
  rollupByLocation,
  rollupByPeriod,
  rollupByWorkOrderType,
} from '../../src/utils/costRollup.js';
import type { RollupLocation, RollupWorkOrder } from '../../src/utils/costRollup.js';

/**
 * SOW 3.5.3, register rows 51-54.
 *
 * These tests carry their own reference implementation and assert the module
 * agrees with it. A rollup is exactly the kind of code that can be wrong
 * without looking wrong: a total that double-counts a subtree, or drops a
 * work order whose location is unresolvable, still returns plausible numbers
 * and a 200. The reference below is written the slow, obvious way - walk every
 * work order, walk every location, decide membership by hand - so a shared
 * misreading of the clause is less likely to be shared by both.
 */

const L = (
  functionalLocationId: string,
  parentLocationId: string | null,
  locationCode = functionalLocationId
): RollupLocation => ({
  functionalLocationId,
  locationCode,
  description: `loc ${locationCode}`,
  parentLocationId,
});

const TREE: RollupLocation[] = [
  L('plant', null, 'PLANT'),
  L('area', 'plant', 'AREA'),
  L('unit', 'area', 'UNIT'),
  L('sub', 'unit', 'SUB'),
  L('other', 'plant', 'OTHER'),
];

const d = (iso: string): Date => new Date(iso);

const wo = (over: Partial<RollupWorkOrder> & { workOrderId: string }): RollupWorkOrder => ({
  functionalLocationId: 'sub',
  equipmentId: 'eq-1',
  equipmentCode: 'EQ1',
  type: 'CM',
  workCenterId: 'wc-1',
  costCenterCode: 'CC1',
  plannedPeriodDate: d('2026-03-15T00:00:00.000Z'),
  actualPeriodDate: d('2026-03-20T00:00:00.000Z'),
  plannedCost: 100,
  actualCost: 50,
  ...over,
});

function referenceLocationTotals(workOrders: RollupWorkOrder[], locations: RollupLocation[]) {
  const out = new Map<string, { planned: number; actual: number; count: number }>();
  for (const location of locations) {
    for (const w of workOrders) {
      let cursor: string | null = w.functionalLocationId;
      const seen = new Set<string>();
      let reaches = false;
      while (cursor !== null && !seen.has(cursor)) {
        seen.add(cursor);
        if (cursor === location.functionalLocationId) {
          reaches = true;
          break;
        }
        const node = locations.find((l) => l.functionalLocationId === cursor);
        if (!node) break;
        cursor = node.parentLocationId;
      }
      if (!reaches) continue;
      const bucket = out.get(location.functionalLocationId) ?? { planned: 0, actual: 0, count: 0 };
      bucket.planned += w.plannedCost;
      bucket.actual += w.actualCost;
      bucket.count += 1;
      out.set(location.functionalLocationId, bucket);
    }
  }
  return out;
}

describe('period keys', () => {
  it('buckets a date into year, quarter and month', () => {
    expect(formatPeriodKey(periodKeyFor(d('2026-02-14T00:00:00.000Z'), 'year'))).toBe('2026');
    expect(formatPeriodKey(periodKeyFor(d('2026-02-14T00:00:00.000Z'), 'quarter'))).toBe('2026-Q1');
    expect(formatPeriodKey(periodKeyFor(d('2026-08-14T00:00:00.000Z'), 'quarter'))).toBe('2026-Q3');
    expect(formatPeriodKey(periodKeyFor(d('2026-08-14T00:00:00.000Z'), 'month'))).toBe('2026-08');
  });

  it('puts each month in exactly one quarter across a year boundary', () => {
    const quarters = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']
      .map((m) => formatPeriodKey(periodKeyFor(d(`${m}-10T00:00:00.000Z`), 'quarter')));
    expect(quarters).toEqual(['2025-Q4', '2025-Q4', '2026-Q1', '2026-Q1', '2026-Q1', '2026-Q2']);
  });
});

describe('rollup by work order type', () => {
  it('sums planned and actual per type', () => {
    const result = rollupByWorkOrderType([
      wo({ workOrderId: 'a', type: 'CM', plannedCost: 10, actualCost: 4 }),
      wo({ workOrderId: 'b', type: 'CM', plannedCost: 5.5, actualCost: 1.25 }),
      wo({ workOrderId: 'c', type: 'PM', plannedCost: 100, actualCost: 90 }),
    ]);
    expect(result).toEqual([
      { workOrderType: 'CM', plannedCost: 15.5, actualCost: 5.25, workOrderCount: 2 },
      { workOrderType: 'PM', plannedCost: 100, actualCost: 90, workOrderCount: 1 },
    ]);
  });

  it('treats a non-finite amount as zero rather than propagating NaN', () => {
    const result = rollupByWorkOrderType([
      wo({ workOrderId: 'a', plannedCost: Number.NaN, actualCost: Number.POSITIVE_INFINITY }),
    ]);
    expect(result[0]).toEqual({ workOrderType: 'CM', plannedCost: 0, actualCost: 0, workOrderCount: 1 });
  });
});

describe('rollup by equipment', () => {
  it('groups by equipment and keeps a separate bucket for unassigned equipment', () => {
    const result = rollupByEquipment([
      wo({ workOrderId: 'a', equipmentId: 'eq-1', equipmentCode: 'PUMP', plannedCost: 10, actualCost: 10 }),
      wo({ workOrderId: 'b', equipmentId: 'eq-1', equipmentCode: 'PUMP', plannedCost: 5, actualCost: 0 }),
      wo({ workOrderId: 'c', equipmentId: 'eq-2', equipmentCode: 'VALVE', plannedCost: 7, actualCost: 3 }),
      wo({ workOrderId: 'd', equipmentId: null, equipmentCode: null, plannedCost: 1, actualCost: 1 }),
    ]);
    const byId = new Map(result.map((r) => [r.equipmentId, r]));
    expect(byId.get('eq-1')).toEqual({ equipmentId: 'eq-1', equipmentCode: 'PUMP', plannedCost: 15, actualCost: 10, workOrderCount: 2 });
    expect(byId.get('eq-2')).toEqual({ equipmentId: 'eq-2', equipmentCode: 'VALVE', plannedCost: 7, actualCost: 3, workOrderCount: 1 });
    expect(byId.get('NO_EQUIPMENT')).toEqual({ equipmentId: 'NO_EQUIPMENT', equipmentCode: '', plannedCost: 1, actualCost: 1, workOrderCount: 1 });
  });

  it('keeps a work order whose equipment is soft-deleted out of the named buckets', () => {
    const result = rollupByEquipment([wo({ workOrderId: 'a', equipmentId: null, equipmentCode: null })]);
    expect(result).toHaveLength(1);
    expect(result[0].equipmentId).toBe('NO_EQUIPMENT');
  });
});

describe('rollup by period', () => {
  it('files planned and actual under their own dates', () => {
    const result = rollupByPeriod(
      [
        wo({
          workOrderId: 'a',
          plannedPeriodDate: d('2026-01-31T23:59:59.000Z'),
          actualPeriodDate: d('2026-02-01T00:00:00.000Z'),
          plannedCost: 10,
          actualCost: 7,
        }),
      ],
      'month'
    );
    expect(result).toEqual([
      { period: '2026-01', periodUnit: 'month', year: 2026, quarter: null, month: 1, plannedCost: 10, actualCost: 0, workOrderCount: 0 },
      { period: '2026-02', periodUnit: 'month', year: 2026, quarter: null, month: 2, plannedCost: 0, actualCost: 7, workOrderCount: 0 },
    ]);
  });

  it('omits a period in which a work order has no money on that side', () => {
    const result = rollupByPeriod([wo({ workOrderId: 'a', plannedCost: 0, actualCost: 0 })], 'month');
    expect(result).toEqual([]);
  });

  it('aggregates a quarter without re-parsing any formatted date', () => {
    const result = rollupByPeriod(
      [
        wo({ workOrderId: 'a', plannedPeriodDate: d('2026-05-01T00:00:00.000Z'), plannedCost: 1, actualCost: 0 }),
        wo({ workOrderId: 'b', plannedPeriodDate: d('2026-06-30T00:00:00.000Z'), plannedCost: 2, actualCost: 0 }),
        wo({ workOrderId: 'c', plannedPeriodDate: d('2026-07-01T00:00:00.000Z'), plannedCost: 4, actualCost: 0 }),
      ],
      'quarter'
    );
    expect(result.map((r) => [r.period, r.plannedCost])).toEqual([
      ['2026-Q2', 3],
      ['2026-Q3', 4],
    ]);
  });
});

describe('rollup by location', () => {
  it('counts a work order once at every level of its ancestry, and no more', () => {
    const result = rollupByLocation([wo({ workOrderId: 'a', plannedCost: 100, actualCost: 60 })], TREE);
    const byId = new Map(result.map((r) => [r.functionalLocationId, r]));
    expect(byId.get('sub')!.plannedCost).toBe(100);
    expect(byId.get('unit')!.plannedCost).toBe(100);
    expect(byId.get('area')!.plannedCost).toBe(100);
    expect(byId.get('plant')!.plannedCost).toBe(100);
    expect(byId.get('other')!.plannedCost).toBe(0);
    expect(result).toHaveLength(5);
  });

  it('agrees with the reference implementation on a mixed tree', () => {
    const workOrders = [
      wo({ workOrderId: 'a', functionalLocationId: 'sub', plannedCost: 100.5, actualCost: 40.25 }),
      wo({ workOrderId: 'b', functionalLocationId: 'unit', plannedCost: 20, actualCost: 20 }),
      wo({ workOrderId: 'c', functionalLocationId: 'other', plannedCost: 3.33, actualCost: 1.11 }),
      wo({ workOrderId: 'd', functionalLocationId: 'plant', plannedCost: 0.1, actualCost: 0.1 }),
    ];
    const expected = referenceLocationTotals(workOrders, TREE);
    const result = rollupByLocation(workOrders, TREE);
    for (const [id, want] of expected) {
      const got = result.find((r) => r.functionalLocationId === id);
      expect(got, `location ${id}`).toBeDefined();
      expect(Math.round(got!.plannedCost * 100) / 100, `planned ${id}`).toBeCloseTo(Math.round(want.planned * 100) / 100, 2);
      expect(Math.round(got!.actualCost * 100) / 100, `actual ${id}`).toBeCloseTo(Math.round(want.actual * 100) / 100, 2);
      expect(got!.workOrderCount, `count ${id}`).toBe(want.count);
    }
  });

  it('separates a node direct from the same node rolled up', () => {
    const result = rollupByLocation(
      [
        wo({ workOrderId: 'a', functionalLocationId: 'sub', plannedCost: 10, actualCost: 1 }),
        wo({ workOrderId: 'b', functionalLocationId: 'other', plannedCost: 7, actualCost: 2 }),
      ],
      TREE
    );
    const plant = result.find((r) => r.functionalLocationId === 'plant')!;
    expect(plant.ownPlannedCost).toBe(0);
    expect(plant.plannedCost).toBe(17);
    expect(plant.workOrderCount).toBe(2);
  });

  it('reports a depth and a readable path so a level is addressable', () => {
    const result = rollupByLocation([wo({ workOrderId: 'a' })], TREE);
    const paths = result.map((r) => [r.functionalLocationId, r.depth, r.path]).sort();
    expect(paths).toEqual([
      ['area', 2, 'PLANT > AREA'],
      ['other', 2, 'PLANT > OTHER'],
      ['plant', 1, 'PLANT'],
      ['sub', 4, 'PLANT > AREA > UNIT > SUB'],
      ['unit', 3, 'PLANT > AREA > UNIT'],
    ]);
  });

  it('does not drop a work order whose location is unresolvable', () => {
    const result = rollupByLocation([wo({ workOrderId: 'a', functionalLocationId: 'ghost', plannedCost: 42, actualCost: 21 })], TREE);
    const orphan = result.find((r) => r.orphan);
    expect(orphan).toBeDefined();
    expect(orphan!.plannedCost).toBe(42);
    expect(orphan!.actualCost).toBe(21);
    expect(orphan!.workOrderCount).toBe(1);
  });

  it('attributes a work order to a missing intermediate node without losing it', () => {
    const partial = [L('plant', null, 'PLANT'), L('sub', 'unit', 'SUB')];
    const result = rollupByLocation([wo({ workOrderId: 'a', functionalLocationId: 'sub', plannedCost: 9, actualCost: 4 })], partial);
    const total = result.reduce((s, r) => s + r.plannedCost, 0);
    expect(total).toBeGreaterThanOrEqual(9);
    expect(result.some((r) => r.orphan && r.plannedCost === 9)).toBe(true);
  });

  it('survives a parent cycle instead of hanging', () => {
    const cyclic = [L('a', 'b', 'A'), L('b', 'a', 'B')];
    const result = rollupByLocation([wo({ workOrderId: 'x', functionalLocationId: 'a', plannedCost: 5, actualCost: 5 })], cyclic);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((r) => r.plannedCost === 5)).toBe(true);
  });
});
