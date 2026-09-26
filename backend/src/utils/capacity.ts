/**
 * SOW 3.1.3: "Work centers with capacity (hours/day)" and "Work centers and
 * crafts used for scheduling and cost estimation".
 *
 * WorkCenter.dailyCapacityHours has existed since the schema was written, and
 * the craft's hourlyRate feeds cost estimation. Nothing ever read the capacity
 * column, so a work centre could be loaded to four times its daily capacity and
 * the only symptom was a technician who could not finish the week.
 *
 * This module is pure on purpose. The spreading rule below has a subtlety worth
 * pinning with tests, and testing it through the database would need a seeded
 * fixture to assert against for every case.
 *
 * ## Which work orders consume capacity
 *
 * Planned, Scheduled, In Progress and Suspended. Draft is excluded on purpose: a
 * draft is a proposal, and a capacity board that counts proposals cannot be used
 * to decide what to schedule next. Completed and Closed are excluded because the
 * hours are already spent. Cancelled is excluded because the work will not happen.
 *
 * ## How hours land on days
 *
 * A work order has a window, not a per-operation date, so the total planned hours
 * of its operations are spread evenly across the days of that window.
 *
 * The subtlety: the divisor is always the *full* window length, never the part of
 * the window that happens to fall inside the requested range. A ten-day work
 * order shown on a two-day board has to show one tenth of its hours on each of
 * those two days. Dividing by the visible days instead would multiply the load
 * fivefold and produce a board that condemns a work centre nobody overloaded.
 */

/** Statuses whose planned hours are loaded against a work centre's capacity. */
export const CAPACITY_CONSUMING_STATUSES = [
  'Planned',
  'Scheduled',
  'In Progress',
  'Suspended',
] as const;

export function consumesCapacity(status: string): boolean {
  return (CAPACITY_CONSUMING_STATUSES as readonly string[]).includes(status);
}

export interface CapacityOperation {
  craftId: string;
  plannedHours: number;
}

export interface CapacityWorkOrder {
  workOrderId: string;
  woNumber: string;
  status: string;
  workCenterId: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  operations: CapacityOperation[];
}

export interface CapacityWorkCenter {
  workCenterId: string;
  workCenterCode: string;
  name: string;
  dailyCapacityHours: number;
}

export interface CraftLoad {
  craftId: string;
  plannedHours: number;
}

export interface CapacityDay {
  /** YYYY-MM-DD. */
  date: string;
  plannedHours: number;
  capacityHours: number;
  /** plannedHours / capacityHours, or null when the centre has no capacity set. */
  utilisation: number | null;
  overCapacity: boolean;
  crafts: CraftLoad[];
}

export interface CapacityBoardEntry {
  workCenterId: string;
  workCenterCode: string;
  name: string;
  capacityHours: number;
  days: CapacityDay[];
  /**
   * Planned hours on work orders in a capacity-consuming status that have no
   * planned start, so they cannot be placed on a day.
   *
   * Surfaced rather than dropped. A board that silently ignores undated work is
   * exactly the board that looks fine while the week falls over.
   */
  unscheduledHours: number;
  unscheduledWorkOrders: string[];
}

export interface CapacityBoard {
  from: string;
  to: string;
  entries: CapacityBoardEntry[];
}

/** Calendar days from `from` to `to` inclusive, as YYYY-MM-DD strings. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Span {
  start: string;
  end: string;
  dayCount: number;
}

/**
 * The calendar days a work order occupies, and how many days that is in total.
 *
 * A finish before the start is treated as a one-day span rather than rejected: the
 * window is a planning estimate, and a nonsensical one should show up on the board
 * as a single day's load rather than disappear.
 */
