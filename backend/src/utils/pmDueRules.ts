/**
 * SOW 3.4.2 and 3.4.3: when a maintenance plan is due, and during what window
 * its work order should be raised.
 *
 * This is deliberately a pure module with no Prisma and no clock of its own. The
 * scheduler previously inlined this arithmetic, which made it untestable without
 * a database and hid two defects in it:
 *
 *   - `intervalUnit: 'Months'` was converted with `value * 30`. A monthly plan
 *     therefore drifted against the calendar: a plan starting 31 January came
 *     due on 1 March, 2 April, and so on, and never again on a month end. The
 *     arithmetic here is calendar-correct, clamping to the last day of a short
 *     month and returning to the original day-of-month afterwards.
 *
 *   - `callHorizonValue` / `callHorizonUnit` were never read at all. SOW 3.4.2
 *     requires generation to happen during a user-defined window ahead of the
 *     due date precisely so that every due plan does not flood the backlog on
 *     the same morning. Without a horizon, a nightly run generates everything
 *     at once.
 *
 * The horizon is what makes this schedulable rather than merely correct: a cycle
 * is *due for generation* once its window has opened, and the cycle identity
 * (`cycleKey`) is what makes re-entry harmless, which is SOW 3.4.3's idempotency
 * requirement.
 */

export type PlanStrategy = 'Time' | 'Meter' | 'Combined';
export type IntervalUnit = 'Days' | 'Weeks' | 'Months';
export type HorizonUnit = 'Days' | 'Units';

export const MS_PER_DAY = 86_400_000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetweenUtc(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / MS_PER_DAY);
}

