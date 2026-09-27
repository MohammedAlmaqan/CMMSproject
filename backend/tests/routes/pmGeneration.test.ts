import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/utils/prisma.js';
import { runSchedulerOnce } from '../../src/services/scheduler.js';
import { api, authHeaders, ctx } from '../helpers.js';

/**
 * SOW 3.4.1 to 3.4.3: what a maintenance plan generates, when, and exactly once.
 *
 * These run against PostgreSQL in CI because every one of them is a claim about
 * database behaviour - a partial unique index, a nested relation, a backfill -
 * that no amount of pure unit testing can establish.
 */

const stamp = randomUUID().slice(0, 8);
const day = 86_400_000;
const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * day);
const daysAhead = (n: number) => new Date(today.getTime() + n * day);

let workCenterId = '';
let taskListId = '';
let functionalLocationId = '';
let equipmentIds: string[] = [];
let meterId = '';
let userId = '';
const planIds = new Set<string>();
const notificationIds: string[] = [];

async function makePlan(data: {
  code: string;
  strategyType?: string;
  intervalValue?: number;
  intervalUnit?: string;
  startDate?: Date;
  endDate?: Date | null;
  callHorizonValue?: number;
  callHorizonUnit?: string;
  priority?: string;
  generatedWorkOrderStatus?: string;
  targets?: { equipmentId?: string; functionalLocationId?: string }[];
  planMeters?: { meterId: string; meterInterval: number }[];
  withNotification?: boolean;
  taskListIdOverride?: string;
}) {
  const planId = randomUUID();
  const targetRows =
    data.targets && data.targets.length > 0
      ? data.targets
      : [{ functionalLocationId }];

  await prisma.maintenancePlan.create({
    data: {
      planId,
      planCode: data.code,
      description: `pm-gen ${data.code}`,
      workCenterId,
      taskListId: data.taskListIdOverride === null ? null : data.taskListIdOverride ?? taskListId,
      strategyType: data.strategyType ?? 'Time',
      intervalValue: data.intervalValue ?? 30,
      intervalUnit: data.intervalUnit ?? 'Days',
      callHorizonValue: data.callHorizonValue ?? 0,
      callHorizonUnit: data.callHorizonUnit ?? 'Days',
      startDate: data.startDate ?? today,
      endDate: data.endDate === undefined ? null : data.endDate,
      activeFlag: true,
      priority: data.priority ?? 'Medium',
      generatedWorkOrderStatus: data.generatedWorkOrderStatus ?? 'Draft',
      createdBy: userId,
      modifiedBy: userId,
      targets: { create: targetRows.map((t) => ({ ...t })) },
      ...(data.planMeters ? { planMeters: { create: data.planMeters } } : {}),
    },
  });
  planIds.add(planId);

  if (data.withNotification) {
    const notificationId = randomUUID();
    notificationIds.push(notificationId);
    await prisma.notification.create({
      data: {
        notificationId,
        notificationNumber: `PMT-${stamp}-${planIds.size}`,
        type: 'M1',
        priority: 'Medium',
        functionalLocationId,
        reportedByUserId: userId,
        description: `Associated notification for ${data.code}`,
        createdBy: userId,
        modifiedBy: userId,
      },
    });
    await prisma.maintenancePlan.update({ where: { planId }, data: { notificationId } });
  }
  return planId;
}

const wosFor = (planId: string) =>
  prisma.workOrder.findMany({ where: { sourcePlanId: planId, isDeleted: false } });

