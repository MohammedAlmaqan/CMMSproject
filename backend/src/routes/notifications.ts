import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { generateNotifNumber, generateWoNumber } from '../utils/sequence.js';
import {
  validate,
  notificationCreateSchema,
  notificationUpdateSchema,
  convertNotificationSchema,
} from '../utils/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, type, priority, status, skip, take } = req.query;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { notificationNumber: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type as string;
    if (priority) where.priority = priority as string;
    if (status) where.status = status as string;

    const skipNum = skip ? parseInt(skip as string, 10) || 0 : 0;
    const takeNum = take ? parseInt(take as string, 10) || 50 : 50;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          functionalLocation: { select: { functionalLocationId: true, locationCode: true, description: true } },
          equipment: { select: { equipmentId: true, equipmentCode: true, name: true } },
          reportedBy: { select: { userId: true, fullName: true, username: true } },
        },
        orderBy: { createdDate: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({ data: notifications, total, skip: skipNum, take: takeNum });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const notification = await prisma.notification.findFirst({
      where: { notificationId: id, isDeleted: false },
      include: {
        functionalLocation: true,
        equipment: true,
        reportedBy: { select: { userId: true, fullName: true, username: true } },
        workOrders: {
          include: {
            workOrder: { select: { workOrderId: true, woNumber: true, status: true, type: true } },
          },
        },
      },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const comments = await prisma.comment.findMany({
      where: { entityType: 'Notification', entityId: notification.notificationId },
      include: { user: { select: { userId: true, fullName: true } } },
      orderBy: { createdDate: 'desc' },
    });

    res.json({ ...notification, comments });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(notificationCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      type, priority, functionalLocationId, equipmentId,
      reportedByUserId, description, breakdownFlag,
    } = req.body;

    const notificationNumber = await generateNotifNumber();

    const notification = await prisma.notification.create({
      data: {
        notificationNumber,
        type,
        priority,
        functionalLocationId,
        equipmentId: equipmentId || null,
        reportedByUserId,
        description,
        breakdownFlag: breakdownFlag || false,
        status: 'Open',
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'Notification', recordId: notification.notificationId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(notification);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Notification number already exists' });
    }
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeMinRole('Requester'), validate(notificationUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.notification.findFirst({
      where: { notificationId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const {
      type, priority, functionalLocationId, equipmentId,
      reportedByUserId, description, breakdownFlag, status,
    } = req.body;

    const notification = await prisma.notification.update({
      where: { notificationId: id },
      data: {
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...(functionalLocationId !== undefined && { functionalLocationId }),
        ...(equipmentId !== undefined && { equipmentId: equipmentId || null }),
        ...(reportedByUserId !== undefined && { reportedByUserId }),
        ...(description !== undefined && { description }),
        ...(breakdownFlag !== undefined && { breakdownFlag }),
        ...(status !== undefined && { status }),
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'Notification', recordId: notification.notificationId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(notification);
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.notification.findFirst({
      where: { notificationId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.update({
      where: { notificationId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAudit(
      { tableName: 'Notification', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/convert-to-wo', authorizeMinRole('Maintenance Planner'), validate(convertNotificationSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const notification = await prisma.notification.findFirst({
      where: { notificationId: id, isDeleted: false },
    });
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.status === 'Converted') {
      return res.status(400).json({ error: 'Notification already converted' });
    }

    const woNumber = await generateWoNumber();

    const workCenters = await prisma.workCenter.findMany({ where: { isDeleted: false }, take: 1 });
    const defaultWorkCenter = workCenters[0];
    if (!defaultWorkCenter) {
      return res.status(400).json({ error: 'No active work center available' });
    }

    const workOrder = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          woNumber,
          type: notification.breakdownFlag ? 'EM' : 'CM',
          priority: notification.priority,
          status: 'Draft',
          functionalLocation: { connect: { functionalLocationId: notification.functionalLocationId } },
          equipment: notification.equipmentId ? { connect: { equipmentId: notification.equipmentId } } : undefined,
          description: notification.description,
          workCenter: { connect: { workCenterId: req.body.workCenterId || defaultWorkCenter.workCenterId } },
          supervisor: { connect: { userId: req.body.supervisorUserId || notification.reportedByUserId || req.user!.userId } },
          breakdownFlag: notification.breakdownFlag,
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        },
      });

      await tx.workOrderNotifLink.create({
        data: {
          workOrderId: wo.workOrderId,
          notificationId: notification.notificationId,
        },
      });

      await tx.notification.update({
        where: { notificationId: notification.notificationId },
        data: { status: 'Converted', modifiedBy: req.user!.userId },
      });

      return wo;
    });

    await logAudit(
      { tableName: 'WorkOrder', recordId: workOrder.workOrderId, action: 'Create' },
      req.user!.userId,
      req.ip
    );
    await logAudit(
      { tableName: 'Notification', recordId: notification.notificationId, action: 'Update', fieldName: 'status', oldValue: notification.status, newValue: 'Converted' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(workOrder);
  } catch (error) {
    console.error('Error converting notification to work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;