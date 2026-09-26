import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { requiresAtLeastOneOperation, missingOperationMessage } from '../../src/utils/workOrderRules.js';

const here = dirname(fileURLToPath(import.meta.url));
const workOrderRoute = readFileSync(
  resolve(here, '../../src/routes/workOrders.ts'), 'utf8');

// SOW 3.3.3: every work order must contain at least one operation. The matrix
// recorded this as Not Met because a work order could be created with zero
// operations and nothing ever required one.
//
// The rule is expressed as pure functions so the scope of the guard can be
// stated exactly and tested. The scope decisions are the substance here: where
// the rule applies is easy to get subtly wrong, and a guard that is too broad
// blocks legitimate work just as surely as one that is too narrow.

describe('the operation requirement applies to planning, not to abandonment', () => {
  it('blocks a draft from being planned with no operations', () => {
    expect(requiresAtLeastOneOperation('Draft', 'Planned')).toBe(true);
  });

  it('does not block cancelling a draft that was never planned', () => {
    // Requiring an operation in order to give up on a work order would be
    // absurd, and a draft abandoned before planning is a normal outcome.
    expect(requiresAtLeastOneOperation('Draft', 'Cancelled')).toBe(false);
  });

  it('does not re-check a work order that already passed the gate', () => {
    // Past Draft the operations are already there, so re-counting on every
    // later hop is redundant work on the hot path.
    for (const [from, to] of [
      ['Planned', 'Scheduled'],
      ['Scheduled', 'In Progress'],
      ['In Progress', 'Completed'],
      ['Completed', 'Closed'],
      ['In Progress', 'Suspended'],
      ['Cancelled', 'Draft'],
    ] as const) {
      expect(requiresAtLeastOneOperation(from, to)).toBe(false);
    }
  });

  it('returns to guarding if a work order is sent back to Draft', () => {
    // Cancelled -> Draft is a legal hop, and a work order re-entering Draft has
    // to re-satisfy the gate on its way out again.
    expect(requiresAtLeastOneOperation('Cancelled', 'Draft')).toBe(false);
    expect(requiresAtLeastOneOperation('Draft', 'Planned')).toBe(true);
  });

  it('is inert for statuses it has never heard of', () => {
    expect(requiresAtLeastOneOperation('Draft', 'Nonsense')).toBe(false);
    expect(requiresAtLeastOneOperation('Nonsense', 'Planned')).toBe(false);
  });

  it('explains itself in a message a planner can act on', () => {
    expect(missingOperationMessage()).toMatch(/at least one operation/i);
  });
});

describe('the work order status route enforces it', () => {
  it('guards the transition with a real operation count', () => {
    expect(workOrderRoute).toMatch(
      /requiresAtLeastOneOperation\(workOrder\.status, newStatus\)/
    );
    expect(workOrderRoute).toMatch(/prisma\.workOrderOperation\.count\(\{ where: \{ workOrderId: id \} \}\)/);
  });

  it('refuses with 409 rather than a 400, since the request is well formed', () => {
    // The transition itself is legal; the work order is just not ready. 400
    // would wrongly tell the caller the status change was malformed.
    expect(workOrderRoute).toMatch(/return res\.status\(409\)\.json\(\{ error: missingOperationMessage\(\) \}\)/);
  });

  it('records the refusal as Blocked, like the checklist guard', () => {
    // Consistency with the pre-existing mandatory-checklist gate: a refused
    // transition is an auditable event, not a silent no-op.
    const blocked = workOrderRoute.match(/action: 'Blocked'/g) ?? [];
    expect(blocked.length).toBeGreaterThanOrEqual(2);
  });

  it('checks the operation rule before the checklist rule', () => {
    // Both produce 409. Reporting the missing operation first is more useful,
    // because a work order with no operations has no checklist instance either.
    const opGuard = workOrderRoute.indexOf('requiresAtLeastOneOperation(workOrder.status');
    const checklistGuard = workOrderRoute.indexOf("newStatus === 'In Progress'");
    expect(opGuard).toBeGreaterThan(-1);
    expect(opGuard).toBeLessThan(checklistGuard);
  });

  it('still leaves a draft work order creatable, so drafting stays possible', () => {
    // Creation is deliberately not blocked. A work order is drafted first and
    // given its operations next; blocking creation outright would make the
    // gate unreachable through the normal flow.
    expect(workOrderRoute).not.toMatch(/operationCount[\s\S]{0,400}router\.post/);
  });
});
