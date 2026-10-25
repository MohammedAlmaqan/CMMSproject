import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import type { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logFieldChanges } from '../middleware/audit.js';
import { taskListCreateSchema, taskListUpdateSchema, taskListImportRowSchema, validate, taskListOperationItemSchema, taskListMaterialItemSchema } from '../utils/validation.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import { isPrismaError, prismaErrorTarget } from '../utils/prismaErrors.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { parseCollectionQuery, mergeWhere, selectRows, QUERY_FIELDS } from '../utils/queryGrammar.js';

type OperationInput = z.infer<typeof taskListOperationItemSchema>;
type MaterialInput = z.infer<typeof taskListMaterialItemSchema>;

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/task-lists:
 *   get:
 *     summary: List task lists
 *     description: >
 *       Returns non-deleted task lists with their operations. Filter by a case-insensitive
 *       search over code and description, by equipmentClass, by a specific equipmentId, or
 *       by workCenterId. Each operation carries the materials that step requires
 *       (SOW 3.1.4) with the material resolved.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive match on code or description
 *       - in: query
 *         name: equipmentClass
 *         schema: { type: string }
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
 *         description: Array of task lists
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   taskListId: { type: string }
 *                   code: { type: string }
 *                   description: { type: string }
 *                   equipmentClass: { type: string, nullable: true }
 *                   equipmentId: { type: string, nullable: true }
 *                   workCenterId: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 *   post:
 *     summary: Create a task list
 *     description: >
 *       Creates a task list and, when supplied, its operations in one transaction. Each
 *       operation is validated by the zod schema `taskListOperationItemSchema` (see
 *       utils/validation.ts). Requires the Requester role. Missing references surface as
 *       Prisma P2003 and are translated to HTTP 400.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `taskListCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, description, workCenterId]
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *               equipmentClass: { type: string, nullable: true }
 *               equipmentId: { type: string, nullable: true }
 *               workCenterId: { type: string }
 *               operations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sequenceNumber, description, craftId]
 *                   properties:
 *                     sequenceNumber: { type: integer, minimum: 1 }
 *                     description: { type: string }
 *                     craftId: { type: string }
 *                     plannedHours: { type: number, minimum: 0 }
 *                     numberOfTechnicians: { type: integer, minimum: 1 }
 *                     materials:
 *                       description: >
 *                         SOW 3.1.4 - the materials this step requires. Attached to the step
 *                         rather than the list, so the store can see which step is blocked when
 *                         a part is short. A part may appear once per step; a repeat is HTTP
 *                         400 rather than a silent sum.
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [materialId, quantity]
 *                         properties:
 *                           materialId: { type: string }
 *                           quantity: { type: number, minimum: 0, description: "0 means required but not yet quantified" }
 *     responses:
 *       '201':
 *         description: Task list created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, a referenced record was not found (P2003), or one operation lists a material twice
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '409':
 *         description: code already exists among active rows
 *       '500':
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const equipmentClass = req.query.equipmentClass as string | undefined;
    const equipmentId = req.query.equipmentId as string | undefined;
    const workCenterId = req.query.workCenterId as string | undefined;
    const where: Prisma.TaskListWhereInput = { isDeleted: false };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (equipmentClass) {
      where.equipmentClass = equipmentClass;
    }
    if (equipmentId) {
      where.equipmentId = equipmentId;
    }
    if (workCenterId) {
      where.workCenterId = workCenterId;
    }

    const grammar = parseCollectionQuery(req.query as Record<string, unknown>, QUERY_FIELDS.taskList);
    if (!grammar.ok) {
      return res.status(400).json({ error: 'Invalid query parameters', details: grammar.errors });
    }

    const taskLists = await prisma.taskList.findMany({
      where: mergeWhere(where as Record<string, unknown>, grammar.query.where) as Prisma.TaskListWhereInput,
      orderBy: grammar.query.orderBy
        ? (grammar.query.orderBy as unknown as Prisma.TaskListOrderByWithRelationInput[])
        : { code: 'asc' },
      ...(grammar.query.skip !== null ? { skip: grammar.query.skip } : {}),
      ...(grammar.query.take !== null ? { take: grammar.query.take } : {}),
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: {
            craft: true,
            // SOW 3.1.4: the materials this step requires.
            materials: { include: { material: true } },
          },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    res.json(selectRows(taskLists, grammar.query.select));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching task lists');
    res.status(500).json({ error: 'Internal server error' });
  }
});


const TASK_LIST_CSV_COLUMNS = [
  'code',
  'description',
  'equipmentClass',
  'equipmentCode',
  'workCenterCode',
] as const;

/**
 * @openapi
 * /api/task-lists/export.csv:
 *   get:
 *     summary: Export task-list headers as CSV
 *     description: >
 *       Streams every non-deleted task list as text/csv in code order. Operations and
 *       their required materials are not included: a flat file cannot carry a nested
 *       step list without inventing a second row shape, so those stay on the task-list
 *       screen. The work center and equipment are written by code.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Task-list headers as text/csv
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'task lists',
    filename: 'task-lists',
    columns: TASK_LIST_CSV_COLUMNS,
    rows: async () => {
      const rows = await prisma.taskList.findMany({
        where: { isDeleted: false },
        orderBy: { code: 'asc' },
        include: {
          workCenter: { select: { code: true } },
          equipment: { select: { equipmentCode: true } },
        },
      });
      return rows.map((row) => [
        row.code,
        row.description,
        row.equipmentClass ?? '',
        row.equipment?.equipmentCode ?? '',
        row.workCenter.code,
      ]);
    },
  })
);

/**
 * @openapi
 * /api/task-lists/import.csv:
 *   post:
 *     summary: Import task-list headers from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Rows are validated by `taskListImportRowSchema`; `workCenterCode` must name an
 *       existing work center and `equipmentCode`, when given, an existing equipment. A row
 *       whose `code` already exists is updated rather than duplicated. A blank optional cell
 *       leaves the stored value alone, so an empty `equipmentCode` never clears a task
 *       list's equipment. Operations and their required materials are not imported; they
 *       stay on the task-list screen. The import is all-or-nothing: the first invalid row
 *       rolls the whole file back and returns 400 naming that row. Add `?dryRun=1` to
 *       report the outcome without writing anything.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `taskListImportRowSchema`"
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
 *         description: Malformed CSV, a missing header column, or a row naming an unknown work center or equipment (the file is rolled back)
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
    noun: 'task lists',
    columns: TASK_LIST_CSV_COLUMNS,
    schema: taskListImportRowSchema,
    mode: 'strict',
    run: async (ctx, rows) => {
      const [workCenters, equipment] = await Promise.all([
        ctx.tx.workCenter.findMany({ where: { isDeleted: false }, select: { workCenterId: true, code: true } }),
        ctx.tx.equipment.findMany({ where: { isDeleted: false }, select: { equipmentId: true, equipmentCode: true } }),
      ]);
      const workCenterByCode = new Map(workCenters.map((w) => [w.code, w.workCenterId]));
      const equipmentByCode = new Map(equipment.map((e) => [e.equipmentCode, e.equipmentId]));

      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };
      for (const row of rows) {
        const d = row.record;

        const workCenterId = workCenterByCode.get(d.workCenterCode);
        if (!workCenterId) {
          outcome.rejected.push({ row: row.number, reason: `unknown workCenterCode '${d.workCenterCode}'` });
          continue;
        }

        let equipmentId: string | undefined;
        if (d.equipmentCode) {
          equipmentId = equipmentByCode.get(d.equipmentCode);
          if (!equipmentId) {
            outcome.rejected.push({ row: row.number, reason: `unknown equipmentCode '${d.equipmentCode}'` });
            continue;
          }
        }

        const existing = await ctx.tx.taskList.findFirst({
          where: { code: d.code, isDeleted: false },
        });

        if (existing) {
          await ctx.tx.taskList.update({
            where: { taskListId: existing.taskListId },
            data: {
              description: d.description,
              equipmentClass: d.equipmentClass || existing.equipmentClass,
              equipmentId: equipmentId ?? existing.equipmentId,
              workCenterId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'TaskList',
            recordId: existing.taskListId,
            action: 'Update',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.updated += 1;
        } else {
          const created = await ctx.tx.taskList.create({
            data: {
              code: d.code,
              description: d.description,
              equipmentClass: d.equipmentClass || null,
              equipmentId: equipmentId ?? null,
              workCenterId,
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'TaskList',
            recordId: created.taskListId,
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
 * /api/task-lists/{id}:
 *   get:
 *     summary: Get one task list
 *     description: >
 *       Returns a single non-deleted task list with its non-deleted operations ordered by
 *       sequenceNumber, each with the resolved craft.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: TaskList taskListId
 *     responses:
 *       '200':
 *         description: Task list detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: Task list not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const taskList = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: {
            craft: true,
            // SOW 3.1.4: the materials this step requires.
            materials: { include: { material: true } },
          },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    if (!taskList) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    res.json(taskList);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching task list');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Requester'), validate(taskListCreateSchema), async (req: Request, res: Response) => {
  try {
    const { code, description, equipmentClass, equipmentId, workCenterId, operations } = req.body;

    const taskList = await prisma.taskList.create({
      data: {
        code,
        description,
        equipmentClass: equipmentClass || null,
        equipmentId: equipmentId || null,
        workCenterId,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
        ...(operations && {
          operations: {
            create: operations.map((op: OperationInput) => ({
              sequenceNumber: op.sequenceNumber,
              description: op.description,
              craftId: op.craftId,
              plannedHours: op.plannedHours,
              numberOfTechnicians: op.numberOfTechnicians || 1,
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
              // SOW 3.1.4 required materials, attached to the step that needs them.
              ...(op.materials?.length && {
                materials: {
                  create: op.materials.map((m: MaterialInput) => ({
                    materialId: m.materialId,
                    quantity: m.quantity,
                    createdBy: req.user!.userId,
                    modifiedBy: req.user!.userId,
                  })),
                },
              }),
            })),
          },
        }),
      },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { where: { isDeleted: false }, include: { material: true } } },
        },
      },
    });

    await logAuditAction({ table: 'TaskList', recordId: taskList.taskListId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(taskList);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2002') {
      // Either the task list code collided, or one operation listed the same
      // material twice. The index is on (taskOperationId, materialId), so a
      // duplicate requirement is a data-entry slip; the generic code message
      // would blame the wrong field and send the caller looking at the header.
      const target = prismaErrorTarget(error);
      if (target.includes('code')) {
        return res.status(409).json({ error: 'Task list code already exists' });
      }
      return res.status(400).json({ error: 'An operation lists the same material more than once' });
    }
    if (isPrismaError(error) && error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced work center, equipment, or craft not found' });
    }
    logger.error({ err: error }, 'Error creating task list');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/task-lists/{id}:
 *   put:
 *     summary: Update a task list
 *     description: >
 *       Partial update of the task list header and, when supplied, its operations. Validated
 *       by the zod schema `taskListUpdateSchema` (see utils/validation.ts). Requires the
 *       Requester role.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: TaskList taskListId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `taskListUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string }
 *               description: { type: string }
 *               equipmentClass: { type: string, nullable: true }
 *               equipmentId: { type: string, nullable: true }
 *               workCenterId: { type: string }
 *               operations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sequenceNumber, description, craftId]
 *                   properties:
 *                     sequenceNumber: { type: integer, minimum: 1 }
 *                     description: { type: string }
 *                     craftId: { type: string }
 *                     plannedHours: { type: number, minimum: 0 }
 *                     numberOfTechnicians: { type: integer, minimum: 1 }
 *     responses:
 *       '200':
 *         description: Task list updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or a referenced record was not found (P2003)
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '404':
 *         description: Task list not found
 *       '409':
 *         description: code already in use by another active row
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorizeMinRole('Requester'), validate(taskListUpdateSchema), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    const { code, description, equipmentClass: ec, equipmentId: ei, workCenterId, operations } = req.body;

    // Bound for the audit diff below. The value is stale with respect to
    // `operations`, which get replaced in the transaction further down and are
    // read again for the response, but TaskList's audited columns are all
    // scalars, and those are exactly what this call returns.
    const updatedForAudit = await prisma.taskList.update({
      where: { taskListId: String(req.params.id) },
      data: {
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        ...(ec !== undefined && { equipmentClass: ec || null }),
        ...(ei !== undefined && { equipmentId: ei || null }),
        ...(workCenterId !== undefined && { workCenterId }),
        modifiedBy: req.user!.userId,
      },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { where: { isDeleted: false }, include: { material: true } } },
        },
      },
    });

    if (operations) {
      // 3.4: soft-replace operations — TaskListOperation carries isDeleted, so the previous
      // set is soft-deleted (updateMany) instead of hard-deleted; list/detail filters below
      // then hide them historically while the WorkOrder-PM-copy path never sees them. The
      // requirements are soft-deleted too, matching the operations they describe — left
      // live they would outlive every operation and the row set would grow on each edit.
      const superseded = await prisma.taskListOperation.findMany({
        where: { taskListId: String(req.params.id), isDeleted: false },
        select: { taskOperationId: true },
      });

      await prisma.$transaction(async (tx) => {
        if (superseded.length > 0) {
          await tx.taskListMaterial.updateMany({
            where: { taskOperationId: { in: superseded.map((o) => o.taskOperationId) } },
            data: { isDeleted: true, modifiedBy: req.user!.userId },
          });
        }

        await tx.taskListOperation.updateMany({
          where: { taskListId: String(req.params.id), isDeleted: false },
          data: { isDeleted: true, modifiedBy: req.user!.userId },
        });

        // One create per operation rather than createMany, because a requirement
        // needs the operation's generated id and createMany cannot nest.
        for (const op of operations as OperationInput[]) {
          const created = await tx.taskListOperation.create({
            data: {
              taskListId: String(req.params.id),
              sequenceNumber: op.sequenceNumber,
              description: op.description,
              craftId: op.craftId,
              plannedHours: op.plannedHours as number,
              numberOfTechnicians: op.numberOfTechnicians || 1,
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
            },
          });

          if (op.materials?.length) {
            await tx.taskListMaterial.createMany({
              data: op.materials.map((m: MaterialInput) => ({
                taskOperationId: created.taskOperationId,
                materialId: m.materialId,
                quantity: m.quantity,
                createdBy: req.user!.userId,
                modifiedBy: req.user!.userId,
              })),
            });
          }
        }
      });
    }

    const updated = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { where: { isDeleted: false }, include: { material: true } } },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    // Field diffs rather than one generic "Update" row: the trail should
    // say which column moved and from what to what. A PUT that changes
    // nothing records nothing, which is the honest outcome.
    await logFieldChanges({
      table: 'TaskList',
      recordId: String(req.params.id),
      before: existing,
      after: updatedForAudit,
      fields: AUDITED_FIELDS.TaskList,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error) {
    if (isPrismaError(error) && error.code === 'P2002') {
      // Either the task list code collided, or one operation listed the same
      // material twice. The index is on (taskOperationId, materialId), so a
      // duplicate requirement is a data-entry slip; the generic code message
      // would blame the wrong field and send the caller looking at the header.
      const target = prismaErrorTarget(error);
      if (target.includes('code')) {
        return res.status(409).json({ error: 'Task list code already exists' });
      }
      return res.status(400).json({ error: 'An operation lists the same material more than once' });
    }
    if (isPrismaError(error) && error.code === 'P2003') {
      return res.status(400).json({ error: 'Referenced work center, equipment, or craft not found' });
    }
    logger.error({ err: error }, 'Error updating task list');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/task-lists/{id}:
 *   delete:
 *     summary: Soft delete a task list
 *     description: >
 *       Marks the task list isDeleted=true. Work orders already generated from the list are
 *       retained. Requires the Maintenance Supervisor role.
 *     tags: [Task Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: TaskList taskListId
 *     responses:
 *       '200':
 *         description: Task list soft deleted
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
 *         description: Task list not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.taskList.findFirst({
      where: { taskListId: String(req.params.id), isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Task list not found' });
    }

    // A soft-deleted list whose steps are still live is worse than a leak. The
    // steps keep `isDeleted: false`, so they still reference their craft, and a
    // craft could then never be retired (crafts.ts refuses retirement while a
    // task list step points at it). They are soft-deleted here for the same
    // reason the update path does it, and the requirements are soft-deleted
    // with them so nothing outlives the operations it describes.
    const superseded = await prisma.taskListOperation.findMany({
      where: { taskListId: String(req.params.id), isDeleted: false },
      select: { taskOperationId: true },
    });

    await prisma.$transaction(async (tx) => {
      if (superseded.length > 0) {
        await tx.taskListMaterial.updateMany({
          where: { taskOperationId: { in: superseded.map((o) => o.taskOperationId) } },
          data: { isDeleted: true, modifiedBy: req.user!.userId },
        });
      }

      await tx.taskListOperation.updateMany({
        where: { taskListId: String(req.params.id), isDeleted: false },
        data: { isDeleted: true, modifiedBy: req.user!.userId },
      });

      await tx.taskList.update({
        where: { taskListId: String(req.params.id) },
        data: { isDeleted: true, modifiedBy: req.user!.userId },
      });
    });

    await logAuditAction({ table: 'TaskList', recordId: String(req.params.id), action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task list');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
