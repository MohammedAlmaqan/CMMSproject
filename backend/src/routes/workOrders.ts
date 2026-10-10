import type { Prisma } from '@prisma/client';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditFieldChange, logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { generateWoNumber, generateNotifNumber } from '../utils/sequence.js';
import { isPrismaError } from '../utils/prismaErrors.js';
import { canTransition } from '../utils/transitions.js';
import { serializeWorkOrderSnapshot } from '../utils/workOrderSnapshots.js';
import { requiresAtLeastOneOperation, missingOperationMessage, resolveWorkOrderPriority, isCompletionBlockedForMissingCause, BREAKDOWN_CAUSE_REQUIRED_MESSAGE, isCompletionBlockedForMissingCalibrationResult, CALIBRATION_RESULT_REQUIRED_MESSAGE } from '../utils/workOrderRules.js';
import { findBlockingChecklist, describeBlockedChecklist } from '../utils/checklistRules.js';
import { ALERT_TYPE_WO_ASSIGNED, emitWorkOrderAlertSafely } from '../services/alertService.js';
import { logger } from '../utils/logger.js';
import {
  validate,
  workOrderCreateSchema,
  workOrderUpdateSchema,
  workOrderStatusBodySchema,
} from '../utils/validation.js';
import { workOrderImporter } from '../migration-trial/importers/workOrder.js';
import { parseCsv as parseTrialCsv } from '../migration-trial/importers/csv.js';
import { persistDataset } from '../migration-trial/liveImport.js';

const router = Router();

router.use(authenticate);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'text/csv') {
      return cb(new Error('Unsupported file type: only text/csv is allowed'));
    }
    cb(null, true);
  },
});

const WORK_ORDER_IMPORT_REQUIRED = [
  'woNumber',
  'type',
  'priority',
  'status',
  'functionalLocationId',
  'description',
  'workCenterId',
  'reportedByUserId',
  'createdBy',
  'createdDate',
] as const;

/**
 * @openapi
 * /api/work-orders/import.csv:
 *   post:
 *     summary: Bulk import work orders from CSV
 *     description: >
 *       Multipart upload with a single `file` part, mapped by the same rules as the
 *       migration trial importers. Requires the Maintenance Planner role. Foreign keys
 *       are given as natural keys - `functionalLocationId` is a location code,
 *       `equipmentId` an equipment code, `workCenterId` a work-centre code,
 *       `reportedByUserId` a username - and are resolved against live master data. A
 *       row is created, or updated when `woNumber` already exists among live rows. A
 *       row naming a natural key that does not exist live, or whose supervisor cannot
 *       be resolved, is rejected with a reason. A blank `supervisorUserId` is
 *       backfilled to the reporter, mirroring notification conversion.
 *     tags: [Work Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       '200':
 *         description: Import completed; per-row outcome reported
 *       '400':
 *         description: Malformed CSV, missing header columns, or no importable rows
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '500':
 *         description: Internal server error
 */
