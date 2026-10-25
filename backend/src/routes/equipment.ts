import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import type { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, equipmentCreateSchema, equipmentUpdateSchema, equipmentImportRowSchema, equipmentBomCreateSchema, equipmentBomUpdateSchema } from '../utils/validation.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import { isPrismaError } from '../utils/prismaErrors.js';
import { checkEquipmentPlacement } from '../utils/locationRules.js';
import { logger } from '../utils/logger.js';
import { parseCollectionQuery, mergeWhere, selectRows, QUERY_FIELDS } from '../utils/queryGrammar.js';

const router = Router();

router.use(authenticate);

const EQUIPMENT_CSV_COLUMNS = [
  'equipmentCode',
  'name',
  'description',
  'functionalLocationCode',
  'manufacturer',
  'model',
  'serialNumber',
  'assetTag',
  'equipmentClass',
  'criticality',
  'operationalStatus',
] as const;


/**
 * @openapi
 * /api/equipment/export.csv:
 *   get:
 *     summary: Export the equipment register as CSV
 *     description: >
 *       Streams the full non-deleted equipment register as text/csv with a Content-Disposition
 *       filename, suitable for Excel. Honours the same search, functionalLocationId,
 *       criticality and equipmentClass filters as the JSON list endpoint. No role
 *       restriction beyond authentication. The list endpoint's search,
 *       functionalLocationId, criticality and equipmentClass filters are not applied:
 *       this is a whole-register export, deliberately, so a filtered export can never be
 *       mistaken for the register.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'equipment',
    filename: 'equipment',
    columns: EQUIPMENT_CSV_COLUMNS,
    rows: async () => {
      const equipment = await prisma.equipment.findMany({
        where: { isDeleted: false },
        orderBy: { equipmentCode: 'asc' },
        include: { functionalLocation: true },
      });

      return equipment.map((e) => [
        e.equipmentCode,
        e.name,
        e.description,
        e.functionalLocation.locationCode,
        e.manufacturer,
        e.model,
        e.serialNumber,
        e.assetTag,
        e.equipmentClass,
        e.criticality,
        e.operationalStatus,
      ]);
    },
  })
);


/**
 * @openapi
 * /api/equipment/import.csv:
 *   post:
 *     summary: Bulk import equipment from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Each row is validated by the zod schema `equipmentImportRowSchema` (see
 *       utils/validation.ts). The import is all-or-nothing: the first invalid row rolls
 *       the whole file back and returns 400 naming that row, so a caller can never
 *       mistake a partly-applied file for a complete one. A row whose `equipmentCode`
 *       already exists is updated rather than duplicated; there is no 409. Add
 *       `?dryRun=1` to validate the file and report the outcome without writing anything.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `equipmentImportRowSchema`"
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       '200':
 *         description: Import completed; every row was accepted
 *       '400':
 *         description: Malformed CSV, a missing header column, or a row that failed validation (the file is rolled back)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '500':
 *         description: Internal server error
 */
