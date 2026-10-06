import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { causeCodeCreateSchema, causeCodeUpdateSchema, validate } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/cause-codes:
 *   get:
 *     summary: List cause codes
 *     description: >
 *       Returns non-deleted cause codes, optionally filtered by a case-insensitive
 *       search over code and description. Cause codes are the flat root-cause list
 *       (SOW 3.1.4 / deferred item D5) a breakdown work order names on completion.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on code or description
 *     responses:
 *       '200':
 *         description: Array of cause codes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   causeCodeId: { type: string }
 *                   code: { type: string }
 *                   description: { type: string }
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
    const where: Prisma.CauseCodeWhereInput = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const codes = await prisma.causeCode.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    res.json(codes);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching cause codes');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/cause-codes/{id}:
 *   get:
 *     summary: Get one cause code
 *     description: Returns a single non-deleted cause code row.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: CauseCode causeCodeId
 *     responses:
 *       '200':
 *         description: Cause code detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Cause code not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const code = await prisma.causeCode.findFirst({
      where: { causeCodeId: String(req.params.id), isDeleted: false },
    });

    if (!code) {
      return res.status(404).json({ error: 'Cause code not found' });
    }

    res.json(code);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching cause code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/cause-codes:
 *   post:
 *     summary: Create a cause code
 *     description: >
 *       Creates a cause code row. Validated by the zod schema `causeCodeCreateSchema`
 *       (both fields required). Requires the Requester role.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `causeCodeCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *             required: [code, description]
 *     responses:
 *       '201':
 *         description: Cause code created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 causeCodeId: { type: string }
 *                 code: { type: string }
 *                 description: { type: string }
 *                 createdBy: { type: string }
 *                 createdDate: { type: string, format: date-time }
 *                 modifiedBy: { type: string }
 *                 modifiedDate: { type: string, format: date-time }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorizeMinRole('Requester'), validate(causeCodeCreateSchema), async (req: Request, res: Response) => {
  try {
    const { code, description } = req.body;

    const causeCode = await prisma.causeCode.create({
      data: {
        code,
        description,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'CauseCode', recordId: causeCode.causeCodeId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(causeCode);
  } catch (error) {
    logger.error({ err: error }, 'Error creating cause code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/cause-codes/{id}:
 *   put:
 *     summary: Update a cause code
 *     description: Validated by the zod schema `causeCodeUpdateSchema`. Requires the Requester role.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: CauseCode causeCodeId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `causeCodeUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *     responses:
 *       '200':
 *         description: Cause code updated
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
 *         description: Cause code not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(causeCodeUpdateSchema), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.causeCode.findFirst({
      where: { causeCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Cause code not found' });
    }

    const { code, description } = req.body;

    const causeCode = await prisma.causeCode.update({
      where: { causeCodeId: String(req.params.id) },
      data: {
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        modifiedBy: req.user!.userId,
      },
    });

    // Field diffs rather than one generic "Update" row: the trail should say
    // which column moved and from what to what. A PUT that changes nothing
    // records nothing, which is the honest outcome.
    await logFieldChanges({
      table: 'CauseCode',
      recordId: causeCode.causeCodeId,
      before: existing,
      after: causeCode,
      fields: AUDITED_FIELDS.CauseCode,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(causeCode);
  } catch (error) {
    logger.error({ err: error }, 'Error updating cause code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/cause-codes/{id}:
 *   delete:
 *     summary: Soft delete a cause code
 *     description: Marks the cause code isDeleted=true. Requires the Maintenance Supervisor role.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: CauseCode causeCodeId
 *     responses:
 *       '200':
 *         description: Cause code soft deleted
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
 *         description: Cause code not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.causeCode.findFirst({
      where: { causeCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Cause code not found' });
    }

    await prisma.causeCode.update({
      where: { causeCodeId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'CauseCode', recordId: String(req.params.id), action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Cause code deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting cause code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
