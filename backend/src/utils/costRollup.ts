import { roundMoney } from './costRules.js';

export type RollupAxis = 'location' | 'equipment' | 'workOrderType' | 'period';
export type RollupPeriodUnit = 'year' | 'quarter' | 'month';

export interface RollupLocation {
  functionalLocationId: string;
  locationCode: string;
  description: string;
  parentLocationId: string | null;
}

export interface RollupWorkOrder {
  workOrderId: string;
  functionalLocationId: string;
  equipmentId: string | null;
  equipmentCode: string | null;
  type: string;
  workCenterId: string;
  costCenterCode: string;
  plannedPeriodDate: Date;
  actualPeriodDate: Date;
  plannedCost: number;
  actualCost: number;
}

export interface CostTotals {
  plannedCost: number;
  actualCost: number;
  workOrderCount: number;
}

export interface PeriodKey {
  periodUnit: RollupPeriodUnit;
  year: number;
  quarter: number | null;
  month: number | null;
}

export interface PeriodRollup extends CostTotals {
  period: string;
  periodUnit: RollupPeriodUnit;
  year: number;
  quarter: number | null;
  month: number | null;
}

export interface LocationRollup extends CostTotals {
  functionalLocationId: string;
  locationCode: string;
  description: string;
  parentLocationId: string | null;
  depth: number;
  path: string;
  ownPlannedCost: number;
  ownActualCost: number;
  ownWorkOrderCount: number;
  orphan: boolean;
}

export interface EquipmentRollup extends CostTotals {
  equipmentId: string;
  equipmentCode: string;
}

export interface WorkOrderTypeRollup extends CostTotals {
  workOrderType: string;
}

const emptyTotals = (): CostTotals => ({ plannedCost: 0, actualCost: 0, workOrderCount: 0 });

const toMoney = (v: number): number => (Number.isFinite(v) ? v : 0);

export function periodKeyFor(date: Date, periodUnit: RollupPeriodUnit): PeriodKey {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return {
    periodUnit,
    year,
    quarter: periodUnit === 'month' ? null : Math.ceil(month / 3),
    month: periodUnit === 'month' ? month : null,
  };
}

export function formatPeriodKey(key: PeriodKey): string {
  const year = String(key.year).padStart(4, '0');
  if (key.periodUnit === 'month') return `${year}-${String(key.month).padStart(2, '0')}`;
  if (key.periodUnit === 'quarter') return `${year}-Q${key.quarter}`;
  return year;
}

export function rollupByWorkOrderType(workOrders: RollupWorkOrder[]): WorkOrderTypeRollup[] {
  const buckets = new Map<string, CostTotals>();
  for (const wo of workOrders) {
    const key = wo.type;
    const bucket = buckets.get(key) ?? emptyTotals();
    bucket.plannedCost += toMoney(wo.plannedCost);
    bucket.actualCost += toMoney(wo.actualCost);
    bucket.workOrderCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([workOrderType, t]) => ({
      workOrderType,
      plannedCost: roundMoney(t.plannedCost),
      actualCost: roundMoney(t.actualCost),
      workOrderCount: t.workOrderCount,
    }))
    .sort((a, b) => a.workOrderType.localeCompare(b.workOrderType));
}

export function rollupByEquipment(workOrders: RollupWorkOrder[]): EquipmentRollup[] {
  const buckets = new Map<string, CostTotals & { equipmentCode: string }>();
  for (const wo of workOrders) {
    const key = wo.equipmentId ?? 'NO_EQUIPMENT';
    const bucket = buckets.get(key) ?? { ...emptyTotals(), equipmentCode: wo.equipmentCode ?? '' };
    bucket.plannedCost += toMoney(wo.plannedCost);
    bucket.actualCost += toMoney(wo.actualCost);
    bucket.workOrderCount += 1;
    if (!bucket.equipmentCode && wo.equipmentCode) bucket.equipmentCode = wo.equipmentCode;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([equipmentId, t]) => ({
      equipmentId,
      equipmentCode: t.equipmentCode,
      plannedCost: roundMoney(t.plannedCost),
      actualCost: roundMoney(t.actualCost),
      workOrderCount: t.workOrderCount,
    }))
    .sort((a, b) => b.plannedCost + b.actualCost - (a.plannedCost + a.actualCost));
}

