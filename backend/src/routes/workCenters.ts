import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { workCenterCreateSchema, workCenterUpdateSchema, capacityQuerySchema, validate } from '../utils/validation.js';
import { buildCapacityBoard, CAPACITY_CONSUMING_STATUSES } from '../utils/capacity.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/work-centers:
 *   get:
 *     summary: List work centers
 *     description: Returns non-deleted work centers with their capacity and hourly cost rate.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of work centers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   workCenterId: { type: string }
 *                   code: { type: string }
 *                   name: { type: string }
 *                   dailyCapacityHours: { type: number, format: float }
 *                   costRatePerHour: { type: number, format: float, description: "Float-typed in v1.0.0; Decimal migration is v1.1" }
 *                   isActive: { type: boolean }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create a work center
 *     description: >
 *       Validated by the zod schema `workCenterCreateSchema` (see utils/validation.ts).
 *       Requires the Requester role. A duplicate code returns HTTP 409.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `workCenterCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, dailyCapacityHours, costRatePerHour]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *               dailyCapacityHours: { type: number, minimum: 0 }
 *               costRatePerHour: { type: number, minimum: 0 }
 *               isActive: { type: boolean }
 *     responses:
 *       '201':
 *         description: Work center created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '409':
 *         description: code already exists among active rows
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const workCenters = await prisma.workCenter.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
      include: {
        crafts: {
          where: { isDeleted: false },
          orderBy: { craftCode: 'asc' },
        },
      },
    });

    res.json(workCenters);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching work centers');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-centers/capacity:
 *   get:
 *     summary: Work centre capacity board
 *     description: >
 *       Loads each work centre's daily capacity (WorkCenter.dailyCapacityHours) with the
 *       planned hours of the work orders in a capacity-consuming status, spread evenly across
 *       the days of each work order's planned window, and split by craft.
 *
 *
 *       Draft work orders are excluded: a draft is a proposal, and a board that counts
 *       proposals cannot be used to decide what to schedule next. Completed, Closed and
 *       Cancelled are excluded because those hours are spent or will not be spent.
 *
 *       Work orders in a consuming status with no plannedStart cannot be placed on a day and
 *       are reported per centre as `unscheduledHours` and `unscheduledWorkOrders` rather than
 *       dropped, so undated committed work stays visible.
 *
 *       The range defaults to the next 14 days. Both bounds are inclusive and capped at 90
 *       days by `capacityQuerySchema` (see utils/validation.ts). Read-only: this endpoint
 *       books nothing and can be called by any authenticated role.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: First day of the board, YYYY-MM-DD. Defaults to today.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: Last day of the board, inclusive. Defaults to from + 13 days.
 *     responses:
 *       '200':
 *         description: Capacity board
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: Validation failed, or the range is inverted
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/capacity', async (req: Request, res: Response) => {
  try {
    const parsed = capacityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { from, to } = parsed.data;
    if (to < from) {
      return res.status(400).json({ error: 'The range end date must not precede the start date' });
    }

    const workCenters = await prisma.workCenter.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
      select: {
        workCenterId: true,
        code: true,
        name: true,
        dailyCapacityHours: true,
      },
    });

    // The window is fetched wider than the board on purpose. A work order that
    // starts before `from` and ends inside it still has to be spread over its
    // whole window, so its days-per-hour share depends on days the board never
    // shows. Querying only the visible range would make long jobs look far
    // heavier than they are.
    const rangeStart = new Date(`${from}T00:00:00Z`);
    const rangeEnd = new Date(`${to}T23:59:59.999Z`);

    const workOrders = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        status: { in: [...CAPACITY_CONSUMING_STATUSES] },
        OR: [
          { plannedFinish: { gte: rangeStart } },
          { plannedStart: { lte: rangeEnd } },
        ],
      },
      select: {
        workOrderId: true,
        woNumber: true,
        status: true,
        workCenterId: true,
        plannedStart: true,
        plannedFinish: true,
        operations: {
          select: { craftId: true, plannedHours: true },
        },
      },
    });

    const board = buildCapacityBoard(
      workCenters.map((wc) => ({
        workCenterId: wc.workCenterId,
        workCenterCode: wc.code,
        name: wc.name,
        dailyCapacityHours: wc.dailyCapacityHours,
      })),
      workOrders.map((w) => ({
        workOrderId: w.workOrderId,
        woNumber: w.woNumber,
        status: w.status,
        workCenterId: w.workCenterId,
        plannedStart: w.plannedStart ? w.plannedStart.toISOString() : null,
        plannedFinish: w.plannedFinish ? w.plannedFinish.toISOString() : null,
        operations: w.operations,
      })),
      from,
      to,
    );

    res.json(board);
  } catch (error) {
    logger.error({ err: error }, 'Error building work center capacity board');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-centers/{id}:
 *   get:
 *     summary: Get one work center
 *     description: >
 *       Returns a single non-deleted work center with its non-deleted crafts ordered by
 *       craftCode.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkCenter workCenterId
 *     responses:
 *       '200':
 *         description: Work center detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Work center not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const workCenter = await prisma.workCenter.findFirst({
      where: { workCenterId: id, isDeleted: false },
      include: {
        crafts: {
          where: { isDeleted: false },
          orderBy: { craftCode: 'asc' },
        },
      },
    });

    if (!workCenter) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    res.json(workCenter);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching work center');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(workCenterCreateSchema), async (req: Request, res: Response) => {
  try {
    const { code, name, dailyCapacityHours, costRatePerHour, isActive } = req.body;

    const workCenter = await prisma.workCenter.create({
      data: {
        code,
        name,
        dailyCapacityHours,
        costRatePerHour,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'WorkCenter', recordId: workCenter.workCenterId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(workCenter);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work center code already exists' });
    }
    logger.error({ err: error }, 'Error creating work center');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-centers/{id}:
 *   put:
 *     summary: Update a work center
 *     description: >
 *       Partial update - only fields present in the body are written. Validated by the zod
 *       schema `workCenterUpdateSchema` (see utils/validation.ts). Requires the Requester
 *       role.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkCenter workCenterId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `workCenterUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *               dailyCapacityHours: { type: number, minimum: 0 }
 *               costRatePerHour: { type: number, minimum: 0 }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: Work center updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Work center not found
 *       '409':
 *         description: code already in use by another active row
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(workCenterUpdateSchema), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workCenter.findFirst({
      where: { workCenterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    const { code, name, dailyCapacityHours, costRatePerHour, isActive } = req.body;

    const workCenter = await prisma.workCenter.update({
      where: { workCenterId: String(req.params.id) },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(dailyCapacityHours !== undefined && { dailyCapacityHours }),
        ...(costRatePerHour !== undefined && { costRatePerHour }),
        ...(isActive !== undefined && { isActive }),
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'WorkCenter', recordId: workCenter.workCenterId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(workCenter);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work center code already exists' });
    }
    logger.error({ err: error }, 'Error updating work center');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-centers/{id}:
 *   delete:
 *     summary: Soft delete a work center
 *     description: >
 *       Marks the work center isDeleted=true. Per rule 3.4 its crafts, plans, operations and
 *       users are retained. Requires the Maintenance Supervisor role. Writes an
 *       AuditLogEntry with action Delete.
 *     tags: [Work Centers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkCenter workCenterId
 *     responses:
 *       '200':
 *         description: Work center soft deleted
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
 *         description: Work center not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workCenter.findFirst({
      where: { workCenterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    await prisma.workCenter.update({
      where: { workCenterId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'WorkCenter', recordId: String(req.params.id), action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Work center deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work center');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
