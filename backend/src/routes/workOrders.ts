import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

const VALID_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Planned', 'Cancelled'],
  Planned: ['Scheduled', 'Draft'],
  Scheduled: ['In Progress', 'Planned', 'Cancelled'],
  'In Progress': ['Completed', 'Suspended'],
  Suspended: ['In Progress', 'Cancelled'],
  Completed: ['Closed'],
  Closed: [],
  Cancelled: ['Draft'],
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, type, priority, status, equipmentId, workCenterId, skip, take } = req.query;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { woNumber: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type as string;
    if (priority) where.priority = priority as string;
    if (status) where.status = status as string;
    if (equipmentId) where.equipmentId = equipmentId as string;
    if (workCenterId) where.workCenterId = workCenterId as string;

    const skipNum = skip ? parseInt(skip as string, 10) : 0;
    const takeNum = take ? parseInt(take as string, 10) : 50;

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          functionalLocation: { select: { functionalLocationId: true, locationCode: true, description: true } },
          equipment: { select: { equipmentId: true, equipmentCode: true, name: true } },
          workCenter: { select: { workCenterId: true, code: true, name: true } },
        },
        orderBy: { createdDate: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.workOrder.count({ where }),
    ]);

    res.json({ data: workOrders, total, skip: skipNum, take: takeNum });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const workOrder = await prisma.workOrder.findFirst({
      where: { workOrderId: id, isDeleted: false },
      include: {
        functionalLocation: true,
        equipment: true,
        workCenter: true,
        supervisor: { select: { userId: true, fullName: true, username: true } },
        operations: { include: { craft: true }, orderBy: { sequenceNumber: 'asc' } },
        woMaterials: { include: { material: true } },
        externalServices: true,
        checklists: {
          include: {
            template: true,
            items: { include: { item: true } },
          },
        },
        costSplits: true,
        notifications: {
          include: {
            notification: { select: { notificationId: true, notificationNumber: true, description: true, status: true } },
          },
        },
      },
    });

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const comments = await prisma.comment.findMany({
      where: { entityType: 'WorkOrder', entityId: workOrder.workOrderId },
      include: { user: { select: { userId: true, fullName: true } } },
      orderBy: { createdDate: 'desc' },
    });

    res.json({ ...workOrder, comments });
  } catch (error) {
    console.error('Error fetching work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      type, priority, functionalLocationId, equipmentId, description,
      workCenterId, supervisorUserId, plannedStart, plannedFinish,
      costCenterCode, internalOrder, breakdownFlag, safetyCriticalFlag,
    } = req.body;

    const prefixConfig = await prisma.systemConfig.findUnique({ where: { key: 'WO_PREFIX' } });
    const woNumber = `${prefixConfig?.value || 'WO'}-${Date.now()}`;

    const workOrder = await prisma.workOrder.create({
      data: {
        woNumber,
        type,
        priority,
        functionalLocationId,
        equipmentId: equipmentId || null,
        description,
        workCenterId,
        supervisorUserId,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedFinish: plannedFinish ? new Date(plannedFinish) : null,
        costCenterCode: costCenterCode || '',
        internalOrder: internalOrder || '',
        breakdownFlag: breakdownFlag || false,
        safetyCriticalFlag: safetyCriticalFlag || false,
        status: 'Draft',
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(workOrder);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work order number already exists' });
    }
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrder.findFirst({
      where: { workOrderId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const {
      type, priority, functionalLocationId, equipmentId, description,
      workCenterId, supervisorUserId, plannedStart, plannedFinish,
      actualStart, actualFinish, costCenterCode, internalOrder,
      breakdownFlag, safetyCriticalFlag, status,
    } = req.body;

    await prisma.workOrder.update({
      where: { workOrderId: id },
      data: {
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...(functionalLocationId !== undefined && { functionalLocationId }),
        ...(equipmentId !== undefined && { equipmentId: equipmentId || null }),
        ...(description !== undefined && { description }),
        ...(workCenterId !== undefined && { workCenterId }),
        ...(supervisorUserId !== undefined && { supervisorUserId }),
        ...(plannedStart !== undefined && { plannedStart: plannedStart ? new Date(plannedStart) : null }),
        ...(plannedFinish !== undefined && { plannedFinish: plannedFinish ? new Date(plannedFinish) : null }),
        ...(actualStart !== undefined && { actualStart: actualStart ? new Date(actualStart) : null }),
        ...(actualFinish !== undefined && { actualFinish: actualFinish ? new Date(actualFinish) : null }),
        ...(costCenterCode !== undefined && { costCenterCode }),
        ...(internalOrder !== undefined && { internalOrder }),
        ...(breakdownFlag !== undefined && { breakdownFlag }),
        ...(safetyCriticalFlag !== undefined && { safetyCriticalFlag }),
        ...(status !== undefined && { status }),
        modifiedBy: req.user!.userId,
      },
    });

    const [opsTotal, matTotal, svcTotal] = await Promise.all([
      prisma.workOrderOperation.aggregate({
        where: { workOrderId: id },
        _sum: { plannedHours: true },
      }),
      prisma.workOrderMaterial.aggregate({
        where: { workOrderId: id },
        _sum: { plannedQuantity: true, unitCost: true },
      }),
      prisma.externalServiceCost.aggregate({
        where: { workOrderId: id },
        _sum: { cost: true },
      }),
    ]);

    const laborCost = (opsTotal._sum.plannedHours || 0) * 50;
    const materialCost = (matTotal._sum.plannedQuantity || 0) * (matTotal._sum.unitCost || 0);
    const serviceCost = svcTotal._sum.cost || 0;
    const plannedCost = laborCost + materialCost + serviceCost;

    const result = await prisma.workOrder.update({
      where: { workOrderId: id },
      data: { plannedCost },
    });

    res.json(result);
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrder.findFirst({
      where: { workOrderId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    await prisma.workOrder.update({
      where: { workOrderId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    res.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status: newStatus } = req.body;
    if (!newStatus) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { workOrderId: id, isDeleted: false },
    });
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const allowed = VALID_TRANSITIONS[workOrder.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid transition from '${workOrder.status}' to '${newStatus}'`,
      });
    }

    const updateData: any = {
      status: newStatus,
      modifiedBy: req.user!.userId,
    };

    if (newStatus === 'In Progress' && !workOrder.actualStart) {
      updateData.actualStart = new Date();
    }
    if (newStatus === 'Completed' || newStatus === 'Closed') {
      updateData.actualFinish = new Date();
    }

    const updated = await prisma.workOrder.update({
      where: { workOrderId: id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating work order status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
