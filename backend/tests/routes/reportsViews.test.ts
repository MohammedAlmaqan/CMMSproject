import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeNotifications, purgeAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

/**
 * R.6 / SOW 5.2. Agreement between the SQL view layer and the reports it
 * mirrors.
 *
 * The views exist so the Client's BI tool can read the plant without going
 * through /api/reports. That only holds if a view and the report answer the same
 * question the same way, so this file queries both and compares the figures. The
 * complementary test -- view against an independent recompute from the base
 * tables, on the live seeded database -- is scripts/r6-view-differential.ts.
 *
 * Reports that accept an equipment filter are compared on the fixture's own
 * equipment, so the assertion is isolated from other files. Reports that group
 * globally are read once from each side in the same Promise.all, so the two
 * answers are taken at the same instant.
 */

const EXPECTED_VIEWS = [
  'report_functional_location',
  'report_equipment',
  'report_work_center',
  'report_craft',
  'report_work_order',
  'report_work_order_operation',
  'report_material_consumption',
  'report_notification',
  'report_maintenance_plan',
  'report_pm_occurrence',
  'report_backlog',
  'report_backlog_hours_by_work_center',
  'report_cost_by_cost_center',
  'report_cost_by_location',
  'report_downtime_by_equipment',
  'report_mttr_by_equipment',
  'report_mttr_by_location',
  'report_mtbf_by_equipment',
  'report_material_consumption_by_material',
  'report_material_consumption_by_work_order',
  'report_material_consumption_by_equipment',
  'report_top_cost_equipment',
  'report_notifications_awaiting_conversion',
];

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('report views', () => {
  const stamp = Date.now().toString(36);

  let leaf = '';
  let wc = '';
  let craftId = '';
  let materialId = '';

  let eqBacklog = '';
  let eqEm = '';

  let woOpen = '';
  let woEm = '';
  let notificationId = '';

  const equipmentIds: string[] = [];
  const workOrderIds: string[] = [];

  const createEquipment = async (code: string, name: string): Promise<string> => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode: code, name, description: 'fixture for report views', functionalLocationId: leaf, criticality: 'C' });
    expect(res.status, `create equipment ${code}`).toBe(201);
    equipmentIds.push(res.body.equipmentId);
    return res.body.equipmentId as string;
  };

  const createWorkOrder = async (description: string, equipment: string, type = 'CM', priority = 'Medium'): Promise<string> => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.adminToken))
      .send({ type, priority, description, functionalLocationId: leaf, equipmentId: equipment, workCenterId: wc, supervisorUserId: ctx.adminId });
    expect(res.status, `create work order "${description}"`).toBe(201);
    workOrderIds.push(res.body.workOrderId);
    return res.body.workOrderId as string;
  };

  beforeAll(async () => {
    const [wcs, materials] = await Promise.all([
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
      api().get('/api/materials').set(authHeaders(ctx.adminToken)),
    ]);
    wc = wcs.body[0].workCenterId;
    materialId = materials.body[0].materialId;

    const leafRow = await prisma.functionalLocation.findFirst({
      where: { isDeleted: false, children: { none: { isDeleted: false } } },
      select: { functionalLocationId: true },
      orderBy: { functionalLocationId: 'asc' },
    });
    if (!leafRow) throw new Error('no lowest-level functional location in the seed; report view tests cannot run');
    leaf = leafRow.functionalLocationId;

    const craft = await prisma.craft.findFirst({ where: { workCenterId: wc, isDeleted: false }, select: { craftId: true } });
    if (!craft) throw new Error('no craft in the seed work centre; report view tests cannot run');
    craftId = craft.craftId;

    eqBacklog = await createEquipment(`R6VB${stamp}`, 'R6 views backlog probe');
    eqEm = await createEquipment(`R6VE${stamp}`, 'R6 views breakdown probe');

    // One open work order carrying planned labour and a material issue.
    woOpen = await createWorkOrder(`r6 views open probe ${stamp}`, eqBacklog, 'CM', 'High');
    await prisma.workOrderOperation.create({
      data: { workOrderId: woOpen, sequenceNumber: 1, description: 'r6 views op', craftId, plannedHours: 7.5 },
    });
    await prisma.workOrderMaterial.create({
      data: { workOrderId: woOpen, materialId, plannedQuantity: 2, actualQuantity: 2, unitCost: 10 },
    });
    // A large stored cost so the ranking report has something deterministic to
    // put beside the view.
    await prisma.workOrder.update({ where: { workOrderId: woOpen }, data: { plannedCost: 999_999 } });

    // One complete breakdown, three hours long.
    woEm = await createWorkOrder(`r6 views breakdown probe ${stamp}`, eqEm, 'EM');
    await prisma.workOrder.update({
      where: { workOrderId: woEm },
      data: { actualStart: new Date('2026-06-01T00:00:00.000Z'), actualFinish: new Date('2026-06-01T03:00:00.000Z') },
    });

    const notification = await prisma.notification.create({
      data: {
        notificationNumber: `R6N${stamp}`,
        type: 'M1',
        priority: 'High',
        functionalLocationId: leaf,
        equipmentId: eqBacklog,
        reportedByUserId: ctx.adminId,
        description: `r6 views awaiting conversion ${stamp}`,
      },
    });
    notificationId = notification.notificationId;
  });

  afterAll(async () => {
    await purgeWorkOrders(workOrderIds);
    await purgeNotifications([notificationId]);
    await purgeAudit(equipmentIds);
    await prisma.equipment.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
  });

  it('creates every expected view', async () => {
    const rows = await prisma.$queryRaw<Array<{ viewname: string }>>`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'`;
    const present = new Set(rows.map((r) => r.viewname));
    for (const name of EXPECTED_VIEWS) {
      expect(present.has(name), `view ${name}`).toBe(true);
    }
  });

  it('agrees with /backlog on the open count and planned hours', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/backlog').set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ dimension: string; open_count: number; planned_hours: unknown }>>`
        SELECT dimension, open_count, planned_hours FROM report_backlog`,
    ]);
    expect(res.status).toBe(200);
    const apiCount = sum((res.body.byStatus as Array<{ count: number }>).map((r) => r.count));
    const apiHours = sum((res.body.byStatus as Array<{ totalPlannedHours: number }>).map((r) => r.totalPlannedHours));
    const viewCount = sum(view.filter((r) => r.dimension === 'status').map((r) => Number(r.open_count)));
    const viewHours = sum(view.filter((r) => r.dimension === 'status').map((r) => Number(r.planned_hours)));
    expect(viewCount).toBe(apiCount);
    expect(viewHours).toBeCloseTo(apiHours, 6);
  });

  it('agrees with /backlog-hours-by-work-center for the fixture centre', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/backlog-hours-by-work-center').set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ work_center_id: string; open_work_order_count: number; backlog_hours: unknown }>>`
        SELECT work_center_id, open_work_order_count, backlog_hours FROM report_backlog_hours_by_work_center`,
    ]);
    expect(res.status).toBe(200);
    const apiRow = (res.body as Array<{ workCenterId: string; openWorkOrderCount: number; backlogHours: number }>)
      .find((r) => r.workCenterId === wc);
    const viewRow = view.find((r) => r.work_center_id === wc);
    expect(apiRow, 'API lists the fixture work centre').toBeDefined();
    expect(viewRow, 'the view lists the fixture work centre').toBeDefined();
    expect(Number(viewRow!.open_work_order_count)).toBe(apiRow!.openWorkOrderCount);
    expect(Number(viewRow!.backlog_hours)).toBeCloseTo(apiRow!.backlogHours, 2);
  });

  it('agrees with /mttr and /mtbf for the fixture equipment', async () => {
    const [mttr, mtbf, viewMttr, viewMtbf] = await Promise.all([
      api().get('/api/reports/mttr').query({ equipmentId: eqEm }).set(authHeaders(ctx.adminToken)),
      api().get('/api/reports/mtbf').query({ equipmentId: eqEm }).set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ breakdown_count: number; mttr_hours: unknown }>>`
        SELECT breakdown_count, mttr_hours FROM report_mttr_by_equipment WHERE equipment_id = ${eqEm}`,
      prisma.$queryRaw<Array<{ breakdown_count: number; mtbf_hours: unknown }>>`
        SELECT breakdown_count, mtbf_hours FROM report_mtbf_by_equipment WHERE equipment_id = ${eqEm}`,
    ]);
    expect(mttr.status).toBe(200);
    expect(mtbf.status).toBe(200);

    const apiMttr = (mttr.body.byEquipment as Array<{ equipmentId: string; mttrHours: number; breakdownCount: number }>)
      .find((r) => r.equipmentId === eqEm);
    expect(apiMttr!.breakdownCount).toBe(1);
    expect(apiMttr!.mttrHours).toBeCloseTo(3, 2);
    expect(Number(viewMttr[0].breakdown_count)).toBe(apiMttr!.breakdownCount);
    expect(Number(viewMttr[0].mttr_hours)).toBeCloseTo(apiMttr!.mttrHours, 2);

    const apiMtbf = (mtbf.body as Array<{ equipmentId: string; mtbfHours: number; breakdownCount: number }>)
      .find((r) => r.equipmentId === eqEm);
    expect(Number(viewMtbf[0].breakdown_count)).toBe(apiMtbf!.breakdownCount);
    expect(Number(viewMtbf[0].mtbf_hours)).toBeCloseTo(apiMtbf!.mtbfHours, 2);
  });

  it('agrees with /downtime for the fixture equipment', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/downtime').query({ equipmentId: eqEm }).set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ work_order_count: number; downtime_hours: unknown }>>`
        SELECT work_order_count, downtime_hours FROM report_downtime_by_equipment WHERE equipment_id = ${eqEm}`,
    ]);
    expect(res.status).toBe(200);
    const apiRow = (res.body as Array<{ equipmentId: string; totalDowntimeHours: number; workOrderCount: number }>)
      .find((r) => r.equipmentId === eqEm);
    expect(apiRow!.workOrderCount).toBe(1);
    expect(Number(view[0].work_order_count)).toBe(apiRow!.workOrderCount);
    expect(Number(view[0].downtime_hours)).toBeCloseTo(apiRow!.totalDowntimeHours, 2);
  });

  it('agrees with /material-consumption on the total cost', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/material-consumption').set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ total_cost: unknown }>>`
        SELECT total_cost FROM report_material_consumption_by_material`,
    ]);
    expect(res.status).toBe(200);
    const apiCost = sum((res.body.byMaterial as Array<{ totalCost: number }>).map((r) => r.totalCost));
    const viewCost = sum(view.map((r) => Number(r.total_cost)));
    expect(viewCost).toBeCloseTo(apiCost, 2);
  });

  it('agrees with /top-cost-equipment on the costliest asset', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/top-cost-equipment').set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ equipment_id: string; planned_cost: unknown }>>`
        SELECT equipment_id, planned_cost FROM report_top_cost_equipment`,
    ]);
    expect(res.status).toBe(200);
    const apiTop = (res.body as Array<{ equipmentId: string; plannedCost: number }>)[0];
    expect(apiTop, 'the API ranks at least one asset').toBeDefined();
    expect(view[0].equipment_id).toBe(apiTop.equipmentId);
    expect(Number(view[0].planned_cost)).toBeCloseTo(apiTop.plannedCost, 2);
  });

  it('agrees with /notifications-awaiting-conversion on the total', async () => {
    const [res, view] = await Promise.all([
      api().get('/api/reports/notifications-awaiting-conversion').set(authHeaders(ctx.adminToken)),
      prisma.$queryRaw<Array<{ notification_count: number }>>`
        SELECT notification_count FROM report_notifications_awaiting_conversion`,
    ]);
    expect(res.status).toBe(200);
    const viewTotal = sum(view.map((r) => Number(r.notification_count)));
    expect(viewTotal).toBe(res.body.total as number);
  });
});
