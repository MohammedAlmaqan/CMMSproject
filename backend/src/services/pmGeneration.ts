import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { generateWoNumber, generateNotifNumber } from '../utils/sequence.js';
import { logger } from '../utils/logger.js';

/**
 * SOW 3.4.3: generation of a PM work order, and rows 3.4.1 to 3.4.3 that describe
 * what the generated work order must contain.
 *
 * This exists because generation was implemented twice, in `services/scheduler.ts`
 * and in the `POST /:id/generate-wo` route, and the two copies had drifted into
 * different products. Both hard-coded `priority: 'Medium'` and `status: 'Draft'`
 * instead of reading the plan, only the scheduler recorded `sourcePlanId` and
 * `sourcePlanCycle`, and neither raised the plan's associated notification. A
 * planner pressing the button and the nightly job therefore produced work orders
 * that a reviewer could not tell apart on the face of the record, which is the
 * practical meaning of "SOW 3.4.3".
 *
 * Both callers now go through `generatePmWorkOrder`, so a manual generation and a
 * scheduled one are identical in every field the SOW names.
 *
 * ## Idempotency
 *
 * `WorkOrder` carries a partial unique index on `(sourcePlanId, sourcePlanCycle)`
 * for non-deleted rows, so one plan cycle can produce at most one work order. A
 * D-10 plan covers several assets, so the stored cycle key is suffixed with the
 * target: a fleet-wide plan raises one work order per asset per cycle, and each is
 * separately idempotent. `baseCycleKey` strips that suffix so the due-date engine
 * still sees a plain cycle day when it resolves the next cycle to generate.
 */

export type PmCycleBasis = 'Time' | 'Meter';

export interface GeneratePmWorkOrderInput {
  planId: string;
  /** Cycle identity from `utils/pmDueRules`, e.g. '2026-04-01' or 'M:M-1:4500'. */
  cycleKey: string;
  /** Suffix identifying which D-10 target this work order is for. */
  targetId?: string | null;
  basis: PmCycleBasis;
  /** Date the work is due; recorded on the work order for planning. */
  dueDate?: Date | null;
  /** Audit identity: a user id, or 'scheduler'. */
  actorUserId: string;
  /** Overrides the plan's creator as supervisor. */
  supervisorUserId?: string | null;
}

export interface GeneratePmWorkOrderResult {
  workOrderId: string | null;
  woNumber: string | null;
  notificationId: string | null;
  /** False when an active work order already exists for this plan cycle. */
  created: boolean;
  skipReason: string | null;
}

export class PmGenerationError extends Error {
  constructor(
    message: string,
    readonly code: 'PLAN_NOT_FOUND' | 'NO_TARGET' | 'NO_FUNCTIONAL_LOCATION' | 'INVALID_STATUS' | 'INVALID_PRIORITY'
  ) {
    super(message);
    this.name = 'PmGenerationError';
  }
}

/** Strips a `#target` suffix so the engine sees a plain cycle day. */
export function baseCycleKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const base = stored.split('#')[0]?.trim() ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(base) ? base : null;
}

/** The value stored in `WorkOrder.sourcePlanCycle`. */
export function storedCycleKey(cycleKey: string, targetId?: string | null): string {
  return targetId ? `${cycleKey}#${targetId}` : cycleKey;
}

const ALLOWED_STATUSES = new Set(['Draft', 'Planned']);
const ALLOWED_PRIORITIES = new Set(['High', 'Medium', 'Low']);

/**
 * Generate one work order for one plan cycle against one target.
 *
 * `db` is threaded in so the caller owns the transaction boundary: the scheduler
 * wraps a whole plan, the route wraps a single generation. Passing a transaction
 * client is what keeps a work order, its operations and its notification
 * all-or-nothing.
 */
