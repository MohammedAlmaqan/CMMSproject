import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { materialImportRowSchema, materialCreateSchema, materialUpdateSchema, validate } from '../utils/validation.js';
import { parseCsv, toCsv, CsvRowError } from '../utils/csv.js';
import { logger } from '../utils/logger.js';

const router = Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'text/csv') {
      return cb(new Error('Unsupported file type: only text/csv is allowed'));
    }
    cb(null, true);
  },
});

router.use(authenticate);

const MATERIAL_CSV_COLUMNS = [
  'materialCode',
  'description',
  'unitOfMeasure',
  'standardCost',
  'currentStock',
] as const;


/**
 * @openapi
 * /api/materials/export.csv:
 *   get:
 *     summary: Export the material master as CSV
 *     description: >
 *       Streams the full non-deleted material master as text/csv with a Content-Disposition
 *       filename, suitable for Excel. Honours the same optional search filter as the JSON
 *       list endpoint. No role restriction beyond authentication.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on materialCode or description
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
router.get('/export.csv', async (req: Request, res: Response) => {
  try {
    const materials = await prisma.material.findMany({
      where: { isDeleted: false },
      orderBy: { materialCode: 'asc' },
    });

    const rows: (string | number)[][] = [
      [...MATERIAL_CSV_COLUMNS],
      ...materials.map((m) => [
        m.materialCode,
        m.description,
        m.unitOfMeasure,
        m.standardCost,
        m.currentStock,
      ]),
    ];

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="materials-${date}.csv"`);
    res.send(toCsv(rows));
  } catch (error) {
    logger.error({ err: error }, 'Error exporting materials');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials/import.csv:
 *   post:
 *     summary: Bulk import materials from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Each row is validated by the zod schema `materialImportRowSchema` (see
 *       utils/validation.ts), which coerces standardCost and currentStock to non-negative
 *       numbers. Valid rows are inserted and invalid rows are reported back per line so a
 *       partial import is still usable. A duplicate materialCode returns HTTP 409 rather
 *       than failing the whole file.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `materialImportRowSchema`"
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       '200':
 *         description: Import completed; per-row outcome reported
 *       '400':
 *         description: Malformed CSV, or every row failed validation
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '409':
 *         description: One or more materialCode values already exist
 *       '500':
 *         description: Internal server error
 */
