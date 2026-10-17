#!/usr/bin/env node
/**
 * One-off demo-data purge, authorised 2026-10-17.
 *
 * Removes the pre-cutover demo/fixture cluster from the live database and leaves
 * the Client dataset (loaded by `migration-trial/cutover.ts`) untouched. The
 * cluster is identified by the natural keys `seed.ts` and the fixture/gate
 * scripts use, never by date: the cutover preserved the Client's original
 * `createdDate`s, so dates do not separate demo from Client rows.
 *
 * Deletes, by identifier:
 *  - FunctionalLocation  PL-01 AR-001 AR-002 UN-001 UN-002 SU-001
 *  - Equipment           P-1001 M-1002 V-1003 C-1004 B-1005 (+ meters/readings)
 *  - Material            MECH-SEAL-001 BEARING-6205 LUBE-OIL-ISO68 GASKET-150 VALVE-GATE-2
 *  - WorkOrder           woNumber not all-digits (9 fixture/gate orders, + ops/snapshots)
 *  - Notification        notificationNumber not all-digits (N-000264)
 *  - WorkCenter          MECH ELEC INST
 *  - Craft               FITTER WELDER ELEC_TECH INST_TECH
 *  - TaskList            PM-PUMP-001 PM-MOTOR-001 (+ operations)
 *  - MaintenancePlan     PMG-43-ab16fee1 (scheduler test debris)
 *  - User                planner supervisor tech1 tech2 operator auditor + lockout-*
 *
 * Safety, mirroring `cutover.ts`:
 *  - refuses unless PURGE_ALLOW_DB=1;
 *  - refuses unless the host is localhost;
 *  - refuses if any non-demo row references a demo row (isolation check);
 *  - dry-run by default (the delete transaction runs, then rolls back, so the
 *    reported counts are exact and the FK order is validated without committing);
 *  - applies only with PURGE_APPLY=1, inside one transaction;
 *  - never prints a connection string.
 */
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { envValue, safeHost } from '../src/migration-trial/env.js';

const LOC_CODES = ['PL-01', 'AR-001', 'AR-002', 'UN-001', 'UN-002', 'SU-001'];
const EQ_CODES = ['P-1001', 'M-1002', 'V-1003', 'C-1004', 'B-1005'];
const MAT_CODES = ['MECH-SEAL-001', 'BEARING-6205', 'LUBE-OIL-ISO68', 'GASKET-150', 'VALVE-GATE-2'];
const WC_CODES = ['MECH', 'ELEC', 'INST'];
const CRAFT_CODES = ['FITTER', 'WELDER', 'ELEC_TECH', 'INST_TECH'];
const TL_CODES = ['PM-PUMP-001', 'PM-MOTOR-001'];
const PLAN_CODES = ['PMG-43-ab16fee1'];
const USERNAMES = ['planner', 'supervisor', 'tech1', 'tech2', 'operator', 'auditor'];
const USER_PREFIX = 'lockout-';

/** woNumber / notificationNumber are all-digits for the Client dataset; the demo
 *  rows carry the `WO-`/`N-` prefix, so "not all-digits" is the demo predicate. */
const ALL_DIGITS = /^[0-9]+$/;

function isLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

interface DemoIds {
  locIds: string[];
  eqIds: string[];
  matIds: string[];
  wcIds: string[];
  craftIds: string[];
  taskListIds: string[];
  woIds: string[];
  notifIds: string[];
  planIds: string[];
  userIds: string[];
  meterIds: string[];
  taskListOperationIds: string[];
  operationIds: string[];
  checklistIds: string[];
}

