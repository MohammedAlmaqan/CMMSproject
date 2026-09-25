import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, functionalLocationCreateSchema, functionalLocationUpdateSchema } from '../utils/validation.js';
import { logAudit } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/functional-locations:
 *   get:
 *     summary: List functional locations
 *     description: >
 *       Returns non-deleted locations, optionally filtered by a case-insensitive search over
 *       locationCode and description. Parent and child locations are returned flat; use
 *       /tree for the hierarchy.
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on locationCode or description
 *     responses:
 *       '200':
 *         description: Array of functional locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   functionalLocationId: { type: string }
 *                   locationCode: { type: string }
 *                   description: { type: string }
 *                   parentLocationId: { type: string, nullable: true }
 *                   locationType: { type: string, enum: [Plant, Area, Unit, Sub-unit, System] }
 *                   operationalStatus: { type: string, enum: [Active, Inactive] }
 *                   installationDate: { type: string, format: date-time, nullable: true }
 *                   gpsCoordinates: { type: string, nullable: true, description: "Free text, not validated as a coordinate pair" }
 *                   safetyCritical: { type: boolean }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create a functional location
 *     description: >
 *       Validated by the zod schema `functionalLocationCreateSchema` (see
 *       utils/validation.ts). Requires the Technician role. A duplicate locationCode returns
 *       HTTP 409 (partial unique index covers active rows only).
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `functionalLocationCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [locationCode, description, locationType]
 *             properties:
 *               locationCode: { type: string }
 *               description: { type: string }
 *               parentLocationId: { type: string, nullable: true }
 *               locationType: { type: string, enum: [Plant, Area, Unit, Sub-unit, System] }
 *               operationalStatus: { type: string, enum: [Active, Inactive] }
 *               installationDate: { type: string, format: date-time }
 *               gpsCoordinates: { type: string }
 *               safetyCritical: { type: boolean }
 *     responses:
 *       '201':
 *         description: Location created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '409':
 *         description: locationCode already exists among active rows
 *       '500':
 *         description: Internal server error
 */
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


/**
 * @openapi
 * /api/functional-locations/tree:
 *   get:
 *     summary: Functional location hierarchy as a tree
 *     description: >
 *       Returns the Plant / Area / Unit / Sub-unit / System hierarchy assembled into nested
 *       nodes. Declared before /:id so the literal segment is not captured by the
 *       parameterised route.
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Nested location tree
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   functionalLocationId: { type: string }
 *                   locationCode: { type: string }
 *                   description: { type: string }
 *                   locationType: { type: string }
 *                   children:
 *                     type: array
 *                     items: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
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


/**
 * @openapi
 * /api/functional-locations/{id}:
 *   get:
 *     summary: Get one functional location
 *     description: Returns a single non-deleted location row.
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FunctionalLocation functionalLocationId
 *     responses:
 *       '200':
 *         description: Location detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Location not found
 *       '500':
 *         description: Internal server error
 */
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


/**
 * @openapi
 * /api/functional-locations/{id}:
 *   put:
 *     summary: Update a functional location
 *     description: >
 *       Validated by the zod schema `functionalLocationUpdateSchema` (see
 *       utils/validation.ts). Requires the Technician role. Reparenting is allowed; reject
 *       a parent change that would create a cycle before calling this.
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FunctionalLocation functionalLocationId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `functionalLocationUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               locationCode: { type: string }
 *               description: { type: string }
 *               parentLocationId: { type: string, nullable: true }
 *               locationType: { type: string }
 *               operationalStatus: { type: string }
 *               installationDate: { type: string, format: date-time, nullable: true }
 *               gpsCoordinates: { type: string, nullable: true }
 *               safetyCritical: { type: boolean }
 *     responses:
 *       '200':
 *         description: Location updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Location not found
 *       '409':
 *         description: locationCode already in use by another active row
 *       '500':
 *         description: Internal server error
 */
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


/**
 * @openapi
 * /api/functional-locations/{id}:
 *   delete:
 *     summary: Soft delete a functional location
 *     description: >
 *       Marks the location isDeleted=true. Per rule 3.4 child locations and equipment are
 *       retained. Requires the Maintenance Supervisor role.
 *     tags: [Functional Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FunctionalLocation functionalLocationId
 *     responses:
 *       '200':
 *         description: Location soft deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Supervisor
 *       '404':
 *         description: Location not found
 *       '500':
 *         description: Internal server error
 */
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
