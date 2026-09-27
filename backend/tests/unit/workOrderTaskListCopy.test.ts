import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { workOrderCreateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const workOrderRoute = readFileSync(
  resolve(here, '../../src/routes/workOrders.ts'), 'utf8');

// SOW 3.1.4: work orders can copy operations from a task list. The matrix gap
// was that the only route to a task list's operations ran through preventive
// maintenance generation, so a planner raising work by hand could not use the
// reusable templates at all.

const base = {
  type: 'CM',
  priority: 'Medium',
  description: 'Replace worn bearing',
  functionalLocationId: 'fl-1',
  workCenterId: 'wc-1',
  supervisorUserId: 'u-1',
};

describe('a work order may name a task list to copy from, SOW 3.1.4', () => {
  it('accepts a task list id', () => {
    const r = workOrderCreateSchema.safeParse({ ...base, taskListId: 'tl-1' });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('taskListId', 'tl-1');
  });

  it('stays optional, so an ordinary work order is unaffected', () => {
    const r = workOrderCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('taskListId');
  });

  it('accepts an explicit null, for a client that always sends the key', () => {
    expect(workOrderCreateSchema.safeParse({ ...base, taskListId: null }).success).toBe(true);
  });

  it('rejects an empty task list id rather than copying nothing silently', () => {
    expect(workOrderCreateSchema.safeParse({ ...base, taskListId: '' }).success).toBe(false);
  });
});

describe('copying a task list onto a work order', () => {
  it('reads the template and its non-deleted operations in order', () => {
    expect(workOrderRoute).toMatch(/prisma\.taskList\.findFirst\(/);
    expect(workOrderRoute).toMatch(/operations: \{\s*where: \{ isDeleted: false \},\s*orderBy: \{ sequenceNumber: 'asc' \}/);
  });

  it('refuses an unknown task list', () => {
    expect(workOrderRoute).toMatch(/Task list not found/);
  });

  it('refuses a task list with no operations', () => {
    // Copying an empty template yields a work order with no operations, which
    // SOW 3.3.3 forbids and the planner did not ask for.
    expect(workOrderRoute).toMatch(/Task list has no operations to copy/);
  });

  it('carries the plan across and leaves the actuals to the technician', () => {
    expect(workOrderRoute).toMatch(/plannedHours: op\.plannedHours/);
    expect(workOrderRoute).toMatch(/numberOfTechnicians: op\.numberOfTechnicians/);
    expect(workOrderRoute).toMatch(/craftId: op\.craftId/);
    // The template is a plan. Copying a status or actual hours across would
    // fabricate work that has not happened.
    expect(workOrderRoute).toMatch(/actualHours: 0/);
    expect(workOrderRoute).toMatch(/status: 'Pending'/);
  });

  it('creates the work order and its operations in one transaction', () => {
    // Otherwise a failure part-way leaves a work order that exists but has no
    // operations, which is precisely the state 3.3.3 rules out.
    expect(workOrderRoute).toMatch(/prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?tx\.workOrder\.create\([\s\S]*?tx\.workOrderOperation\.create\(/);
  });

  it('recomputes planned cost when operations were copied', () => {
    // Planned cost derives from the operations, so without this the new work
    // order reports zero until something else touches it. The recompute names
    // who asked for it, so a cost change can never land with nobody attached.
    expect(workOrderRoute).toMatch(/if \(templateOperations\.length > 0\) \{\s*\n\s*\/\/[\s\S]*?await recomputeWorkOrderCosts\(workOrder\.workOrderId, \{ userId: req\.user!\.userId, ipAddress: req\.ip \}\);/);
  });

  it('allocates the work order number before opening the transaction', () => {
    // The sequence helper uses the shared client, not the transaction. A failed
    // create therefore leaves a gap in the numbering, which is visible and
    // harmless, rather than silently reusing a number on rollback.
    const numberAt = workOrderRoute.indexOf('const woNumber = await generateWoNumber();');
    const txnAt = workOrderRoute.indexOf('prisma.$transaction(async (tx) => {');
    expect(numberAt).toBeGreaterThan(-1);
    expect(numberAt).toBeLessThan(txnAt);
  });

  it('does not copy a task list when none was named', () => {
    expect(workOrderRoute).toMatch(/let templateOperations:[\s\S]*?= \[\];/);
    expect(workOrderRoute).toMatch(/if \(taskListId\) \{/);
  });
});
