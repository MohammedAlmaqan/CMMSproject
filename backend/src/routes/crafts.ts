import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import type { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { validate, craftCreateSchema, craftUpdateSchema, craftImportRowSchema } from '../utils/validation.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { logger } from '../utils/logger.js';
import { parseCollectionQuery, mergeWhere, selectRows, QUERY_FIELDS } from '../utils/queryGrammar.js';

const router = Router();

// R.10: a rate edit fans out to every live work order carrying the craft, and the
// recomputes run inside one interactive transaction. The default 5 s ceiling can
// be reached by a large fan-out, so it is raised the same way the login fix
// raised it (see routes/auth.ts) rather than left to fail partway.
const TX_OPTIONS = { maxWait: 30000, timeout: 30000 };

router.use(authenticate);

/**
 * @openapi
 * /api/crafts:
 *   get:
 *     summary: List crafts
 *     description: >
 *       Returns all non-deleted crafts ordered by craftCode ascending. Read-only reference
 *       endpoint - no role restriction beyond authentication, so any signed-in user can
 *       populate a craft dropdown.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Array of crafts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   craftId: { type: string }
 *                   workCenterId: { type: string }
 *                   craftCode: { type: string }
 *                   description: { type: string }
 *                   hourlyRate: { type: number, format: float, description: "Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number" }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *                   isDeleted: { type: boolean }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const grammar = parseCollectionQuery(req.query as Record<string, unknown>, QUERY_FIELDS.craft);
    if (!grammar.ok) {
      return res.status(400).json({ error: 'Invalid query parameters', details: grammar.errors });
    }

    const crafts = await prisma.craft.findMany({
      where: mergeWhere({ isDeleted: false }, grammar.query.where) as Prisma.CraftWhereInput,
      orderBy: grammar.query.orderBy
        ? (grammar.query.orderBy as unknown as Prisma.CraftOrderByWithRelationInput[])
        : { craftCode: 'asc' },
      ...(grammar.query.skip !== null ? { skip: grammar.query.skip } : {}),
      ...(grammar.query.take !== null ? { take: grammar.query.take } : {}),
    });

    res.json(selectRows(crafts, grammar.query.select));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching crafts');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SOW 3.1.3 with decision D-16: crafts are assigned to a work centre and each
// carries its own hourly rate, and that rate is what 3.5.1 cost estimation
// consumes. The model columns were already correct; the collection was simply
// never writable, so a planner could not staff a work centre or correct a rate.
// Rule 3.4 applies: crafts are retired with isDeleted=true rather than removed,
// because WorkOrderOperation and TaskListOperation both reference a craft and
// historical labour cost must stay resolvable.

/**
 * @openapi
 * /api/crafts:
 *   post:
 *     summary: Assign a craft to a work centre with its own hourly rate
 *     description: >
 *       Creates a craft under a work centre. The hourly rate is required, not
 *       defaulted, so a craft can never enter costing as a silent zero. Rejects
 *       an unknown or deleted work centre and a duplicate craft code within
 *       that work centre. Per decision D-16 the rate is stored per craft; the
 *       Float to Decimal migration is deferred to v1.1.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workCenterId, craftCode, description, hourlyRate]
 *             properties:
 *               workCenterId: { type: string }
 *               craftCode: { type: string }
 *               description: { type: string }
 *               hourlyRate:
 *                 type: number
 *                 minimum: 0
 *                 description: "Craft-specific rate. Stored as DECIMAL(12,2) since Phase E (D-17); served as a JSON number"
 *     responses:
 *       '201':
 *         description: Craft created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 craftId: { type: string }
 *                 workCenterId: { type: string }
 *                 craftCode: { type: string }
 *                 description: { type: string }
 *                 hourlyRate: { type: number, format: float }
 *       '400':
 *         description: Validation failed, or the work centre is not available
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '409':
 *         description: That craft code already exists in this work centre
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorizeMinRole('Maintenance Planner'), validate(craftCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workCenterId, craftCode, description, hourlyRate } = req.body;

    const workCenter = await prisma.workCenter.findFirst({
      where: { workCenterId, isDeleted: false },
      select: { workCenterId: true },
    });
    if (!workCenter) {
      return res.status(400).json({ error: 'Work center not found' });
    }

    const duplicate = await prisma.craft.findFirst({
      where: { workCenterId, craftCode, isDeleted: false },
      select: { craftId: true },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Craft code already exists in this work center' });
    }

    const craft = await prisma.craft.create({
      data: {
        workCenterId,
        craftCode,
        description,
        hourlyRate,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
    });

    await logAuditAction({ table: 'Craft', recordId: craft.craftId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(craft);
  } catch (error) {
    logger.error({ err: error }, 'Error creating craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const CRAFT_CSV_COLUMNS = ['workCenterCode', 'craftCode', 'description', 'hourlyRate'] as const;

/**
 * @openapi
 * /api/crafts/export.csv:
 *   get:
 *     summary: Export the craft register as CSV
 *     description: >
 *       Streams every non-deleted craft as text/csv, in work-center code then
 *       craft-code order. The work center is written by its `code`, not its
 *       id, so the file is readable and portable across deployments. No role
 *       restriction beyond authentication.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: The craft register as text/csv
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'crafts',
    filename: 'crafts',
    columns: CRAFT_CSV_COLUMNS,
    rows: async () => {
      const rows = await prisma.craft.findMany({
        where: { isDeleted: false },
        orderBy: [{ workCenter: { code: 'asc' } }, { craftCode: 'asc' }],
        include: { workCenter: { select: { code: true } } },
      });
      return rows.map((row) => [
        row.workCenter.code,
        row.craftCode,
        row.description,
        row.hourlyRate.toString(),
      ]);
    },
  })
);

/**
 * @openapi
 * /api/crafts/import.csv:
 *   post:
 *     summary: Import crafts from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Rows are validated by `craftImportRowSchema`; `workCenterCode` must name an
 *       existing work center. A row whose (workCenterCode, craftCode) pair already exists
 *       is updated rather than duplicated. The import is all-or-nothing: the first invalid
 *       row rolls the whole file back and returns 400 naming that row. A changed
 *       `hourlyRate` re-costs every live work order carrying the craft, exactly as the
 *       single-craft update does; the whole import therefore runs in one transaction with
 *       the raised ceiling that update already uses. Add `?dryRun=1` to report the outcome
 *       without writing anything.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `craftImportRowSchema`"
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
 *         description: Malformed CSV, a missing header column, or a row naming an unknown work center (the file is rolled back)
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
    noun: 'crafts',
    columns: CRAFT_CSV_COLUMNS,
    schema: craftImportRowSchema,
    mode: 'strict',
    // A rate change re-costs its work orders inside the transaction; the same
    // fan-out is why the single-craft PUT raises the ceiling (R.10).
    txOptions: TX_OPTIONS,
    run: async (ctx, rows) => {
      const workCenters = await ctx.tx.workCenter.findMany({
        where: { isDeleted: false },
        select: { workCenterId: true, code: true },
      });
      const workCenterByCode = new Map(workCenters.map((w) => [w.code, w.workCenterId]));
      const actor = { userId: ctx.userId, ipAddress: ctx.ipAddress };

      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };
      for (const row of rows) {
        const d = row.record;

        const workCenterId = workCenterByCode.get(d.workCenterCode);
        if (!workCenterId) {
          outcome.rejected.push({ row: row.number, reason: `unknown workCenterCode '${d.workCenterCode}'` });
          continue;
        }

        const existing = await ctx.tx.craft.findFirst({
          where: { workCenterId, craftCode: d.craftCode, isDeleted: false },
        });

        if (existing) {
          const rateChanged = Number(d.hourlyRate) !== Number(existing.hourlyRate);
          await ctx.tx.craft.update({
            where: { craftId: existing.craftId },
            data: { description: d.description, hourlyRate: d.hourlyRate, modifiedBy: ctx.userId },
          });
          await logAuditAction({
            table: 'Craft',
            recordId: existing.craftId,
            action: 'Update',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });

          if (rateChanged) {
            const affected = await ctx.tx.workOrderOperation.findMany({
              where: { craftId: existing.craftId, isDeleted: false, workOrder: { isDeleted: false } },
              select: { workOrderId: true },
              distinct: ['workOrderId'],
            });
            for (const { workOrderId } of affected) {
              await recomputeWorkOrderCosts(workOrderId, actor, ctx.tx);
            }
          }
          outcome.updated += 1;
        } else {
          const created = await ctx.tx.craft.create({
            data: {
              workCenterId,
              craftCode: d.craftCode,
              description: d.description,
              hourlyRate: d.hourlyRate,
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'Craft',
            recordId: created.craftId,
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
 * /api/crafts/{id}:
 *   get:
 *     summary: Get one craft
 *     description: Returns a single non-deleted craft by its craftId.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     responses:
 *       '200':
 *         description: The craft
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Craft not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const craft = await prisma.craft.findFirst({
      where: { craftId: String(req.params.id), isDeleted: false },
    });
    if (!craft) {
      return res.status(404).json({ error: 'Craft not found' });
    }
    res.json(craft);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/crafts/{id}:
 *   put:
 *     summary: Edit a craft's rate, code or description
 *     description: >
 *       Partial update. Only fields present in the body are written, so a caller
 *       correcting one rate does not blank the description. A craft code that
 *       already exists elsewhere in the same work centre is refused. Retired
 *       crafts are not editable. The hourly rate is the basis every work order
 *       operation on this craft is priced from (SOW 3.5.1), so a rate change
 *       re-costs every non-deleted work order carrying the craft in the same
 *       transaction; the response reports how many with `recomputedWorkOrders`.
 *       Soft-deleted work orders are deliberately left alone.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               craftCode: { type: string }
 *               description: { type: string }
 *               hourlyRate: { type: number, minimum: 0 }
 *     responses:
 *       '200':
 *         description: >
 *           Craft updated. `hourlyRate` carries the stored value; the rest of the
 *           craft row is unchanged. `recomputedWorkOrders` is the number of live
 *           work orders whose stored cost was rewritten because their operations
 *           use this craft (0 when the rate did not move).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 craftId: { type: string }
 *                 workCenterId: { type: string }
 *                 craftCode: { type: string }
 *                 description: { type: string }
 *                 hourlyRate: { type: number }
 *                 recomputedWorkOrders: { type: integer }
 *       '400':
 *         description: Validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Craft not found
 *       '409':
 *         description: That craft code already exists in this work center
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Maintenance Planner'), validate(craftUpdateSchema), async (req: Request, res: Response) => {
  try {
    const craftId = String(req.params.id);
    const existing = await prisma.craft.findFirst({
      where: { craftId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Craft not found' });
    }

    if (req.body.craftCode !== undefined && req.body.craftCode !== existing.craftCode) {
      const duplicate = await prisma.craft.findFirst({
        where: {
          workCenterId: existing.workCenterId,
          craftCode: req.body.craftCode,
          isDeleted: false,
          NOT: { craftId },
        },
        select: { craftId: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Craft code already exists in this work center' });
      }
    }

    // R.10: only a rate move changes cost. A description or code edit leaves
    // every derived figure where it was, so the fan-out is scoped to the one
    // column that feeds SOW 3.5.1's planned-labour term.
    const rateChanged =
      req.body.hourlyRate !== undefined &&
      Number(req.body.hourlyRate) !== Number(existing.hourlyRate);

    const actor = { userId: req.user!.userId, ipAddress: req.ip };

    const { craft, recomputedWorkOrders } = await prisma.$transaction(async (tx) => {
      const craft = await tx.craft.update({
        where: { craftId },
        data: {
          ...(req.body.craftCode !== undefined && { craftCode: req.body.craftCode }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.hourlyRate !== undefined && { hourlyRate: req.body.hourlyRate }),
          modifiedBy: req.user!.userId,
        },
      });

      // Field diffs rather than one generic "Update" row: the trail should
      // say which column moved and from what to what. A PUT that changes
      // nothing records nothing, which is the honest outcome. Written on the
      // transaction's client so the rate change and its audit row commit
      // together.
      await logFieldChanges({
        table: 'Craft',
        recordId: craftId,
        before: existing,
        after: craft,
        fields: AUDITED_FIELDS.Craft,
        userId: req.user!.userId,
        ipAddress: req.ip,
        db: tx,
      });

      let recomputedWorkOrders = 0;
      if (rateChanged) {
        // The affected set is every non-deleted work order with at least one
        // non-deleted operation on this craft. Re-costing a soft-deleted work
        // order would erase the R.9 B reproduction and serves no reader, so
        // `isDeleted: false` is load-bearing on both hops.
        const affected = await tx.workOrderOperation.findMany({
          where: { craftId, isDeleted: false, workOrder: { isDeleted: false } },
          select: { workOrderId: true },
          distinct: ['workOrderId'],
        });
        for (const { workOrderId } of affected) {
          // Same transaction, so the recompute reads the rate this edit just
          // wrote (a global client could not see it) and cannot commit apart
          // from the edit that invalidated it.
          await recomputeWorkOrderCosts(workOrderId, actor, tx);
          recomputedWorkOrders += 1;
        }
      }

      return { craft, recomputedWorkOrders };
    }, TX_OPTIONS);

    res.json({ ...craft, recomputedWorkOrders });
  } catch (error) {
    logger.error({ err: error }, 'Error updating craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/crafts/{id}:
 *   delete:
 *     summary: Retire a craft
 *     description: >
 *       Sets isDeleted=true. Crafts are retired rather than removed because
 *       work order and task list operations reference them and historical
 *       labour cost must stay resolvable. A craft already in use by an operation
 *       is refused with 409 so an active plan cannot lose its cost basis.
 *     tags: [Crafts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Craft craftId
 *     responses:
 *       '200':
 *         description: Craft retired
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
 *         description: Craft not found
 *       '409':
 *         description: Craft is still referenced by a work order operation or a task list step
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const craftId = String(req.params.id);
    const existing = await prisma.craft.findFirst({
      where: { craftId, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Craft not found' });
    }

    // A craft referenced only by a task list must block retirement too. The
    // template holds the id, and C.6 copies it verbatim onto every work order
    // created from that template, so retiring the craft would silently produce
    // work orders whose steps point at a craft that appears in no craft list.
    // Soft-deleted steps are ignored: a retired template is not a live plan.
    const [inWorkOrders, inTaskLists] = await Promise.all([
      prisma.workOrderOperation.count({ where: { craftId } }),
      prisma.taskListOperation.count({ where: { craftId, isDeleted: false } }),
    ]);
    if (inWorkOrders > 0 || inTaskLists > 0) {
      const sources = [
        inWorkOrders > 0 ? 'a work order operation' : null,
        inTaskLists > 0 ? 'a task list step' : null,
      ].filter(Boolean);
      return res.status(409).json({
        error: `Craft is still referenced by ${sources.join(' and ')}`,
      });
    }

    await prisma.craft.update({
      where: { craftId },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'Craft', recordId: craftId, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Craft deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting craft');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;