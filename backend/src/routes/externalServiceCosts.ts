import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { recomputeWorkOrderCosts } from '../utils/costs.js';
import { validate, externalServiceCreateSchema, externalServiceUpdateSchema } from '../utils/validation.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { workOrderId } = req.query;
    if (!workOrderId) {
      return res.status(400).json({ error: 'workOrderId query parameter is required' });
    }

    const services = await prisma.externalServiceCost.findMany({
      where: { workOrderId: workOrderId as string },
    });

    res.json(services);
  } catch (error) {
    console.error('Error fetching external services:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorizeMinRole('Technician'), validate(externalServiceCreateSchema), async (req: Request, res: Response) => {
  try {
    const { workOrderId, vendor, description, cost, invoiceRef } = req.body;

    const service = await prisma.externalServiceCost.create({
      data: {
        workOrderId,
        vendor,
        description,
        cost,
        invoiceRef: invoiceRef || '',
      },
    });

    await recomputeWorkOrderCosts(workOrderId);

    await logAudit(
      { tableName: 'ExternalServiceCost', recordId: service.serviceCostId, action: 'Create' },
      req.user!.userId,
      req.ip
    );

    res.status(201).json(service);
  } catch (error) {
    console.error('Error creating external service:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeMinRole('Technician'), validate(externalServiceUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.externalServiceCost.findUnique({
      where: { serviceCostId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'External service not found' });
    }

    const { vendor, description, cost, invoiceRef } = req.body;

    const service = await prisma.externalServiceCost.update({
      where: { serviceCostId: id },
      data: {
        ...(vendor !== undefined && { vendor }),
        ...(description !== undefined && { description }),
        ...(cost !== undefined && { cost }),
        ...(invoiceRef !== undefined && { invoiceRef }),
      },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'ExternalServiceCost', recordId: id, action: 'Update' },
      req.user!.userId,
      req.ip
    );

    res.json(service);
  } catch (error) {
    console.error('Error updating external service:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3.4: ExternalServiceCost carries no isDeleted column — hard delete is deliberate
// (transactional WO line item; the WO is the soft-delete boundary).
router.delete('/:id', authorizeMinRole('Technician'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.externalServiceCost.findUnique({
      where: { serviceCostId: id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'External service not found' });
    }

    await prisma.externalServiceCost.delete({
      where: { serviceCostId: id },
    });

    await recomputeWorkOrderCosts(existing.workOrderId);

    await logAudit(
      { tableName: 'ExternalServiceCost', recordId: id, action: 'Delete' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'External service deleted successfully' });
  } catch (error) {
    console.error('Error deleting external service:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;