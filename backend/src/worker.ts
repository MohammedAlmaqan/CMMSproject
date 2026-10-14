import { pathToFileURL } from 'node:url';
import { acquireStartupLock, runSchedulerOnce, startScheduler } from './services/scheduler.js';
import { startOverdueScheduler } from './services/overdueSweep.js';
import { startAuditRetentionScheduler } from './services/auditRetention.js';
import { prisma } from './utils/prisma.js';
import { logger } from './utils/logger.js';

// Background-worker entry point (SOW 5.1, C11). The PM, overdue and audit-retention
// cron jobs run here, in their own process, instead of inside the API process. The
// API (backend/src/index.ts) is therefore a stateless tier that can be scaled across
// instances without each instance starting its own copy of the schedulers; exactly
// one worker is expected, and the startup lock keeps a second one idle.

/** A handle that stops the cron jobs the worker started. */
export interface CronHandle {
  stop: () => void;
}

/**
 * The worker's dependencies, injected so the startup decision can be tested without
 * a database or real cron.
 */
export interface WorkerHooks {
  /** Take the SchedulerRun advisory lock; false means another worker holds it. */
  acquireLock: () => Promise<boolean>;
  /** The catch-up PM run performed once at boot, before cron takes over. */
  runStartupSweep: () => Promise<unknown>;
  /** Start the cron jobs and return a handle that stops them on shutdown. */
  startCrons: () => CronHandle;
}

/**
 * Take the lock, run the catch-up sweep, then start the crons. Returns the cron
 * handle, or null when another worker already holds the lock (in which case nothing
 * is started and the caller should exit cleanly).
 *
 * A failed catch-up run does not prevent the crons from being scheduled: the failure
 * has already been logged and alerted inside `runSchedulerOnce`, and the next tick
 * can still succeed.
 */
export async function bootstrapWorker(hooks: WorkerHooks): Promise<CronHandle | null> {
  const acquired = await hooks.acquireLock();
  if (!acquired) {
    logger.warn('[worker] startup lock held by another worker — background jobs not started');
    return null;
  }

  await hooks.runStartupSweep().catch((err) => logger.error({ err }, '[worker] startup run failed'));

  const crons = hooks.startCrons();
  logger.info('[worker] background worker started (PM, overdue, audit-retention)');
  return crons;
}

async function main(): Promise<void> {
  const crons = await bootstrapWorker({
    acquireLock: acquireStartupLock,
    runStartupSweep: () => runSchedulerOnce(),
    startCrons: () => {
      const tasks = [startScheduler(), startOverdueScheduler(), startAuditRetentionScheduler()];
      return { stop: () => tasks.forEach((task) => task.stop()) };
    },
  });

  if (!crons) {
    await prisma.$disconnect();
    process.exit(0);
    return;
  }

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info(`[worker] ${signal} received — stopping background jobs`);
    crons.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Run only when this file is the process entry point, so importing it (for example
// from a test) does not start the schedulers or take the lock.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void main().catch(async (err) => {
    logger.error({ err }, '[worker] fatal startup error');
    await prisma.$disconnect();
    process.exit(1);
  });
}
