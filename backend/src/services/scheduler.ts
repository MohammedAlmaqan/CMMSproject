import cron from 'node-cron';
import os from 'os';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { evaluatePlan, type IntervalUnit, type MeterThreshold, type PlanStrategy } from '../utils/pmDueRules.js';
import { baseCycleKey, generatePmWorkOrder, PmGenerationError } from './pmGeneration.js';

export interface SchedulerRunResult {
  ranAt: string;
  plansEvaluated: number;
  wosCreated: number;
  wosSkipped: number;
  errors: string[];
}

const LOCK_FRESH_MS = 5 * 60 * 1000;
let currentRunRecordId: string | undefined;

export async function acquireStartupLock(): Promise<boolean> {
  const hostname = os.hostname();
  const pid = process.pid;
  const freshAt = new Date(Date.now() - LOCK_FRESH_MS);

  const foreign = await prisma.schedulerRun.findFirst({
    where: {
      isDeleted: false,
      status: 'running',
      heartbeatAt: { gt: freshAt },
      OR: [{ hostname: { not: hostname } }, { pid: { not: pid } }],
    },
  });

  if (foreign) {
    logger.info(`[scheduler] disabled — lock held by ${foreign.pid}@${foreign.hostname}`);
    return false;
  }

  const record = await prisma.schedulerRun.create({
    data: {
      hostname,
      pid,
      status: 'running',
      startedAt: new Date(),
      heartbeatAt: new Date(),
    },
  });
  currentRunRecordId = record.schedulerRunId;
  logger.info(`[scheduler] startup lock acquired (${pid}@${hostname}, run ${record.schedulerRunId})`);
  return true;
}

async function heartbeatLock(): Promise<void> {
  if (!currentRunRecordId) return;
  await prisma.schedulerRun.update({
    where: { schedulerRunId: currentRunRecordId },
    data: { heartbeatAt: new Date() },
  });
}

async function completeRunRecord(result: SchedulerRunResult, status: 'success' | 'error'): Promise<void> {
  if (!currentRunRecordId) return;
  await prisma.schedulerRun.update({
    where: { schedulerRunId: currentRunRecordId },
    data: {
      status,
      completedAt: new Date(),
      plansEvaluated: result.plansEvaluated,
      wosCreated: result.wosCreated,
      wosSkipped: result.wosSkipped,
      errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
    },
  });
}

const BATCH_SIZE = 50;

export interface SchedulerOnceOptions {
  /**
   * Restricts the run to these plan IDs. The background scheduler leaves this
   * unset and evaluates every active plan, which is the production behaviour.
   *
   * This exists because `runSchedulerOnce` reaches for every active plan, and
   * the route tests call it against the shared live database while Vitest runs
   * files in parallel. A plan another file had in flight therefore got picked
   * up, and the creating test only ever deleted work orders matching its own
   * `sourcePlanId` - so one leaked plan became several work orders no test
   * claimed. Naming the plans a test owns removes the possibility.
   */
  onlyPlanIds?: string[];
}

