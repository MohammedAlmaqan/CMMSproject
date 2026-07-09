import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const functionalLocationId = req.query.functionalLocationId as string | undefined;
    const criticality = req.query.criticality as string | undefined;
    const equipmentClass = req.query.equipmentClass as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { equipmentCode: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (functionalLocationId) {
      where.functionalLocationId = functionalLocationId;
    }
    if (criticality) {
      where.criticality = criticality;
    }
    if (equipmentClass) {
      where.equipmentClass = equipmentClass;
    }

    const equipment = await prisma.equipment.findMany({
      where,
      orderBy: { equipmentCode: 'asc' },
      include: {
        functionalLocation: true,
      },
    });

    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const equipment = await prisma.equipment.findFirst({
      where: { equipmentId: String(req.params.id), isDeleted: false },
      include: {
        functionalLocation: true,
        meters: {
          where: { isDeleted: false },
          orderBy: { meterName: 'asc' },
        },
        bomItems: {
          include: {
            material: true,
          },
        },
      },
    });

    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      equipmentCode, name, description, functionalLocationId,
      manufacturer, model, serialNumber, assetTag, equipmentClass,
      criticality, installationDate, warrantyExpiryDate, operationalStatus,
      technicalParameters,
    } = req.body;

    const equipment = await prisma.equipment.create({
      data: {
        equipmentCode,
        name,
        description,
        functionalLocationId,
        manufacturer,
        model,
        serialNumber,
        assetTag,
        equipmentClass,
        criticality,
        installationDate: installationDate ? new Date(installationDate) : null,
        warrantyExpiryDate: warrantyExpiryDate ? new Date(warrantyExpiryDate) : null,
        operationalStatus: operationalStatus || 'Active',
        technicalParameters: technicalParameters || {},
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    res.status(201).json(equipment);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced functional location not found' });
    }
    console.error('Error creating equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.equipment.findFirst({
      where: { equipmentId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const {
      equipmentCode, name, description, functionalLocationId,
      manufacturer, model, serialNumber, assetTag, equipmentClass,
      criticality, installationDate, warrantyExpiryDate, operationalStatus,
      technicalParameters,
    } = req.body;

    const equipment = await prisma.equipment.update({
      where: { equipmentId: String(req.params.id) },
      data: {
        ...(equipmentCode !== undefined && { equipmentCode }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(functionalLocationId !== undefined && { functionalLocationId }),
        ...(manufacturer !== undefined && { manufacturer }),
        ...(model !== undefined && { model }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(assetTag !== undefined && { assetTag }),
        ...(equipmentClass !== undefined && { equipmentClass }),
        ...(criticality !== undefined && { criticality }),
        ...(installationDate !== undefined && { installationDate: installationDate ? new Date(installationDate) : null }),
        ...(warrantyExpiryDate !== undefined && { warrantyExpiryDate: warrantyExpiryDate ? new Date(warrantyExpiryDate) : null }),
        ...(operationalStatus !== undefined && { operationalStatus }),
        ...(technicalParameters !== undefined && { technicalParameters }),
        modifiedBy: req.user!.userId,
      },
    });

    res.json(equipment);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced functional location not found' });
    }
    console.error('Error updating equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.equipment.findFirst({
      where: { equipmentId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    await prisma.equipment.update({
      where: { equipmentId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