export function planSpan(startISO: string, finishISO: string | null): Span {
  const start = new Date(startISO);
  const finish = finishISO ? new Date(finishISO) : null;
  if (Number.isNaN(start.getTime())) {
    return { start: '', end: '', dayCount: 0 };
  }
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let endDay = startDay;
  if (finish && !Number.isNaN(finish.getTime())) {
    const f = new Date(Date.UTC(finish.getUTCFullYear(), finish.getUTCMonth(), finish.getUTCDate()));
    if (f.getTime() > startDay.getTime()) endDay = f;
  }
  const dayCount = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1;
  return { start: dayKey(startDay), end: dayKey(endDay), dayCount };
}

export function buildCapacityBoard(
  workCenters: CapacityWorkCenter[],
  workOrders: CapacityWorkOrder[],
  from: string,
  to: string,
): CapacityBoard {
  const days = enumerateDays(from, to);
  const daySet = new Set(days);

  const byCenter = new Map<string, CapacityBoardEntry>();
  for (const wc of workCenters) {
    byCenter.set(wc.workCenterId, {
      workCenterId: wc.workCenterId,
      workCenterCode: wc.workCenterCode,
      name: wc.name,
      capacityHours: wc.dailyCapacityHours,
      days: days.map((date) => ({
        date,
        plannedHours: 0,
        capacityHours: wc.dailyCapacityHours,
        utilisation: wc.dailyCapacityHours > 0 ? 0 : null,
        overCapacity: false,
        crafts: [],
      })),
      unscheduledHours: 0,
      unscheduledWorkOrders: [],
    });
  }

  // Accumulate per centre, per day, per craft, then flatten. Rounding happens once
  // at the end: rounding each work order's share to two places before summing would
  // let a centre with fifty one-hour jobs accumulate visible drift.
  const load = new Map<string, Map<string, Map<string, number>>>();

  const addHours = (wcId: string, date: string, craftId: string, hours: number) => {
    let byDay = load.get(wcId);
    if (!byDay) {
      byDay = new Map<string, Map<string, number>>();
      load.set(wcId, byDay);
    }
    const byCraft = byDay.get(date) ?? new Map<string, number>();
    byDay.set(date, byCraft);
    byCraft.set(craftId, (byCraft.get(craftId) ?? 0) + hours);
  };

  for (const wo of workOrders) {
    if (!consumesCapacity(wo.status)) continue;
    const entry = byCenter.get(wo.workCenterId);
    if (!entry) continue;

    const totalHours = wo.operations.reduce((sum, op) => sum + (op.plannedHours || 0), 0);
    if (totalHours <= 0) continue;

    if (!wo.plannedStart) {
      entry.unscheduledHours = round2(entry.unscheduledHours + totalHours);
      entry.unscheduledWorkOrders.push(wo.woNumber);
      continue;
    }

    const span = planSpan(wo.plannedStart, wo.plannedFinish);
    if (span.dayCount === 0) continue;

    // Divisor is the whole window, so a window wider than the board is not
    // inflated onto the days that happen to be visible.
    const perDay = totalHours / span.dayCount;

    for (const date of days) {
      if (date < span.start || date > span.end) continue;
      for (const op of wo.operations) {
        if (!op.plannedHours) continue;
        addHours(wo.workCenterId, date, op.craftId, (op.plannedHours * perDay) / totalHours);
      }
    }
  }

  for (const [wcId, byDay] of load) {
    const entry = byCenter.get(wcId);
    if (!entry) continue;
    for (const day of entry.days) {
      const byCraft = byDay.get(day.date);
      if (!byCraft) continue;
      let total = 0;
      for (const [craftId, hours] of byCraft) {
        const h = round2(hours);
        if (h === 0) continue;
        day.crafts.push({ craftId, plannedHours: h });
        total += h;
      }
      day.crafts.sort((a, b) => b.plannedHours - a.plannedHours);
      day.plannedHours = round2(total);
      if (day.capacityHours > 0) {
        day.utilisation = round2(day.plannedHours / day.capacityHours);
        day.overCapacity = day.plannedHours > day.capacityHours;
      }
    }
  }

  const entries = [...byCenter.values()].sort((a, b) =>
    a.workCenterCode.localeCompare(b.workCenterCode));

  return { from, to, entries };
}
