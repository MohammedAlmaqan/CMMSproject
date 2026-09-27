import { describe, it, expect } from 'vitest';
import {
  addInterval,
  addMonths,
  consumptionPerDay,
  currentTimeCycle,
  daysBetweenUtc,
  evaluateMeter,
  evaluatePlan,
  evaluateTimeSchedule,
  horizonDays,
  isoDay,
  type CallHorizon,
  type MeterThreshold,
  type TimeSchedule,
} from '../../src/utils/pmDueRules.js';

/**
 * SOW 3.4.2: "interval Value + Unit ... with fixed start date, optional end
 * date" and "generation occurs during a user-defined call horizon ahead of the
 * due date". SOW 3.4.1: strategy is time, meter, or a combination.
 *
 * These cases pin the two defects this module was extracted to fix: a monthly
 * interval was converted with `value * 30`, so it drifted off the calendar, and
 * the call horizon was never read at all.
 */

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const monthly = (over: Partial<TimeSchedule> = {}): TimeSchedule => ({
  startDate: d('2026-01-31'),
  endDate: null,
  intervalValue: 1,
  intervalUnit: 'Months',
  ...over,
});

const daily30 = (over: Partial<TimeSchedule> = {}): TimeSchedule => ({
  startDate: d('2026-01-01'),
  endDate: null,
  intervalValue: 30,
  intervalUnit: 'Days',
  ...over,
});

const noHorizon: CallHorizon = { value: 0, unit: 'Days' };
const sevenDays: CallHorizon = { value: 7, unit: 'Days' };

describe('calendar arithmetic', () => {
  it('clamps a month end into a short month', () => {
    // 2026 is not a leap year.
    expect(isoDay(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
  });

  it('returns to the original day of month after a short month', () => {
    // The `value * 30` approximation produced 3 Mar, 2 Apr, 2 May... A monthly
    // inspection must come due on the 31st again once the month allows it.
    expect(isoDay(addMonths(d('2026-01-31'), 2))).toBe('2026-03-31');
    expect(isoDay(addMonths(d('2026-01-31'), 4))).toBe('2026-05-31');
  });

  it('clamps into a leap February', () => {
    expect(isoDay(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
  });

  it('crosses a year boundary', () => {
    expect(isoDay(addMonths(d('2026-11-30'), 2))).toBe('2027-01-30');
  });

  it('treats weeks as whole weeks', () => {
    expect(isoDay(addInterval(d('2026-01-01'), 2, 'Weeks'))).toBe('2026-01-15');
  });

  it('treats days as whole days', () => {
    expect(isoDay(addInterval(d('2026-01-01'), 45, 'Days'))).toBe('2026-02-15');
  });

  it('counts days without time-of-day drift', () => {
    expect(daysBetweenUtc(d('2026-03-01'), new Date('2026-03-15T23:59:59.999Z'))).toBe(14);
  });
});

describe('horizonDays', () => {
  it('returns a fixed day count for a Days horizon', () => {
    expect(horizonDays({ value: 7, unit: 'Days' }, daily30())).toBe(7);
  });

  it('returns zero for a zero horizon', () => {
    expect(horizonDays({ value: 0, unit: 'Days' }, daily30())).toBe(0);
  });

  it('converts a Units horizon into a multiple of the interval', () => {
    // One unit of a 30-day interval is 30 days, however a planner phrased it.
    expect(horizonDays({ value: 1, unit: 'Units' }, daily30())).toBeCloseTo(30, 6);
    expect(horizonDays({ value: 1, unit: 'Units' }, monthly())).toBeCloseTo(30.436875, 6);
    expect(horizonDays({ value: 2, unit: 'Units' }, daily30())).toBeCloseTo(60, 6);
  });
});

describe('currentTimeCycle', () => {
  it('finds the cycle containing today', () => {
    const cycle = currentTimeCycle(daily30(), d('2026-03-15'));
    expect(cycle).not.toBeNull();
    expect(isoDay(cycle!.dueDate)).toBe('2026-03-02');
    expect(cycle!.index).toBe(2);
  });

  it('is the start cycle on the start date itself', () => {
    const cycle = currentTimeCycle(daily30(), d('2026-01-01'));
    expect(isoDay(cycle!.dueDate)).toBe('2026-01-01');
    expect(cycle!.index).toBe(0);
  });

  it('returns null before the start date', () => {
    expect(currentTimeCycle(daily30(), d('2025-12-25'))).toBeNull();
  });

  it('keeps a month-end cycle on the month end', () => {
    const cycle = currentTimeCycle(monthly(), d('2026-04-10'));
    // Cycles are 31 Jan, 28 Feb, 31 Mar, 30 Apr, so 10 Apr sits in the 31 Mar cycle.
    expect(isoDay(cycle!.dueDate)).toBe('2026-03-31');
  });
});

describe('evaluateTimeSchedule - basic due', () => {
  it('reports not due before the start date', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2025-12-01'));
    expect(r.due).toBe(false);
    expect(r.reason).toBe('before-start');
    expect(r.cycles).toEqual([]);
  });

  it('reports not due for a non-positive interval', () => {
    const r = evaluateTimeSchedule(daily30({ intervalValue: 0 }), noHorizon, d('2026-03-15'));
    expect(r.due).toBe(false);
    expect(r.reason).toBe('invalid-interval');
  });

  it('generates the current cycle when due and never generated', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-03-15'), null);
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-03-02']);
  });

  it('does not re-generate the last generated cycle', () => {
    // SOW 3.4.3 idempotency: the last generated cycle is exclusive. Re-running
    // the scheduler on the same day must not raise a second work order.
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-03-15'), '2026-03-02');
    expect(r.due).toBe(false);
    expect(r.reason).toBe('no-cycle-open');
  });

  it('does not re-generate a cycle raised ahead of its due date', () => {
    // With a horizon the last generated cycle is later than the cycle
    // containing today, so resolving the baseline has to look forward too.
    const r = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-26'), '2026-04-01');
    expect(r.due).toBe(false);
  });

  it('still catches up when the baseline is an early cycle', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-04-05'), '2026-01-01');
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-01-31', '2026-03-02', '2026-04-01']);
  });

  it('ignores a sourcePlanCycle that is not an ISO day', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-03-15'), '2026-3-2');
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-03-02']);
  });

  it('generates the next cycle once it becomes due', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-04-05'), '2026-03-02');
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-04-01']);
  });

  it('catches up missed cycles oldest first', () => {
    // A plan dormant for two intervals should catch up in order, not skip ahead.
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-04-05'), '2026-01-01');
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-01-31', '2026-03-02', '2026-04-01']);
  });

  it('does not replay the whole plan when the baseline is unknown', () => {
    const r = evaluateTimeSchedule(daily30(), noHorizon, d('2026-04-05'), 'not-a-cycle');
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-04-01']);
  });
});