async function collect(client: PrismaClient): Promise<DemoIds> {
  const [locs, eqs, mats, wcs, crafts, taskLists, allWos, allNotifs] = await Promise.all([
    client.functionalLocation.findMany({ where: { locationCode: { in: LOC_CODES } }, select: { functionalLocationId: true } }),
    client.equipment.findMany({ where: { equipmentCode: { in: EQ_CODES } }, select: { equipmentId: true } }),
    client.material.findMany({ where: { materialCode: { in: MAT_CODES } }, select: { materialId: true } }),
    client.workCenter.findMany({ where: { code: { in: WC_CODES } }, select: { workCenterId: true } }),
    client.craft.findMany({ where: { craftCode: { in: CRAFT_CODES } }, select: { craftId: true } }),
    client.taskList.findMany({ where: { code: { in: TL_CODES } }, select: { taskListId: true } }),
    client.workOrder.findMany({ select: { workOrderId: true, woNumber: true } }),
    client.notification.findMany({ select: { notificationId: true, notificationNumber: true } }),
  ]);

  const locIds = locs.map((l) => l.functionalLocationId);
  const eqIds = eqs.map((e) => e.equipmentId);
  const matIds = mats.map((m) => m.materialId);
  const wcIds = wcs.map((w) => w.workCenterId);
  const craftIds = crafts.map((c) => c.craftId);
  const taskListIds = taskLists.map((t) => t.taskListId);
  const woIds = allWos.filter((w) => !ALL_DIGITS.test(w.woNumber)).map((w) => w.workOrderId);
  const notifIds = allNotifs.filter((n) => !ALL_DIGITS.test(n.notificationNumber)).map((n) => n.notificationId);

  const [plans, users, meters, taskListOps, operations, checklists] = await Promise.all([
    client.maintenancePlan.findMany({
      where: { OR: [{ planCode: { in: PLAN_CODES } }, { workCenterId: { in: wcIds } }, { equipmentId: { in: eqIds } }] },
      select: { planId: true },
    }),
    client.user.findMany({
      where: { OR: [{ username: { in: USERNAMES } }, { username: { startsWith: USER_PREFIX } }] },
      select: { userId: true },
    }),
    client.equipmentMeter.findMany({ where: { equipmentId: { in: eqIds } }, select: { meterId: true } }),
    client.taskListOperation.findMany({ where: { taskListId: { in: taskListIds } }, select: { taskOperationId: true } }),
    client.workOrderOperation.findMany({ where: { workOrderId: { in: woIds } }, select: { operationId: true } }),
    client.workOrderChecklist.findMany({ where: { workOrderId: { in: woIds } }, select: { woChecklistId: true } }),
  ]);

  return {
    locIds,
    eqIds,
    matIds,
    wcIds,
    craftIds,
    taskListIds,
    woIds,
    notifIds,
    planIds: plans.map((p) => p.planId),
    userIds: users.map((u) => u.userId),
    meterIds: meters.map((m) => m.meterId),
    taskListOperationIds: taskListOps.map((o) => o.taskOperationId),
    operationIds: operations.map((o) => o.operationId),
    checklistIds: checklists.map((c) => c.woChecklistId),
  };
}

/** Isolation checks: a non-zero count means a Client (or other non-demo) row
 *  points at a demo row, so the purge would corrupt it. Refuse. */
async function isolationFailures(client: PrismaClient, ids: DemoIds): Promise<string[]> {
  const failures: string[] = [];
  const check = async (label: string, p: Promise<number>): Promise<void> => {
    const n = await p;
    if (n > 0) failures.push(`${label}: ${n}`);
  };

  await Promise.all([
    check('client work order -> demo equipment', client.workOrder.count({ where: { workOrderId: { notIn: ids.woIds }, equipmentId: { in: ids.eqIds } } })),
    check('client work order -> demo location', client.workOrder.count({ where: { workOrderId: { notIn: ids.woIds }, functionalLocationId: { in: ids.locIds } } })),
    check('client work order -> demo work centre', client.workOrder.count({ where: { workOrderId: { notIn: ids.woIds }, workCenterId: { in: ids.wcIds } } })),
    check('client notification -> demo equipment', client.notification.count({ where: { notificationId: { notIn: ids.notifIds }, equipmentId: { in: ids.eqIds } } })),
    check('client notification -> demo location', client.notification.count({ where: { notificationId: { notIn: ids.notifIds }, functionalLocationId: { in: ids.locIds } } })),
    check('client equipment -> demo location', client.equipment.count({ where: { equipmentId: { notIn: ids.eqIds }, functionalLocationId: { in: ids.locIds } } })),
    check('equipment BOM -> demo material', client.equipmentBOMMaterial.count({ where: { materialId: { in: ids.matIds } } })),
    check('task list material -> demo material', client.taskListMaterial.count({ where: { materialId: { in: ids.matIds } } })),
    check('work order material -> demo material', client.workOrderMaterial.count({ where: { materialId: { in: ids.matIds } } })),
    check('non-demo location under demo location', client.functionalLocation.count({ where: { parentLocationId: { in: ids.locIds }, locationCode: { notIn: LOC_CODES } } })),
    check('non-demo task list -> demo equipment/work centre', client.taskList.count({ where: { taskListId: { notIn: ids.taskListIds }, OR: [{ equipmentId: { in: ids.eqIds } }, { workCenterId: { in: ids.wcIds } }] } })),
    check('non-demo plan -> demo equipment/work centre', client.maintenancePlan.count({ where: { planId: { notIn: ids.planIds }, OR: [{ equipmentId: { in: ids.eqIds } }, { workCenterId: { in: ids.wcIds } }] } })),
    check('client notification -> demo user (reportedBy)', client.notification.count({ where: { notificationId: { notIn: ids.notifIds }, reportedByUserId: { in: ids.userIds } } })),
    check('client work order -> demo user (supervisor)', client.workOrder.count({ where: { workOrderId: { notIn: ids.woIds }, supervisorUserId: { in: ids.userIds } } })),
    check('client work order -> demo user (reportedBy)', client.workOrder.count({ where: { workOrderId: { notIn: ids.woIds }, reportedByUserId: { in: ids.userIds } } })),
    check('non-demo labor entry -> demo user', client.laborEntry.count({ where: { operationId: { notIn: ids.operationIds }, userId: { in: ids.userIds } } })),
  ]);
  return failures;
}