describe('PM generation: SOW 3.4.3 contents', () => {
  beforeAll(async () => {
    const [wcs, tls, fls, eqs, ms, user] = await Promise.all([
      prisma.workCenter.findFirst({ where: { isDeleted: false } }),
      prisma.taskList.findFirst({ where: { isDeleted: false, code: 'PM-PUMP-001' } }),
      prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
      prisma.equipment.findMany({ where: { isDeleted: false }, take: 3 }),
      prisma.equipmentMeter.findFirst({ where: { isDeleted: false, meterName: 'Running Hours' } }),
      prisma.user.findFirst(),
    ]);
    workCenterId = wcs!.workCenterId;
    taskListId = tls!.taskListId;
    functionalLocationId = fls!.functionalLocationId;
    equipmentIds = eqs.map((e) => e.equipmentId);
    meterId = ms!.meterId;
    userId = user!.userId;
  });

  afterAll(async () => {
    for (const planId of planIds) {
      const wos = await prisma.workOrder.findMany({
        where: { sourcePlanId: planId },
        select: { workOrderId: true },
      });
      const woIds = wos.map((w) => w.workOrderId);
      await prisma.workOrderNotifLink.deleteMany({ where: { workOrderId: { in: woIds } } });
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } });
      await prisma.notification.deleteMany({
        where: { description: { contains: 'pm-gen' } },
      });
      await prisma.workOrder.deleteMany({ where: { sourcePlanId: planId } });
      await prisma.maintenancePlanMeter.deleteMany({ where: { planId } });
      await prisma.maintenancePlanTarget.deleteMany({ where: { planId } });
      await prisma.maintenancePlan.deleteMany({ where: { planId } });
    }
  });

  it('copies the plan task list onto the generated work order (row 45)', async () => {
    const planId = await makePlan({ code: `PMG-45-${stamp}` });
    const res = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(201);

    // PM-PUMP-001 carries three operations in the seed.
    const ops = await prisma.workOrderOperation.findMany({
      where: { workOrderId: res.body.workOrderId },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.description)).toEqual([
      'Check coupling alignment',
      'Replace mechanical seal',
      'Lubricate bearings',
    ]);
    // The operations must be workable, not just present.
    expect(ops[0].craftId).toBeTruthy();
    expect(Number(ops[1].plannedHours)).toBe(2);
  });

  it('applies the plan priority and generated status instead of hard-coded values (row 46)', async () => {
    const planId = await makePlan({
      code: `PMG-46-${stamp}`,
      priority: 'High',
      generatedWorkOrderStatus: 'Planned',
    });
    const res = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(201);
    const wo = await prisma.workOrder.findUnique({ where: { workOrderId: res.body.workOrderId } });
    expect(wo!.status).toBe('Planned');
    expect(wo!.priority).toBe('High');
  });

  it('raises the plan associated notification and links it to the work order (row 47)', async () => {
    const planId = await makePlan({ code: `PMG-47-${stamp}`, withNotification: true });
    const res = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(201);
    expect(res.body.notificationId).toBeTruthy();

    const link = await prisma.workOrderNotifLink.findUnique({
      where: { workOrderId_notificationId: { workOrderId: res.body.workOrderId, notificationId: res.body.notificationId } },
    });
    expect(link).not.toBeNull();
    // The notification has to describe this specific job, not just exist.
    const notification = await prisma.notification.findUnique({ where: { notificationId: res.body.notificationId } });
    expect(notification!.status).toBe('Open');
    expect(notification!.description).toContain('PMG-47');
  });

  it('does not generate for a plan with no associated notification', async () => {
    const planId = await makePlan({ code: `PMG-47B-${stamp}`, withNotification: false });
    const res = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(201);
    expect(res.body.notificationId).toBeNull();
  });
});

