import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorizeMinRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const alerts = await prisma.systemAlert.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdDate: 'desc' },
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await prisma.systemAlert.count({
      where: { userId: req.user!.userId, isRead: false },
    });

    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread alert count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/read-all', authorizeMinRole('Requester'), async (req: Request, res: Response) => {
  try {
    await prisma.systemAlert.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });

    await logAudit(
      { tableName: 'SystemAlert', recordId: req.user!.userId, action: 'Update', fieldName: 'read-all' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/read', authorizeMinRole('Requester'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.systemAlert.findFirst({
      where: { alertId: id, userId: req.user!.userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = await prisma.systemAlert.update({
      where: { alertId: id },
      data: { isRead: true },
    });

    await logAudit(
      { tableName: 'SystemAlert', recordId: id, action: 'Update', fieldName: 'read' },
      req.user!.userId,
      req.ip
    );

    res.json(alert);
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
