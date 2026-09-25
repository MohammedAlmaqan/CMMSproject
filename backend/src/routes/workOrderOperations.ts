import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, operationCreateSchema, operationUpdateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/work-order-operations:
 *   get:
 *     summary: List work order operations
 *     description: >
 *       Returns the operations for a single work order. workOrderId is mandatory and returns
 *       HTTP 400 when omitted, so this endpoint is always scoped to one work order.
 *       Operations are the unit that labour entries and craft costs attach to.
 *     tags: [Work Order Operations]
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
 *         description: Array of work order operations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   operationId: { type: string }
 *                   workOrderId: { type: string }
 *                   sequenceNumber: { type: integer }
 *                   description: { type: string }
 *                   craftId: { type: string }
 *                   plannedHours: { type: number, format: float, nullable: true }
 *                   actualHours: { type: number, format: float, nullable: true }
 *                   numberOfTechnicians: { type: integer, nullable: true }
 *                   status: { type: string, nullable: true, description: "Free text; enum tightening is a v1.1 backlog item" }
 *       '400':
 *         description: workOrderId query parameter is required
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Add an operation to a work order
 *     description: >
 *       Validated by the zod schema `operationCreateSchema` (see utils/validation.ts).
 *       Requires the Technician role. The referenced craft must exist and not be deleted,
 *       otherwise HTTP 404.
 *     tags: [Work Order Operations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `operationCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workOrderId, sequenceNumber, description, craftId]
 *             properties:
 *               workOrderId: { type: string }
 *               sequenceNumber: { type: integer, minimum: 1 }
 *               description: { type: string }
 *               craftId: { type: string }
 *               plannedHours: { type: number, minimum: 0 }
 *               numberOfTechnicians: { type: integer, minimum: 1 }
 *     responses:
 *       '201':
 *         description: Operation created
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
 *         description: Craft not found
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
      include: { craft: true },
      orderBy: { sequenceNumber: 'asc' },
    });

    res.json(operations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching operations');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(operationCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, sequenceNumber, description, craftId, plannedHours, numberOfTechnicians } = req.body;

    const craftExists = await prisma.craft.findFirst({
      where: { craftId, isDeleted: false },
    });
    if (!craftExists) {
      return res.status(404).json({ error: 'Craft not found' });
    }

    const operation = await prisma.workOrderOperation.create({
      data: {
        workOrderId,
        sequenceNumber,
        description,
        craftId,
        plannedHours: plannedHours || 0,
        numberOfTechnicians: numberOfTechnicians || 1,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(workOrderId);

    await logAudit(
      { tableName: 'WorkOrderOperation', recordId: operation.operationId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(operation);
  } catch (error) {
    logger.error({ err: error }, 'Error creating operation');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-order-operations/{id}:
 *   put:
 *     summary: Update a work order operation
 *     description: >
 *       Validated by the zod schema `operationUpdateSchema` (see
 *       utils/validation.ts). Requires the Technician role. Updating is refused while the
 *       work order's cost is recomputed afterwards.
 *     tags: [Work Order Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderOperation operationId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `operationUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sequenceNumber: { type: integer, minimum: 1 }
 *               description: { type: string }
 *               craftId: { type: string }
 *               plannedHours: { type: number, minimum: 0 }
 *               actualHours: { type: number, minimum: 0 }
 *               numberOfTechnicians: { type: integer, minimum: 1 }
 *               status: { type: string }
 *     responses:
 *       '200':
 *         description: Operation updated
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
 *         description: Operation not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Technician'), validate(operationUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderOperation.findUnique({
      where: { operationId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    const { sequenceNumber, description, craftId, plannedHours, numberOfTechnicians, actualHours, status } = req.body;

    const operation = await prisma.workOrderOperation.update({
      where: { operationId: id },
      data: {
        ...(sequenceNumber !== undefined && { sequenceNumber }),
        ...(description !== undefined && { description }),
        ...(craftId !== undefined && { craftId }),
        ...(plannedHours !== undefined && { plannedHours }),
        ...(numberOfTechnicians !== undefined && { numberOfTechnicians }),
        ...(actualHours !== undefined && { actualHours }),
        ...(status !== undefined && { status }),
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderOperation', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(operation);
  } catch (error) {
    logger.error({ err: error }, 'Error updating operation');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: WorkOrderOperation rows are composition children of a WorkOrder and carry no isDeleted
// column — hard delete is deliberate. The laborEntry cascade is hard too (and must stay hard):
// soft-deleting labor would leave isDeleted=true rows under a hard-deleted operation (FK
// violation on the row delete) and would keep them in cost recomputation as orphans.

/**
 * @openapi
 * /api/work-order-operations/{id}:
 *   delete:
 *     summary: Delete a work order operation
 *     description: >
 *       Hard delete - WorkOrderOperation carries no isDeleted column, per rule 3.4 the parent
 *       work order is the soft-delete boundary. Any labour entries booked against the
 *       operation are removed with it, so record actual hours before deleting. Requires
 *       the Technician role.
 *     tags: [Work Order Operations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderOperation operationId
 *     responses:
 *       '200':
 *         description: Operation deleted
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
 *         description: Operation not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderOperation.findUnique({
      where: { operationId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    await prisma.laborEntry.deleteMany({
      where: { operationId: id },
    });

    await prisma.workOrderOperation.delete({
      where: { operationId: id },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderOperation', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Operation deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting operation');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;