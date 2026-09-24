import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let materialId = '';
let woMatId = '';

describe('work order materials routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test mat WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
    materialId = (await prisma.material.findFirst({ where: { isDeleted: false } }))!.materialId;
  });

  afterAll(async () => {
    if (woMatId) {
      await prisma.workOrderMaterial.deleteMany({ where: { woMaterialId: woMatId } }).catch(() => {});
    }
    await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } }).catch(() => {});
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  it('returns the materials for a work order', async () => {
    const res = await api().get(`/api/work-order-materials?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.operatorToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: 2 });
    expect(res.status).toBe(403);
  });

  it('creates a WO material (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: 2 });
    expect(res.status).toBe(201);
    woMatId = res.body.woMaterialId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderMaterial', recordId: woMatId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: -5 });
    expect(res.status).toBe(400);
  });

  it('hard-deletes a WO material (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-order-materials/${woMatId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderMaterial', recordId: woMatId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});