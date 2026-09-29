import { loadCostRollup } from '../src/utils/costRollupData.js';
import {
  rollupByEquipment,
  rollupByLocation,
  rollupByPeriod,
  rollupByWorkOrderType,
} from '../src/utils/costRollup.js';
import { computeWorkOrderCosts, roundMoney } from '../src/utils/costRules.js';
import { prisma } from '../src/utils/prisma.js';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const sum = (xs: number[]): number => roundMoney(xs.reduce((a, b) => a + b, 0));

async function main(): Promise<void> {
  const { workOrders, locations } = await loadCostRollup();
  console.log(`live work orders: ${workOrders.length}   locations: ${locations.length}`);

  const grandPlanned = sum(workOrders.map((w) => w.plannedCost));
  const grandActual = sum(workOrders.map((w) => w.actualCost));

  const stored = await prisma.workOrder.aggregate({
    _sum: { plannedCost: true, actualCost: true },
    where: { isDeleted: false },
  });
  console.log(`\nderived from base tables : planned=${grandPlanned}  actual=${grandActual}`);
  console.log(`stored WorkOrder columns : planned=${roundMoney(Number(stored._sum.plannedCost ?? 0))}  actual=${roundMoney(Number(stored._sum.actualCost ?? 0))}`);

  const byType = rollupByWorkOrderType(workOrders);
  const byEquipment = rollupByEquipment(workOrders);
  const byMonth = rollupByPeriod(workOrders, 'month');
  const byQuarter = rollupByPeriod(workOrders, 'quarter');
  const byYear = rollupByPeriod(workOrders, 'year');
  const byLocation = rollupByLocation(workOrders, locations);

  check('workOrderType axis preserves the grand total',
    sum(byType.map((r) => r.plannedCost)) === grandPlanned && sum(byType.map((r) => r.actualCost)) === grandActual,
    JSON.stringify(byType.map((r) => [r.workOrderType, r.plannedCost, r.actualCost])));

  check('equipment axis preserves the grand total',
    sum(byEquipment.map((r) => r.plannedCost)) === grandPlanned && sum(byEquipment.map((r) => r.actualCost)) === grandActual,
    `${byEquipment.length} groups`);

  for (const [label, rows] of [['year', byYear], ['quarter', byQuarter], ['month', byMonth]] as const) {
    check(`${label} axis preserves each side independently`,
      sum(rows.map((r) => r.plannedCost)) === grandPlanned && sum(rows.map((r) => r.actualCost)) === grandActual,
      JSON.stringify(rows.map((r) => [r.period, r.plannedCost, r.actualCost])));
  }

  check('own-totals count every work order exactly once, at its own location',
    sum(byLocation.map((r) => r.ownPlannedCost)) === grandPlanned,
    JSON.stringify(byLocation.filter((r) => r.ownWorkOrderCount > 0).map((r) => [r.path, r.ownPlannedCost, r.ownWorkOrderCount])));

  const parentOfLeaf = byLocation.filter((r) => r.ownWorkOrderCount > 0 && r.workOrderCount > r.ownWorkOrderCount);
  check('a node holding work orders directly can still have contributing descendants',
    parentOfLeaf.every((r) => r.plannedCost === roundMoney(byLocation
      .filter((o) => o.path.startsWith(`${r.path} > `))
      .reduce((s, o) => s + o.ownPlannedCost, r.ownPlannedCost))),
    JSON.stringify(parentOfLeaf.map((r) => [r.path, r.ownPlannedCost, r.plannedCost])));

  const roots = byLocation.filter((r) => r.parentLocationId === null);
  check('each root carries the whole tree total',
    roots.length > 0 && roots.every((r) => r.plannedCost === grandPlanned),
    JSON.stringify(roots.map((r) => [r.path, r.plannedCost, r.workOrderCount])));

  const independent = new Map<string, number>();
  for (const w of workOrders) {
    independent.set(w.functionalLocationId, roundMoney((independent.get(w.functionalLocationId) ?? 0) + w.plannedCost));
  }
  check('ownPlannedCost matches an independent per-location sum',
    [...independent].every(([id, want]) => byLocation.find((r) => r.functionalLocationId === id)?.ownPlannedCost === want),
    JSON.stringify([...independent]));

  const rows = await prisma.workOrder.findMany({
    where: { isDeleted: false },
    select: {
      workOrderId: true,
      plannedCost: true,
      actualCost: true,
      operations: {
        where: { isDeleted: false },
        select: {
          plannedHours: true,
          craft: { select: { hourlyRate: true } },
          laborEntries: { where: { isDeleted: false }, select: { hoursWorked: true } },
        },
      },
      woMaterials: {
        where: { isDeleted: false },
        select: { plannedQuantity: true, actualQuantity: true, unitCost: true },
      },
      externalServices: { where: { isDeleted: false }, select: { cost: true, category: true } },
    },
  });

  const rollupById = new Map(workOrders.map((w) => [w.workOrderId, w]));
  const stale: string[] = [];
  const disagreements: string[] = [];
  for (const row of rows) {
    const expected = computeWorkOrderCosts({
      operations: row.operations,
      woMaterials: row.woMaterials,
      externalServices: row.externalServices,
      laborEntries: row.operations.flatMap((op) =>
        op.laborEntries.map((e) => ({ hoursWorked: e.hoursWorked, operation: op }))
      ),
    } as unknown as Parameters<typeof computeWorkOrderCosts>[0]);
    const got = rollupById.get(row.workOrderId);
    if (!got) { disagreements.push(`${row.workOrderId}: missing from rollup`); continue; }
    if (roundMoney(expected.plannedCost) !== got.plannedCost || roundMoney(expected.actualCost) !== got.actualCost) {
      disagreements.push(`${row.workOrderId}: independent=${roundMoney(expected.plannedCost)}/${roundMoney(expected.actualCost)} rollup=${got.plannedCost}/${got.actualCost}`);
    }
    if (Math.abs(got.plannedCost - Number(row.plannedCost)) > 0.005 || Math.abs(got.actualCost - Number(row.actualCost)) > 0.005) {
      stale.push(`${row.workOrderId} derived=${got.plannedCost} stored=${row.plannedCost}`);
    }
  }

  check('per-work-order figures agree with an independent costRules recomputation',
    disagreements.length === 0, disagreements.slice(0, 3).join('; '));

  console.log(`\nstale stored plannedCost/actualCost rows: ${stale.length} of ${rows.length}`);
  for (const s of stale) console.log(`  ${s}`);

  console.log('\nlocation rollup:');
  for (const r of byLocation) {
    console.log(`  ${'  '.repeat(r.depth - 1)}${r.path}  own=${r.ownPlannedCost}  rolled=${r.plannedCost}  n=${r.workOrderCount}${r.orphan ? '  ORPHAN' : ''}`);
  }

  await prisma.$disconnect();
  console.log(failures === 0 ? '\nALL DIFFERENTIAL CHECKS PASS' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('ERR', error);
  await prisma.$disconnect();
  process.exit(1);
});