export function addDays(base: Date, days: number): Date {
  const d = startOfUtcDay(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Calendar-correct month arithmetic.
 *
 * `setUTCMonth` on a 31 January date rolls into March, so the day of month is
 * pinned first and the result clamped to the length of the target month. This
 * makes 31 Jan + 1 month = 28 Feb (or 29 Feb) and 31 Jan + 2 months = 31 Mar,
 * which is what a monthly inspection schedule means and what the old
 * `value * 30` approximation destroyed.
 */
export function addMonths(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(year, month + months, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth(),
      Math.min(day, daysInTargetMonth)
    )
  );
}

export function addInterval(base: Date, value: number, unit: IntervalUnit): Date {
  if (unit === 'Months') return addMonths(base, value);
  return addDays(base, unit === 'Weeks' ? value * 7 : value);
}

/** Approximate length of one interval, used only to seed the search below. */
function approximateIntervalDays(value: number, unit: IntervalUnit): number {
  if (unit === 'Months') return value * 30.436875;
  return unit === 'Weeks' ? value * 7 : value;
}

export interface TimeSchedule {
  startDate: Date;
  /** SOW 3.4.2: an optional end date after which the plan stops generating. */
  endDate: Date | null;
  intervalValue: number;
  intervalUnit: IntervalUnit;
}

export interface CallHorizon {
  value: number;
  /** `Days` is a fixed number of days; `Units` is a multiple of the interval. */
  unit: HorizonUnit;
}

export interface TimeCycle {
  /** Idempotency key for this cycle. */
  cycleKey: string;
  /** The date the work is actually due. */
  dueDate: Date;
  /** Index of the cycle since the plan's start date, 0-based. */
  index: number;
}

export type NotDueReason =
  | 'before-start'
  | 'after-end'
  | 'invalid-interval'
  | 'no-cycle-open';

export interface TimeEvaluation {
  due: boolean;
  cycles: TimeCycle[];
  reason: NotDueReason | null;
  /** Earliest due date across the returned cycles. */
  nextDueDate: Date | null;
}

/**
 * The number of days before a cycle's due date that generation may begin.
 *
 * `Units` is expressed in multiples of the plan's own interval, which is how a
 * planner expresses "start raising this a week before, for a weekly job, is 1
 * unit; for a monthly job it is half a cycle".
 */
export function horizonDays(horizon: CallHorizon, schedule: TimeSchedule): number {
  if (horizon.value <= 0) return 0;
  if (horizon.unit === 'Days') return horizon.value;
  return horizon.value * approximateIntervalDays(schedule.intervalValue, schedule.intervalUnit);
}

/**
 * The cycle containing `now`, i.e. the most recent occurrence anchored on the
 * plan's start date. Returns null when `now` precedes the start.
 */
export function currentTimeCycle(schedule: TimeSchedule, now: Date): TimeCycle | null {
  const { startDate, intervalValue, intervalUnit } = schedule;
  if (!(intervalValue > 0)) return null;
  if (daysBetweenUtc(startDate, now) < 0) return null;

  const stepDays = approximateIntervalDays(intervalValue, intervalUnit);
  // Seed from the average interval length, then correct with real calendar
  // arithmetic. Bounded by construction: each pass strictly decreases n or
  // increases it toward the answer, and the guards stop a runaway.
  let index = Math.max(0, Math.floor(daysBetweenUtc(startDate, now) / stepDays));
  let dueDate = addInterval(startDate, index * intervalValue, intervalUnit);
  for (let guard = 0; dueDate > startOfUtcDay(now) && guard < 4000; guard += 1) {
    index -= 1;
    if (index < 0) return null;
    dueDate = addInterval(startDate, index * intervalValue, intervalUnit);
  }
  for (let guard = 0; guard < 4000; guard += 1) {
    const next = addInterval(startDate, (index + 1) * intervalValue, intervalUnit);
    if (next > startOfUtcDay(now)) break;
    index += 1;
    dueDate = next;
  }
  return { cycleKey: isoDay(dueDate), dueDate, index };
}

export function nextTimeCycle(schedule: TimeSchedule, cycle: TimeCycle): TimeCycle {
  const dueDate = addInterval(schedule.startDate, (cycle.index + 1) * schedule.intervalValue, schedule.intervalUnit);
  return { cycleKey: isoDay(dueDate), dueDate, index: cycle.index + 1 };
}

/**
 * Every cycle whose due date falls inside the closed window [from, to].
 *
 * This is the compliance report's denominator: the occurrences a plan
 * *scheduled* for a calendar period, as opposed to the ones the scheduler found
 * open to generate (`evaluateTimeSchedule`). The report needs the former, and
 * the difference is the whole point of row 61 - a cycle due on the 20th is
 * scheduled for the month whether or not its work order was ever raised, so a
 * backlogged plan must count against compliance.
 *
 * It is deliberately not horizon-gated: the call horizon decides when work is
 * *raised*, not what was due. Reusing `evaluateTimeSchedule` here would import
 * the generation window into a question about the schedule and quietly shrink
 * the denominator to the cycles a planner could already see.
 *
 * The loop starts from a cycle at or before the window and walks forward using
 * the same calendar arithmetic as the scheduler, so a monthly plan starting on
 * the 31st has its month-end cycles counted exactly where generation would put
 * them. An end date stops the chain, matching SOW 3.4.2.
 */
export function cyclesInWindow(schedule: TimeSchedule, from: Date, to: Date): TimeCycle[] {
  const { startDate, intervalValue, intervalUnit } = schedule;
  if (!(intervalValue > 0)) return [];
  const windowStart = startOfUtcDay(from);
  const windowEnd = startOfUtcDay(to);
  if (windowEnd < windowStart) return [];
  if (windowEnd < startOfUtcDay(startDate)) return [];

  const lastAllowed = schedule.endDate ? startOfUtcDay(schedule.endDate) : null;
  if (lastAllowed && windowStart > lastAllowed) return [];

  const stepDays = approximateIntervalDays(intervalValue, intervalUnit);
  let index = Math.max(0, Math.floor(daysBetweenUtc(startDate, windowStart) / stepDays));
  for (let guard = 0; guard < 4000 && index > 0; guard += 1) {
    if (addInterval(startDate, index * intervalValue, intervalUnit) <= windowStart) break;
    index -= 1;
  }

  const cycles: TimeCycle[] = [];
  for (let guard = 0; guard < 4000; guard += 1) {
    const dueDate = addInterval(startDate, index * intervalValue, intervalUnit);
    if (lastAllowed && dueDate > lastAllowed) break;
    if (dueDate > windowEnd) break;
    if (dueDate >= windowStart) cycles.push({ cycleKey: isoDay(dueDate), dueDate, index });
    index += 1;
  }
  return cycles;
}

/**
 * Every cycle whose generation window has opened by `now` and which has not
 * already been generated, oldest first.
 *
 * `afterCycleKey` is the last cycle this plan generated, taken from the most
 * recent work order's `sourcePlanCycle`. Supplying it is what lets a plan that
 * was dormant for a month catch up one cycle per run rather than either
 * generating a burst or silently skipping the gap.
 */
export function evaluateTimeSchedule(
  schedule: TimeSchedule,
  horizon: CallHorizon,
  now: Date,
  afterCycleKey?: string | null
): TimeEvaluation {
  if (!(schedule.intervalValue > 0)) {
    return { due: false, cycles: [], reason: 'invalid-interval', nextDueDate: null };
  }
  const today = startOfUtcDay(now);
  if (daysBetweenUtc(schedule.startDate, today) < 0) {
    return { due: false, cycles: [], reason: 'before-start', nextDueDate: null };
  }

  const window = horizonDays(horizon, schedule);
  const current = currentTimeCycle(schedule, today);
  if (!current) {
    return { due: false, cycles: [], reason: 'before-start', nextDueDate: null };
  }

  // SOW 3.4.2: an end date stops the plan. Without this check a retired plan
  // kept generating forever, which is how maintenance debt accumulates silently.
  const lastAllowed = schedule.endDate ? startOfUtcDay(schedule.endDate) : null;
  if (lastAllowed && current.dueDate > lastAllowed) {
    return { due: false, cycles: [], reason: 'after-end', nextDueDate: null };
  }

  // Find the first cycle that has not been generated. The last generated cycle
  // is exclusive: reusing it would re-raise a work order that already exists,
  // which is the idempotency defect this key exists to prevent.
  let candidate = current;
  if (afterCycleKey) {
    const lastIndex = indexOfCycleKey(schedule, current, afterCycleKey);
    // When the last generated cycle is not in this plan's chain the baseline is
    // unknown, so fall back to the current cycle rather than dumping every cycle
    // since the plan was created into one run.
    candidate = lastIndex === null ? current : cycleAt(schedule, lastIndex + 1);
  }

  if (lastAllowed && candidate.dueDate > lastAllowed) {
    return { due: false, cycles: [], reason: 'after-end', nextDueDate: null };
  }

  const cycles: TimeCycle[] = [];
  for (let cycle: TimeCycle | null = candidate; cycle; cycle = nextTimeCycle(schedule, cycle)) {
    if (lastAllowed && cycle.dueDate > lastAllowed) break;
    // The window has opened once now is within `window` days of the due date.
    if (addDays(cycle.dueDate, -window) > today) break;
    cycles.push(cycle);
    if (cycles.length >= 500) break;
  }

  if (cycles.length === 0) {
    return { due: false, cycles: [], reason: 'no-cycle-open', nextDueDate: candidate.dueDate };
  }
  return { due: true, cycles, reason: null, nextDueDate: cycles[0].dueDate };
}

/** Upper bound on the search for the last generated cycle, ~13 years of daily. */
const BASELINE_SEARCH_LIMIT = 5000;

function cycleAt(schedule: TimeSchedule, index: number): TimeCycle {
  const dueDate = addInterval(schedule.startDate, index * schedule.intervalValue, schedule.intervalUnit);
  return { cycleKey: isoDay(dueDate), dueDate, index };
}

/**
 * Locate the last cycle this plan generated, as an index.
 *
 * The search runs in whichever direction the key lies, because the call horizon
 * makes the last generated cycle legitimately *later* than the cycle containing
 * today: a plan due 1 April with a 7-day horizon generates on 25 March, so
 * `sourcePlanCycle` is '2026-04-01' while the current cycle is still March's.
 * Walking backwards only, as an earlier version of this did, could never find
 * that key, so the plan fell back to the current cycle and raised the March work
 * order a second time on every run.
 *
 * Returns null when the key is not in this plan's cycle chain, in which case the
 * caller must not guess a baseline.
 */
function indexOfCycleKey(schedule: TimeSchedule, current: TimeCycle, key: string): number | null {
  // `sourcePlanCycle` is a database string, so it can be absent, legacy-format
  // or hand-edited. Anything that is not a plain ISO day is not a cycle key we
  // can position, and searching for it would walk the whole chain to fail.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  if (isoDay(current.dueDate) === key) return current.index;

  if (key > current.cycleKey) {
    for (let index = current.index + 1; index <= current.index + BASELINE_SEARCH_LIMIT; index += 1) {
      const cycle = cycleAt(schedule, index);
      if (isoDay(cycle.dueDate) === key) return index;
      if (isoDay(cycle.dueDate) > key) return null;
    }
    return null;
  }

  for (let index = current.index - 1; index >= 0 && current.index - index <= BASELINE_SEARCH_LIMIT; index -= 1) {
    const cycle = cycleAt(schedule, index);
    if (isoDay(cycle.dueDate) === key) return index;
    if (isoDay(cycle.dueDate) < key) return null;
  }
  return null;
}

export interface MeterThreshold {
  meterId: string;
  /** Advance in the meter's own unit required to trigger the plan. */
  threshold: number;
  /** Most recent reading value for the meter. */
  lastReading: number;
  /** Date of that reading; null when the meter has never been read. */
  lastReadingDate: Date | null;
  /**
   * Reading value at which this plan last generated, used as the baseline. Null
   * when the plan has never generated, in which case the first recorded reading
   * is the baseline.
   */
  baselineReading: number | null;
  /** First recorded reading, the baseline of last resort. */
  firstReading: number | null;
  firstReadingDate: Date | null;
}

export interface MeterEvaluation {
  meterId: string;
  /** Idempotency key. Reading-based, so it does not repeat across runs. */
  cycleKey: string;
  threshold: number;
  /** Units accumulated since the baseline. */
  advance: number;
  /** True once the threshold is met. */
  crossed: boolean;
  /** Projected date the threshold is reached, when a rate can be derived. */
  projectedDueDate: Date | null;
  /** Why no projection is possible, for the operator-facing log. */
  noProjectionReason: 'no-readings' | 'no-rate' | 'not-crossed' | null;
}

/**
 * Average consumption per day over the recorded history.
 *
 * A projection needs a rate, and a rate needs at least two readings at different
 * times. Inventing a rate from a single reading would produce a confident date
 * out of nothing, so a plan with no usable history is reported as not-crossed
 * with `no-rate` rather than guessed at.
 */
export function consumptionPerDay(m: Pick<MeterThreshold, 'lastReading' | 'lastReadingDate' | 'firstReading' | 'firstReadingDate'>): number | null {
  if (m.firstReading === null || m.firstReadingDate === null) return null;
  if (m.lastReadingDate === null) return null;
  const days = daysBetweenUtc(m.firstReadingDate, m.lastReadingDate);
  if (days <= 0) return null;
  const advance = m.lastReading - m.firstReading;
  if (advance <= 0) return null;
  return advance / days;
}

export function evaluateMeter(m: MeterThreshold, now: Date): MeterEvaluation {
  const baseline = m.baselineReading ?? m.firstReading;
  if (baseline === null) {
    return {
      meterId: m.meterId,
      cycleKey: `M:${m.meterId}:none`,
      threshold: m.threshold,
      advance: 0,
      crossed: false,
      projectedDueDate: null,
      noProjectionReason: 'no-readings',
    };
  }

  const advance = m.lastReading - baseline;
  const crossed = advance >= m.threshold;
  const rate = consumptionPerDay(m);
  const today = startOfUtcDay(now);

  let projectedDueDate: Date | null = null;
  let noProjectionReason: MeterEvaluation['noProjectionReason'] = null;
  if (rate === null) {
    noProjectionReason = 'no-rate';
  } else if (crossed) {
    // Already due. Anchor the projection on today rather than back-dating it,
    // so the work order is raised now instead of dated to a past crossing.
    projectedDueDate = today;
    noProjectionReason = null;
  } else {
    const daysRemaining = (m.threshold - advance) / rate;
    projectedDueDate = addDays(today, Math.ceil(daysRemaining));
    noProjectionReason = null;
  }

  return {
    meterId: m.meterId,
    cycleKey: `M:${m.meterId}:${m.lastReading}`,
    threshold: m.threshold,
    advance,
    crossed,
    projectedDueDate,
    noProjectionReason,
  };
}

export type DueCycle =
  | { basis: 'Time'; cycleKey: string; dueDate: Date }
  | { basis: 'Meter'; cycleKey: string; dueDate: Date; meterId: string };

export interface PlanEvaluation {
  due: boolean;
  /** SOW 3.4.3: the work orders to raise now, oldest first. */
  cycles: DueCycle[];
  /** Human-readable explanation, for the scheduler log and the API result. */
  explanation: string;
  time: TimeEvaluation | null;
  meters: MeterEvaluation[];
}

/**
 * SOW 3.4.1: time-based, meter-based, or a combination, whichever is due first.
 *
 * `Time` and `Meter` produce every open cycle. `Combined` deliberately produces
 * at most one, the earliest-due basis, because the SOW says "whichever is due
 * first" rather than "both": a pump on a combined time-or-500-hours plan that
 * came due on both counts on the same morning should raise one work order, not
 * two. A tie resolves to Time, which is the deterministic basis and the one a
 * planner can reason about. The basis not taken stays open and is picked up on a
 * later run, so nothing is lost.
 */
export function evaluatePlan(input: {
  strategy: PlanStrategy;
  time?: { schedule: TimeSchedule; horizon: CallHorizon; afterCycleKey?: string | null };
  meters?: MeterThreshold[];
  now: Date;
}): PlanEvaluation {
  const { strategy, now } = input;
  const meters = (input.meters ?? []).map((m) => evaluateMeter(m, now));

  const time =
    strategy === 'Meter'
      ? null
      : evaluateTimeSchedule(
          input.time!.schedule,
          input.time!.horizon,
          now,
          input.time!.afterCycleKey
        );

  const dueMeters = meters.filter((m) => m.crossed);

  if (strategy === 'Time') {
    const cycles: DueCycle[] = (time?.cycles ?? []).map((c) => ({
      basis: 'Time' as const,
      cycleKey: c.cycleKey,
      dueDate: c.dueDate,
    }));
    return {
      due: cycles.length > 0,
      cycles,
      explanation: explainTime(time),
      time,
      meters,
    };
  }

  if (strategy === 'Meter') {
    const cycles: DueCycle[] = dueMeters.map((m) => ({
      basis: 'Meter' as const,
      cycleKey: m.cycleKey,
      dueDate: m.projectedDueDate ?? now,
      meterId: m.meterId,
    }));
    return {
      due: cycles.length > 0,
      cycles,
      explanation:
        cycles.length > 0
          ? `${cycles.length} meter threshold(s) reached`
          : 'no meter threshold reached',
      time,
      meters,
    };
  }

  // Combined
  const candidates: Array<{ rank: number; cycle: DueCycle }> = [];
  for (const c of time?.cycles ?? []) {
    candidates.push({ rank: 0, cycle: { basis: 'Time', cycleKey: c.cycleKey, dueDate: c.dueDate } });
  }
  for (const m of dueMeters) {
    candidates.push({
      rank: 1,
      cycle: {
        basis: 'Meter',
        cycleKey: m.cycleKey,
        dueDate: m.projectedDueDate ?? now,
        meterId: m.meterId,
      },
    });
  }
  candidates.sort((a, b) => {
    const diff = a.cycle.dueDate.getTime() - b.cycle.dueDate.getTime();
    // Time wins a tie, via the rank, so the outcome does not depend on input order.
    return diff !== 0 ? diff : a.rank - b.rank;
  });

  const chosen = candidates.length > 0 ? [candidates[0].cycle] : [];
  return {
    due: chosen.length > 0,
    cycles: chosen,
    explanation:
      chosen.length > 0
        ? `combined: earliest basis is ${chosen[0].basis} (due ${isoDay(chosen[0].dueDate)})`
        : `combined: nothing due (${explainTime(time)})`,
    time,
    meters,
  };
}

function explainTime(time: TimeEvaluation | null): string {
  if (!time) return 'time strategy not evaluated';
  switch (time.reason) {
    case 'before-start':
      return 'plan start date is in the future';
    case 'after-end':
      return 'plan end date has passed';
    case 'invalid-interval':
      return 'interval must be greater than zero';
    case 'no-cycle-open':
      return time.nextDueDate
        ? `next cycle ${isoDay(time.nextDueDate)} is not yet inside the call horizon`
        : 'no cycle is inside the call horizon';
    default:
      return `${time.cycles.length} time cycle(s) inside the call horizon`;
  }
}
