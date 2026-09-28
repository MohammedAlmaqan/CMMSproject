import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkAllocation, describeProblem, allocate } from '../../src/utils/costSplits.js';
import { costSplitReplaceSchema, costSplitItemSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(
  resolve(here, '../../src/routes/workOrderCostSplits.ts'), 'utf8');

// SOW 3.5.2: a work order covering several cost centres is split by percentage.
// The dangerous failure is an allocation that does not total 100% — the 3.5.1
// cost figures then reconcile to nothing and nobody notices at the time. These
// cases pin that rule as pure logic, so it is tested without a database.

describe('allocation totals, SOW 3.5.2', () => {
  it('accepts a set that totals 100', () => {
    const r = checkAllocation([
      { costCenterCode: 'CC-100', percentage: 60 },
      { costCenterCode: 'CC-200', percentage: 40 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(100);
  });

  it('accepts three awkward shares that only sum to 100 in theory', () => {
    // 33.33 + 33.33 + 33.34 is the classic float case. A naive === 100
    // comparison fails here and would reject a legitimate allocation.
    const r = checkAllocation([
      { costCenterCode: 'A', percentage: 33.33 },
      { costCenterCode: 'B', percentage: 33.33 },
      { costCenterCode: 'C', percentage: 33.34 },
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects an allocation that falls short of 100', () => {
    const r = checkAllocation([{ costCenterCode: 'CC-100', percentage: 60 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.kind).toBe('totalNot100');
      expect(describeProblem(r.problem)).toContain('60');
    }
  });

  it('rejects an allocation that exceeds 100', () => {
    const r = checkAllocation([
      { costCenterCode: 'A', percentage: 60 },
      { costCenterCode: 'B', percentage: 60 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.kind).toBe('totalNot100');
  });

  it('treats no splits as valid, because splitting is opt-in', () => {
    // A work order charged to one cost centre needs no allocation at all, and
    // rejecting the empty set would make the unallocated state unreachable.
    const r = checkAllocation([]);
    expect(r.ok).toBe(true);
  });

  it('refuses two lines for the same cost centre', () => {
    // Duplicate lines are how a 100% total hides a genuine over-allocation.
    const r = checkAllocation([
      { costCenterCode: 'CC-100', percentage: 50 },
      { costCenterCode: 'cc-100', percentage: 50 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.kind).toBe('duplicateCostCenter');
  });

  it('rejects a zero, negative, or whole-of-it share', () => {
    for (const percentage of [0, -10, 100, 140, Number.NaN]) {
      const r = checkAllocation([{ costCenterCode: 'A', percentage }]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem.kind).toBe('invalidPercentage');
    }
  });

  it('checks the total only after every line is well formed', () => {
    // Order matters for the message the planner sees: a 200% line is a
    // per-line mistake and should not be reported as a totals problem.
    const r = checkAllocation([
      { costCenterCode: 'A', percentage: 150 },
      { costCenterCode: 'B', percentage: 10 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.kind).toBe('invalidPercentage');
  });

  it('produces a usable message for every problem kind', () => {
    const problems = [
      { kind: 'empty' as const },
      { kind: 'invalidPercentage' as const, costCenterCode: 'A', percentage: 0 },
      { kind: 'duplicateCostCenter' as const, costCenterCode: 'A' },
      { kind: 'totalNot100' as const, total: 60 },
    ];
    for (const problem of problems) {
      expect(describeProblem(problem).length).toBeGreaterThan(0);
    }
  });
});

describe('allocated amounts always re-add to the cost', () => {
  it('splits a clean two-way allocation exactly', () => {
    const parts = allocate(1000, [
      { costCenterCode: 'A', percentage: 60 },
      { costCenterCode: 'B', percentage: 40 },
    ]);
    expect(parts).toEqual([600, 400]);
  });

  it('gives the leftover cents to the largest share so the total is exact', () => {
    // 100.00 across three ways at 33.33/33.33/33.34 loses a cent if each line
    // is rounded independently. At month end the parts must re-add.
    const parts = allocate(100, [
      { costCenterCode: 'A', percentage: 33.33 },
      { costCenterCode: 'B', percentage: 33.33 },
      { costCenterCode: 'C', percentage: 33.34 },
    ]);
    const sum = parts.reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('keeps the sum exact for an awkward amount and ratio', () => {
    const splits = [
      { costCenterCode: 'A', percentage: 33.33 },
      { costCenterCode: 'B', percentage: 33.33 },
      { costCenterCode: 'C', percentage: 33.34 },
    ];
    for (const amount of [0.01, 1, 7.77, 99.99, 1234.56, 100000]) {
      const parts = allocate(amount, splits);
      const sum = parts.reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100) / 100).toBe(Math.round(amount * 100) / 100);
    }
  });

  it('returns nothing to allocate for an unallocated work order', () => {
    expect(allocate(500, [])).toEqual([]);
  });

  it('allocates a zero cost without inventing money', () => {
    expect(allocate(0, [{ costCenterCode: 'A', percentage: 100 }])).toEqual([0]);
  });
});

describe('cost split write path, SOW 3.5.2', () => {
  it('validates the whole set, not one line at a time', () => {
    // A per-line rule would make a two-way split impossible to build, because
    // the first line is always incomplete. The replace endpoint is the design
    // consequence of the invariant being a property of the set.
    const r = costSplitReplaceSchema.safeParse({
      workOrderId: 'wo-1',
      splits: [{ costCenterCode: 'A', percentage: 60 }],
    });
    expect(r.success).toBe(true);
  });

  it('requires a work order and a splits array', () => {
    expect(costSplitReplaceSchema.safeParse({ splits: [] }).success).toBe(false);
    expect(costSplitReplaceSchema.safeParse({ workOrderId: 'wo-1' }).success).toBe(false);
  });

  it('permits an empty array, to clear an allocation', () => {
    expect(costSplitReplaceSchema.safeParse({ workOrderId: 'wo-1', splits: [] }).success).toBe(true);
  });

  it('still refuses a single line that claims the whole work order', () => {
    expect(costSplitItemSchema.safeParse({ costCenterCode: 'A', percentage: 100 }).success).toBe(false);
  });

  // The read/set/clear HTTP behaviours, the transaction, the re-validation on
  // partial delete, the allocatedActualCost read-back, its reconciliation
  // invariant, and both audit rows are now exercised against the live app by
  // backend/tests/routes/workOrderCostSplits.test.ts — static source-reading
  // is superseded here. The one fact only the source can prove is the absence
  // of a per-line append, so that guard is kept.
  it('does not offer a per-line append, which could not hold the invariant', () => {
    expect(route).not.toMatch(/router\.post\('\/'/);
  });
});
