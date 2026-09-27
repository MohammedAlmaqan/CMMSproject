import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let createdId = '';
let flat = '';

describe('notifications routes', () => {
  beforeAll(async () => {
    flat = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!.functionalLocationId;
  });

  afterAll(async () => {
    if (createdId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { notificationId: createdId } }).catch(() => {});
      await prisma.workOrderNotifLink.deleteMany({ where: { notificationId: createdId } }).catch(() => {});
    }
  });

  const body = () => ({
    type: 'M1',
    priority: 'High',
    description: 'test notification',
    functionalLocationId: flat,
    reportedByUserId: ctx.operatorId,
  });

  it('returns the notification list (envelope shape)', async () => {
    const res = await api().get('/api/notifications').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data) || Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Requester role with 403', async () => {
    const res = await api().post('/api/notifications').set(authHeaders(ctx.viewOnlyToken)).send(body());
    expect(res.status).toBe(403);
  });

  it('creates a notification (Requester+) and writes an audit row', async () => {
    const res = await api().post('/api/notifications').set(authHeaders(ctx.operatorToken)).send(body());
    expect(res.status).toBe(201);
    createdId = res.body.notificationId;
    expect(res.body.notificationNumber).toBeTruthy();
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Notification', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({ type: 'M7', priority: 'Urgent', description: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('type');
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/notifications/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a notification (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/notifications/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Notification', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });

  /**
   * SOW 3.3.3 "Reported By", and the reason it is not the same column as
   * createdBy. This notification is reported by the operator, and the admin is
   * the one who converts it. The corrective work order must remember the person
   * who saw the fault, not the person who typed the conversion -- otherwise the
   * job cannot be traced back to whoever reported it.
   */
  it('carries the notification reporter onto the converted work order', async () => {
    const notif = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.adminToken))
      .send({ ...body(), description: 'reporter carry-over' });
    expect(notif.status).toBe(201);
    const notificationId = notif.body.notificationId;

    const res = await api()
      .post(`/api/notifications/${notificationId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken))
      .send({});
    expect(res.status).toBe(201);
    const workOrderId = res.body.workOrderId;

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } });
    expect(wo.reportedByUserId).toBe(ctx.operatorId);
    // The converter is a different person, and is recorded as such.
    expect(wo.createdBy).toBe(ctx.adminId);

    await prisma.auditLogEntry.deleteMany({ where: { recordId: workOrderId } }).catch(() => {});
    await prisma.workOrderNotifLink.deleteMany({ where: { notificationId } }).catch(() => {});
    await prisma.auditLogEntry.deleteMany({ where: { recordId: notificationId } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { notificationId } }).catch(() => {});
  });
});