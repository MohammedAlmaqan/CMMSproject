import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, equipmentMeterCreateSchema, equipmentMeterUpdateSchema, meterReadingCreateSchema } from '../utils/validation.js';
import { logAudit } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/equipment-meters:
 *   get:
 *     summary: List equipment meters
 *     description: >
 *       Returns non-deleted meters ordered by meterName ascending, each with its parent
 *       equipment's id, code and name. Optionally filtered to one asset.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: equipmentId
 *         schema:
 *           type: string
 *         description: Restrict to a single asset
 *     responses:
 *       '200':
 *         description: Array of meters
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   meterId: { type: string }
 *                   equipmentId: { type: string }
 *                   meterName: { type: string }
 *                   unitOfMeasure: { type: string }
 *                   lastReading: { type: number, format: float }
 *                   lastReadingDate: { type: string, format: date-time, nullable: true }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedDate: { type: string, format: date-time }
 *                   equipment:
 *                     type: object
 *                     properties:
 *                       equipmentId: { type: string }
 *                       equipmentCode: { type: string }
 *                       name: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create an equipment meter
 *     description: >
 *       Validated by the zod schema `equipmentMeterCreateSchema` (see utils/validation.ts).
 *       Requires the Technician role. A missing parent equipment surfaces as Prisma P2003
 *       and is translated to HTTP 400 rather than 500. Writes an AuditLogEntry.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `equipmentMeterCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipmentId, meterName, unitOfMeasure]
 *             properties:
 *               equipmentId: { type: string }
 *               meterName: { type: string }
 *               unitOfMeasure: { type: string, example: "kWh" }
 *               lastReading: { type: number, format: float, default: 0 }
 *               lastReadingDate: { type: string, format: date-time }
 *     responses:
 *       '201':
 *         description: Meter created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meterId: { type: string }
 *                 equipmentId: { type: string }
 *                 meterName: { type: string }
 *                 unitOfMeasure: { type: string }
 *                 lastReading: { type: number, format: float }
 *                 lastReadingDate: { type: string, format: date-time, nullable: true }
 *                 createdDate: { type: string, format: date-time }
 *                 modifiedDate: { type: string, format: date-time }
 *       '400':
 *         description: zod validation failed, or referenced equipment not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/equipment-meters/{id}:
 *   get:
 *     summary: Get one meter with its reading history
 *     description: >
 *       Returns the meter with its parent equipment and all non-deleted readings ordered by
 *       readingDate descending. This is the endpoint the PM meter-based strategy reads to
 *       decide whether a plan is due.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: EquipmentMeter meterId
 *     responses:
 *       '200':
 *         description: Meter with readings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meterId: { type: string }
 *                 equipmentId: { type: string }
 *                 meterName: { type: string }
 *                 unitOfMeasure: { type: string }
 *                 lastReading: { type: number, format: float }
 *                 lastReadingDate: { type: string, format: date-time, nullable: true }
 *                 equipment:
 *                   type: object
 *                   properties:
 *                     equipmentId: { type: string }
 *                     equipmentCode: { type: string }
 *                     name: { type: string }
 *                 readings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       readingId: { type: string }
 *                       meterId: { type: string }
 *                       readingValue: { type: number, format: float }
 *                       readingDate: { type: string, format: date-time }
 *                       notes: { type: string, nullable: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Meter not found
 *       '500':
 *         description: Internal server error
 *   put:
 *     summary: Update an equipment meter
 *     description: >
 *       Partial update - only the fields present in the body are written. Validated by the
 *       zod schema `equipmentMeterUpdateSchema` (see utils/validation.ts). Requires the
 *       Technician role. Writes an AuditLogEntry.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: EquipmentMeter meterId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `equipmentMeterUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               equipmentId: { type: string }
 *               meterName: { type: string }
 *               unitOfMeasure: { type: string }
 *               lastReading: { type: number, format: float }
 *               lastReadingDate: { type: string, format: date-time, nullable: true }
 *     responses:
 *       '200':
 *         description: Meter updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meterId: { type: string }
 *                 equipmentId: { type: string }
 *                 meterName: { type: string }
 *                 unitOfMeasure: { type: string }
 *                 lastReading: { type: number, format: float }
 *                 lastReadingDate: { type: string, format: date-time, nullable: true }
 *                 modifiedDate: { type: string, format: date-time }
 *       '400':
 *         description: zod validation failed, or referenced equipment not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Meter not found
 *       '500':
 *         description: Internal server error
 *   delete:
 *     summary: Soft delete an equipment meter
 *     description: >
 *       Marks the meter isDeleted=true. Per rule 3.4 the meter's MeterReading children are
 *       retained, not cascaded. Requires the Maintenance Supervisor role. Writes an
 *       AuditLogEntry with action Delete.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: EquipmentMeter meterId
 *     responses:
 *       '200':
 *         description: Meter soft deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Meter deleted successfully" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Supervisor
 *       '404':
 *         description: Meter not found
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/equipment-meters/{id}/readings:
 *   post:
 *     summary: Record a meter reading
 *     description: >
 *       Validated by the zod schema `meterReadingCreateSchema` (see utils/validation.ts).
 *       Creates the MeterReading row and, in the same request, updates the parent meter's
 *       lastReading and lastReadingDate to match. When readingDate is omitted the current
 *       server time is used. Requires the Technician role.
 *     tags: [Equipment Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: EquipmentMeter meterId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `meterReadingCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [readingValue]
 *             properties:
 *               readingValue: { type: number, format: float }
 *               readingDate: { type: string, format: date-time, description: "Defaults to now" }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       '201':
 *         description: Reading recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 readingId: { type: string }
 *                 meterId: { type: string }
 *                 readingValue: { type: number, format: float }
 *                 readingDate: { type: string, format: date-time }
 *                 notes: { type: string, nullable: true }
 *                 createdDate: { type: string, format: date-time }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Meter not found
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching meters');
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
    logger.error({ err: error }, 'Error fetching meter');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(equipmentMeterCreateSchema), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'EquipmentMeter', recordId: meter.meterId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(meter);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced equipment not found' });
    }
    logger.error({ err: error }, 'Error creating meter');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeMinRole('Technician'), validate(equipmentMeterUpdateSchema), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'EquipmentMeter', recordId: existing.meterId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(meter);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced equipment not found' });
    }
    logger.error({ err: error }, 'Error updating meter');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/readings', authorizeMinRole('Technician'), validate(meterReadingCreateSchema), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'MeterReading', recordId: reading.readingId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(reading);
  } catch (error) {
    logger.error({ err: error }, 'Error adding meter reading');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'EquipmentMeter', recordId: existing.meterId, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Meter deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting meter');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
