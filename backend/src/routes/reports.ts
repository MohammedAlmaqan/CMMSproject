import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  buildDateWhere,
  buildScopeWhere,
  descendantLocationIds,
  parseDayStart,
  parseReportFilter,
} from '../utils/reportFilters.js';
import type { ReportFilter } from '../utils/reportFilters.js';
import { cyclesInWindow } from '../utils/pmDueRules.js';
import type { IntervalUnit } from '../utils/pmDueRules.js';
import { baseCycleKey } from '../services/pmGeneration.js';
import { loadCostRollup } from '../utils/costRollupData.js';
import { rollupByLocation } from '../utils/costRollup.js';

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
 *     summary: Work order backlog by status, by priority and by work centre
 *     description: >
 *       Counts open work orders (excluding Completed, Closed and Cancelled) and sums the
 *       planned hours of their operations, presented as three breakdowns of the same
 *       backlog: by status, by priority and by work centre. The clause reads "by status,
 *       priority, and work center" as three available slices rather than one status x
 *       priority x work centre cube. Each breakdown partitions the backlog, so the three
 *       counts are equal to each other and the three hour totals are equal to each other.
 *       Read-only and available to any authenticated role.
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
 *         description: The same backlog sliced three ways
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 byStatus:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status: { type: string }
 *                       count: { type: integer }
 *                       totalPlannedHours: { type: number, format: float }
 *                 byPriority:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       priority: { type: string }
 *                       count: { type: integer }
 *                       totalPlannedHours: { type: number, format: float }
 *                 byWorkCenter:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       workCenterId: { type: string }
 *                       workCenterCode: { type: string }
 *                       workCenterName: { type: string }
 *                       count: { type: integer }
 *                       totalPlannedHours: { type: number, format: float }
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

    // One read of the backlog rows and one read of their operation hours, then
    // three in-process groupings over the same rows. Querying three times would
    // let the three breakdowns disagree at a row boundary, and the equality of
    // their totals is the property a caller relies on to trust any one of them.
    const workOrders = await prisma.workOrder.findMany({
      where: scoped,
      select: { workOrderId: true, status: true, priority: true, workCenterId: true },
    });
    const workOrderIds = workOrders.map((w) => w.workOrderId);

    const hoursByWorkOrder = await prisma.workOrderOperation.groupBy({
      by: ['workOrderId'],
      where: { isDeleted: false, workOrderId: { in: workOrderIds } },
      _sum: { plannedHours: true },
    });
    const hoursMap = new Map<string, number>();
    for (const entry of hoursByWorkOrder) {
      hoursMap.set(entry.workOrderId, entry._sum.plannedHours ?? 0);
    }

    interface BacklogBucket {
      count: number;
      totalPlannedHours: number;
    }
    const accumulate = <T extends BacklogBucket>(
      map: Map<string, T>,
      key: string,
      base: Omit<T, 'count' | 'totalPlannedHours'>,
      hours: number
    ): void => {
      let entry = map.get(key);
      if (!entry) {
        entry = { ...base, count: 0, totalPlannedHours: 0 } as T;
        map.set(key, entry);
      }
      entry.count += 1;
      entry.totalPlannedHours += hours;
    };

    const statuses = new Map<string, { status: string; count: number; totalPlannedHours: number }>();
    const priorities = new Map<string, { priority: string; count: number; totalPlannedHours: number }>();
    const centres = new Map<string, { workCenterId: string; count: number; totalPlannedHours: number }>();

    for (const wo of workOrders) {
      const hours = hoursMap.get(wo.workOrderId) ?? 0;
      accumulate(statuses, wo.status, { status: wo.status }, hours);
      accumulate(priorities, wo.priority, { priority: wo.priority }, hours);
      accumulate(centres, wo.workCenterId, { workCenterId: wo.workCenterId }, hours);
    }

    const centreDetails = await prisma.workCenter.findMany({
      where: { workCenterId: { in: [...centres.keys()] } },
      select: { workCenterId: true, code: true, name: true },
    });
    const centreDetailMap = new Map(centreDetails.map((c) => [c.workCenterId, c]));

    res.json({
      byStatus: [...statuses.values()].sort((a, b) => a.status.localeCompare(b.status)),
      byPriority: [...priorities.values()].sort((a, b) => a.priority.localeCompare(b.priority)),
      byWorkCenter: [...centres.values()]
        .map((c) => ({
          workCenterId: c.workCenterId,
          workCenterCode: centreDetailMap.get(c.workCenterId)?.code ?? '',
          workCenterName: centreDetailMap.get(c.workCenterId)?.name ?? '',
          count: c.count,
          totalPlannedHours: c.totalPlannedHours,
        }))
        .sort((a, b) => a.workCenterCode.localeCompare(b.workCenterCode)),
    });
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
 *       Compliance is the share of PMs *scheduled* for the month that were completed,
 *       not the share of raised work orders. Scheduled PMs are the time-based occurrences
 *       due in the period, derived from each MaintenancePlan's start date and interval, so a
 *       plan that fell behind and never raised work is still counted against the rate. The
 *       numerator counts PM work orders whose source plan cycle falls in the period and
 *       whose status reached Completed or Closed. Meter-driven plans have no calendar due
 *       date and are excluded from the denominator; their count is returned so the exclusion
 *       is visible rather than silent. Defaults to the current month when year or month is
 *       omitted.
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
 *                 scheduledPM: { type: integer, description: Time-based occurrences due in the period, across every target }
 *                 completedPM: { type: integer }
 *                 complianceRate: { type: number, format: float, description: Percentage rounded to two decimals }
 *                 excludedMeterPlans: { type: integer, description: Meter-driven plans left out of the denominator }
 *                 exclusionNote: { type: string }
 *       '400':
 *         description: Invalid year or month
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
    const targetYear = year ? parseInt(year as string, 10) : now.getUTCFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getUTCMonth() + 1;

    if (!Number.isInteger(targetYear) || targetYear < 1970 || targetYear > 9999) {
      res.status(400).json({ error: 'Invalid report filter', details: [`year must be a four-digit year, got "${year}"`] });
      return;
    }
    if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
      res.status(400).json({ error: 'Invalid report filter', details: [`month must be 1-12, got "${month}"`] });
      return;
    }

    // UTC throughout: the scheduler and the date-filter parser are both UTC, so
    // a local-time month boundary here would shift cycles across the line.
    const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0));

    // The month window is this report's own period, so it is intersected with
    // any from/to the caller supplied rather than replaced by it.
    const requested = buildDateWhere(filter, 'createdDate') as { createdDate?: { gte?: Date; lte?: Date } } | null;
    const windowStart =
      requested?.createdDate?.gte !== undefined && requested.createdDate.gte > monthStart
        ? requested.createdDate.gte
        : monthStart;
    const windowEnd =
      requested?.createdDate?.lte !== undefined && requested.createdDate.lte < new Date(monthEnd.getTime() + 86_400_000 - 1)
        ? requested.createdDate.lte
        : new Date(monthEnd.getTime() + 86_400_000 - 1);

    // Denominator from the schedule, not from raised work orders. A plan that
    // fell behind raised nothing but still owed a PM, and counting only raised
    // work orders would let that backlog read as perfect compliance.
    const plans = await prisma.maintenancePlan.findMany({
      where: { isDeleted: false, ...scope },
      select: {
        strategyType: true,
        intervalValue: true,
        intervalUnit: true,
        startDate: true,
        endDate: true,
        targets: { where: { isDeleted: false }, select: { planTargetId: true } },
      },
    });

    let scheduledPM = 0;
    let excludedMeterPlans = 0;
    for (const plan of plans) {
      if (plan.strategyType === 'Meter') {
        excludedMeterPlans += 1;
        continue;
      }
      const targetCount = plan.targets.length > 0 ? plan.targets.length : 1;
      const cycles = cyclesInWindow(
        {
          startDate: plan.startDate,
          endDate: plan.endDate,
          intervalValue: plan.intervalValue,
          intervalUnit: plan.intervalUnit as IntervalUnit,
        },
        windowStart,
        windowEnd
      );
      scheduledPM += cycles.length * targetCount;
    }

    // Numerator: finished PM work orders whose cycle is dated to the period.
    // The cycle key is the schedule's own YYYY-MM-DD, so this compares schedule
    // to schedule rather than completion date to period.
    const completed = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        type: 'PM',
        status: { in: ['Completed', 'Closed'] },
        sourcePlanId: { not: null },
        ...scope,
      },
      select: { sourcePlanCycle: true },
    });

    let completedPM = 0;
    for (const wo of completed) {
      const day = baseCycleKey(wo.sourcePlanCycle);
      if (!day) continue;
      const due = parseDayStart(day);
      if (!due) continue;
      if (due.getTime() >= windowStart.getTime() && due.getTime() <= windowEnd.getTime()) completedPM += 1;
    }

    const complianceRate = scheduledPM > 0 ? (completedPM / scheduledPM) * 100 : 0;

    res.json({
      period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      scheduledPM,
      completedPM,
      complianceRate: Math.round(complianceRate * 100) / 100,
      excludedMeterPlans,
      exclusionNote:
        'Meter-driven plans are excluded from Scheduled PMs: a meter threshold has no calendar due date, so it cannot be placed in the period. They are counted by excludedMeterPlans instead.',
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
 *     summary: Mean time to repair by equipment and by location
 *     description: >
 *       Computes mean time to repair from breakdown work orders, with the duration measured
 *       as actualFinish - actualStart, reported both per equipment and per functional
 *       location. A work order missing either timestamp cannot contribute a duration: those
 *       rows are excluded and counted in excludedIncomplete rather than dropped silently,
 *       because an MTTR that quietly ignores its unfinished repairs flatters itself.
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
 *         description: MTTR per equipment and per location
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 byEquipment:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       equipmentId: { type: string }
 *                       mttrHours: { type: number, format: float }
 *                       breakdownCount: { type: integer }
 *                 byLocation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       functionalLocationId: { type: string }
 *                       locationCode: { type: string }
 *                       description: { type: string }
 *                       mttrHours: { type: number, format: float }
 *                       breakdownCount: { type: integer }
 *                 excludedIncomplete: { type: integer, description: Breakdowns missing actualStart or actualFinish }
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
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'actualStart') ?? {}),
      },
      select: {
        equipmentId: true,
        functionalLocationId: true,
        actualStart: true,
        actualFinish: true,
      },
    });

    const equipmentMap = new Map<string, { totalDowntime: number; count: number }>();
    const locationMap = new Map<string, { totalDowntime: number; count: number }>();
    let excludedIncomplete = 0;

    for (const bd of breakdowns) {
      if (!bd.actualStart || !bd.actualFinish) {
        excludedIncomplete += 1;
        continue;
      }
      const downtime = bd.actualFinish.getTime() - bd.actualStart.getTime();

      if (bd.equipmentId) {
        const entry = equipmentMap.get(bd.equipmentId) ?? { totalDowntime: 0, count: 0 };
        entry.totalDowntime += downtime;
        entry.count += 1;
        equipmentMap.set(bd.equipmentId, entry);
      }

      const byLocationEntry = locationMap.get(bd.functionalLocationId) ?? { totalDowntime: 0, count: 0 };
      byLocationEntry.totalDowntime += downtime;
      byLocationEntry.count += 1;
      locationMap.set(bd.functionalLocationId, byLocationEntry);
    }

    const byEquipment = [...equipmentMap.entries()]
      .map(([equipmentId, data]) => ({
        equipmentId,
        mttrHours: Math.round((data.totalDowntime / data.count / (1000 * 60 * 60)) * 100) / 100,
        breakdownCount: data.count,
      }))
      .sort((a, b) => a.equipmentId.localeCompare(b.equipmentId));

    const locationDetails = await prisma.functionalLocation.findMany({
      where: { functionalLocationId: { in: [...locationMap.keys()] } },
      select: { functionalLocationId: true, locationCode: true, description: true },
    });
    const locationDetailMap = new Map(locationDetails.map((l) => [l.functionalLocationId, l]));

    const byLocation = [...locationMap.entries()]
      .map(([functionalLocationId, data]) => ({
        functionalLocationId,
        locationCode: locationDetailMap.get(functionalLocationId)?.locationCode ?? '',
        description: locationDetailMap.get(functionalLocationId)?.description ?? '',
        mttrHours: Math.round((data.totalDowntime / data.count / (1000 * 60 * 60)) * 100) / 100,
        breakdownCount: data.count,
      }))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode));

    res.json({ byEquipment, byLocation, excludedIncomplete });
  } catch (error) {
    logger.error({ err: error }, 'Error generating MTTR report');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/reports/cost-summary:
 *   get:
 *     summary: Work order cost summary by cost centre and by location
 *     description: >
 *       For the given calendar month, totals estimated and actual cost across work orders and
 *       presents the same total two ways: grouped by cost centre and grouped by functional
 *       location. Defaults to the current month when year or month is omitted. Built on the
 *       R.1 cost rollups, so a location row carries its own figures and the subtree total a
 *       caller would see on the rollup report. Budget comparison remains waived (D-13):
 *       no budget column exists in v1.0.0, so none is reported. Monetary values are Float in
 *       v1.0.0.
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
 *         description: Cost summary for the period, by cost centre and by location
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period: { type: string, example: "2026-03" }
 *                 budgetNote: { type: string }
 *                 byCostCenter:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       costCenterCode: { type: string }
 *                       plannedCost: { type: number, format: float }
 *                       actualCost: { type: number, format: float }
 *                       variance: { type: number, format: float, description: actualCost - plannedCost }
 *                       workOrderCount: { type: integer }
 *                 byLocation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       functionalLocationId: { type: string }
 *                       locationCode: { type: string }
 *                       description: { type: string }
 *                       plannedCost: { type: number, format: float }
 *                       actualCost: { type: number, format: float }
 *                       variance: { type: number, format: float }
 *                       workOrderCount: { type: integer }
 *       '400':
 *         description: Invalid year or month
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/cost-summary', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const { filter } = resolved;
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getUTCFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getUTCMonth() + 1;

    if (!Number.isInteger(targetYear) || targetYear < 1970 || targetYear > 9999) {
      res.status(400).json({ error: 'Invalid report filter', details: [`year must be a four-digit year, got "${year}"`] });
      return;
    }
    if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
      res.status(400).json({ error: 'Invalid report filter', details: [`month must be 1-12, got "${month}"`] });
      return;
    }

    const monthStart = Date.UTC(targetYear, targetMonth - 1, 1);
    const monthEnd = Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const from = filter.from !== null && filter.from.getTime() > monthStart ? filter.from : new Date(monthStart);
    const to = filter.to !== null && filter.to.getTime() < monthEnd ? filter.to : new Date(monthEnd);

    const { workOrders, locations } = await loadCostRollup({
      from,
      to,
      functionalLocationId: filter.functionalLocationId ?? undefined,
      includeDescendants: filter.includeDescendantLocations,
      equipmentId: filter.equipmentId ?? undefined,
      workCenterId: filter.workCenterId ?? undefined,
    });

    const centreMap = new Map<string, { plannedCost: number; actualCost: number; workOrderCount: number }>();
    for (const wo of workOrders) {
      const entry = centreMap.get(wo.costCenterCode) ?? { plannedCost: 0, actualCost: 0, workOrderCount: 0 };
      entry.plannedCost += wo.plannedCost;
      entry.actualCost += wo.actualCost;
      entry.workOrderCount += 1;
      centreMap.set(wo.costCenterCode, entry);
    }

    const money = (v: number): number => Math.round(v * 100) / 100;
    const byCostCenter = [...centreMap.entries()]
      .map(([costCenterCode, t]) => ({
        costCenterCode,
        plannedCost: money(t.plannedCost),
        actualCost: money(t.actualCost),
        variance: money(t.actualCost - t.plannedCost),
        workOrderCount: t.workOrderCount,
      }))
      .sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode));

    const byLocation = rollupByLocation(workOrders, locations)
      .map((l) => ({
        functionalLocationId: l.functionalLocationId,
        locationCode: l.locationCode,
        description: l.description,
        plannedCost: l.plannedCost,
        actualCost: l.actualCost,
        variance: money(l.actualCost - l.plannedCost),
        workOrderCount: l.workOrderCount,
      }))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode));

    res.json({
      period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      budgetNote: 'Budget comparison is waived (D-13): v1.0.0 has no budget column, so no budget figure is reported.',
      byCostCenter,
      byLocation,
    });
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
 *     summary: Material consumption by material, by work order and by equipment
 *     description: >
 *       For the given calendar month, totals actual material quantities and cost consumed on
 *       work orders, presented three ways: by material, by work order and by equipment.
 *       Defaults to the current month when year or month is omitted. Cost is the sum of
 *       quantity x unit cost over the consumption lines, so a line whose unit cost changed
 *       is priced at the cost recorded on that line rather than at an averaged rate.
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
 *         description: Consumption per material, per work order and per equipment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 byMaterial:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       materialId: { type: string }
 *                       materialCode: { type: string }
 *                       description: { type: string }
 *                       unitOfMeasure: { type: string }
 *                       totalQuantityUsed: { type: number, format: float }
 *                       totalCost: { type: number, format: float }
 *                       usageCount: { type: integer }
 *                 byWorkOrder:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       workOrderId: { type: string }
 *                       woNumber: { type: string }
 *                       totalQuantityUsed: { type: number, format: float }
 *                       totalCost: { type: number, format: float }
 *                       lineCount: { type: integer }
 *                 byEquipment:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       equipmentId: { type: string }
 *                       equipmentCode: { type: string }
 *                       equipmentName: { type: string }
 *                       totalQuantityUsed: { type: number, format: float }
 *                       totalCost: { type: number, format: float }
 *                       lineCount: { type: integer }
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
    // be applied to that relation rather than to the material line. The lines
    // are read one by one rather than SUM(quantity) x SUM(unitCost), because
    // that product prices the whole month at whichever unit cost happens to be
    // on the last row; the cost belongs to each line.
    const lines = await prisma.workOrderMaterial.findMany({
      where: {
        isDeleted: false,
        actualQuantity: { gt: 0 },
        workOrder: {
          isDeleted: false,
          ...resolved.scope,
          ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
        },
      },
      select: {
        materialId: true,
        actualQuantity: true,
        unitCost: true,
        workOrderId: true,
        workOrder: {
          select: {
            woNumber: true,
            equipmentId: true,
            equipment: { select: { equipmentCode: true, name: true } },
          },
        },
      },
    });

    const money = (v: number): number => Math.round(v * 100) / 100;
    const costOf = (line: (typeof lines)[number]): number =>
      (Number(line.actualQuantity) || 0) * (Number(line.unitCost) || 0);

    interface ConsumptionBucket {
      totalQuantityUsed: number;
      totalCost: number;
      lineCount: number;
    }
    const accumulate = <T extends ConsumptionBucket>(
      map: Map<string, T>,
      key: string,
      base: Omit<T, 'totalQuantityUsed' | 'totalCost' | 'lineCount'>,
      line: (typeof lines)[number]
    ): void => {
      let entry = map.get(key);
      if (!entry) {
        entry = { ...base, totalQuantityUsed: 0, totalCost: 0, lineCount: 0 } as T;
        map.set(key, entry);
      }
      entry.totalQuantityUsed += Number(line.actualQuantity) || 0;
      entry.totalCost += costOf(line);
      entry.lineCount += 1;
    };

    const materialMap = new Map<string, { materialId: string; totalQuantityUsed: number; totalCost: number; lineCount: number }>();
    const orderMap = new Map<string, { workOrderId: string; woNumber: string; totalQuantityUsed: number; totalCost: number; lineCount: number }>();
    const equipmentMap = new Map<string, { equipmentId: string; equipmentCode: string; equipmentName: string; totalQuantityUsed: number; totalCost: number; lineCount: number }>();

    for (const line of lines) {
      accumulate(materialMap, line.materialId, { materialId: line.materialId }, line);
      accumulate(
        orderMap,
        line.workOrderId,
        { workOrderId: line.workOrderId, woNumber: line.workOrder.woNumber },
        line
      );
      const equipmentId = line.workOrder.equipmentId ?? 'NO_EQUIPMENT';
      accumulate(
        equipmentMap,
        equipmentId,
        {
          equipmentId,
          equipmentCode: line.workOrder.equipment?.equipmentCode ?? '',
          equipmentName: line.workOrder.equipment?.name ?? '',
        },
        line
      );
    }

    const materialDetails = await prisma.material.findMany({
      where: { materialId: { in: [...materialMap.keys()] } },
      select: { materialId: true, materialCode: true, description: true, unitOfMeasure: true },
    });
    const detailMap = new Map(materialDetails.map((m) => [m.materialId, m]));

    res.json({
      byMaterial: [...materialMap.values()]
        .map((m) => ({
          materialId: m.materialId,
          materialCode: detailMap.get(m.materialId)?.materialCode ?? '',
          description: detailMap.get(m.materialId)?.description ?? '',
          unitOfMeasure: detailMap.get(m.materialId)?.unitOfMeasure ?? '',
          totalQuantityUsed: Math.round(m.totalQuantityUsed * 100) / 100,
          totalCost: money(m.totalCost),
          usageCount: m.lineCount,
        }))
        .sort((a, b) => a.materialCode.localeCompare(b.materialCode)),
      byWorkOrder: [...orderMap.values()]
        .map((o) => ({
          workOrderId: o.workOrderId,
          woNumber: o.woNumber,
          totalQuantityUsed: Math.round(o.totalQuantityUsed * 100) / 100,
          totalCost: money(o.totalCost),
          lineCount: o.lineCount,
        }))
        .sort((a, b) => a.woNumber.localeCompare(b.woNumber)),
      byEquipment: [...equipmentMap.values()]
        .map((e) => ({
          equipmentId: e.equipmentId,
          equipmentCode: e.equipmentCode,
          equipmentName: e.equipmentName,
          totalQuantityUsed: Math.round(e.totalQuantityUsed * 100) / 100,
          totalCost: money(e.totalCost),
          lineCount: e.lineCount,
        }))
        .sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode)),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating material consumption report');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/reports/backlog-hours-by-work-center:
 *   get:
 *     summary: Open backlog hours grouped by work centre
 *     description: >
 *       SOW 3.7.2 row 65 asks for backlog *hours* by work centre. The dashboard
 *       widget that used to answer this question counted work orders instead,
 *       which is a different question: one work order carrying forty hours of
 *       planned labour and one carrying forty minutes both counted as 1. The
 *       figure below sums planned hours across the operations of every open
 *       work order, so it moves with the work actually queued rather than with
 *       the paperwork raised against it.
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
 *         description: Backlog hours per work centre, every active centre included
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   workCenterId: { type: string }
 *                   workCenterCode: { type: string }
 *                   workCenterName: { type: string }
 *                   openWorkOrderCount: { type: integer, description: Open work orders in this centre, for contrast with backlogHours }
 *                   backlogHours: { type: number, format: float, description: Sum of planned hours on the operations of those work orders }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/backlog-hours-by-work-center', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const scoped = {
      isDeleted: false,
      status: { notIn: ['Completed', 'Closed', 'Cancelled'] },
      ...resolved.scope,
      ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
    };

    // Operations carry the hours; the work order carries the work centre. There
    // is no single row holding both, so the hours are grouped by work order
    // first and folded onto the centre second. `plannedHours` is summed per work
    // order because a work order's contribution to a centre's backlog is the
    // whole of its planned labour, not its average operation.
    const hoursByWorkOrder = await prisma.workOrderOperation.groupBy({
      by: ['workOrderId'],
      where: { isDeleted: false, workOrder: scoped },
      _sum: { plannedHours: true },
    });
    const hoursMap = new Map(hoursByWorkOrder.map((e) => [e.workOrderId, e._sum.plannedHours || 0]));

    const workOrders = await prisma.workOrder.findMany({
      where: scoped,
      select: { workOrderId: true, workCenterId: true },
    });

    const totals = new Map<string, { hours: number; count: number }>();
    for (const wo of workOrders) {
      const entry = totals.get(wo.workCenterId) ?? { hours: 0, count: 0 };
      entry.hours += hoursMap.get(wo.workOrderId) ?? 0;
      entry.count += 1;
      totals.set(wo.workCenterId, entry);
    }

    // Every non-deleted work centre is listed, including ones with nothing open.
    // A centre absent from the report and a centre with an empty backlog are
    // different facts, and a capacity plan that cannot tell them apart will read
    // a missing row as spare capacity. The centre filter still narrows the list,
    // so asking about one centre answers about that centre and nothing else.
    const workCenters = await prisma.workCenter.findMany({
      where: {
        isDeleted: false,
        ...(resolved.filter.workCenterId !== null ? { workCenterId: resolved.filter.workCenterId } : {}),
      },
      select: { workCenterId: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const result = workCenters.map((wc) => {
      const entry = totals.get(wc.workCenterId);
      return {
        workCenterId: wc.workCenterId,
        workCenterCode: wc.code,
        workCenterName: wc.name,
        openWorkOrderCount: entry?.count ?? 0,
        backlogHours: Math.round((entry?.hours ?? 0) * 100) / 100,
      };
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating backlog hours report');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/reports/top-cost-equipment:
 *   get:
 *     summary: The ten costliest pieces of equipment
 *     description: >
 *       SOW 3.7.2 row 66. Equipment is ranked by what the work has actually
 *       committed: a work order contributes its actual cost once it has any, and
 *       its planned cost until then. Ranking on planned cost alone would put
 *       every unstarted job above the finished ones that already cost money,
 *       and ranking on actual cost alone would drop the planned backlog out of a
 *       report meant to inform planning. Ties break on equipmentId so the order
 *       is stable between calls.
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
 *         description: Up to ten equipment rows, most expensive first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   equipmentId: { type: string }
 *                   equipmentCode: { type: string }
 *                   equipmentName: { type: string }
 *                   workOrderCount: { type: integer }
 *                   plannedCost: { type: number, format: float }
 *                   actualCost: { type: number, format: float }
 *                   totalCost: { type: number, format: float, description: Actual cost where present, planned cost otherwise, summed per work order }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/top-cost-equipment', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;

    // Work orders with no equipment are excluded rather than filed under a null
    // key: this report is a ranking of assets, and an unattributed cost is not
    // an asset a planner can act on.
    const workOrders = await prisma.workOrder.findMany({
      where: {
        isDeleted: false,
        equipmentId: { not: null },
        ...resolved.scope,
        ...(buildDateWhere(resolved.filter, 'createdDate') ?? {}),
      },
      select: { equipmentId: true, plannedCost: true, actualCost: true },
    });

    const totals = new Map<string, { total: number; planned: number; actual: number; count: number }>();
    for (const wo of workOrders) {
      if (wo.equipmentId === null) continue;
      const planned = Number(wo.plannedCost);
      const actual = Number(wo.actualCost);
      // One work order contributes one figure: its actual cost where it has one,
      // its planned cost otherwise. Summing planned and actual together would
      // count the same job twice, once as the money reserved and once as the
      // money spent.
      const contribution = actual > 0 ? actual : planned;
      const entry = totals.get(wo.equipmentId) ?? { total: 0, planned: 0, actual: 0, count: 0 };
      entry.total += contribution;
      entry.planned += planned;
      entry.actual += actual;
      entry.count += 1;
      totals.set(wo.equipmentId, entry);
    }

    const equipmentIds = [...totals.keys()];
    const equipment = await prisma.equipment.findMany({
      where: { equipmentId: { in: equipmentIds }, isDeleted: false },
      select: { equipmentId: true, equipmentCode: true, name: true },
    });
    const nameById = new Map(equipment.map((e) => [e.equipmentId, e]));

    const result = [...totals.entries()]
      .map(([equipmentId, entry]) => {
        const detail = nameById.get(equipmentId);
        return {
          equipmentId,
          // A deleted asset still carries cost, so its identity falls back to the
          // id rather than to an empty string that two rows could share.
          equipmentCode: detail?.equipmentCode ?? equipmentId,
          equipmentName: detail?.name ?? equipmentId,
          workOrderCount: entry.count,
          plannedCost: Math.round(entry.planned * 100) / 100,
          actualCost: Math.round(entry.actual * 100) / 100,
          totalCost: Math.round(entry.total * 100) / 100,
        };
      })
      // EquipmentId as the tie-break: two assets can cost the same to the cent,
      // and an unstable order would make the top ten flicker between calls with
      // no change in the underlying data.
      .sort((a, b) => b.totalCost - a.totalCost || a.equipmentId.localeCompare(b.equipmentId))
      .slice(0, 10);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error generating top cost equipment report');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/reports/notifications-awaiting-conversion:
 *   get:
 *     summary: Notifications raised but not yet turned into work
 *     description: >
 *       SOW 3.7.2 row 67. "Awaiting conversion" is narrower than "open": it means
 *       the notification has not yet become a work order, so Converted is
 *       excluded even though a converted notification's issue stays open until
 *       the work order it became is completed. The two questions are answered by
 *       two different reports on purpose - this one counts work not yet raised.
 *
 *       This report rejects `workCenterId` with a 400 rather than ignoring it. A
 *       notification names a location and, when there is one, an asset; it does
 *       not name a work centre, because work centres are assigned per work order
 *       rather than per asset. Accepting the filter and quietly returning the
 *       unfiltered answer would hand the caller a number they believe they
 *       narrowed, which is the same class of wrong as an empty report.
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
 *         description: Not supported by this report; supplying it is a 400 with the reason
 *     responses:
 *       '200':
 *         description: Count of notifications awaiting conversion, with a priority breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 byPriority:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       priority: { type: string }
 *                       count: { type: integer }
 *                 oldestAgeDays: { type: number, format: float, nullable: true, description: Whole days since the oldest awaiting notification was raised; null when there are none }
 *       '400':
 *         description: Invalid report filter
 *       '401':
 *         description: Missing or invalid bearer token
 *       '500':
 *         description: Internal server error
 */
router.get('/notifications-awaiting-conversion', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveReportScope(req, res);
    if (!resolved) return;
    const { filter, scope } = resolved;

    if (filter.workCenterId !== null) {
      res.status(400).json({
        error: 'Invalid report filter',
        details: ['workCenterId is not supported by this report; a notification is not assigned to a work centre'],
      });
      return;
    }

    const notifications = await prisma.notification.findMany({
      where: {
        isDeleted: false,
        status: { in: ['Open', 'In Process'] },
        ...scope,
        ...(buildDateWhere(filter, 'createdDate') ?? {}),
      },
      select: { priority: true, createdDate: true },
      orderBy: { createdDate: 'asc' },
    });

    const byPriority = new Map<string, number>();
    for (const n of notifications) {
      byPriority.set(n.priority, (byPriority.get(n.priority) ?? 0) + 1);
    }

    // High first, then Medium, then Low, then anything else the database happens
    // to hold. An unrecognised priority is still counted and still shown rather
    // than dropped: a priority nobody has seen before is a data question, and
    // hiding it from the report would make the report look complete.
    const PRIORITY_ORDER = ['High', 'Medium', 'Low'];
    const priorityRows = [...byPriority.entries()]
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => {
        const ai = PRIORITY_ORDER.indexOf(a.priority);
        const bi = PRIORITY_ORDER.indexOf(b.priority);
        return (ai === -1 ? PRIORITY_ORDER.length : ai) - (bi === -1 ? PRIORITY_ORDER.length : bi)
          || a.priority.localeCompare(b.priority);
      });

    const oldest = notifications.length > 0 ? notifications[0].createdDate : null;
    const oldestAgeDays = oldest === null
      ? null
      : Math.floor((Date.now() - oldest.getTime()) / 86_400_000);

    res.json({
      total: notifications.length,
      byPriority: priorityRows,
      oldestAgeDays,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating notifications awaiting conversion report');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
