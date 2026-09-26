/**
 * SOW 3.5.2: a work order that covers more than one cost centre is split by
 * percentage allocation.
 *
 * The rule that matters is the total: allocations must add up to exactly 100%.
 * Without that, a work order can be 60% allocated, or 140%, and the cost
 * reports in 3.5.1 quietly stop meaning anything. This module is deliberately
 * pure — it takes numbers and returns decisions — so the allocation rule can be
 * tested without a database, the same treatment transitions.ts gets.
 */

/** Tolerance for float addition. 33.33 + 33.33 + 33.34 must pass. */
const EPSILON = 1e-6;

export interface CostSplitInput {
  costCenterCode: string;
  percentage: number;
}

export type AllocationProblem =
  | { kind: 'empty' }
  | { kind: 'invalidPercentage'; costCenterCode: string; percentage: number }
  | { kind: 'duplicateCostCenter'; costCenterCode: string }
  | { kind: 'totalNot100'; total: number };

export type AllocationCheck =
  | { ok: true; total: number }
  | { ok: false; problem: AllocationProblem };

/**
 * Validates a complete set of cost splits. A work order with no splits is
 * deliberately accepted: splitting is opt-in, and a single-cost-centre work
 * order needs no allocation at all.
 */
export function checkAllocation(splits: CostSplitInput[]): AllocationCheck {
  if (splits.length === 0) {
    return { ok: true, total: 0 };
  }

  const seen = new Set<string>();
  for (const split of splits) {
    if (!Number.isFinite(split.percentage) || split.percentage <= 0 || split.percentage >= 100) {
      return {
        ok: false,
        problem: {
          kind: 'invalidPercentage',
          costCenterCode: split.costCenterCode,
          percentage: split.percentage,
        },
      };
    }
    const key = split.costCenterCode.trim().toUpperCase();
    if (seen.has(key)) {
      return { ok: false, problem: { kind: 'duplicateCostCenter', costCenterCode: split.costCenterCode } };
    }
    seen.add(key);
  }

  const total = splits.reduce((sum, split) => sum + split.percentage, 0);
  if (Math.abs(total - 100) > EPSILON) {
    return { ok: false, problem: { kind: 'totalNot100', total } };
  }

  return { ok: true, total };
}

/** Human-readable reason, used verbatim in the 400 response body. */
export function describeProblem(problem: AllocationProblem): string {
  switch (problem.kind) {
    case 'empty':
      return 'At least one cost split is required';
    case 'invalidPercentage':
      return `Percentage for ${problem.costCenterCode} must be greater than 0 and less than 100`;
    case 'duplicateCostCenter':
      return `Cost center ${problem.costCenterCode} is allocated more than once`;
    case 'totalNot100':
      return `Cost split percentages must total 100 (received ${problem.total})`;
  }
}

/**
 * Applies an allocation to a cost amount, largest-remainder style, so the
 * allocated parts always re-add to the original total. Naive rounding of three
 * thirds of 100.00 loses a cent, and three work orders whose allocations do not
 * re-add to their own cost is a reconciliation failure at month end.
 */
export function allocate(amount: number, splits: CostSplitInput[]): number[] {
  if (splits.length === 0) {
    return [];
  }

  const exact = splits.map((split) => (amount * split.percentage) / 100);
  const floored = exact.map((value) => Math.floor(value * 100) / 100);
  let remainder = Math.round((amount - floored.reduce((a, b) => a + b, 0)) * 100) / 100;

  const result = [...floored];
  // Hand the leftover cents to the largest fractional parts, in order, so the
  // sum is exact and the bias is deterministic rather than arbitrary.
  const order = exact
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[cursor % order.length].index] = Math.round((result[order[cursor % order.length].index] + 0.01) * 100) / 100;
    remainder = Math.round((remainder - 0.01) * 100) / 100;
    cursor += 1;
  }

  return result;
}
