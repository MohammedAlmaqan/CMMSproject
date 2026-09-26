import { describe, it, expect } from 'vitest';
import {
  buildCapacityBoard,
  enumerateDays,
  planSpan,
  consumesCapacity,
  CAPACITY_CONSUMING_STATUSES,
  type CapacityWorkCenter,
  type CapacityWorkOrder,
} from '../../src/utils/capacity.js';

// SOW 3.1.3. The capacity column has always existed and nothing read it, so a
// work centre could be booked to four times its daily capacity with no symptom
// anywhere in the product. These tests pin the spreading rule, which is the part
// that can quietly produce a wrong number.

const wc = (
  id: string,
  code: string,
  dailyCapacityHours: number,
): CapacityWorkCenter => ({
  workCenterId: id,
  workCenterCode: code,
  name: `Centre ${code}`,
  dailyCapacityHours,
});

const wo = (
  workOrderId: string,
  workCenterId: string,
  status: string,
  plannedStart: string | null,
  plannedFinish: string | null,
  operations: Array<{ craftId: string; plannedHours: number }>,
): CapacityWorkOrder => ({
  workOrderId,
  woNumber: `WO-${workOrderId}`,
  status,
  workCenterId,
  plannedStart,
  plannedFinish,
  operations,
});

describe('which work orders load a work centre', () => {
  it('counts work that is committed to the plan', () => {
    expect(consumesCapacity('Planned')).toBe(true);
    expect(consumesCapacity('Scheduled')).toBe(true);
    expect(consumesCapacity('In Progress')).toBe(true);
    expect(consumesCapacity('Suspended')).toBe(true);
  });

  it('does not count a draft, because a draft is a proposal', () => {
    // Counting proposals is what makes a capacity board useless for deciding
    // what to schedule next: everything is always full.
    expect(consumesCapacity('Draft')).toBe(false);
  });

  it('does not count finished or cancelled work', () => {
    expect(consumesCapacity('Completed')).toBe(false);
    expect(consumesCapacity('Closed')).toBe(false);
    expect(consumesCapacity('Cancelled')).toBe(false);
  });

  it('has a fixed, documented status list', () => {
    expect([...CAPACITY_CONSUMING_STATUSES]).toEqual([
      'Planned', 'Scheduled', 'In Progress', 'Suspended',
    ]);
  });
});

describe('the day range', () => {
  it('includes both ends', () => {
    expect(enumerateDays('2026-03-02', '2026-03-04')).toEqual([
      '2026-03-02', '2026-03-03', '2026-03-04',
    ]);
  });

  it('handles a single day', () => {
    expect(enumerateDays('2026-03-02', '2026-03-02')).toEqual(['2026-03-02']);
  });

  it('crosses a month boundary', () => {
    expect(enumerateDays('2026-02-27', '2026-03-01')).toHaveLength(3);
  });

  it('crosses a leap day', () => {
    expect(enumerateDays('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01',
    ]);
  });

  it('returns nothing for an inverted range rather than looping forever', () => {
    expect(enumerateDays('2026-03-04', '2026-03-02')).toEqual([]);
  });
});

describe('the window a work order occupies', () => {
  it('counts both the start and the finish day', () => {
    // Three calendar days for a Mon-Wed job, not two.
    expect(planSpan('2026-03-02T08:00:00Z', '2026-03-04T17:00:00Z').dayCount).toBe(3);
  });

  it('treats a missing finish as a one-day span', () => {
    expect(planSpan('2026-03-02T08:00:00Z', null).dayCount).toBe(1);
  });

  it('treats a finish before the start as one day instead of vanishing', () => {
    // A nonsensical estimate should show as one day of load, not disappear.
    const span = planSpan('2026-03-04T08:00:00Z', '2026-03-02T08:00:00Z');
    expect(span.dayCount).toBe(1);
    expect(span.start).toBe('2026-03-04');
  });

  it('ignores the time of day when counting days', () => {
    expect(planSpan('2026-03-02T23:00:00Z', '2026-03-02T01:00:00Z').dayCount).toBe(1);
  });

  it('reports nothing for an unparseable start', () => {
    expect(planSpan('not-a-date', null).dayCount).toBe(0);
  });
});

