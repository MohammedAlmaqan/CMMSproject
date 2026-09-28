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

  it('rejects a partial update that would leave a meter plan with no threshold', async () => {
    // A partial update cannot satisfy the create-time rules on its own. Before
    // planPatchIssues, switching strategy to Meter passed every field check and
    // produced a plan that can never come due - which from the outside is
    // indistinguishable from a plan that simply is not due yet.
    const res = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ strategyType: 'Meter' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires at least one meter threshold/);
    // Nothing may be written on the way to the rejection.
    expect((await prisma.maintenancePlan.findUnique({ where: { planId: createdId } }))?.strategyType).toBe('Time');
  });

  it('accepts the same switch once the patch carries the thresholds, and restores the plan', async () => {
    const meters = await api().get('/api/equipment-meters').set(authHeaders(ctx.adminToken));
    const meterId = meters.body[0].meterId;
    expect(meterId).toBeTruthy();

    const on = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ strategyType: 'Meter', planMeters: [{ meterId, meterInterval: 500 }] });
    expect(on.status).toBe(200);
    expect(on.body.strategyType).toBe('Meter');
    expect(
      await prisma.maintenancePlanMeter.count({ where: { planId: createdId, meterId, isDeleted: false } })
    ).toBe(1);

    // And back to a pure Time plan, which means dropping the threshold again.
    const off = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ strategyType: 'Time', planMeters: [] });
    expect(off.status).toBe(200);
    expect(off.body.strategyType).toBe('Time');
    expect(await prisma.maintenancePlanMeter.count({ where: { planId: createdId, isDeleted: false } })).toBe(0);
  });

  it('rejects a partial update that would put endDate before startDate', async () => {
    const plan = await prisma.maintenancePlan.findUnique({ where: { planId: createdId } });
    const res = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ endDate: new Date((plan!.startDate.getTime() - 86400000)).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endDate cannot be before startDate/);
  });

  it('rejects a partial update that would strip the last target', async () => {
    const res = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ functionalLocationId: null, equipmentId: null, targets: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must target at least one/);
  });

  it('still allows an unrelated edit without resending the plan', async () => {
    // The cross-field rules must not fire for a patch that does not touch the
    // fields they depend on, or editing a priority would demand the world.
    const res = await api()
      .put(`/api/maintenance-plans/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ priority: 'High' });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('High');
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