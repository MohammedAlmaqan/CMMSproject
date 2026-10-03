import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditFieldChange, logAuditAction } from '../middleware/audit.js';
import { generateNotifNumber, generateWoNumber } from '../utils/sequence.js';
import {
  canTransition,
  invalidTransitionMessage,
  transitionTargets,
} from '../utils/transitions.js';
import { resolveWorkOrderPriority } from '../utils/workOrderRules.js';
import { emitAlertToRolesSafely, ALERT_TYPE_HIGH_PRIORITY_NOTIFICATION, TRIAGE_ROLES } from '../services/alertService.js';
import { logger } from '../utils/logger.js';
import {
  validate,
  notificationCreateSchema,
  notificationUpdateSchema,
  convertNotificationSchema,
} from '../utils/validation.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: List notifications
 *     description: >
 *       Returns non-deleted notifications, newest first, with optional search across
 *       notificationNumber and description and optional type, priority and status filters.
 *       skip and take are passed straight through to the database for paging.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on notificationNumber or description
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [M1, M2, M3] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [High, Medium, Low] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Open, "In Process", Completed, Converted] }
 *       - in: query
 *         name: skip
 *         schema: { type: integer, minimum: 0 }
 *       - in: query
 *         name: take
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       '200':
 *         description: Array of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   notificationId: { type: string }
 *                   notificationNumber: { type: string }
 *                   type: { type: string, enum: [M1, M2, M3] }
 *                   priority: { type: string, enum: [High, Medium, Low] }
 *                   status: { type: string, enum: [Open, "In Process", Completed, Converted] }
 *                   description: { type: string }
 *                   reportedDateTime: { type: string, format: date-time }
 *                   functionalLocationId: { type: string }
 *                   equipmentId: { type: string, nullable: true }
 *                   reportedByUserId: { type: string }
 *                   damagesObservations: { type: string, nullable: true, description: "SOW 3.2.2 key field: what was actually found at the asset. Separate from description, which is the report written at raise time." }
 *                   breakdownFlag: { type: boolean }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Raise a notification
 *     description: >
 *       Creates a notification and generates the next notificationNumber automatically.
 *       Validated by the zod schema `notificationCreateSchema` (see
 *       utils/validation.ts). Requires the Requester role. Missing references surface as
 *       Prisma P2003 and are translated to HTTP 400.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `notificationCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, priority, description, functionalLocationId, reportedByUserId]
 *             properties:
 *               type: { type: string, enum: [M1, M2, M3] }
 *               priority: { type: string, enum: [High, Medium, Low] }
 *               description: { type: string, minLength: 3 }
 *               functionalLocationId: { type: string }
 *               equipmentId: { type: string, nullable: true }
 *               reportedByUserId: { type: string }
 *               damagesObservations: { type: string, nullable: true, description: "SOW 3.2.2 key field; optional, since nothing is observed before inspection" }
 *               breakdownFlag: { type: boolean }
 *     responses:
 *       '201':
 *         description: Notification created
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
    logger.error({ err: error }, 'Error fetching notifications');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/notifications/{id}:
 *   get:
 *     summary: Get one notification
 *     description: >
 *       Returns a single non-deleted notification with its functional location, equipment
 *       and reporting user.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification notificationId
 *     responses:
 *       '200':
 *         description: Notification detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Notification not found
 *       '500':
 *         description: Internal server error
 */
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
          where: { isDeleted: false, workOrder: { isDeleted: false } },
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
      where: { entityType: 'Notification', entityId: notification.notificationId, isDeleted: false },
      include: { user: { select: { userId: true, fullName: true } } },
      orderBy: { createdDate: 'desc' },
    });

    res.json({ ...notification, comments });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(notificationCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      type, priority, functionalLocationId, equipmentId,
      reportedByUserId, description, damagesObservations, breakdownFlag,
    } = req.body;

    // SOW 3.2.2 makes the location/equipment selection mandatory but does not
    // say the two must both be typed in. The schema therefore requires at least
    // one, and the location is derived from the equipment when the reporter
    // names only a machine — a fault against a specific asset already knows where
    // that asset is, and making the reporter repeat it is how the two end up
    // contradicting each other in the data.
    let resolvedLocationId = functionalLocationId ?? null;
    let resolvedEquipmentId = equipmentId ?? null;

    if (resolvedEquipmentId) {
      const equipment = await prisma.equipment.findFirst({
        where: { equipmentId: resolvedEquipmentId, isDeleted: false },
        select: { equipmentId: true, functionalLocationId: true },
      });
      if (!equipment) {
        return res.status(400).json({ error: 'Equipment not found' });
      }

      if (!resolvedLocationId) {
        resolvedLocationId = equipment.functionalLocationId;
      } else if (resolvedLocationId !== equipment.functionalLocationId) {
        // Both were supplied and they disagree. Storing that produces a
        // notification whose equipment is not at its stated location, which
        // then misreports under both the location tree and the asset.
        return res.status(400).json({
          error: 'Equipment is not located at the selected functional location',
        });
      }
    }

    const notificationNumber = await generateNotifNumber();

    const notification = await prisma.notification.create({
      data: {
        notificationNumber,
        type,
        priority,
        functionalLocationId: resolvedLocationId!,
        equipmentId: resolvedEquipmentId,
        reportedByUserId,
        description,
        damagesObservations: damagesObservations ?? null,
        breakdownFlag: breakdownFlag || false,
        status: 'Open',
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'Notification', recordId: notification.notificationId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    // SOW 3.8 / row 72: a High-priority notification is the one that must reach a
    // human immediately, so it is fanned out to the planners and supervisors as an
    // in-app alert. Best-effort: the notification itself is already committed, and
    // an alert failure must not turn a raised notification into a 500.
    if (priority === 'High') {
      await emitAlertToRolesSafely(
        prisma,
        TRIAGE_ROLES,
        {
          alertType: ALERT_TYPE_HIGH_PRIORITY_NOTIFICATION,
          title: 'High Priority Notification',
          message: `Notification ${notification.notificationNumber} raised with High priority: ${description}`,
          relatedEntityId: notification.notificationId,
          relatedEntityType: 'Notification',
          createdBy: req.user!.userId,
        },
        [],
        `High-priority notification ${notification.notificationNumber}`
      );
    }

    res.status(201).json(notification);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Notification number already exists' });
    }
    logger.error({ err: error }, 'Error creating notification');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/notifications/{id}:
 *   put:
 *     summary: Update a notification
 *     description: >
 *       Validated by the zod schema `notificationUpdateSchema` (see
 *       utils/validation.ts). Requires the Requester role. SOW 3.2.1 transition
 *       validity is enforced: a `status` change is accepted only if the
 *       NOTIFICATION_TRANSITIONS map in utils/transitions.ts permits it
 *       (Open to In Process/Converted/Completed, In Process to
 *       Completed/Converted, Converted to Completed, Completed terminal). An
 *       illegal transition is rejected with 400, the current status and the
 *       permitted targets, and is recorded in the audit trail as Blocked.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification notificationId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `notificationUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { type: string, enum: [M1, M2, M3] }
 *               priority: { type: string, enum: [High, Medium, Low] }
 *               description: { type: string, minLength: 3 }
 *               functionalLocationId: { type: string }
 *               equipmentId: { type: string, nullable: true }
 *               reportedByUserId: { type: string }
 *               damagesObservations: { type: string, nullable: true, description: "SOW 3.2.2 key field; optional, since nothing is observed before inspection" }
 *               breakdownFlag: { type: boolean }
 *               status: { type: string, enum: [Open, "In Process", Completed, Converted] }
 *     responses:
 *       '200':
 *         description: Notification updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or an illegal status transition was attempted
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Notification not found
 *       '500':
 *         description: Internal server error
 */
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
      reportedByUserId, description, damagesObservations, breakdownFlag, status,
    } = req.body;

    // SOW 3.2.1: transition validity is enforced and illegal transitions are
    // rejected. The status used to be written straight from the request body,
    // so any status could be reached from any other.
    if (status !== undefined && status !== existing.status) {
      if (!canTransition(existing.status, status)) {
        await logAuditFieldChange({

            table: 'Notification',
            recordId: id,
            action: 'Blocked',
            field: 'status',
            oldValue: existing.status,
            newValue: status,
            userId: req.user!.userId,
            ipAddress: req.ip,
          });
        return res.status(400).json({
          error: invalidTransitionMessage(existing.status, status),
          currentStatus: existing.status,
          allowedTransitions: transitionTargets(existing.status),
        });
      }
    }

    // The same contradiction the create path refuses must not be reachable by
    // editing: moving a notification onto different equipment, or changing one
    // side of the location/equipment pair, would otherwise leave a notification
    // whose equipment is not at its stated location.
    const nextEquipmentId = equipmentId !== undefined ? equipmentId || null : existing.equipmentId;
    const nextLocationId =
      functionalLocationId !== undefined ? functionalLocationId : existing.functionalLocationId;

    if (nextEquipmentId) {
      const equipment = await prisma.equipment.findFirst({
        where: { equipmentId: nextEquipmentId, isDeleted: false },
        select: { equipmentId: true, functionalLocationId: true },
      });
      if (!equipment) {
        return res.status(400).json({ error: 'Equipment not found' });
      }
      if (nextLocationId !== equipment.functionalLocationId) {
        return res.status(400).json({
          error: 'Equipment is not located at the selected functional location',
        });
      }
    }

    const notification = await prisma.notification.update({
      where: { notificationId: id },
      data: {
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...(functionalLocationId !== undefined && { functionalLocationId }),
        ...(equipmentId !== undefined && { equipmentId: equipmentId || null }),
        ...(reportedByUserId !== undefined && { reportedByUserId }),
      ...(damagesObservations !== undefined && { damagesObservations }),
        ...(description !== undefined && { description }),
        ...(breakdownFlag !== undefined && { breakdownFlag }),
        ...(status !== undefined && { status }),
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'Notification', recordId: notification.notificationId, action: 'Update', userId: req.user!.userId, ipAddress: req.ip });

    res.json(notification);
  } catch (error) {
    logger.error({ err: error }, 'Error updating notification');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/notifications/{id}:
 *   delete:
 *     summary: Soft delete a notification
 *     description: >
 *       Marks the notification isDeleted=true. A notification that has already been
 *       converted to a work order should not be deleted; the converted work order is
 *       retained regardless. Requires the Maintenance Supervisor role.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification notificationId
 *     responses:
 *       '200':
 *         description: Notification soft deleted
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
 *         description: Notification not found
 *       '500':
 *         description: Internal server error
 */
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

    await logAuditAction({ table: 'Notification', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting notification');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/notifications/{id}/convert-to-wo:
 *   post:
 *     summary: Convert a notification into a corrective work order
 *     description: >
 *       Creates a CM work order from the notification, copies the location, equipment,
 *       priority and breakdown flag, links the notification to the new work order and
 *       sets the notification status to Converted. Only a notification the lifecycle map
 *       permits converting (Open or In Process) is accepted; a Completed notification
 *       is rejected with 400. workCenterId defaults to the first
 *       available work center; supervisorUserId defaults to the reporting user, then the
 *       authenticated user. Validated by the zod schema `convertNotificationSchema`
 *       (see utils/validation.ts). Requires the Maintenance Planner role.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification notificationId
 *     requestBody:
 *       required: false
 *       description: "Validated by zod `convertNotificationSchema`; both fields optional"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workCenterId: { type: string, description: "Defaults to the first available work center" }
 *               supervisorUserId: { type: string, description: "Defaults to the reporter, then the authenticated user" }
 *     responses:
 *       '201':
 *         description: Work order created from the notification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 workOrder: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, no work center is available, or the notification's current status does not permit conversion
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Notification not found
 *       '409':
 *         description: Notification has already been converted
 *       '500':
 *         description: Internal server error
 */
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
    // A completed notification is finished work; turning it back into a work
    // order would contradict the lifecycle. Same rule as the PUT transition
    // map, applied here so the convert path cannot bypass it.
    if (!canTransition(notification.status, 'Converted')) {
      return res.status(400).json({
        error: invalidTransitionMessage(notification.status, 'Converted'),
        currentStatus: notification.status,
        allowedTransitions: transitionTargets(notification.status),
      });
    }

    const woNumber = await generateWoNumber();

    const workCenters = await prisma.workCenter.findMany({ where: { isDeleted: false }, take: 1 });
    const defaultWorkCenter = workCenters[0];
    if (!defaultWorkCenter) {
      return res.status(400).json({ error: 'No active work center available' });
    }

    // SOW 3.3.1: a breakdown notification becomes an EM work order, and an EM
    // work order is the highest priority. The notification's own priority is
    // kept for non-breakdown conversions, where it is the reporter's judgement.
    const workOrderType = notification.breakdownFlag ? 'EM' : 'CM';

    const workOrder = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          woNumber,
          type: workOrderType,
          priority: resolveWorkOrderPriority(workOrderType, notification.priority),
          status: 'Draft',
          functionalLocation: { connect: { functionalLocationId: notification.functionalLocationId } },
          equipment: notification.equipmentId ? { connect: { equipmentId: notification.equipmentId } } : undefined,
          description: notification.description,
          workCenter: { connect: { workCenterId: req.body.workCenterId || defaultWorkCenter.workCenterId } },
          supervisor: { connect: { userId: req.body.supervisorUserId || notification.reportedByUserId || req.user!.userId } },
          // The person who reported the fault carries over from the notification.
          // This is the field that makes the corrective job answerable back to
          // its origin, and it is why Reported By is not just createdBy.
          reportedBy: { connect: { userId: notification.reportedByUserId } },
          breakdownFlag: notification.breakdownFlag,
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        },
      });

      await tx.workOrderNotifLink.create({
        data: {
          workOrderId: wo.workOrderId,
          notificationId: notification.notificationId,
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        },
      });

      await tx.notification.update({
        where: { notificationId: notification.notificationId },
        data: { status: 'Converted', modifiedBy: req.user!.userId },
      });

      return wo;
    });

    await logAuditAction({ table: 'WorkOrder', recordId: workOrder.workOrderId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });
    await logAuditFieldChange({ table: 'Notification', recordId: notification.notificationId, action: 'Update', field: 'status', oldValue: notification.status, newValue: 'Converted', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(workOrder);
  } catch (error) {
    logger.error({ err: error }, 'Error converting notification to work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;