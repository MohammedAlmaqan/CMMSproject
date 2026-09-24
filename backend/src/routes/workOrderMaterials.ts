import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, woMaterialCreateSchema, woMaterialUpdateSchema } from '../utils/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId } = req.query;
    if (!workOrderId) {
      return res.status(400).json({ error: 'workOrderId query parameter is required' });
    }

    const materials = await prisma.workOrderMaterial.findMany({
      where: { workOrderId: workOrderId as string },
      include: { material: true },
    });

    res.json(materials);
  } catch (error) {
    console.error('Error fetching work order materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(woMaterialCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, materialId, plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    const materialExists = await prisma.material.findUnique({ where: { materialId } });
    if (!materialExists) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const material = await prisma.workOrderMaterial.create({
      data: {
        workOrderId,
        materialId,
        plannedQuantity,
        actualQuantity: actualQuantity || 0,
        unitCost: unitCost || 0,
        reservationQuantity: reservationQuantity || 0,
      },
    });

    await recomputeWorkOrderCosts(workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: material.woMaterialId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeMinRole('Technician'), validate(woMaterialUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderMaterial.findUnique({
      where: { woMaterialId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    const { plannedQuantity, actualQuantity, unitCost, reservationQuantity } = req.body;

    const material = await prisma.workOrderMaterial.update({
      where: { woMaterialId: id },
      data: {
        ...(plannedQuantity !== undefined && { plannedQuantity }),
        ...(actualQuantity !== undefined && { actualQuantity }),
        ...(unitCost !== undefined && { unitCost }),
        ...(reservationQuantity !== undefined && { reservationQuantity }),
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(material);
  } catch (error) {
    console.error('Error updating work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: WorkOrderMaterial rows are composition children of a WorkOrder and carry no isDeleted
// column — hard delete is deliberate (transactional WO line item; the WO is the soft-delete
// boundary). Cost recompute runs after removal so planned/actual costs reflect the live set.
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.workOrderMaterial.findUnique({
      where: { woMaterialId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Work order material not found' });
    }

    await prisma.workOrderMaterial.delete({
      where: { woMaterialId: id },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'WorkOrderMaterial', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Work order material deleted successfully' });
  } catch (error) {
    console.error('Error deleting work order material:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;