type Step = { label: string; run: (tx: Prisma.TransactionClient) => Promise<number> };

/** Children first, parents last, so no RESTRICT trips. */
function steps(ids: DemoIds, allDemoIds: string[]): Step[] {
  return [
    { label: 'WorkOrderChecklistItem', run: (tx) => tx.workOrderChecklistItem.deleteMany({ where: { woChecklistId: { in: ids.checklistIds } } }).then((r) => r.count) },
    { label: 'LaborEntry', run: (tx) => tx.laborEntry.deleteMany({ where: { OR: [{ operationId: { in: ids.operationIds } }, { userId: { in: ids.userIds } }] } }).then((r) => r.count) },
    { label: 'WorkOrderSnapshot', run: (tx) => tx.workOrderSnapshot.deleteMany({ where: { OR: [{ workOrderId: { in: ids.woIds } }, { takenByUserId: { in: ids.userIds } }] } }).then((r) => r.count) },
    { label: 'CostSplit', run: (tx) => tx.costSplit.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'ExternalServiceCost', run: (tx) => tx.externalServiceCost.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'WorkOrderMaterial', run: (tx) => tx.workOrderMaterial.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'WorkOrderChecklist', run: (tx) => tx.workOrderChecklist.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'WorkOrderNotifLink', run: (tx) => tx.workOrderNotifLink.deleteMany({ where: { OR: [{ workOrderId: { in: ids.woIds } }, { notificationId: { in: ids.notifIds } }] } }).then((r) => r.count) },
    { label: 'WorkOrderOperation', run: (tx) => tx.workOrderOperation.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'Attachment', run: (tx) => tx.attachment.deleteMany({ where: { entityId: { in: allDemoIds } } }).then((r) => r.count) },
    { label: 'Comment', run: (tx) => tx.comment.deleteMany({ where: { OR: [{ entityId: { in: allDemoIds } }, { userId: { in: ids.userIds } }] } }).then((r) => r.count) },
    { label: 'AuditLogEntry', run: (tx) => tx.auditLogEntry.deleteMany({ where: { OR: [{ recordId: { in: allDemoIds } }, { userId: { in: ids.userIds } }] } }).then((r) => r.count) },
    { label: 'WorkOrder', run: (tx) => tx.workOrder.deleteMany({ where: { workOrderId: { in: ids.woIds } } }).then((r) => r.count) },
    { label: 'Notification', run: (tx) => tx.notification.deleteMany({ where: { notificationId: { in: ids.notifIds } } }).then((r) => r.count) },
    { label: 'MeterReading', run: (tx) => tx.meterReading.deleteMany({ where: { meterId: { in: ids.meterIds } } }).then((r) => r.count) },
    { label: 'MaintenancePlanMeter', run: (tx) => tx.maintenancePlanMeter.deleteMany({ where: { planId: { in: ids.planIds } } }).then((r) => r.count) },
    { label: 'MaintenancePlanTarget', run: (tx) => tx.maintenancePlanTarget.deleteMany({ where: { planId: { in: ids.planIds } } }).then((r) => r.count) },
    { label: 'MaintenancePlan', run: (tx) => tx.maintenancePlan.deleteMany({ where: { planId: { in: ids.planIds } } }).then((r) => r.count) },
    { label: 'TaskListMaterial', run: (tx) => tx.taskListMaterial.deleteMany({ where: { taskOperationId: { in: ids.taskListOperationIds } } }).then((r) => r.count) },
    { label: 'TaskListOperation', run: (tx) => tx.taskListOperation.deleteMany({ where: { taskListId: { in: ids.taskListIds } } }).then((r) => r.count) },
    { label: 'TaskList', run: (tx) => tx.taskList.deleteMany({ where: { taskListId: { in: ids.taskListIds } } }).then((r) => r.count) },
    { label: 'EquipmentBOMMaterial', run: (tx) => tx.equipmentBOMMaterial.deleteMany({ where: { equipmentId: { in: ids.eqIds } } }).then((r) => r.count) },
    { label: 'EquipmentMeter', run: (tx) => tx.equipmentMeter.deleteMany({ where: { equipmentId: { in: ids.eqIds } } }).then((r) => r.count) },
    { label: 'Equipment', run: (tx) => tx.equipment.deleteMany({ where: { equipmentId: { in: ids.eqIds } } }).then((r) => r.count) },
    { label: 'Material', run: (tx) => tx.material.deleteMany({ where: { materialId: { in: ids.matIds } } }).then((r) => r.count) },
    { label: 'FunctionalLocation', run: (tx) => tx.functionalLocation.deleteMany({ where: { functionalLocationId: { in: ids.locIds } } }).then((r) => r.count) },
    { label: 'Craft', run: (tx) => tx.craft.deleteMany({ where: { craftId: { in: ids.craftIds } } }).then((r) => r.count) },
    { label: 'WorkCenter', run: (tx) => tx.workCenter.deleteMany({ where: { workCenterId: { in: ids.wcIds } } }).then((r) => r.count) },
    { label: 'RefreshToken', run: (tx) => tx.refreshToken.deleteMany({ where: { userId: { in: ids.userIds } } }).then((r) => r.count) },
    { label: 'SystemAlert', run: (tx) => tx.systemAlert.deleteMany({ where: { userId: { in: ids.userIds } } }).then((r) => r.count) },
    { label: 'User', run: (tx) => tx.user.deleteMany({ where: { userId: { in: ids.userIds } } }).then((r) => r.count) },
  ];
}