export function rollupByPeriod(workOrders: RollupWorkOrder[], periodUnit: RollupPeriodUnit): PeriodRollup[] {
  const buckets = new Map<string, PeriodRollup>();
  const touch = (key: PeriodKey): PeriodRollup => {
    const period = formatPeriodKey(key);
    const bucket = buckets.get(period) ?? {
      period,
      periodUnit,
      year: key.year,
      quarter: key.quarter,
      month: key.month,
      ...emptyTotals(),
    };
    buckets.set(period, bucket);
    return bucket;
  };
  for (const wo of workOrders) {
    if (toMoney(wo.plannedCost) !== 0) {
      touch(periodKeyFor(wo.plannedPeriodDate, periodUnit)).plannedCost += toMoney(wo.plannedCost);
    }
    if (toMoney(wo.actualCost) !== 0) {
      touch(periodKeyFor(wo.actualPeriodDate, periodUnit)).actualCost += toMoney(wo.actualCost);
    }
  }
  for (const bucket of buckets.values()) {
    bucket.plannedCost = roundMoney(bucket.plannedCost);
    bucket.actualCost = roundMoney(bucket.actualCost);
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function ancestorChain(
  functionalLocationId: string,
  byId: Map<string, RollupLocation>
): { chain: RollupLocation[]; missingId: string | null } {
  const chain: RollupLocation[] = [];
  const visited = new Set<string>();
  let cursor: string | null = functionalLocationId;
  while (cursor !== null) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const node: RollupLocation | undefined = byId.get(cursor);
    if (!node) return { chain, missingId: cursor };
    chain.push(node);
    cursor = node.parentLocationId;
  }
  return { chain, missingId: null };
}

export function rollupByLocation(
  workOrders: RollupWorkOrder[],
  locations: RollupLocation[]
): LocationRollup[] {
  const byId = new Map(locations.map((l) => [l.functionalLocationId, l]));
  const subtree = new Map<string, CostTotals>();
  const own = new Map<string, CostTotals>();

  const accumulate = (key: string, w: RollupWorkOrder): void => {
    const bucket = subtree.get(key) ?? emptyTotals();
    bucket.plannedCost += toMoney(w.plannedCost);
    bucket.actualCost += toMoney(w.actualCost);
    bucket.workOrderCount += 1;
    subtree.set(key, bucket);
  };

  for (const wo of workOrders) {
    const { chain, missingId } = ancestorChain(wo.functionalLocationId, byId);
    for (const node of chain) accumulate(node.functionalLocationId, wo);
    if (missingId !== null) accumulate(missingId, wo);

    const direct = own.get(wo.functionalLocationId) ?? emptyTotals();
    direct.plannedCost += toMoney(wo.plannedCost);
    direct.actualCost += toMoney(wo.actualCost);
    direct.workOrderCount += 1;
    own.set(wo.functionalLocationId, direct);
  }

  for (const location of locations) {
    if (!subtree.has(location.functionalLocationId)) {
      subtree.set(location.functionalLocationId, emptyTotals());
    }
  }

  const rolled = new Map<string, LocationRollup>();
  for (const [id, totals] of subtree) {
    const node = byId.get(id);
    rolled.set(id, {
      functionalLocationId: id,
      locationCode: node?.locationCode ?? id,
      description: node?.description ?? 'Unresolved functional location',
      parentLocationId: node?.parentLocationId ?? null,
      depth: 0,
      path: '',
      ownPlannedCost: 0,
      ownActualCost: 0,
      ownWorkOrderCount: 0,
      plannedCost: roundMoney(totals.plannedCost),
      actualCost: roundMoney(totals.actualCost),
      workOrderCount: totals.workOrderCount,
      orphan: !node,
    });
  }

  const resolved = new Set<string>();
  const resolve = (id: string, seen: Set<string>): LocationRollup => {
    const entry = rolled.get(id);
    if (!entry) throw new Error(`unreachable rollup location ${id}`);
    if (resolved.has(id)) return entry;
    if (seen.has(id)) {
      entry.path = entry.locationCode;
      entry.depth = 1;
      resolved.add(id);
      return entry;
    }
    seen.add(id);
    const parentId = entry.parentLocationId;
    if (parentId !== null && rolled.has(parentId)) {
      const parent = resolve(parentId, seen);
      entry.depth = parent.depth + 1;
      entry.path = `${parent.path} > ${entry.locationCode}`;
    } else {
      entry.depth = 1;
      entry.path = entry.locationCode;
    }
    resolved.add(id);
    return entry;
  };

  for (const [id, totals] of own) {
    const entry = rolled.get(id);
    if (!entry) continue;
    entry.ownPlannedCost = roundMoney(totals.plannedCost);
    entry.ownActualCost = roundMoney(totals.actualCost);
    entry.ownWorkOrderCount = totals.workOrderCount;
  }

  for (const id of rolled.keys()) resolve(id, new Set());

  return [...rolled.values()].sort((a, b) => b.depth - a.depth || a.path.localeCompare(b.path));
}

export function rollupCosts(workOrders: RollupWorkOrder[], axis: RollupAxis, locations: RollupLocation[] = []): unknown {
  switch (axis) {
    case 'location':
      return rollupByLocation(workOrders, locations);
    case 'equipment':
      return rollupByEquipment(workOrders);
    case 'workOrderType':
      return rollupByWorkOrderType(workOrders);
    case 'period':
      return rollupByPeriod(workOrders, 'month');
  }
}
