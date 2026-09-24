import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let createdId = '';
let flat = '';
let wc = '';
let sup = '';

describe('work orders routes', () => {
  beforeAll(async () => {
    const [fls, wcs] = await Promise.all([
      api().get('/api/functional-locations').set(authHeaders(ctx.adminToken)),
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
    ]);
    flat = fls.body[0].functionalLocationId;
    wc = wcs.body[0].workCenterId;
    sup = ctx.adminId;
  });

  afterAll(async () => {
    if (createdId) {
      await api().delete(`/api/work-orders/${createdId}`).set(authHeaders(ctx.adminToken)).catch(() => {});
    }
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    type: 'CM',
    priority: 'Medium',
    description: 'test work order',
    functionalLocationId: flat,
    workCenterId: wc,
    supervisorUserId: sup,
    ...overrides,
  });

  it('returns the work order list', async () => {
    const res = await api().get('/api/work-orders').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/work-orders');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Requester role with 403', async () => {
    const res = await api().post('/api/work-orders').set(authHeaders(ctx.viewOnlyToken)).send(body());
    expect(res.status).toBe(403);
  });

  it('creates a work order (Requester+) and writes an audit row', async () => {
    const res = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    expect(res.status).toBe(201);
    createdId = res.body.workOrderId;
    expect(res.body.status).toBe('Draft');
    expect(res.body.woNumber).toMatch(/^WO-/);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({ type: 'NOPE', description: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('type');
  });

  it('rejects an invalid status transition with 400 and accepts a valid one (Technician+)', async () => {
    const bad = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Completed' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('Invalid transition');

    const op = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Planned' });
    expect(op.status).toBe(403);

    const good = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Planned' });
    expect(good.status).toBe(200);
    expect(good.body.status).toBe('Planned');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update', fieldName: 'status' },
      })
    ).toBeGreaterThanOrEqual(1);
  });

  it('updates a work order (Requester+) and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update' },
    });
    const res = await api()
      .put(`/api/work-orders/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated test work order' });
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update' } })
    ).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/work-orders/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a work order (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-orders/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});