import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, schedulerRunSchema, maintenancePlanCreateSchema, maintenancePlanUpdateSchema } from '../utils/validation.js';
import { runSchedulerOnce } from '../services/scheduler.js';
import { generateWoNumber } from '../utils/sequence.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


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
 *                   lastGeneratedDate: { type: string, format: date-time, nullable: true }
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
        callHorizonValue: callHorizonValue || 7,
        callHorizonUnit: callHorizonUnit || 'Days',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
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
    } = req.body;

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
        modifiedBy: req.user!.userId,
      },
    });

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
 *       Creates a single PM work order from the plan and its task list operations, bumping
 *       lastGeneratedDate. supervisorUserId defaults to the authenticated user; workCenterId
 *       is taken from the plan. Requires the Maintenance Planner role.
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
      include: {
        taskList: { include: { operations: { where: { isDeleted: false } } } },
      },
    });
    if (!plan) {
      return res.status(404).json({ error: 'Maintenance plan not found' });
    }

    const woNumber = await generateWoNumber();

    const taskListOps = (plan as any).taskList?.operations || [];

    let functionalLocationId = plan.functionalLocationId;
    if (!functionalLocationId && plan.equipmentId) {
      const equipment = await prisma.equipment.findUnique({
        where: { equipmentId: plan.equipmentId },
        select: { functionalLocationId: true },
      });
      functionalLocationId = equipment?.functionalLocationId || null;
    }
    if (!functionalLocationId) {
      return res.status(400).json({ error: 'Maintenance plan requires a functional location (set on the plan or its equipment)' });
    }

    const workOrder = await prisma.$transaction(async (tx) => {
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
          supervisorUserId: req.body.supervisorUserId || req.user!.userId,
          breakdownFlag: false,
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        },
      });

      for (const op of taskListOps) {
        await tx.workOrderOperation.create({
          data: {
            workOrderId: wo.workOrderId,
            sequenceNumber: op.sequenceNumber,
            description: op.description,
            craftId: op.craftId,
            plannedHours: op.plannedHours,
            numberOfTechnicians: op.numberOfTechnicians,
            createdBy: req.user!.userId,
            modifiedBy: req.user!.userId,
          },
        });
      }

      return wo;
    });

    await prisma.systemAlert.create({
      data: {
        alertType: 'PM_Generation',
        userId: req.user!.userId,
        title: 'PM Work Order Generated',
        message: `Work order ${workOrder.woNumber} generated from plan ${plan.planCode}`,
        relatedEntityId: workOrder.workOrderId,
        relatedEntityType: 'WorkOrder',
      },
    });

    await logAudit(
      { tableName: 'WorkOrder', recordId: workOrder.workOrderId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(workOrder);
  } catch (error) {
    logger.error({ err: error }, 'Error generating work order from plan');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
