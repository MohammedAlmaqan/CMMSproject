import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/utils/prisma.js';
import { runSchedulerOnce } from '../../src/services/scheduler.js';
import { api, authHeaders, ctx, purgeMaintenancePlans } from '../helpers.js';

/**
 * SOW 3.8 (matrix row 71): "In-app alert: PM generation failure".
 *
 * Before this, a manual generation that failed answered the caller with a 4xx and
 * the scheduled run logged the failure, but nobody who could act on it was told.
 * Row 71 is about the alert, so both cases are asserted against live rows: the
 * failing insert is observed, not assumed from a return value.
 *
 * The failure is produced by a plan whose `generatedWorkOrderStatus` is outside
 * the pair the SOW allows. The create route validates that field, so the fixture
 * is written straight through Prisma - the point is the generation path's
 * behaviour once an invalid value is already stored, which is a real state after a
 * database edit or a restored backup.
 */

const stamp = randomUUID().slice(0, 8);

let workCenterId = '';
let taskListId = '';
let functionalLocationId = '';
let userId = '';
const planIds = new Set<string>();

async function makeInvalidPlan(code: string): Promise<string> {
  const planId = randomUUID();
  await prisma.maintenancePlan.create({
    data: {
      planId,
      planCode: code,
      description: `pm alert probe ${code}`,
      workCenterId,
      taskListId,
      strategyType: 'Time',
      intervalValue: 30,
      intervalUnit: 'Days',
      callHorizonValue: 0,
      callHorizonUnit: 'Days',
      // In the past, so the scheduler evaluates the plan as due and reaches the
      // generation step that fails.
      startDate: new Date(Date.now() - 86_400_000),
      activeFlag: true,
      priority: 'Medium',
      generatedWorkOrderStatus: 'Bogus',
      createdBy: userId,
      modifiedBy: userId,
      targets: { create: [{ functionalLocationId }] },
    },
  });
  planIds.add(planId);
  return planId;
}

const triageUsers = () =>
  prisma.user.findMany({
    where: {
      isDeleted: false,
      isActive: true,
      role: { in: ['Maintenance Planner', 'Maintenance Supervisor'] },
    },
    select: { userId: true },
  });

const failureAlerts = (planId: string) =>
  prisma.systemAlert.findMany({
    where: { alertType: 'PM_Generation_Failed', relatedEntityType: 'MaintenancePlan', relatedEntityId: planId },
  });

describe('PM generation failure alerts (SOW 3.8, row 71)', () => {
  beforeAll(async () => {
    const [wc, tl, fl, user] = await Promise.all([
      prisma.workCenter.findFirst({ where: { isDeleted: false } }),
      prisma.taskList.findFirst({ where: { isDeleted: false } }),
      prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
      prisma.user.findFirst(),
    ]);
    if (!wc || !tl || !fl || !user) throw new Error('seeded work center, task list, location or user not found');
    workCenterId = wc.workCenterId;
    taskListId = tl.taskListId;
    functionalLocationId = fl.functionalLocationId;
    userId = user.userId;
  });

  afterAll(async () => {
    for (const planId of planIds) {
      await purgeMaintenancePlans([planId]);
    }
  });

  it('alerts the triage roles and the caller when a manual generation fails', async () => {
    const planId = await makeInvalidPlan(`PMALERT-M-${stamp}`);

    const res = await api()
      .post(`/api/maintenance-plans/${planId}/generate-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS');

    const [triage, alerts] = await Promise.all([triageUsers(), failureAlerts(planId)]);
    // The planners and supervisors who triage, plus the caller who pressed the
    // button (an Administrator here, so outside the triage roles).
    const expected = new Set([...triage.map((u) => u.userId), ctx.adminId]);
    expect(new Set(alerts.map((a) => a.userId))).toEqual(expected);
    expect(alerts.every((a) => a.isRead === false)).toBe(true);
  });

  it('alerts the triage roles when the scheduler fails a plan', async () => {
    const planId = await makeInvalidPlan(`PMALERT-S-${stamp}`);

    const result = await runSchedulerOnce({ onlyPlanIds: [planId] });
    expect(result.errors.some((e) => e.includes('Bogus'))).toBe(true);

    const [triage, alerts] = await Promise.all([triageUsers(), failureAlerts(planId)]);
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set(triage.map((u) => u.userId)));
    expect(alerts.length).toBeGreaterThan(0);
  });
});
