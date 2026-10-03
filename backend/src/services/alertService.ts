import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * SOW 3.8: system-generated in-app alerts.
 *
 * Alerts had no home. The only writes were three one-off `systemAlert.create`
 * calls scattered across the scheduler health check, the account-lockout branch
 * and the manual PM-generation route, each spelling out the same row shape. Rows
 * 71 (PM-generation failure) and 72 (new high-priority notification) add two
 * kinds of emitter, and a third copy of the insert would have made the alert
 * table's contract something you infer from three call sites rather than read.
 *
 * This service is that contract. `createAlert` owns the row shape and takes the
 * database client as an argument, so a caller already inside a transaction can
 * thread its transaction client through and keep the alert atomic with the write
 * it describes. `emitAlertToRoles` is the fan-out: one alert per recipient, since
 * `SystemAlert.userId` is a foreign key to a person, not a shared row with a
 * recipient list.
 */

/** The database handle: the root client, or the transaction a caller is inside. */
export type AlertDb = Prisma.TransactionClient | typeof prisma;

export interface AlertInput {
  alertType: string;
  userId: string;
  title: string;
  message: string;
  relatedEntityId?: string | null;
  relatedEntityType?: string | null;
  /** Defaults to the schema's `system`; set it when a person causes the alert. */
  createdBy?: string;
}

export type BroadcastAlertInput = Omit<AlertInput, 'userId'>;

/**
 * Roles that triage alerts. A PM generation that failed overnight and a
 * High-priority fault both have to reach the people who plan and dispatch work,
 * not the person who happened to trigger the event.
 */
export const TRIAGE_ROLES = ['Maintenance Planner', 'Maintenance Supervisor'] as const;

export const ALERT_TYPE_PM_GENERATION_FAILED = 'PM_Generation_Failed';
export const ALERT_TYPE_HIGH_PRIORITY_NOTIFICATION = 'High_Priority_Notification';
export const ALERT_TYPE_WO_ASSIGNED = 'WO_Assigned';
export const ALERT_TYPE_WO_OVERDUE = 'WO_Overdue';

/** Insert one alert row for one recipient. */
export async function createAlert(db: AlertDb, input: AlertInput): Promise<void> {
  await db.systemAlert.create({
    data: {
      alertType: input.alertType,
      userId: input.userId,
      title: input.title,
      message: input.message,
      relatedEntityId: input.relatedEntityId ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      // Left unset for a system event so the column default `system` applies;
      // set for a user-caused alert so the row names the person.
      ...(input.createdBy ? { createdBy: input.createdBy, modifiedBy: input.createdBy } : {}),
    },
  });
}

/**
 * Raise the same alert for every active member of `roles`, plus any `extraUserIds`
 * (the manual PM route includes its caller, who may be an Administrator and so
 * outside the triage roles). Recipients are de-duplicated, so a user who is both
 * named and in a role gets one row, not two.
 *
 * Returns the number of rows written. Nothing is written when no recipient is
 * active: an alert with no recipient is not an alert, it is a log line.
 */
export async function emitAlertToRoles(
  db: AlertDb,
  roles: readonly string[],
  alert: BroadcastAlertInput,
  extraUserIds: readonly string[] = []
): Promise<number> {
  const recipients = await db.user.findMany({
    where: {
      isDeleted: false,
      isActive: true,
      OR: [
        { role: { in: [...roles] } },
        ...(extraUserIds.length > 0 ? [{ userId: { in: [...extraUserIds] } }] : []),
      ],
    },
    select: { userId: true },
  });
  const userIds = [...new Set(recipients.map((r) => r.userId))];
  for (const userId of userIds) {
    await createAlert(db, { ...alert, userId });
  }
  return userIds.length;
}

/**
 * `emitAlertToRoles` for the call sites where the alert is a side effect and the
 * primary write is what the caller asked for. A failed alert must not turn a
 * successfully generated work order into a 500, and it must not stop the rest of
 * a scheduler run. The failure is still recorded, because a silently-undelivered
 * alert is the failure this feature exists to prevent.
 */
export async function emitAlertToRolesSafely(
  db: AlertDb,
  roles: readonly string[],
  alert: BroadcastAlertInput,
  extraUserIds: readonly string[] = [],
  context = 'alert'
): Promise<void> {
  try {
    await emitAlertToRoles(db, roles, alert, extraUserIds);
  } catch (err) {
    logger.error({ err }, `[alerts] failed to emit ${context}`);
  }
}

/**
 * SOW 3.8 (rows 69 and 70): a work-order assignment and an overdue work order.
 *
 * Both alerts reach the same pair: the person the job is assigned to and the
 * supervisor accountable for the work centre's load. Assignment is a supervision
 * act - the person doing the job has to know, and so does the person answerable
 * for the centre. The assigned supervisor is named explicitly because they can
 * sit outside the work centre, so the role query alone would miss them.
 */
export interface WorkOrderAlertRef {
  workOrderId: string;
  woNumber: string;
  workCenterId: string;
  supervisorUserId: string;
}

export async function workOrderAlertRecipients(
  db: AlertDb,
  wo: WorkOrderAlertRef
): Promise<string[]> {
  const recipients = await db.user.findMany({
    where: {
      isDeleted: false,
      isActive: true,
      OR: [
        { userId: wo.supervisorUserId },
        { role: 'Maintenance Supervisor', workCenterId: wo.workCenterId },
      ],
    },
    select: { userId: true },
  });
  return [...new Set(recipients.map((r) => r.userId))];
}

/**
 * `emitAlertToRoles` for a work-order event. Same best-effort contract: the work
 * order write is what the caller asked for, so a failed alert is logged and
 * never fails the write.
 */
export async function emitWorkOrderAlertSafely(
  db: AlertDb,
  wo: WorkOrderAlertRef,
  alert: BroadcastAlertInput,
  context = 'work order alert'
): Promise<void> {
  try {
    const recipients = await workOrderAlertRecipients(db, wo);
    for (const userId of recipients) {
      await createAlert(db, { ...alert, userId });
    }
  } catch (err) {
    logger.error({ err }, `[alerts] failed to emit ${context}`);
  }
}
