import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeNotifications, purgeAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

describe('reports routes', () => {
  // `/notifications-awaiting-conversion` is in the 200 sweep but never in a
  // work-centre filter sweep: it is the one report that cannot be narrowed by
  // work centre, and it says so with a 400 rather than by ignoring the filter.
  const endpoints = [
    '/backlog', '/pm-compliance', '/mtbf', '/mttr', '/cost-summary', '/downtime', '/material-consumption',
    '/backlog-hours-by-work-center', '/top-cost-equipment', '/notifications-awaiting-conversion',
  ];

  it('returns 200 for every report endpoint', async () => {
    for (const ep of endpoints) {
      const res = await api().get(`/api/reports${ep}`).set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep}`).toBe(200);
    }
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/reports/backlog');
    expect(res.status).toBe(401);
  });

  it('returns report data as an array', async () => {
    const res = await api().get('/api/reports/backlog').set(authHeaders(ctx.adminToken));
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('report filters', () => {
  // Reports whose subject is a work order, and which therefore accept every
  // shared dimension including work centre.
  const workOrderReports = [
    '/backlog', '/pm-compliance', '/mtbf', '/mttr', '/cost-summary', '/downtime', '/material-consumption',
    '/backlog-hours-by-work-center', '/top-cost-equipment',
  ];
  // The notification report is filterable by date, location and equipment but
  // not by work centre, so it is swept separately rather than being swept with
  // a filter it rejects.
  const notificationReport = '/notifications-awaiting-conversion';
  const endpoints = [...workOrderReports, notificationReport];

  it('accepts every shared filter on every report', async () => {
    for (const ep of workOrderReports) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ from: '2020-01-01', to: '2030-12-31', equipmentId: 'EQ-ANY', workCenterId: 'WC-ANY' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with filters`).toBe(200);
    }
  });

  it('accepts every filter the notification report supports', async () => {
    const res = await api()
      .get(`/api/reports${notificationReport}`)
      .query({ from: '2020-01-01', to: '2030-12-31', equipmentId: 'EQ-ANY' })
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
  });

  it('rejects a work-centre filter on the notification report with the reason, rather than ignoring it', async () => {
    const res = await api()
      .get(`/api/reports${notificationReport}`)
      .query({ workCenterId: 'WC-ANY' })
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/workCenterId is not supported/);
  });

  it('accepts a location filter on every report', async () => {
    for (const ep of endpoints) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ functionalLocationId: 'LOC-ANY' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with location`).toBe(200);
    }
  });

  it('accepts the descendant-location flag on every report', async () => {
    for (const ep of endpoints) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ functionalLocationId: 'LOC-ANY', includeDescendantLocations: 'true' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with descendants`).toBe(200);
    }
  });

  it('rejects an unparseable date with 400 rather than returning an empty report', async () => {
    const res = await api().get('/api/reports/backlog').query({ from: 'yesterday' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a reversed range with 400', async () => {
    const res = await api().get('/api/reports/mttr').query({ from: '2026-03-15', to: '2026-03-01' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean descendant flag with 400', async () => {
    const res = await api().get('/api/reports/downtime')
      .query({ functionalLocationId: 'LOC-ANY', includeDescendantLocations: 'yes' })
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects a repeated filter parameter with 400', async () => {
    const res = await api().get('/api/reports/backlog?equipmentId=A&equipmentId=B').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('treats an empty filter parameter as absent', async () => {
    const res = await api().get('/api/reports/backlog').query({ from: '', to: '', equipmentId: '' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
  });

  it('narrows a date filter instead of ignoring it', async () => {
    const wide = await api().get('/api/reports/backlog').query({ from: '2000-01-01', to: '2099-12-31' }).set(authHeaders(ctx.adminToken));
    const narrow = await api().get('/api/reports/backlog').query({ from: '2000-01-01', to: '2000-01-02' }).set(authHeaders(ctx.adminToken));
    expect(wide.status).toBe(200);
    expect(narrow.status).toBe(200);
    const wideCount = wide.body.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
    const narrowCount = narrow.body.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
    expect(narrowCount).toBeLessThanOrEqual(wideCount);
  });

  it('still answers pm-compliance when only the shared filters are given, without a year or month', async () => {
    const res = await api().get('/api/reports/pm-compliance').query({ equipmentId: 'EQ-ANY' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('complianceRate');
  });
});

/**
 * SOW 3.7.2 rows 65-67. Each of these has its own case here rather than riding
 * on the shared sweeps above, because each one answers a question the older
 * reports do not: hours instead of counts (65), a ranking (66), and a figure
 * about work not yet raised (67).
 */
describe('report rows 65-67', () => {
  // Two operations of 3.5 and 4 hours. The total is 7.5 against a single work
  // order, so a report that returned counts instead of hours would answer 1
  // where this asserts 7.5 -- the counts-vs-hours defect the row exists to fix.
  const PLANNED_HOURS = 7.5;
  // Set directly on the columns so the ranking assertions are exact. Costs are
  // otherwise derived from operations and crafts (see utils/costRules.ts), which
  // is the right behaviour for the product and the wrong thing to depend on in
  // a test that is about ordering.
  const TOP_PLANNED = 987654.32;
  const SECOND_PLANNED = 5000;
  const SECOND_ACTUAL = 300;

  let flat = '';
  let wc = '';
  let wc2 = '';
  let craftId = '';
  let hoursEquipmentId = '';
  let costEquipmentId = '';
  let baselineCount = 0;
  let baselineHours = 0;
  const workOrderIds: string[] = [];
  const notificationIds: string[] = [];
  const equipmentIds: string[] = [];

  const createWorkOrder = async (description: string, equipment: string | null, workCenterId = wc) => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.adminToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description,
        functionalLocationId: flat,
        equipmentId: equipment,
        workCenterId,
        supervisorUserId: ctx.adminId,
      });
    expect(res.status, `create work order "${description}"`).toBe(201);
    workOrderIds.push(res.body.workOrderId);
    return res.body.workOrderId as string;
  };

  /** An asset of this test's own, so ranking assertions do not depend on the
   *  costs the seeded equipment happens to carry. */
  const createEquipment = async (code: string, name: string) => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode: code, name, description: 'fixture for report rows 65-67', functionalLocationId: flat, criticality: 'C' });
    expect(res.status, `create equipment ${code}`).toBe(201);
    equipmentIds.push(res.body.equipmentId);
    return res.body.equipmentId as string;
  };

  beforeAll(async () => {
    const [wcs, crafts] = await Promise.all([
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
      api().get('/api/crafts').set(authHeaders(ctx.adminToken)),
    ]);
    wc = wcs.body[0].workCenterId;
    // The row-66 fixtures go in a second centre. Row 65 asserts that a work
    // centre's open count moves by exactly one, which is only a meaningful
    // statement if nothing else in this file is adding work orders to it.
    wc2 = wcs.body[1]?.workCenterId ?? wcs.body[0].workCenterId;
    const allCrafts: Array<{ craftId: string; workCenterId: string }> = crafts.body;
    craftId = (allCrafts.find((c) => c.workCenterId === wc) ?? allCrafts[0]).craftId;


    // SOW 3.1.2: equipment may only sit at a lowest-level location, which
    // locationRules.ts defines structurally as one with no non-deleted children.
    // An arbitrary first location is not one, so the leaf is selected
    // deterministically rather than by position.
    const leaf = await prisma.functionalLocation.findFirst({
      where: { isDeleted: false, children: { none: { isDeleted: false } } },
      select: { functionalLocationId: true },
      orderBy: { functionalLocationId: 'asc' },
    });
    if (!leaf) throw new Error('no lowest-level functional location in the seed; report row tests cannot run');
    flat = leaf.functionalLocationId;

    // The work centre already carries whatever the seed and earlier test files
    // left in it, so every row-65 assertion is a delta against this baseline
    // rather than an absolute. It is read *before* the fixtures are created:
    // measured afterwards it would include them and every delta would be zero.
    const baseline = await api()
      .get('/api/reports/backlog-hours-by-work-center')
      .query({ workCenterId: wc })
      .set(authHeaders(ctx.adminToken));
    expect(baseline.status).toBe(200);
    const baselineRow = baseline.body.find((r: { workCenterId: string }) => r.workCenterId === wc);
    baselineCount = baselineRow.openWorkOrderCount;
    baselineHours = baselineRow.backlogHours;

    // Two separate assets, so each row's fixture cannot move the other's
    // numbers. The hours fixture derives a real planned cost from its crafts,
    // and folding that into the cost ranking would make the ranking assertions
    // depend on the seeded craft rates.
    hoursEquipmentId = await createEquipment('R3HOURS', 'R3 backlog hours probe');
    costEquipmentId = await createEquipment('R3COST', 'R3 cost ranking probe');

    // Row 65's fixture: one work order carrying three operations totalling ten
    // planned hours. Every wrong answer to "backlog hours" is a different
    // number -- one work order, three operations, ten hours -- so a single
    // fixture separates them.
    const hoursWo = await createWorkOrder('r3 backlog hours probe', hoursEquipmentId);
    for (const [sequenceNumber, plannedHours] of [[10, 3.5], [20, 4], [30, 2.5]] as const) {
      const op = await api()
        .post('/api/work-order-operations')
        .set(authHeaders(ctx.adminToken))
        .send({ workOrderId: hoursWo, sequenceNumber, description: 'r3 hours operation', craftId, plannedHours });
      expect(op.status).toBe(201);
    }

    // Row 66's fixture: two work orders on one asset, one with a planned cost
    // only and one with an actual cost, which is the pair the ranking rule has
    // to get right.
    const topWo = await createWorkOrder('r3 top cost planned probe', costEquipmentId, wc2);
    const secondWo = await createWorkOrder('r3 top cost actual probe', costEquipmentId, wc2);
    await prisma.workOrder.update({ where: { workOrderId: topWo }, data: { plannedCost: TOP_PLANNED, actualCost: 0 } });
    await prisma.workOrder.update({
      where: { workOrderId: secondWo },
      data: { plannedCost: SECOND_PLANNED, actualCost: SECOND_ACTUAL },
    });

    // Row 67 needs one notification awaiting conversion and one already
    // converted. The converted one is flipped through Prisma rather than the
    // conversion route so that no work order comes with it: this case is about
    // which notifications the report counts, not about conversion itself.
    for (const priority of ['High', 'Medium'] as const) {
      const n = await api()
        .post('/api/notifications')
        .set(authHeaders(ctx.operatorToken))
        .send({ type: 'M1', priority, description: `r3 awaiting conversion ${priority}`, equipmentId: hoursEquipmentId, reportedByUserId: ctx.operatorId });
      expect(n.status, `create notification ${priority}`).toBe(201);
      notificationIds.push(n.body.notificationId);
    }
    await prisma.notification.update({ where: { notificationId: notificationIds[1] }, data: { status: 'Converted' } });
  });

  afterAll(async () => {
    // Work orders first: they hold the operations, and an operation's craft is
    // seeded rather than owned here. Notifications after, because the
    // unattributed work order in row 66 is the last thing added to workOrderIds.
    await purgeWorkOrders(workOrderIds);
    await purgeNotifications(notificationIds);
    // No purgeEquipment helper exists, so these fixtures are collected directly.
    // Their audit rows go with them: an equipment create writes one, and leaving
    // it behind is exactly the kind of residue the gate catches. The purge is
    // ordered audit-then-row because the audit row is keyed by recordId and
    // would otherwise outlive the asset it describes.
    await purgeAudit(equipmentIds);
    await prisma.equipment.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
  });

  const centreRow = async () => {
    const res = await api()
      .get('/api/reports/backlog-hours-by-work-center')
      .query({ workCenterId: wc })
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    return res.body.find((r: { workCenterId: string }) => r.workCenterId === wc);
  };

  describe('row 65 - backlog hours by work centre', () => {
    it('sums planned hours rather than counting work orders or operations', async () => {
      const row = await centreRow();
      // The fixture is one work order carrying three operations of 3.5, 4 and
      // 2.5 hours. Counting work orders would answer 1, counting operations 3,
      // and summing planned hours answers 10. All three are asserted, because a
      // test that only checked the hours would still pass against a count.
      expect(row.backlogHours - baselineHours).toBeCloseTo(10, 5);
      expect(row.openWorkOrderCount - baselineCount).toBe(1);
      expect(row.backlogHours).not.toBeCloseTo(row.openWorkOrderCount, 5);
    });

    it('counts a multi-operation work order once', async () => {
      const row = await centreRow();
      // Three operations on one work order. A count of three here would mean the
      // report was counting operations and calling them work orders, and the
      // hours would then be the count rather than a sum.
      const operations = await prisma.workOrderOperation.count({
        where: { workOrderId: workOrderIds[0], isDeleted: false },
      });
      expect(operations).toBe(3);
      expect(row.openWorkOrderCount - baselineCount).toBe(1);
      expect(row.backlogHours - baselineHours).toBeCloseTo(10, 5);
    });

    it('lists every work centre, including ones with nothing open', async () => {
      const res = await api().get('/api/reports/backlog-hours-by-work-center').set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const row of res.body) {
        expect(row).toHaveProperty('backlogHours');
        expect(row).toHaveProperty('openWorkOrderCount');
        expect(typeof row.backlogHours).toBe('number');
      }
      // Every non-deleted centre appears. A centre absent from the report and a
      // centre with an empty backlog are different facts, and a capacity plan
      // that cannot tell them apart reads the missing row as spare capacity.
      const centres = await prisma.workCenter.count({ where: { isDeleted: false } });
      expect(res.body.length).toBe(centres);
      expect(res.body.map((r: { workCenterId: string }) => r.workCenterId).sort()).toContain(wc);
    });

    it('narrows to a single work centre when the filter names one', async () => {
      const res = await api()
        .get('/api/reports/backlog-hours-by-work-center')
        .query({ workCenterId: wc })
        .set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].workCenterId).toBe(wc);
    });
  });

  describe('row 66 - top 10 highest-cost equipment', () => {
    const costRow = async () => {
      const res = await api().get('/api/reports/top-cost-equipment').set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      const row = res.body.find((r: { equipmentId: string }) => r.equipmentId === costEquipmentId);
      expect(row, 'the fixture asset appears in the ranking').toBeDefined();
      return { body: res.body, row };
    };

    it('ranks the fixture asset on its committed cost', async () => {
      const { row } = await costRow();
      // One work order contributes its planned cost while it has no actual cost;
      // the other contributes its actual cost. Nothing else is on this asset.
      expect(row.totalCost).toBeCloseTo(TOP_PLANNED + SECOND_ACTUAL, 2);
      expect(row.plannedCost).toBeCloseTo(TOP_PLANNED + SECOND_PLANNED, 2);
      expect(row.actualCost).toBeCloseTo(SECOND_ACTUAL, 2);
      expect(row.workOrderCount).toBe(2);
    });

    it('does not double-count a work order that has both planned and actual cost', async () => {
      const { row } = await costRow();
      // planned + actual would be TOP_PLANNED + SECOND_PLANNED + SECOND_ACTUAL.
      // The report counts the second work order at its actual cost only, so the
      // money reserved for it is not also counted as money spent.
      expect(row.totalCost).not.toBeCloseTo(TOP_PLANNED + SECOND_PLANNED + SECOND_ACTUAL, 2);
      expect(row.totalCost).toBeCloseTo(TOP_PLANNED + SECOND_ACTUAL, 2);
    });

    it('puts the most expensive asset at the top', async () => {
      const { body } = await costRow();
      expect(body[0].equipmentId).toBe(costEquipmentId);
    });

    it('returns at most ten rows, ordered most expensive first', async () => {
      const { body } = await costRow();
      expect(body.length).toBeLessThanOrEqual(10);
      const costs = body.map((r: { totalCost: number }) => r.totalCost);
      const sorted = [...costs].sort((a: number, b: number) => b - a);
      expect(costs).toEqual(sorted);
    });

    it('names every row, so a ranked list is not a list of opaque ids', async () => {
      const { body } = await costRow();
      for (const row of body) {
        expect(row.equipmentId).toBeTruthy();
        expect(row.equipmentCode).toBeTruthy();
        expect(row.equipmentName).toBeTruthy();
      }
    });

    it('excludes work orders with no equipment from the asset ranking', async () => {
      const unattributed = await createWorkOrder('r3 unattributed cost probe', null, wc2);
      await prisma.workOrder.update({ where: { workOrderId: unattributed }, data: { plannedCost: 5_000_000, actualCost: 0 } });
      const res = await api().get('/api/reports/top-cost-equipment').set(authHeaders(ctx.adminToken));
      // A cost that large would take the top slot if it were counted. It is not,
      // because there is no asset for a planner to act on.
      const top = res.body[0];
      expect(top.totalCost).not.toBeCloseTo(5_000_000, 2);
      expect(top.equipmentId).toBe(costEquipmentId);
    });
  });

  describe('row 67 - notifications awaiting conversion', () => {
    it('counts notifications not yet converted, and excludes converted ones', async () => {
      const res = await api()
        .get('/api/reports/notifications-awaiting-conversion')
        .query({ equipmentId: hoursEquipmentId })
        .set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      // Two were raised; one was flipped to Converted, so one is still awaiting.
      expect(res.body.total).toBe(1);
      expect(res.body.byPriority).toEqual([{ priority: 'High', count: 1 }]);
    });

    it('excludes completed notifications too', async () => {
      await prisma.notification.update({ where: { notificationId: notificationIds[1] }, data: { status: 'Completed' } });
      const res = await api()
        .get('/api/reports/notifications-awaiting-conversion')
        .query({ equipmentId: hoursEquipmentId })
        .set(authHeaders(ctx.adminToken));
      expect(res.body.total).toBe(1);
    });

    it('reports the age of the oldest notification still awaiting conversion', async () => {
      const res = await api()
        .get('/api/reports/notifications-awaiting-conversion')
        .query({ equipmentId: hoursEquipmentId })
        .set(authHeaders(ctx.adminToken));
      expect(res.body.oldestAgeDays).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(res.body.oldestAgeDays)).toBe(true);
    });

    it('answers with nulls rather than a failure when nothing is awaiting conversion', async () => {
      await prisma.notification.update({ where: { notificationId: notificationIds[0] }, data: { status: 'Completed' } });
      const res = await api()
        .get('/api/reports/notifications-awaiting-conversion')
        .query({ equipmentId: hoursEquipmentId })
        .set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.byPriority).toEqual([]);
      expect(res.body.oldestAgeDays).toBeNull();
    });
  });
});
