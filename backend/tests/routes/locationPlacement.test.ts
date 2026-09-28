import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.2: each equipment record is assigned to the lowest level of the
// functional location hierarchy.
//
// The implementation defines "lowest level" structurally (a location with no
// non-deleted children) and guards every direction in which the invariant can
// break. No test exercised any of the refusals before this file:
//   - placing equipment under a non-leaf,
//   - adding a child beneath a location that holds equipment,
//   - re-parenting a location beneath a parent that holds equipment,
//   - re-parenting into the subtree (a cycle the tree walk would spin on).

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let parentId = '';
let c1Id = '';
let c2Id = '';
let movableId = '';
let equipmentId = '';
let createdEquipCode = '';

async function createEquipment(functionalLocationId: string, code: string) {
  return api()
    .post('/api/equipment')
    .set(authHeaders(ctx.adminToken))
    .send({ equipmentCode: code, name: 'placement probe', functionalLocationId, criticality: 'B' });
}

describe('equipment placement at the lowest functional location (SOW 3.1.2)', () => {
  beforeAll(async () => {
    parentId = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `PLC-P-${stamp}`,
          description: 'placement parent',
          locationType: 'Area',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;

    c1Id = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `PLC-C1-${stamp}`,
          description: 'placement leaf one',
          parentLocationId: parentId,
          locationType: 'Unit',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;

    c2Id = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `PLC-C2-${stamp}`,
          description: 'placement leaf two',
          parentLocationId: parentId,
          locationType: 'Unit',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;

    movableId = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `PLC-M-${stamp}`,
          description: 'location to be moved',
          parentLocationId: parentId,
          locationType: 'Unit',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;
  });

  afterAll(async () => {
    if (equipmentId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: equipmentId } }).catch(() => {});
      await prisma.equipment.deleteMany({ where: { equipmentId } }).catch(() => {});
    }
    for (const id of [movableId, c2Id, c1Id, parentId]) {
      await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: id } }).catch(() => {});
    }
  });

  it('accepts equipment at a leaf location', async () => {
    const res = await createEquipment(c1Id, `PLC-EQ-${stamp}`);
    expect(res.status).toBe(201);
    equipmentId = res.body.equipmentId;
    createdEquipCode = res.body.equipmentCode;
  });

  it('refuses equipment under a non-leaf location (400)', async () => {
    const res = await createEquipment(parentId, `PLC-EQ-NL-${stamp}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lowest-level/);
    // The refusal must not leave a row behind.
    expect(await prisma.equipment.count({ where: { equipmentCode: `PLC-EQ-NL-${stamp}` } })).toBe(0);
  });

  it('refuses an update that moves equipment onto a non-leaf location (400)', async () => {
    const res = await api()
      .put(`/api/equipment/${equipmentId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ functionalLocationId: parentId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lowest-level/);
    // The equipment stayed where validation allowed it.
    const row = await prisma.equipment.findUniqueOrThrow({ where: { equipmentId } });
    expect(row.functionalLocationId).toBe(c1Id);
  });

  it('refuses adding a child beneath a location that holds equipment (400)', async () => {
    const res = await api()
      .post('/api/functional-locations')
      .set(authHeaders(ctx.adminToken))
      .send({
        locationCode: `PLC-BC-${stamp}`,
        description: 'illegal child under equipped location',
        parentLocationId: c1Id,
        locationType: 'Sub-unit',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/holds equipment/);
    expect(await prisma.functionalLocation.count({ where: { locationCode: `PLC-BC-${stamp}` } })).toBe(0);
  });

  it('refuses re-parenting beneath a parent that holds equipment (409)', async () => {
    const res = await api()
      .put(`/api/functional-locations/${movableId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ parentLocationId: c1Id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/holds equipment/);
    // The location did not move.
    const row = await prisma.functionalLocation.findUniqueOrThrow({ where: { functionalLocationId: movableId } });
    expect(row.parentLocationId).toBe(parentId);
  });

  it('refuses re-parenting into the subtree, which would create a cycle (409)', async () => {
    const res = await api()
      .put(`/api/functional-locations/${parentId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ parentLocationId: c1Id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/subtree|descendant|cycle/i);
  });
});