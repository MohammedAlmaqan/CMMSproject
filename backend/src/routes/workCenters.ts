import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const workCenters = await prisma.workCenter.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
      include: {
        crafts: {
          where: { isDeleted: false },
          orderBy: { craftCode: 'asc' },
        },
      },
    });

    res.json(workCenters);
  } catch (error) {
    console.error('Error fetching work centers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const workCenter = await prisma.workCenter.findFirst({
      where: { workCenterId: id, isDeleted: false },
      include: {
        crafts: {
          where: { isDeleted: false },
          orderBy: { craftCode: 'asc' },
        },
      },
    });

    if (!workCenter) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    res.json(workCenter);
  } catch (error) {
    console.error('Error fetching work center:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { code, name, dailyCapacityHours, costRatePerHour, isActive } = req.body;

    const workCenter = await prisma.workCenter.create({
      data: {
        code,
        name,
        dailyCapacityHours,
        costRatePerHour,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(workCenter);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work center code already exists' });
    }
    console.error('Error creating work center:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workCenter.findFirst({
      where: { workCenterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    const { code, name, dailyCapacityHours, costRatePerHour, isActive } = req.body;

    const workCenter = await prisma.workCenter.update({
      where: { workCenterId: String(req.params.id) },
      data: {
        ...(code !== undefined && { code }),
        ...(name !== undefined && { name }),
        ...(dailyCapacityHours !== undefined && { dailyCapacityHours }),
        ...(costRatePerHour !== undefined && { costRatePerHour }),
        ...(isActive !== undefined && { isActive }),
        modifiedBy: req.user!.userId,
      },
    });

    res.json(workCenter);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Work center code already exists' });
    }
    console.error('Error updating work center:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.workCenter.findFirst({
      where: { workCenterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work center not found' });
    }

    await prisma.workCenter.update({
      where: { workCenterId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Work center deleted successfully' });
  } catch (error) {
    console.error('Error deleting work center:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
