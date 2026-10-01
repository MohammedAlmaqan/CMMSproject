import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.5 (matrix :97): a material requirement attaches to the operation
// that needs it. woMaterialCreateSchema shipped `operationId` and the route
// already refused an operation owned by another work order, but not one route
// test ever posted it — every existing line went to the flat collection. These
// cases prove the link lands on the row, comes back on the work order read,
// re-points on update, and that a named operation from another job is refused.

let woId = '';
let otherWoId = '';
let operationId = '';
let rePointerOperationId = '';
let craftId = '';
let materialId = '';
const lineIds: string[] = [];

const stamp = Date.now();

beforeAll(async () => {
  const [fl, wc, craft, mat] = await Promise.all([
    prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
    prisma.workCenter.findFirst({ where: { isDeleted: false } }),
    prisma.craft.findFirst({ where: { isDeleted: false } }),
    prisma.material.findFirst({ where: { isDeleted: false } }),
  ]);
  if (!fl || !wc || !craft || !mat) throw new Error('seeded locations, centers, crafts, materials not found');
  craftId = craft.craftId;
  materialId = mat.materialId;

  const wo = await prisma.workOrder.create({
    data: {
      woNumber: `WOM-${stamp}`,
      type: 'CM',
      priority: 'Medium',
      status: 'Draft',
      description: 'operation material fixture',
      functionalLocationId: fl.functionalLocationId,
      workCenterId: wc.workCenterId,
      supervisorUserId: ctx.adminId,
      reportedByUserId: ctx.adminId,
      createdBy: ctx.adminId,
      modifiedBy: ctx.adminId,
    },
  });
  woId = wo.workOrderId;

  const other = await prisma.workOrder.create({
    data: {
      woNumber: `WOM2-${stamp}`,
      type: 'CM',
      priority: 'Medium',
      status: 'Draft',
      description: 'operation material fixture, other job',
      functionalLocationId: fl.functionalLocationId,
      workCenterId: wc.workCenterId,
      supervisorUserId: ctx.adminId,
      reportedByUserId: ctx.adminId,
      createdBy: ctx.adminId,
      modifiedBy: ctx.adminId,
    },
  });
  otherWoId = other.workOrderId;

  const op = await prisma.workOrderOperation.create({
    data: {
      workOrderId: woId,
      sequenceNumber: 10,
      description: 'step ten',
      craftId,
      plannedHours: 1,
    },
  });
  operationId = op.operationId;

  const second = await prisma.workOrderOperation.create({
    data: {
      workOrderId: woId,
      sequenceNumber: 20,
      description: 'step twenty',
      craftId,
      plannedHours: 1,
    },
  });
  rePointerOperationId = second.operationId;
});

afterAll(async () => {
  // Clears the material lines, the operations and the orders together, plus the
  // audit rows describing them. Deleting the orders on their own could not
  // succeed once a status change had taken a snapshot, and the resulting P2003
  // was swallowed, leaving both orders behind.
  await purgeWorkOrders([woId, otherWoId]);
});

describe('work order operation materials (SOW 3.1.5, :97)', () => {
  it('stores a material against the operation that needs it (Technician+)', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: woId, materialId, operationId, plannedQuantity: 3, unitCost: 15.5 });
    expect(res.status).toBe(201);
    expect(res.body.operationId).toBe(operationId);
    expect(Number(res.body.unitCost)).toBe(15.5);
    lineIds.push(res.body.woMaterialId);

    const row = await prisma.workOrderMaterial.findUnique({ where: { woMaterialId: res.body.woMaterialId } });
    expect(row!.operationId).toBe(operationId);
  });

  it('serves the operation link back on the work order read', async () => {
    const res = await api().get(`/api/work-orders/${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    const line = res.body.woMaterials.find((m: { woMaterialId: string }) => lineIds.includes(m.woMaterialId));
    expect(line.operationId).toBe(operationId);
    expect(line.material.materialCode).toBeTruthy();
    // The nested operation is the row the material is issued to.
    expect(line.operation.operationId).toBe(operationId);
  });

  it('refuses an operation that belongs to another work order (400)', async () => {
    const otherOp = await prisma.workOrderOperation.create({
      data: {
        workOrderId: otherWoId,
        sequenceNumber: 10,
        description: 'other job step',
        craftId,
        plannedHours: 1,
      },
    });
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: woId, materialId, operationId: otherOp.operationId, plannedQuantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong/);
    await prisma.workOrderOperation.deleteMany({ where: { operationId: otherOp.operationId } });
  });

  it('refuses an operation that does not exist (404)', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: woId, materialId, operationId: 'no-such-operation', plannedQuantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Operation not found');
  });

  it('refuses a material that is not in the catalog (404)', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: woId, materialId: 'no-such-catalog-material', plannedQuantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Material not found');
  });

  it('refuses an unknown work order as not-found, not a 500', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: 'no-such-work-order', materialId, plannedQuantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Work order not found');
  });

  it('re-points the material to another operation on the same work order', async () => {
    const res = await api()
      .put(`/api/work-order-materials/${lineIds[0]}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: rePointerOperationId });
    expect(res.status).toBe(200);
    expect(res.body.operationId).toBe(rePointerOperationId);

    const row = await prisma.workOrderMaterial.findUnique({ where: { woMaterialId: lineIds[0] } });
    expect(row!.operationId).toBe(rePointerOperationId);
  });

  it('refuses a negative planned quantity (400)', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.technicianToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/plannedQuantity/);
  });
});