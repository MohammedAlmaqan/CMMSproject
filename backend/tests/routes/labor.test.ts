import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let opId = '';
let laborId = '';

describe('labor routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test labor WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
    const craft = (await prisma.craft.findFirst({ where: { isDeleted: false } }))!;
    const op = await prisma.workOrderOperation.create({
      data: {
        workOrderId: woId,
        sequenceNumber: 10,
        description: 'test op',
        craftId: craft.craftId,
        plannedHours: 1,
        numberOfTechnicians: 1,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    opId = op.operationId;
  });

  afterAll(async () => {
    if (laborId) {
      await prisma.laborEntry.deleteMany({ where: { laborEntryId: laborId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: laborId } }).catch(() => {});
    }
    await prisma.workOrderOperation.deleteMany({ where: { operationId: opId } }).catch(() => {});
    await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } }).catch(() => {});
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  it('returns the labor entries for a work order', async () => {
    const res = await api().get(`/api/labor`).set(authHeaders(ctx.adminToken)).query({ workOrderId: woId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.operatorToken))
      .send({ operationId: opId, userId: ctx.adminId, hoursWorked: 1 });
    expect(res.status).toBe(403);
  });

  it('creates a labor entry (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.adminToken))
      .send({ operationId: opId, userId: ctx.operatorId, hoursWorked: 2, notes: 'test' });
    expect(res.status).toBe(201);
    laborId = res.body.laborEntryId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'LaborEntry', recordId: laborId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.adminToken))
      .send({ operationId: opId, userId: ctx.adminId, hoursWorked: -1 });
    expect(res.status).toBe(400);
  });

  it('hard-deletes a labor entry (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/labor/${laborId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'LaborEntry', recordId: laborId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});