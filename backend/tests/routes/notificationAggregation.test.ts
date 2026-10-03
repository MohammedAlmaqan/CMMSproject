import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeNotifications, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.2.2 (row 20): "Multiple notifications aggregated into one work order."
//
// The link table already expressed N notifications to one work order through its
// composite (workOrderId, notificationId) key; what was missing was a path that
// would ever write more than one link per conversion. These cases drive the new
// collection route against live rows. The single-notification route is exercised
// unchanged by notifications.test.ts and notificationLifecycle.test.ts.

const createdNotificationIds: string[] = [];
const createdWorkOrderIds: string[] = [];

let flatId = '';
let otherFlatId = '';

async function raise(args: {
  priority?: string;
  breakdown?: boolean;
  locationId?: string;
  description?: string;
}): Promise<string> {
  const res = await api()
    .post('/api/notifications')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'M1',
      priority: args.priority ?? 'Medium',
      description: args.description ?? 'aggregation fixture',
      functionalLocationId: args.locationId ?? flatId,
      reportedByUserId: ctx.operatorId,
      breakdownFlag: args.breakdown ?? false,
    });
  expect(res.status).toBe(201);
  createdNotificationIds.push(res.body.notificationId);
  return res.body.notificationId;
}

async function aggregate(ids: string[], extra: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/notifications/convert-to-wo')
    .set(authHeaders(ctx.adminToken))
    .send({ notificationIds: ids, ...extra });
  if (res.status === 201) {
    createdWorkOrderIds.push(res.body.workOrderId);
  }
  return res;
}

describe('notification aggregation into one work order (SOW 3.2.2, row 20)', () => {
  beforeAll(async () => {
    const locations = await prisma.functionalLocation.findMany({ where: { isDeleted: false }, take: 3 });
    expect(locations.length).toBeGreaterThanOrEqual(2);
    flatId = locations[0].functionalLocationId;
    otherFlatId = locations[1].functionalLocationId;
  });

  afterAll(async () => {
    await purgeWorkOrders(createdWorkOrderIds);
    await purgeNotifications(createdNotificationIds);
  });

  it('links several notifications to one work order and takes the highest priority', async () => {
    const low = await raise({ priority: 'Low' });
    const high = await raise({ priority: 'High' });
    const medium = await raise({ priority: 'Medium' });

    const res = await aggregate([low, medium, high]);
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('CM');
    // Low + Medium + High -> the highest wins, whatever order they were sent in.
    expect(res.body.priority).toBe('High');
    expect(res.body.breakdownFlag).toBe(false);

    const links = await prisma.workOrderNotifLink.findMany({ where: { workOrderId: res.body.workOrderId } });
    expect(links.map((l) => l.notificationId).sort()).toEqual([low, medium, high].sort());

    const rows = await prisma.notification.findMany({ where: { notificationId: { in: [low, medium, high] } } });
    expect(rows).toHaveLength(3);
    expect(rows.every((n) => n.status === 'Converted')).toBe(true);
  });

  it('is an emergency at High priority when any notification in the set is a breakdown', async () => {
    const plain = await raise({ priority: 'Low' });
    const breakdown = await raise({ priority: 'Medium', breakdown: true });

    const res = await aggregate([plain, breakdown]);
    expect(res.status).toBe(201);
    // SOW 3.3.1 wins over the collected priority: one breakdown makes the job EM.
    expect(res.body.type).toBe('EM');
    expect(res.body.priority).toBe('High');
    expect(res.body.breakdownFlag).toBe(true);
  });

  it('refuses to aggregate notifications from different functional locations', async () => {
    const here = await raise({ locationId: flatId });
    const away = await raise({ locationId: otherFlatId });

    const res = await aggregate([here, away]);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('share a functional location');

    // All-or-nothing: the refused batch wrote nothing at all.
    const rows = await prisma.notification.findMany({ where: { notificationId: { in: [here, away] } } });
    expect(rows.every((n) => n.status === 'Open')).toBe(true);
    expect(await prisma.workOrderNotifLink.count({ where: { notificationId: { in: [here, away] } } })).toBe(0);
  });

  it('uses the shared asset when every notification names it, and leaves it empty when they do not', async () => {
    // Two notifications against the same location, neither naming equipment: the
    // work order must come out location-level rather than pinned to an asset.
    const a = await raise({ description: 'location-level a' });
    const b = await raise({ description: 'location-level b' });

    const res = await aggregate([a, b]);
    expect(res.status).toBe(201);
    expect(res.body.equipmentId).toBeNull();
  });

  it('refuses the whole batch when one notification is already converted', async () => {
    const first = await raise({ description: 'already converted fixture' });
    const second = await raise({ description: 'batch partner fixture' });

    const single = await api()
      .post(`/api/notifications/${first}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken))
      .send({});
    expect(single.status).toBe(201);
    createdWorkOrderIds.push(single.body.workOrderId);

    const res = await aggregate([first, second]);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already converted');

    // The partner was not converted as a side effect of the refused batch.
    const row = await prisma.notification.findUniqueOrThrow({ where: { notificationId: second } });
    expect(row.status).toBe('Open');
  });

  it('refuses a batch that names a notification that does not exist', async () => {
    const real = await raise({ description: 'missing-partner fixture' });
    const res = await aggregate([real, '00000000-0000-0000-0000-000000000000']);
    expect(res.status).toBe(404);

    const row = await prisma.notification.findUniqueOrThrow({ where: { notificationId: real } });
    expect(row.status).toBe('Open');
  });

  it('rejects an empty notificationIds array with 400', async () => {
    const res = await api()
      .post('/api/notifications/convert-to-wo')
      .set(authHeaders(ctx.adminToken))
      .send({ notificationIds: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a below-Planner role with 403', async () => {
    const a = await raise({ description: 'rbac aggregation fixture' });
    const res = await api()
      .post('/api/notifications/convert-to-wo')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ notificationIds: [a] });
    expect(res.status).toBe(403);
  });
});
