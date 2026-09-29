import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  buildDateWhere,
  buildScopeWhere,
  descendantLocationIds,
  parseReportFilter,
} from '../utils/reportFilters.js';
import type { ReportFilter } from '../utils/reportFilters.js';

const router = Router();

router.use(authenticate);

/**
 * Row 58: every report is filterable by date range, location, equipment and
 * work centre. A bad filter is a 400 with the reasons, never a silently empty
 * report - an empty result set reads as "nothing happened", which for a
 * maintenance report is the most dangerous answer available.
 *
 * The scope and the date bounds are returned separately on purpose. Which date
 * column a report filters on is a property of the report, and pm-compliance has
 * to intersect the caller's range with its own month window rather than replace
 * it, which a single merged `where` cannot express.
 */
async function resolveReportScope(
  req: Request,
  res: Response
): Promise<{ filter: ReportFilter; scope: Record<string, unknown> } | null> {
  const parsed = parseReportFilter(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: 'Invalid report filter', details: parsed.errors });
    return null;
  }
  const { filter } = parsed;

  let locationIds: string[] | null = null;
  if (filter.functionalLocationId !== null) {
    if (filter.includeDescendantLocations) {
      const tree = await prisma.functionalLocation.findMany({
        where: { isDeleted: false },
        select: { functionalLocationId: true, parentLocationId: true },
      });
      locationIds = descendantLocationIds(filter.functionalLocationId, tree);
    } else {
      locationIds = [filter.functionalLocationId];
    }
  }

  return { filter, scope: buildScopeWhere(filter, locationIds) };
}


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
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/backlog', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const scoped = {
      isDeleted: false,
      status: { notIn: ['Completed', 'Closed', 'Cancelled'] },
      ...resolved.scope,
      ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
    };

    const backlog = await prisma.workOrder.groupBy({
      by: ['status'],
      where: scoped,
      _count: { workOrderId: true },
      orderBy: { status: 'asc' },
    });

    const hoursByStatus = await prisma.workOrderOperation.groupBy({
      by: ['workOrderId'],
      where: {
        isDeleted: false,
        workOrder: scoped,
      },
      _sum: { plannedHours: true },
    });

    const woHoursMap = new Map<string, number>();
    for (const entry of hoursByStatus) {
      woHoursMap.set(entry.workOrderId, entry._sum.plannedHours || 0);
    }

    const workOrders = await prisma.workOrder.findMany({
      where: scoped,
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
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const { filter, scope } = resolved;
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // The month window is this report's own period, so it is intersected with
    // any from/to the caller supplied rather than replaced by it. R.4
    // redefines the denominator; the scoping added here survives that.
    const requested = buildDateWhere(filter, 'createdDate') as { createdDate?: { gte?: Date; lte?: Date } } | null;
    const window = {
      createdDate: {
        gte: requested?.createdDate?.gte !== undefined && requested.createdDate.gte > startDate ? requested.createdDate.gte : startDate,
        lte: requested?.createdDate?.lte !== undefined && requested.createdDate.lte < endDate ? requested.createdDate.lte : endDate,
      },
    };

    const totalPM = await prisma.workOrder.count({
      where: {
        ...scope,
        isDeleted: false,
        type: 'PM',
        ...window,
      },
    });

    const completedPM = await prisma.workOrder.count({
      where: {
        ...scope,
        isDeleted: false,
        type: 'PM',
        status: { in: ['Completed', 'Closed'] },
        ...window,
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
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/mtbf', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const breakdowns = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: 'EM',
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'actualStart') ?? {}),
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
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/mttr', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const breakdowns = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: 'EM',
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'actualStart') ?? {}),
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
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/cost-summary', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const workOrders = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        costCenterCode: { not: '' },
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
      },
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
      entry.planned += Number(wo.plannedCost);
      entry.actual += Number(wo.actualCost);
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
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/downtime', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const workOrders = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: { in: ['EM', 'CM'] },
        equipmentId: { not: null },
        actualStart: { not: null },
        actualFinish: { not: null },
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'actualFinish') ?? {}),
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
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start of a closed calendar-day range, YYYY-MM-DD
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End of a closed calendar-day range, YYYY-MM-DD; inclusive of the whole day
 *       - in: query
 *         name: functionalLocationId
 *         schema: { type: string }
 *         description: Restrict to this functional location
 *       - in: query
 *         name: includeDescendantLocations
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: When true, a functionalLocationId filter also includes every location beneath it
 *       - in: query
 *         name: equipmentId
 *         schema: { type: string }
 *       - in: query
 *         name: workCenterId
 *         schema: { type: string }
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
router.get('/material-consumption', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    // Consumption is scoped through the parent work order, so the filter has to
    // be applied to that relation rather than to the material line.
    const materials = await prisma.workOrderMaterial.groupBy({
      by: ['materialId'],
      where: {
        isDeleted: false,
        actualQuantity: { gt: 0 },
        workOrder: {
          isDeleted: false,
          ...resolved.scope,
          ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
        },
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
        totalCost: Math.round((Number(m._sum.actualQuantity) || 0) * (Number(m._sum.unitCost) || 0) * 100) / 100,
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