describe('PM generation: SOW 3.4.3 idempotency', () => {
  beforeAll(async () => {
    const [wcs, tls, fls, user] = await Promise.all([
      prisma.workCenter.findFirst({ where: { isDeleted: false } }),
      prisma.taskList.findFirst({ where: { isDeleted: false, code: 'PM-PUMP-001' } }),
      prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
      prisma.user.findFirst(),
    ]);
    workCenterId = wcs!.workCenterId;
    taskListId = tls!.taskListId;
    functionalLocationId = fls!.functionalLocationId;
    userId = user!.userId;
  });

  afterAll(async () => {
    for (const planId of planIds) {
      const wos = await prisma.workOrder.findMany({ where: { sourcePlanId: planId }, select: { workOrderId: true } });
      const woIds = wos.map((w) => w.workOrderId);
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } });
      await prisma.workOrder.deleteMany({ where: { sourcePlanId: planId } });
      await prisma.maintenancePlanTarget.deleteMany({ where: { planId } });
      await prisma.maintenancePlan.deleteMany({ where: { planId } });
    }
  });

  it('raises one work order per cycle however many times the route is called (row 48)', async () => {
    const planId = await makePlan({ code: `PMG-48-${stamp}` });

    const first = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(first.status).toBe(201);

    // Same calendar day, so the same cycle. This used to create a second work
    // order every call, because the route recorded no plan cycle at all.
    const second = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(second.status).toBe(200);
    expect(second.body.workOrderId).toBe(first.body.workOrderId);
    expect(second.body.alreadyExisted).toBe(true);

    expect(await wosFor(planId)).toHaveLength(1);
  });

  it('does not duplicate work orders when the scheduler runs repeatedly (row 48)', async () => {
    const planId = await makePlan({ code: `PMG-48B-${stamp}` });

    const first = await runSchedulerOnce();
    const after1 = await wosFor(planId);
    expect(after1).toHaveLength(1);

    const second = await runSchedulerOnce();
    const after2 = await wosFor(planId);
    expect(after2).toHaveLength(1);
    expect(second.wosSkipped).toBeGreaterThanOrEqual(1);
    expect(first.wosCreated).toBeGreaterThanOrEqual(1);
    // Counts are global across plans, so the per-plan assertion above is the
    // real one; this only checks the run itself was clean.
    expect(second.errors).toEqual([]);
  });

  it('reuses the existing work order rather than burning a new number', async () => {
    const planId = await makePlan({ code: `PMG-48C-${stamp}` });
    await runSchedulerOnce();
    const [wo] = await wosFor(planId);
    await runSchedulerOnce();
    const [again] = await wosFor(planId);
    expect(again!.woNumber).toBe(wo.woNumber);
  });
});

describe('PM generation: D-10 many assets per plan', () => {
  beforeAll(async () => {
    const [wcs, tls, eqs, user] = await Promise.all([
      prisma.workCenter.findFirst({ where: { isDeleted: false } }),
      prisma.taskList.findFirst({ where: { isDeleted: false, code: 'PM-PUMP-001' } }),
      prisma.equipment.findMany({ where: { isDeleted: false }, take: 3 }),
      prisma.user.findFirst(),
    ]);
    workCenterId = wcs!.workCenterId;
    taskListId = tls!.taskListId;
    equipmentIds = eqs.map((e) => e.equipmentId);
    userId = user!.userId;
  });

  afterAll(async () => {
    for (const planId of planIds) {
      const wos = await prisma.workOrder.findMany({ where: { sourcePlanId: planId }, select: { workOrderId: true } });
      const woIds = wos.map((w) => w.workOrderId);
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } });
      await prisma.workOrder.deleteMany({ where: { sourcePlanId: planId } });
      await prisma.maintenancePlanTarget.deleteMany({ where: { planId } });
      await prisma.maintenancePlan.deleteMany({ where: { planId } });
    }
  });

  it('raises one work order per covered asset for the cycle', async () => {
    const targets = equipmentIds.slice(0, 2).map((equipmentId) => ({ equipmentId }));
    const planId = await makePlan({ code: `PMG-D10-${stamp}`, targets });

    await runSchedulerOnce();
    const wos = await wosFor(planId);
    expect(wos).toHaveLength(2);
    // Each work order is against its own asset, and the assets are distinct.
    expect(new Set(wos.map((w) => w.equipmentId)).size).toBe(2);
    // ...and each is independently idempotent.
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(2);
  });
});

