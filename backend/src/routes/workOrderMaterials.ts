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

    const materials = await prisma.workOrderMaterial.findMany({
      where: { workOrderId: workOrderId as string },
      include: { material: true },
    });

    res.json(materials);
  } catch (error) {
    console.error('Error fetching work order materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId, materialId, plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

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

    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
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

    res.json(material);
  } catch (error) {
    console.error('Error updating work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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

    res.json({ message: 'Work order material deleted successfully' });
  } catch (error) {
    console.error('Error deleting work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
