import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let craftId = '';
let opId = '';

describe('work order operations routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test ops WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
    const c = await prisma.craft.findFirst({ where: { isDeleted: false } });
    craftId = c!.craftId;
  });

  afterAll(async () => {
    if (opId) {
      await prisma.laborEntry.deleteMany({ where: { operationId: opId } }).catch(() => {});
      await prisma.workOrderOperation.deleteMany({ where: { operationId: opId } }).catch(() => {});
    }
    await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } }).catch(() => {});
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  it('returns the operations for a work order', async () => {
    const res = await api().get(`/api/work-order-operations?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.operatorToken))
      .send({ workOrderId: woId, sequenceNumber: 10, description: 'op', craftId });
    expect(res.status).toBe(403);
  });

  it('creates an operation (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, sequenceNumber: 10, description: 'test op', craftId });
    expect(res.status).toBe(201);
    opId = res.body.operationId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, sequenceNumber: -1, description: '' });
    expect(res.status).toBe(400);
  });

  it('rejects delete by a below-Technician role with 403', async () => {
    const res = await api().delete(`/api/work-order-operations/${opId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('hard-deletes an operation (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-order-operations/${opId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});