router.post('/import.csv', authorizeMinRole('Maintenance Planner'), csvUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = req.file.buffer.toString('utf8');
    let parsed;
    try {
      parsed = parseTrialCsv(text);
    } catch {
      return res.status(400).json({ error: 'Malformed CSV' });
    }
    if (parsed.rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    const header = parsed.headers.map((h) => h.trim().toLowerCase());
    const missing = WORK_ORDER_IMPORT_REQUIRED.filter((c) => !header.includes(c.toLowerCase()));
    if (missing.length > 0) {
      return res.status(400).json({ error: `CSV header is missing: ${missing.join(', ')}` });
    }

    const mapped = workOrderImporter.parse(parsed.rows);
    if (mapped.rows.length === 0) {
      return res.status(400).json({
        error: `No importable rows: ${mapped.rejected.map((r) => `row ${r.row}: ${r.reason}`).join('; ') || 'CSV has no data rows'}`,
      });
    }

    const result = await prisma.$transaction((tx) =>
      persistDataset(tx, workOrderImporter, mapped, { userId: req.user!.userId, ipAddress: req.ip })
    );

    res.json({ created: result.created, updated: result.updated, rejected: result.rejected });
  } catch (error) {
    logger.error({ err: error }, 'Error importing work orders');
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
 *     description: Returns a page of non-deleted work orders ordered by created date desc. Visibility is role-scoped (SOW 2.2) - a Technician sees their home work centre, a Supervisor their work centre or supervised orders, a Requester only their own.
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
    const where: Prisma.WorkOrderWhereInput = { isDeleted: false };

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

    // SOW 2.2: list visibility is role-scoped. Administrator, Maintenance
    // Planner and View-Only see everything; a Technician sees work orders in
    // their home work centre; a Supervisor sees their home work centre or any
    // work order they supervise; a Requester sees only what they raised.
    const role = req.user!.role;
    if (role === 'Technician' || role === 'Maintenance Supervisor') {
      const me = await prisma.user.findUnique({
        where: { userId: req.user!.userId },
        select: { workCenterId: true },
      });
      // workOrder.workCenterId is required, so a null home matches nothing;
      // an empty OR array is Prisma's way of expressing "match nothing", which
      // keeps that meaning when the filter is typed instead of `any`.
      const homeWorkCenterId = me?.workCenterId ?? null;
      const homeFilter: Prisma.WorkOrderWhereInput[] = homeWorkCenterId ? [{ workCenterId: homeWorkCenterId }] : [];
      where.AND = [
        role === 'Technician'
          ? { OR: homeFilter }
          : { OR: [...homeFilter, { supervisorUserId: req.user!.userId }] },
      ];
    } else if (role === 'Requester') {
      where.AND = [{ reportedByUserId: req.user!.userId }];
    }

    const skipNum = skip ? parseInt(skip as string, 10) || 0 : 0;
    const takeNum = take ? parseInt(take as string, 10) || 50 : 50;

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          functionalLocation: { select: { functionalLocationId: true, locationCode: true, description: true } },
          equipment: { select: { equipmentId: true, equipmentCode: true, name: true } },
          workCenter: { select: { workCenterId: true, code: true, name: true } },
          causeCode: { select: { causeCodeId: true, code: true, description: true } },
          failureCode: { select: { failureCodeId: true, code: true, description: true } },
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
        causeCode: true,
        failureCode: true,
        supervisor: { select: { userId: true, fullName: true, username: true } },
    reportedBy: { select: { userId: true, fullName: true, username: true } },
        operations: { where: { isDeleted: false }, include: { craft: true }, orderBy: { sequenceNumber: 'asc' } },
        // operation included so the screen can group a material line under the
        // step that needs it, which is the point of SOW 3.1.5.
        woMaterials: { where: { isDeleted: false }, include: { material: true, operation: true } },
        externalServices: { where: { isDeleted: false } },
        checklists: {
          where: { isDeleted: false },
          include: {
            template: true,
            items: { where: { isDeleted: false }, include: { item: true } },
          },
        },
        costSplits: { where: { isDeleted: false } },
        notifications: {
          where: { isDeleted: false },
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
      where: { entityType: 'WorkOrder', entityId: workOrder.workOrderId, isDeleted: false },
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
 *     description: >
 *       Creates a Draft work order. Requires role Requester or higher. Passing
 *       taskListId copies that reusable task list's operations onto the new work
 *       order (SOW 3.1.4) in the same transaction, so a work order never exists
 *       without the operations it was created from. Copied operations carry the
 *       template's plan and start Pending with zero actual hours.
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
 *               taskListId:
 *                 type: string
 *                 nullable: true
 *                 description: Reusable task list whose operations are copied onto this work order
 *     responses:
 *       '201':
 *         description: Work order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '400':
 *         description: Validation failed, or the task list was not found or has no operations
 *       '409':
 *         description: Work order number already exists
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/work-orders/{id}/history:
 *   get:
 *     summary: Work order history (immutable snapshots)
 *     description: >
 *       SOW 3.6. Returns the complete snapshot of the work order taken at each
 *       status change, oldest first. Snapshot rows are append-only: they are
 *       created only inside a successful status transition and have no update
 *       or delete surface anywhere in the API.
 *     tags: [Work Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Chronological list of immutable snapshots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       snapshotId: { type: string }
 *                       workOrderId: { type: string }
 *                       status: { type: string }
 *                       takenAt: { type: string, format: date-time }
 *                       takenBy:
 *                         type: object
 *                         properties:
 *                           userId: { type: string }
 *                           fullName: { type: string }
 *                           username: { type: string }
 *                       snapshot: { type: object }
 *                 total: { type: integer }
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/:id/history',
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const workOrder = await prisma.workOrder.findFirst({
        where: { workOrderId: id, isDeleted: false },
        select: { workOrderId: true },
      });
      if (!workOrder) {
        return res.status(404).json({ error: 'Work order not found' });
      }

      // SOW 3.6 work order history. Snapshots are append-only by construction:
      // nothing in the API can create one except a successful status change, and
      // there is no update or delete route on this model at all. The snapshot
      // JSON is returned as stored so a reader can see the work order exactly as
      // it was at each change.
      const data = await prisma.workOrderSnapshot.findMany({
        where: { workOrderId: id },
        include: {
          takenBy: { select: { userId: true, fullName: true, username: true } },
        },
        orderBy: { takenAt: 'asc' },
      });

      res.json({ data, total: data.length });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching work order history');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post('/', authorizeMinRole('Requester'), validate(workOrderCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      type, priority, functionalLocationId, equipmentId, description,
      workCenterId, supervisorUserId, reportedByUserId, plannedStart, plannedFinish,
      costCenterCode, internalOrder, breakdownFlag, safetyCriticalFlag,
      causeCodeId, failureCodeId,
      safetyNotes, completionRemarks,
      calibrationResult, calibrationAsFound, calibrationAsLeft,
      calibrationReferenceStandard, calibrationDueDate,
      calibrationIntervalValue, calibrationIntervalUnit,
      taskListId,
    } = req.body;

    // The number is allocated before the transaction opens, because the sequence
    // helper talks to the shared Prisma client rather than the transaction. A
    // failed create therefore leaves a gap in the numbering, which is the right
    // trade: a gap is visible and harmless, whereas allocating inside the
    // transaction and rolling back would silently reuse a number.
    const woNumber = await generateWoNumber();

    // SOW 3.3.1: an emergency work order is forced to the highest priority
    // whatever the caller sends, so a busy planner cannot raise an emergency at
    // Medium. The override is visible in the 201 body rather than silent.
    const effectivePriority = resolveWorkOrderPriority(type, priority);

    // SOW 3.1.4: copy the reusable task list's operations onto the new work
    // order. Validated before the write so a bad template cannot leave a
    // half-built work order behind.
    let templateOperations: {
      sequenceNumber: number;
      description: string;
      craftId: string;
      plannedHours: number;
      numberOfTechnicians: number;
      materials: { materialId: string; quantity: number; standardCost: number }[];
    }[] = [];

    if (taskListId) {
      const taskList = await prisma.taskList.findFirst({
        where: { taskListId, isDeleted: false },
        include: {
          operations: {
            where: { isDeleted: false },
            orderBy: { sequenceNumber: 'asc' },
            include: { materials: { include: { material: true } } },
          },
        },
      });
      if (!taskList) {
        return res.status(400).json({ error: 'Task list not found' });
      }
      if (taskList.operations.length === 0) {
        // Copying an empty template would produce a work order with no
        // operations, which is exactly what SOW 3.3.3 forbids and what the
        // planner did not ask for.
        return res.status(400).json({ error: 'Task list has no operations to copy' });
      }
      templateOperations = taskList.operations.map((op) => ({
        sequenceNumber: op.sequenceNumber,
        description: op.description,
        craftId: op.craftId,
        plannedHours: op.plannedHours,
        numberOfTechnicians: op.numberOfTechnicians,
        materials: op.materials.map((m) => ({
          materialId: m.materialId,
          quantity: m.quantity,
          standardCost: Number(m.material.standardCost || 0),
        })),
      }));
    }

    const workOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.workOrder.create({
        data: {
          woNumber,
          type,
          priority: effectivePriority,
          functionalLocationId,
          equipmentId: equipmentId || null,
          description,
          workCenterId,
          supervisorUserId,
          reportedByUserId: reportedByUserId || req.user!.userId,
          plannedStart: plannedStart ? new Date(plannedStart) : null,
          plannedFinish: plannedFinish ? new Date(plannedFinish) : null,
          costCenterCode: costCenterCode || '',
          internalOrder: internalOrder || '',
          breakdownFlag: breakdownFlag || false,
          safetyCriticalFlag: safetyCriticalFlag || false,
          causeCodeId: causeCodeId ?? null,
          failureCodeId: failureCodeId ?? null,
          safetyNotes: safetyNotes ?? null,
          completionRemarks: completionRemarks ?? null,
          calibrationResult: calibrationResult ?? null,
          calibrationAsFound: calibrationAsFound ?? null,
          calibrationAsLeft: calibrationAsLeft ?? null,
          calibrationReferenceStandard: calibrationReferenceStandard ?? null,
          calibrationDueDate: calibrationDueDate ? new Date(calibrationDueDate) : null,
          calibrationIntervalValue: calibrationIntervalValue ?? null,
          calibrationIntervalUnit: calibrationIntervalUnit ?? null,
          status: 'Draft',
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        },
      });

      // Copied operations start Pending with zero actual hours: the template
      // carries the PLAN, and the actuals are the technician's to record.
      for (const op of templateOperations) {
        const createdOperation = await tx.workOrderOperation.create({
          data: {
            workOrderId: created.workOrderId,
            sequenceNumber: op.sequenceNumber,
            description: op.description,
            craftId: op.craftId,
            plannedHours: op.plannedHours,
            numberOfTechnicians: op.numberOfTechnicians,
            actualHours: 0,
            status: 'Pending',
            createdBy: req.user!.userId,
            modifiedBy: req.user!.userId,
          },
        });

        // SOW 3.1.4 requirements arrive as SOW 3.1.5 planned material lines on
        // the copied operation. unitCost is taken from the material's standard
        // cost rather than left at 0, because planned material cost is
        // plannedQuantity x unitCost: a zero rate would quietly understate the
        // work order's planned cost by the whole parts bill.
        //
        // A material required by two different steps becomes two lines, one per
        // operation. That is deliberate: each line is the cost of that step, and
        // collapsing them would put the whole quantity against whichever step
        // happened to be copied first.
        for (const required of op.materials) {
          await tx.workOrderMaterial.create({
            data: {
              workOrderId: created.workOrderId,
              operationId: createdOperation.operationId,
              materialId: required.materialId,
              plannedQuantity: required.quantity,
              actualQuantity: 0,
              unitCost: required.standardCost,
              reservationQuantity: 0,
            },
          });
        }
      }

      return created;
    });

    if (templateOperations.length > 0) {
      // Planned cost is derived from the operations, so the new work order's
      // totals are otherwise left at zero until something else touches them.
      await recomputeWorkOrderCosts(workOrder.workOrderId, { userId: req.user!.userId, ipAddress: req.ip });
    }

    await logAuditAction({ table: 'WorkOrder', recordId: workOrder.workOrderId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    // SOW 3.8 (row 69): assigning a work order alerts the assignee and the work
    // centre's supervisor. Best-effort: a failed alert must not turn a work
    // order that was created successfully into a 500.
    await emitWorkOrderAlertSafely(
      prisma,
      workOrder,
      {
        alertType: ALERT_TYPE_WO_ASSIGNED,
        title: 'Work Order Assigned',
        message: `Work order ${workOrder.woNumber} has been assigned`,
        relatedEntityId: workOrder.workOrderId,
        relatedEntityType: 'WorkOrder',
      },
      `work order assignment ${workOrder.woNumber}`
    );

    res.status(201).json(workOrder);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2002') {
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
      workCenterId, supervisorUserId, reportedByUserId, plannedStart, plannedFinish,
      actualStart, actualFinish, costCenterCode, internalOrder,
      breakdownFlag, safetyCriticalFlag, status,
      causeCodeId, failureCodeId,
      safetyNotes, completionRemarks,
      calibrationResult, calibrationAsFound, calibrationAsLeft,
      calibrationReferenceStandard, calibrationDueDate,
      calibrationIntervalValue, calibrationIntervalUnit,
    } = req.body;

    // SOW 3.3.1: if this edit leaves the work order an emergency — whether by
    // changing its type to EM or by editing an existing emergency — the highest
    // priority is enforced, not merely suggested.
    const effectivePriority = resolveWorkOrderPriority(type ?? existing.type, priority ?? existing.priority);

    await prisma.workOrder.update({
      where: { workOrderId: id },
      data: {
        ...(type !== undefined && { type }),
        priority: effectivePriority,
        ...(functionalLocationId !== undefined && { functionalLocationId }),
        ...(equipmentId !== undefined && { equipmentId: equipmentId || null }),
        ...(description !== undefined && { description }),
        ...(workCenterId !== undefined && { workCenterId }),
        ...(supervisorUserId !== undefined && { supervisorUserId }),
      ...(reportedByUserId !== undefined && { reportedByUserId }),
        ...(plannedStart !== undefined && { plannedStart: plannedStart ? new Date(plannedStart) : null }),
        ...(plannedFinish !== undefined && { plannedFinish: plannedFinish ? new Date(plannedFinish) : null }),
        ...(actualStart !== undefined && { actualStart: actualStart ? new Date(actualStart) : null }),
        ...(actualFinish !== undefined && { actualFinish: actualFinish ? new Date(actualFinish) : null }),
        ...(costCenterCode !== undefined && { costCenterCode }),
        ...(internalOrder !== undefined && { internalOrder }),
        ...(breakdownFlag !== undefined && { breakdownFlag }),
        ...(safetyCriticalFlag !== undefined && { safetyCriticalFlag }),
        ...(causeCodeId !== undefined && { causeCodeId }),
        ...(failureCodeId !== undefined && { failureCodeId }),
        ...(safetyNotes !== undefined && { safetyNotes }),
        ...(completionRemarks !== undefined && { completionRemarks }),
        ...(calibrationResult !== undefined && { calibrationResult }),
        ...(calibrationAsFound !== undefined && { calibrationAsFound }),
        ...(calibrationAsLeft !== undefined && { calibrationAsLeft }),
        ...(calibrationReferenceStandard !== undefined && { calibrationReferenceStandard }),
        ...(calibrationDueDate !== undefined && {
          calibrationDueDate: calibrationDueDate ? new Date(calibrationDueDate) : null,
        }),
        ...(calibrationIntervalValue !== undefined && { calibrationIntervalValue }),
        ...(calibrationIntervalUnit !== undefined && { calibrationIntervalUnit }),
        ...(status !== undefined && { status }),
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(id, { userId: req.user!.userId, ipAddress: req.ip });

    const updated = await prisma.workOrder.findUnique({ where: { workOrderId: id } });

    // Per-column diffs rather than one generic "Update" row: the trail should
    // say which column moved and from what to what, so a reassignment or a
    // priority change is legible without cross-referencing another table. Read
    // after the cost recompute so `updated` is the settled row; the cost columns
    // are absent from AUDITED_FIELDS.WorkOrder because costs.ts already diffs
    // them, and listing them here would log that change twice.
    if (updated) {
      await logFieldChanges({
        table: 'WorkOrder',
        recordId: id,
        before: existing,
        after: updated,
        fields: AUDITED_FIELDS.WorkOrder,
        userId: req.user!.userId,
        ipAddress: req.ip,
      });
    }

    // SOW 3.8 (row 69): a reassignment is an assignment. Alert only when the
    // supervisor actually changes, so a routine edit that echoes the same
    // supervisor does not re-announce the job.
    if (updated && supervisorUserId !== undefined && supervisorUserId !== existing.supervisorUserId) {
      await emitWorkOrderAlertSafely(
        prisma,
        updated,
        {
          alertType: ALERT_TYPE_WO_ASSIGNED,
          title: 'Work Order Assigned',
          message: `Work order ${updated.woNumber} has been assigned`,
          relatedEntityId: updated.workOrderId,
          relatedEntityType: 'WorkOrder',
        },
        `work order assignment ${updated.woNumber}`
      );
    }

    res.json(updated);
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

    await logAuditAction({ table: 'WorkOrder', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Closing a work order is a sign-off, not a field action, so it is held to a
 * higher role than the other transitions: Maintenance Supervisor or
 * Administrator. Every other transition keeps the Technician floor. Placed
 * after validate() so the parsed body is available, and before the handler.
 */
function requireSupervisorForClose(req: Request, res: Response, next: NextFunction) {
  if (req.body?.status === 'Closed') {
    return authorizeMinRole('Maintenance Supervisor')(req, res, next);
  }
  next();
}

/**
 * @openapi
 * /api/work-orders/{id}/status:
 *   put:
 *     summary: Transition work order status
 *     description: >
 *       Applies a valid workflow transition (Draft/Planned/Scheduled/In Progress/Completed/Suspended/Closed/Cancelled).
 *       Sets actualStart/actualFinish timestamps. Transitioning to In Progress
 *       requires every mandatory safety checklist on the work order to be
 *       Completed, otherwise 409. Transitioning to Closed requires the
 *       Maintenance Supervisor or Administrator role, otherwise 403.
 *
 *       Transitioning to Completed additionally performs, in the same
 *       transaction as the status change so the work order can never be
 *       Completed without them (SOW 3.2.1 and 3.2.3):
 *         - autogenerates an M3 Completion Confirmation notification, open
 *           against the work order's location and equipment, raised by the
 *           user who completed it (SOW 3.2.1, M3);
 *         - moves every notification this work order was converted from from
 *           Converted to Completed, so the conversion queue clears
 *           (SOW 3.2.3).
 *       The work order transition map has no path out of Completed, so both run
 *       exactly once per work order.
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
 *       '403':
 *         description: Insufficient permissions (closing requires Maintenance Supervisor or Administrator)
 *       '409':
 *         description: >
 *           Transition blocked. Either a mandatory safety checklist is not
 *           complete (transition to In Progress), or the work order has no
 *           operations yet (any transition out of Draft into a planned,
 *           scheduled or in-progress state, per SOW 3.3.3).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 checklist: { type: string }
 *       '404':
 *         description: Work order not found
 *       '500':
 *         description: Internal server error
 */
router.put(
  '/:id/status',
  authorizeMinRole('Technician'),
  validate(workOrderStatusBodySchema),
  requireSupervisorForClose,
  async (req: Request, res: Response) => {
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

    if (requiresAtLeastOneOperation(workOrder.status, newStatus)) {
      const operationCount = await prisma.workOrderOperation.count({ where: { workOrderId: id, isDeleted: false } });
      if (operationCount === 0) {
        await logAuditFieldChange({

            table: 'WorkOrder',
            recordId: id,
            action: 'Blocked',
            field: 'status',
            oldValue: workOrder.status,
            newValue: newStatus,
            userId: req.user!.userId,
            ipAddress: req.ip,
          });
        return res.status(409).json({ error: missingOperationMessage() });
      }
    }

    if (newStatus === 'In Progress') {
      // SOW 3.3.7. Every mandatory checklist must be signed off AND have every
      // item answered. The item test used to look for a blank response, which
      // could never match because attach pre-filled 'NA'; the rule now keys off
      // an unanswered (null) item instead. See utils/checklistRules.ts.
      const mandatoryChecklists = await prisma.workOrderChecklist.findMany({
        where: { workOrderId: id, isDeleted: false, template: { isMandatory: true, isDeleted: false } },
        select: {
          status: true,
          template: { select: { name: true } },
          items: { where: { isDeleted: false }, select: { response: true } },
        },
      });

      const blockingChecklist = findBlockingChecklist(
        mandatoryChecklists.map((c) => ({
          templateName: c.template.name,
          status: c.status,
          items: c.items.map((i) => i.response),
        }))
      );
      if (blockingChecklist) {
        const blocked = describeBlockedChecklist(blockingChecklist);
        await logAuditFieldChange({

            table: 'WorkOrder',
            recordId: id,
            action: 'Blocked',
            field: 'status',
            oldValue: workOrder.status,
            newValue: newStatus,
            userId: req.user!.userId,
            ipAddress: req.ip,
          });
        return res.status(409).json({
          error: blocked.ok ? '' : blocked.error,
          checklist: blockingChecklist.templateName,
          checklistStatus: blockingChecklist.status,
        });
      }
    }

    // SOW 3.1.4 (D5): a breakdown cannot be completed until it names a cause.
    // Blocked and audited like the other transition guards, so the trail says
    // who tried and what was missing.
    if (
      isCompletionBlockedForMissingCause({
        nextStatus: newStatus,
        breakdownFlag: workOrder.breakdownFlag,
        causeCodeId: workOrder.causeCodeId,
      })
    ) {
      await logAuditFieldChange({

          table: 'WorkOrder',
          recordId: id,
          action: 'Blocked',
          field: 'status',
          oldValue: workOrder.status,
          newValue: newStatus,
          userId: req.user!.userId,
          ipAddress: req.ip,
        });
      return res.status(409).json({ error: BREAKDOWN_CAUSE_REQUIRED_MESSAGE });
    }

    // SOW 3.3.1 (row 24): a calibration work order cannot be completed without a
    // pass/fail result. Same shape as the cause gate above: blocked, audited,
    // and read from the stored value so saving the result and completing are
    // independent calls.
    if (
      isCompletionBlockedForMissingCalibrationResult({
        nextStatus: newStatus,
        type: workOrder.type,
        calibrationResult: workOrder.calibrationResult,
      })
    ) {
      await logAuditFieldChange({
        table: 'WorkOrder',
        recordId: id,
        action: 'Blocked',
        field: 'status',
        oldValue: workOrder.status,
        newValue: newStatus,
        userId: req.user!.userId,
        ipAddress: req.ip,
      });
      return res.status(409).json({ error: CALIBRATION_RESULT_REQUIRED_MESSAGE });
    }

    const updateData: Prisma.WorkOrderUpdateInput = {
      status: newStatus,
      modifiedBy: req.user!.userId,
    };

    if (newStatus === 'In Progress' && !workOrder.actualStart) {
      updateData.actualStart = new Date();
    }
    if (newStatus === 'Completed' || newStatus === 'Closed') {
      updateData.actualFinish = new Date();
    }

    // SOW 3.2.1 and 3.2.3. Completing a work order does two more things, and
    // both are done in the same transaction as the status change so the work
    // order can never be Completed without them:
    //
    //   row 15  an M3 Completion Confirmation notification is autogenerated
    //   row 22  every notification this work order was converted from moves
    //           Converted -> Completed, so the conversion queue clears
    //
    // The work order transition map has no path out of Completed, so this runs
    // exactly once per work order.
    const linkedNotifications =
      newStatus === 'Completed'
        ? await prisma.workOrderNotifLink.findMany({
            where: { workOrderId: id, isDeleted: false },
            select: { notificationId: true },
          })
        : [];

    // Generated before the transaction, matching convert-to-wo: the sequence is
    // allocated from its own table and does not need to roll back with the work
    // order update.
    const m3Number = newStatus === 'Completed' ? await generateNotifNumber() : null;

    // The M3 is created inside the transaction but the audit is written after
    // it, so the new notification's id is carried out of the callback. Auditing
    // the work order id here would file a Notification record against the wrong
    // row, which is exactly the kind of trail that cannot be trusted later.
    let createdM3Id: string | null = null;
    // Only notifications this call actually moved are audited. A link whose
    // status the lifecycle refused to change was not modified, and recording a
    // status change for it would be a false entry in the trail.
    // The status each notification was moved FROM, so the audit row records a
    // real diff rather than only the value it ended on.
    const completedLinks: { notificationId: string; from: string }[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.update({
        where: { workOrderId: id },
        data: updateData,
      });

      // SOW 3.6 work order history: a complete, immutable snapshot of the work
      // order at each major status change. Written in the same transaction as
      // the status move so a work order can never change status without its
      // history entry; the copied row is the state it now holds, which is what
      // each snapshot means. There is no update or delete surface for these
      // rows anywhere in the API.
      //
      // R.9: a snapshot must record the *derived* cost, not the cache. The
      // recompute runs first, on this transaction's client, so it reads the
      // rows this transaction has just written; a global client could not see
      // them and would compute zero. Its return value is the figure it stored,
      // so the snapshot and the columns cannot disagree. Both the recompute and
      // its audit rows commit or roll back with the status change.
      const derived = await recomputeWorkOrderCosts(
        wo.workOrderId,
        { userId: req.user!.userId, ipAddress: req.ip },
        tx
      );

      await tx.workOrderSnapshot.create({
        data: {
          workOrderId: wo.workOrderId,
          status: wo.status,
          snapshot: serializeWorkOrderSnapshot(
            wo as unknown as Record<string, unknown>,
            derived
          ),
          takenByUserId: req.user!.userId,
        },
      });

      if (newStatus === 'Completed') {
        for (const link of linkedNotifications) {
          const notif = await tx.notification.findFirst({
            where: { notificationId: link.notificationId, isDeleted: false },
            select: { status: true },
          });
          // Only move it if the lifecycle actually permits it; a notification
          // already Completed by hand is left alone rather than rewritten.
          if (notif && canTransition(notif.status, 'Completed')) {
            await tx.notification.update({
              where: { notificationId: link.notificationId },
              data: { status: 'Completed', modifiedBy: req.user!.userId },
            });
            completedLinks.push({ notificationId: link.notificationId, from: notif.status });
          }
        }

        const m3 = await tx.notification.create({
          data: {
            notificationNumber: m3Number!,
            type: 'M3',
            priority: workOrder.priority,
            functionalLocationId: workOrder.functionalLocationId,
            equipmentId: workOrder.equipmentId,
            reportedByUserId: req.user!.userId,
            description: `Completion confirmation for work order ${workOrder.woNumber}`,
            breakdownFlag: workOrder.breakdownFlag,
            status: 'Open',
            createdBy: req.user!.userId,
            modifiedBy: req.user!.userId,
          },
          select: { notificationId: true },
        });
        createdM3Id = m3.notificationId;
      }

      return wo;
    });

    await logAuditFieldChange({ table: 'WorkOrder', recordId: id, action: 'Update', field: 'status', oldValue: workOrder.status, newValue: newStatus, userId: req.user!.userId, ipAddress: req.ip });

    if (newStatus === 'Completed') {
      for (const link of completedLinks) {
        await logAuditFieldChange({ table: 'Notification', recordId: link.notificationId, action: 'Update', field: 'status', oldValue: link.from, newValue: 'Completed', userId: req.user!.userId, ipAddress: req.ip });
      }
      // The M3 was created here, so there is no prior value to record; the
      // field is what makes the row meaningful, and null says so honestly.
      await logAuditFieldChange({ table: 'Notification', recordId: createdM3Id!, action: 'Create', field: 'type', oldValue: null, newValue: 'M3', userId: req.user!.userId, ipAddress: req.ip });
    }

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order status');
    res.status(500).json({ error: 'Internal server error' });
  }
  }
);

export default router;