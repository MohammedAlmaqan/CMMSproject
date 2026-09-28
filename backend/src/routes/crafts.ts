import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, craftCreateSchema, craftUpdateSchema } from '../utils/validation.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/crafts:
 *   get:
 *     summary: List crafts
 *     description: >
 *       Returns all non-deleted crafts ordered by craftCode ascending. Read-only reference
 *       endpoint - no role restriction beyond authentication, so any signed-in user can
 *       populate a craft dropdown.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of crafts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   craftId: { type: string }
 *                   workCenterId: { type: string }
 *                   craftCode: { type: string }
 *                   description: { type: string }
 *                   hourlyRate: { type: number, format: float, description: "Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number" }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *                   isDeleted: { type: boolean }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const crafts = await prisma.craft.findMany({
      where: { isDeleted: false },
      orderBy: { craftCode: 'asc' },
    });

    res.json(crafts);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching crafts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SOW 3.1.3 with decision D-16: crafts are assigned to a work centre and each
// carries its own hourly rate, and that rate is what 3.5.1 cost estimation
// consumes. The model columns were already correct; the collection was simply
// never writable, so a planner could not staff a work centre or correct a rate.
// Rule 3.4 applies: crafts are retired with isDeleted=true rather than removed,
// because WorkOrderOperation and TaskListOperation both reference a craft and
// historical labour cost must stay resolvable.

/**
 * @openapi
 * /api/crafts:
 *   post:
 *     summary: Assign a craft to a work centre with its own hourly rate
 *     description: >
 *       Creates a craft under a work centre. The hourly rate is required, not
 *       defaulted, so a craft can never enter costing as a silent zero. Rejects
 *       an unknown or deleted work centre and a duplicate craft code within
 *       that work centre. Per decision D-16 the rate is stored per craft; the
 *       Float to Decimal migration is deferred to v1.1.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workCenterId, craftCode, description, hourlyRate]
 *             properties:
 *               workCenterId: { type: string }
 *               craftCode: { type: string }
 *               description: { type: string }
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *                 description: "Craft-specific rate. Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number"
 *     responses:
 *       '201':
 *         description: Craft created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 craftId: { type: string }
 *                 workCenterId: { type: string }
 *                 craftCode: { type: string }
 *                 description: { type: string }
 *                 hourlyRate: { type: number, format: float }
 *       '400':
 *         description: Validation failed, or the work centre is not available
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '409':
 *         description: That craft code already exists in this work centre
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorizeMinRole('Maintenance Planner'), validate(craftCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workCenterId, craftCode, description, hourlyRate } = req.body;

    const workCenter = await prisma.workCenter.findFirst({
      where: { workCenterId, isDeleted: false },
      select: { workCenterId: true },
    });
    if (!workCenter) {
      return res.status(400).json({ error: 'Work center not found' });
    }

    const duplicate = await prisma.craft.findFirst({
      where: { workCenterId, craftCode, isDeleted: false },
      select: { craftId: true },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Craft code already exists in this work center' });
    }

    const craft = await prisma.craft.create({
      data: {
        workCenterId,
        craftCode,
        description,
        hourlyRate,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'Craft', recordId: craft.craftId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(craft);
  } catch (error) {
    logger.error({ err: error }, 'Error creating craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/crafts/{id}:
 *   get:
 *     summary: Get one craft
 *     description: Returns a single non-deleted craft by its craftId.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     responses:
 *       '200':
 *         description: The craft
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Craft not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const craft = await prisma.craft.findFirst({
      where: { craftId: String(req.params.id), isDeleted: false },
    });
    if (!craft) {
      return res.status(404).json({ error: 'Craft not found' });
    }
    res.json(craft);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/crafts/{id}:
 *   put:
 *     summary: Edit a craft's rate, code or description
 *     description: >
 *       Partial update. Only fields present in the body are written, so a caller
 *       correcting one rate does not blank the description. A craft code that
 *       already exists elsewhere in the same work centre is refused. Retired
 *       crafts are not editable.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               craftCode: { type: string }
 *               description: { type: string }
 *               hourlyRate: { type: number, minimum: 0 }
 *     responses:
 *       '200':
 *         description: Craft updated
 *       '400':
 *         description: Validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Craft not found
 *       '409':
 *         description: That craft code already exists in this work center
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Maintenance Planner'), validate(craftUpdateSchema), async (req: Request, res: Response) => {
  try {
    const craftId = String(req.params.id);
    const existing = await prisma.craft.findFirst({
      where: { craftId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Craft not found' });
    }

    if (req.body.craftCode !== undefined && req.body.craftCode !== existing.craftCode) {
      const duplicate = await prisma.craft.findFirst({
        where: {
          workCenterId: existing.workCenterId,
          craftCode: req.body.craftCode,
          isDeleted: false,
          NOT: { craftId },
        },
        select: { craftId: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Craft code already exists in this work center' });
      }
    }

    const craft = await prisma.craft.update({
      where: { craftId },
      data: {
        ...(req.body.craftCode !== undefined && { craftCode: req.body.craftCode }),
        ...(req.body.description !== undefined && { description: req.body.description }),
        ...(req.body.hourlyRate !== undefined && { hourlyRate: req.body.hourlyRate }),
        modifiedBy: req.user!.userId,
      },
    });

    // Field diffs rather than one generic "Update" row: the trail should
    // say which column moved and from what to what. A PUT that changes
    // nothing records nothing, which is the honest outcome.
    await logFieldChanges({
      table: 'Craft',
      recordId: craftId,
      before: existing,
      after: craft,
      fields: AUDITED_FIELDS.Craft,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(craft);
  } catch (error) {
    logger.error({ err: error }, 'Error updating craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/crafts/{id}:
 *   delete:
 *     summary: Retire a craft
 *     description: >
 *       Sets isDeleted=true. Crafts are retired rather than removed because
 *       work order and task list operations reference them and historical
 *       labour cost must stay resolvable. A craft already in use by an operation
 *       is refused with 409 so an active plan cannot lose its cost basis.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     responses:
 *       '200':
 *         description: Craft retired
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
 *         description: Craft not found
 *       '409':
 *         description: Craft is still referenced by a work order operation or a task list step
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const craftId = String(req.params.id);
    const existing = await prisma.craft.findFirst({
      where: { craftId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Craft not found' });
    }

    // A craft referenced only by a task list must block retirement too. The
    // template holds the id, and C.6 copies it verbatim onto every work order
    // created from that template, so retiring the craft would silently produce
    // work orders whose steps point at a craft that appears in no craft list.
    // Soft-deleted steps are ignored: a retired template is not a live plan.
    const [inWorkOrders, inTaskLists] = await Promise.all([
      prisma.workOrderOperation.count({ where: { craftId } }),
      prisma.taskListOperation.count({ where: { craftId, isDeleted: false } }),
    ]);
    if (inWorkOrders > 0 || inTaskLists > 0) {
      const sources = [
        inWorkOrders > 0 ? 'a work order operation' : null,
        inTaskLists > 0 ? 'a task list step' : null,
      ].filter(Boolean);
      return res.status(409).json({
        error: `Craft is still referenced by ${sources.join(' and ')}`,
      });
    }

    await prisma.craft.update({
      where: { craftId },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'Craft', recordId: craftId, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Craft deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;