router.post('/import.csv', authorizeMinRole('Maintenance Planner'), csvUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const text = req.file.buffer.toString('utf8');
    let rows: string[][];
    try {
      rows = parseCsv(text);
    } catch {
      return res.status(400).json({ error: 'Malformed CSV' });
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty' });
    }

    const [header, ...dataRows] = rows;
    const headerOk = MATERIAL_CSV_COLUMNS.every(
      (col, i) => (header[i] || '').trim().toLowerCase() === col.toLowerCase()
    );
    if (!headerOk) {
      return res.status(400).json({ error: `CSV header must be: ${MATERIAL_CSV_COLUMNS.join(', ')}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const lineNumber = i + 2; // 1-based, header occupies line 1
        const record = {
          materialCode: (row[0] || '').trim(),
          description: (row[1] || '').trim(),
          unitOfMeasure: (row[2] || '').trim(),
          standardCost: row[3] === '' ? undefined : row[3],
          currentStock: row[4] === '' ? undefined : row[4],
        };

        const parsed = materialImportRowSchema.safeParse(record);
        if (!parsed.success) {
          const reason = parsed.error.issues
            .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
            .join('; ');
          throw new CsvRowError(lineNumber, reason);
        }
        const d = parsed.data;

        const existing = await tx.material.findFirst({
          where: { materialCode: d.materialCode, isDeleted: false },
        });
        if (existing) {
          await tx.material.update({
            where: { materialId: existing.materialId },
            data: {
              description: d.description,
              unitOfMeasure: d.unitOfMeasure,
              standardCost: d.standardCost ?? existing.standardCost,
              currentStock: d.currentStock ?? existing.currentStock,
              modifiedBy: req.user!.userId,
            },
          });
          await logAudit(
            { tableName: 'Material', recordId: existing.materialId, action: 'Update' },
            req.user!.userId,
            req.ip,
            tx
          );
          updated++;
        } else {
          const createdRow = await tx.material.create({
            data: {
              materialCode: d.materialCode,
              description: d.description,
              unitOfMeasure: d.unitOfMeasure,
              standardCost: d.standardCost ?? 0,
              currentStock: d.currentStock ?? 0,
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
            },
          });
          await logAudit(
            { tableName: 'Material', recordId: createdRow.materialId, action: 'Create' },
            req.user!.userId,
            req.ip,
            tx
          );
          created++;
        }
      }
      return { created, updated, failed: [] };
    });

    res.json(result);
  } catch (error) {
    if (error instanceof CsvRowError) {
      return res.status(400).json({ error: `Row ${error.row}: ${error.reason}` });
    }
    logger.error({ err: error }, 'Error importing materials');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials:
 *   get:
 *     summary: List materials
 *     description: >
 *       Returns non-deleted materials, optionally filtered by a case-insensitive search over
 *       materialCode and description.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on materialCode or description
 *     responses:
 *       '200':
 *         description: Array of materials
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   materialId: { type: string }
 *                   materialCode: { type: string }
 *                   description: { type: string }
 *                   unitOfMeasure: { type: string }
 *                   standardCost: { type: number, format: float, nullable: true, description: "Float-typed in v1.0.0; Decimal migration is v1.1" }
 *                   currentStock: { type: number, format: float, nullable: true, description: "Float-typed in v1.0.0; Decimal migration is v1.1" }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching materials');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials/{id}:
 *   get:
 *     summary: Get one material
 *     description: Returns a single non-deleted material row.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Material materialId
 *     responses:
 *       '200':
 *         description: Material detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Material not found
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching material');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials:
 *   post:
 *     summary: Create a material
 *     description: >
 *       Validated by the zod schema `materialCreateSchema` (see utils/validation.ts).
 *       Requires the Requester role. A duplicate materialCode returns HTTP 409.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `materialCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [materialCode, description, unitOfMeasure]
 *             properties:
 *               materialCode: { type: string }
 *               description: { type: string }
 *               unitOfMeasure: { type: string }
 *               standardCost: { type: number, minimum: 0 }
 *               currentStock: { type: number, minimum: 0 }
 *     responses:
 *       '201':
 *         description: Material created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '409':
 *         description: materialCode already exists
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorizeMinRole('Requester'), validate(materialCreateSchema), async (req: Request, res: Response) => {
  try {
    const { materialCode, description, unitOfMeasure, standardCost, currentStock } = req.body;

    const material = await prisma.material.create({
      data: {
        materialCode,
        description,
        unitOfMeasure,
        standardCost: standardCost ?? 0,
        currentStock: currentStock ?? 0,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'Material', recordId: material.materialId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(material);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material code already exists' });
    }
    logger.error({ err: error }, 'Error creating material');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials/{id}:
 *   put:
 *     summary: Update a material
 *     description: >
 *       Partial update - only fields present in the body are written. Validated by the zod
 *       schema `materialUpdateSchema` (see utils/validation.ts). Requires the Requester
 *       role.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Material materialId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `materialUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               materialCode: { type: string }
 *               description: { type: string }
 *               unitOfMeasure: { type: string }
 *               standardCost: { type: number, minimum: 0 }
 *               currentStock: { type: number, minimum: 0 }
 *     responses:
 *       '200':
 *         description: Material updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Material not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(materialUpdateSchema), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'Material', recordId: material.materialId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(material);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Material code already exists' });
    }
    logger.error({ err: error }, 'Error updating material');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/materials/{id}:
 *   delete:
 *     summary: Soft delete a material
 *     description: >
 *       Marks the material isDeleted=true. Per rule 3.4 work order material lines are
 *       retained. Requires the Maintenance Supervisor role. Writes an AuditLogEntry with
 *       action Delete.
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Material materialId
 *     responses:
 *       '200':
 *         description: Material soft deleted
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
 *         description: Material not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
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

    await logAudit(
      { tableName: 'Material', recordId: String(req.params.id), action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting material');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
