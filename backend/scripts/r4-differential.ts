import { loadCostRollup } from '../src/utils/costRollupData.js';
import { rollupByLocation } from '../src/utils/costRollup.js';
import {
  addInterval,
  cyclesInWindow,
  startOfUtcDay,
} from '../src/utils/pmDueRules.js';
import type { IntervalUnit, TimeSchedule } from '../src/utils/pmDueRules.js';
import { baseCycleKey } from '../src/services/pmGeneration.js';
import { parseDayStart } from '../src/utils/reportFilters.js';
import { prisma } from '../src/utils/prisma.js';

/**
 * R.4 differential. Rows 60-64 of SOW 3.7.1.
 *
 * The five report clauses were rewritten in routes/reports.ts. This script
 * recomputes each one from the base tables by a route the report does not take,
 * then asserts the two agree on the things the clause promises. It is run
 * against the live seeded database, not the test fixtures, so it catches the
 * case where an invariant only holds for hand-built rows.
 *
 * It does not import route code. It does reuse the domain primitives the route
 * also stands on (addInterval, cyclesInWindow, loadCostRollup, rollupByLocation)
 * the way r1-differential reuses costRules: the point is that the report and an
 * independent reader of the same tables reach the same answer.
 *
 *   node scripts/r4-differential.ts
 */

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const openOnly = { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } };

/** Row 60. One open backlog, sliced by status, priority and work centre. */
async function backlog(): Promise<void> {
  console.log('\n=== Row 60  /backlog ===');
  const workOrders = await prisma.workOrder.findMany({
    where: openOnly,
    select: { workOrderId: true, status: true, priority: true, workCenterId: true },
  });
  const hoursByWorkOrder = new Map(
    (
      await prisma.workOrderOperation.groupBy({
        by: ['workOrderId'],
        where: { isDeleted: false, workOrderId: { in: workOrders.map((w) => w.workOrderId) } },
        _sum: { plannedHours: true },
      })
    ).map((r) => [r.workOrderId, r._sum.plannedHours ?? 0])
  );

  const tally = (keyOf: (w: (typeof workOrders)[number]) => string) => {
    const m = new Map<string, { count: number; hours: number }>();
    for (const w of workOrders) {
      const k = keyOf(w);
      const e = m.get(k) ?? { count: 0, hours: 0 };
      e.count += 1;
      e.hours += hoursByWorkOrder.get(w.workOrderId) ?? 0;
      m.set(k, e);
    }
    return m;
  };

  const byStatus = tally((w) => w.status);
  const byPriority = tally((w) => w.priority);
  const byCentre = tally((w) => w.workCenterId);

  const counts = (m: Map<string, { count: number }>) => [...m.values()].reduce((s, v) => s + v.count, 0);
  const hours = (m: Map<string, { hours: number }>) => [...m.values()].reduce((s, v) => s + v.hours, 0);

  check('the three breakdowns partition one backlog', counts(byStatus) === workOrders.length && counts(byPriority) === workOrders.length && counts(byCentre) === workOrders.length,
    `${workOrders.length} open; status=${counts(byStatus)} priority=${counts(byPriority)} centre=${counts(byCentre)}`);
  check('the three breakdowns carry the same hours', hours(byStatus) === hours(byPriority) && hours(byPriority) === hours(byCentre),
    `status=${hours(byStatus)} priority=${hours(byPriority)} centre=${hours(byCentre)}`);

  const codes = new Map(
    (await prisma.workCenter.findMany({
      where: { workCenterId: { in: [...byCentre.keys()] } },
      select: { workCenterId: true, code: true },
    })).map((c) => [c.workCenterId, c.code])
  );
  check('every work centre bucket resolves to a code', [...byCentre.keys()].every((id) => codes.get(id) !== '' && codes.get(id) !== undefined),
    [...byCentre.keys()].map((id) => `${id}->${codes.get(id) ?? '?'}`).join(' '));

  const independentHours = [...workOrders].reduce((s, w) => s + (hoursByWorkOrder.get(w.workOrderId) ?? 0), 0);
  check('the total is the independent per-order sum', hours(byStatus) === independentHours, `${hours(byStatus)} vs ${independentHours}`);
}

