import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/kpis', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const activeStatuses = ['Draft', 'Planned', 'Scheduled', 'In Progress', 'Suspended'];

    const [activeWorkOrders, overdueWorkOrders, scheduledToday, totalWorkOrders, completedOrClosed, openNotifications] = await Promise.all([
      prisma.workOrder.count({
        where: { isDeleted: false, status: { in: activeStatuses } },
      }),
      prisma.workOrder.count({
        where: {
          isDeleted: false,
          status: { notIn: ['Completed', 'Closed', 'Cancelled'] },
          plannedFinish: { lt: now },
        },
      }),
      prisma.workOrder.count({
        where: {
          isDeleted: false,
          status: 'Scheduled',
          plannedStart: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.workOrder.count({ where: { isDeleted: false } }),
      prisma.workOrder.count({
        where: { isDeleted: false, status: { in: ['Completed', 'Closed'] } },
      }),
      prisma.notification.count({
        where: { isDeleted: false, status: { in: ['Open', 'In Process'] } },
      }),
    ]);

    const completionRate = totalWorkOrders > 0
      ? Math.round((completedOrClosed / totalWorkOrders) * 10000) / 100
      : 0;

    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const pmStart = new Date(nowYear, nowMonth - 1, 1);
    const pmEnd = new Date(nowYear, nowMonth, 0, 23, 59, 59);

    const [totalPM, completedPM] = await Promise.all([
      prisma.workOrder.count({
        where: {
          isDeleted: false, type: 'PM',
          createdDate: { gte: pmStart, lte: pmEnd },
        },
      }),
      prisma.workOrder.count({
        where: {
          isDeleted: false, type: 'PM',
          status: { in: ['Completed', 'Closed'] },
          createdDate: { gte: pmStart, lte: pmEnd },
        },
      }),
    ]);

    const pmCompliance = totalPM > 0
      ? Math.round((completedPM / totalPM) * 10000) / 100
      : 0;

    res.json({
      activeWorkOrders,
      overdueWorkOrders,
      scheduledToday,
      completionRate,
      openNotifications,
      pmCompliance,
    });
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await prisma.systemAlert.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdDate: 'desc' },
      take: 20,
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching dashboard alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/cost-summary', async (_req: Request, res: Response) => {
  try {
    const workOrders = await prisma.workOrder.findMany({
      where: { isDeleted: false },
      select: {
        plannedCost: true,
        actualCost: true,
        createdDate: true,
      },
    });

    const monthlyMap = new Map<string, { planned: number; actual: number }>();

    for (const wo of workOrders) {
      const date = new Date(wo.createdDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { planned: 0, actual: 0 });
      }
      const entry = monthlyMap.get(key)!;
      entry.planned += wo.plannedCost;
      entry.actual += wo.actualCost;
    }

    const result = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        plannedCost: Math.round(data.planned * 100) / 100,
        actualCost: Math.round(data.actual * 100) / 100,
      }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching dashboard cost summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
