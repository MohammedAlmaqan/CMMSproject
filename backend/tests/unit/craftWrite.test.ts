import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { craftCreateSchema, craftUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const craftsRoute = readFileSync(
  resolve(here, '../../src/routes/crafts.ts'), 'utf8');

// SOW 3.1.3 with decision D-16: each craft belongs to a work centre and carries
// its own hourly rate, and that rate is what 3.5.1 cost estimation consumes.
// The model columns were already right; the collection was GET-only, so these
// cases hold the new write path to the rate actually being required and carried
// through, rather than to the handler merely existing.

describe('craft create schema, SOW 3.1.3 and D-16', () => {
  it('accepts a craft with its work centre and its own rate', () => {
    const r = craftCreateSchema.safeParse({
      workCenterId: 'wc-1',
      craftCode: 'MECH',
      description: 'Mechanical technician',
      hourlyRate: 42.5,
    });
    expect(r.success).toBe(true);
    expect(r.data).toHaveProperty('hourlyRate', 42.5);
  });

  it('requires a work centre, so a craft always belongs to one', () => {
    expect(craftCreateSchema.safeParse({
      craftCode: 'MECH', description: 'x', hourlyRate: 1,
    }).success).toBe(false);
  });

  it('requires the hourly rate itself rather than defaulting it', () => {
    // A defaulted rate becomes a zero-cost craft in 3.5.1 estimation, which is
    // exactly the estimate error this write path exists to prevent.
    expect(craftCreateSchema.safeParse({
      workCenterId: 'wc-1', craftCode: 'MECH', description: 'x',
    }).success).toBe(false);
  });

  it('rejects a negative rate', () => {
    expect(craftCreateSchema.safeParse({
      workCenterId: 'wc-1', craftCode: 'MECH', description: 'x', hourlyRate: -1,
    }).success).toBe(false);
  });

  it('permits a zero rate for a genuinely non-billable craft', () => {
    expect(craftCreateSchema.safeParse({
      workCenterId: 'wc-1', craftCode: 'HELPER', description: 'x', hourlyRate: 0,
    }).success).toBe(true);
  });

  it('rejects a blank craft code or description', () => {
    expect(craftCreateSchema.safeParse({
      workCenterId: 'wc-1', craftCode: '  ', description: 'x', hourlyRate: 1,
    }).success).toBe(false);
    expect(craftCreateSchema.safeParse({
      workCenterId: 'wc-1', craftCode: 'MECH', description: '', hourlyRate: 1,
    }).success).toBe(false);
  });

  it('supports a partial craft update, so correcting a rate does not blank the rest', () => {
    const r = craftUpdateSchema.safeParse({ hourlyRate: 50 });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ hourlyRate: 50 });
  });
});

describe('craft write path, SOW 3.1.3', () => {
  it('exposes create, read-one, update and delete', () => {
    expect(craftsRoute).toMatch(/router\.post\('\/'/);
    expect(craftsRoute).toMatch(/router\.get\('\/:id'/);
    expect(craftsRoute).toMatch(/router\.put\('\/:id'/);
    expect(craftsRoute).toMatch(/router\.delete\('\/:id'/);
  });

  it('writes the rate and the work centre on create', () => {
    expect(craftsRoute).toMatch(/workCenterId,\s*\n\s*craftCode,\s*\n\s*description,\s*\n\s*hourlyRate,/);
  });

  it('refuses a craft under an unknown or deleted work centre', () => {
    expect(craftsRoute).toMatch(/Work center not found/);
  });

  it('refuses a duplicate craft code inside one work centre', () => {
    expect(craftsRoute).toMatch(/already exists in this work center/);
  });

  it('writes only the fields present in an update body', () => {
    // Guards the partial-update contract: an unconditional data object would
    // blank description and craftCode every time a rate was corrected.
    expect(craftsRoute).toMatch(/req\.body\.hourlyRate\s*!==\s*undefined\s*&&\s*\{\s*hourlyRate:\s*req\.body\.hourlyRate\s*\}/);
    expect(craftsRoute).toMatch(/req\.body\.description\s*!==\s*undefined\s*&&\s*\{\s*description:\s*req\.body\.description\s*\}/);
  });

  it('excludes the craft itself when checking for a duplicate code', () => {
    // Without NOT: { craftId }, saving a craft without changing its own code
    // would find itself and reject the request.
    expect(craftsRoute).toMatch(/NOT:\s*\{\s*craftId\s*\}/);
  });

  it('retires rather than removes, because operations reference a craft', () => {
    expect(craftsRoute).toMatch(/isDeleted:\s*true/);
    expect(craftsRoute).not.toMatch(/prisma\.craft\.delete\(/);
  });

  it('refuses to retire a craft that an operation still depends on', () => {
    expect(craftsRoute).toMatch(/still referenced by a work order operation/);
  });

  it('audits each of the three writes, and leaves the read unaudited', () => {
    const create = craftsRoute.match(/table: 'Craft', recordId: craft\.craftId, action: 'Create'/g) ?? [];
    // The update path is a field diff, so it names the table and the record but
    // carries no action: logFieldChanges is only ever an update.
    const update = craftsRoute.match(/logFieldChanges\(\{\s*\n\s*table: 'Craft',\s*\n\s*recordId: craftId,/g) ?? [];
    const remove = craftsRoute.match(/table: 'Craft', recordId: craftId, action: 'Delete'/g) ?? [];
    expect(create).toHaveLength(1);
    expect(update).toHaveLength(1);
    expect(remove).toHaveLength(1);
    // Three writes, three audit entries: a silent unaudited mutation is the
    // failure this guards, so the count is pinned exactly rather than loosely.
    expect((craftsRoute.match(/table: 'Craft'/g) ?? [])).toHaveLength(3);
  });
});
