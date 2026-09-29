import { prisma } from './prisma.js';
import { computeWorkOrderCosts, roundMoney } from './costRules.js';
import type { RollupLocation, RollupWorkOrder } from './costRollup.js';

export interface LoadCostRollupInput {
  from?: Date;
  to?: Date;
  functionalLocationId?: string;
  includeDescendants?: boolean;
  equipmentId?: string;
  workCenterId?: string;
}

export interface LoadedCostRollup {
  workOrders: RollupWorkOrder[];
  locations: RollupLocation[];
}

function descendantLocationIds(rootId: string, locations: RollupLocation[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const location of locations) {
    if (location.parentLocationId === null) continue;
    const siblings = children.get(location.parentLocationId) ?? [];
    siblings.push(location.functionalLocationId);
    children.set(location.parentLocationId, siblings);
  }
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of children.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return out;
}

export async function loadCostRollup(input: LoadCostRollupInput = {}): Promise<LoadedCostRollup> {
  const locations: RollupLocation[] = (
    await prisma.functionalLocation.findMany({
      where: { isDeleted: false },
      select: {
        functionalLocationId: true,
        locationCode: true,
        description: true,
        parentLocationId: true,
      },
      orderBy: { locationCode: 'asc' },
    })
  ).map((l) => ({
    functionalLocationId: l.functionalLocationId,
    locationCode: l.locationCode,
    description: l.description,
    parentLocationId: l.parentLocationId,
  }));

  const where: Record<string, unknown> = { isDeleted: false };
  if (input.from !== undefined || input.to !== undefined) {
    where.OR = [
      { createdDate: { ...(input.from !== undefined && { gte: input.from }), ...(input.to !== undefined && { lte: input.to }) } },
      { actualStart: { ...(input.from !== undefined && { gte: input.from }), ...(input.to !== undefined && { lte: input.to }) } },
    ];
  }
  if (input.equipmentId !== undefined) where.equipmentId = input.equipmentId;
  if (input.workCenterId !== undefined) where.workCenterId = input.workCenterId;
  if (input.functionalLocationId !== undefined) {
    if (input.includeDescendants === false) {
      where.functionalLocationId = input.functionalLocationId;
    } else {
      where.functionalLocationId = { in: [...descendantLocationIds(input.functionalLocationId, locations)] };
    }
  }

  const rows = await prisma.workOrder.findMany({
    where,
    select: {
      workOrderId: true,
      functionalLocationId: true,
      equipmentId: true,
      type: true,
      workCenterId: true,
      costCenterCode: true,
      createdDate: true,
      plannedStart: true,
      actualStart: true,
      equipment: { select: { equipmentCode: true } },
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

  const workOrders: RollupWorkOrder[] = rows.map((wo) => {
    const costs = computeWorkOrderCosts({
      operations: wo.operations,
      woMaterials: wo.woMaterials,
      externalServices: wo.externalServices,
      laborEntries: wo.operations.flatMap((op) =>
        op.laborEntries.map((entry) => ({ hoursWorked: entry.hoursWorked, operation: op }))
      ),
    } as unknown as Parameters<typeof computeWorkOrderCosts>[0]);
    return {
      workOrderId: wo.workOrderId,
      functionalLocationId: wo.functionalLocationId,
      equipmentId: wo.equipmentId,
      equipmentCode: wo.equipment?.equipmentCode ?? null,
      type: wo.type,
      workCenterId: wo.workCenterId,
      costCenterCode: wo.costCenterCode,
      plannedPeriodDate: wo.plannedStart ?? wo.createdDate,
      actualPeriodDate: wo.actualStart ?? wo.createdDate,
      plannedCost: roundMoney(costs.plannedCost),
      actualCost: roundMoney(costs.actualCost),
    };
  });

  return { workOrders, locations };
}
