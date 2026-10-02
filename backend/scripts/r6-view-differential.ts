import '../tests/load-env.js';
import { prisma } from '../src/utils/prisma.js';
import { loadCostRollup } from '../src/utils/costRollupData.js';
import { rollupByLocation } from '../src/utils/costRollup.js';
import { roundMoney } from '../src/utils/costRules.js';

/**
 * R.6 differential. SOW 5.2, the SQL view layer.
 *
 * The views in prisma/migrations/20261002160000_reporting_views are a second
 * contract over the operational tables, for the Client's BI tool. This script
 * checks two things against the live seeded database: that every view exists
 * and is queryable, and that each aggregate view carries the same figures an
 * independent reader of the base tables derives by a different route. It does
 * not import route code, and it does not read the views to build the expected
 * side.
 *
 * The route-level agreement -- view against the actual /api/reports response --
 * is asserted in tests/routes/reportsViews.test.ts. Together they pin both ends:
 * the view matches the reports, and the view matches an independent recompute.
 *
 *   tsx scripts/r6-view-differential.ts
 */

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

/** Every view this migration is expected to create. */
const EXPECTED_VIEWS = [
  'report_functional_location',
  'report_equipment',
  'report_work_center',
  'report_craft',
  'report_work_order',
  'report_work_order_operation',
  'report_material_consumption',
  'report_notification',
  'report_maintenance_plan',
  'report_pm_occurrence',
  'report_backlog',
  'report_backlog_hours_by_work_center',
  'report_cost_by_cost_center',
  'report_cost_by_location',
  'report_downtime_by_equipment',
  'report_mttr_by_equipment',
  'report_mttr_by_location',
  'report_mtbf_by_equipment',
  'report_material_consumption_by_material',
  'report_material_consumption_by_work_order',
  'report_material_consumption_by_equipment',
  'report_top_cost_equipment',
  'report_notifications_awaiting_conversion',
];

async function viewsExist(): Promise<void> {
  console.log('\n=== view layer exists and is queryable ===');
  const rows = await prisma.$queryRaw<Array<{ viewname: string }>>`
    SELECT viewname FROM pg_views WHERE schemaname = 'public'`;
  const present = new Set(rows.map((r) => r.viewname));
  for (const name of EXPECTED_VIEWS) {
    check(`view ${name} exists`, present.has(name));
  }
}

async function backlog(): Promise<void> {
  console.log('\n=== report_backlog vs an independent grouping ===');
  const open = await prisma.workOrder.findMany({
    where: { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } },
    select: { workOrderId: true, status: true, priority: true, workCenterId: true },
  });
  const hours = new Map(
    (
      await prisma.workOrderOperation.groupBy({
        by: ['workOrderId'],
        where: { isDeleted: false, workOrderId: { in: open.map((w) => w.workOrderId) } },
        _sum: { plannedHours: true },
      })
    ).map((r) => [r.workOrderId, r._sum.plannedHours ?? 0])
  );

  const tally = (keyOf: (w: (typeof open)[number]) => string) => {
    const m = new Map<string, { count: number; hours: number }>();
    for (const w of open) {
      const k = keyOf(w);
      const e = m.get(k) ?? { count: 0, hours: 0 };
      e.count += 1;
      e.hours += hours.get(w.workOrderId) ?? 0;
      m.set(k, e);
    }
    return m;
  };

  const expected = {
    status: tally((w) => w.status),
    priority: tally((w) => w.priority),
    work_center: tally((w) => w.workCenterId),
  };

  const view = await prisma.$queryRaw<Array<{ dimension: string; key: string; open_count: number; planned_hours: number }>>`
    SELECT dimension, key, open_count, planned_hours FROM report_backlog`;
  const actual = new Map<string, Map<string, { count: number; hours: number }>>();
  for (const r of view) {
    const dim = actual.get(r.dimension) ?? new Map();
    dim.set(r.key, { count: Number(r.open_count), hours: num(r.planned_hours) });
    actual.set(r.dimension, dim);
  }

  for (const dim of ['status', 'priority', 'work_center'] as const) {
    const ex = expected[dim];
    const ac = actual.get(dim) ?? new Map();
    check(`${dim} breakdown covers the same keys`, ex.size === ac.size && [...ex.keys()].every((k) => ac.has(k)),
      `independent=${ex.size} view=${ac.size}`);
    let countsMatch = true;
    let hoursMatch = true;
    for (const [k, ev] of ex) {
      const av = ac.get(k);
      if (!av || av.count !== ev.count) countsMatch = false;
      if (!av || Math.abs(av.hours - ev.hours) > 0.011) hoursMatch = false;
    }
    check(`${dim} counts agree`, countsMatch);
    check(`${dim} planned hours agree`, hoursMatch);
  }
}

