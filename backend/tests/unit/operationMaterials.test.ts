import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  materialOperationRejection,
  materialOperationMessage,
  needsOperationCheck,
} from '../../src/utils/materialRules.js';
import { taskListMaterialItemSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(here, '../../prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(here, '../../prisma/migrations/20260926090000_task_list_and_operation_materials/migration.sql'), 'utf8');
const taskLists = readFileSync(resolve(here, '../../src/routes/taskLists.ts'), 'utf8');
const workOrders = readFileSync(resolve(here, '../../src/routes/workOrders.ts'), 'utf8');
const woMaterials = readFileSync(resolve(here, '../../src/routes/workOrderMaterials.ts'), 'utf8');

// SOW 3.1.4: task lists carry the materials their steps require.
// SOW 3.1.5: a material is issued to the work order operation that needs it.
//
// Neither existed anywhere in the schema. Both are placed against an operation
// rather than against a whole job, which is the design decision this file exists
// to pin down: a part belongs to the step that consumes it.

describe('the schema places materials against an operation', () => {
  it('records a required material on a task list step', () => {
    expect(schema).toMatch(/model TaskListMaterial \{[\s\S]*taskOperationId\s+String/);
    expect(schema).toMatch(/materials\s+TaskListMaterial\[\]/);
  });

  it('lets a work order material name the operation it is issued to', () => {
    expect(schema).toMatch(/model WorkOrderMaterial \{[\s\S]*operationId\s+String\?/);
    expect(schema).toMatch(/operation\s+WorkOrderOperation\?/);
  });

  it('makes the link optional rather than mandatory', () => {
    // A part can genuinely be common to the whole job, and existing rows
    // predate the link. A NOT NULL column would have needed a backfill of a
    // value nobody can know.
    expect(migration).toMatch(/ADD COLUMN\s+"operationId" TEXT;/);
    expect(migration).not.toMatch(/"operationId" TEXT NOT NULL/);
  });

  it('refuses the same part twice on one step', () => {
    // Two quantities for one part is a data-entry slip, and summing them later
    // would hide it.
    expect(migration).toMatch(/UNIQUE INDEX "TaskListMaterial_op_material_key"/);
  });

  it('keeps a requirement when its operation is deleted, but keeps an issue too', () => {
    // The two sides are deliberately opposite. A requirement is a statement
    // about a step, so deleting the step must not orphan the statement. An
    // issue was really made and its cost was really incurred, so deleting the
    // operation must not delete the cost.
    expect(migration).toMatch(/TaskListMaterial_taskOperationId_fkey[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/WorkOrderMaterial_operationId_fkey[\s\S]*ON DELETE SET NULL/);
  });
});

describe('a material cannot be attributed to another job', () => {
  it('accepts an operation on the same work order', () => {
    expect(materialOperationRejection('wo-1', 'wo-1')).toBeNull();
  });

  it('refuses an operation belonging to a different work order', () => {
    // Nothing in the database stops this, and the cost rollup would then charge
    // the part to the wrong job while both screens showed a plausible link.
    expect(materialOperationRejection('wo-2', 'wo-1')).toBe('operation-other-work-order');
  });

  it('reports a missing operation as missing, not as a mismatch', () => {
    // "Not found" and "belongs to another work order" are different mistakes,
    // and the second message would send the caller hunting the wrong job.
    expect(materialOperationRejection(null, 'wo-1')).toBe('operation-not-found');
  });

  it('does not look anything up when no operation was named', () => {
    expect(needsOperationCheck(undefined)).toBe(false);
    expect(needsOperationCheck(null)).toBe(false);
    expect(needsOperationCheck('')).toBe(false);
    expect(needsOperationCheck('op-1')).toBe(true);
  });

  it('gives each rejection its own message', () => {
    expect(materialOperationMessage('operation-not-found')).toBe('Operation not found');
    expect(materialOperationMessage('operation-other-work-order')).toMatch(/does not belong/);
  });

  it('is enforced on create and on re-point, since either can set the link', () => {
    const checks = woMaterials.match(/materialOperationRejection\(/g) ?? [];
    expect(checks.length).toBe(2);
  });

  it('answers 404 for missing and 400 for a mismatch', () => {
    expect(woMaterials).toMatch(/rejection === 'operation-not-found' \? 404 : 400/);
  });
});

describe('a required material is a real quantity', () => {
  it('accepts a zero, which means the part is needed but unquantified', () => {
    // A genuine state for a template that is not yet costed out.
    expect(taskListMaterialItemSchema.safeParse({ materialId: 'm1', quantity: 0 }).success).toBe(true);
  });

  it('rejects a negative, which would reduce stock when issued', () => {
    expect(taskListMaterialItemSchema.safeParse({ materialId: 'm1', quantity: -1 }).success).toBe(false);
  });

  it('requires a material', () => {
    expect(taskListMaterialItemSchema.safeParse({ quantity: 1 }).success).toBe(false);
  });
});

describe('requirements are stored and returned', () => {
  it('persists them on create', () => {
    expect(taskLists).toMatch(/materials: \{\s*create: op\.materials\.map/);
  });

  it('replaces them with the operations they belong to', () => {
    // createMany cannot nest, so the update path creates operations one at a
    // time to get each generated id.
    expect(taskLists).toMatch(/const created = await tx\.taskListOperation\.create\(/);
    expect(taskLists).toMatch(/taskOperationId: created\.taskOperationId/);
  });

  it('clears the superseded requirements instead of leaking them', () => {
    // Operations are soft-deleted, so without this the requirements would
    // outlive every step they describe and grow on each edit. The step's own
    // rows now retire the same way (updateMany), matching the operation.
    expect(taskLists).toMatch(/taskListMaterial\.updateMany\(/);
  });

  it('does all of that in one transaction, so a failure leaves no half list', () => {
    expect(taskLists).toMatch(/prisma\.\$transaction\(async \(tx\) => \{/);
  });

  it('returns them on every task list read', () => {
    // Five include sites total: the two read paths (list + detail) use the bare
    // include, the three write-path returns (create, update-audit, update) carry
    // the sweep's isDeleted filter in front of it. Both forms count to prove
    // the filter rigged into the write-path returns without dropping a read.
    const bare = taskLists.match(/materials: \{ ?include: \{ material: true \}/g) ?? [];
    const filtered = taskLists.match(/materials: \{ where: \{ isDeleted: false \}, include: \{ material: true \}/g) ?? [];
    expect(bare.length).toBe(2);
    expect(filtered.length).toBe(3);
  });

  it('blames the duplicate requirement rather than the task list code', () => {
    expect(taskLists).toMatch(/target\.includes\('TaskListMaterial'\)/);
    expect(taskLists).toMatch(/same material more than once/);
  });
});

describe('creating a work order from a task list carries the requirements', () => {
  it('reads them off the template', () => {
    expect(workOrders).toMatch(/include: \{ materials: \{ include: \{ material: true \} \} \}/);
  });

  it('creates a planned line against the copied operation', () => {
    // This is the link between the two rows: the template says what the step
    // needs, the work order says what was planned for it.
    expect(workOrders).toMatch(/operationId: createdOperation\.operationId/);
  });

  it('prices the line, rather than leaving planned cost understated', () => {
    // planned material cost is plannedQuantity x unitCost, so a copied
    // requirement at the default rate of 0 would quietly drop the whole parts
    // bill out of the work order's planned cost.
    expect(workOrders).toMatch(/unitCost: required\.standardCost/);
    expect(workOrders).toMatch(/standardCost: m\.material\.standardCost \|\| 0/);
  });

  it('issues nothing, because the template is a plan', () => {
    expect(workOrders).toMatch(/actualQuantity: 0/);
  });

  it('keeps a part required by two steps as two lines', () => {
    // Collapsing them would put the whole quantity against whichever step was
    // copied first and make that step look like it consumes the entire job.
    expect(workOrders).toMatch(/for \(const required of op\.materials\)/);
  });
});