describe('PM generation: SOW 3.4.2 scheduling window', () => {
  beforeAll(async () => {
    const [wcs, tls, fls, ms, user] = await Promise.all([
      prisma.workCenter.findFirst({ where: { isDeleted: false } }),
      prisma.taskList.findFirst({ where: { isDeleted: false, code: 'PM-PUMP-001' } }),
      prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
      prisma.equipmentMeter.findFirst({ where: { isDeleted: false, meterName: 'Running Hours' } }),
      prisma.user.findFirst(),
    ]);
    workCenterId = wcs!.workCenterId;
    taskListId = tls!.taskListId;
    functionalLocationId = fls!.functionalLocationId;
    meterId = ms!.meterId;
    userId = user!.userId;
  });

  afterAll(async () => {
    for (const planId of planIds) {
      const wos = await prisma.workOrder.findMany({ where: { sourcePlanId: planId }, select: { workOrderId: true } });
      const woIds = wos.map((w) => w.workOrderId);
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } });
      await prisma.workOrder.deleteMany({ where: { sourcePlanId: planId } });
      await prisma.maintenancePlanMeter.deleteMany({ where: { planId } });
      await prisma.maintenancePlanTarget.deleteMany({ where: { planId } });
      await prisma.maintenancePlan.deleteMany({ where: { planId } });
    }
  });

  it('does not generate before the call horizon opens (row 43)', async () => {
    // Due on day 0, then every 30 days with a 7-day horizon. Once day 0 is
    // generated, day 30 is 30 days away and must stay closed.
    const planId = await makePlan({
      code: `PMG-43-${stamp}`,
      intervalValue: 30,
      callHorizonValue: 7,
      callHorizonUnit: 'Days',
    });
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(1);
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(1);
  });

  it('stops generating after the plan end date (row 41)', async () => {
    const planId = await makePlan({
      code: `PMG-41-${stamp}`,
      startDate: daysAgo(60),
      endDate: daysAgo(30),
      intervalValue: 30,
    });
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(0);
  });

  it('does not generate before the plan start date', async () => {
    const planId = await makePlan({ code: `PMG-41B-${stamp}`, startDate: daysAhead(10) });
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(0);
  });

  it('generates for a meter strategy once the threshold is reached (rows 40, 42)', async () => {
    // Seeded meter: 4400 on 1 Jun rising to 4500 on 1 Jul, so 100 units accrued.
    const planId = await makePlan({
      code: `PMG-42-${stamp}`,
      strategyType: 'Meter',
      intervalValue: 1,
      planMeters: [{ meterId, meterInterval: 100 }],
      targets: [{ equipmentId: (await prisma.equipmentMeter.findUnique({ where: { meterId } }))!.equipmentId }],
    });
    await runSchedulerOnce();
    const wos = await wosFor(planId);
    expect(wos).toHaveLength(1);
    // The meter cycle is recorded in a form that can be found again.
    expect(wos[0].sourcePlanCycle).toMatch(/^M:/);
  });

  it('does not generate for a meter strategy below its threshold (row 42)', async () => {
    const planId = await makePlan({
      code: `PMG-42B-${stamp}`,
      strategyType: 'Meter',
      intervalValue: 1,
      planMeters: [{ meterId, meterInterval: 5000 }],
      targets: [{ equipmentId: (await prisma.equipmentMeter.findUnique({ where: { meterId } }))!.equipmentId }],
    });
    await runSchedulerOnce();
    expect(await wosFor(planId)).toHaveLength(0);
  });

  it('generates a combined plan on the meter basis when only the meter is due (row 40)', async () => {
    const equipmentId = (await prisma.equipmentMeter.findUnique({ where: { meterId } }))!.equipmentId;
    const planId = await makePlan({
      code: `PMG-40-${stamp}`,
      strategyType: 'Combined',
      // Time basis is in the future, so the meter is the due one.
      startDate: daysAhead(10),
      intervalValue: 30,
      planMeters: [{ meterId, meterInterval: 100 }],
      targets: [{ equipmentId }],
    });
    await runSchedulerOnce();
    const wos = await wosFor(planId);
    expect(wos).toHaveLength(1);
    expect(wos[0].sourcePlanCycle).toMatch(/^M:/);
  });

  it('generates a combined plan on the time basis when only the time is due (row 40)', async () => {
    const equipmentId = (await prisma.equipmentMeter.findUnique({ where: { meterId } }))!.equipmentId;
    const planId = await makePlan({
      code: `PMG-40B-${stamp}`,
      strategyType: 'Combined',
      startDate: today,
      intervalValue: 30,
      // Meter threshold far beyond anything recorded.
      planMeters: [{ meterId, meterInterval: 5000 }],
      targets: [{ equipmentId }],
    });
    await runSchedulerOnce();
    const wos = await wosFor(planId);
    expect(wos).toHaveLength(1);
    expect(wos[0].sourcePlanCycle).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
