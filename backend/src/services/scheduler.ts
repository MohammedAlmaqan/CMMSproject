import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { generateWoNumber } from '../utils/sequence.js';

export interface SchedulerRunResult {
  ranAt: string;
  plansEvaluated: number;
  wosCreated: number;
  wosSkipped: number;
  errors: string[];
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function intervalDays(value: number, unit: string): number {
  if (unit === 'Weeks') return value * 7;
  if (unit === 'Months') return value * 30;
  return value;
}

export async function runSchedulerOnce(): Promise<SchedulerRunResult> {
  const result: SchedulerRunResult = {
    ranAt: new Date().toISOString(),
    plansEvaluated: 0,
    wosCreated: 0,
    wosSkipped: 0,
    errors: [],
  };

  const todayIso = isoDay(new Date());

  const deferred = await prisma.maintenancePlan.count({
    where: {
      isDeleted: false,
      activeFlag: true,
      strategyType: { in: ['Meter', 'Combined'] },
    },
  });
  if (deferred > 0) {
    console.log(`[scheduler] ${deferred} meter-strategy plans deferred to G4b-2`);
  }

  const plans = await prisma.maintenancePlan.findMany({
    where: { isDeleted: false, activeFlag: true, strategyType: 'Time' },
    include: {
      equipment: { select: { functionalLocationId: true } },
      taskList: { include: { operations: true } },
    },
  });

  for (const plan of plans) {
    try {
      result.plansEvaluated += 1;
      const start = new Date(plan.startDate);
      const startIso = isoDay(start);
      if (startIso > todayIso) continue;

      const gapDays = enumDaysBetweenUtc(start, new Date());
      const stepDays = intervalDays(plan.intervalValue, plan.intervalUnit);
      const n = Math.max(0, Math.floor(gapDays / stepDays));
      const cycleKey = isoDay(addDaysUtc(start, n * stepDays));
      if (cycleKey > todayIso) continue;

      let functionalLocationId = plan.functionalLocationId;
      if (!functionalLocationId && plan.equipmentId) {
        functionalLocationId = plan.equipment?.functionalLocationId ?? null;
      }
      if (!functionalLocationId) {
        result.errors.push(`${plan.planCode}: no functional location`);
        continue;
      }

      const woNumber = await generateWoNumber();
      try {
        await prisma.$transaction(async (tx) => {
          const wo = await tx.workOrder.create({
            data: {
              woNumber,
              type: 'PM',
              priority: 'Medium',
              status: 'Draft',
              functionalLocationId,
              equipmentId: plan.equipmentId,
              description: plan.description,
              workCenterId: plan.workCenterId,
              supervisorUserId: plan.createdBy,
              sourcePlanId: plan.planId,
              sourcePlanCycle: cycleKey,
              breakdownFlag: false,
              createdBy: 'scheduler',
              modifiedBy: 'scheduler',
            },
          });
          for (const op of (plan as any).taskList?.operations ?? []) {
            await tx.workOrderOperation.create({
              data: {
                workOrderId: wo.workOrderId,
                sequenceNumber: op.sequenceNumber,
                description: op.description,
                craftId: op.craftId,
                plannedHours: op.plannedHours,
                numberOfTechnicians: op.numberOfTechnicians,
                createdBy: 'scheduler',
                modifiedBy: 'scheduler',
              },
            });
          }
        });
        result.wosCreated += 1;
      } catch (err: any) {
        if (err && err.code === 'P2002') {
          console.log(`[scheduler] ${plan.planCode} cycle ${cycleKey} skipped (idempotent)`);
          result.wosSkipped += 1;
        } else {
          result.errors.push(`${plan.planCode}: ${err?.message ?? String(err)}`);
          console.error(`[scheduler] plan ${plan.planCode} failed:`, err);
        }
      }
    } catch (err: any) {
      result.errors.push(`${plan.planCode}: ${err?.message ?? String(err)}`);
      console.error(`[scheduler] plan ${plan.planCode} threw:`, err);
    }
  }

  console.log(
    `[scheduler] run complete: plansEvaluated=${result.plansEvaluated} wosCreated=${result.wosCreated} wosSkipped=${result.wosSkipped} errors=${result.errors.length}`
  );

  return result;
}

function enumDaysBetweenUtc(a: Date, b: Date): number {
  const msPerDay = 86400000;
  const aMs = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMs = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((bMs - aMs) / msPerDay);
}

let scheduledTask: ReturnType<typeof cron.schedule> | undefined;

export function startScheduler(): void {
  const cronExpr = process.env.PM_SCHEDULER_CRON ?? '0 2 * * *';
  scheduledTask = cron.schedule(cronExpr, () => {
    runSchedulerOnce()
      .then((res) => {
        console.log(`[scheduler] cron run: ${JSON.stringify(res)}`);
      })
      .catch((err) => {
        console.error('[scheduler] cron run failed', err);
      });
  });
  console.log(`[scheduler] started cron="${cronExpr}"`);
}