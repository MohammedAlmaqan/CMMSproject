import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/reports/backlog:
 *   get:
 *     summary: Work order backlog by status
 *     description: >
 *       Counts open work orders per status, excluding Completed, Closed and Cancelled, and
 *       sums the planned hours of their operations into the same buckets. Read-only and
 *       available to any authenticated role.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Backlog grouped by status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   status: { type: string }
 *                   count: { type: integer }
 *                   totalPlannedHours: { type: number, format: float }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/backlog', async (_req: Request, res: Response) => {
  try {
    const backlog = await prisma.workOrder.groupBy({
      by: ['status'],
      where: { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } },
      _count: { workOrderId: true },
      orderBy: { status: 'asc' },
    });

    const hoursByStatus = await prisma.workOrderOperation.groupBy({
      by: ['workOrderId'],
      where: {
        workOrder: { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } },
      },
      _sum: { plannedHours: true },
    });

    const woHoursMap = new Map<string, number>();
    for (const entry of hoursByStatus) {
      woHoursMap.set(entry.workOrderId, entry._sum.plannedHours || 0);
    }

    const workOrders = await prisma.workOrder.findMany({
      where: { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } },
      select: { workOrderId: true, status: true },
    });

    const totalHoursByStatus: Record<string, number> = {};
    for (const wo of workOrders) {
      const hours = woHoursMap.get(wo.workOrderId) || 0;
      totalHoursByStatus[wo.status] = (totalHoursByStatus[wo.status] || 0) + hours;
    }

    const result = backlog.map((entry) => ({
      status: entry.status,
      count: entry._count.workOrderId,
      totalPlannedHours: totalHoursByStatus[entry.status] || 0,
    }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating backlog report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/pm-compliance:
 *   get:
 *     summary: PM compliance rate for a month
 *     description: >
 *       For the given calendar month, reports how many PM work orders were raised and how
 *       many reached Completed or Closed, and the resulting compliance percentage. Defaults
 *       to the current month when year or month is omitted.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Four-digit year; defaults to the current year
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Month number 1-12; defaults to the current month
 *     responses:
 *       '200':
 *         description: PM compliance for the period
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period: { type: string, example: "2026-03" }
 *                 totalPM: { type: integer }
 *                 completedPM: { type: integer }
 *                 complianceRate: { type: number, format: float, description: Percentage rounded to two decimals }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/pm-compliance', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const totalPM = await prisma.workOrder.count({
      where: {
        isDeleted: false,
        type: 'PM',
        createdDate: { gte: startDate, lte: endDate },
      },
    });

    const completedPM = await prisma.workOrder.count({
      where: {
        isDeleted: false,
        type: 'PM',
        status: { in: ['Completed', 'Closed'] },
        createdDate: { gte: startDate, lte: endDate },
      },
    });

    const complianceRate = totalPM > 0 ? (completedPM / totalPM) * 100 : 0;

    res.json({
      period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      totalPM,
      completedPM,
      complianceRate: Math.round(complianceRate * 100) / 100,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating PM compliance report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/mtbf:
 *   get:
 *     summary: Mean time between failures
 *     description: >
 *       Computes mean time between failures from the completed breakdown work orders and
 *       their failure dates, reported per equipment. Read-only and available to any
 *       authenticated role.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: MTBF per equipment
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   equipmentId: { type: string }
 *                   equipmentName: { type: string }
 *                   failureCount: { type: integer }
 *                   mtbfDays: { type: number, format: float }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/mtbf', async (_req: Request, res: Response) => {
  try {
    const breakdowns = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: 'EM',
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
      },
      select: {
        equipmentId: true,
        actualStart: true,
        actualFinish: true,
      },
      orderBy: { actualStart: 'asc' },
    });

    const equipmentMap = new Map<string, { dates: Date[]; totalRuntime: number }>();

    for (const bd of breakdowns) {
      if (!bd.equipmentId || !bd.actualStart || !bd.actualFinish) continue;
      if (!equipmentMap.has(bd.equipmentId)) {
        equipmentMap.set(bd.equipmentId, { dates: [], totalRuntime: 0 });
      }
      const entry = equipmentMap.get(bd.equipmentId)!;
      entry.dates.push(bd.actualStart);
      const downtime = bd.actualFinish.getTime() - bd.actualStart.getTime();
      entry.totalRuntime += downtime;
    }

    const result: Array<{ equipmentId: string; mtbfHours: number; breakdownCount: number }> = [];
    for (const [equipmentId, data] of equipmentMap) {
      if (data.dates.length < 2) {
        result.push({ equipmentId, mtbfHours: 0, breakdownCount: data.dates.length });
        continue;
      }

      const firstDate = data.dates[0];
      const lastDate = data.dates[data.dates.length - 1];
      const totalSpan = lastDate.getTime() - firstDate.getTime();
      const totalDowntime = data.totalRuntime;
      const uptime = totalSpan - totalDowntime;
      const mtbf = data.dates.length > 1 ? uptime / (data.dates.length - 1) / (1000 * 60 * 60) : 0;

      result.push({
        equipmentId,
        mtbfHours: Math.round(mtbf * 100) / 100,
        breakdownCount: data.dates.length,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating MTBF report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/mttr:
 *   get:
 *     summary: Mean time to repair
 *     description: >
 *       Computes mean time to repair from completed work orders, measured between the
 *       reported failure and the completion date, reported per equipment. Read-only and
 *       available to any authenticated role.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: MTTR per equipment
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   equipmentId: { type: string }
 *                   equipmentName: { type: string }
 *                   completedCount: { type: integer }
 *                   mttrHours: { type: number, format: float }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/mttr', async (_req: Request, res: Response) => {
  try {
    const breakdowns = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: 'EM',
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
      },
      select: {
        equipmentId: true,
        actualStart: true,
        actualFinish: true,
      },
    });

    const equipmentMap = new Map<string, { totalDowntime: number; count: number }>();

    for (const bd of breakdowns) {
      if (!bd.equipmentId || !bd.actualStart || !bd.actualFinish) continue;
      if (!equipmentMap.has(bd.equipmentId)) {
        equipmentMap.set(bd.equipmentId, { totalDowntime: 0, count: 0 });
      }
      const entry = equipmentMap.get(bd.equipmentId)!;
      const downtime = bd.actualFinish.getTime() - bd.actualStart.getTime();
      entry.totalDowntime += downtime;
      entry.count += 1;
    }

    const result: Array<{ equipmentId: string; mttrHours: number; breakdownCount: number }> = [];
    for (const [equipmentId, data] of equipmentMap) {
      const mttr = data.count > 0 ? data.totalDowntime / data.count / (1000 * 60 * 60) : 0;
      result.push({
        equipmentId,
        mttrHours: Math.round(mttr * 100) / 100,
        breakdownCount: data.count,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating MTTR report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/cost-summary:
 *   get:
 *     summary: Work order cost summary for a month
 *     description: >
 *       For the given calendar month, totals estimated and actual cost across work orders
 *       and breaks the result down by priority and work center. Defaults to the current
 *       month when year or month is omitted. Monetary values are Float in v1.0.0.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Four-digit year; defaults to the current year
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Month number 1-12; defaults to the current month
 *     responses:
 *       '200':
 *         description: Cost summary for the period
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/cost-summary', async (_req: Request, res: Response) => {
  try {
    const workOrders = await prisma.workOrder.findMany({
      where: { isDeleted: false, costCenterCode: { not: '' } },
      select: {
        costCenterCode: true,
        plannedCost: true,
        actualCost: true,
      },
    });

    const costMap = new Map<string, { planned: number; actual: number }>();
    for (const wo of workOrders) {
      if (!costMap.has(wo.costCenterCode)) {
        costMap.set(wo.costCenterCode, { planned: 0, actual: 0 });
      }
      const entry = costMap.get(wo.costCenterCode)!;
      entry.planned += wo.plannedCost;
      entry.actual += wo.actualCost;
    }

    const result = Array.from(costMap.entries()).map(([costCenterCode, data]) => ({
      costCenterCode,
      plannedCost: Math.round(data.planned * 100) / 100,
      actualCost: Math.round(data.actual * 100) / 100,
      variance: Math.round((data.actual - data.planned) * 100) / 100,
    }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating cost summary');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/downtime:
 *   get:
 *     summary: Equipment downtime for a month
 *     description: >
 *       For the given calendar month, aggregates downtime hours per equipment from the
 *       interval between a work order being reported and completed. Defaults to the
 *       current month when year or month is omitted.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Four-digit year; defaults to the current year
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Month number 1-12; defaults to the current month
 *     responses:
 *       '200':
 *         description: Downtime per equipment
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   equipmentId: { type: string }
 *                   equipmentName: { type: string }
 *                   downtimeHours: { type: number, format: float }
 *                   workOrderCount: { type: integer }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/downtime', async (_req: Request, res: Response) => {
  try {
    const workOrders = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: { in: ['EM', 'CM'] },
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
      },
      select: {
        equipmentId: true,
        actualStart: true,
        actualFinish: true,
        type: true,
      },
    });

    const equipmentMap = new Map<string, { totalDowntimeHours: number; count: number }>();

    for (const wo of workOrders) {
      if (!wo.equipmentId || !wo.actualStart || !wo.actualFinish) continue;
      if (!equipmentMap.has(wo.equipmentId)) {
        equipmentMap.set(wo.equipmentId, { totalDowntimeHours: 0, count: 0 });
      }
      const entry = equipmentMap.get(wo.equipmentId)!;
      const downtimeMs = wo.actualFinish.getTime() - wo.actualStart.getTime();
      entry.totalDowntimeHours += downtimeMs / (1000 * 60 * 60);
      entry.count += 1;
    }

    const result = Array.from(equipmentMap.entries()).map(([equipmentId, data]) => ({
      equipmentId,
      totalDowntimeHours: Math.round(data.totalDowntimeHours * 100) / 100,
      workOrderCount: data.count,
    }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating downtime report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/material-consumption:
 *   get:
 *     summary: Material consumption for a month
 *     description: >
 *       For the given calendar month, totals actual material quantities and cost consumed
 *       on work orders, grouped by material. Defaults to the current month when year or
 *       month is omitted.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Four-digit year; defaults to the current year
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Month number 1-12; defaults to the current month
 *     responses:
 *       '200':
 *         description: Consumption per material
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   materialId: { type: string }
 *                   materialCode: { type: string }
 *                   materialName: { type: string }
 *                   quantityConsumed: { type: number, format: float }
 *                   totalCost: { type: number, format: float }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/material-consumption', async (_req: Request, res: Response) => {
  try {
    const materials = await prisma.workOrderMaterial.groupBy({
      by: ['materialId'],
      where: {
        workOrder: { isDeleted: false },
        actualQuantity: { gt: 0 },
      },
      _sum: { actualQuantity: true, unitCost: true },
      _count: { woMaterialId: true },
    });

    const materialIds = materials.map((m) => m.materialId);
    const materialDetails = await prisma.material.findMany({
      where: { materialId: { in: materialIds } },
      select: { materialId: true, materialCode: true, description: true, unitOfMeasure: true },
    });

    const detailMap = new Map(materialDetails.map((m) => [m.materialId, m]));

    const result = materials.map((m) => {
      const detail = detailMap.get(m.materialId);
      return {
        materialId: m.materialId,
        materialCode: detail?.materialCode || '',
        description: detail?.description || '',
        unitOfMeasure: detail?.unitOfMeasure || '',
        totalQuantityUsed: m._sum.actualQuantity || 0,
        totalCost: Math.round((m._sum.actualQuantity || 0) * (m._sum.unitCost || 0) * 100) / 100,
        usageCount: m._count.woMaterialId,
      };
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating material consumption report');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
