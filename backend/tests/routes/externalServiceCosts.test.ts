import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let svcId = '';
const extraIds: string[] = [];

const createService = (body: Record<string, unknown>, token = ctx.adminToken) =>
  api().post('/api/external-services').set(authHeaders(token)).send(body);

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
        reportedByUserId: ctx.adminId,
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
    if (extraIds.length) {
      await prisma.externalServiceCost.deleteMany({ where: { serviceCostId: { in: extraIds } } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: extraIds } } }).catch(() => {});
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

  // SOW 3.3.6: "Additional miscellaneous costs (travel, permits) as line items".
  describe('cost category', () => {
    it('defaults to Service when the caller sends no category, so an older client keeps its meaning', async () => {
      const res = await createService({ workOrderId: woId, vendor: 'V', description: 'no category', cost: 10 });
      expect(res.status).toBe(201);
      extraIds.push(res.body.serviceCostId);
      const row = await prisma.externalServiceCost.findUniqueOrThrow({ where: { serviceCostId: res.body.serviceCostId } });
      expect(row.category).toBe('Service');
    });

    it('accepts and persists Travel, Permit and Other as distinct line items', async () => {
      for (const category of ['Travel', 'Permit', 'Other']) {
        const res = await createService({ workOrderId: woId, vendor: 'V', description: category, cost: 5, category });
        expect(res.status).toBe(201);
        extraIds.push(res.body.serviceCostId);
        const row = await prisma.externalServiceCost.findUniqueOrThrow({ where: { serviceCostId: res.body.serviceCostId } });
        expect(row.category).toBe(category);
      }
    });

    it('rejects a category outside the permitted set with a zod-derived 400', async () => {
      const res = await createService({
        workOrderId: woId,
        vendor: 'V',
        description: 'bad category',
        cost: 5,
        category: 'Freight',
      });
      expect(res.status).toBe(400);
    });

    it('lets a line be reclassified by update', async () => {
      const created = await createService({ workOrderId: woId, vendor: 'V', description: 'reclass', cost: 7 });
      const id = created.body.serviceCostId;
      extraIds.push(id);

      const res = await api()
        .put(`/api/external-services/${id}`)
        .set(authHeaders(ctx.adminToken))
        .send({ category: 'Permit' });
      expect(res.status).toBe(200);

      const row = await prisma.externalServiceCost.findUniqueOrThrow({ where: { serviceCostId: id } });
      expect(row.category).toBe('Permit');
      // C6a: the reclassification is recorded as a column diff.
      const catDiff = await prisma.auditLogEntry.findFirst({
        where: { tableName: 'ExternalServiceCost', recordId: id, action: 'Update', fieldName: 'category' },
      });
      expect(catDiff?.oldValue).toBe('Service');
      expect(catDiff?.newValue).toBe('Permit');
      // An update that does not mention the category must not clear it.
      const res2 = await api()
        .put(`/api/external-services/${id}`)
        .set(authHeaders(ctx.adminToken))
        .send({ cost: 8 });
      expect(res2.status).toBe(200);
      const row2 = await prisma.externalServiceCost.findUniqueOrThrow({ where: { serviceCostId: id } });
      expect(row2.category).toBe('Permit');
      const costDiff = await prisma.auditLogEntry.findFirst({
        where: { tableName: 'ExternalServiceCost', recordId: id, action: 'Update', fieldName: 'cost' },
      });
      expect(costDiff).toBeTruthy();
      expect(costDiff?.oldValue).not.toBe(costDiff?.newValue);
    });

    it('returns the category on the list endpoint', async () => {
      const res = await api().get(`/api/external-services?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      for (const row of res.body) {
        expect(['Service', 'Travel', 'Permit', 'Other']).toContain(row.category);
      }
    });
  });
});