function render(host: string, port: number, mode: string, counts: Record<string, number>): string {
  const lines: string[] = [];
  lines.push(`status: ${mode}`);
  lines.push(`target: ${host}:${port} (public schema)`);
  lines.push('');
  lines.push('| Table | Rows |');
  lines.push('|---|---|');
  let total = 0;
  for (const [table, n] of Object.entries(counts)) {
    lines.push(`| ${table} | ${n} |`);
    total += n;
  }
  lines.push('');
  lines.push(`total: ${total} row(s) ${mode === 'applied (committed)' ? 'deleted' : 'would be deleted'}`);
  lines.push('');
  return lines.join('\n');
}

const ROLLBACK = 'dry-run rollback';

async function run(): Promise<number> {
  process.stdout.write('=== CMMS demo-data purge ===\n');
  if (process.env.PURGE_ALLOW_DB !== '1') {
    process.stdout.write('Refusing to run: this deletes rows from the live database. Re-run with PURGE_ALLOW_DB=1.\n');
    return 1;
  }
  const dbUrl = envValue('DATABASE_URL');
  if (dbUrl === undefined) {
    process.stdout.write('No DATABASE_URL in the environment or backend/.env.\n');
    return 1;
  }
  const { host, port } = safeHost(dbUrl);
  if (!isLocal(host)) {
    process.stdout.write(`Refusing to purge on a non-local host (${host}).\n`);
    return 1;
  }
  const apply = process.env.PURGE_APPLY === '1';

  const client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const ids = await collect(client);
    const allDemoIds = [
      ...ids.locIds, ...ids.eqIds, ...ids.matIds, ...ids.wcIds, ...ids.craftIds,
      ...ids.taskListIds, ...ids.woIds, ...ids.notifIds, ...ids.planIds, ...ids.userIds,
    ];

    process.stdout.write(
      `matched: ${ids.locIds.length} locations, ${ids.eqIds.length} equipment, ${ids.matIds.length} materials, ` +
        `${ids.woIds.length} work orders, ${ids.notifIds.length} notifications, ${ids.wcIds.length} work centres, ` +
        `${ids.craftIds.length} crafts, ${ids.taskListIds.length} task lists, ${ids.planIds.length} plans, ${ids.userIds.length} users\n`,
    );

    const failures = await isolationFailures(client, ids);
    if (failures.length > 0) {
      process.stdout.write('Refusing to run: non-demo rows reference demo rows:\n');
      for (const f of failures) process.stdout.write(`  - ${f}\n`);
      return 1;
    }

    const plan = steps(ids, allDemoIds);
    let counts: Record<string, number> = {};
    const rollback = (): never => {
      const e = new Error(ROLLBACK);
      (e as Error & { counts?: Record<string, number> }).counts = counts;
      throw e;
    };

    try {
      await client.$transaction(
        async (tx) => {
          const c: Record<string, number> = {};
          for (const step of plan) c[step.label] = await step.run(tx);
          counts = c;
          if (!apply) rollback();
        },
        { maxWait: 60_000, timeout: 30 * 60 * 1000 },
      );
    } catch (err) {
      if (err instanceof Error && err.message === ROLLBACK) {
        const report = render(host, port, 'dry-run (rolled back)', counts);
        process.stdout.write(report);
        if (process.env.PURGE_REPORT) await writeFile(process.env.PURGE_REPORT, report, 'utf8');
        return 0;
      }
      throw err;
    }

    const report = render(host, port, 'applied (committed)', counts);
    process.stdout.write(report);
    if (process.env.PURGE_REPORT) await writeFile(process.env.PURGE_REPORT, report, 'utf8');
    return 0;
  } finally {
    await client.$disconnect();
  }
}

run()
  .catch((e) => {
    process.stderr.write(`purge failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  })
  .then((code) => process.exit(code));
