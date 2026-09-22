import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import {
  validate,
  checklistTemplateCreateSchema,
  checklistAttachSchema,
  checklistUpdateSchema,
  checklistItemUpdateSchema,
} from '../utils/validation.js';

const router = Router();

router.use(authenticate);

router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.safetyChecklistTemplate.findMany({
      where: { isDeleted: false },
      include: { items: { orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching checklist templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error creating checklist template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error fetching work order checklists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error attaching checklist to work order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error updating work order checklist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error updating checklist item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error deleting work order checklist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;