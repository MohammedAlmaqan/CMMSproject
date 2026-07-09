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
      include: { craft: true },
      orderBy: { sequenceNumber: 'asc' },
    });

    res.json(operations);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId, sequenceNumber, description, craftId, plannedHours, numberOfTechnicians } = req.body;

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

    res.status(201).json(operation);
  } catch (error) {
    console.error('Error creating operation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
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

    res.json(operation);
  } catch (error) {
    console.error('Error updating operation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderOperation.findUnique({
      where: { operationId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    await prisma.workOrderOperation.delete({
      where: { operationId: id },
    });

    res.json({ message: 'Operation deleted successfully' });
  } catch (error) {
    console.error('Error deleting operation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
