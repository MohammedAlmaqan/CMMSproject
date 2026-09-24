import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const planCode = `PLAN-T${stamp}`;
let createdId = '';
let createdWoId = '';
let workCenterId = '';
let taskListId = '';
let functionalLocationId = '';

describe('maintenance plans routes', () => {
  beforeAll(async () => {
    const [wcs, tls, fls] = await Promise.all([
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
      api().get('/api/task-lists').set(authHeaders(ctx.adminToken)),
      api().get('/api/functional-locations').set(authHeaders(ctx.adminToken)),
    ]);
    workCenterId = wcs.body[0].workCenterId;
    taskListId = tls.body[0].taskListId;
    functionalLocationId = fls.body[0].functionalLocationId;
  });

  afterAll(async () => {
    if (createdWoId) {
      await api().delete(`/api/work-orders/${createdWoId}`).set(authHeaders(ctx.adminToken)).catch(() => {});
    }
    if (createdId) {
      await prisma.maintenancePlan.deleteMany({ where: { planId: createdId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } }).catch(() => {});
    }
  });

  const planBody = () => ({
    planCode,
    description: 'test plan',
    functionalLocationId,
    workCenterId,
    taskListId,
    strategyType: 'Time',
    intervalValue: 30,
    intervalUnit: 'Days',
    startDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
  });

  it('returns the maintenance plan list', async () => {
    const res = await api().get('/api/maintenance-plans').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/maintenance-plans');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/maintenance-plans')
      .set(authHeaders(ctx.viewOnlyToken))
      .send(planBody());
    expect(res.status).toBe(403);
  });

  it('rejects a malformed body with a zod-derived 400 (F1 closed)', async () => {
    const res = await api()
      .post('/api/maintenance-plans')
      .set(authHeaders(ctx.operatorToken))
      .send({ planCode, description: 'test plan' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workCenterId');
  });

  it('maps P2003 to a 400 when a referenced entity does not exist (5.4 finding)', async () => {
    const res = await api()
      .post('/api/maintenance-plans')
      .set(authHeaders(ctx.operatorToken))
      .send({ ...planBody(), planCode: `${planCode}-FK`, taskListId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Referenced entity not found');
  });

  it('creates a maintenance plan (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/maintenance-plans')
      .set(authHeaders(ctx.operatorToken))
      .send(planBody());
    expect(res.status).toBe(201);
    createdId = res.body.planId;
    expect(res.body.planCode).toBe(planCode);
    const audit = await prisma.auditLogEntry.count({
      where: { tableName: 'MaintenancePlan', recordId: createdId, action: 'Create' },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('updates a maintenance plan and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'MaintenancePlan', recordId: createdId, action: 'Update' },
    });
    const res = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated test plan' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated test plan');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'MaintenancePlan', recordId: createdId, action: 'Update' },
      })
    ).toBe(before + 1);
  });

  it('generates a work order as Maintenance Planner+ and writes a WorkOrder audit row', async () => {
    const op = await api().post(`/api/maintenance-plans/${createdId}/generate-wo`).set(authHeaders(ctx.operatorToken));
    expect(op.status).toBe(403);
    const res = await api().post(`/api/maintenance-plans/${createdId}/generate-wo`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(201);
    createdWoId = res.body.workOrderId;
    expect(res.body.woNumber).toBeTruthy();
    const audit = await prisma.auditLogEntry.count({
      where: { tableName: 'WorkOrder', recordId: createdWoId, action: 'Create' },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/maintenance-plans/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('run-scheduler is Administrator-only', async () => {
    const op = await api().post('/api/maintenance-plans/run-scheduler').set(authHeaders(ctx.operatorToken)).send({});
    expect(op.status).toBe(403);
    const res = await api().post('/api/maintenance-plans/run-scheduler').set(authHeaders(ctx.adminToken)).send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plansEvaluated');
    expect(res.body).toHaveProperty('wosCreated');
  });

  it('soft-deletes a maintenance plan (Supervisor+) and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'MaintenancePlan', recordId: createdId, action: 'Delete' },
    });
    const res = await api().delete(`/api/maintenance-plans/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'MaintenancePlan', recordId: createdId, action: 'Delete' },
      })
    ).toBe(before + 1);
  });
});