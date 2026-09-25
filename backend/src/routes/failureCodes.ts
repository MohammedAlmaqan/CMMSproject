import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { failureCodeCreateSchema, failureCodeUpdateSchema, validate } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

function buildTree(flat: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const item of flat) {
    map.set(item.failureCodeId, { ...item, children: [] });
  }

  for (const item of flat) {
    const node = map.get(item.failureCodeId)!;
    if (item.parentCodeId && map.has(item.parentCodeId)) {
      map.get(item.parentCodeId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}


/**
 * @openapi
 * /api/failure-codes:
 *   get:
 *     summary: List failure codes
 *     description: >
 *       Returns non-deleted failure codes, optionally filtered by a case-insensitive search
 *       over code and description. Note: as of v1.0.0 no work order column references this
 *       table, so failure/cause capture against a work order is not yet wired up - tracked
 *       as a v1.1 backlog item.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on code or description
 *     responses:
 *       '200':
 *         description: Array of failure codes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   failureCodeId: { type: string }
 *                   parentCodeId: { type: string, nullable: true }
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
 *   post:
 *     summary: Create a failure code
 *     description: >
 *       Validated by the zod schema `failureCodeCreateSchema` (see utils/validation.ts).
 *       Requires the Requester role. parentCodeId is optional and self-referential; a missing
 *       parent surfaces as Prisma P2003 and is translated to HTTP 400.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `failureCodeCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, description]
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *               parentCodeId: { type: string, nullable: true }
 *     responses:
 *       '201':
 *         description: Failure code created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or parent code not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const where: any = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const codes = await prisma.failureCode.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    res.json(codes);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failure codes');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/failure-codes/tree:
 *   get:
 *     summary: Failure code hierarchy as a tree
 *     description: >
 *       Returns the self-referencing FailureCode hierarchy assembled into nested nodes, for
 *       indented pickers. Declared before /:id so the literal segment is not captured by
 *       the parameterised route.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Nested failure code tree
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   failureCodeId: { type: string }
 *                   code: { type: string }
 *                   description: { type: string }
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
    const codes = await prisma.failureCode.findMany({
      where: { isDeleted: false },
      orderBy: { code: 'asc' },
    });

    const tree = buildTree(codes);
    res.json(tree);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failure code tree');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/failure-codes/{id}:
 *   get:
 *     summary: Get one failure code
 *     description: Returns a single non-deleted failure code row.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FailureCode failureCodeId
 *     responses:
 *       '200':
 *         description: Failure code detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Failure code not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const code = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
      include: {
        parent: true,
        children: { where: { isDeleted: false } },
      },
    });

    if (!code) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    res.json(code);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failure code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(failureCodeCreateSchema), async (req: Request, res: Response) => {
  try {
    const { parentCodeId, code, description } = req.body;

    const failureCode = await prisma.failureCode.create({
      data: {
        parentCodeId: parentCodeId || null,
        code,
        description,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'FailureCode', recordId: failureCode.failureCodeId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(failureCode);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced parent failure code not found' });
    }
    logger.error({ err: error }, 'Error creating failure code');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/failure-codes/{id}:
 *   put:
 *     summary: Update a failure code
 *     description: >
 *       Validated by the zod schema `failureCodeUpdateSchema` (see utils/validation.ts).
 *       Requires the Requester role.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FailureCode failureCodeId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `failureCodeUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *               parentCodeId: { type: string, nullable: true }
 *     responses:
 *       '200':
 *         description: Failure code updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or parent code not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Failure code not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(failureCodeUpdateSchema), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    const { parentCodeId, code, description } = req.body;

    const failureCode = await prisma.failureCode.update({
      where: { failureCodeId: String(req.params.id) },
      data: {
        ...(parentCodeId !== undefined && { parentCodeId: parentCodeId || null }),
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'FailureCode', recordId: failureCode.failureCodeId, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(failureCode);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced parent failure code not found' });
    }
    logger.error({ err: error }, 'Error updating failure code');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/failure-codes/{id}:
 *   delete:
 *     summary: Soft delete a failure code
 *     description: >
 *       Marks the failure code isDeleted=true. Requires the Maintenance Supervisor role.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: FailureCode failureCodeId
 *     responses:
 *       '200':
 *         description: Failure code soft deleted
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
 *         description: Failure code not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.failureCode.findFirst({
      where: { failureCodeId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Failure code not found' });
    }

    await prisma.failureCode.update({
      where: { failureCodeId: String(req.params.id) },
      data: {
        isDeleted: true,
        modifiedBy: req.user!.userId,
      },
    });

    await logAudit(
      { tableName: 'FailureCode', recordId: String(req.params.id), action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Failure code deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting failure code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
