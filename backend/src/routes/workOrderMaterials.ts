import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { assertReservable, getMaterialAvailability } from '../services/materialAvailability.js';
import { validate, woMaterialCreateSchema, woMaterialUpdateSchema } from '../utils/validation.js';
import {
  materialOperationMessage,
  materialOperationRejection,
  needsOperationCheck,
} from '../utils/materialRules.js';
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
 *                   operationId: { type: string, nullable: true, description: "SOW 3.1.5 - the operation this part is issued to, null for a job-level line" }
 *                   plannedQuantity: { type: number, format: float }
 *                   actualQuantity: { type: number, format: float, nullable: true }
 *                   unitCost: { type: number, format: float, nullable: true, description: "Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number" }
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
 *       exist, otherwise HTTP 404. When operationId is given it must name an operation on
 *       THIS work order: HTTP 404 if no such operation exists, HTTP 400 if it exists but
 *       belongs to a different work order. The work order's cost is recomputed afterwards.
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
 *               operationId: { type: string, nullable: true, description: "SOW 3.1.5 - the operation this part is issued to. Optional: a part can be common to the whole job. Must belong to this work order when present." }
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
 *         description: zod validation failed, or operationId belongs to another work order
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Material not found, or operationId does not exist
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
      where: { workOrderId: workOrderId as string, isDeleted: false },
      include: { material: true, operation: true },
    });

    res.json(materials);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching work order materials');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(woMaterialCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, materialId, operationId, plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    const materialExists = await prisma.material.findUnique({ where: { materialId } });
    if (!materialExists) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // An unknown work order used to fall out of the foreign key as a 500. The
    // caller named a job that does not exist, which is a not-found, not an
    // internal fault, and costing the line would have recomputed totals for
    // nothing anyway.
    const workOrderExists = await prisma.workOrder.findFirst({
      where: { workOrderId, isDeleted: false },
      select: { workOrderId: true },
    });
    if (!workOrderExists) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // SOW 3.1.5. The link is only useful if it is true, so confirm the named
    // operation is on this work order before storing it.
    if (needsOperationCheck(operationId)) {
      const operation = await prisma.workOrderOperation.findFirst({
        where: { operationId: operationId as string, isDeleted: false },
        select: { workOrderId: true },
      });
      const rejection = materialOperationRejection(operation?.workOrderId ?? null, workOrderId);
      if (rejection) {
        return res.status(rejection === 'operation-not-found' ? 404 : 400).json({
          error: materialOperationMessage(rejection),
        });
      }
    }

    // SOW 3.3.4. A stored reservation has to mean something, so a reservation
    // that exceeds what is on hand is refused before the line is written, rather
    // than being recorded and discovered later by whoever tries to issue it.
    const nextReservation = reservationQuantity || 0;
    await assertReservable({ materialId, nextReservationQuantity: nextReservation });

    const material = await prisma.workOrderMaterial.create({
      data: {
        workOrderId,
        materialId,
        operationId: (operationId as string) || null,
        plannedQuantity,
        actualQuantity: actualQuantity || 0,
        unitCost: unitCost || 0,
        reservationQuantity: nextReservation,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logAuditAction({ table: 'WorkOrderMaterial', recordId: material.woMaterialId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json({
      ...material,
      availability: await getMaterialAvailability(materialId),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating work order material');
    // A rejected reservation is a 409, not an internal fault. Swallowing the
    // status here would report a stock conflict as a server error and hide the
    // reason the planner needs in order to fix it.
    const status = (error as { status?: number })?.status;
    res
      .status(status ?? 500)
      .json({ error: status ? (error as Error).message : 'Internal server error' });
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
    const existing = await prisma.workOrderMaterial.findFirst({
      where: { woMaterialId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    const { operationId, plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    // Re-pointing the operation is allowed, and gets the same check as creation.
    // The work order the line belongs to stays existing.workOrderId: a material
    // line is a child of its work order and is not moved between jobs here,
    // because that would silently restate the cost history of both.
    if (needsOperationCheck(operationId)) {
      const operation = await prisma.workOrderOperation.findFirst({
        where: { operationId: operationId as string, isDeleted: false },
        select: { workOrderId: true },
      });
      const rejection = materialOperationRejection(operation?.workOrderId ?? null, existing.workOrderId);
      if (rejection) {
        return res.status(rejection === 'operation-not-found' ? 404 : 400).json({
          error: materialOperationMessage(rejection),
        });
      }
    }

    // SOW 3.3.4. The line's own current reservation is excluded from the check,
    // otherwise raising this line's reservation would count its old value against
    // its new one and reject the very change being made.
    if (reservationQuantity !== undefined) {
      await assertReservable({
        materialId: existing.materialId,
        nextReservationQuantity: reservationQuantity,
        excludeWoMaterialId: id,
      });
    }

    const material = await prisma.workOrderMaterial.update({
      where: { woMaterialId: id },
      data: {
        ...(operationId !== undefined && { operationId: operationId || null }),
        ...(plannedQuantity !== undefined && { plannedQuantity }),
        ...(actualQuantity !== undefined && { actualQuantity }),
        ...(unitCost !== undefined && { unitCost }),
        ...(reservationQuantity !== undefined && { reservationQuantity }),
        modifiedBy: req.user!.userId,
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logFieldChanges({
      table: 'WorkOrderMaterial',
      recordId: id,
      before: existing,
      after: material,
      fields: AUDITED_FIELDS.WorkOrderMaterial,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json({
      ...material,
      availability: await getMaterialAvailability(existing.materialId),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order material');
    const status = (error as { status?: number })?.status;
    res
      .status(status ?? 500)
      .json({ error: status ? (error as Error).message : 'Internal server error' });
  }
});

// Soft delete: the WO material line is retained with isDeleted=true. Cost
// recomputation runs afterwards so planned/actual costs reflect only the live
// lines, and the reservation aggregate excludes the retired line so its
// reserved stock is released (see services/materialAvailability.ts).

/**
 * @openapi
 * /api/work-order-materials/{id}:
 *   delete:
 *     summary: Delete a work order material line
 *     description: >
 *       Soft delete - the line is marked isDeleted=true. The work order's cost
 *       is recomputed afterwards and the line's reserved stock is released.
 *       Requires the Technician role.
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
    const existing = await prisma.workOrderMaterial.findFirst({
      where: { woMaterialId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    await prisma.workOrderMaterial.update({
      where: { woMaterialId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await recomputeWorkOrderCosts(existing.workOrderId, { userId: req.user!.userId, ipAddress: req.ip });

    await logAuditAction({ table: 'WorkOrderMaterial', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Work order material deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order material');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;