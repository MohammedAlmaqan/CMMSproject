import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, schedulerRunSchema, maintenancePlanCreateSchema, maintenancePlanUpdateSchema } from '../utils/validation.js';
import { runSchedulerOnce } from '../services/scheduler.js';
import { generateWoNumber } from '../utils/sequence.js';

const router = Router();

router.use(authenticate);

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
    console.error('Error fetching maintenance plans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error running scheduler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error fetching maintenance plan:', error);
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
    console.error('Error creating maintenance plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error updating maintenance plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error deleting maintenance plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error generating work order from plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
