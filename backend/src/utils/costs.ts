import { prisma } from './prisma.js';
import { computeWorkOrderCosts, roundMoney } from './costRules.js';
import type { WorkOrderCostInput } from './costRules.js';

export async function recomputeWorkOrderCosts(workOrderId: string) {
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

  await prisma.workOrder.update({
    where: { workOrderId },
    data: {
      plannedCost: roundMoney(costs.plannedCost),
      actualCost: roundMoney(costs.actualCost),
    },
  });

  return { plannedCost: costs.plannedCost, actualCost: costs.actualCost };
}
