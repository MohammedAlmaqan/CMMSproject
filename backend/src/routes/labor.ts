import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

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

router.post('/', async (req: Request, res: Response) => {
  try {
    const { operationId, userId, hoursWorked, entryDateTime, notes } = req.body;

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

    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating labor entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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

    res.json({ message: 'Labor entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting labor entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