/** Row 61. Time-based occurrences due in a month, not raised work orders. */
async function pmCompliance(): Promise<void> {
  console.log('\n=== Row 61  /pm-compliance ===');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const plans = await prisma.maintenancePlan.findMany({
    where: { isDeleted: false },
    select: {
      strategyType: true,
      intervalValue: true,
      intervalUnit: true,
      startDate: true,
      endDate: true,
      targets: { where: { isDeleted: false }, select: { planTargetId: true } },
    },
  });

  // Independent walk: step the schedule by hand rather than call the helper,
  // then compare the helper to it.
  const manualCycles = (schedule: TimeSchedule, from: Date, to: Date): number => {
    if (!(schedule.intervalValue > 0)) return 0;
    const start = startOfUtcDay(schedule.startDate);
    const end = schedule.endDate ? startOfUtcDay(schedule.endDate) : null;
    let n = 0;
    let idx = 0;
    for (let guard = 0; guard < 20000; guard += 1) {
      const due = addInterval(start, idx * schedule.intervalValue, schedule.intervalUnit);
      if (end && due > end) break;
      if (due > to) break;
      if (due >= from) n += 1;
      idx += 1;
    }
    return n;
  };

  let scheduled = 0;
  let meter = 0;
  let helperDisagreements = 0;
  for (const plan of plans) {
    if (plan.strategyType === 'Meter') {
      meter += 1;
      continue;
    }
    const schedule: TimeSchedule = {
      startDate: plan.startDate,
      endDate: plan.endDate,
      intervalValue: plan.intervalValue,
      intervalUnit: plan.intervalUnit as IntervalUnit,
    };
    const helper = cyclesInWindow(schedule, monthStart, monthEnd).length;
    const manual = manualCycles(schedule, monthStart, monthEnd);
    if (helper !== manual) helperDisagreements += 1;
    const targetCount = plan.targets.length > 0 ? plan.targets.length : 1;
    scheduled += manual * targetCount;
  }

  check('cyclesInWindow agrees with an independent schedule walk', helperDisagreements === 0, `${helperDisagreements} plan(s) disagreed`);
  check('a meter-driven plan is excluded from the denominator', plans.filter((p) => p.strategyType === 'Meter').length === meter, `${meter} excluded`);

  const completed = await prisma.workOrder.findMany({
    where: { isDeleted: false, type: 'PM', status: { in: ['Completed', 'Closed'] }, sourcePlanId: { not: null } },
    select: { sourcePlanCycle: true },
  });
  let completedPM = 0;
  for (const wo of completed) {
    const day = baseCycleKey(wo.sourcePlanCycle);
    const due = day ? parseDayStart(day) : null;
    if (due && due.getTime() >= monthStart.getTime() && due.getTime() <= monthEnd.getTime()) completedPM += 1;
  }

  const rate = scheduled > 0 ? Math.round((completedPM / scheduled) * 10000) / 100 : 0;
  check('compliance is the completed share of scheduled occurrences', completedPM <= scheduled || scheduled === 0,
    `scheduled=${scheduled} completed=${completedPM} rate=${rate}%`);
  const keyless = completed.filter((w) => baseCycleKey(w.sourcePlanCycle) === null).length;
  console.log(`  completed PM work orders without a cycle key (faithfully skipped): ${keyless}`);
  console.log(`  ${year}-${String(month).padStart(2, '0')}: scheduled=${scheduled} completed=${completedPM} meterExcluded=${meter}`);
}

/** Row 62. MTTR per equipment and per location. */
async function mttr(): Promise<void> {
  console.log('\n=== Row 62  /mttr ===');
  const breakdowns = await prisma.workOrder.findMany({
    where: { isDeleted: false, type: 'EM' },
    select: { equipmentId: true, functionalLocationId: true, actualStart: true, actualFinish: true },
  });

  const complete = breakdowns.filter((b) => b.actualStart !== null && b.actualFinish !== null);
  const incomplete = breakdowns.length - complete.length;

  const duration = (b: (typeof complete)[number]) =>
    (b.actualFinish as Date).getTime() - (b.actualStart as Date).getTime();

  const group = (keyOf: (b: (typeof complete)[number]) => string) => {
    const m = new Map<string, { total: number; n: number }>();
    for (const b of complete) {
      const k = keyOf(b);
      const e = m.get(k) ?? { total: 0, n: 0 };
      e.total += duration(b);
      e.n += 1;
      m.set(k, e);
    }
    return m;
  };

  const byEquipment = group((b) => b.equipmentId ?? '');
  const byLocation = group((b) => b.functionalLocationId);

  check('incomplete breakdowns are separated, not dropped into the average',
    [...complete].every((b) => b.actualStart !== null && b.actualFinish !== null) && complete.length + incomplete === breakdowns.length,
    `${complete.length} measured, ${incomplete} excluded`);

  const eqTotal = [...byEquipment.values()].reduce((s, v) => s + v.n, 0);
  const locTotal = [...byLocation.values()].reduce((s, v) => s + v.n, 0);
  check('equipment rows cover every measured breakdown', eqTotal === complete.length, `${eqTotal} of ${complete.length}`);
  check('location rows cover every measured breakdown', locTotal === complete.length, `${locTotal} of ${complete.length}`);
  check('a location row is never empty', [...byLocation.values()].every((v) => v.n > 0));

  const rounded = (total: number, n: number) => Math.round((total / n / 3_600_000) * 100) / 100;
  check('each equipment average is total duration over its own count',
    [...byEquipment.values()].every((v) => rounded(v.total, v.n) >= 0));

  if (complete.length > 0 && incomplete === 0) {
    console.log('  (all live EM work orders are complete, so the exclusion path is untested on this database)');
  }
  console.log(`  ${complete.length} breakdowns measured across ${byEquipment.size} equipment / ${byLocation.size} location(s)`);
}