describe('hours land on the right days', () => {
  const centers = [wc('WC1', 'MECH', 8)];

  it('spreads a two-day job evenly', () => {
    const board = buildCapacityBoard(
      centers,
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', '2026-03-03T17:00:00Z',
        [{ craftId: 'C1', plannedHours: 16 }])],
      '2026-03-02', '2026-03-04',
    );
    expect(board.entries[0].days.map((d) => d.plannedHours)).toEqual([8, 8, 0]);
  });

  it('divides by the whole window when the board shows only part of it', () => {
    // The bug this rule exists to prevent: a ten-day job shown on a two-day board
    // must not dump all its hours on the two visible days.
    const board = buildCapacityBoard(
      centers,
      [wo('1', 'WC1', 'Planned', '2026-03-01T08:00:00Z', '2026-03-10T17:00:00Z',
        [{ craftId: 'C1', plannedHours: 100 }])],
      '2026-03-09', '2026-03-10',
    );
    expect(board.entries[0].days.map((d) => d.plannedHours)).toEqual([10, 10]);
  });

  it('keeps work outside the range off the board', () => {
    const board = buildCapacityBoard(
      centers,
      [wo('1', 'WC1', 'Planned', '2026-04-01T08:00:00Z', '2026-04-01T17:00:00Z',
        [{ craftId: 'C1', plannedHours: 5 }])],
      '2026-03-02', '2026-03-04',
    );
    expect(board.entries[0].days.every((d) => d.plannedHours === 0)).toBe(true);
  });

  it('adds several work orders on the same day', () => {
    const board = buildCapacityBoard(
      centers,
      [
        wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 3 }]),
        wo('2', 'WC1', 'In Progress', '2026-03-02T08:00:00Z', null, [{ craftId: 'C2', plannedHours: 2 }]),
      ],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries[0].days[0].plannedHours).toBe(5);
  });

  it('splits a day by craft, largest first', () => {
    const board = buildCapacityBoard(
      centers,
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [
        { craftId: 'C1', plannedHours: 1 },
        { craftId: 'C2', plannedHours: 4 },
      ])],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries[0].days[0].crafts).toEqual([
      { craftId: 'C2', plannedHours: 4 },
      { craftId: 'C1', plannedHours: 1 },
    ]);
  });

  it('splits each operation across the window by its own share', () => {
    // Two operations of 6 and 2 hours over two days is 3 and 1, not 4 and 4.
    const board = buildCapacityBoard(
      centers,
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', '2026-03-03T17:00:00Z', [
        { craftId: 'C1', plannedHours: 6 },
        { craftId: 'C2', plannedHours: 2 },
      ])],
      '2026-03-02', '2026-03-03',
    );
    expect(board.entries[0].days[0].crafts).toEqual([
      { craftId: 'C1', plannedHours: 3 },
      { craftId: 'C2', plannedHours: 1 },
    ]);
  });
});

describe('overload is visible', () => {
  it('flags a day loaded past the daily capacity', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 12 }])],
      '2026-03-02', '2026-03-02',
    );
    const day = board.entries[0].days[0];
    expect(day.overCapacity).toBe(true);
    expect(day.utilisation).toBe(1.5);
  });

  it('does not flag a day exactly at capacity', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 8 }])],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries[0].days[0].overCapacity).toBe(false);
  });

  it('reports no utilisation rather than dividing by zero', () => {
    // A work centre with capacity unset would otherwise read as Infinity or NaN.
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 0)],
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 4 }])],
      '2026-03-02', '2026-03-02',
    );
    const day = board.entries[0].days[0];
    expect(day.utilisation).toBeNull();
    expect(day.overCapacity).toBe(false);
  });
});

describe('undated work is surfaced, not dropped', () => {
  it('collects it per work centre', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('77', 'WC1', 'Planned', null, null, [{ craftId: 'C1', plannedHours: 6 }])],
      '2026-03-02', '2026-03-04',
    );
    const entry = board.entries[0];
    expect(entry.unscheduledHours).toBe(6);
    expect(entry.unscheduledWorkOrders).toEqual(['WO-77']);
    expect(entry.days.every((d) => d.plannedHours === 0)).toBe(true);
  });

  it('leaves the capacity days clean so the board is not double counted', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('77', 'WC1', 'Planned', null, null, [{ craftId: 'C1', plannedHours: 6 }])],
      '2026-03-02', '2026-03-04',
    );
    expect(board.entries[0].days.map((d) => d.plannedHours)).toEqual([0, 0, 0]);
  });
});

describe('noise is ignored', () => {
  it('ignores a work order with no operations', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [])],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries[0].days[0].plannedHours).toBe(0);
  });

  it('ignores operations with zero planned hours', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('1', 'WC1', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 0 }])],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries[0].days[0].plannedHours).toBe(0);
    expect(board.entries[0].days[0].crafts).toEqual([]);
  });

  it('ignores a work order pointing at a work centre not on the board', () => {
    const board = buildCapacityBoard(
      [wc('WC1', 'MECH', 8)],
      [wo('1', 'GONE', 'Planned', '2026-03-02T08:00:00Z', null, [{ craftId: 'C1', plannedHours: 4 }])],
      '2026-03-02', '2026-03-02',
    );
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].days[0].plannedHours).toBe(0);
  });

  it('gives every work centre a row even with no work at all', () => {
    const board = buildCapacityBoard(
      [wc('WC2', 'ELEC', 8), wc('WC1', 'MECH', 8)],
      [],
      '2026-03-02', '2026-03-03',
    );
    expect(board.entries.map((e) => e.workCenterCode)).toEqual(['ELEC', 'MECH']);
    expect(board.entries[0].days).toHaveLength(2);
  });

  it('does not accumulate rounding drift across many small jobs', () => {
    // Rounding each job's share before summing would drift here.
    const wos = Array.from({ length: 50 }, (_, i) =>
      wo(String(i), 'WC1', 'Planned', '2026-03-02T08:00:00Z', null,
        [{ craftId: 'C1', plannedHours: 0.01 }]));
    const board = buildCapacityBoard([wc('WC1', 'MECH', 8)], wos, '2026-03-02', '2026-03-02');
    expect(board.entries[0].days[0].plannedHours).toBe(0.5);
  });
});
