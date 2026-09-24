import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, equipmentCreateSchema, equipmentUpdateSchema, equipmentImportRowSchema } from '../utils/validation.js';
import { logAudit } from '../middleware/audit.js';
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

router.get('/export.csv', async (req: Request, res: Response) => {
  try {
    const equipment = await prisma.equipment.findMany({
      where: { isDeleted: false },
      orderBy: { equipmentCode: 'asc' },
      include: { functionalLocation: true },
    });

    const rows: (string | number)[][] = [
      [...EQUIPMENT_CSV_COLUMNS],
      ...equipment.map((e) => [
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
      ]),
    ];

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="equipment-${date}.csv"`);
    res.send(toCsv(rows));
  } catch (error) {
    console.error('Error exporting equipment:', error);
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
    const headerOk = EQUIPMENT_CSV_COLUMNS.every(
      (col, i) => (header[i] || '').trim().toLowerCase() === col.toLowerCase()
    );
    if (!headerOk) {
      return res.status(400).json({ error: `CSV header must be: ${EQUIPMENT_CSV_COLUMNS.join(', ')}` });
    }

    const locations = await prisma.functionalLocation.findMany({
      where: { isDeleted: false },
      select: { functionalLocationId: true, locationCode: true },
    });
    const locationByCode = new Map(locations.map((l) => [l.locationCode, l.functionalLocationId]));

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const lineNumber = i + 2; // 1-based, header occupies line 1
        const record = {
          equipmentCode: (row[0] || '').trim(),
          name: (row[1] || '').trim(),
          description: (row[2] || '').trim(),
          functionalLocationCode: (row[3] || '').trim(),
          manufacturer: (row[4] || '').trim(),
          model: (row[5] || '').trim(),
          serialNumber: (row[6] || '').trim(),
          assetTag: (row[7] || '').trim(),
          equipmentClass: (row[8] || '').trim(),
          criticality: (row[9] || '').trim(),
          operationalStatus: (row[10] || '').trim(),
        };

        const parsed = equipmentImportRowSchema.safeParse(record);
        if (!parsed.success) {
          const reason = parsed.error.issues
            .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
            .join('; ');
          throw new CsvRowError(lineNumber, reason);
        }
        const d = parsed.data;

        const functionalLocationId = locationByCode.get(d.functionalLocationCode);
        if (!functionalLocationId) {
          throw new CsvRowError(lineNumber, `unknown functionalLocationCode '${d.functionalLocationCode}'`);
        }

        const existing = await tx.equipment.findFirst({
          where: { equipmentCode: d.equipmentCode, isDeleted: false },
        });
        if (existing) {
          await tx.equipment.update({
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
              modifiedBy: req.user!.userId,
            },
          });
          await logAudit(
            { tableName: 'Equipment', recordId: existing.equipmentId, action: 'Update' },
            req.user!.userId,
            req.ip,
            tx
          );
          updated++;
        } else {
          const createdRow = await tx.equipment.create({
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
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
            },
          });
          await logAudit(
            { tableName: 'Equipment', recordId: createdRow.equipmentId, action: 'Create' },
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
    console.error('Error importing equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error fetching equipment:', error);
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

    const equipment = await prisma.equipment.create({
      data: {
        equipmentCode,
        name,
        description,
        functionalLocationId,
        manufacturer: manufacturer || '',
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

    await logAudit(
      { tableName: 'Equipment', recordId: equipment.equipmentId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

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

    await logAudit(
      { tableName: 'Equipment', recordId: existing.equipmentId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

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

    await logAudit(
      { tableName: 'Equipment', recordId: existing.equipmentId, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