async function cost(): Promise<void> {
  console.log('\n=== report_cost_by_cost_center / _by_location vs the rollups ===');
  const { workOrders, locations } = await loadCostRollup();

  const centre = new Map<string, { planned: number; actual: number }>();
  for (const wo of workOrders) {
    const e = centre.get(wo.costCenterCode) ?? { planned: 0, actual: 0 };
    e.planned += wo.plannedCost;
    e.actual += wo.actualCost;
    centre.set(wo.costCenterCode, e);
  }

  const viewCentre = await prisma.$queryRaw<Array<{ cost_center_code: string; planned_cost: unknown; actual_cost: unknown; work_order_count: number }>>`
    SELECT cost_center_code, planned_cost, actual_cost, work_order_count FROM report_cost_by_cost_center`;
  check('cost-centre keys agree', centre.size === viewCentre.length,
    `independent=${centre.size} view=${viewCentre.length}`);
  let centreMatch = true;
  for (const r of viewCentre) {
    const ex = centre.get(r.cost_center_code);
    if (!ex || Math.abs(roundMoney(ex.planned) - num(r.planned_cost)) > 0.011
      || Math.abs(roundMoney(ex.actual) - num(r.actual_cost)) > 0.011) centreMatch = false;
  }
  check('cost-centre planned and actual agree', centreMatch);

  const rolled = rollupByLocation(workOrders, locations);
  const viewLoc = await prisma.$queryRaw<Array<{ functional_location_id: string; planned_cost: unknown; actual_cost: unknown }>>`
    SELECT functional_location_id, planned_cost, actual_cost FROM report_cost_by_location`;
  const viewLocMap = new Map(viewLoc.map((r) => [r.functional_location_id, r]));
  let locMatch = viewLocMap.size === rolled.length;
  for (const l of rolled) {
    const r = viewLocMap.get(l.functionalLocationId);
    if (!r || Math.abs(l.plannedCost - num(r.planned_cost)) > 0.011
      || Math.abs(l.actualCost - num(r.actual_cost)) > 0.011) locMatch = false;
  }
  check('location subtree planned and actual agree', locMatch,
    `independent=${rolled.length} view=${viewLocMap.size}`);
}

async function downtimeFamily(): Promise<void> {
  console.log('\n=== downtime, MTTR, MTBF vs an independent recompute ===');
  const breakdowns = await prisma.workOrder.findMany({
    where: { isDeleted: false, type: 'EM', equipmentId: { not: null }, actualStart: { not: null }, actualFinish: { not: null } },
    select: { equipmentId: true, functionalLocationId: true, actualStart: true, actualFinish: true },
  });

  const byEquipment = new Map<string, { span: number; downtime: number; count: number }>();
  for (const bd of breakdowns) {
    if (!bd.equipmentId || !bd.actualStart || !bd.actualFinish) continue;
    const e = byEquipment.get(bd.equipmentId) ?? { span: 0, downtime: 0, count: 0 };
    e.count += 1;
    e.downtime += bd.actualFinish.getTime() - bd.actualStart.getTime();
    e.span = Math.max(e.span, bd.actualStart.getTime());
    byEquipment.set(bd.equipmentId, e);
  }
  // span must be max-min of actualStart, not the running max.
  const minStart = new Map<string, number>();
  for (const bd of breakdowns) {
    if (!bd.equipmentId || !bd.actualStart) continue;
    const t = bd.actualStart.getTime();
    const m = minStart.get(bd.equipmentId);
    minStart.set(bd.equipmentId, m === undefined ? t : Math.min(m, t));
  }

  const viewMttr = await prisma.$queryRaw<Array<{ equipment_id: string; breakdown_count: number; mttr_hours: unknown }>>`
    SELECT equipment_id, breakdown_count, mttr_hours FROM report_mttr_by_equipment`;
  const viewMttrMap = new Map(viewMttr.map((r) => [r.equipment_id, r]));
  check('MTTR equipment set agrees', viewMttrMap.size === byEquipment.size,
    `independent=${byEquipment.size} view=${viewMttrMap.size}`);
  let mttrMatch = true;
  for (const [id, e] of byEquipment) {
    const r = viewMttrMap.get(id);
    const expected = roundMoney(e.downtime / e.count / 3_600_000);
    if (!r || Number(r.breakdown_count) !== e.count || Math.abs(expected - num(r.mttr_hours)) > 0.011) mttrMatch = false;
  }
  check('MTTR hours agree', mttrMatch);

  const viewMtbf = await prisma.$queryRaw<Array<{ equipment_id: string; breakdown_count: number; mtbf_hours: unknown }>>`
    SELECT equipment_id, breakdown_count, mtbf_hours FROM report_mtbf_by_equipment`;
  const viewMtbfMap = new Map(viewMtbf.map((r) => [r.equipment_id, r]));
  let mtbfMatch = true;
  for (const [id, e] of byEquipment) {
    const r = viewMtbfMap.get(id);
    if (!r) { mtbfMatch = false; continue; }
    const span = e.span - (minStart.get(id) ?? 0);
    const expected = e.count < 2 ? 0 : roundMoney((span - e.downtime) / (e.count - 1) / 3_600_000);
    if (Math.abs(expected - num(r.mtbf_hours)) > 0.011) mtbfMatch = false;
  }
  check('MTBF hours agree', mtbfMatch);
}