describe('evaluateTimeSchedule - call horizon (SOW 3.4.2)', () => {
  it('generates before the due date once the window opens', () => {
    // Next cycle is due 1 Apr; a 7-day horizon opens on 25 Mar. On 26 Mar the
    // work order should already exist, three months of lateness earlier.
    const r = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-26'), '2026-03-02');
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-04-01']);
    expect(isoDay(r.cycles[0].dueDate)).toBe('2026-04-01');
  });

  it('does not generate before the window opens', () => {
    const r = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-24'), '2026-03-02');
    expect(r.due).toBe(false);
    expect(r.reason).toBe('no-cycle-open');
    expect(isoDay(r.nextDueDate!)).toBe('2026-04-01');
  });

  it('explains that the upcoming cycle is outside the window', () => {
    const r = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-24'), '2026-03-02');
    expect(r.nextDueDate).not.toBeNull();
    expect(isoDay(r.nextDueDate!)).toBe('2026-04-01');
  });

  it('spreads a plan with a long horizon over several days instead of one burst', () => {
    // This is the purpose of the horizon: 30 daily plans due on the same day
    // must not all appear on the same morning.
    const day24 = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-24'), '2026-03-02');
    const day25 = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-25'), '2026-03-02');
    const day26 = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-26'), '2026-03-02');
    expect(day24.due).toBe(false);
    expect(day25.due).toBe(true);
    expect(day26.due).toBe(true);
  });

  it('generates exactly once across the window on repeat runs', () => {
    const first = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-25'), '2026-03-02');
    const second = evaluateTimeSchedule(daily30(), sevenDays, d('2026-03-25'), first.cycles[0].cycleKey);
    expect(first.due).toBe(true);
    expect(second.due).toBe(false);
  });
});

