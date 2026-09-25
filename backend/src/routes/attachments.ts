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
import { logger } from '../utils/logger.js';

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

/**
 * @openapi
 * /api/attachments:
 *   get:
 *     summary: List attachments for an entity
 *     description: >
 *       Attachments are polymorphic: the target is identified by entityType plus entityId,
 *       with no foreign key. Both query parameters are required; the endpoint returns HTTP
 *       400 without them. Soft-deleted attachments are excluded. Ordered newest first.
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *         description: Target type - WorkOrder, Notification or Equipment
 *         example: WorkOrder
 *       - in: query
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Attachments for the entity
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   attachmentId: { type: string }
 *                   entityType: { type: string }
 *                   entityId: { type: string }
 *                   originalName: { type: string }
 *                   mimeType: { type: string }
 *                   sizeBytes: { type: integer }
 *                   storagePath: { type: string, description: "Relative path under backend/uploads/" }
 *                   uploadedByUserId: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *       '400':
 *         description: entityType or entityId missing
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Upload a file and attach it to an entity
 *     description: >
 *       Multipart upload with a single `file` part. Validated by the zod schema
 *       `attachmentCreateSchema` (see utils/validation.ts). Size limit 10 MB; allowed MIME
 *       types are image/jpeg, image/png, image/webp, application/pdf, text/plain,
 *       application/vnd.openxmlformats-officedocument.spreadsheetml.sheet and
 *       application/vnd.ms-excel. The stored filename is a fresh UUID plus a sanitised
 *       original name, written under uploads/<entityType>/<entityId>/. Because the file is
 *       buffered in memory, keep the limit in mind for large batches.
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Multipart form. Text fields validated by zod `attachmentCreateSchema`."
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, entityType, entityId]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               entityType:
 *                 type: string
 *                 example: WorkOrder
 *               entityId:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Attachment metadata created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attachmentId: { type: string }
 *                 entityType: { type: string }
 *                 entityId: { type: string }
 *                 originalName: { type: string }
 *                 mimeType: { type: string }
 *                 sizeBytes: { type: integer }
 *                 storagePath: { type: string }
 *                 uploadedByUserId: { type: string }
 *                 createdDate: { type: string, format: date-time }
 *       '400':
 *         description: No file, file too large (10 MB), unsupported MIME type, or zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/attachments/{id}/download:
 *   get:
 *     summary: Download an attachment
 *     description: >
 *       Streams the stored file with Content-Type set from the recorded mimeType and the
 *       sanitised original filename as the download name. Returns HTTP 404 both when the
 *       row is missing/soft-deleted and when the row exists but the file is absent from
 *       disk, so callers cannot distinguish the two.
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attachment attachmentId
 *     responses:
 *       '200':
 *         description: The file contents
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Attachment not found, or file missing on disk
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/attachments/{id}:
 *   delete:
 *     summary: Soft delete an attachment
 *     description: >
 *       Marks the row isDeleted=true. The physical file is deliberately KEPT on disk so the
 *       operation stays reversible and auditable, per the soft-delete philosophy. Requires
 *       the Maintenance Supervisor role. Writes an AuditLogEntry with action Delete.
 *     tags: [Attachments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attachment attachmentId
 *     responses:
 *       '200':
 *         description: Attachment soft deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Attachment deleted successfully" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Supervisor
 *       '404':
 *         description: Attachment not found or already soft deleted
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching attachments');
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
    logger.error({ err: error }, 'Error uploading attachment');
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
    logger.error({ err: error }, 'Error downloading attachment');
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
    logger.error({ err: error }, 'Error deleting attachment');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;