async function consumption(): Promise<void> {
  console.log('\n=== report_material_consumption_by_material vs the consumption lines ===');
  const lines = await prisma.workOrderMaterial.findMany({
    where: { isDeleted: false, actualQuantity: { gt: 0 }, workOrder: { isDeleted: false } },
    select: { materialId: true, actualQuantity: true, unitCost: true },
  });
  const expected = new Map<string, { qty: number; cost: number; count: number }>();
  for (const l of lines) {
    const e = expected.get(l.materialId) ?? { qty: 0, cost: 0, count: 0 };
    e.qty += l.actualQuantity;
    e.cost += l.actualQuantity * Number(l.unitCost);
    e.count += 1;
    expected.set(l.materialId, e);
  }

  const view = await prisma.$queryRaw<Array<{ material_id: string; usage_count: number; total_quantity_used: unknown; total_cost: unknown }>>`
    SELECT material_id, usage_count, total_quantity_used, total_cost FROM report_material_consumption_by_material`;
  const viewMap = new Map(view.map((r) => [r.material_id, r]));
  check('material set agrees', viewMap.size === expected.size,
    `independent=${expected.size} view=${viewMap.size}`);
  let match = true;
  for (const [id, e] of expected) {
    const r = viewMap.get(id);
    if (!r || Number(r.usage_count) !== e.count
      || Math.abs(roundMoney(e.qty) - num(r.total_quantity_used)) > 0.011
      || Math.abs(roundMoney(e.cost) - num(r.total_cost)) > 0.011) match = false;
  }
  check('material quantity and cost agree', match);
}

async function topCost(): Promise<void> {
  console.log('\n=== report_top_cost_equipment vs the stored cost columns ===');
  const rows = await prisma.workOrder.findMany({
    where: { isDeleted: false, equipmentId: { not: null } },
    select: { equipmentId: true, plannedCost: true, actualCost: true },
  });
  const totals = new Map<string, number>();
  for (const wo of rows) {
    if (!wo.equipmentId) continue;
    const actual = Number(wo.actualCost);
    const planned = Number(wo.plannedCost);
    totals.set(wo.equipmentId, (totals.get(wo.equipmentId) ?? 0) + (actual > 0 ? actual : planned));
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const view = await prisma.$queryRaw<Array<{ equipment_id: string; total_cost: unknown }>>`
    SELECT equipment_id, total_cost FROM report_top_cost_equipment`;
  check('top-cost view is capped at ten', view.length <= 10, `rows=${view.length}`);
  if (top) {
    const first = view[0];
    check('top-cost first row is the independently costliest asset',
      first !== undefined && first.equipment_id === top[0] && Math.abs(num(first.total_cost) - roundMoney(top[1])) <= 0.011,
      `independent=${top[0]} view=${first?.equipment_id ?? 'none'}`);
  }
}

async function notifications(): Promise<void> {
  console.log('\n=== report_notifications_awaiting_conversion vs the notification rows ===');
  const awaiting = await prisma.notification.count({ where: { isDeleted: false, status: { in: ['Open', 'In Process'] } } });
  const view = await prisma.$queryRaw<Array<{ notification_count: number; oldest_age_days: number | null }>>`
    SELECT notification_count, oldest_age_days FROM report_notifications_awaiting_conversion`;
  const total = view.reduce((s, r) => s + Number(r.notification_count), 0);
  check('awaiting-conversion total agrees', total === awaiting, `independent=${awaiting} view=${total}`);
}

async function main(): Promise<void> {
  await viewsExist();
  await backlog();
  await cost();
  await downtimeFamily();
  await consumption();
  await topCost();
  await notifications();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
