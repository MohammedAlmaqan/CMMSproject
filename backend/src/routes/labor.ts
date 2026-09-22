import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, laborCreateSchema, laborUpdateSchema } from '../utils/validation.js';

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
    console.error('Error fetching labor entries:', error);
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
    console.error('Error creating labor entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error updating labor entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error deleting labor entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;