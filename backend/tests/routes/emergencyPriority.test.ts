import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeNotifications } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.3.1 (matrix row 23): "Emergency automatically sets highest priority."
//
// Proved against live rows on all three write paths that can set the pair: the
// create route, the update route, and the notification convert path (a
// breakdown notification becomes an EM work order). Each of the six cases is
// paired with its inverse so the rule is shown to be narrow as well as real:
// an emergency is forced up, and everything that is not an emergency is left
// exactly as the caller asked.

let flat = '';
let wc = '';
let sup = '';
const woIds: string[] = [];
const notifIds: string[] = [];

async function createWo(type: string, priority: string): Promise<string> {
  const res = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type,
      priority,
      description: `emergency priority probe ${type}/${priority}`,
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
    });
  expect(res.status).toBe(201);
  woIds.push(res.body.workOrderId);
  return res.body.workOrderId;
}

async function convertNotification(breakdownFlag: boolean, priority: string): Promise<string> {
  const notif = await api()
    .post('/api/notifications')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: breakdownFlag ? 'M1' : 'M2',
      priority,
      description: `emergency conversion probe breakdown=${breakdownFlag}`,
      functionalLocationId: flat,
      reportedByUserId: ctx.operatorId,
      breakdownFlag,
    });
  expect(notif.status).toBe(201);
  notifIds.push(notif.body.notificationId);

  const res = await api()
    .post(`/api/notifications/${notif.body.notificationId}/convert-to-wo`)
    .set(authHeaders(ctx.adminToken))
    .send({});
  expect(res.status).toBe(201);
  woIds.push(res.body.workOrderId);
  return res.body.workOrderId;
}

beforeAll(async () => {
  const [loc, center, supervisor] = await Promise.all([
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.workCenter.findFirst({ where: { isDeleted: false } }),
    prisma.user.findFirst({ where: { username: 'supervisor' } }),
  ]);
  if (!loc || !center || !supervisor) {
    throw new Error('seeded location, work center or supervisor not found');
  }
  flat = loc.functionalLocationId;
  wc = center.workCenterId;
  sup = supervisor.userId;
});

afterAll(async () => {
  await purgeWorkOrders(woIds);
  await purgeNotifications(notifIds);
});

describe('SOW 3.3.1 emergency priority (row 23)', () => {
  it('forces an emergency created at Low up to High', async () => {
    const id = await createWo('EM', 'Low');
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.priority).toBe('High');
  });

  it('leaves a non-emergency created at Low at Low', async () => {
    const id = await createWo('CM', 'Low');
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.priority).toBe('Low');
  });

  it('raises an existing order to High when it is changed to EM', async () => {
    const id = await createWo('CM', 'Medium');
    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ type: 'EM' });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('High');
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.priority).toBe('High');
  });

  it('refuses to demote an existing emergency on edit', async () => {
    const id = await createWo('EM', 'High');
    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ priority: 'Low' });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.priority).toBe('High');
  });

  it('still lets a non-emergency be demoted to Low', async () => {
    const id = await createWo('CM', 'High');
    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ priority: 'Low' });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.priority).toBe('Low');
  });

  it('forces a breakdown conversion to EM at High regardless of the notification priority', async () => {
    const id = await convertNotification(true, 'Low');
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.type).toBe('EM');
    expect(stored.priority).toBe('High');
  });

  it('keeps a non-breakdown conversion at the notification priority', async () => {
    const id = await convertNotification(false, 'Low');
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.type).toBe('CM');
    expect(stored.priority).toBe('Low');
  });
});
