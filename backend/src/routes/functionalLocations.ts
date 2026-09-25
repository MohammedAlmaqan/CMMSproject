import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, functionalLocationCreateSchema, functionalLocationUpdateSchema } from '../utils/validation.js';
import { logAudit } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { locationCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const locations = await prisma.functionalLocation.findMany({
      where,
      orderBy: { locationCode: 'asc' },
    });

    res.json(locations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching functional locations');
    res.status(500).json({ error: 'Internal server error' });
  }
});

function buildTree(flat: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const item of flat) {
    map.set(item.functionalLocationId, { ...item, children: [] });
  }

  for (const item of flat) {
    const node = map.get(item.functionalLocationId)!;
    if (item.parentLocationId && map.has(item.parentLocationId)) {
      map.get(item.parentLocationId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

router.get('/tree', async (_req: Request, res: Response) => {
  try {
    const locations = await prisma.functionalLocation.findMany({
      where: { isDeleted: false },
      orderBy: { locationCode: 'asc' },
    });

    const tree = buildTree(locations);
    res.json(tree);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching location tree');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const location = await prisma.functionalLocation.findFirst({
      where: { functionalLocationId: String(req.params.id), isDeleted: false },
      include: {
        parent: true,
        children: { where: { isDeleted: false } },
        equipment: { where: { isDeleted: false } },
      },
    });

    if (!location) {
      return res.status(404).json({ error: 'Functional location not found' });
    }

    res.json(location);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching functional location');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(functionalLocationCreateSchema), async (req: Request, res: Response) => {
  try {
    const { locationCode, description, parentLocationId, locationType, operationalStatus, installationDate, gpsCoordinates, safetyCritical } = req.body;
    const userId = req.user!.userId;

    let code = locationCode;
    if (!code) {
      const last = await prisma.functionalLocation.findFirst({
        orderBy: { locationCode: 'desc' },
        select: { locationCode: true },
      });
      const prefix = locationType ? locationType.substring(0, 3).toUpperCase() : 'LOC';
      const nextNum = last ? String(Number(last.locationCode.replace(/[^0-9]/g, '')) + 1).padStart(4, '0') : '0001';
      code = `${prefix}-${nextNum}`;
    }

    const location = await prisma.functionalLocation.create({
      data: {
        locationCode: code,
        description,
        parentLocationId: parentLocationId || null,
        locationType,
        operationalStatus: operationalStatus || 'Active',
        installationDate: installationDate ? new Date(installationDate) : null,
        gpsCoordinates: gpsCoordinates || null,
        safetyCritical: safetyCritical || false,
        createdBy: userId,
        modifiedBy: userId,
      },
    });

    await logAudit(
      { tableName: 'FunctionalLocation', recordId: location.functionalLocationId, action: 'Create' },
      userId,
      req.ip
    );

    res.status(201).json(location);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Location code already exists' });
    }
    logger.error({ err: error }, 'Error creating functional location');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeMinRole('Technician'), validate(functionalLocationUpdateSchema), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.functionalLocation.findFirst({
      where: { functionalLocationId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Functional location not found' });
    }

    const { locationCode, description, parentLocationId, locationType, operationalStatus, installationDate, gpsCoordinates, safetyCritical } = req.body;

    const location = await prisma.functionalLocation.update({
      where: { functionalLocationId: String(req.params.id) },
      data: {
        ...(locationCode !== undefined && { locationCode }),
        ...(description !== undefined && { description }),
        ...(parentLocationId !== undefined && { parentLocationId: parentLocationId || null }),
        ...(locationType !== undefined && { locationType }),
        ...(operationalStatus !== undefined && { operationalStatus }),
        ...(installationDate !== undefined && { installationDate: installationDate ? new Date(installationDate) : null }),
        ...(gpsCoordinates !== undefined && { gpsCoordinates: gpsCoordinates || null }),
        ...(safetyCritical !== undefined && { safetyCritical }),
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'FunctionalLocation', recordId: existing.functionalLocationId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(location);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Location code already exists' });
    }
    logger.error({ err: error }, 'Error updating functional location');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.functionalLocation.findFirst({
      where: { functionalLocationId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Functional location not found' });
    }

    await prisma.functionalLocation.update({
      where: { functionalLocationId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'FunctionalLocation', recordId: existing.functionalLocationId, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Functional location deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting functional location');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