router.post(
  '/import.csv',
  ...csvImportRoute({
    noun: 'equipment',
    columns: EQUIPMENT_CSV_COLUMNS,
    schema: equipmentImportRowSchema,
    mode: 'strict',
    run: async (ctx, rows) => {
      const locations = await ctx.tx.functionalLocation.findMany({
        where: { isDeleted: false },
        select: { functionalLocationId: true, locationCode: true },
      });
      const locationByCode = new Map(locations.map((l) => [l.locationCode, l.functionalLocationId]));

      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };
      for (const row of rows) {
        const d = row.record;

        const functionalLocationId = locationByCode.get(d.functionalLocationCode);
        if (!functionalLocationId) {
          // Strict mode turns this into a rollback and a 400; the reason is
          // still reported through the shared shape.
          outcome.rejected.push({ row: row.number, reason: `unknown functionalLocationCode '${d.functionalLocationCode}'` });
          continue;
        }

        const existing = await ctx.tx.equipment.findFirst({
          where: { equipmentCode: d.equipmentCode, isDeleted: false },
        });
        if (existing) {
          await ctx.tx.equipment.update({
            where: { equipmentId: existing.equipmentId },
            data: {
              name: d.name,
              description: d.description ?? existing.description,
              functionalLocationId,
              manufacturer: d.manufacturer ?? existing.manufacturer,
              model: d.model ?? existing.model,
              serialNumber: d.serialNumber ?? existing.serialNumber,
              assetTag: d.assetTag ?? existing.assetTag,
              equipmentClass: d.equipmentClass ?? existing.equipmentClass,
              criticality: d.criticality,
              operationalStatus: d.operationalStatus ?? existing.operationalStatus,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({ table: 'Equipment', recordId: existing.equipmentId, action: 'Update', userId: ctx.userId, ipAddress: ctx.ipAddress, db: ctx.tx });
          outcome.updated += 1;
        } else {
          const createdRow = await ctx.tx.equipment.create({
            data: {
              equipmentCode: d.equipmentCode,
              name: d.name,
              description: d.description ?? '',
              functionalLocationId,
              manufacturer: d.manufacturer ?? '',
              model: d.model ?? '',
              serialNumber: d.serialNumber ?? '',
              assetTag: d.assetTag ?? '',
              equipmentClass: d.equipmentClass ?? 'General',
              criticality: d.criticality,
              operationalStatus: d.operationalStatus || 'Active',
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({ table: 'Equipment', recordId: createdRow.equipmentId, action: 'Create', userId: ctx.userId, ipAddress: ctx.ipAddress, db: ctx.tx });
          outcome.created += 1;
        }
      }
      return outcome;
    },
  })
);


/**
 * @openapi
 * /api/equipment:
 *   get:
 *     summary: List equipment
 *     description: >
 *       Returns the non-deleted equipment register with its parent functional location.
 *       All filters are optional and combine with AND. businessCodes are unique only among
 *       live rows (partial unique index), so a soft-deleted code may be reused.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on equipmentCode, name, description, manufacturer, model or serialNumber
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *       - in: query
 *         name: criticality
 *         schema: { type: string, enum: [S, A, B, C] }
 *       - in: query
 *         name: equipmentClass
 *         schema: { type: string }
 *       - in: query
 *         name: $filter
 *         schema:
 *           type: string
 *         description: OData-style filter (SOW 5.4); comparisons eq, ne, gt, ge, lt, le, contains joined by and/or with parentheses; string values are single-quoted. Invalid expressions return 400.
 *       - in: query
 *         name: $orderby
 *         schema:
 *           type: string
 *         description: Comma-separated sort fields, each optionally asc or desc (default asc).
 *       - in: query
 *         name: $select
 *         schema:
 *           type: string
 *         description: Comma-separated top-level scalar fields to project onto each row.
 *       - in: query
 *         name: $top
 *         schema:
 *           type: integer
 *         description: Page size between 0 and 500; overrides take when present.
 *       - in: query
 *         name: $skip
 *         schema:
 *           type: integer
 *         description: Offset; overrides skip when present.
 *     responses:
 *       '200':
 *         description: Page of equipment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       equipmentId: { type: string }
 *                       equipmentCode: { type: string }
 *                       name: { type: string }
 *                       description: { type: string }
 *                       manufacturer: { type: string }
 *                       model: { type: string }
 *                       serialNumber: { type: string }
 *                       assetTag: { type: string }
 *                       equipmentClass: { type: string }
 *                       criticality: { type: string, enum: [S, A, B, C] }
 *                       operationalStatus: { type: string, enum: [Active, Inactive, Decommissioned] }
 *                       installationDate: { type: string, format: date-time, nullable: true }
 *                       warrantyExpiryDate: { type: string, format: date-time, nullable: true }
 *                       technicalParameters: { type: object, additionalProperties: true }
 *                       functionalLocationId: { type: string }
 *                       createdBy: { type: string }
 *                       createdDate: { type: string, format: date-time }
 *                       modifiedBy: { type: string }
 *                       modifiedDate: { type: string, format: date-time }
 *                 total: { type: integer }
 *                 skip: { type: integer }
 *                 take: { type: integer }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create an equipment record
 *     description: >
 *       Validated by the zod schema `equipmentCreateSchema` (see utils/validation.ts).
 *       Requires the Technician role. functionalLocationId is mandatory; a missing location
 *       surfaces as Prisma P2003 and is translated to HTTP 400. A duplicate equipmentCode
 *       returns HTTP 409. Writes an AuditLogEntry.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `equipmentCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipmentCode, name, functionalLocationId, criticality]
 *             properties:
 *               equipmentCode: { type: string }
 *               name: { type: string }
 *               description: { type: string, default: '' }
 *               manufacturer: { type: string }
 *               model: { type: string }
 *               serialNumber: { type: string }
 *               assetTag: { type: string }
 *               equipmentClass: { type: string }
 *               criticality: { type: string, enum: [S, A, B, C] }
 *               operationalStatus: { type: string, enum: [Active, Inactive, Decommissioned] }
 *               installationDate: { type: string, format: date-time, nullable: true }
 *               warrantyExpiryDate: { type: string, format: date-time, nullable: true }
 *               technicalParameters: { type: object, additionalProperties: { type: string } }
 *               functionalLocationId: { type: string }
 *     responses:
 *       '201':
 *         description: Equipment created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or referenced location not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '409':
 *         description: equipmentCode already exists among active rows
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const functionalLocationId = req.query.functionalLocationId as string | undefined;
    const criticality = req.query.criticality as string | undefined;
    const equipmentClass = req.query.equipmentClass as string | undefined;
    const where: Prisma.EquipmentWhereInput = { isDeleted: false };

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

    const grammar = parseCollectionQuery(req.query as Record<string, unknown>, QUERY_FIELDS.equipment);
    if (!grammar.ok) {
      return res.status(400).json({ error: 'Invalid query parameters', details: grammar.errors });
    }

    const finalWhere = mergeWhere(where as Record<string, unknown>, grammar.query.where) as Prisma.EquipmentWhereInput;
    const rawSkip = req.query.skip;
    const rawTake = req.query.take;
    const skipNum = grammar.query.skip ?? (rawSkip ? parseInt(String(rawSkip), 10) || 0 : 0);
    const takeNum = grammar.query.take ?? (rawTake ? parseInt(String(rawTake), 10) || 50 : 50);

    const [equipment, total] = await Promise.all([
      prisma.equipment.findMany({
        where: finalWhere,
        orderBy: grammar.query.orderBy
          ? (grammar.query.orderBy as unknown as Prisma.EquipmentOrderByWithRelationInput[])
          : { equipmentCode: 'asc' },
        skip: skipNum,
        take: takeNum,
        include: {
          functionalLocation: true,
        },
      }),
      prisma.equipment.count({ where: finalWhere }),
    ]);

    res.json({ data: selectRows(equipment, grammar.query.select), total, skip: skipNum, take: takeNum });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching equipment');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/equipment/{id}:
 *   get:
 *     summary: Get one equipment record
 *     description: >
 *       Returns a single non-deleted equipment row with its functional location, meters and
 *       bill of materials.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *     responses:
 *       '200':
 *         description: Equipment detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Equipment not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const equipment = await prisma.equipment.findFirst({
      where: { equipmentId: String(req.params.id), isDeleted: false },
      include: {
        functionalLocation: true,
        meters: {
          where: { isDeleted: false },
          orderBy: { meterName: 'asc' },
          include: {
            readings: {
              where: { isDeleted: false },
              orderBy: { readingDate: 'desc' },
              take: 20,
            },
          },
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
    logger.error({ err: error }, 'Error fetching equipment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/equipment/{id}/history:
 *   get:
 *     summary: Equipment maintenance history
 *     description: >
 *       SOW 3.6. Chronological list of every work order raised on the equipment,
 *       across all statuses including completed ones, with the date, type, cost
 *       and downtime (hours) the requirement asks for. Soft-deleted work orders
 *       are excluded. Downtime is actual finish minus actual start in hours,
 *       rounded to two decimals, and null when no actual start or finish was
 *       recorded.
 *     tags: [Equipment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: skip
 *         required: false
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: take
 *         required: false
 *         schema: { type: integer, default: 100, maximum: 1000 }
 *     responses:
 *       '200':
 *         description: Chronological maintenance history, oldest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       workOrderId: { type: string }
 *                       woNumber: { type: string }
 *                       type: { type: string }
 *                       status: { type: string }
 *                       breakdownFlag: { type: boolean }
 *                       description: { type: string }
 *                       createdDate: { type: string, format: date-time }
 *                       plannedStart: { type: string, format: date-time, nullable: true }
 *                       plannedFinish: { type: string, format: date-time, nullable: true }
 *                       cost: { type: number, nullable: true }
 *                       plannedCost: { type: number, nullable: true }
 *                       downtimeHours: { type: number, nullable: true }
 *                 total: { type: integer }
 *                 skip: { type: integer }
 *                 take: { type: integer }
 *       '404':
 *         description: Equipment not found
 *       '500':
 *         description: Internal server error
 */
// SOW 3.6 equipment maintenance history: the chronological list of every work
// order ever raised on the equipment, with the fields the requirement names
// (date, type, cost, downtime in hours). Served from its own path so the UI
// does not need to pull `take: 200` rows and assemble history client-side.
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const equipmentId = String(req.params.id);
    const equipment = await prisma.equipment.findFirst({
      where: { equipmentId, isDeleted: false },
      select: { equipmentId: true },
    });
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const skip = Math.max(0, parseInt(String(req.query.skip ?? '0'), 10) || 0);
    const requestedTake = Math.max(0, parseInt(String(req.query.take ?? '100'), 10) || 0);
    const take = Math.min(requestedTake, 1000);

    const where = { equipmentId, isDeleted: false };

    const data = await prisma.workOrder.findMany({
      where,
      select: {
        workOrderId: true,
        woNumber: true,
        type: true,
        status: true,
        breakdownFlag: true,
        description: true,
        createdDate: true,
        plannedStart: true,
        plannedFinish: true,
        plannedCost: true,
        actualCost: true,
        actualStart: true,
        actualFinish: true,
      },
      orderBy: { createdDate: 'asc' },
      skip,
      take,
    });

    const total = await prisma.workOrder.count({ where });

    res.json({
      data: data.map((wo) => ({
        workOrderId: wo.workOrderId,
        woNumber: wo.woNumber,
        type: wo.type,
        status: wo.status,
        breakdownFlag: wo.breakdownFlag,
        description: wo.description,
        createdDate: wo.createdDate,
        plannedStart: wo.plannedStart,
        plannedFinish: wo.plannedFinish,
        cost: wo.actualCost,
        plannedCost: wo.plannedCost,
        // Downtime per SOW 3.6 is the elapsed time the equipment was out of
        // service because of the work; a work order that never recorded an
        // actual start or finish has no measurable downtime, so it is null.
        downtimeHours:
          wo.actualFinish && wo.actualStart
            ? Math.round(
                ((wo.actualFinish.getTime() - wo.actualStart.getTime()) /
                  3_600_000) *
                  100
              ) / 100
            : null,
      })),
      total,
      skip,
      take,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching equipment maintenance history');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(equipmentCreateSchema), async (req: Request, res: Response) => {
  try {
    const {
      equipmentCode, name, description, functionalLocationId,
      manufacturer, model, serialNumber, assetTag, equipmentClass,
      criticality, installationDate, warrantyExpiryDate, operationalStatus,
      technicalParameters,
    } = req.body;

    // SOW 3.1.2: the location must be the LOWEST level of the hierarchy, not
    // merely a valid one. See utils/locationRules.ts for why this is defined
    // structurally rather than from the locationType label.
    const placement = await checkEquipmentIsAtLeaf(functionalLocationId);
    if (!placement.ok) {
      return res.status(400).json({ error: placement.error });
    }

    const equipment = await prisma.equipment.create({
      data: {
        equipmentCode,
        name,
        description,
        functionalLocationId,        manufacturer: manufacturer || '',
        model: model || '',
        serialNumber: serialNumber || '',
        assetTag: assetTag || '',
        equipmentClass: equipmentClass || '',
        criticality,
        installationDate: installationDate ? new Date(installationDate) : null,
        warrantyExpiryDate: warrantyExpiryDate ? new Date(warrantyExpiryDate) : null,
        operationalStatus: operationalStatus || 'Active',
        technicalParameters: technicalParameters || {},
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'Equipment', recordId: equipment.equipmentId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(equipment);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2002') {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }
    if (isPrismaError(error) && error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced functional location not found' });
    }
    logger.error({ err: error }, 'Error creating equipment');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/equipment/{id}:
 *   put:
 *     summary: Update an equipment record
 *     description: >
 *       Partial update - only fields present in the body are written. Validated by the zod
 *       schema `equipmentUpdateSchema` (see utils/validation.ts). Requires the Technician
 *       role. Writes an AuditLogEntry.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `equipmentUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               equipmentCode: { type: string }
 *               name: { type: string }
 *               description: { type: string }
 *               manufacturer: { type: string }
 *               model: { type: string }
 *               serialNumber: { type: string }
 *               assetTag: { type: string }
 *               equipmentClass: { type: string }
 *               criticality: { type: string, enum: [S, A, B, C] }
 *               operationalStatus: { type: string, enum: [Active, Inactive, Decommissioned] }
 *               installationDate: { type: string, format: date-time, nullable: true }
 *               warrantyExpiryDate: { type: string, format: date-time, nullable: true }
 *               technicalParameters: { type: object, additionalProperties: true }
 *               functionalLocationId: { type: string }
 *     responses:
 *       '200':
 *         description: Equipment updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or referenced location not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Equipment not found
 *       '409':
 *         description: equipmentCode already in use by another active row
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Technician'), validate(equipmentUpdateSchema), async (req: Request, res: Response) => {
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

    // Only re-checked when the location is actually moving, so an unrelated edit
    // to a serial number is not blocked by a hierarchy rule it does not touch.
    if (functionalLocationId !== undefined && functionalLocationId !== existing.functionalLocationId) {
      const placement = await checkEquipmentIsAtLeaf(functionalLocationId);
      if (!placement.ok) {
        return res.status(400).json({ error: placement.error });
      }
    }

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

    // Field diffs rather than one generic "Update" row: the trail should
    // say which column moved and from what to what. A PUT that changes
    // nothing records nothing, which is the honest outcome.
    await logFieldChanges({
      table: 'Equipment',
      recordId: existing.equipmentId,
      before: existing,
      after: equipment,
      fields: AUDITED_FIELDS.Equipment,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(equipment);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2002') {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }
    if (isPrismaError(error) && error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced functional location not found' });
    }
    logger.error({ err: error }, 'Error updating equipment');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/equipment/{id}:
 *   delete:
 *     summary: Soft delete an equipment record
 *     description: >
 *       Marks the equipment isDeleted=true. Per rule 3.4 child rows (meters, BOM, work
 *       orders) are retained, not cascaded. Requires the Maintenance Supervisor role.
 *       Writes an AuditLogEntry with action Delete.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *     responses:
 *       '200':
 *         description: Equipment soft deleted
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
 *         description: Equipment not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
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

    await logAuditAction({ table: 'Equipment', recordId: existing.equipmentId, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting equipment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * SOW 3.1.2 guard, shared by the create and update paths. Confirms the location
 * exists, is not retired, and is a leaf. Returns the check result rather than
 * writing a response so both callers can decide the status code.
 */
async function checkEquipmentIsAtLeaf(
  functionalLocationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const location = await prisma.functionalLocation.findFirst({
    where: { functionalLocationId, isDeleted: false },
    select: {
      functionalLocationId: true,
      _count: { select: { children: { where: { isDeleted: false } } } },
    },
  });
  if (!location) {
    return { ok: false, error: 'Functional location not found' };
  }
  return checkEquipmentPlacement({ hasChildren: location._count.children > 0 });
}

// SOW 3.1.2 / 3.1.5: the spare-parts BOM is a maintenance-managed write path, not
// a read-only projection. BOM lines are soft-deleted (isDeleted=true) and retire
// out of every live read; the audit entry and the row itself are both retained.
//
// The duplicate-material guard below is an application-level check only:
// EquipmentBOMMaterial has no unique index on (equipmentId, materialId), so two
// concurrent POSTs can both pass the guard. Closing that needs a unique index,
// which is a schema migration and is therefore out of scope for this write path.

/**
 * @openapi
 * /api/equipment/{id}/bom:
 *   post:
 *     summary: Add a material from the catalog to an equipment BOM
 *     description: >
 *       Creates one EquipmentBOMMaterial line, associating a catalog spare part
 *       with a piece of equipment. Rejects an unknown or deleted material, a
 *       non-positive quantity, and a duplicate line for the same material.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [materialId, quantity]
 *             properties:
 *               materialId: { type: string }
 *               quantity: { type: number, minimum: 0, exclusiveMinimum: 0 }
 *     responses:
 *       '201':
 *         description: BOM line created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bomId: { type: integer }
 *                 equipmentId: { type: string }
 *                 materialId: { type: string }
 *                 quantity: { type: number }
 *       '400':
 *         description: Validation failed, or material is not in the catalog
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Equipment not found
 *       '409':
 *         description: This material is already on the equipment BOM
 *       '500':
 *         description: Internal server error
 */
router.post('/:id/bom', authorizeMinRole('Technician'), validate(equipmentBomCreateSchema), async (req: Request, res: Response) => {
  try {
    const equipmentId = String(req.params.id);
    const { materialId, quantity } = req.body;

    const equipment = await prisma.equipment.findFirst({
      where: { equipmentId, isDeleted: false },
      select: { equipmentId: true },
    });
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const material = await prisma.material.findFirst({
      where: { materialId, isDeleted: false },
      select: { materialId: true },
    });
    if (!material) {
      return res.status(400).json({ error: 'Material not found in catalog' });
    }

    const existingLine = await prisma.equipmentBOMMaterial.findFirst({
      where: { equipmentId, materialId, isDeleted: false },
    });
    if (existingLine) {
      return res.status(409).json({ error: 'Material is already on this equipment BOM' });
    }

    const bomItem = await prisma.equipmentBOMMaterial.create({
      data: { equipmentId, materialId, quantity, createdBy: req.user!.userId, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'EquipmentBOMMaterial', recordId: bomItem.bomId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(bomItem);
  } catch (error) {
    logger.error({ err: error }, 'Error adding equipment BOM line');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/equipment/{id}/bom/{bomId}:
 *   put:
 *     summary: Change the quantity on an equipment BOM line
 *     description: >
 *       Updates the spare-parts quantity for one BOM line. Only the quantity is
 *       editable; the material itself is fixed by the path, so a BOM line can
 *       never be re-pointed at a different catalog item by a typo.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *       - in: path
 *         name: bomId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: number, exclusiveMinimum: 0 }
 *     responses:
 *       '200':
 *         description: BOM line updated
 *       '400':
 *         description: Validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Equipment or BOM line not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id/bom/:bomId', authorizeMinRole('Technician'), validate(equipmentBomUpdateSchema), async (req: Request, res: Response) => {
  try {
    const equipmentId = String(req.params.id);
    const bomId = String(req.params.bomId);

    const existing = await prisma.equipmentBOMMaterial.findFirst({
      where: { bomId, equipmentId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'BOM line not found on this equipment' });
    }

    const bomItem = await prisma.equipmentBOMMaterial.update({
      where: { bomId },
      data: { quantity: req.body.quantity, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'EquipmentBOMMaterial', recordId: String(bomId), action: 'Update', userId: req.user!.userId, ipAddress: req.ip });

    res.json(bomItem);
  } catch (error) {
    logger.error({ err: error }, 'Error updating equipment BOM line');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/equipment/{id}/bom/{bomId}:
 *   delete:
 *     summary: Remove a spare part from an equipment BOM
 *     description: >
 *       Soft-deletes one BOM line (isDeleted=true), so it drops out of the BOM
 *       but the row is retained. Requires the Maintenance Supervisor role.
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Equipment equipmentId
 *       - in: path
 *         name: bomId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: BOM line deleted
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
 *         description: Equipment or BOM line not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id/bom/:bomId', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const equipmentId = String(req.params.id);
    const bomId = String(req.params.bomId);

    const existing = await prisma.equipmentBOMMaterial.findFirst({
      where: { bomId, equipmentId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'BOM line not found on this equipment' });
    }

    await prisma.equipmentBOMMaterial.update({
      where: { bomId },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'EquipmentBOMMaterial', recordId: String(bomId), action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'BOM line deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting equipment BOM line');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
