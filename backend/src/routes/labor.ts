import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, laborCreateSchema, laborUpdateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/labor:
 *   get:
 *     summary: List labor entries
 *     description: >
 *       Returns labour bookings for a single work order, resolving that work order's
 *       operations and matching entries newest first. workOrderId is mandatory and returns
 *       HTTP 400 when omitted, so this endpoint is always scoped to one work order.
 *     tags: [Labor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: workOrderId
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrder workOrderId - required; this endpoint is always scoped to one work order
 *     responses:
 *       '200':
 *         description: Array of labor entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   laborEntryId: { type: string }
 *                   operationId: { type: string }
 *                   userId: { type: string }
 *                   hoursWorked: { type: number, format: float }
 *                   entryDateTime: { type: string, format: date-time }
 *                   notes: { type: string, nullable: true }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *       '400':
 *         description: workOrderId query parameter is required
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Book labour against an operation
 *     description: >
 *       Validated by the zod schema \`laborCreateSchema\` (see utils/validation.ts).
 *       Requires the Technician role. The referenced operation and user must both exist,
 *       otherwise HTTP 404 is returned. The owning work order's cost is recomputed from
 *       the craft hourly rate once the entry is saved.
 *     tags: [Labor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `laborCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operationId, userId, hoursWorked]
 *             properties:
 *               operationId: { type: string }
 *               userId: { type: string }
 *               hoursWorked: { type: number, format: float }
 *               entryDateTime: { type: string, format: date-time, description: "Defaults to now" }
 *               notes: { type: string }
 *     responses:
 *       '201':
 *         description: Labor entry created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId } = req.query;
    if (!workOrderId) {
      return res.status(400).json({ error: 'workOrderId query parameter is required' });
    }

    const operations = await prisma.workOrderOperation.findMany({
      where: { workOrderId: workOrderId as string },
      select: { operationId: true },
    });

    const operationIds = operations.map((op) => op.operationId);

    const laborEntries = await prisma.laborEntry.findMany({
      where: { operationId: { in: operationIds }, isDeleted: false },
      include: {
        operation: { select: { operationId: true, description: true, sequenceNumber: true } },
        user: { select: { userId: true, fullName: true, username: true } },
      },
      orderBy: { entryDateTime: 'desc' },
    });

    res.json(laborEntries);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching labor entries');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(laborCreateSchema), async (req: Request, res: Response) => {
  try {
    const { operationId, userId, hoursWorked, entryDateTime, notes } = req.body;

    const [opExists, userExists] = await Promise.all([
      prisma.workOrderOperation.findUnique({ where: { operationId } }),
      prisma.user.findUnique({ where: { userId } }),
    ]);
    if (!opExists) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const entry = await prisma.laborEntry.create({
      data: {
        operationId,
        userId,
        hoursWorked,
        entryDateTime: entryDateTime ? new Date(entryDateTime) : new Date(),
        notes: notes || null,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    const op = await prisma.workOrderOperation.findUnique({ where: { operationId } });
    if (op) await recomputeWorkOrderCosts(op.workOrderId);

    await logAudit(
      { tableName: 'LaborEntry', recordId: entry.laborEntryId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(entry);
  } catch (error) {
    logger.error({ err: error }, 'Error creating labor entry');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/labor/{id}:
 *   put:
 *     summary: Update a labor entry
 *     description: >
 *       Validated by the zod schema `laborUpdateSchema` (see utils/validation.ts). Requires
 *       the Technician role. The work order's cost is recomputed afterwards.
 *     tags: [Labor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: LaborEntry laborEntryId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `laborUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hoursWorked: { type: number, format: float }
 *               entryDateTime: { type: string, format: date-time }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       '200':
 *         description: Labor entry updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Labor entry not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Technician'), validate(laborUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.laborEntry.findFirst({
      where: { laborEntryId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Labor entry not found' });
    }

    const { operationId, userId, hoursWorked, entryDateTime, notes } = req.body;

    const entry = await prisma.laborEntry.update({
      where: { laborEntryId: id },
      data: {
        ...(operationId !== undefined && { operationId }),
        ...(userId !== undefined && { userId }),
        ...(hoursWorked !== undefined && { hoursWorked }),
        ...(entryDateTime ? { entryDateTime: new Date(entryDateTime) } : {}),
        ...(notes !== undefined && { notes }),
        modifiedBy: req.user!.userId,
      },
    });

    const op = await prisma.workOrderOperation.findUnique({ where: { operationId: operationId || existing.operationId } });
    if (op) await recomputeWorkOrderCosts(op.workOrderId);

    await logAudit(
      { tableName: 'LaborEntry', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(entry);
  } catch (error) {
    logger.error({ err: error }, 'Error updating labor entry');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/labor/{id}:
 *   delete:
 *     summary: Delete a labor entry
 *     description: >
 *       Marks the labor entry isDeleted=true, so it is filtered out of later reads but the
 *       row is retained. Requires the Technician role. The work order's cost is recomputed
 *       afterwards.
 *     tags: [Labor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: LaborEntry laborEntryId
 *     responses:
 *       '200':
 *         description: Labor entry deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Labor entry not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.laborEntry.findFirst({
      where: { laborEntryId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Labor entry not found' });
    }

    await prisma.laborEntry.update({
      where: { laborEntryId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    const op = await prisma.workOrderOperation.findUnique({ where: { operationId: existing.operationId } });
    if (op) await recomputeWorkOrderCosts(op.workOrderId);

    await logAudit(
      { tableName: 'LaborEntry', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Labor entry deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting labor entry');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;