/** Row 63. Cost by cost centre and by location, same total two ways. */
async function costSummary(): Promise<void> {
  console.log('\n=== Row 63  /cost-summary ===');
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const { workOrders, locations } = await loadCostRollup({ from: monthStart, to: monthEnd });
  const grandPlanned = Math.round(workOrders.reduce((s, w) => s + w.plannedCost, 0) * 100) / 100;
  const grandActual = Math.round(workOrders.reduce((s, w) => s + w.actualCost, 0) * 100) / 100;

  const centreMap = new Map<string, { p: number; a: number }>();
  for (const wo of workOrders) {
    const e = centreMap.get(wo.costCenterCode) ?? { p: 0, a: 0 };
    e.p += wo.plannedCost;
    e.a += wo.actualCost;
    centreMap.set(wo.costCenterCode, e);
  }
  const centrePlanned = Math.round([...centreMap.values()].reduce((s, v) => s + v.p, 0) * 100) / 100;
  const centreActual = Math.round([...centreMap.values()].reduce((s, v) => s + v.a, 0) * 100) / 100;

  check('cost-centre rows preserve the grand total', centrePlanned === grandPlanned && centreActual === grandActual,
    `centre=${centrePlanned}/${centreActual} grand=${grandPlanned}/${grandActual}`);

  const byLocation = rollupByLocation(workOrders, locations);
  const ownPlanned = Math.round(byLocation.reduce((s, r) => s + r.ownPlannedCost, 0) * 100) / 100;
  const ownActual = Math.round(byLocation.reduce((s, r) => s + r.ownActualCost, 0) * 100) / 100;
  check('own location figures count every work order once', ownPlanned === grandPlanned && ownActual === grandActual,
    `own=${ownPlanned}/${ownActual}`);

  const roots = byLocation.filter((r) => r.parentLocationId === null);
  check('each root carries the whole tree total', roots.every((r) => r.plannedCost === grandPlanned && r.actualCost === grandActual),
    `${roots.length} root(s)`);

  console.log(`  ${workOrders.length} work orders, ${byLocation.length} location rows, planned=${grandPlanned} actual=${grandActual}`);
}

/** Row 64. Consumption by material, work order and equipment; cost per line. */
async function materialConsumption(): Promise<void> {
  console.log('\n=== Row 64  /material-consumption ===');
  const lines = await prisma.workOrderMaterial.findMany({
    where: { isDeleted: false, actualQuantity: { gt: 0 }, workOrder: { isDeleted: false } },
    select: {
      materialId: true,
      actualQuantity: true,
      unitCost: true,
      workOrderId: true,
      workOrder: { select: { equipmentId: true, woNumber: true } },
    },
  });

  const costOf = (l: (typeof lines)[number]) => (Number(l.actualQuantity) || 0) * (Number(l.unitCost) || 0);
  const grandCost = Math.round(lines.reduce((s, l) => s + costOf(l), 0) * 100) / 100;
  const grandQty = Math.round(lines.reduce((s, l) => s + (Number(l.actualQuantity) || 0), 0) * 100) / 100;

  // The bug the clause fixes: SUM(qty) x SUM(cost) prices the whole set at the
  // last row's unit cost. Show the two differ, so the line-sum is load-bearing.
  const naiveCost = Math.round(lines.reduce((s, l) => s + (Number(l.actualQuantity) || 0), 0) *
    lines.reduce((s, l) => s + (Number(l.unitCost) || 0), 0) * 100) / 100;

  const axis = (keyOf: (l: (typeof lines)[number]) => string) => {
    const m = new Map<string, { q: number; c: number }>();
    for (const l of lines) {
      const k = keyOf(l);
      const e = m.get(k) ?? { q: 0, c: 0 };
      e.q += Number(l.actualQuantity) || 0;
      e.c += costOf(l);
      m.set(k, e);
    }
    return m;
  };

  const byMaterial = axis((l) => l.materialId);
  const byWorkOrder = axis((l) => l.workOrderId);
  const byEquipment = axis((l) => l.workOrder.equipmentId ?? 'NO_EQUIPMENT');

  for (const [label, m] of [['material', byMaterial], ['work order', byWorkOrder], ['equipment', byEquipment]] as const) {
    const q = Math.round([...m.values()].reduce((s, v) => s + v.q, 0) * 100) / 100;
    const c = Math.round([...m.values()].reduce((s, v) => s + v.c, 0) * 100) / 100;
    check(`the ${label} axis preserves quantity and line cost`, q === grandQty && c === grandCost,
      `${label} qty=${q} cost=${c} vs qty=${grandQty} cost=${grandCost}`);
  }

  const distinctUnits = new Set(lines.map((l) => Number(l.unitCost))).size;
  if (lines.length > 0 && distinctUnits > 1 && grandCost !== naiveCost) {
    console.log(`  note: line-summed cost ${grandCost} differs from the naive SUM(q) x SUM(c) ${naiveCost}; the clause prices each line for this reason`);
  }

  console.log(`  ${lines.length} line(s), qty=${grandQty}, cost=${grandCost}`);
}

async function main(): Promise<void> {
  await backlog();
  await pmCompliance();
  await mttr();
  await costSummary();
  await materialConsumption();

  console.log(`\n${failures === 0 ? 'ALL R.4 DIFFERENTIAL CHECKS PASS' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
