import type { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction, logAuditFieldChange, logFieldChanges, auditMiddleware } from '../middleware/audit.js';
import { AUDITED_FIELDS } from '../middleware/auditFields.js';
import { logger } from '../utils/logger.js';
import { csvExportRoute, csvImportRoute } from '../utils/csvRoutes.js';
import {
  validate,
  checklistTemplateCreateSchema,
  checklistTemplateUpdateSchema,
  checklistAttachSchema,
  checklistUpdateSchema,
  checklistItemUpdateSchema,
  checklistImportRowSchema,
} from '../utils/validation.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/safety-checklists/templates:
 *   get:
 *     summary: List safety checklist templates
 *     description: >
 *       Returns non-deleted checklist templates with their items ordered by
 *       sequenceNumber, for use in the template picker. Read-only and available to any
 *       authenticated role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of checklist templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   checklistTemplateId: { type: string }
 *                   name: { type: string }
 *                   description: { type: string }
 *                   isMandatory: { type: boolean }
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         woChecklistItemTemplateId: { type: string }
 *                         sequenceNumber: { type: integer }
 *                         description: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.safetyChecklistTemplate.findMany({
      where: { isDeleted: false },
      include: { items: { where: { isDeleted: false }, orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    res.json(templates);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching checklist templates');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/templates:
 *   post:
 *     summary: Create a safety checklist template
 *     description: >
 *       Creates a template and its items in one transaction. Validated by the zod schema
 *       `checklistTemplateCreateSchema` (see utils/validation.ts), which requires at least
 *       one item and rejects items without a positive sequenceNumber or a description.
 *       Requires the Maintenance Planner role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `checklistTemplateCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, items]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               isMandatory: { type: boolean }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [sequenceNumber, description]
 *                   properties:
 *                     sequenceNumber: { type: integer, minimum: 1 }
 *                     description: { type: string }
 *     responses:
 *       '201':
 *         description: Template created with its items
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '500':
 *         description: Internal server error
 */
router.post('/templates', authorizeMinRole('Maintenance Planner'), validate(checklistTemplateCreateSchema), async (req: Request, res: Response) => {
  try {
    const { name, description, isMandatory, items } = req.body;

    const template = await prisma.safetyChecklistTemplate.create({
      data: {
        name,
        description,
        isMandatory: isMandatory || false,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
        items: {
          create: items.map((item: { description: string; sequenceNumber: number }) => ({
            sequenceNumber: item.sequenceNumber,
            description: item.description,
          })),
        },
      },
      include: { items: { orderBy: { sequenceNumber: 'asc' } } },
    });

    await logAuditAction({ table: 'SafetyChecklistTemplate', recordId: template.checklistTemplateId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(template);
  } catch (error) {
    logger.error({ err: error }, 'Error creating checklist template');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/templates/{id}:
 *   put:
 *     summary: Update a safety checklist template
 *     description: >
 *       Updates a template's name, description and mandatory flag, and optionally
 *       replaces its item set. When `items` is sent, each entry either names the
 *       row it replaces (`itemId`) or is created new; live items omitted from the
 *       list are soft-deleted, and the update is refused with 409 when an omitted
 *       item is already attached to a work order. Validated by the zod schema
 *       `checklistTemplateUpdateSchema`. Requires the Maintenance Planner role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: SafetyChecklistTemplate checklistTemplateId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `checklistTemplateUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               isMandatory: { type: boolean }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [sequenceNumber, description]
 *                   properties:
 *                     itemId: { type: string }
 *                     sequenceNumber: { type: integer, minimum: 1 }
 *                     description: { type: string }
 *     responses:
 *       '200':
 *         description: Template updated, with its items
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, or an item does not belong to this template
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Maintenance Planner
 *       '404':
 *         description: Checklist template not found
 *       '409':
 *         description: An item to be removed is already attached to a work order
 *       '500':
 *         description: Internal server error
 */
router.put('/templates/:id', authorizeMinRole('Maintenance Planner'), validate(checklistTemplateUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, isMandatory, items } = req.body;

    const existing = await prisma.safetyChecklistTemplate.findFirst({
      where: { checklistTemplateId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Checklist template not found' });
    }

    if (items !== undefined) {
      const liveItems = await prisma.checklistItem.findMany({
        where: { checklistTemplateId: id, isDeleted: false },
        select: { itemId: true },
      });
      const liveIds = new Set(liveItems.map((i) => i.itemId));
      const providedIds = items
        .filter((item: { itemId?: string }) => item.itemId)
        .map((item: { itemId: string }) => item.itemId);
      if (providedIds.some((itemId: string) => !liveIds.has(itemId))) {
        return res.status(400).json({ error: 'Checklist item does not belong to this template' });
      }
      const keep = new Set(providedIds);
      const removed = liveItems.filter((i) => !keep.has(i.itemId)).map((i) => i.itemId);
      if (removed.length > 0) {
        // An item already instantiated on a work order is evidence, not a draft
        // line. Soft-deleting it would silently drop the question - and any
        // answer to it - from that work order's checklist view, so the route
        // refuses rather than losing it.
        const attached = await prisma.workOrderChecklistItem.count({
          where: { itemId: { in: removed }, isDeleted: false },
        });
        if (attached > 0) {
          return res.status(409).json({
            error: 'Checklist items already attached to a work order cannot be removed',
          });
        }
      }
    }

    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.safetyChecklistTemplate.update({
        where: { checklistTemplateId: id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(isMandatory !== undefined && { isMandatory }),
          modifiedBy: req.user!.userId,
        },
      });
      if (items !== undefined) {
        const keepIds = items
          .filter((item: { itemId?: string }) => item.itemId)
          .map((item: { itemId: string }) => item.itemId);
        await tx.checklistItem.updateMany({
          where: { checklistTemplateId: id, isDeleted: false, itemId: { notIn: keepIds } },
          data: { isDeleted: true, modifiedBy: req.user!.userId },
        });
        for (const item of items as { itemId?: string; sequenceNumber: number; description: string }[]) {
          if (item.itemId) {
            await tx.checklistItem.update({
              where: { itemId: item.itemId },
              data: {
                sequenceNumber: item.sequenceNumber,
                description: item.description,
                modifiedBy: req.user!.userId,
              },
            });
          } else {
            await tx.checklistItem.create({
              data: {
                checklistTemplateId: id,
                sequenceNumber: item.sequenceNumber,
                description: item.description,
                createdBy: req.user!.userId,
                modifiedBy: req.user!.userId,
              },
            });
          }
        }
      }
      return updated;
    });

    await logFieldChanges({
      table: 'SafetyChecklistTemplate',
      recordId: id,
      before: existing,
      after: template,
      fields: AUDITED_FIELDS.SafetyChecklistTemplate,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    const withItems = await prisma.safetyChecklistTemplate.findUnique({
      where: { checklistTemplateId: id },
      include: { items: { where: { isDeleted: false }, orderBy: { sequenceNumber: 'asc' } } },
    });
    res.json(withItems);
  } catch (error) {
    logger.error({ err: error }, 'Error updating checklist template');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/templates/{id}:
 *   delete:
 *     summary: Soft delete a safety checklist template
 *     description: >
 *       Marks the template and its item rows isDeleted=true. Refused with 409 while a
 *       live work order checklist still references the template, because the work order
 *       reads filter on the template's isDeleted flag and an in-use template would
 *       silently disappear from those work orders. Requires the Maintenance Supervisor
 *       role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: SafetyChecklistTemplate checklistTemplateId
 *     responses:
 *       '200':
 *         description: Template soft deleted
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
 *         description: Checklist template not found
 *       '409':
 *         description: Template is attached to a work order
 *       '500':
 *         description: Internal server error
 */
router.delete('/templates/:id', authorizeMinRole('Maintenance Supervisor'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.safetyChecklistTemplate.findFirst({
      where: { checklistTemplateId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Checklist template not found' });
    }

    const attached = await prisma.workOrderChecklist.count({
      where: { checklistTemplateId: id, isDeleted: false },
    });
    if (attached > 0) {
      return res.status(409).json({ error: 'Checklist template is attached to a work order and cannot be deleted' });
    }

    await prisma.checklistItem.updateMany({
      where: { checklistTemplateId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });
    await prisma.safetyChecklistTemplate.update({
      where: { checklistTemplateId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'SafetyChecklistTemplate', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Checklist template deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting checklist template');
    res.status(500).json({ error: 'Internal server error' });
  }
});


const CHECKLIST_CSV_COLUMNS = [
  'templateName',
  'templateDescription',
  'isMandatory',
  'sequenceNumber',
  'itemDescription',
] as const;

/**
 * @openapi
 * /api/safety-checklists/export.csv:
 *   get:
 *     summary: Export safety checklist templates as CSV
 *     description: >
 *       One row per checklist item, with the template's name, description and
 *       mandatory flag repeated on each row. A template that has no items yet is
 *       written as a single row with empty `sequenceNumber` and `itemDescription`, so
 *       an export/import round trip does not lose it. No role restriction beyond
 *       authentication.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Checklist templates as text/csv
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get(
  '/export.csv',
  csvExportRoute({
    noun: 'safety checklists',
    filename: 'safety-checklists',
    columns: CHECKLIST_CSV_COLUMNS,
    rows: async () => {
      const templates = await prisma.safetyChecklistTemplate.findMany({
        where: { isDeleted: false },
        orderBy: { name: 'asc' },
        include: {
          items: {
            where: { isDeleted: false },
            orderBy: { sequenceNumber: 'asc' },
          },
        },
      });
      return templates.flatMap((template) => {
        const header = [
          template.name,
          template.description,
          template.isMandatory ? 'true' : 'false',
        ];
        if (template.items.length === 0) return [[...header, '', '']];
        return template.items.map((item) => [...header, item.sequenceNumber, item.description]);
      });
    },
  })
);

/**
 * @openapi
 * /api/safety-checklists/import.csv:
 *   post:
 *     summary: Import safety checklist templates from CSV
 *     description: >
 *       Multipart upload with a single `file` part. Requires the Maintenance Planner role.
 *       Rows are validated by `checklistImportRowSchema`. A template is matched by `name`
 *       and an item by its `sequenceNumber` inside that template, so re-uploading an
 *       edited export updates in place instead of duplicating. Items are never deleted by
 *       an import: removing an item is refused once it has been answered on a work order,
 *       and the file is not the place to make that decision. A blank `templateDescription`
 *       or `isMandatory` leaves the stored value alone; a row with no `sequenceNumber` and
 *       no `itemDescription` creates or updates only the template itself. The import is
 *       all-or-nothing: the first invalid row rolls the whole file back and returns 400.
 *       Add `?dryRun=1` to report the outcome without writing anything.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: boolean }
 *         description: Run the import and roll it back, reporting what it would do
 *     requestBody:
 *       required: true
 *       description: "Multipart form; each CSV row validated by zod `checklistImportRowSchema`"
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
    noun: 'safety checklists',
    columns: CHECKLIST_CSV_COLUMNS,
    schema: checklistImportRowSchema,
    mode: 'strict',
    run: async (ctx, rows) => {
      const outcome = { created: 0, updated: 0, rejected: [] as Array<{ row: number; reason: string }> };
      // Template rows repeat their header on every item. Within one file the
      // template must therefore be resolved once and reused, or the second row
      // for the same template would try to create it again.
      const templateByName = new Map<string, string>();

      for (const row of rows) {
        const d = row.record;

        let templateId = templateByName.get(d.templateName);
        if (!templateId) {
          const existing = await ctx.tx.safetyChecklistTemplate.findFirst({
            where: { name: d.templateName, isDeleted: false },
          });
          if (existing) {
            await ctx.tx.safetyChecklistTemplate.update({
              where: { checklistTemplateId: existing.checklistTemplateId },
              data: {
                description: d.templateDescription || existing.description,
                isMandatory: d.isMandatory ?? existing.isMandatory,
                modifiedBy: ctx.userId,
              },
            });
            await logAuditAction({
              table: 'SafetyChecklistTemplate',
              recordId: existing.checklistTemplateId,
              action: 'Update',
              userId: ctx.userId,
              ipAddress: ctx.ipAddress,
              db: ctx.tx,
            });
            outcome.updated += 1;
            templateId = existing.checklistTemplateId;
          } else {
            const created = await ctx.tx.safetyChecklistTemplate.create({
              data: {
                name: d.templateName,
                description: d.templateDescription || d.templateName,
                isMandatory: d.isMandatory ?? false,
                createdBy: ctx.userId,
                modifiedBy: ctx.userId,
              },
            });
            await logAuditAction({
              table: 'SafetyChecklistTemplate',
              recordId: created.checklistTemplateId,
              action: 'Create',
              userId: ctx.userId,
              ipAddress: ctx.ipAddress,
              db: ctx.tx,
            });
            outcome.created += 1;
            templateId = created.checklistTemplateId;
          }
          templateByName.set(d.templateName, templateId);
        }

        // A template-only row: no item to write.
        if (d.sequenceNumber === undefined) continue;

        const existingItem = await ctx.tx.checklistItem.findFirst({
          where: {
            checklistTemplateId: templateId,
            sequenceNumber: d.sequenceNumber,
            isDeleted: false,
          },
        });
        if (existingItem) {
          await ctx.tx.checklistItem.update({
            where: { itemId: existingItem.itemId },
            data: { description: d.itemDescription as string, modifiedBy: ctx.userId },
          });
          await logAuditAction({
            table: 'ChecklistItem',
            recordId: existingItem.itemId,
            action: 'Update',
            userId: ctx.userId,
            ipAddress: ctx.ipAddress,
            db: ctx.tx,
          });
          outcome.updated += 1;
        } else {
          const created = await ctx.tx.checklistItem.create({
            data: {
              checklistTemplateId: templateId,
              sequenceNumber: d.sequenceNumber,
              description: d.itemDescription as string,
              createdBy: ctx.userId,
              modifiedBy: ctx.userId,
            },
          });
          await logAuditAction({
            table: 'ChecklistItem',
            recordId: created.itemId,
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
 * /api/safety-checklists/work-order/{woId}:
 *   get:
 *     summary: List the checklists attached to a work order
 *     description: >
 *       Returns every checklist instance on the work order with its template, its item
 *       instances and the signing user.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: woId
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrder workOrderId
 *     responses:
 *       '200':
 *         description: Checklist instances on the work order
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   woChecklistId: { type: string }
 *                   workOrderId: { type: string }
 *                   checklistTemplateId: { type: string }
 *                   status: { type: string, enum: [Pending, "In Progress", Completed] }
 *                   signedBy: { type: string, nullable: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/work-order/:woId', async (req: Request, res: Response) => {
  try {
    const woId = req.params.woId as string;
    const checklists = await prisma.workOrderChecklist.findMany({
      where: { workOrderId: woId, isDeleted: false, template: { isDeleted: false } },
      include: {
        template: true,
        items: {
          where: { isDeleted: false, item: { isDeleted: false } },
          include: { item: true },
        },
        signer: { select: { userId: true, fullName: true } },
      },
    });

    res.json(checklists);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching work order checklists');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/work-order/{woId}/attach:
 *   post:
 *     summary: Attach a checklist template to a work order
 *     description: >
 *       Instantiates a template as a Pending checklist on the work order, copying every
 *       template item into an unanswered item instance. Validated by the zod schema
 *       `checklistAttachSchema` (see utils/validation.ts). Requires the Technician role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: woId
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrder workOrderId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `checklistAttachSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [checklistTemplateId]
 *             properties:
 *               checklistTemplateId: { type: string }
 *     responses:
 *       '201':
 *         description: Checklist instance created on the work order
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Work order or checklist template not found
 *       '500':
 *         description: Internal server error
 */
router.post('/work-order/:woId/attach', authorizeMinRole('Technician'), validate(checklistAttachSchema), async (req: Request, res: Response) => {
  try {
    const woId = req.params.woId as string;
    const { checklistTemplateId } = req.body;

    const template = await prisma.safetyChecklistTemplate.findFirst({
      where: { checklistTemplateId, isDeleted: false },
      include: { items: { where: { isDeleted: false } } },
    });
    if (!template) {
      return res.status(404).json({ error: 'Checklist template not found' });
    }

    const checklist = await prisma.workOrderChecklist.create({
      data: {
        workOrderId: woId,
        checklistTemplateId,
        status: 'Pending',
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
        items: {
          // No pre-fill. An item starts unanswered (null) so that SOW 3.3.7 can
          // tell a mandatory checklist nobody has answered from one a
          // technician worked through. See utils/checklistRules.ts.
          create: template.items.map((item) => ({
            itemId: item.itemId,
            response: null,
          })),
        },
      },
      include: {
        template: true,
        items: {
          where: { isDeleted: false, item: { isDeleted: false } },
          include: { item: true },
        },
      },
    });

    await logAuditAction({ table: 'WorkOrderChecklist', recordId: checklist.woChecklistId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Error attaching checklist to work order');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/work-order-checklist/{id}:
 *   put:
 *     summary: Update the status of a work order checklist
 *     description: >
 *       Sets the checklist status and optionally records the signing user. Validated by the
 *       zod schema `checklistUpdateSchema` (see utils/validation.ts), which requires a
 *       status. Requires the Technician role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderChecklist woChecklistId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `checklistUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [Pending, "In Progress", Completed] }
 *               signedBy: { type: string }
 *     responses:
 *       '200':
 *         description: Checklist updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Work order checklist not found
 *       '500':
 *         description: Internal server error
 */
router.put('/work-order-checklist/:id', authorizeMinRole('Technician'), validate(checklistUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status, signedBy } = req.body;

    const existing = await prisma.workOrderChecklist.findFirst({
      where: { woChecklistId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order checklist not found' });
    }

    const updateData: Prisma.WorkOrderChecklistUncheckedUpdateInput = {
      status,
      modifiedBy: req.user!.userId,
    };

    if (status === 'Completed') {
      updateData.signedBy = signedBy || req.user!.userId;
      updateData.signedDate = new Date();
    }

    const checklist = await prisma.workOrderChecklist.update({
      where: { woChecklistId: id },
      data: updateData,
      include: {
        template: true,
        items: {
          where: { isDeleted: false, item: { isDeleted: false } },
          include: { item: true },
        },
        signer: { select: { userId: true, fullName: true } },
      },
    });

    await logFieldChanges({
      table: 'WorkOrderChecklist',
      recordId: id,
      before: existing,
      after: checklist,
      fields: AUDITED_FIELDS.WorkOrderChecklist,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(checklist);
  } catch (error) {
    logger.error({ err: error }, 'Error updating work order checklist');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/safety-checklists/work-order-checklist-item/{id}:
 *   put:
 *     summary: Record the response to a checklist item
 *     description: >
 *       Sets an individual item's response and optional comment. Validated by the zod
 *       schema `checklistItemUpdateSchema` (see utils/validation.ts), which accepts
 *       Yes, No or NA. Requires the Technician role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderChecklistItem woChecklistItemId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `checklistItemUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               response: { type: string, enum: [Yes, No, NA] }
 *               comment: { type: string, nullable: true }
 *     responses:
 *       '200':
 *         description: Checklist item updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Checklist item not found
 *       '500':
 *         description: Internal server error
 */
router.put('/work-order-checklist-item/:id', authorizeMinRole('Technician'), validate(checklistItemUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { response, comment } = req.body;

    const existing = await prisma.workOrderChecklistItem.findFirst({
      where: { woChecklistItemId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    const item = await prisma.workOrderChecklistItem.update({
      where: { woChecklistItemId: id },
      data: {
        ...(response !== undefined && { response }),
        ...(comment !== undefined && { comment: comment || null }),
      },
    });

    // Clearing an answer has to re-arm the gate. Without this a checklist stays
    // 'Completed' after one of its items is put back to unanswered, so a
    // mistaken answer could never be corrected and the work order would stay
    // unblocked for the rest of its life.
    //
    // This fires only when *this* update removed an answer. Answering a blank
    // item is not a reason to downgrade: a planner may legitimately sign a
    // checklist off and then fill in the answers, and downgrading on every
    // partial answer would silently undo that sign-off. Nor is the status ever
    // promoted here - sign-off is a deliberate act with its own endpoint.
    const removedAnswer =
      existing.response !== null && existing.response.trim() !== '' &&
      (item.response === null || item.response.trim() === '');
    if (removedAnswer) {
      const checklist = await prisma.workOrderChecklist.findFirst({
        where: { woChecklistId: item.woChecklistId, isDeleted: false },
        select: { status: true },
      });
      if (checklist?.status === 'Completed') {
        await prisma.workOrderChecklist.update({
          where: { woChecklistId: item.woChecklistId },
          data: { status: 'In Progress' },
        });
        // The downgrade is a real status change, so record it as one rather
        // than an action row with no values.
        await logAuditFieldChange({
          table: 'WorkOrderChecklist',
          recordId: item.woChecklistId,
          action: 'Update',
          field: 'status',
          oldValue: 'Completed',
          newValue: 'In Progress',
          userId: req.user!.userId,
          ipAddress: req.ip,
        });
      }
    }

    await logFieldChanges({
      table: 'WorkOrderChecklistItem',
      recordId: id,
      before: existing,
      after: item,
      fields: AUDITED_FIELDS.WorkOrderChecklistItem,
      userId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json(item);
  } catch (error) {
    logger.error({ err: error }, 'Error updating checklist item');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: soft delete — the checklist instance and its item instances are retained
// (isDeleted=true) and drop out of all live reads; the work order remains the user-visible
// delete boundary, but the evidence trail survives the checklist removal.

/**
 * @openapi
 * /api/safety-checklists/work-order-checklist/{id}:
 *   delete:
 *     summary: Delete a work order checklist
 *     description: >
 *       Soft delete - marks the checklist instance and its item instances isDeleted=true so
 *       they are filtered out of later reads but the rows are retained. Requires the
 *       Technician role.
 *     tags: [Safety Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: WorkOrderChecklist woChecklistId
 *     responses:
 *       '200':
 *         description: Checklist deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Technician
 *       '404':
 *         description: Work order checklist not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/work-order-checklist/:id', authorizeMinRole('Technician'), auditMiddleware('WorkOrderChecklist'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderChecklist.findFirst({
      where: { woChecklistId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order checklist not found' });
    }

    await prisma.workOrderChecklistItem.updateMany({
      where: { woChecklistId: id },
      data: { isDeleted: true },
    });

    await prisma.workOrderChecklist.update({
      where: { woChecklistId: id },
      data: { isDeleted: true, modifiedBy: req.user!.userId },
    });

    res.json({ message: 'Work order checklist deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order checklist');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;