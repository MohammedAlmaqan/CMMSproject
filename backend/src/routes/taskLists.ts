import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const equipmentClass = req.query.equipmentClass as string | undefined;
    const equipmentId = req.query.equipmentId as string | undefined;
    const workCenterId = req.query.workCenterId as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (equipmentClass) {
      where.equipmentClass = equipmentClass;
    }
    if (equipmentId) {
      where.equipmentId = equipmentId;
    }
    if (workCenterId) {
      where.workCenterId = workCenterId;
    }

    const taskLists = await prisma.taskList.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: {
            craft: true,
          },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    res.json(taskLists);
  } catch (error) {
    console.error('Error fetching task lists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const taskList = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: {
            craft: true,
          },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    if (!taskList) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    res.json(taskList);
  } catch (error) {
    console.error('Error fetching task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { code, description, equipmentClass, equipmentId, workCenterId, operations } = req.body;

    const taskList = await prisma.taskList.create({
      data: {
        code,
        description,
        equipmentClass: equipmentClass || null,
        equipmentId: equipmentId || null,
        workCenterId,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
        ...(operations && {
          operations: {
            create: operations.map((op: any) => ({
              sequenceNumber: op.sequenceNumber,
              description: op.description,
              craftId: op.craftId,
              plannedHours: op.plannedHours,
              numberOfTechnicians: op.numberOfTechnicians || 1,
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
            })),
          },
        }),
      },
      include: {
        operations: {
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true },
        },
      },
    });

    res.status(201).json(taskList);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Task list code already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced work center, equipment, or craft not found' });
    }
    console.error('Error creating task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    const { code, description, equipmentClass: ec, equipmentId: ei, workCenterId, operations } = req.body;

    const taskList = await prisma.taskList.update({
      where: { taskListId: String(req.params.id) },
      data: {
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        ...(ec !== undefined && { equipmentClass: ec || null }),
        ...(ei !== undefined && { equipmentId: ei || null }),
        ...(workCenterId !== undefined && { workCenterId }),
        modifiedBy: req.user!.userId,
      },
      include: {
        operations: {
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true },
        },
      },
    });

    if (operations) {
      await prisma.taskListOperation.deleteMany({
        where: { taskListId: String(req.params.id) },
      });

      await prisma.taskListOperation.createMany({
        data: operations.map((op: any) => ({
          taskListId: String(req.params.id),
          sequenceNumber: op.sequenceNumber,
          description: op.description,
          craftId: op.craftId,
          plannedHours: op.plannedHours,
          numberOfTechnicians: op.numberOfTechnicians || 1,
          createdBy: req.user!.userId,
          modifiedBy: req.user!.userId,
        })),
      });
    }

    const updated = await prisma.taskList.findUnique({
      where: { taskListId: String(req.params.id) },
      include: {
        operations: {
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Task list code already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced work center, equipment, or craft not found' });
    }
    console.error('Error updating task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    await prisma.taskList.update({
      where: { taskListId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    console.error('Error deleting task list:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
