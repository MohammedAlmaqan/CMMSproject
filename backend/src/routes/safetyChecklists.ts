import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';
import {
  validate,
  checklistTemplateCreateSchema,
  checklistAttachSchema,
  checklistUpdateSchema,
  checklistItemUpdateSchema,
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
      include: { items: { orderBy: { sequenceNumber: 'asc' } } },
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

    await logAudit(
      { tableName: 'SafetyChecklistTemplate', recordId: template.checklistTemplateId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(template);
  } catch (error) {
    logger.error({ err: error }, 'Error creating checklist template');
    res.status(500).json({ error: 'Internal server error' });
  }
});


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
      where: { workOrderId: woId },
      include: {
        template: true,
        items: { include: { item: true } },
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
      include: { items: true },
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
          create: template.items.map((item) => ({
            itemId: item.itemId,
            response: 'NA',
          })),
        },
      },
      include: {
        template: true,
        items: { include: { item: true } },
      },
    });

    await logAudit(
      { tableName: 'WorkOrderChecklist', recordId: checklist.woChecklistId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

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

    const existing = await prisma.workOrderChecklist.findUnique({
      where: { woChecklistId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order checklist not found' });
    }

    const updateData: any = {
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
        items: { include: { item: true } },
        signer: { select: { userId: true, fullName: true } },
      },
    });

    await logAudit(
      { tableName: 'WorkOrderChecklist', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

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

    const existing = await prisma.workOrderChecklistItem.findUnique({
      where: { woChecklistItemId: id },
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

    await logAudit(
      { tableName: 'WorkOrderChecklistItem', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(item);
  } catch (error) {
    logger.error({ err: error }, 'Error updating checklist item');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: WorkOrderChecklist/WorkOrderChecklistItem carry no isDeleted column — hard delete is
// deliberate (composition children of a WorkOrder; the WO is the soft-delete boundary).

/**
 * @openapi
 * /api/safety-checklists/work-order-checklist/{id}:
 *   delete:
 *     summary: Delete a work order checklist
 *     description: >
 *       Hard delete - the checklist instance and its item instances carry no isDeleted
 *       column, per rule 3.4 the parent work order is the soft-delete boundary. Requires
 *       the Technician role.
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
router.delete('/work-order-checklist/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderChecklist.findUnique({
      where: { woChecklistId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order checklist not found' });
    }

    await prisma.workOrderChecklistItem.deleteMany({
      where: { woChecklistId: id },
    });

    await prisma.workOrderChecklist.delete({
      where: { woChecklistId: id },
    });

    await logAudit(
      { tableName: 'WorkOrderChecklist', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Work order checklist deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting work order checklist');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;