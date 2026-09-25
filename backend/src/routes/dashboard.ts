import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/dashboard/kpis:
 *   get:
 *     summary: Dashboard KPI counters
 *     description: >
 *       Aggregated counts for the dashboard tiles. Active means Draft, Planned, Scheduled,
 *       In Progress or Suspended. Overdue means plannedFinish is in the past and the status
 *       is not Completed, Closed or Cancelled. completionRate and pmCompliance are
 *       percentages rounded to two decimals; pmCompliance covers PM work orders created in
 *       the current calendar month. Soft-deleted rows are excluded throughout.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: KPI counters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeWorkOrders: { type: integer }
 *                 overdueWorkOrders: { type: integer }
 *                 scheduledToday: { type: integer }
 *                 completionRate: { type: number, description: "Percent, 2dp" }
 *                 openNotifications: { type: integer }
 *                 pmCompliance: { type: number, description: "Percent of current-month PM work orders Completed or Closed, 2dp" }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/dashboard/alerts:
 *   get:
 *     summary: Alerts addressed to the current user
 *     description: >
 *       Returns up to 20 SystemAlert rows for the authenticated user only, newest first.
 *       Alerts are raised by the work order assignment/overdue rules, the PM scheduler and
 *       account lockout.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Recent alerts for the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   alertId: { type: string }
 *                   alertType: { type: string, description: "WO_Assigned, WO_Overdue, PM_Generation, High_Priority_Notification, Account_Lockout" }
 *                   userId: { type: string }
 *                   title: { type: string }
 *                   message: { type: string }
 *                   isRead: { type: boolean }
 *                   createdDate: { type: string, format: date-time }
 *                   relatedEntityType: { type: string, nullable: true }
 *                   relatedEntityId: { type: string, nullable: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/dashboard/cost-summary:
 *   get:
 *     summary: Monthly planned vs actual cost trend
 *     description: >
 *       Buckets every non-deleted work order by the calendar month of its createdDate and
 *       sums plannedCost and actualCost. Months are returned in ascending order as
 *       "YYYY-MM". Values are rounded to two decimals; the underlying columns are
 *       Float-typed in v1.0.0, so small rounding drift is expected.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Monthly cost trend
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   month: { type: string, example: "2026-09" }
 *                   plannedCost: { type: number }
 *                   actualCost: { type: number }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
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
    logger.error({ err: error }, 'Error fetching dashboard KPIs');
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
    logger.error({ err: error }, 'Error fetching dashboard alerts');
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
    logger.error({ err: error }, 'Error fetching dashboard cost summary');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
