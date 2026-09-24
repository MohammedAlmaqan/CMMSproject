import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { validate, attachmentCreateSchema } from '../utils/validation.js';

const router = Router();

const UPLOADS_ROOT = fileURLToPath(new URL('../../uploads/', import.meta.url));

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const MAX_BYTES = 10 * 1024 * 1024;

function sanitizeName(name: string): string {
  const base = path.basename(name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 150);
  return base || 'file';
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function uploadFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large — maximum size is 10 MB' });
      }
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
    next();
  });
}

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId query parameters are required' });
    }

    const attachments = await prisma.attachment.findMany({
      where: { entityType: entityType as string, entityId: entityId as string, isDeleted: false },
      orderBy: { createdDate: 'desc' },
    });

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), uploadFile, validate(attachmentCreateSchema), async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body;
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const originalName = sanitizeName(req.file.originalname);
    const storedName = `${randomUUID()}-${originalName}`;
    const relDir = `${entityType}/${entityId}`;
    const storagePath = `${relDir}/${storedName}`;
    const fullDir = path.join(UPLOADS_ROOT, relDir);
    const fullPath = path.join(UPLOADS_ROOT, storagePath);

    fs.mkdirSync(fullDir, { recursive: true });
    fs.writeFileSync(fullPath, req.file.buffer);

    const attachment = await prisma.attachment.create({
      data: {
        entityType,
        entityId,
        originalName,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath,
        uploadedByUserId: req.user!.userId,
        createdBy: req.user!.username,
        modifiedBy: req.user!.username,
      },
    });

    await logAudit(
      { tableName: 'Attachment', recordId: attachment.attachmentId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(attachment);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const attachment = await prisma.attachment.findUnique({ where: { attachmentId: id } });
    if (!attachment || attachment.isDeleted) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const fullPath = path.join(UPLOADS_ROOT, attachment.storagePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.download(fullPath, attachment.originalName);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.2: soft delete — the row is marked isDeleted=true and the physical file is KEPT
// on disk (consistent with the soft-delete philosophy: nothing is ever destroyed,
// audit/restore remains possible; the file costs nothing to retain).
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.attachment.findUnique({ where: { attachmentId: id } });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    await prisma.attachment.update({
      where: { attachmentId: id },
      data: { isDeleted: true, modifiedBy: req.user!.username },
    });

    await logAudit(
      { tableName: 'Attachment', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;