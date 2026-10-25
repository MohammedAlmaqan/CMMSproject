import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { causeCodeCreateSchema, causeCodeUpdateSchema, causeCodeImportRowSchema, validate } from '../utils/validation.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import { logger } from '../utils/logger.js';
import { parseCollectionQuery, mergeWhere, selectRows, QUERY_FIELDS } from '../utils/queryGrammar.js';

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

    const grammar = parseCollectionQuery(req.query as Record<string, unknown>, QUERY_FIELDS.causeCode);
    if (!grammar.ok) {
      return res.status(400).json({ error: 'Invalid query parameters', details: grammar.errors });
    }

    const codes = await prisma.causeCode.findMany({
      where: mergeWhere(where as Record<string, unknown>, grammar.query.where) as Prisma.CauseCodeWhereInput,
      orderBy: grammar.query.orderBy
        ? (grammar.query.orderBy as unknown as Prisma.CauseCodeOrderByWithRelationInput[])
        : { code: 'asc' },
      ...(grammar.query.skip !== null ? { skip: grammar.query.skip } : {}),
      ...(grammar.query.take !== null ? { take: grammar.query.take } : {}),
    });

    res.json(selectRows(codes, grammar.query.select));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching cause codes');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const CAUSE_CODE_CSV_COLUMNS = ['code', 'description'] as const;

/**
 * @openapi
 * /api/cause-codes/export.csv:
 *   get:
 *     summary: Export cause codes as CSV
 *     description: >
 *       Streams every non-deleted cause code as text/csv in code order. No role
 *       restriction beyond authentication.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Cause codes as text/csv
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'cause codes',
    filename: 'cause-codes',
    columns: CAUSE_CODE_CSV_COLUMNS,
    rows: async () => {
      const rows = await prisma.causeCode.findMany({
        where: { isDeleted: false },
        orderBy: { code: 'asc' },
      });
      return rows.map((row) => [row.code, row.description]);
    },
  })
);

/**
 * @openapi
 * /api/cause-codes/import.csv:
 *   post:
 *     summary: Import cause codes from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Rows are validated by `causeCodeImportRowSchema`. A row whose `code` already
 *       exists is updated rather than duplicated. The import is all-or-nothing: the first
 *       invalid row rolls the whole file back and returns 400 naming that row. Add
 *       `?dryRun=1` to report the outcome without writing anything.
 *     tags: [Cause Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `causeCodeImportRowSchema`"
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
    noun: 'cause codes',
    columns: CAUSE_CODE_CSV_COLUMNS,
    schema: causeCodeImportRowSchema,
    mode: 'strict',
    run: async (ctx, rows) => {
      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };
      for (const row of rows) {
        const d = row.record;
        const existing = await ctx.tx.causeCode.findFirst({
          where: { code: d.code, isDeleted: false },
        });

        if (existing) {
          await ctx.tx.causeCode.update({
            where: { causeCodeId: existing.causeCodeId },
            data: { description: d.description, modifiedBy: ctx.userId },
          });
          await logAuditAction({
            table: 'CauseCode',
            recordId: existing.causeCodeId,
            action: 'Update',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.updated += 1;
        } else {
          const created = await ctx.tx.causeCode.create({
            data: {
              code: d.code,
              description: d.description,
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'CauseCode',
            recordId: created.causeCodeId,
            action: 'Create',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.created += 1;
        }
      }
      return outcome;
    },
  })
);

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
