import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const materials = await prisma.material.findMany({
      where,
      orderBy: { materialCode: 'asc' },
    });

    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const material = await prisma.material.findFirst({
      where: { materialId: String(req.params.id), isDeleted: false },
    });

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json(material);
  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { materialCode, description, unitOfMeasure, standardCost, currentStock } = req.body;

    const material = await prisma.material.create({
      data: {
        materialCode,
        description,
        unitOfMeasure,
        standardCost,
        currentStock: currentStock || 0,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(material);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material code already exists' });
    }
    console.error('Error creating material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.material.findFirst({
      where: { materialId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const { materialCode, description, unitOfMeasure, standardCost, currentStock } = req.body;

    const material = await prisma.material.update({
      where: { materialId: String(req.params.id) },
      data: {
        ...(materialCode !== undefined && { materialCode }),
        ...(description !== undefined && { description }),
        ...(unitOfMeasure !== undefined && { unitOfMeasure }),
        ...(standardCost !== undefined && { standardCost }),
        ...(currentStock !== undefined && { currentStock }),
        modifiedBy: req.user!.userId,
      },
    });

    res.json(material);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material code already exists' });
    }
    console.error('Error updating material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.material.findFirst({
      where: { materialId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    await prisma.material.update({
      where: { materialId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
