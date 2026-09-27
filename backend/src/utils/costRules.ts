/**
 * SOW 3.5.1 planned and actual cost.
 *
 *   Planned Cost = planned labour hours x craft rate
 *                + planned materials x standard cost
 *                + planned services
 *                + other planned
 *
 * D-3, confirmed by the SOW owner on 2026-09-26: `plannedHours` on an operation
 * is the operation's **total** labour, not a per-technician figure. The
 * `numberOfTechnicians` multiplier that used to sit in this calculation has no
 * basis in the SOW formula and inflated every planned cost by the crew size.
 * The field itself stays on the operation — it is real data the SOW asks for —
 * it simply no longer scales money.
 *
 * The arithmetic lives here, free of Prisma, so it can be tested as arithmetic.
 * `costs.ts` fetches the rows and persists what this returns.
 */

/** A craft's rate is nullable in the schema, and a missing rate must not throw. */
export interface CostCraft {
  hourlyRate: number | null;
}

export interface CostOperation {
  plannedHours: number | null;
  numberOfTechnicians: number | null;
  craft: CostCraft;
}

export interface CostMaterial {
  plannedQuantity: number | null;
  actualQuantity: number | null;
  unitCost: number | null;
}

export interface CostService {
  cost: number | null;
}

export interface CostLaborEntry {
  hoursWorked: number | null;
  operation: { craft: CostCraft };
}

export interface WorkOrderCostInput {
  operations: CostOperation[];
  woMaterials: CostMaterial[];
  externalServices: CostService[];
  laborEntries: CostLaborEntry[];
}

export interface WorkOrderCostBreakdown {
  plannedLabor: number;
  actualLabor: number;
  plannedMaterials: number;
  actualMaterials: number;
  serviceCost: number;
  plannedCost: number;
  actualCost: number;
}

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function computeWorkOrderCosts(input: WorkOrderCostInput): WorkOrderCostBreakdown {
  // D-3: no technician multiplier. plannedHours is the operation's total labour.
  const plannedLabor = input.operations.reduce(
    (sum, op) => sum + num(op.plannedHours) * num(op.craft.hourlyRate),
    0
  );

  // Actual labour comes from booked entries, which are already per-technician
  // hours, so it was never multiplied and must stay that way.
  const actualLabor = input.laborEntries.reduce(
    (sum, entry) => sum + num(entry.hoursWorked) * num(entry.operation.craft.hourlyRate),
    0
  );

  const plannedMaterials = input.woMaterials.reduce(
    (sum, m) => sum + num(m.plannedQuantity) * num(m.unitCost),
    0
  );
  const actualMaterials = input.woMaterials.reduce(
    (sum, m) => sum + num(m.actualQuantity) * num(m.unitCost),
    0
  );
  const serviceCost = input.externalServices.reduce((sum, s) => sum + num(s.cost), 0);

  return {
    plannedLabor,
    actualLabor,
    plannedMaterials,
    actualMaterials,
    serviceCost,
    plannedCost: plannedLabor + plannedMaterials + serviceCost,
    actualCost: actualLabor + actualMaterials + serviceCost,
  };
}

/**
 * Money is stored as two decimal places. Rounding happens once, at the persist
 * boundary, so the figures reported back to a caller and the figures written to
 * the column cannot drift apart.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
