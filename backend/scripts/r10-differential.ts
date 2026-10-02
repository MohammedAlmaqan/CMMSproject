/**
 * R.10 differential - Craft.hourlyRate fan-out.
 *
 * A craft's rate is the basis of SOW 3.5.1 planned labour, so editing it makes
 * every cached work-order cost that carries the craft stale. R.10 makes the
 * craft PUT re-cost those work orders. This script checks three things against
 * the live database, and writes nothing permanently:
 *
 *   1. the invariant the fix protects - every non-deleted work order's stored
 *      plannedCost/actualCost equals the figure derived from its base relations;
 *   2. the reproduction is still on the database - the twelve Family B
 *      soft-deleted work orders that demonstrate the fan-out are left untouched;
 *   3. the mechanism works on live rows, proven inside a transaction that is
 *      deliberately rolled back.
 *
 * It does not import route code; it drives the same `recomputeWorkOrderCosts`
 * helper the route drives and reaches the derived figure through `costRules`.
 *
 *   node_modules/tsx/dist/cli.mjs scripts/r10-differential.ts
 */
import { prisma } from '../src/utils/prisma.js';
import { computeWorkOrderCosts, roundMoney } from '../src/utils/costRules.js';
import type { WorkOrderCostInput } from '../src/utils/costRules.js';
import { recomputeWorkOrderCosts } from '../src/utils/costs.js';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const SENTINEL = 'r10-rollback';

/** The R.9 B reproduction: woNumber, stored plannedCost, derived plannedCost. */
const FAMILY_B: Array<[string, number, number]> = [
  ['WO-000286', 172.5, 135],
  ['WO-000345', 165, 127.5],
  ['WO-000402', 165, 127.5],
  ['WO-000460', 165, 127.5],
  ['WO-000518', 165, 127.5],
  ['WO-000577', 165, 127.5],
  ['WO-000790', 165, 127.5],
  ['WO-000856', 165, 127.5],
  ['WO-000963', 165, 127.5],
  ['WO-001009', 165, 127.5],
  ['WO-001071', 165, 127.5],
  ['WO-001126', 165, 127.5],
];

type ScanRow = {
  workOrderId: string;
  woNumber: string | null;
  status: string;
  isDeleted: boolean;
  storedPlanned: number;
  storedActual: number;
  derivedPlanned: number;
  derivedActual: number;
};

async function scan(): Promise<ScanRow[]> {
  const [workOrders, operations, woMaterials, externalServices, laborEntries] = await Promise.all([
    prisma.workOrder.findMany({
      select: { workOrderId: true, woNumber: true, status: true, isDeleted: true, plannedCost: true, actualCost: true },
    }),
    prisma.workOrderOperation.findMany({ where: { isDeleted: false }, include: { craft: true } }),
    prisma.workOrderMaterial.findMany({ where: { isDeleted: false } }),
    prisma.externalServiceCost.findMany({ where: { isDeleted: false } }),
    prisma.laborEntry.findMany({
      where: { isDeleted: false, operation: { isDeleted: false } },
      include: { operation: { include: { craft: true } } },
    }),
  ]);

  const opsBy = new Map<string, typeof operations>();
  for (const o of operations) opsBy.set(o.workOrderId, [...(opsBy.get(o.workOrderId) ?? []), o]);
  const matBy = new Map<string, typeof woMaterials>();
  for (const m of woMaterials) matBy.set(m.workOrderId, [...(matBy.get(m.workOrderId) ?? []), m]);
  const extBy = new Map<string, typeof externalServices>();
  for (const e of externalServices) extBy.set(e.workOrderId, [...(extBy.get(e.workOrderId) ?? []), e]);
  const labBy = new Map<string, typeof laborEntries>();
  for (const l of laborEntries) labBy.set(l.operation.workOrderId, [...(labBy.get(l.operation.workOrderId) ?? []), l]);

  return workOrders.map((wo) => {
    const input = {
      operations: opsBy.get(wo.workOrderId) ?? [],
      woMaterials: matBy.get(wo.workOrderId) ?? [],
      externalServices: extBy.get(wo.workOrderId) ?? [],
      laborEntries: labBy.get(wo.workOrderId) ?? [],
    } as unknown as WorkOrderCostInput;
    const costs = computeWorkOrderCosts(input);
    return {
      workOrderId: wo.workOrderId,
      woNumber: wo.woNumber,
      status: wo.status,
      isDeleted: wo.isDeleted,
      storedPlanned: roundMoney(Number(wo.plannedCost)),
      storedActual: roundMoney(Number(wo.actualCost)),
      derivedPlanned: roundMoney(costs.plannedCost),
      derivedActual: roundMoney(costs.actualCost),
    };
  });
}

const mismatch = (r: ScanRow): boolean => r.storedPlanned !== r.derivedPlanned || r.storedActual !== r.derivedActual;

