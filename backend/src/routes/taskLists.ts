import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { taskListCreateSchema, taskListUpdateSchema, validate } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

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
    const where: any = { isDeleted: false };

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

    const taskLists = await prisma.taskList.findMany({
      where,
      orderBy: { code: 'asc' },
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

    res.json(taskLists);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching task lists');
    res.status(500).json({ error: 'Internal server error' });
  }
});


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
            create: operations.map((op: any) => ({
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
                  create: op.materials.map((m: any) => ({
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
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { include: { material: true } } },
        },
      },
    });

    await logAudit(
      { tableName: 'TaskList', recordId: taskList.taskListId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(taskList);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Either the task list code collided, or one operation listed the same
      // material twice. The index is on (taskOperationId, materialId), so a
      // duplicate requirement is a data-entry slip; the generic code message
      // would blame the wrong field and send the caller looking at the header.
      const target = String(error.meta?.target ?? '');
      if (target.includes('TaskListMaterial')) {
        return res.status(400).json({ error: 'An operation lists the same material more than once' });
      }
      return res.status(409).json({ error: 'Task list code already exists' });
    }
    if (error.code === 'P2003') {
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

    const taskList = await prisma.taskList.update({
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
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { include: { material: true } } },
        },
      },
    });

    if (operations) {
      // 3.4: soft-replace operations — TaskListOperation carries isDeleted, so the previous
      // set is soft-deleted (updateMany) instead of hard-deleted; list/detail filters below
      // then hide them historically while the WorkOrder-PM-copy path never sees them.
      //
      // The requirements are hard-deleted first. TaskListMaterial is a composition
      // child of the operation and, per the same rule 3.4 reasoning that applies to
      // WorkOrderMaterial, carries no isDeleted column. Left in place they would
      // outlive every operation they describe: the operations become invisible, the
      // requirements do not, and the row grows on each edit of the task list.
      const superseded = await prisma.taskListOperation.findMany({
        where: { taskListId: String(req.params.id), isDeleted: false },
        select: { taskOperationId: true },
      });

      await prisma.$transaction(async (tx) => {
        if (superseded.length > 0) {
          await tx.taskListMaterial.deleteMany({
            where: { taskOperationId: { in: superseded.map((o) => o.taskOperationId) } },
          });
        }

        await tx.taskListOperation.updateMany({
          where: { taskListId: String(req.params.id), isDeleted: false },
          data: { isDeleted: true, modifiedBy: req.user!.userId },
        });

        // One create per operation rather than createMany, because a requirement
        // needs the operation's generated id and createMany cannot nest.
        for (const op of operations as any[]) {
          const created = await tx.taskListOperation.create({
            data: {
              taskListId: String(req.params.id),
              sequenceNumber: op.sequenceNumber,
              description: op.description,
              craftId: op.craftId,
              plannedHours: op.plannedHours,
              numberOfTechnicians: op.numberOfTechnicians || 1,
              createdBy: req.user!.userId,
              modifiedBy: req.user!.userId,
            },
          });

          if (op.materials?.length) {
            await tx.taskListMaterial.createMany({
              data: op.materials.map((m: any) => ({
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

    const updated = await prisma.taskList.findUnique({
      where: { taskListId: String(req.params.id) },
      include: {
        operations: {
          where: { isDeleted: false },
          orderBy: { sequenceNumber: 'asc' },
          include: { craft: true, materials: { include: { material: true } } },
        },
        workCenter: {
          select: { workCenterId: true, code: true, name: true },
        },
        equipment: {
          select: { equipmentId: true, equipmentCode: true, name: true },
        },
      },
    });

    await logAudit(
      { tableName: 'TaskList', recordId: String(req.params.id), action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Either the task list code collided, or one operation listed the same
      // material twice. The index is on (taskOperationId, materialId), so a
      // duplicate requirement is a data-entry slip; the generic code message
      // would blame the wrong field and send the caller looking at the header.
      const target = String(error.meta?.target ?? '');
      if (target.includes('TaskListMaterial')) {
        return res.status(400).json({ error: 'An operation lists the same material more than once' });
      }
      return res.status(409).json({ error: 'Task list code already exists' });
    }
    if (error.code === 'P2003') {
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
    // reason the update path does it, and the requirements are hard-deleted
    // first because TaskListMaterial is a composition child with no isDeleted
    // column, so left in place they would outlive every operation they describe.
    const superseded = await prisma.taskListOperation.findMany({
      where: { taskListId: String(req.params.id), isDeleted: false },
      select: { taskOperationId: true },
    });

    await prisma.$transaction(async (tx) => {
      if (superseded.length > 0) {
        await tx.taskListMaterial.deleteMany({
          where: { taskOperationId: { in: superseded.map((o) => o.taskOperationId) } },
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

    await logAudit(
      { tableName: 'TaskList', recordId: String(req.params.id), action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Task list deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task list');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
