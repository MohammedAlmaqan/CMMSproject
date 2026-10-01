/**
 * R.9 B - one-shot backfill of stale WorkOrder.plannedCost / actualCost.
 *
 * Scans every work order whose stored figures disagree with the figures derived
 * from its base relations, reports each row it would change, and (with --apply)
 * rewrites them through the same `recomputeWorkOrderCosts` the product uses, so
 * the backfill cannot diverge from the write path it is repairing.
 *
 * Dry run is the default. `--apply` is the only thing that writes.
 *
 *   node_modules/tsx/dist/cli.mjs scripts/r9b-cost-backfill.ts            # report
 *   node_modules/tsx/dist/cli.mjs scripts/r9b-cost-backfill.ts --apply    # repair
 */
import { prisma } from '../src/utils/prisma.js';
import { computeWorkOrderCosts, roundMoney } from '../src/utils/costRules.js';
import type { WorkOrderCostInput } from '../src/utils/costRules.js';
import { recomputeWorkOrderCosts } from '../src/utils/costs.js';

const APPLY = process.argv.includes('--apply');

/** Administrator account, used as the audit actor for the repair.
 *  `AuditLogEntry.userId` is a real foreign key to User, so there is no
 *  synthetic actor to invent: a data repair made on the Client's behalf is
 *  attributed to the administrator account that performs it. */
const ADMIN_USERNAME = 'admin';

type Row = Awaited<ReturnType<typeof scan>>[number];

async function scan() {
  const [workOrders, operations, woMaterials, externalServices, laborEntries] = await Promise.all([
    prisma.workOrder.findMany({
      select: {
        workOrderId: true, woNumber: true, description: true, status: true, type: true,
        isDeleted: true, createdBy: true, sourcePlanId: true, plannedCost: true, actualCost: true,
      },
    }),
    prisma.workOrderOperation.findMany({
      where: { isDeleted: false },
      include: { craft: true },
    }),
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
      ...wo,
      derivedPlanned: roundMoney(costs.plannedCost),
      derivedActual: roundMoney(costs.actualCost),
      storedPlanned: roundMoney(Number(wo.plannedCost)),
      storedActual: roundMoney(Number(wo.actualCost)),
      childCounts: {
        operations: (opsBy.get(wo.workOrderId) ?? []).length,
        materials: (matBy.get(wo.workOrderId) ?? []).length,
        externalServices: (extBy.get(wo.workOrderId) ?? []).length,
        laborEntries: (labBy.get(wo.workOrderId) ?? []).length,
      },
    };
  });
}

/**
 * Provenance, on the same rule R.9 D used: a scheduler-generated work order has
 * `createdBy = 'scheduler'` and a `sourcePlanId`. Anything without both was not
 * made by the scheduler, so a mismatch on it is test debris, not a Client row.
 */
function provenance(wo: Row): 'PRODUCTION (scheduler)' | 'NON-SCHEDULER' {
  return wo.createdBy === 'scheduler' && wo.sourcePlanId ? 'PRODUCTION (scheduler)' : 'NON-SCHEDULER';
}

async function main(): Promise<void> {
  const rows = await scan();
  const live = rows.filter((r) => !r.isDeleted);
  const deleted = rows.filter((r) => r.isDeleted);

  const mismatch = (r: Row) => r.storedPlanned !== r.derivedPlanned || r.storedActual !== r.derivedActual;

  console.log(`MODE: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}\n`);
  console.log('=== SCAN ===');
  console.log(`  work orders scanned        : ${rows.length}`);
  console.log(`    not soft-deleted         : ${live.length}`);
  console.log(`    soft-deleted             : ${deleted.length}`);
  console.log(`  disagreeing with derived   : ${rows.filter(mismatch).length}`);
  console.log(`    of which not deleted     : ${live.filter(mismatch).length}`);
  console.log(`    of which soft-deleted    : ${deleted.filter(mismatch).length}`);

  const byProv = new Map<string, number>();
  for (const r of rows.filter(mismatch)) {
    const k = `${provenance(r)} / ${r.isDeleted ? 'soft-deleted' : 'live'}`;
    byProv.set(k, (byProv.get(k) ?? 0) + 1);
  }
  console.log('\n=== MISMATCHES BY PROVENANCE ===');
  if (byProv.size === 0) console.log('  (none)');
  for (const [k, n] of [...byProv.entries()].sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const bad = rows.filter(mismatch);
  console.log('\n=== EVERY ROW THAT DISAGREES ===');
  if (bad.length === 0) {
    console.log('  (none) - the stored columns already match the derived figures everywhere');
  }
  for (const r of bad) {
    const c = r.childCounts;
    console.log(
      `  ${r.workOrderId}  ${r.woNumber ?? '(no number)'}  status=${r.status} type=${r.type}\n` +
      `     provenance: ${provenance(r)}  sourcePlanId=${r.sourcePlanId ?? 'null'}  createdBy=${r.createdBy}  isDeleted=${r.isDeleted}\n` +
      `     description: "${r.description}"\n` +
      `     stored   planned=${r.storedPlanned}  actual=${r.storedActual}\n` +
      `     derived  planned=${r.derivedPlanned}  actual=${r.derivedActual}\n` +
      `     children: operations=${c.operations} materials=${c.materials} externalServices=${c.externalServices} laborEntries=${c.laborEntries}`
    );
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write these rows.');
    return;
  }

  const admin = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME }, select: { userId: true } });
  if (!admin) throw new Error(`no ${ADMIN_USERNAME} user to attribute the repair to`);
  console.log(`\n=== APPLY ===\naudit actor: ${ADMIN_USERNAME} (${admin.userId})`);

  let updated = 0;
  const failures: string[] = [];
  for (const r of bad) {
    try {
      await recomputeWorkOrderCosts(r.workOrderId, { userId: admin.userId, ipAddress: undefined });
      updated++;
    } catch (e) {
      // One row that cannot be repaired must not abandon the rest, and must not
      // be reported as if it had been fixed.
      failures.push(`${r.workOrderId} (${r.woNumber ?? 'no number'}): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }

  console.log(`  attempted: ${bad.length}`);
  console.log(`  updated  : ${updated}`);
  console.log(`  failed   : ${failures.length}`);
  for (const f of failures) console.log(`    FAILED ${f}`);

  console.log('\n=== POST-APPLY RE-SCAN ===');
  const after = await scan();
  const stillBad = after.filter(mismatch);
  console.log(`  work orders scanned      : ${after.length}`);
  console.log(`  still disagreeing       : ${stillBad.length}`);
  for (const r of stillBad) {
    console.log(`    ${r.workOrderId}  stored p=${r.storedPlanned} a=${r.storedActual}  derived p=${r.derivedPlanned} a=${r.derivedActual}`);
  }

  if (failures.length > 0 || stillBad.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
