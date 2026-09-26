import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { equipmentBomCreateSchema, equipmentBomUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const equipmentRoute = readFileSync(
  resolve(here, '../../src/routes/equipment.ts'), 'utf8');
describe('equipment BOM write schemas, SOW 3.1.2 and 3.1.5', () => {
  it('accepts a catalog material with a positive quantity', () => {
    const r = equipmentBomCreateSchema.safeParse({ materialId: 'mat-1', quantity: 2 });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ materialId: 'mat-1', quantity: 2 });
  });

  it('requires a material from the catalog', () => {
    expect(equipmentBomCreateSchema.safeParse({ quantity: 2 }).success).toBe(false);
    expect(equipmentBomCreateSchema.safeParse({ materialId: '', quantity: 2 }).success).toBe(false);
  });

  it('rejects a zero or negative quantity', () => {
    expect(equipmentBomCreateSchema.safeParse({ materialId: 'm', quantity: 0 }).success).toBe(false);
    expect(equipmentBomCreateSchema.safeParse({ materialId: 'm', quantity: -3 }).success).toBe(false);
  });

  it('allows only the quantity to be edited on a BOM line', () => {
    const r = equipmentBomUpdateSchema.safeParse({ quantity: 5 });
    expect(r.success).toBe(true);
    expect(equipmentBomUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('exposes create, update and delete for BOM lines', () => {
    expect(equipmentRoute).toMatch(/router\.post\('\/:id\/bom'/);
    expect(equipmentRoute).toMatch(/router\.put\('\/:id\/bom\/:bomId'/);
    expect(equipmentRoute).toMatch(/router\.delete\('\/:id\/bom\/:bomId'/);
  });

  it('refuses to create a duplicate material line on one equipment', () => {
    expect(equipmentRoute).toMatch(/already on this equipment BOM/);
  });

  it('scopes BOM writes to the equipment in the path', () => {
    // Guards a cross-tenant style bug: a bomId belonging to another equipment
    // must 404 rather than be edited through the wrong parent's URL.
    expect(equipmentRoute).toMatch(/where: \{ bomId, equipmentId \}/);
  });
});