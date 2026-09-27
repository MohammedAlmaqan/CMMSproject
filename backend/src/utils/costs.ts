import { prisma } from './prisma.js';
import { computeWorkOrderCosts, roundMoney } from './costRules.js';
import type { WorkOrderCostInput } from './costRules.js';
import { logAuditFieldChange } from '../middleware/audit.js';

/** Who caused a recompute. Required, so a cost change can never land in the
 *  database without someone attached to it. */
export interface CostActor {
  userId: string;
  ipAddress: string | undefined;
}

export async function recomputeWorkOrderCosts(workOrderId: string, actor: CostActor) {
  // Read the stored figures first: a recompute that lands on the same numbers
  // is not a change, and writing an audit row for it would pad the trail with
  // events an auditor has to read past to find the real ones.
  const prior = await prisma.workOrder.findUnique({
    where: { workOrderId },
    select: { plannedCost: true, actualCost: true },
  });

  const [operations, woMaterials, externalServices, laborEntries] = await Promise.all([
    prisma.workOrderOperation.findMany({
      where: { workOrderId },
      include: { craft: true },
    }),
    prisma.workOrderMaterial.findMany({ where: { workOrderId } }),
    prisma.externalServiceCost.findMany({ where: { workOrderId } }),
    prisma.laborEntry.findMany({
      where: { isDeleted: false, operation: { workOrderId } },
      include: { operation: { include: { craft: true } } },
    }),
  ]);

  // The arithmetic is in utils/costRules.ts so it can be tested as arithmetic.
  // Prisma rows satisfy the input shape structurally: an absent relation or a
  // null numeric column arrives here as null, which the pure function treats
  // as zero rather than propagating NaN into a stored cost.
  const input = {
    operations,
    woMaterials,
    externalServices,
    laborEntries,
  } as unknown as WorkOrderCostInput;

  const costs = computeWorkOrderCosts(input);

  const plannedCost = roundMoney(costs.plannedCost);
  const actualCost = roundMoney(costs.actualCost);

  await prisma.workOrder.update({
    where: { workOrderId },
    data: { plannedCost, actualCost },
  });

  // One row per figure that actually moved, naming the field so the trail
  // says which number changed rather than only that "costs" changed.
  // String() keeps this correct if D-17 later moves the columns to Decimal.
  if (prior && prior.plannedCost !== plannedCost) {
    await logAuditFieldChange({
      table: 'WorkOrder',
      recordId: workOrderId,
      action: 'Update',
      field: 'plannedCost',
      oldValue: String(prior.plannedCost),
      newValue: String(plannedCost),
      userId: actor.userId,
      ipAddress: actor.ipAddress,
    });
  }
  if (prior && prior.actualCost !== actualCost) {
    await logAuditFieldChange({
      table: 'WorkOrder',
      recordId: workOrderId,
      action: 'Update',
      field: 'actualCost',
      oldValue: String(prior.actualCost),
      newValue: String(actualCost),
      userId: actor.userId,
      ipAddress: actor.ipAddress,
    });
  }

  return { plannedCost: costs.plannedCost, actualCost: costs.actualCost };
}