describe('evaluateTimeSchedule - end date (SOW 3.4.2)', () => {
  it('stops generating once the end date has passed', () => {
    const r = evaluateTimeSchedule(daily30({ endDate: d('2026-02-15') }), noHorizon, d('2026-04-05'));
    expect(r.due).toBe(false);
    expect(r.reason).toBe('after-end');
  });

  it('generates a cycle falling exactly on the end date', () => {
    const r = evaluateTimeSchedule(daily30({ endDate: d('2026-03-02') }), noHorizon, d('2026-03-15'));
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.cycleKey)).toEqual(['2026-03-02']);
  });

  it('does not generate a cycle after the end date', () => {
    const r = evaluateTimeSchedule(daily30({ endDate: d('2026-03-02') }), noHorizon, d('2026-03-15'), '2026-03-02');
    expect(r.due).toBe(false);
    expect(r.reason).toBe('after-end');
  });

  it('stops when the end date is the start date and one interval has passed', () => {
    const r = evaluateTimeSchedule(daily30({ endDate: d('2026-01-01') }), noHorizon, d('2026-01-20'), '2026-01-01');
    expect(r.due).toBe(false);
    expect(r.reason).toBe('after-end');
  });
});

describe('consumptionPerDay', () => {
  it('derives a rate from recorded history', () => {
    // Seeded meter: 4400 on 1 Jun, 4500 on 1 Jul is 100 units over 30 days.
    const rate = consumptionPerDay({
      firstReading: 4400,
      firstReadingDate: d('2026-06-01'),
      lastReading: 4500,
      lastReadingDate: d('2026-07-01'),
    });
    expect(rate).toBeCloseTo(100 / 30, 9);
  });

  it('returns null with a single reading', () => {
    // A rate from one reading is not a measurement. Reporting a number here
    // would produce a confident due date out of nothing.
    expect(
      consumptionPerDay({ firstReading: 4400, firstReadingDate: d('2026-06-01'), lastReading: 4400, lastReadingDate: d('2026-06-01') })
    ).toBeNull();
  });

  it('returns null when the readings are not increasing', () => {
    expect(
      consumptionPerDay({ firstReading: 4500, firstReadingDate: d('2026-06-01'), lastReading: 4400, lastReadingDate: d('2026-07-01') })
    ).toBeNull();
  });

  it('returns null when the meter has never been read', () => {
    expect(consumptionPerDay({ firstReading: null, firstReadingDate: null, lastReading: 0, lastReadingDate: null })).toBeNull();
  });
});

describe('evaluateMeter', () => {
  const meter = (over: Partial<MeterThreshold> = {}): MeterThreshold => ({
    meterId: 'M-1',
    threshold: 500,
    lastReading: 4500,
    lastReadingDate: d('2026-07-01'),
    baselineReading: null,
    firstReading: 4400,
    firstReadingDate: d('2026-06-01'),
    ...over,
  });

  it('is not crossed below the threshold', () => {
    const r = evaluateMeter(meter(), d('2026-07-01'));
    expect(r.crossed).toBe(false);
    expect(r.advance).toBe(100);
    expect(r.projectedDueDate).not.toBeNull();
  });

  it('is crossed at the threshold', () => {
    const r = evaluateMeter(meter({ baselineReading: 4000 }), d('2026-07-01'));
    expect(r.crossed).toBe(true);
    expect(r.advance).toBe(500);
  });

  it('is crossed above the threshold', () => {
    const r = evaluateMeter(meter({ baselineReading: 3900 }), d('2026-07-01'));
    expect(r.crossed).toBe(true);
    expect(r.advance).toBe(600);
  });

  it('anchors an already-due projection on today', () => {
    // Back-dating to the crossing day would raise a work order in the past.
    const r = evaluateMeter(meter({ baselineReading: 4000 }), d('2026-08-20'));
    expect(isoDay(r.projectedDueDate!)).toBe('2026-08-20');
  });

  it('projects the date the threshold will be reached', () => {
    // 100 units of history per 30 days; 400 still to run is ~120 days out.
    const r = evaluateMeter(meter(), d('2026-07-01'));
    expect(isoDay(r.projectedDueDate!)).toBe('2026-10-29');
  });

  it('reports no rate rather than inventing a projection', () => {
    const r = evaluateMeter(
      meter({ firstReading: 4500, firstReadingDate: d('2026-07-01') }),
      d('2026-07-01')
    );
    expect(r.noProjectionReason).toBe('no-rate');
    expect(r.projectedDueDate).toBeNull();
  });

  it('reports a meter with no readings at all', () => {
    const r = evaluateMeter(
      meter({ baselineReading: null, firstReading: null, firstReadingDate: null, lastReading: 0, lastReadingDate: null }),
      d('2026-07-01')
    );
    expect(r.crossed).toBe(false);
    expect(r.noProjectionReason).toBe('no-readings');
  });

  it('builds a distinct cycle key per reading', () => {
    const a = evaluateMeter(meter({ baselineReading: 4000 }), d('2026-07-01'));
    const b = evaluateMeter(meter({ baselineReading: 4000, lastReading: 4600 }), d('2026-07-02'));
    expect(a.cycleKey).not.toBe(b.cycleKey);
  });
});