export async function runSchedulerOnce(options: SchedulerOnceOptions = {}): Promise<SchedulerRunResult> {
  const result: SchedulerRunResult = {
    ranAt: new Date().toISOString(),
    plansEvaluated: 0,
    wosCreated: 0,
    wosSkipped: 0,
    errors: [],
  };

  const now = new Date();

  // SOW 3.4.1: Time, Meter and Combined are all schedulable. This previously
  // filtered to Time only and logged the rest as "not yet implemented", so a
  // meter-driven plan never generated a work order at all.
  const plans = await prisma.maintenancePlan.findMany({
    where: {
      isDeleted: false,
      activeFlag: true,
      strategyType: { in: ['Time', 'Meter', 'Combined'] },
      // An empty list must mean "evaluate nothing", not "evaluate everything".
      // `[]` is truthy, so the spread fires and Prisma matches no plan, which
      // is what a test that owns no plans needs.
      ...(options.onlyPlanIds ? { planId: { in: options.onlyPlanIds } } : {}),
    },
    include: {
      equipment: { select: { functionalLocationId: true } },
      taskList: { include: { operations: { where: { isDeleted: false } } } },
      targets: { where: { isDeleted: false }, include: { equipment: true, functionalLocation: true } },
      planMeters: { where: { isDeleted: false } },
    },
  });

  await heartbeatLock();

  const batches: typeof plans[] = [];
  for (let i = 0; i < plans.length; i += BATCH_SIZE) {
    batches.push(plans.slice(i, i + BATCH_SIZE));
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    for (const plan of batch) {
    try {
      result.plansEvaluated += 1;

      // SOW 3.4.3: the last cycle already generated is the baseline for the next
      // one. Read across the plan's own work orders rather than trusting a plan
      // column, so a manually generated cycle also advances the schedule.
      const lastGenerated = await prisma.workOrder.findFirst({
        where: { sourcePlanId: plan.planId, isDeleted: false, sourcePlanCycle: { not: null } },
        orderBy: { createdDate: 'desc' },
        select: { sourcePlanCycle: true },
      });
      const afterCycleKey = baseCycleKey(lastGenerated?.sourcePlanCycle);

      const meters = await loadMeterThresholds(plan);

      const evaluation = evaluatePlan({
        strategy: plan.strategyType as PlanStrategy,
        time: {
          schedule: {
            startDate: plan.startDate,
            endDate: plan.endDate,
            intervalValue: plan.intervalValue,
            intervalUnit: plan.intervalUnit as IntervalUnit,
          },
          // SOW 3.4.2: generation happens inside the plan's call horizon.
          horizon: { value: plan.callHorizonValue, unit: plan.callHorizonUnit as 'Days' | 'Units' },
          afterCycleKey,
        },
        meters,
        now,
      });

      if (!evaluation.due) {
        logger.info(`[scheduler] ${plan.planCode}: not due (${evaluation.explanation})`);
        continue;
      }

      for (const cycle of evaluation.cycles) {
        // D-10: one work order per covered asset. A plan targeting five assets
        // raises five work orders for the cycle, each separately idempotent.
        const targetIds = plan.targets.length > 0 ? plan.targets.map((t) => t.planTargetId) : [null];
        for (const targetId of targetIds) {
          const outcome = await prisma.$transaction((tx) =>
            generatePmWorkOrder(tx, {
              planId: plan.planId,
              cycleKey: cycle.cycleKey,
              targetId,
              basis: cycle.basis,
              dueDate: cycle.dueDate,
              actorUserId: 'scheduler',
            })
          );
          if (outcome.created) {
            result.wosCreated += 1;
            logger.info(
              `[scheduler] ${plan.planCode} cycle ${cycle.cycleKey} -> ${outcome.woNumber}${outcome.notificationId ? ' + notification' : ''}`
            );
          } else {
            result.wosSkipped += 1;
            logger.info(`[scheduler] ${plan.planCode} cycle ${cycle.cycleKey} skipped: ${outcome.skipReason}`);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof PmGenerationError) {
        result.errors.push(`${plan.planCode}: ${err.message}`);
      } else {
        result.errors.push(`${plan.planCode}: ${err instanceof Error ? err.message : String(err)}`);
      }
      logger.error({ err }, `[scheduler] plan ${plan.planCode} failed`);
    }
    }
    await new Promise((r) => setImmediate(r));
    logger.info(`[scheduler] batch ${b + 1}/${batches.length} complete`);
  }

  logger.info(
    `[scheduler] run complete: plansEvaluated=${result.plansEvaluated} wosCreated=${result.wosCreated} wosSkipped=${result.wosSkipped} errors=${result.errors.length}`
  );

  await completeRunRecord(result, result.errors.length > 0 ? 'error' : 'success');

  return result;
}

/**
 * Build the plan's meter thresholds from recorded readings (SOW 3.4.2).
 *
 * A plan covers meters on any of its target assets. Each threshold's baseline is
 * the reading at the last generation for that plan, so a plan tracks its own
 * progress rather than restarting from the meter's first ever reading.
 */
async function loadMeterThresholds(plan: {
  planId: string;
  planMeters: { meterId: string; meterInterval: number }[];
  targets: { equipmentId: string | null }[];
  equipmentId: string | null;
}): Promise<MeterThreshold[]> {
  if (plan.planMeters.length === 0) return [];

  const equipmentIds = [
    ...new Set(
      plan.targets.map((t) => t.equipmentId).filter((id): id is string => Boolean(id))
    ),
  ];
  if (plan.equipmentId && !equipmentIds.includes(plan.equipmentId)) equipmentIds.push(plan.equipmentId);
  if (equipmentIds.length === 0) return [];

  const meters = await prisma.equipmentMeter.findMany({
    where: { equipmentId: { in: equipmentIds }, isDeleted: false },
    include: { readings: { orderBy: { readingDate: 'asc' }, take: 1 } },
  });
  const meterById = new Map(meters.map((m) => [m.meterId, m]));

  const thresholds: MeterThreshold[] = [];
  for (const pm of plan.planMeters) {
    const meter = meterById.get(pm.meterId);
    if (!meter) continue;
    const baseline = await lastReadingAtGeneration(plan.planId, meter.meterId, pm.meterId);
    thresholds.push({
      meterId: pm.meterId,
      threshold: pm.meterInterval,
      lastReading: meter.lastReading,
      lastReadingDate: meter.lastReadingDate,
      baselineReading: baseline ?? meter.readings[0]?.readingValue ?? null,
      firstReading: meter.readings[0]?.readingValue ?? null,
      firstReadingDate: meter.readings[0]?.readingDate ?? null,
    });
  }
  return thresholds;
}

/**
 * The meter reading recorded when this plan last generated against this meter.
 *
 * Meter cycles are keyed `M:<meterId>:<readingValue>`, so the work order for the
 * last cycle names the reading it was raised at. That reading becomes the new
 * baseline, which is what lets a 500-hour plan stay on a 500-hour cadence
 * instead of re-triggering on every subsequent reading.
 */
async function lastReadingAtGeneration(
  planId: string,
  _equipmentId: string,
  meterId: string
): Promise<number | null> {
  const previous = await prisma.workOrder.findFirst({
    where: {
      sourcePlanId: planId,
      isDeleted: false,
      sourcePlanCycle: { startsWith: `M:${meterId}:` },
    },
    orderBy: { createdDate: 'desc' },
    select: { sourcePlanCycle: true },
  });
  const key = previous?.sourcePlanCycle;
  if (!key) return null;
  const parts = key.split('#')[0]?.split(':') ?? [];
  const value = Number(parts[2]);
  return Number.isFinite(value) ? value : null;
}

let scheduledTask: ReturnType<typeof cron.schedule> | undefined;

export function startScheduler(): void {
  const cronExpr = process.env.PM_SCHEDULER_CRON ?? '0 2 * * *';
  scheduledTask = cron.schedule(cronExpr, () => {
    runSchedulerOnce()
      .then((res) => {
        logger.info(`[scheduler] cron run: ${JSON.stringify(res)}`);
      })
      .catch((err) => {
        logger.error({ err }, '[scheduler] cron run failed');
      });
  });
  logger.info(`[scheduler] started cron="${cronExpr}"`);
}