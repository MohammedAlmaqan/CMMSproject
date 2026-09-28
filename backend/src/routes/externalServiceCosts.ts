import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import {
  validate,
  externalServiceCreateSchema,
  externalServiceUpdateSchema,
  defaultServiceCostCategory,
} from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/external-services:
 *   get:
 *     summary: List external service cost lines
 *     description: >
 *       Returns the vendor invoice lines charged to a single work order. workOrderId is
 *       mandatory and returns HTTP 400 when omitted, so this endpoint is always scoped to
 *       one work order. External service costs are hard-deleted, so they carry no audit
 *       columns or isDeleted flag.
 *     tags: [External Services]
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
 *         description: Array of external service cost lines
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   serviceCostId: { type: string }
 *                   workOrderId: { type: string }
 *                   vendor: { type: string }
 *                   description: { type: string }
 *                   cost: { type: number, format: float, description: "Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number" }
 *                   invoiceRef: { type: string }
 *                   category: { type: string, enum: [Service, Travel, Permit, Other], description: "SOW 3.3.6: Service is a contractor invoice; Travel/Permit/Other are the additional miscellaneous costs. Defaults to Service." }
 *       '400':
 *         description: workOrderId query parameter is required
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Record an external service cost
 *     description: >
 *       Validated by the zod schema `externalServiceCreateSchema` (see utils/validation.ts).
 *       Requires the Technician role. The work order's actualCost is recomputed after the
 *       line is added.
 *     tags: [External Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `externalServiceCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workOrderId, vendor, description, cost]
 *             properties:
 *               workOrderId: { type: string }
 *               vendor: { type: string }
 *               description: { type: string }
 *               cost: { type: number, format: float }
 *               invoiceRef: { type: string }
 *               category: { type: string, enum: [Service, Travel, Permit, Other], description: "Defaults to Service when omitted" }
 *     responses:
 *       '201':
 *         description: Cost line created
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

    const services = await prisma.externalServiceCost.findMany({
      where: { workOrderId: workOrderId as string, isDeleted: false },
    });

    res.json(services);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching external services');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(externalServiceCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, vendor, description, cost, invoiceRef, category } = req.body;

    const service = await prisma.externalServiceCost.create({
      data: {
        workOrderId,
        vendor,
        description,
        cost,
        invoiceRef: invoiceRef || '',
        category: category || defaultServiceCostCategory,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logAuditAction({ table: 'ExternalServiceCost', recordId: service.serviceCostId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(service);
  } catch (error) {
    logger.error({ err: error }, 'Error creating external service');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/external-services/{id}:
 *   put:
 *     summary: Update an external service cost line
 *     description: >
 *       Validated by the zod schema `externalServiceUpdateSchema` (see utils/validation.ts).
 *       Requires the Technician role. The work order's actualCost is recomputed afterwards.
 *     tags: [External Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ExternalServiceCost serviceCostId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `externalServiceUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vendor: { type: string }
 *               description: { type: string }
 *               cost: { type: number, format: float }
 *               invoiceRef: { type: string }
 *               category: { type: string, enum: [Service, Travel, Permit, Other], description: "Defaults to Service when omitted" }
 *     responses:
 *       '200':
 *         description: Cost line updated
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
 *         description: Cost line not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Technician'), validate(externalServiceUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.externalServiceCost.findFirst({
      where: { serviceCostId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'External service not found' });
    }

    const { vendor, description, cost, invoiceRef, category } = req.body;

    const service = await prisma.externalServiceCost.update({
      where: { serviceCostId: id },
      data: {
        ...(vendor !== undefined && { vendor }),
        ...(description !== undefined && { description }),
        ...(cost !== undefined && { cost }),
        ...(invoiceRef !== undefined && { invoiceRef }),
        ...(category !== undefined && { category }),
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logAuditAction({ table: 'ExternalServiceCost', recordId: id, action: 'Update', userId: req.user!.userId, ipAddress: req.ip });

    res.json(service);
  } catch (error) {
    logger.error({ err: error }, 'Error updating external service');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Soft delete: the cost line is retained with isDeleted=true. Cost recomputation
// excludes it, so actualCost reflects only the live service lines.

/**
 * @openapi
 * /api/external-services/{id}:
 *   delete:
 *     summary: Delete an external service cost line
 *     description: >
 *       Soft delete - the line is marked isDeleted=true. The work order's
 *       actualCost is recomputed afterwards. Requires the Technician role.
 *     tags: [External Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ExternalServiceCost serviceCostId
 *     responses:
 *       '200':
 *         description: Cost line deleted
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
 *         description: Cost line not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.externalServiceCost.findFirst({
      where: { serviceCostId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'External service not found' });
    }

    await prisma.externalServiceCost.update({
      where: { serviceCostId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await recomputeWorkOrderCosts(existing.workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logAuditAction({ table: 'ExternalServiceCost', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'External service deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting external service');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;