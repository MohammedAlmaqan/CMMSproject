import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, schedulerRunSchema, maintenancePlanCreateSchema, maintenancePlanUpdateSchema, planPatchIssues } from '../utils/validation.js';
import { runSchedulerOnce } from '../services/scheduler.js';
import { generatePmWorkOrder, PmGenerationError } from '../services/pmGeneration.js';
import { isoDay } from '../utils/pmDueRules.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * D-10 / SOW 3.4.1: reconcile the two ways a target can arrive.
 *
 * The target list is the source of truth, but the legacy single `equipmentId` /
 * `functionalLocationId` columns are still part of the API and are mirrored into
 * the list so a caller that sets either one still produces a real target. Both
 * forms are accepted and merged, with duplicates collapsed: naming the same
 * asset twice would otherwise trip the (planId, equipmentId) unique index and
 * surface as a 500.
 */
function normaliseTargets(
  targets: Array<{ equipmentId?: string | null; functionalLocationId?: string | null }> | undefined,
  equipmentId?: string | null,
  functionalLocationId?: string | null
): Array<{ equipmentId: string | null; functionalLocationId: string | null }> {
  const supplied = [
    ...(targets ?? []),
    ...(equipmentId ? [{ equipmentId }] : []),
    ...(functionalLocationId ? [{ functionalLocationId }] : []),
  ];
  const seen = new Set<string>();
  const out: Array<{ equipmentId: string | null; functionalLocationId: string | null }> = [];
  for (const t of supplied) {
    const key = t.equipmentId ? `E:${t.equipmentId}` : `L:${t.functionalLocationId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      equipmentId: t.equipmentId ?? null,
      functionalLocationId: t.equipmentId ? null : (t.functionalLocationId ?? null),
    });
  }
  return out;
}


/**
 * @openapi
 * /api/maintenance-plans:
 *   get:
 *     summary: List maintenance plans
 *     description: >
 *       Returns non-deleted PM plans with their equipment, work center and task list.
 *       Filter by strategyType (Time, Meter, Combined) and by activeFlag.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: strategy
 *         schema: { type: string, enum: [Time, Meter, Combined] }
 *         description: Filter by strategyType
 *       - in: query
 *         name: active
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: Filter by activeFlag
 *     responses:
 *       '200':
 *         description: Array of maintenance plans
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   planId: { type: string }
 *                   planCode: { type: string }
 *                   description: { type: string }
 *                   equipmentId: { type: string, nullable: true }
 *                   functionalLocationId: { type: string, nullable: true, description: "Not enforced as a foreign key; v1.1 backlog" }
 *                   workCenterId: { type: string }
 *                   taskListId: { type: string }
 *                   strategyType: { type: string, enum: [Time, Meter, Combined] }
 *                   intervalValue: { type: integer }
 *                   intervalUnit: { type: string, enum: [Days, Weeks, Months] }
 *                   callHorizonValue: { type: integer, nullable: true }
 *                   callHorizonUnit: { type: string, enum: [Days, Units], nullable: true }
 *                   startDate: { type: string, format: date-time }
 *                   endDate: { type: string, format: date-time, nullable: true }
 *                   activeFlag: { type: boolean }
 *                   priority: { type: string, enum: [High, Medium, Low], description: "SOW 3.4.1; applied to generated work orders" }
 *                   generatedWorkOrderStatus: { type: string, enum: [Draft, Planned], description: "SOW 3.4.3" }
 *                   notificationId: { type: string, nullable: true, description: "SOW 3.4.1/3.4.3; created and linked on generation" }
 *                   targets: { type: array, description: "D-10; the assets this plan covers" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create a maintenance plan
 *     description: >
 *       Validated by the zod schema `maintenancePlanCreateSchema` (see utils/validation.ts).
 *       Requires the Requester role. References that do not resolve surface as Prisma P2003
 *       and are translated to HTTP 400.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `maintenancePlanCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planCode, description, workCenterId, taskListId, strategyType, intervalValue, intervalUnit, startDate]
 *             properties:
 *               planCode: { type: string }
 *               description: { type: string }
 *               equipmentId: { type: string, nullable: true }
 *               functionalLocationId: { type: string, nullable: true }
 *               workCenterId: { type: string }
 *               taskListId: { type: string }
 *               strategyType: { type: string, enum: [Time, Meter, Combined] }
 *               intervalValue: { type: integer, minimum: 0 }
 *               intervalUnit: { type: string, enum: [Days, Weeks, Months] }
 *               callHorizonValue: { type: integer, minimum: 0 }
 *               callHorizonUnit: { type: string, enum: [Days, Units] }
 *               startDate: { type: string }
 *               endDate: { type: string, nullable: true }
 *               activeFlag: { type: boolean }
 *     responses:
 *       '201':
 *         description: Maintenance plan created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or a referenced record was not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { strategy, active } = req.query;
    const where: any = { isDeleted: false };

    if (strategy) where.strategyType = strategy as string;
    if (active !== undefined) where.activeFlag = active === 'true';

    const plans = await prisma.maintenancePlan.findMany({
      where,
      include: {
        equipment: { select: { equipmentId: true, equipmentCode: true, name: true } },
        workCenter: { select: { workCenterId: true, code: true, name: true } },
        taskList: { select: { taskListId: true, code: true, description: true } },
        // D-10: the target list is what the plan actually covers, so it belongs
        // in the list response rather than only on the detail route.
        targets: {          include: {
            equipment: { select: { equipmentId: true, equipmentCode: true, name: true } },
            functionalLocation: { select: { functionalLocationId: true, locationCode: true, description: true } },
          },
        },
        planMeters: true,
      },
      orderBy: { createdDate: 'desc' },
    });

    res.json(plans);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching maintenance plans');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/maintenance-plans/run-scheduler:
 *   post:
 *     summary: Run the PM scheduler immediately
 *     description: >
 *       On-demand trigger for the preventive maintenance scheduler. The body is validated
 *       by the zod schema `schedulerRunSchema`, which is a strict empty object, so the
 *       scheduler always runs against its current configuration. Requires the Administrator
 *       role. Returns the number of work orders generated.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       description: "Validated by zod `schedulerRunSchema` (strict empty object)"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Scheduler run completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated: { type: integer, description: Number of work orders generated }
 *       '400':
 *         description: Request body failed `schedulerRunSchema` validation
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Administrator
 *       '500':
 *         description: Internal server error
 */
router.post('/run-scheduler', authorizeMinRole('Administrator'), validate(schedulerRunSchema), async (req: Request, res: Response) => {
  try {
    const result = await runSchedulerOnce();
    await logAudit(
      { tableName: 'MaintenancePlan', recordId: req.user!.userId, action: 'Run' },
      req.user!.userId,
      req.ip
    );
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error running scheduler');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/maintenance-plans/{id}:
 *   get:
 *     summary: Get one maintenance plan
 *     description: >
 *       Returns a single non-deleted plan including its task list operations, each with the
 *       resolved craft, ordered by sequenceNumber.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MaintenancePlan planId
 *     responses:
 *       '200':
 *         description: Plan detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Maintenance plan not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const plan = await prisma.maintenancePlan.findFirst({
      where: { planId: id, isDeleted: false },
      include: {
        equipment: true,
        workCenter: true,
        taskList: { include: { operations: { where: { isDeleted: false }, include: { craft: true }, orderBy: { sequenceNumber: 'asc' } } } },
        planMeters: { include: { meter: true } },
      },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Maintenance plan not found' });
    }

    res.json(plan);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching maintenance plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(maintenancePlanCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      planCode, description, equipmentId, functionalLocationId,
      workCenterId, taskListId, strategyType, intervalValue,
      intervalUnit, callHorizonValue, callHorizonUnit, startDate, endDate,
      priority, generatedWorkOrderStatus, notificationId, targets, planMeters,
    } = req.body;

    const plan = await prisma.maintenancePlan.create({
      data: {
        planCode,
        description,
        equipmentId: equipmentId || null,
        functionalLocationId: functionalLocationId || null,
        workCenterId,
        taskListId,
        strategyType,
        intervalValue,
        intervalUnit,
        // Nullish, not `||`: zero is a documented legal horizon ("generate on
        // the due date only") and `||` silently overwrote it with the 7-day
        // default, so a caller asking for no lead time got a week of it.
        callHorizonValue: callHorizonValue ?? 7,
        callHorizonUnit: callHorizonUnit ?? 'Days',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        priority: priority ?? 'Medium',
        generatedWorkOrderStatus: generatedWorkOrderStatus ?? 'Draft',
        notificationId: notificationId || null,
        // D-10: the target list is the source of truth. The legacy single
        // columns above stay as a compatibility mirror of the first target, so
        // existing readers of the plan API keep working unchanged.
        targets: {
          create: normaliseTargets(targets, equipmentId, functionalLocationId).map((t) => ({
            equipmentId: t.equipmentId ?? null,
            functionalLocationId: t.functionalLocationId ?? null,
          })),
        },
        // SOW 3.4.2: multiple meters per plan, each with its own threshold.
        ...(planMeters?.length
          ? {
              planMeters: {
                create: planMeters.map((m: { meterId: string; meterInterval: number }) => ({
                  meterId: m.meterId,
                  meterInterval: m.meterInterval,
                })),
              },
            }
          : {}),
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
      include: { targets: true, planMeters: true },
    });

    await logAudit(
      { tableName: 'MaintenancePlan', recordId: plan.planId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(plan);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Plan code already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced entity not found (equipment, location, work center, or task list)' });
    }
    logger.error({ err: error }, 'Error creating maintenance plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/maintenance-plans/{id}:
 *   put:
 *     summary: Update a maintenance plan
 *     description: >
 *       Validated by the zod schema `maintenancePlanUpdateSchema` (see
 *       utils/validation.ts). Requires the Requester role.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MaintenancePlan planId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `maintenancePlanUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planCode: { type: string }
 *               description: { type: string }
 *               equipmentId: { type: string, nullable: true }
 *               functionalLocationId: { type: string, nullable: true }
 *               workCenterId: { type: string }
 *               taskListId: { type: string }
 *               strategyType: { type: string, enum: [Time, Meter, Combined] }
 *               intervalValue: { type: integer, minimum: 0 }
 *               intervalUnit: { type: string, enum: [Days, Weeks, Months] }
 *               callHorizonValue: { type: integer, minimum: 0, nullable: true }
 *               callHorizonUnit: { type: string, enum: [Days, Units], nullable: true }
 *               startDate: { type: string }
 *               endDate: { type: string, nullable: true }
 *               activeFlag: { type: boolean }
 *     responses:
 *       '200':
 *         description: Maintenance plan updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or a referenced record was not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Maintenance plan not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(maintenancePlanUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.maintenancePlan.findFirst({
      where: { planId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Maintenance plan not found' });
    }

    const {
      description, equipmentId, functionalLocationId,
      workCenterId, taskListId, strategyType, intervalValue,
      intervalUnit, callHorizonValue, callHorizonUnit, startDate, endDate, activeFlag,
      priority, generatedWorkOrderStatus, notificationId, targets, planMeters,
    } = req.body;

    // The create-time cross-field rules cannot see a patch, so the merged
    // record is checked here before anything is written. Doing it first means a
    // plan is never left straddling two states - strategy switched to Meter,
    // thresholds not yet attached.
    const existingTargets = await prisma.maintenancePlanTarget.findMany({
      where: { planId: id },
      select: { equipmentId: true, functionalLocationId: true },
    });
    const existingMeterCount = await prisma.maintenancePlanMeter.count({
      where: { planId: id },
    });
    const issues = planPatchIssues(
      req.body,
      existing,
      {
        targetCount: normaliseTargets(
          targets !== undefined ? targets : existingTargets,
          equipmentId !== undefined ? equipmentId : existing.equipmentId,
          functionalLocationId !== undefined ? functionalLocationId : existing.functionalLocationId
        ).length,
        storedMeterCount: existingMeterCount,
      }
    );
    if (issues.length > 0) {
      return res.status(400).json({ error: issues.join('; ') });
    }

    const plan = await prisma.maintenancePlan.update({
      where: { planId: id },
      data: {
        ...(description !== undefined && { description }),
        ...(equipmentId !== undefined && { equipmentId: equipmentId || null }),
        ...(functionalLocationId !== undefined && { functionalLocationId: functionalLocationId || null }),
        ...(workCenterId !== undefined && { workCenterId }),
        ...(taskListId !== undefined && { taskListId }),
        ...(strategyType !== undefined && { strategyType }),
        ...(intervalValue !== undefined && { intervalValue }),
        ...(intervalUnit !== undefined && { intervalUnit }),
        ...(callHorizonValue !== undefined && { callHorizonValue }),
        ...(callHorizonUnit !== undefined && { callHorizonUnit }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(activeFlag !== undefined && { activeFlag }),
        ...(priority !== undefined && { priority }),
        ...(generatedWorkOrderStatus !== undefined && { generatedWorkOrderStatus }),
        ...(notificationId !== undefined && { notificationId: notificationId || null }),
        modifiedBy: req.user!.userId,
      },
    });

    // Targets and meters are replaced wholesale rather than patched field by
    // field: the caller is stating the plan's current coverage, and a partial
    // diff over a set with no natural ordering is where duplicates creep in.
    if (targets !== undefined) {
      await prisma.$transaction([
        prisma.maintenancePlanTarget.deleteMany({ where: { planId: id } }),
        prisma.maintenancePlanTarget.createMany({
          data: normaliseTargets(targets, null, null).map((t) => ({
            planId: id,
            equipmentId: t.equipmentId,
            functionalLocationId: t.functionalLocationId,
          })),
        }),
      ]);
    }
    if (planMeters !== undefined) {
      await prisma.$transaction([
        prisma.maintenancePlanMeter.deleteMany({ where: { planId: id } }),
        prisma.maintenancePlanMeter.createMany({
          data: planMeters.map((m: { meterId: string; meterInterval: number }) => ({
            planId: id,
            meterId: m.meterId,
            meterInterval: m.meterInterval,
          })),
        }),
      ]);
    }

    await logAudit(
      { tableName: 'MaintenancePlan', recordId: plan.planId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(plan);
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced entity not found (equipment, location, work center, or task list)' });
    }
    logger.error({ err: error }, 'Error updating maintenance plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/maintenance-plans/{id}:
 *   delete:
 *     summary: Soft delete a maintenance plan
 *     description: >
 *       Marks the plan isDeleted=true. Work orders already generated from the plan are
 *       retained. Requires the Maintenance Supervisor role.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MaintenancePlan planId
 *     responses:
 *       '200':
 *         description: Maintenance plan soft deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Supervisor
 *       '404':
 *         description: Maintenance plan not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.maintenancePlan.findFirst({
      where: { planId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Maintenance plan not found' });
    }

    await prisma.maintenancePlan.update({
      where: { planId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAudit(
      { tableName: 'MaintenancePlan', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Maintenance plan deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting maintenance plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/maintenance-plans/{id}/generate-wo:
 *   post:
 *     summary: Generate a work order from a maintenance plan
 *     description: >
 *       Creates a single PM work order from the plan and its task list operations.
 *       supervisorUserId defaults to the authenticated user; workCenterId is taken from the
 *       plan. Requires the Maintenance Planner role.
 *
 *       NOTE: this route and the scheduler both delegate to
 *       services/pmGeneration.ts, so a manually generated work order and a
 *       scheduled one are built identically. This route generates on demand and
 *       is therefore not subject to the call horizon; the scheduler is.
 *     tags: [Maintenance Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MaintenancePlan planId
 *     requestBody:
 *       required: false
 *       description: Optional overrides; not zod-validated on this route
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               supervisorUserId: { type: string, description: "Defaults to the authenticated user" }
 *     responses:
 *       '201':
 *         description: Work order generated from the plan
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: Plan has no task list operations, or the plan is inactive
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Maintenance plan not found
 *       '500':
 *         description: Internal server error
 */
router.post('/:id/generate-wo', authorizeMinRole('Maintenance Planner'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const plan = await prisma.maintenancePlan.findFirst({
      where: { planId: id, isDeleted: false },
      select: { planId: true, planCode: true },
    });
    if (!plan) {
      return res.status(404).json({ error: 'Maintenance plan not found' });
    }

    // A manual generation is not subject to the call horizon, which is a
    // scheduling window rather than a permission, so the cycle is today's.
    // Everything else is identical to a scheduled generation: the same service
    // builds the work order, copies the task list, raises the associated
    // notification and records sourcePlanId/sourcePlanCycle.
    const cycleKey = isoDay(new Date());
    const outcome = await prisma.$transaction((tx) =>
      generatePmWorkOrder(tx, {
        planId: plan.planId,
        cycleKey,
        basis: 'Time',
        dueDate: new Date(),
        actorUserId: req.user!.userId,
        supervisorUserId: req.body.supervisorUserId || null,
      })
    );

    if (!outcome.workOrderId) {
      return res.status(400).json({ error: `Maintenance plan ${plan.planCode} has no usable target` });
    }

    // SOW 3.4.3 idempotency: a second press in the same cycle is a no-op, not a
    // duplicate work order. The route previously created a new work order every
    // time it was called, because it recorded no plan cycle at all.
    if (!outcome.created) {
      const existing = await prisma.workOrder.findUnique({
        where: { workOrderId: outcome.workOrderId },
      });
      return res.status(200).json({ ...existing, alreadyExisted: true, skipReason: outcome.skipReason });
    }

    await prisma.systemAlert.create({
      data: {
        alertType: 'PM_Generation',
        userId: req.user!.userId,
        title: 'PM Work Order Generated',
        message: `Work order ${outcome.woNumber} generated from plan ${plan.planCode}`,
        relatedEntityId: outcome.workOrderId,
        relatedEntityType: 'WorkOrder',
      },
    });

    await logAudit(
      { tableName: 'WorkOrder', recordId: outcome.workOrderId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    const workOrder = await prisma.workOrder.findUnique({
      where: { workOrderId: outcome.workOrderId },
    });
    res.status(201).json({ ...workOrder, notificationId: outcome.notificationId });
  } catch (error) {
    if (error instanceof PmGenerationError) {
      const status = error.code === 'PLAN_NOT_FOUND' ? 404 : 400;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    logger.error({ err: error }, 'Error generating work order from plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
