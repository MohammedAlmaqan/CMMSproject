import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { generateWoNumber } from '../utils/sequence.js';
import { logger } from '../utils/logger.js';
import {
  validate,
  workOrderCreateSchema,
  workOrderUpdateSchema,
  workOrderStatusBodySchema,
} from '../utils/validation.js';

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

/**
 * @openapi
 * /api/work-orders:
 *   get:
 *     summary: List work orders (paginated with filters)
 *     description: Returns a page of non-deleted work orders ordered by created date desc.
 *     tags: [Work Orders]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: equipmentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: workCenterId
 *         schema:
 *           type: string
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Work order page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 skip:
 *                   type: integer
 *                 take:
 *                   type: integer
 *       '500':
 *         description: Internal server error
 */
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

    const skipNum = skip ? parseInt(skip as string, 10) || 0 : 0;
    const takeNum = take ? parseInt(take as string, 10) || 50 : 50;

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
    logger.error({ err: error }, 'Error fetching work orders');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-orders/{id}:
 *   get:
 *     summary: Get a work order by id (full sub-domain detail)
 *     description: Returns the work order with functional location, equipment, work center, supervisor, operations, materials, services, checklists, cost splits, comments and linked notifications.
 *     tags: [Work Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Work order detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-orders:
 *   post:
 *     summary: Create a work order
 *     description: Creates a Draft work order. Requires role Requester or higher.
 *     tags: [Work Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - priority
 *               - description
 *             properties:
 *               type:
 *                 type: string
 *               priority:
 *                 type: string
 *               functionalLocationId:
 *                 type: string
 *               equipmentId:
 *                 type: string
 *               description:
 *                 type: string
 *               workCenterId:
 *                 type: string
 *               supervisorUserId:
 *                 type: string
 *               plannedStart:
 *                 type: string
 *                 format: date-time
 *               plannedFinish:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       '201':
 *         description: Work order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '409':
 *         description: Work order number already exists
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorizeMinRole('Requester'), validate(workOrderCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      type, priority, functionalLocationId, equipmentId, description,
      workCenterId, supervisorUserId, plannedStart, plannedFinish,
      costCenterCode, internalOrder, breakdownFlag, safetyCriticalFlag,
    } = req.body;

    const woNumber = await generateWoNumber();

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

    await logAudit(
      { tableName: 'WorkOrder', recordId: workOrder.workOrderId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(workOrder);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work order number already exists' });
    }
    logger.error({ err: error }, 'Error creating work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-orders/{id}:
 *   put:
 *     summary: Update a work order
 *     description: Partially updates a work order and recomputes cost totals. Requires role Requester or higher.
 *     tags: [Work Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Updated work order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(workOrderUpdateSchema), async (req: Request, res: Response) => {
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

    await recomputeWorkOrderCosts(id);

    await logAudit(
      { tableName: 'WorkOrder', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(await prisma.workOrder.findUnique({ where: { workOrderId: id } }));
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-orders/{id}:
 *   delete:
 *     summary: Soft-delete a work order
 *     description: Marks the work order isDeleted (soft delete). Requires role Maintenance Supervisor or higher.
 *     tags: [Work Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Work order deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'WorkOrder', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/work-orders/{id}/status:
 *   put:
 *     summary: Transition work order status
 *     description: Applies a valid workflow transition (Draft/Planned/Scheduled/In Progress/Completed/Suspended/Closed/Cancelled). Sets actualStart/actualFinish timestamps.
 *     tags: [Work Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Updated work order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '400':
 *         description: Invalid status transition
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id/status', authorizeMinRole('Technician'), validate(workOrderStatusBodySchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status: newStatus } = req.body;

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

    await logAudit(
      { tableName: 'WorkOrder', recordId: id, action: 'Update', fieldName: 'status', oldValue: workOrder.status, newValue: newStatus },
      req.user!.userId,
      req.ip
    );

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;