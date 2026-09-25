import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, operationCreateSchema, operationUpdateSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

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