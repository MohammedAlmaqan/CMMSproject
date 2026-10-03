import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeNotifications, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let createdId = '';
let flat = '';
// Every notification and work order this file raises goes here, so the teardown
// can reach them through the helpers. `purgeNotifications` also clears the row-72
// alerts a High-priority notification now fans out, which a hand-rolled
// `notification.deleteMany` would leave behind.
const createdNotificationIds: string[] = [];
const createdWorkOrderIds: string[] = [];

describe('notifications routes', () => {
  beforeAll(async () => {
    flat = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!.functionalLocationId;
  });

  afterAll(async () => {
    await purgeWorkOrders(createdWorkOrderIds);
    await purgeNotifications(createdNotificationIds);
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
    createdNotificationIds.push(createdId);
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

  it("scopes the list to a Requester's own notifications (row 64)", async () => {
    const mine = `scoping-mine-${Date.now()}`;
    const theirs = `scoping-theirs-${Date.now()}`;

    const owned = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({ ...body(), description: mine, priority: 'Low' });
    expect(owned.status).toBe(201);
    createdNotificationIds.push(owned.body.notificationId);

    const other = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.adminToken))
      .send({ ...body(), description: theirs, priority: 'Low', reportedByUserId: ctx.adminId });
    expect(other.status).toBe(201);
    createdNotificationIds.push(other.body.notificationId);

    // Search is used rather than paging through the whole table, so the
    // assertion does not depend on where in the list the fixture lands.
    const ownList = await api().get('/api/notifications').query({ search: mine }).set(authHeaders(ctx.operatorToken));
    expect(ownList.status).toBe(200);
    expect(ownList.body.total).toBeGreaterThanOrEqual(1);

    // The Requester cannot see a notification someone else reported, and the
    // count is scoped too (not just the page).
    const otherAsRequester = await api().get('/api/notifications').query({ search: theirs }).set(authHeaders(ctx.operatorToken));
    expect(otherAsRequester.status).toBe(200);
    expect(otherAsRequester.body.total).toBe(0);
    expect(otherAsRequester.body.data).toEqual([]);

    // Every role above Requester, and View-Only, still sees all data.
    const asAdmin = await api().get('/api/notifications').query({ search: theirs }).set(authHeaders(ctx.adminToken));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.total).toBeGreaterThanOrEqual(1);

    const asViewOnly = await api().get('/api/notifications').query({ search: theirs }).set(authHeaders(ctx.viewOnlyToken));
    expect(asViewOnly.status).toBe(200);
    expect(asViewOnly.body.total).toBeGreaterThanOrEqual(1);
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
    createdNotificationIds.push(notificationId);

    const res = await api()
      .post(`/api/notifications/${notificationId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken))
      .send({});
    expect(res.status).toBe(201);
    const workOrderId = res.body.workOrderId;
    createdWorkOrderIds.push(workOrderId);

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } });
    expect(wo.reportedByUserId).toBe(ctx.operatorId);
    // The converter is a different person, and is recorded as such.
    expect(wo.createdBy).toBe(ctx.adminId);
  });

  /**
   * SOW 3.8 (row 72) itself: a High-priority notification must reach the people
   * who triage. Observed against live rows, because the emission is a database
   * write and an in-memory assertion would prove nothing about the alert a
   * supervisor actually sees.
   */
  it('raises an in-app alert to the triage roles for a High-priority notification', async () => {
    const res = await api().post('/api/notifications').set(authHeaders(ctx.operatorToken)).send(body());
    expect(res.status).toBe(201);
    const notificationId = res.body.notificationId;
    createdNotificationIds.push(notificationId);

    const triage = await prisma.user.findMany({
      where: { isDeleted: false, isActive: true, role: { in: ['Maintenance Planner', 'Maintenance Supervisor'] } },
      select: { userId: true },
    });
    expect(triage.length).toBeGreaterThan(0);

    const alerts = await prisma.systemAlert.findMany({
      where: { relatedEntityType: 'Notification', relatedEntityId: notificationId },
    });
    expect(alerts.length).toBe(triage.length);
    for (const alert of alerts) {
      expect(alert.alertType).toBe('High_Priority_Notification');
      expect(alert.isRead).toBe(false);
    }
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set(triage.map((u) => u.userId)));
  });

  /**
   * SOW 3.2.2 "Damages/observations" was the one key field on the clause with
   * nowhere to go. It is nullable because a notification is raised before anyone
   * has inspected the asset, and it is separate from `description` so a later
   * observation cannot overwrite the original report.
   */
  describe('damages and observations', () => {
    it('stays null when the reporter supplies nothing, rather than defaulting to a string', async () => {
      const res = await api()
        .post('/api/notifications')
        .set(authHeaders(ctx.adminToken))
        .send({ ...body(), description: 'no observation' });
      expect(res.status).toBe(201);
      const observationId = res.body.notificationId;
      createdNotificationIds.push(observationId);

      const row = await prisma.notification.findUniqueOrThrow({ where: { notificationId: observationId } });
      expect(row.damagesObservations).toBeNull();
    });

    it('captures an observation on create, separately from the description', async () => {
      const res = await api()
        .post('/api/notifications')
        .set(authHeaders(ctx.adminToken))
        .send({ ...body(), description: 'pump noisy', damagesObservations: 'mechanical seal weeping' });
      expect(res.status).toBe(201);
      const id = res.body.notificationId;
      createdNotificationIds.push(id);

      const row = await prisma.notification.findUniqueOrThrow({ where: { notificationId: id } });
      // The report and the finding are two facts, not one overwritten field.
      expect(row.description).toBe('pump noisy');
      expect(row.damagesObservations).toBe('mechanical seal weeping');
    });

    it('records an observation added later, once somebody has inspected', async () => {
      const created = await api()
        .post('/api/notifications')
        .set(authHeaders(ctx.adminToken))
        .send({ ...body(), description: 'bearing hot' });
      const id = created.body.notificationId;
      createdNotificationIds.push(id);

      const res = await api()
        .put(`/api/notifications/${id}`)
        .set(authHeaders(ctx.adminToken))
        .send({ damagesObservations: 'housing cracked, oil in base' });
      expect(res.status).toBe(200);

      const row = await prisma.notification.findUniqueOrThrow({ where: { notificationId: id } });
      expect(row.damagesObservations).toBe('housing cracked, oil in base');
      expect(row.description).toBe('bearing hot');
    });

    it('returns the observation on the detail read', async () => {
      const created = await api()
        .post('/api/notifications')
        .set(authHeaders(ctx.adminToken))
        .send({ ...body(), description: 'odd noise', damagesObservations: 'play in bearing' });
      const id = created.body.notificationId;
      createdNotificationIds.push(id);

      const res = await api().get(`/api/notifications/${id}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.damagesObservations).toBe('play in bearing');
    });
  });
});
