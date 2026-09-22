import { prisma } from './prisma.js';

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

  // Pre-computed only to keep object shape symmetric; actual labor comes from entries
  const plannedLabor = operations.reduce(
    (sum, op) => sum + (op.plannedHours || 0) * Math.max(1, op.numberOfTechnicians || 1) * (op.craft.hourlyRate || 0),
    0
  );
  const actualLabor = laborEntries.reduce(
    (sum, entry) => sum + (entry.hoursWorked || 0) * (entry.operation.craft.hourlyRate || 0),
    0
  );
  const plannedMaterials = woMaterials.reduce(
    (sum, m) => sum + (m.plannedQuantity || 0) * (m.unitCost || 0),
    0
  );
  const actualMaterials = woMaterials.reduce(
    (sum, m) => sum + (m.actualQuantity || 0) * (m.unitCost || 0),
    0
  );
  const serviceCost = externalServices.reduce((sum, s) => sum + (s.cost || 0), 0);

  const plannedCost = plannedLabor + plannedMaterials + serviceCost;
  const actualCost = actualLabor + actualMaterials + serviceCost;

  await prisma.workOrder.update({
    where: { workOrderId },
    data: {
      plannedCost: Math.round(plannedCost * 100) / 100,
      actualCost: Math.round(actualCost * 100) / 100,
    },
  });

  return { plannedCost, actualCost };
}