describe('evaluatePlan - strategy selection (SOW 3.4.1)', () => {
  const now = d('2026-03-26');

  it('Time strategy ignores meters entirely', () => {
    const r = evaluatePlan({
      strategy: 'Time',
      time: { schedule: daily30(), horizon: sevenDays },
      meters: [metersCrossed()],
      now,
    });
    expect(r.due).toBe(true);
    expect(r.cycles.every((c) => c.basis === 'Time')).toBe(true);
  });

  it('Meter strategy ignores the time schedule entirely', () => {
    const r = evaluatePlan({
      strategy: 'Meter',
      time: { schedule: daily30(), horizon: noHorizon },
      meters: [metersCrossed()],
      now,
    });
    expect(r.due).toBe(true);
    expect(r.cycles.map((c) => c.basis)).toEqual(['Meter']);
    expect(r.time).toBeNull();
  });

  it('Meter strategy is not due below the threshold', () => {
    const r = evaluatePlan({
      strategy: 'Meter',
      meters: [meterNotCrossed()],
      now,
    });
    expect(r.due).toBe(false);
    expect(r.cycles).toEqual([]);
  });

  it('Combined takes the time basis when it is due first', () => {
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: noHorizon, afterCycleKey: '2026-03-02' },
      meters: [meterNotCrossed()],
      now: d('2026-04-05'),
    });
    expect(r.due).toBe(true);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].basis).toBe('Time');
  });

  it('Combined leaves a not-yet-due time cycle alone', () => {
    // The 1 April cycle is still in the future on 26 March with no horizon, so
    // Combined must not raise it just because the meter plan exists.
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: noHorizon, afterCycleKey: '2026-03-02' },
      meters: [meterNotCrossed()],
      now: d('2026-03-26'),
    });
    expect(r.due).toBe(false);
  });

  it('Combined takes the meter basis when it is due first', () => {
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: sevenDays, afterCycleKey: '2026-03-02' },
      meters: [metersCrossed()],
      now,
    });
    expect(r.due).toBe(true);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].basis).toBe('Meter');
  });

  it('Combined raises one work order, not two, when both are due', () => {
    // SOW 3.4.1 says "whichever is due first". A pump due on both counts on one
    // morning is one job, not two.
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: noHorizon },
      meters: [metersCrossed()],
      now,
    });
    expect(r.cycles).toHaveLength(1);
  });

  it('Combined resolves a tie to Time deterministically', () => {
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: noHorizon },
      meters: [metersCrossed()],
      now,
    });
    expect(r.cycles[0].basis).toBe('Time');
  });

  it('Combined is not due when neither basis is due', () => {
    const r = evaluatePlan({
      strategy: 'Combined',
      time: { schedule: daily30(), horizon: noHorizon, afterCycleKey: '2026-03-02' },
      meters: [meterNotCrossed()],
      now,
    });
    expect(r.due).toBe(false);
    expect(r.explanation).toMatch(/nothing due/i);
  });

  it('excludes meters from a Time strategy plan without losing their readings', () => {
    const r = evaluatePlan({
      strategy: 'Time',
      time: { schedule: daily30(), horizon: noHorizon, afterCycleKey: '2026-03-02' },
      meters: [metersCrossed()],
      now,
    });
    expect(r.due).toBe(false);
    // Still evaluated, so the caller can see why the meter is not generating.
    expect(r.meters).toHaveLength(1);
  });
});

function metersCrossed(): MeterThreshold {
  return {
    meterId: 'M-1',
    threshold: 500,
    lastReading: 4500,
    lastReadingDate: d('2026-07-01'),
    baselineReading: 3900,
    firstReading: 3900,
    firstReadingDate: d('2026-06-01'),
  };
}

function meterNotCrossed(): MeterThreshold {
  return {
    meterId: 'M-1',
    threshold: 500,
    lastReading: 4100,
    lastReadingDate: d('2026-07-01'),
    baselineReading: 4000,
    firstReading: 4000,
    firstReadingDate: d('2026-06-01'),
  };
}
