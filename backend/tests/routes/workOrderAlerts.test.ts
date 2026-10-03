import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';
import { runOverdueSweepOnce } from '../../src/services/overdueSweep.js';
import { ALERT_TYPE_WO_ASSIGNED, ALERT_TYPE_WO_OVERDUE } from '../../src/services/alertService.js';

// SOW 3.8 (matrix rows 69 and 70): an in-app alert when a work order is assigned,
// and when one runs past its planned finish.
//
// Both alerts share the same recipient rule - the assignee and the work centre's
// supervisor - so both are asserted against that rule rather than a headcount.
// Row 70's sweep is per work order, not per run, and the second sweep in these
// tests is the point: a daily job that re-alerted the same overdue order every
// morning would train people to ignore it.

let flat = '';
let wc = '';
let sup = '';
let wcSupId = '';
const woIds: string[] = [];
let baselineOverdueAlertIds: string[] = [];

async function createWo(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'CM',
      priority: 'Medium',
      description: 'work order alert probe',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
      ...overrides,
    });
  expect(res.status).toBe(201);
  woIds.push(res.body.workOrderId);
  return res.body.workOrderId;
}

async function assignedAlerts(workOrderId: string) {
  return prisma.systemAlert.findMany({
    where: { alertType: ALERT_TYPE_WO_ASSIGNED, relatedEntityType: 'WorkOrder', relatedEntityId: workOrderId },
    select: { userId: true },
  });
}

async function overdueAlerts(workOrderId: string) {
  return prisma.systemAlert.findMany({
    where: { alertType: ALERT_TYPE_WO_OVERDUE, relatedEntityType: 'WorkOrder', relatedEntityId: workOrderId },
    select: { userId: true },
  });
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

  // The seeded supervisor has no work centre, so a test supervisor bound to the
  // work centre is what makes the role branch of the recipient rule observable
  // rather than an assumption about the seed.
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const wcSup = await prisma.user.create({
    data: {
      username: `wc-sup-${stamp}`,
      passwordHash: 'x',
      fullName: 'Work Centre Supervisor Probe',
      email: `wc-sup-${stamp}@test.local`,
      role: 'Maintenance Supervisor',
      workCenterId: wc,
      isActive: true,
    },
  });
  wcSupId = wcSup.userId;

  baselineOverdueAlertIds = (
    await prisma.systemAlert.findMany({ where: { alertType: ALERT_TYPE_WO_OVERDUE }, select: { alertId: true } })
  ).map((a) => a.alertId);
});

afterAll(async () => {
  await purgeWorkOrders(woIds);
  // The sweep is global by design, so it can announce demo rows this file never
  // created. Anything that was not there before the file ran is this file's
  // residue and is removed; the baseline is untouched.
  await prisma.systemAlert.deleteMany({
    where: { alertType: ALERT_TYPE_WO_OVERDUE, alertId: { notIn: baselineOverdueAlertIds } },
  });
  await prisma.user.deleteMany({ where: { userId: wcSupId } });
});

describe('SOW 3.8 work order alerts (rows 69 and 70)', () => {
  it('alerts the assignee and the work centre supervisor when a work order is raised', async () => {
    const id = await createWo();
    const alerts = await assignedAlerts(id);
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([sup, wcSupId]));
  });

  it('alerts the work centre supervisor even when the assignee is not one', async () => {
    const id = await createWo({ supervisorUserId: ctx.operatorId });
    const alerts = await assignedAlerts(id);
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([ctx.operatorId, wcSupId]));
  });

  it('does not re-alert when an update leaves the supervisor unchanged', async () => {
    const id = await createWo();
    const before = (await assignedAlerts(id)).length;

    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ supervisorUserId: sup });
    expect(res.status).toBe(200);

    expect((await assignedAlerts(id)).length).toBe(before);
  });

  it('alerts the new assignee when a work order is reassigned', async () => {
    const id = await createWo();
    const before = (await assignedAlerts(id)).length;

    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ supervisorUserId: ctx.operatorId });
    expect(res.status).toBe(200);

    const after = await assignedAlerts(id);
    expect(after.some((a) => a.userId === ctx.operatorId)).toBe(true);
    expect(after.length).toBe(before + 2); // the new assignee plus the work centre supervisor
  });

  it('announces an overdue work order once, then never again', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const id = await createWo({ plannedFinish: past });

    await runOverdueSweepOnce(new Date());
    const first = await overdueAlerts(id);
    expect(new Set(first.map((a) => a.userId))).toEqual(new Set([sup, wcSupId]));

    await runOverdueSweepOnce(new Date());
    expect((await overdueAlerts(id)).length).toBe(first.length);
  });

  it('does not alert a work order whose planned finish is still ahead', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const id = await createWo({ plannedFinish: future });

    await runOverdueSweepOnce(new Date());
    expect((await overdueAlerts(id)).length).toBe(0);
  });

  it('does not alert a work order that is already finished', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const id = await createWo({ plannedFinish: past });
    await prisma.workOrder.update({ where: { workOrderId: id }, data: { status: 'Completed' } });

    await runOverdueSweepOnce(new Date());
    expect((await overdueAlerts(id)).length).toBe(0);
  });

  it('does not alert an open work order with no planned finish', async () => {
    const id = await createWo({ plannedFinish: null });

    await runOverdueSweepOnce(new Date());
    expect((await overdueAlerts(id)).length).toBe(0);
  });
});