export async function generatePmWorkOrder(
  db: Prisma.TransactionClient | typeof prisma,
  input: GeneratePmWorkOrderInput
): Promise<GeneratePmWorkOrderResult> {
  const plan = await db.maintenancePlan.findFirst({
    where: { planId: input.planId, isDeleted: false },
    include: {
      // Selected up front so the pre-D-10 fallback below resolves the asset's
      // functional location from the same query rather than a second one that
      // can come back empty and leave the plan looking untargetable.
      equipment: true,
      targets: { include: { equipment: true, functionalLocation: true } },
      taskList: { include: { operations: { where: { isDeleted: false }, orderBy: { sequenceNumber: 'asc' } } } },
      notification: true,
    },
  });

  if (!plan) {
    throw new PmGenerationError(`Maintenance plan ${input.planId} not found`, 'PLAN_NOT_FOUND');
  }

  // SOW 3.4.3 names the generated status as the planner's choice. A value outside
  // the pair the SOW defines is rejected rather than coerced, so a bad edit
  // surfaces here instead of producing a work order nobody triaged.
  const status = plan.generatedWorkOrderStatus;
  if (!ALLOWED_STATUSES.has(status)) {
    throw new PmGenerationError(
      `Plan ${plan.planCode} has generatedWorkOrderStatus '${status}'; SOW 3.4.3 allows Draft or Planned`,
      'INVALID_STATUS'
    );
  }
  const priority = plan.priority;
  if (!ALLOWED_PRIORITIES.has(priority)) {
    throw new PmGenerationError(
      `Plan ${plan.planCode} has priority '${priority}'; SOW 3.4.1 allows High, Medium or Low`,
      'INVALID_PRIORITY'
    );
  }

  const targets = plan.targets.length > 0
    ? plan.targets
    : // Plans created before D-10 have no target rows; the legacy single-asset
      // columns are still authoritative for them.
      [
        {
          planTargetId: null as string | null,
          equipmentId: plan.equipmentId,
          functionalLocationId: plan.functionalLocationId,
          equipment: plan.equipmentId ? plan.equipment : null,
          functionalLocation: null as null,
        },
      ];

  const selected = input.targetId ? targets.filter((t) => t.planTargetId === input.targetId) : targets;
  if (selected.length === 0) {
    throw new PmGenerationError(
      `Plan ${plan.planCode} has no target '${input.targetId}'`,
      'NO_TARGET'
    );
  }

  const created: GeneratePmWorkOrderResult[] = [];
  for (const target of selected) {
    const result = await generateOne(db, plan, target, input, status, priority);
    created.push(result);
  }
  const first = created[0];
  return {
    workOrderId: first?.workOrderId ?? null,
    woNumber: first?.woNumber ?? null,
    notificationId: created.find((c) => c.notificationId)?.notificationId ?? null,
    created: created.some((c) => c.created),
    skipReason: created.every((c) => !c.created) ? (created[0]?.skipReason ?? 'nothing to generate') : null,
  };
}

type PlanWithRelations = Prisma.MaintenancePlanGetPayload<{
  include: {
    equipment: true;
    targets: { include: { equipment: true; functionalLocation: true } };
    taskList: { include: { operations: true } };
    notification: true;
  };
}>;

type PlanTargetWithAssets = {
  planTargetId: string | null;
  equipmentId: string | null;
  functionalLocationId: string | null;
  equipment: PlanWithRelations['equipment'];
  functionalLocation: PlanWithRelations['targets'][number]['functionalLocation'];
};

