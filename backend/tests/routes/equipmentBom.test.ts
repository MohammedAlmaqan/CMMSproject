import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.2 / 3.1.5 (matrix :84, :96): spare parts from the material catalog
// associate with an equipment as a BOM, and the material comes back on the
// equipment read.
//
// equipmentBomWrite.test.ts unit-tests the two zod schemas and greps the route
// source for the write shape, so the path was never executed against a live
// database. These cases run POST/PUT/DELETE /api/equipment/:id/bom end-to-end
// and read the BOM back through /api/equipment/:id.

let equipmentId = '';
let catalogMaterialA = '';
let catalogMaterialB = '';
const bomIds: string[] = [];

const stamp = Date.now();

beforeAll(async () => {
  const locations = await prisma.functionalLocation.findMany({ where: { isDeleted: false } });
  const parents = new Set(locations.map((l) => l.parentLocationId).filter(Boolean));
  const leaf = locations.find((l) => !parents.has(l.functionalLocationId))!;

  const mats = await prisma.material.findMany({
    where: { isDeleted: false },
    orderBy: { materialCode: 'asc' },
    take: 2,
  });
  catalogMaterialA = mats[0].materialId;
  catalogMaterialB = mats[1].materialId;

  const equipment = await prisma.equipment.create({
    data: {
      equipmentCode: `BOM-EQ-${stamp}`,
      name: 'bom fixture pump',
      description: 'bom write-path fixture',
      functionalLocationId: leaf.functionalLocationId,
      manufacturer: 'Fixture Works',
      model: 'P-1',
      serialNumber: `SN-${stamp}`,
      assetTag: `TAG-${stamp}`,
      equipmentClass: 'Pump',
      criticality: 'B',
    },
  });
  equipmentId = equipment.equipmentId;
});

afterAll(async () => {
  await prisma.equipmentBOMMaterial.deleteMany({ where: { equipmentId } }).catch(() => {});
  await prisma.equipment.deleteMany({ where: { equipmentId } }).catch(() => {});
});

describe('equipment BOM write path (SOW 3.1.2, :84)', () => {
  it('adds a catalog material to the equipment BOM (Technician+)', async () => {
    const res = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: catalogMaterialA, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.bomId).toBeTruthy();
    expect(res.body.materialId).toBe(catalogMaterialA);
    expect(res.body.quantity).toBe(2);
    bomIds.push(res.body.bomId);

    const row = await prisma.equipmentBOMMaterial.findUnique({ where: { bomId: res.body.bomId } });
    expect(row).not.toBeNull();
    expect(row!.quantity).toBe(2);
    expect(row!.equipmentId).toBe(equipmentId);
  });

  it('refuses a zero or negative quantity (400)', async () => {
    const zero = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: catalogMaterialB, quantity: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.error).toMatch(/quantity/);
    expect(zero.body.error).toMatch(/Too small/);

    const negative = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: catalogMaterialB, quantity: -3 });
    expect(negative.status).toBe(400);
    expect(negative.body.error).toMatch(/Too small/);
  });

  it('refuses a material already on this equipment BOM (409)', async () => {
    const res = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: catalogMaterialA, quantity: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already on this equipment BOM/);
  });

  it('refuses a material that is not in the catalog (400)', async () => {
    const res = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: 'no-such-catalog-material', quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Material not found in catalog');
  });

  it('refuses an equipment that does not exist (404)', async () => {
    const res = await api()
      .post('/api/equipment/no-such-equipment/bom')
      .set(authHeaders(ctx.technicianToken))
      .send({ materialId: catalogMaterialB, quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Equipment not found');
  });

  it('refuses a Requester, who is below Technician (403)', async () => {
    const res = await api()
      .post(`/api/equipment/${equipmentId}/bom`)
      .set(authHeaders(ctx.operatorToken))
      .send({ materialId: catalogMaterialB, quantity: 1 });
    expect(res.status).toBe(403);
  });

  it('updates the BOM quantity (Technician+)', async () => {
    const res = await api()
      .put(`/api/equipment/${equipmentId}/bom/${bomIds[0]}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(5);

    const row = await prisma.equipmentBOMMaterial.findUnique({ where: { bomId: bomIds[0] } });
    expect(row!.quantity).toBe(5);
  });

  it('refuses an update against a BOM line that is not on this equipment (404)', async () => {
    const res = await api()
      .put(`/api/equipment/${equipmentId}/bom/no-such-bom-line`)
      .set(authHeaders(ctx.technicianToken))
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('BOM line not found on this equipment');
  });

  it('refuses a zero quantity on update (400)', async () => {
    const res = await api()
      .put(`/api/equipment/${equipmentId}/bom/${bomIds[0]}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Too small/);
  });

  it('keeps the delete above Technician (403)', async () => {
    const res = await api()
      .delete(`/api/equipment/${equipmentId}/bom/${bomIds[0]}`)
      .set(authHeaders(ctx.technicianToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes the BOM line (Supervisor+)', async () => {
    const res = await api()
      .delete(`/api/equipment/${equipmentId}/bom/${bomIds[0]}`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/);

    const row = await prisma.equipmentBOMMaterial.findUnique({ where: { bomId: bomIds[0] } });
    expect(row!.isDeleted).toBe(true);
  });
});

describe('equipment BOM read back (SOW 3.1.5, :96)', () => {
  it('serves the BOM and its catalog material on the equipment detail read', async () => {
    const res = await api().get(`/api/equipment/${equipmentId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    const line = res.body.bomItems.find((b: { bomId: string }) => b.bomId === bomIds[0]);
    expect(line).toBeTruthy();
    expect(line.materialId).toBe(catalogMaterialA);
    expect(line.quantity).toBe(5);
    expect(line.material.materialCode).toBeTruthy();
    expect(line.material.description).toBeTruthy();
  });
});