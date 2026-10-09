import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { logAuditAction } from '../middleware/audit.js';
import {
  AUDIT_RETENTION_KEY,
  parseRetentionYears,
  retentionCutoff,
} from '../utils/auditRetentionRules.js';

/**
 * SOW 4.3: audit log purging with a configurable retention window.
 *
 * The default (7 years) has existed as a SystemConfig row since the seed was
 * written, but nothing ever read it, so history would have grown forever. This
 * service is the consumer: it reads the setting, deletes entries older than the
 * window, and is run daily by a cron alongside the PM and overdue jobs. The
 * Administrator can also trigger a run on demand through POST /api/audit-log/purge.
 *
 * AuditLogEntry is append-only history with no `isDeleted`, so this is the one
 * deliberate hard delete in the product - the exception clause 4.3 names.
 */

export interface AuditPurgeResult {
  ranAt: string;
  retentionYears: number;
  cutoff: string;
  deleted: number;
}

/** Who ran a manual purge. The unattended scheduler has no user to attribute. */
export interface AuditPurgeActor {
  userId: string;
  ipAddress: string | undefined;
}

/** The configured retention window in years, or the 7-year default. */
export async function getAuditRetentionYears(): Promise<number> {
  const row = await prisma.systemConfig.findFirst({
    where: { key: AUDIT_RETENTION_KEY, isDeleted: false },
    select: { value: true },
  });
  return parseRetentionYears(row?.value);
}

/**
 * Delete audit entries older than the retention window.
 *
 * `actor` is supplied for the manual endpoint and omitted by the scheduler. When
 * present the run is recorded as an `AuditLogEntry` / `Run` row naming the acting
 * user; when absent nothing is recorded, because the audit row's `userId` is a
 * foreign key and the scheduler is not a user (the same reason PM generation
 * reports under the plan's author rather than the literal "scheduler").
 */
export async function purgeAuditLogOnce(
  now: Date = new Date(),
  actor?: AuditPurgeActor
): Promise<AuditPurgeResult> {
  const retentionYears = await getAuditRetentionYears();
  const cutoff = retentionCutoff(retentionYears, now);

  const { count } = await prisma.auditLogEntry.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  if (actor) {
    await logAuditAction({
      table: 'AuditLogEntry',
      recordId: AUDIT_RETENTION_KEY,
      action: 'Run',
      userId: actor.userId,
      ipAddress: actor.ipAddress,
    });
  }

  const result: AuditPurgeResult = {
    ranAt: now.toISOString(),
    retentionYears,
    cutoff: cutoff.toISOString(),
    deleted: count,
  };
  logger.info(`[audit-retention] purge complete: ${JSON.stringify(result)}`);
  return result;
}

/** Daily by default, at 04:00 after the PM (02:00) and overdue (03:00) jobs. */
export function startAuditRetentionScheduler(): void {
  const cronExpr = process.env.AUDIT_RETENTION_CRON ?? '0 4 * * *';
  cron.schedule(cronExpr, () => {
    purgeAuditLogOnce()
      .then((res) => logger.info(`[audit-retention] cron run: ${JSON.stringify(res)}`))
      .catch((err) => logger.error({ err }, '[audit-retention] cron run failed'));
  });
  logger.info(`[audit-retention] started cron="${cronExpr}"`);
}