async function generateOne(
  db: Prisma.TransactionClient | typeof prisma,
  plan: PlanWithRelations,
  target: PlanTargetWithAssets,
  input: GeneratePmWorkOrderInput,
  status: string,
  priority: string
): Promise<GeneratePmWorkOrderResult> {
  // D-10: the target names the asset. A functional-location target has no
  // equipment; an equipment target inherits its own functional location.
  const functionalLocationId = target.functionalLocationId ?? target.equipment?.functionalLocationId ?? null;
  if (!functionalLocationId) {
    throw new PmGenerationError(
      `Plan ${plan.planCode}: target has neither a functional location nor equipment with one`,
      'NO_FUNCTIONAL_LOCATION'
    );
  }
  const equipmentId = target.equipmentId ?? null;

  const cycleKey = storedCycleKey(input.cycleKey, target.planTargetId);

  // Idempotency, checked before doing any work. The unique index below is the
  // real guarantee and covers concurrent runs; this read is the fast path that
  // keeps a repeated run from burning a work-order number.
  const existing = await db.workOrder.findFirst({
    where: { sourcePlanId: plan.planId, sourcePlanCycle: cycleKey, isDeleted: false },
    select: { workOrderId: true, woNumber: true },
  });
  if (existing) {
    return {
      workOrderId: existing.workOrderId,
      woNumber: existing.woNumber,
      notificationId: null,
      created: false,
      skipReason: `work order ${existing.woNumber} already exists for cycle ${cycleKey}`,
    };
  }

  const woNumber = await generateWoNumber();

  // Who the generated work order belongs to, as opposed to who ran the job that
  // created it. `input.actorUserId` is deliberately NOT usable here: the
  // unattended scheduler passes the literal sentinel 'scheduler', and
  // `reportedByUserId` carries a foreign key to User. Using the actor wrote the
  // string 'scheduler' into that column and every scheduled generation failed
  // with WorkOrder_reportedByUserId_fkey. A PM work order is raised by the plan
  // rather than reported by a person, so the plan's own supervisor is both the
  // assigned supervisor and the attributable reporter -- one resolution rule for
  // one column pair, rather than two sources of truth for the same question.
  const raisedByUserId = input.supervisorUserId ?? plan.createdBy;

  const run = async (tx: Prisma.TransactionClient): Promise<GeneratePmWorkOrderResult> => {
    const wo = await tx.workOrder.create({
      data: {
        woNumber,
        type: 'PM',
        priority,
        status,
        functionalLocationId,
        equipmentId,
        description: plan.description,
        workCenterId: plan.workCenterId,
        supervisorUserId: raisedByUserId,
        // SOW 3.3.3 requires a reporter, and a PM job is raised by the plan.
        reportedByUserId: raisedByUserId,
        sourcePlanId: plan.planId,
        sourcePlanCycle: cycleKey,
        breakdownFlag: false,
        createdBy: input.actorUserId,
        modifiedBy: input.actorUserId,
      },
    });

    // SOW 3.4.3 / row 45: the work order carries the plan's task list. Without
    // this a generated PM work order arrives with no operations, so it cannot be
    // scheduled, costed or worked.
    for (const op of plan.taskList?.operations ?? []) {
      await tx.workOrderOperation.create({
        data: {
          workOrderId: wo.workOrderId,
          sequenceNumber: op.sequenceNumber,
          description: op.description,
          craftId: op.craftId,
          plannedHours: op.plannedHours,
          numberOfTechnicians: op.numberOfTechnicians,
          createdBy: input.actorUserId,
          modifiedBy: input.actorUserId,
        },
      });
    }

    // SOW 3.4.3 / row 47: raise the plan's associated notification and link it to
    // the work order it belongs to. The plan's notification is a template: each
    // generation gets its own row, because one notification describing this
    // specific job is what a recipient triages, and a single row linked to every
    // work order a plan has ever produced cannot be resolved or closed.
    let notificationId: string | null = null;
    if (plan.notification) {
      const template = plan.notification;
      const notification = await tx.notification.create({
        data: {
          notificationNumber: await generateNotifNumber(),
          type: template.type,
          priority: template.priority,
          functionalLocationId: template.functionalLocationId,
          equipmentId: equipmentId ?? template.equipmentId,
          reportedByUserId: template.reportedByUserId,
          description: `${template.description} (${plan.planCode} ${input.cycleKey} -> ${wo.woNumber})`,
          breakdownFlag: false,
          status: 'Open',
          createdBy: input.actorUserId,
          modifiedBy: input.actorUserId,
        },
      });
      await tx.workOrderNotifLink.create({
        data: { workOrderId: wo.workOrderId, notificationId: notification.notificationId },
      });
      notificationId = notification.notificationId;
    }

    return {
      workOrderId: wo.workOrderId,
      woNumber: wo.woNumber,
      notificationId,
      created: true,
      skipReason: null,
    };
  };

  try {
    // The caller owns the transaction boundary. A transaction client has no
    // `$transaction` of its own, so the work must join the transaction it was
    // handed rather than opening a nested one, which Prisma does not support.
    if (!canStartTransaction(db)) {
      return await run(db as Prisma.TransactionClient);
    }
    return await (db as typeof prisma).$transaction(run);
  } catch (error) {
    // The partial unique index is the authoritative guard; two scheduler
    // instances or a planner clicking twice can race past the read above.
    if (isUniqueViolation(error)) {
      logger.info(`[pmGeneration] plan ${plan.planCode} cycle ${cycleKey} skipped (idempotent)`);
      const raced = await db.workOrder.findFirst({
        where: { sourcePlanId: plan.planId, sourcePlanCycle: cycleKey, isDeleted: false },
        select: { workOrderId: true, woNumber: true },
      });
      return {
        workOrderId: raced?.workOrderId ?? null,
        woNumber: raced?.woNumber ?? null,
        notificationId: null,
        created: false,
        skipReason: `work order ${raced?.woNumber ?? 'unknown'} already exists for cycle ${cycleKey}`,
      };
    }
    throw error;
  }
}

function canStartTransaction(db: unknown): boolean {
  return typeof (db as { $transaction?: unknown } | null)?.$transaction === 'function';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
