import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const equipmentId = req.query.equipmentId as string | undefined;
    const where: any = { isDeleted: false };

    if (equipmentId) {
      where.equipmentId = equipmentId;
    }

    const meters = await prisma.equipmentMeter.findMany({
      where,
      orderBy: { meterName: 'asc' },
      include: {
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    res.json(meters);
  } catch (error) {
    console.error('Error fetching meters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const meter = await prisma.equipmentMeter.findFirst({
      where: { meterId: String(req.params.id), isDeleted: false },
      include: {
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
        readings: {
          where: { isDeleted: false },
          orderBy: { readingDate: 'desc' },
        },
      },
    });

    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    res.json(meter);
  } catch (error) {
    console.error('Error fetching meter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { equipmentId, meterName, unitOfMeasure, lastReading, lastReadingDate } = req.body;

    const meter = await prisma.equipmentMeter.create({
      data: {
        equipmentId,
        meterName,
        unitOfMeasure,
        lastReading: lastReading || 0,
        lastReadingDate: lastReadingDate ? new Date(lastReadingDate) : null,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(meter);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced equipment not found' });
    }
    console.error('Error creating meter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.equipmentMeter.findFirst({
      where: { meterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const { equipmentId, meterName, unitOfMeasure, lastReading, lastReadingDate } = req.body;

    const meter = await prisma.equipmentMeter.update({
      where: { meterId: String(req.params.id) },
      data: {
        ...(equipmentId !== undefined && { equipmentId }),
        ...(meterName !== undefined && { meterName }),
        ...(unitOfMeasure !== undefined && { unitOfMeasure }),
        ...(lastReading !== undefined && { lastReading }),
        ...(lastReadingDate !== undefined && { lastReadingDate: lastReadingDate ? new Date(lastReadingDate) : null }),
        modifiedBy: req.user!.userId,
      },
    });

    res.json(meter);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced equipment not found' });
    }
    console.error('Error updating meter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/readings', async (req: Request, res: Response) => {
  try {
    const meter = await prisma.equipmentMeter.findFirst({
      where: { meterId: String(req.params.id), isDeleted: false },
    });
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const { readingValue, readingDate, notes } = req.body;

    const reading = await prisma.meterReading.create({
      data: {
        meterId: String(req.params.id),
        readingValue,
        readingDate: readingDate ? new Date(readingDate) : new Date(),
        notes: notes || null,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await prisma.equipmentMeter.update({
      where: { meterId: String(req.params.id) },
      data: {
        lastReading: readingValue,
        lastReadingDate: readingDate ? new Date(readingDate) : new Date(),
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(reading);
  } catch (error) {
    console.error('Error adding meter reading:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.equipmentMeter.findFirst({
      where: { meterId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    await prisma.equipmentMeter.update({
      where: { meterId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Meter deleted successfully' });
  } catch (error) {
    console.error('Error deleting meter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
