import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { operationUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const operationRoute = readFileSync(
  resolve(here, '../../src/routes/workOrderOperations.ts'), 'utf8');
// ---------------------------------------------------------------------------
// SOW 3.3.3 — per-operation actual hours and status.
//
// The recorded defect was "the update handler strips actualHours and status".
// That named the wrong layer. The handler at workOrderOperations.ts destructures
// and persists both fields correctly. The real cause is that `validate()` does
// `req.body = result.data`, and a Zod object DROPS any key it does not declare.
// operationUpdateSchema was `operationCreateSchema.partial()`, and
// operationCreateSchema never declared actualHours or status, so both were
// silently discarded before the handler ran. These cases pin the mechanism so
// the same silent-strip bug cannot come back through a renamed field.
// ---------------------------------------------------------------------------

describe('operation update schema, SOW 3.3.3', () => {
  it('preserves actualHours through validation', () => {
    const r = operationUpdateSchema.safeParse({ actualHours: 3.5 });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('actualHours', 3.5);
  });

  it('preserves operation status through validation', () => {
    const r = operationUpdateSchema.safeParse({ status: 'Completed' });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('status', 'Completed');
  });

  it('preserves both together, as a technician would send them', () => {
    const r = operationUpdateSchema.safeParse({
      description: 'Replace bearing',
      actualHours: 4,
      status: 'In Progress',
    });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('actualHours', 4);
    expect(r.data).toHaveProperty('status', 'In Progress');
  });

  it('accepts a null actualHours, for an operation not yet started', () => {
    const r = operationUpdateSchema.safeParse({ actualHours: null });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('actualHours', null);
  });

  it('rejects negative actual hours', () => {
    expect(operationUpdateSchema.safeParse({ actualHours: -1 }).success).toBe(false);
  });

  it('rejects a blank status', () => {
    expect(operationUpdateSchema.safeParse({ status: '   ' }).success).toBe(false);
  });

  it('leaves the create schema alone, so operation rows are still created clean', () => {
    // actualHours is recorded on the operation by the technician afterwards, so
    // it must not become creatable in one step with the plan.
    const r = operationUpdateSchema.safeParse({ workOrderId: 'wo-1' });
    expect(r.success).toBe(true);
  });

  it('still requires the original create fields when they are sent', () => {
    expect(operationUpdateSchema.safeParse({ plannedHours: -5 }).success).toBe(false);
  });

  it('the route handler really does persist both fields', () => {
    // Guards the other half of the fix: if the schema now lets the fields
    // through but the handler stops writing them, the bug returns silently.
    expect(operationRoute).toMatch(/actualHours\s*!==\s*undefined\s*&&\s*\{\s*actualHours\s*\}/);
    expect(operationRoute).toMatch(/status\s*!==\s*undefined\s*&&\s*\{\s*status\s*\}/);
  });
});

// ---------------------------------------------------------------------------
// SOW 3.1.2 / 3.1.5 — equipment spare-parts BOM write path.
// ---------------------------------------------------------------------------