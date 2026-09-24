import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { materialImportRowSchema } from '../utils/validation.js';
import { parseCsv, toCsv, CsvRowError } from '../utils/csv.js';

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
    console.error('Error exporting materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
  } catch (error: any) {
    if (error instanceof CsvRowError) {
      return res.status(400).json({ error: `Row ${error.row}: ${error.reason}` });
    }
    console.error('Error importing materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
