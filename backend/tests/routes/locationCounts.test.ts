import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.1: display open work orders and notification count for each node.
//
// This is the database-backed half of the clause that the matrix held at
// "IMPLEMENTED, NOT VERIFIED": the tree endpoint aggregates own and descendant
// counts in one grouped query, but no test ever executed that query against a
// live database. It must carry both the roll-up (a parent reflects work done
// under its children) and the "open" semantics (closing the work drops the
// count, for the node and for every ancestor).

function findNode(nodes: any[], id: string): any {
  for (const node of nodes) {
    if (node.functionalLocationId === id) {
      return node;
    }
    const found = findNode(node.children ?? [], id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

async function tree() {
  const res = await api().get('/api/functional-locations/tree').set(authHeaders(ctx.adminToken));
  expect(res.status).toBe(200);
  return res.body;
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let parentId = '';
let childId = '';
let workCenterId = '';
let woId = '';
let notificationId = '';

describe('functional location tree counts (SOW 3.1.1)', () => {
  beforeAll(async () => {
    const wcs = await api().get('/api/work-centers').set(authHeaders(ctx.adminToken));
    workCenterId = wcs.body[0].workCenterId;

    // A parent and a child of our own, so the expected totals are exact rather
    // than contaminated by whatever else the seeded database holds.
    parentId = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `CNT-P-${stamp}`,
          description: 'tree count parent',
          locationType: 'Area',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;

    childId = (
      await prisma.functionalLocation.create({
        data: {
          locationCode: `CNT-C-${stamp}`,
          description: 'tree count child',
          parentLocationId: parentId,
          locationType: 'Unit',
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      })
    ).functionalLocationId;
  });

  afterAll(async () => {
    if (notificationId) {
      await prisma.workOrderNotifLink.deleteMany({ where: { notificationId } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: notificationId } });
      await prisma.notification.deleteMany({ where: { notificationId } });
    }
    if (woId) {
      await prisma.workOrderMaterial.deleteMany({ where: { workOrderId: woId } });
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: woId } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } });
      await prisma.workOrder.deleteMany({ where: { workOrderId: woId } });
    }
    await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: childId } });
    await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: parentId } });
  });

  it('reports the roll-up first: a parent reflects open work under its child', async () => {
    // Before any work exists, both nodes read zero.
    let node = findNode(await tree(), childId);
    expect(node).toBeDefined();
    expect(node.openWorkOrderCountTotal).toBe(0);
    expect(node.openNotificationCountTotal).toBe(0);
    expect(findNode(await tree(), parentId).openWorkOrderCountTotal).toBe(0);

    const wo = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description: 'count roll-up work order',
        functionalLocationId: childId,
        workCenterId,
        supervisorUserId: ctx.adminId,
      });
    expect(wo.status).toBe(201);
    woId = wo.body.workOrderId;

    const notif = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M1',
        priority: 'Medium',
        description: 'count roll-up notification',
        functionalLocationId: childId,
        reportedByUserId: ctx.operatorId,
      });
    expect(notif.status).toBe(201);
    notificationId = notif.body.notificationId;

    node = findNode(await tree(), childId);
    // The count fields are the whole clause: own, total, and per entity.
    expect(node.openWorkOrderCount).toBe(1);
    expect(node.openWorkOrderCountTotal).toBe(1);
    expect(node.openNotificationCount).toBe(1);
    expect(node.openNotificationCountTotal).toBe(1);

    const parent = findNode(await tree(), parentId);
    // The parent itself is raised-against by nothing, so its own count is zero;
    // everything appears as the rolled-up descendant total.
    expect(parent.openWorkOrderCount).toBe(0);
    expect(parent.openWorkOrderCountTotal).toBe(1);
    expect(parent.openNotificationCount).toBe(0);
    expect(parent.openNotificationCountTotal).toBe(1);
  });

  it('drops the work order count for the node and every ancestor once the work closes', async () => {
    // The route's own completion transaction would raise an M3 at this same
    // node, which is a separate clause (F0k) and would move the notification
    // count underneath this assertion. Posting the status change directly keeps
    // the counts deterministic: the clause under test is the tree's definition
    // of "open", and Completed is not open.
    await prisma.workOrder.update({ where: { workOrderId: woId }, data: { status: 'Completed' } });

    const child = findNode(await tree(), childId);
    expect(child.openWorkOrderCount).toBe(0);
    expect(child.openWorkOrderCountTotal).toBe(0);
    const parent = findNode(await tree(), parentId);
    expect(parent.openWorkOrderCountTotal).toBe(0);
    // The notification is still open, so only the work order side fell.
    expect(parent.openNotificationCountTotal).toBe(1);
  });

  it('drops the notification count once the notification is completed', async () => {
    await prisma.notification.update({ where: { notificationId: notificationId }, data: { status: 'Completed' } });

    const child = findNode(await tree(), childId);
    expect(child.openNotificationCount).toBe(0);
    expect(child.openNotificationCountTotal).toBe(0);
    const parent = findNode(await tree(), parentId);
    expect(parent.openNotificationCountTotal).toBe(0);
  });

  it('does not count a Cancelled work order as open', async () => {
    const cancelled = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description: 'cancelled work order is not open',
        functionalLocationId: childId,
        workCenterId,
        supervisorUserId: ctx.adminId,
      });
    expect(cancelled.status).toBe(201);

    await prisma.workOrder.update({
      where: { workOrderId: cancelled.body.workOrderId },
      data: { status: 'Cancelled' },
    });

    const child = findNode(await tree(), childId);
    expect(child.openWorkOrderCountTotal).toBe(0);

    await prisma.auditLogEntry.deleteMany({ where: { recordId: cancelled.body.workOrderId } });
    await prisma.workOrder.deleteMany({ where: { workOrderId: cancelled.body.workOrderId } });
  });
});