import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import type { FailureCode, Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { failureCodeCreateSchema, failureCodeUpdateSchema, failureCodeImportRowSchema, validate } from '../utils/validation.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import { isPrismaError } from '../utils/prismaErrors.js';
import { logger } from '../utils/logger.js';
import { parseCollectionQuery, mergeWhere, selectRows, QUERY_FIELDS } from '../utils/queryGrammar.js';

const router = Router();

router.use(authenticate);

interface FailureCodeTreeNode extends FailureCode {
  children: FailureCodeTreeNode[];
}

function buildTree(flat: FailureCode[]): FailureCodeTreeNode[] {
  const map = new Map<string, FailureCodeTreeNode>();
  const roots: FailureCodeTreeNode[] = [];

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
 *       over code and description. Codes are selectable on a work order as of the
 *       v1.1 failure-capture change (SOW 3.1.4): `WorkOrder.failureCodeId`
 *       references this table and the work-order detail screen sets it.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on code or description
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
    const where: Prisma.FailureCodeWhereInput = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const grammar = parseCollectionQuery(req.query as Record<string, unknown>, QUERY_FIELDS.failureCode);
    if (!grammar.ok) {
      return res.status(400).json({ error: 'Invalid query parameters', details: grammar.errors });
    }

    const codes = await prisma.failureCode.findMany({
      where: mergeWhere(where as Record<string, unknown>, grammar.query.where) as Prisma.FailureCodeWhereInput,
      orderBy: grammar.query.orderBy
        ? (grammar.query.orderBy as unknown as Prisma.FailureCodeOrderByWithRelationInput[])
        : { code: 'asc' },
      ...(grammar.query.skip !== null ? { skip: grammar.query.skip } : {}),
      ...(grammar.query.take !== null ? { take: grammar.query.take } : {}),
    });

    res.json(selectRows(codes, grammar.query.select));
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


const FAILURE_CODE_CSV_COLUMNS = ['code', 'description', 'parentCode'] as const;

/**
 * @openapi
 * /api/failure-codes/export.csv:
 *   get:
 *     summary: Export failure codes as CSV
 *     description: >
 *       Streams every non-deleted failure code as text/csv in code order. The parent
 *       is written by its `code`, not its id, so the hierarchy survives a round trip
 *       to another deployment. No role restriction beyond authentication.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Failure codes as text/csv
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'failure codes',
    filename: 'failure-codes',
    columns: FAILURE_CODE_CSV_COLUMNS,
    rows: async () => {
      const rows = await prisma.failureCode.findMany({
        where: { isDeleted: false },
        orderBy: { code: 'asc' },
        include: { parent: { select: { code: true } } },
      });
      return rows.map((row) => [row.code, row.description, row.parent?.code ?? '']);
    },
  })
);

/**
 * @openapi
 * /api/failure-codes/import.csv:
 *   post:
 *     summary: Import failure codes from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Rows are validated by `failureCodeImportRowSchema`. The file is read in two
 *       passes, because a child may name a parent that appears later in it: every code is
 *       created or updated first, then each `parentCode` is resolved to the code it names.
 *       An unknown parent is rejected, as is a parent that would make a code its own
 *       ancestor. A row whose `code` already exists is updated rather than duplicated.
 *       The import is all-or-nothing: the first invalid row rolls the whole file back and
 *       returns 400 naming that row. Add `?dryRun=1` to report the outcome without writing
 *       anything.
 *     tags: [Failure Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `failureCodeImportRowSchema`"
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
 *         description: >
 *           Malformed CSV, a missing header column, a row that failed validation, or a row
 *           naming an unknown parent (the file is rolled back)
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
    noun: 'failure codes',
    columns: FAILURE_CODE_CSV_COLUMNS,
    schema: failureCodeImportRowSchema,
    mode: 'strict',
    run: async (ctx, rows) => {
      const existing = await ctx.tx.failureCode.findMany({
        where: { isDeleted: false },
        select: { failureCodeId: true, code: true, parentCodeId: true },
      });
      const idByCode = new Map(existing.map((c) => [c.code, c.failureCodeId]));
      const parentById = new Map(existing.map((c) => [c.failureCodeId, c.parentCodeId]));

      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };

      // Pass 1: make every code in the file exist. Parents are left alone here,
      // because the code a row names may not exist until a later row is read.
      for (const row of rows) {
        const d = row.record;
        const existingId = idByCode.get(d.code);
        if (existingId) {
          await ctx.tx.failureCode.update({
            where: { failureCodeId: existingId },
            data: { description: d.description, modifiedBy: ctx.userId },
          });
          await logAuditAction({
            table: 'FailureCode',
            recordId: existingId,
            action: 'Update',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.updated += 1;
        } else {
          const created = await ctx.tx.failureCode.create({
            data: {
              code: d.code,
              description: d.description,
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'FailureCode',
            recordId: created.failureCodeId,
            action: 'Create',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.created += 1;
          idByCode.set(d.code, created.failureCodeId);
          parentById.set(created.failureCodeId, null);
        }
      }

      // Pass 2: resolve the hierarchy now that every code in the file exists.
      // The counters are not touched here: each row was already counted exactly
      // once above, and counting the parent write too would report one row as
      // two changes.
      for (const row of rows) {
        const d = row.record;
        if (!d.parentCode) continue;

        const selfId = idByCode.get(d.code) as string;
        const parentId = idByCode.get(d.parentCode);
        if (!parentId) {
          outcome.rejected.push({ row: row.number, reason: `unknown parentCode '${d.parentCode}'` });
          continue;
        }
        if (parentId === selfId) {
          outcome.rejected.push({ row: row.number, reason: 'a failure code cannot be its own parent' });
          continue;
        }

        // A cycle is not refused by the single-row routes, but an import that
        // creates one removes both codes from the /tree listing (neither is
        // reachable from a root), so it is refused here rather than stored.
        let cursor: string | null = parentId;
        const seen = new Set<string>();
        let cycle = false;
        while (cursor && !seen.has(cursor)) {
          if (cursor === selfId) {
            cycle = true;
            break;
          }
          seen.add(cursor);
          cursor = parentById.get(cursor) ?? null;
        }
        if (cycle) {
          outcome.rejected.push({ row: row.number, reason: `parentCode '${d.parentCode}' would create a cycle` });
          continue;
        }

        if (parentById.get(selfId) === parentId) continue;
        await ctx.tx.failureCode.update({
          where: { failureCodeId: selfId },
          data: { parentCodeId: parentId, modifiedBy: ctx.userId },
        });
        parentById.set(selfId, parentId);
        await logAuditAction({
          table: 'FailureCode',
          recordId: selfId,
          action: 'Update',
          userId: ctx.userId,
          ipAddress: ctx.ipAddress,
          db: ctx.tx,
        });
      }

      return outcome;
    },
  })
);

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

    await logAuditAction({ table: 'FailureCode', recordId: failureCode.failureCodeId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(failureCode);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2003') {
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

    // Field diffs rather than one generic "Update" row: the trail should
    // say which column moved and from what to what. A PUT that changes
    // nothing records nothing, which is the honest outcome.
    await logFieldChanges({
      table: 'FailureCode',
      recordId: failureCode.failureCodeId,
      before: existing,
      after: failureCode,
      fields: AUDITED_FIELDS.FailureCode,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(failureCode);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2003') {
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

    await logAuditAction({ table: 'FailureCode', recordId: String(req.params.id), action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Failure code deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting failure code');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
