import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import {
  ALERT_TYPE_WO_OVERDUE,
  emitWorkOrderAlertSafely,
  type WorkOrderAlertRef,
} from './alertService.js';

/**
 * SOW 3.8 (row 70): an in-app alert for work orders that are past their due
 * date.
 *
 * The PM scheduler evaluates maintenance plans; it never looked at work orders
 * that already existed. This sweep is the missing half: it finds every work
 * order that is open and past its planned finish and raises one alert to the
 * assignee and the work centre's supervisor.
 *
 * Idempotency is per work order, not per run. A daily sweep that re-alerted the
 * same overdue job every morning would train people to ignore the alert, so a
 * work order is announced once and stays announced until someone deals with it.
 * The alternative - a reminder cadence - is a notification-preference concern,
 * and per-role opt-out is explicitly waived (row 74).
 */

/** A work order in one of these is finished with, so it cannot be overdue. */
const TERMINAL_STATUSES = ['Completed', 'Closed', 'Cancelled'];

export interface OverdueSweepResult {
  ranAt: string;
  scanned: number;
  alerted: number;
}

export async function runOverdueSweepOnce(now: Date = new Date()): Promise<OverdueSweepResult> {
  const result: OverdueSweepResult = { ranAt: now.toISOString(), scanned: 0, alerted: 0 };

  const overdue = await prisma.workOrder.findMany({
    where: {
      isDeleted: false,
      status: { notIn: TERMINAL_STATUSES },
      plannedFinish: { not: null, lt: now },
    },
    select: {
      workOrderId: true,
      woNumber: true,
      workCenterId: true,
      supervisorUserId: true,
    },
  });
  result.scanned = overdue.length;
  if (overdue.length === 0) return result;

  // One query for every existing overdue alert on this batch, rather than one
  // per work order. "Already announced" is keyed on the work order id, not on
  // the recipient, so a change of assignee does not re-announce a job that has
  // been overdue for a week.
  const existing = await prisma.systemAlert.findMany({
    where: {
      alertType: ALERT_TYPE_WO_OVERDUE,
      relatedEntityType: 'WorkOrder',
      relatedEntityId: { in: overdue.map((wo) => wo.workOrderId) },
      isDeleted: false,
    },
    select: { relatedEntityId: true },
  });
  const alreadyAnnounced = new Set(existing.map((a) => a.relatedEntityId));

  for (const wo of overdue) {
    if (alreadyAnnounced.has(wo.workOrderId)) continue;
    const ref: WorkOrderAlertRef = wo;
    await emitWorkOrderAlertSafely(
      prisma,
      ref,
      {
        alertType: ALERT_TYPE_WO_OVERDUE,
        title: 'Work Order Overdue',
        message: `Work order ${wo.woNumber} is past its planned finish date`,
        relatedEntityId: wo.workOrderId,
        relatedEntityType: 'WorkOrder',
      },
      `overdue work order ${wo.woNumber}`
    );
    result.alerted += 1;
  }

  logger.info(`[overdue] sweep complete: scanned=${result.scanned} alerted=${result.alerted}`);
  return result;
}

export function startOverdueScheduler(): void {
  const cronExpr = process.env.OVERDUE_SWEEP_CRON ?? '0 3 * * *';
  cron.schedule(cronExpr, () => {
    runOverdueSweepOnce()
      .then((res) => logger.info(`[overdue] cron run: ${JSON.stringify(res)}`))
      .catch((err) => logger.error({ err }, '[overdue] cron run failed'));
  });
  logger.info(`[overdue] started cron="${cronExpr}"`);
}
