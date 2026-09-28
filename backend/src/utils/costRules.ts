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
  /**
   * SOW 3.3.6 discriminator: 'Service' is a contractor invoice, 'Travel',
   * 'Permit' and 'Other' are the "additional miscellaneous costs" the SOW
   * requires as line items. Null/absent is treated as 'Service' so a row that
   * predates the column still lands in the right bucket.
   */
  category?: string | null;
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
  /** SOW 3.5.1 "planned services": contracted work only. */
  plannedServices: number;
  /** SOW 3.5.1 "other planned": travel, permits, and anything else misc. */
  otherCosts: number;
  /** plannedServices + otherCosts. Every cost line, for callers that just want the total. */
  serviceCost: number;
  plannedCost: number;
  actualCost: number;
}

/**
 * A numeric input the cost arithmetic accepts. The interfaces above type the
 * money fields as `number`, but the caller hands over Prisma rows cast through
 * `as unknown as WorkOrderCostInput` (by design: this module stays Prisma-free),
 * so the money columns arrive as `Decimal` instances. Coercing both keeps the
 * arithmetic honest without importing Prisma here.
 */
type NumericInput = number | { toNumber: () => number } | null | undefined;

const num = (v: NumericInput): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v !== null && v !== undefined) {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/** The SOW's misc-cost categories. Everything else is a contracted service. */
const isMiscCategory = (category: string | null | undefined): boolean =>
  category === 'Travel' || category === 'Permit' || category === 'Other';

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
  // SOW 3.3.6: the two buckets are a partition of the same lines, so splitting
  // them gives every term of the SOW 3.5.1 formula a distinct source without
  // moving a single total.
  const plannedServices = input.externalServices.reduce(
    (sum, s) => (isMiscCategory(s.category) ? sum : sum + num(s.cost)),
    0
  );
  const otherCosts = input.externalServices.reduce(
    (sum, s) => (isMiscCategory(s.category) ? sum + num(s.cost) : sum),
    0
  );
  const serviceCost = plannedServices + otherCosts;

  return {
    plannedLabor,
    actualLabor,
    plannedMaterials,
    actualMaterials,
    plannedServices,
    otherCosts,
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
