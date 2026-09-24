import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let svcId = '';

describe('external service costs routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test svc WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
  });

  afterAll(async () => {
    if (svcId) {
      await prisma.externalServiceCost.deleteMany({ where: { serviceCostId: svcId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: svcId } }).catch(() => {});
    }
    await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } }).catch(() => {});
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  it('returns the external services for a work order', async () => {
    const res = await api().get(`/api/external-services?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/external-services')
      .set(authHeaders(ctx.operatorToken))
      .send({ workOrderId: woId, vendor: 'Vendor A', description: 'svc', cost: 100 });
    expect(res.status).toBe(403);
  });

  it('creates an external service (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/external-services')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, vendor: 'Vendor A', description: 'test svc', cost: 120.5 });
    expect(res.status).toBe(201);
    svcId = res.body.serviceCostId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'ExternalServiceCost', recordId: svcId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/external-services')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, vendor: '', description: '', cost: -1 });
    expect(res.status).toBe(400);
  });

  it('hard-deletes an external service (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/external-services/${svcId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'ExternalServiceCost', recordId: svcId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});