/** Section 3: build a fixture, fan the rate out, assert, then roll it all back. */
async function rolledBackFanOut(): Promise<void> {
  const [wc, fl, admin] = await Promise.all([
    prisma.workCenter.findFirst({ where: { isDeleted: false } }),
    prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
    // `username` carries a partial unique index, not a Prisma @unique, so it is
    // not a findUnique selector.
    prisma.user.findFirst({ where: { username: 'admin', isDeleted: false }, select: { userId: true } }),
  ]);
  if (!wc || !fl || !admin) throw new Error('seed prerequisites missing (work centre / location / admin)');

  const actor = { userId: admin.userId, ipAddress: undefined };
  const stamp = Date.now();
  let storedAt40 = -1;
  let storedAt55 = -1;

  try {
    await prisma.$transaction(async (tx) => {
      const craft = await tx.craft.create({
        data: {
          workCenterId: wc.workCenterId,
          craftCode: `CRF-R10-${stamp}`,
          description: 'r10 differential fixture (rolled back)',
          hourlyRate: 40,
          createdBy: admin.userId,
          modifiedBy: admin.userId,
        },
      });
      const wo = await tx.workOrder.create({
        data: {
          woNumber: `WO-R10-${stamp}`,
          type: 'CM',
          priority: 'Medium',
          status: 'Draft',
          description: 'r10 fan-out fixture (rolled back)',
          functionalLocationId: fl.functionalLocationId,
          workCenterId: wc.workCenterId,
          supervisorUserId: admin.userId,
          reportedByUserId: admin.userId,
          createdBy: admin.userId,
          modifiedBy: admin.userId,
        },
      });
      // 2 planned hours: 40 -> 80, then 55 -> 110. The two answers differ, so a
      // stale cache cannot pass by coincidence.
      await tx.workOrderOperation.create({
        data: {
          workOrderId: wo.workOrderId,
          sequenceNumber: 10,
          description: 'operation on the differential craft',
          craftId: craft.craftId,
          plannedHours: 2,
          createdBy: admin.userId,
          modifiedBy: admin.userId,
        },
      });

      const at40 = await recomputeWorkOrderCosts(wo.workOrderId, actor, tx);
      storedAt40 = at40.plannedCost;

      // Exactly what routes/crafts.ts does on a rate move.
      await tx.craft.update({ where: { craftId: craft.craftId }, data: { hourlyRate: 55 } });
      const affected = await tx.workOrderOperation.findMany({
        where: { craftId: craft.craftId, isDeleted: false, workOrder: { isDeleted: false } },
        select: { workOrderId: true },
        distinct: ['workOrderId'],
      });
      for (const { workOrderId } of affected) await recomputeWorkOrderCosts(workOrderId, actor, tx);
      const row = await tx.workOrder.findUniqueOrThrow({ where: { workOrderId: wo.workOrderId }, select: { plannedCost: true } });
      storedAt55 = Number(row.plannedCost);

      throw new Error(SENTINEL);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== SENTINEL) throw e;
  }

  check('recompute at rate 40 stores 80 (2h x 40)', storedAt40 === 80, `stored ${storedAt40}`);
  check('fan-out after a 40 -> 55 edit stores 110 (2h x 55)', storedAt55 === 110, `stored ${storedAt55}`);
  const residue = await prisma.craft.count({ where: { craftCode: { startsWith: 'CRF-R10-' } } });
  check('the fixture was rolled back, leaving no residue', residue === 0, `${residue} craft rows left`);
}

async function main(): Promise<void> {
  const rows = await scan();
  const live = rows.filter((r) => !r.isDeleted);
  const deleted = rows.filter((r) => r.isDeleted);

  console.log('=== 1. live invariant: cache equals derived ===');
  console.log(`  work orders scanned : ${rows.length} (${live.length} live, ${deleted.length} soft-deleted)`);
  const badLive = live.filter(mismatch);
  check('every live work order stores its derived cost', badLive.length === 0, `${badLive.length} mismatched`);
  for (const r of badLive) {
    console.log(`    ${r.woNumber ?? r.workOrderId} status=${r.status} stored p=${r.storedPlanned} a=${r.storedActual} derived p=${r.derivedPlanned} a=${r.derivedActual}`);
  }

  console.log('\n=== 2. reproduction still on the database (Family B, soft-deleted) ===');
  const byNumber = new Map(rows.map((r) => [r.woNumber, r]));
  let present = 0;
  for (const [woNumber, storedPlanned, derivedPlanned] of FAMILY_B) {
    const row = byNumber.get(woNumber);
    if (!row) {
      console.log(`  (absent) ${woNumber}`);
      continue;
    }
    present += 1;
    check(
      `${woNumber} still shows the pre-fix drift`,
      row.storedPlanned === storedPlanned && row.derivedPlanned === derivedPlanned,
      `stored=${row.storedPlanned} derived=${row.derivedPlanned}`,
    );
  }
  console.log(`  ${present}/${FAMILY_B.length} evidence rows present`);
  const deletedMismatch = deleted.filter(mismatch).length;
  console.log(`  soft-deleted rows disagreeing (left as debris by design): ${deletedMismatch}`);

  console.log('\n=== 3. rolled-back live fan-out ===');
  await rolledBackFanOut();

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}  R.10 differential (${failures} failure${failures === 1 ? '' : 's'})`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
