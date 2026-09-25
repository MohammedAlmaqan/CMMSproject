import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, woMaterialCreateSchema, woMaterialUpdateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/work-order-materials:
 *   get:
 *     summary: List work order material lines
 *     description: >
 *       Returns the material lines for a single work order. workOrderId is mandatory and
 *       returns HTTP 400 when omitted, so this endpoint is always scoped to one work
 *       order. The owning work order's cost is recomputed from these lines.
 *     tags: [Work Order Materials]
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
 *         description: Array of work order material lines
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   woMaterialId: { type: string }
 *                   workOrderId: { type: string }
 *                   materialId: { type: string }
 *                   plannedQuantity: { type: number, format: float }
 *                   actualQuantity: { type: number, format: float, nullable: true }
 *                   unitCost: { type: number, format: float, nullable: true, description: "Float-typed in v1.0.0; Decimal migration is v1.1" }
 *                   reservationQuantity: { type: number, format: float, nullable: true }
 *       '400':
 *         description: workOrderId query parameter is required
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Add a material line to a work order
 *     description: >
 *       Validated by the zod schema `woMaterialCreateSchema` (see
 *       utils/validation.ts). Requires the Technician role. The referenced material must
 *       exist, otherwise HTTP 404. The work order's cost is recomputed afterwards.
 *     tags: [Work Order Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `woMaterialCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workOrderId, materialId, plannedQuantity]
 *             properties:
 *               workOrderId: { type: string }
 *               materialId: { type: string }
 *               plannedQuantity: { type: number, minimum: 0 }
 *               actualQuantity: { type: number, minimum: 0 }
 *               unitCost: { type: number, minimum: 0 }
 *               reservationQuantity: { type: number, minimum: 0 }
 *     responses:
 *       '201':
 *         description: Material line created
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
 *         description: Material not found
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId } = req.query;
    if (!workOrderId) {
      return res.status(400).json({ error: 'workOrderId query parameter is required' });
    }

    const materials = await prisma.workOrderMaterial.findMany({
      where: { workOrderId: workOrderId as string },
      include: { material: true },
    });

    res.json(materials);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching work order materials');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(woMaterialCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, materialId, plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    const materialExists = await prisma.material.findUnique({ where: { materialId } });
    if (!materialExists) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = await prisma.workOrderMaterial.create({
      data: {
        workOrderId,
        materialId,
        plannedQuantity,
        actualQuantity: actualQuantity || 0,
        unitCost: unitCost || 0,
        reservationQuantity: reservationQuantity || 0,
      },
    });

    await recomputeWorkOrderCosts(workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: material.woMaterialId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(material);
  } catch (error) {
    logger.error({ err: error }, 'Error creating work order material');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/work-order-materials/{id}:
 *   put:
 *     summary: Update a work order material line
 *     description: >
 *       Validated by the zod schema \`woMaterialUpdateSchema\` (see
 *       utils/validation.ts). Requires the Technician role. The work order's cost is
 *       recomputed afterwards.
 *     tags: [Work Order Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderMaterial woMaterialId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `woMaterialUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plannedQuantity: { type: number, minimum: 0 }
 *               actualQuantity: { type: number, minimum: 0 }
 *               unitCost: { type: number, minimum: 0 }
 *               reservationQuantity: { type: number, minimum: 0 }
 *     responses:
 *       '200':
 *         description: Material line updated
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
 *         description: Work order material line not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Technician'), validate(woMaterialUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderMaterial.findUnique({
      where: { woMaterialId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    const { plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    const material = await prisma.workOrderMaterial.update({
      where: { woMaterialId: id },
      data: {
        ...(plannedQuantity !== undefined && { plannedQuantity }),
        ...(actualQuantity !== undefined && { actualQuantity }),
        ...(unitCost !== undefined && { unitCost }),
        ...(reservationQuantity !== undefined && { reservationQuantity }),
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(material);
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order material');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: WorkOrderMaterial rows are composition children of a WorkOrder and carry no isDeleted
// column — hard delete is deliberate (transactional WO line item; the WO is the soft-delete
// boundary). Cost recompute runs after removal so planned/actual costs reflect the live set.

/**
 * @openapi
 * /api/work-order-materials/{id}:
 *   delete:
 *     summary: Delete a work order material line
 *     description: >
 *       Hard delete - WorkOrderMaterial carries no isDeleted column, per rule 3.4 the parent
 *       work order is the soft-delete boundary. Requires the Technician role. The work
 *       order's cost is recomputed afterwards.
 *     tags: [Work Order Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderMaterial woMaterialId
 *     responses:
 *       '200':
 *         description: Material line deleted
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
 *         description: Work order material line not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderMaterial.findUnique({
      where: { woMaterialId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    await prisma.workOrderMaterial.delete({
      where: { woMaterialId: id },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Work order material deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order material');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;