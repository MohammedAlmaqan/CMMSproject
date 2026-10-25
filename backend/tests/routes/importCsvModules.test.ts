import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api,
  authHeaders,
  ctx,
  purgeCauseCodes,
  purgeFailureCodes,
  purgeSafetyChecklistTemplates,
  purgeWorkCenters,
} from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

/**
 * F7: the six CSV modules added in v1.6.6 plus the two export-only registers.
 *
 * Every import goes through the same factory, so the shared contract - the role
 * floor, header matching, strict rollback, ?dryRun=1 and the { created, updated,
 * rejected } shape - is asserted once per module rather than trusted by
 * inspection. The module-specific cases are where the earlier behaviour could
 * have regressed: a craft rate re-costing live work orders, a checklist item
 * being updated in place without deleting its siblings, a failure-code child
 * appearing before its parent, and a plan import never touching an existing
 * plan's targets.
 *
 * Codes are stamped per run, so a run whose teardown failed cannot collide with
 * the next one, and every fixture hangs off a work centre the teardown owns.
 */
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const wcCode = `IEWC${stamp}`;
const wcCraftCode = `IEWC${stamp}C`;
const wcTaskCode = `IEWC${stamp}T`;
const wcPlanCode = `IEWC${stamp}P`;
const craftCode = `IECR${stamp}`;
const craftRateCode = `IECR${stamp}R`;
const taskListCode = `IETL${stamp}`;
const planTaskListCode = `IETL${stamp}P`;
const checklistName = `IESC${stamp}`;
const causeCode = `IECA${stamp}`;
const failureCode = `IEFC${stamp}`;
const planCode = `IEPL${stamp}`;

const WC_HEADER = ['code', 'name', 'dailyCapacityHours', 'costRatePerHour', 'isActive'];
const CRAFT_HEADER = ['workCenterCode', 'craftCode', 'description', 'hourlyRate'];
const TL_HEADER = ['code', 'description', 'equipmentClass', 'equipmentCode', 'workCenterCode'];
const SC_HEADER = ['templateName', 'templateDescription', 'isMandatory', 'sequenceNumber', 'itemDescription'];
const CC_HEADER = ['code', 'description'];
const FC_HEADER = ['code', 'description', 'parentCode'];
const PLAN_HEADER = [
  'planCode',
  'description',
  'workCenterCode',
  'taskListCode',
  'strategyType',
  'intervalValue',
  'intervalUnit',
  'callHorizonValue',
  'callHorizonUnit',
  'startDate',
  'endDate',
  'priority',
  'generatedWorkOrderStatus',
  'equipmentCode',
  'functionalLocationCode',
  'notificationNumber',
  'activeFlag',
];
const NOTIFICATION_HEADER = [
  'notificationNumber',
  'type',
  'priority',
  'status',
  'description',
  'damagesObservations',
  'breakdownFlag',
  'functionalLocationCode',
  'equipmentCode',
  'reportedByUsername',
  'createdDate',
  'modifiedDate',
];
const USER_HEADER = [
  'username',
  'fullName',
  'email',
  'role',
  'workCenterCode',
  'isActive',
  'lastLogin',
  'createdDate',
];

function csvBuffer(header: string[], rows: Array<Array<string | number>>): Buffer {
  return Buffer.from([header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n', 'utf8');
}

async function sendCsv(
  path: string,
  header: string[],
  rows: Array<Array<string | number>>,
  token = ctx.plannerToken,
  query = '',
) {
  return api()
    .post(`${path}${query}`)
    .set(authHeaders(token))
    .attach('file', csvBuffer(header, rows), 'data.csv');
}

async function exportCsv(path: string, token = ctx.plannerToken) {
  return api().get(path).set(authHeaders(token));
}

function headerOf(res: { text: string }): string {
  return res.text.split(/\r?\n/)[0];
}

function rowStartingWith(res: { text: string }, prefix: string): string | undefined {
  return res.text.split(/\r?\n/).find((line) => line.startsWith(`${prefix},`));
}

/** A work centre is the anchor every other fixture is cleaned up through. */
async function importWorkCenter(code: string): Promise<string> {
  const res = await sendCsv('/api/work-centers/import.csv', WC_HEADER, [
    [code, `Work centre ${code}`, '8', '20', 'true'],
  ]);
  expect(res.status).toBe(200);
  const row = await prisma.workCenter.findFirstOrThrow({ where: { code, isDeleted: false } });
  return row.workCenterId;
}

describe('CSV modules (F7)', () => {
  afterAll(async () => {
    // One teardown for everything that hangs off a work centre: crafts, task
    // lists, plans and the work order the rate test creates all cascade from it.
    const centers = await prisma.workCenter.findMany({
      where: { code: { startsWith: `IEWC${stamp}` } },
      select: { workCenterId: true },
    });
    await purgeWorkCenters(centers.map((c) => c.workCenterId));

    const templates = await prisma.safetyChecklistTemplate.findMany({
      where: { name: { startsWith: `IESC${stamp}` } },
      select: { checklistTemplateId: true },
    });
    await purgeSafetyChecklistTemplates(templates.map((t) => t.checklistTemplateId));

    const causes = await prisma.causeCode.findMany({
      where: { code: { startsWith: `IECA${stamp}` } },
      select: { causeCodeId: true },
    });
    await purgeCauseCodes(causes.map((c) => c.causeCodeId));

    const failures = await prisma.failureCode.findMany({
      where: { code: { startsWith: `IEFC${stamp}` } },
      select: { failureCodeId: true },
    });
    await purgeFailureCodes(failures.map((f) => f.failureCodeId));
  });

  describe('the shared import contract', () => {
    const paths = [
      '/api/work-centers/import.csv',
      '/api/crafts/import.csv',
      '/api/task-lists/import.csv',
      '/api/safety-checklists/import.csv',
      '/api/cause-codes/import.csv',
      '/api/failure-codes/import.csv',
      '/api/maintenance-plans/import.csv',
    ];

    it('requires a token on every new import and export', async () => {
      for (const path of paths) {
        expect((await api().post(path)).status).toBe(401);
        expect((await api().get(path.replace('/import.csv', '/export.csv'))).status).toBe(401);
      }
    });

    it('refuses every new import below Maintenance Planner with 403', async () => {
      for (const path of paths) {
        const res = await sendCsv(path, ['nothing'], [['x']], ctx.technicianToken);
        expect(res.status).toBe(403);
      }
      // Supervisors are below Planner too, so they are excluded as well.
      const supervisor = await sendCsv(paths[0], ['nothing'], [['x']], ctx.supervisorToken);
      expect(supervisor.status).toBe(403);
    });
  });

  describe('work centers', () => {
    it('creates a work center, then updates it in place on a re-import', async () => {
      const created = await sendCsv('/api/work-centers/import.csv', WC_HEADER, [
        [wcCode, 'Imported work centre', '8', '25.50', 'true'],
      ]);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const updated = await sendCsv('/api/work-centers/import.csv', WC_HEADER, [
        [wcCode, 'Imported work centre v2', '7.5', '30', 'false'],
      ]);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const stored = await prisma.workCenter.findMany({ where: { code: wcCode, isDeleted: false } });
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Imported work centre v2');
      expect(Number(stored[0].dailyCapacityHours)).toBe(7.5);
      expect(Number(stored[0].costRatePerHour)).toBe(30);
      expect(stored[0].isActive).toBe(false);
    });

    it('rolls the whole file back when a cell is not a number', async () => {
      const good = `${wcCode}-ROLLBACK-OK`;
      const bad = `${wcCode}-ROLLBACK-BAD`;
      const res = await sendCsv('/api/work-centers/import.csv', WC_HEADER, [
        [good, 'Good row', '8', '20', 'true'],
        [bad, 'Bad row', 'not-a-number', '20', 'true'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dailyCapacityHours');
      expect(await prisma.workCenter.count({ where: { code: { in: [good, bad] } } })).toBe(0);
    });

    it('reports what it would do without writing on a dry run', async () => {
      const dry = `${wcCode}-DRY`;
      const res = await sendCsv('/api/work-centers/import.csv', WC_HEADER, [
        [dry, 'Dry run centre', '8', '20', 'true'],
      ], ctx.plannerToken, '?dryRun=1');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 1, updated: 0, rejected: [] });
      expect(await prisma.workCenter.count({ where: { code: dry } })).toBe(0);
    });

    it('exports the declared header and a row the import accepts back', async () => {
      const res = await exportCsv('/api/work-centers/export.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(headerOf(res)).toBe(WC_HEADER.join(','));

      const row = rowStartingWith(res, wcCode);
      expect(row).toBeDefined();
      const cells = row!.split(',');
      expect(cells[1]).toBe('Imported work centre v2');
      // The two spellings the import accepts, not "false"/"1".
      expect(cells[4]).toBe('false');
    });
  });

  describe('crafts', () => {
    let anchor = '';

    beforeAll(async () => {
      anchor = await importWorkCenter(wcCraftCode);
    });

    it('creates a craft keyed by work-center code plus craft code, then updates it', async () => {
      const created = await sendCsv('/api/crafts/import.csv', CRAFT_HEADER, [
        [wcCraftCode, craftCode, 'Imported craft', '18.25'],
      ]);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const updated = await sendCsv('/api/crafts/import.csv', CRAFT_HEADER, [
        [wcCraftCode, craftCode, 'Imported craft v2', '19'],
      ]);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const stored = await prisma.craft.findMany({
        where: { workCenterId: anchor, craftCode, isDeleted: false },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].description).toBe('Imported craft v2');
      expect(Number(stored[0].hourlyRate)).toBe(19);
    });

    it('rolls a good row back when another row names an unknown work center', async () => {
      const good = `${craftCode}-OK`;
      const res = await sendCsv('/api/crafts/import.csv', CRAFT_HEADER, [
        [wcCraftCode, good, 'Good craft', '10'],
        ['NO-SUCH-WC', `${craftCode}-BAD`, 'Orphan craft', '10'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("unknown workCenterCode 'NO-SUCH-WC'");
      expect(await prisma.craft.count({ where: { craftCode: { in: [good, `${craftCode}-BAD`] } } })).toBe(0);
    });

    it('re-costs a live work order when the imported rate changes', async () => {
      const made = await sendCsv('/api/crafts/import.csv', CRAFT_HEADER, [
        [wcCraftCode, craftRateCode, 'Rate craft', '10'],
      ]);
      expect(made.status).toBe(200);
      const craft = await prisma.craft.findFirstOrThrow({
        where: { workCenterId: anchor, craftCode: craftRateCode, isDeleted: false },
      });

      const locations = await api().get('/api/functional-locations').set(authHeaders(ctx.adminToken));
      const workOrder = await api().post('/api/work-orders').set(authHeaders(ctx.adminToken)).send({
        type: 'CM',
        priority: 'Medium',
        description: `craft rate probe ${stamp}`,
        functionalLocationId: locations.body.data[0].functionalLocationId,
        workCenterId: anchor,
        supervisorUserId: ctx.adminId,
      });
      expect(workOrder.status).toBe(201);

      const operation = await api()
        .post('/api/work-order-operations')
        .set(authHeaders(ctx.technicianToken))
        .send({
          workOrderId: workOrder.body.workOrderId,
          sequenceNumber: 10,
          description: 'rate probe',
          craftId: craft.craftId,
          plannedHours: 2,
        });
      expect(operation.status).toBe(201);

      const before = await prisma.workOrder.findUniqueOrThrow({
        where: { workOrderId: workOrder.body.workOrderId },
      });
      expect(Number(before.plannedCost)).toBe(20);

      const raised = await sendCsv('/api/crafts/import.csv', CRAFT_HEADER, [
        [wcCraftCode, craftRateCode, 'Rate craft', '15'],
      ]);
      expect(raised.status).toBe(200);

      // Same transaction as the rate write (R.10), so the derivation cannot
      // commit apart from the edit that invalidated it.
      const after = await prisma.workOrder.findUniqueOrThrow({
        where: { workOrderId: workOrder.body.workOrderId },
      });
      expect(Number(after.plannedCost)).toBe(30);
    });

    it('exports the work center by code', async () => {
      const res = await exportCsv('/api/crafts/export.csv');
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(CRAFT_HEADER.join(','));
      const row = rowStartingWith(res, wcCraftCode);
      expect(row).toBeDefined();
      expect(row!.split(',')[1]).toBe(craftCode);
    });
  });

  describe('task lists', () => {
    let anchor = '';

    beforeAll(async () => {
      anchor = await importWorkCenter(wcTaskCode);
    });

    it('creates a header, then updates it without clearing the equipment on a blank cell', async () => {
      const created = await sendCsv('/api/task-lists/import.csv', TL_HEADER, [
        [taskListCode, 'Imported task list', 'Pump', 'P-1001', wcTaskCode],
      ]);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const stored = await prisma.taskList.findFirstOrThrow({
        where: { code: taskListCode, isDeleted: false },
      });
      expect(stored.equipmentId).not.toBeNull();

      const updated = await sendCsv('/api/task-lists/import.csv', TL_HEADER, [
        [taskListCode, 'Imported task list v2', 'Pump', '', wcTaskCode],
      ]);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const after = await prisma.taskList.findFirstOrThrow({
        where: { code: taskListCode, isDeleted: false },
      });
      expect(after.description).toBe('Imported task list v2');
      // A blank cell means "not supplied", not "clear it".
      expect(after.equipmentId).toBe(stored.equipmentId);
      expect(after.workCenterId).toBe(anchor);
    });

    it('rejects an unknown work center with a 400 and a rollback', async () => {
      const code = `${taskListCode}-BAD`;
      const res = await sendCsv('/api/task-lists/import.csv', TL_HEADER, [
        [code, 'Orphan task list', '', '', 'NO-SUCH-WC'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("unknown workCenterCode 'NO-SUCH-WC'");
      expect(await prisma.taskList.count({ where: { code } })).toBe(0);
    });

    it('rejects an unknown equipment code', async () => {
      const code = `${taskListCode}-EQ`;
      const res = await sendCsv('/api/task-lists/import.csv', TL_HEADER, [
        [code, 'Orphan equipment', '', 'NO-SUCH-EQ', wcTaskCode],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("unknown equipmentCode 'NO-SUCH-EQ'");
      expect(await prisma.taskList.count({ where: { code } })).toBe(0);
    });

    it('exports the header by code and leaves operations out', async () => {
      const res = await exportCsv('/api/task-lists/export.csv');
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(TL_HEADER.join(','));
      const row = rowStartingWith(res, taskListCode);
      expect(row).toBeDefined();
      const cells = row!.split(',');
      expect(cells[3]).toBe('P-1001');
      expect(cells[4]).toBe(wcTaskCode);
    });
  });

  describe('safety checklists', () => {
    it('creates a template and its items, then updates an item in place', async () => {
      const created = await sendCsv('/api/safety-checklists/import.csv', SC_HEADER, [
        [checklistName, 'Imported checklist', 'true', '10', 'Wear gloves'],
        [checklistName, 'Imported checklist', 'true', '20', 'Lock out'],
      ]);
      expect(created.status).toBe(200);
      // One template plus two items.
      expect(created.body).toMatchObject({ created: 3, updated: 0, rejected: [] });

      const template = await prisma.safetyChecklistTemplate.findFirstOrThrow({
        where: { name: checklistName, isDeleted: false },
      });
      expect(template.isMandatory).toBe(true);

      const updated = await sendCsv('/api/safety-checklists/import.csv', SC_HEADER, [
        [checklistName, 'Imported checklist', 'true', '10', 'Wear heavy gloves'],
      ]);
      expect(updated.status).toBe(200);

      const items = await prisma.checklistItem.findMany({
        where: { checklistTemplateId: template.checklistTemplateId, isDeleted: false },
        orderBy: { sequenceNumber: 'asc' },
      });
      // Item 10 changed; item 20 was not in the file and was not deleted.
      expect(items).toHaveLength(2);
      expect(items[0].description).toBe('Wear heavy gloves');
      expect(items[1].description).toBe('Lock out');
    });

    it('refuses a row that names an item by only half of its pair', async () => {
      const res = await sendCsv('/api/safety-checklists/import.csv', SC_HEADER, [
        [`${checklistName}-BAD`, 'Bad checklist', 'false', '10', ''],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('itemDescription');
      expect(
        await prisma.safetyChecklistTemplate.count({ where: { name: `${checklistName}-BAD` } })
      ).toBe(0);
    });

    it('round-trips a template that has no items yet', async () => {
      const name = `${checklistName}E`;
      const created = await sendCsv('/api/safety-checklists/import.csv', SC_HEADER, [
        [name, 'Empty checklist', 'false', '', ''],
      ]);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const res = await exportCsv('/api/safety-checklists/export.csv');
      expect(headerOf(res)).toBe(SC_HEADER.join(','));
      const row = rowStartingWith(res, name);
      expect(row).toBeDefined();
      const cells = row!.split(',');
      expect(cells[3]).toBe('');
      expect(cells[4]).toBe('');
    });
  });

  describe('cause codes', () => {
    it('creates a code and updates it in place', async () => {
      const created = await sendCsv('/api/cause-codes/import.csv', CC_HEADER, [
        [causeCode, 'Imported cause'],
      ]);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const updated = await sendCsv('/api/cause-codes/import.csv', CC_HEADER, [
        [causeCode, 'Imported cause v2'],
      ]);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const stored = await prisma.causeCode.findMany({ where: { code: causeCode, isDeleted: false } });
      expect(stored).toHaveLength(1);
      expect(stored[0].description).toBe('Imported cause v2');
    });

    it('exports the declared header', async () => {
      const res = await exportCsv('/api/cause-codes/export.csv');
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(CC_HEADER.join(','));
      expect(rowStartingWith(res, causeCode)).toBeDefined();
    });
  });

  describe('failure codes', () => {
    it('resolves a parent that appears later in the same file', async () => {
      const parent = `${failureCode}P`;
      const child = `${failureCode}C`;
      const res = await sendCsv('/api/failure-codes/import.csv', FC_HEADER, [
        // Child first: a single-pass importer would reject this file.
        [child, 'Imported child', parent],
        [parent, 'Imported parent', ''],
      ]);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 2, updated: 0, rejected: [] });

      const parentRow = await prisma.failureCode.findFirstOrThrow({
        where: { code: parent, isDeleted: false },
      });
      const childRow = await prisma.failureCode.findFirstOrThrow({
        where: { code: child, isDeleted: false },
      });
      expect(childRow.parentCodeId).toBe(parentRow.failureCodeId);
    });

    it('rejects an unknown parent and rolls the new code back', async () => {
      const code = `${failureCode}X`;
      const res = await sendCsv('/api/failure-codes/import.csv', FC_HEADER, [
        [code, 'Orphan child', 'NO-SUCH-PARENT'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("unknown parentCode 'NO-SUCH-PARENT'");
      expect(await prisma.failureCode.count({ where: { code } })).toBe(0);
    });

    it('rejects a code naming itself as its parent', async () => {
      const code = `${failureCode}S`;
      const res = await sendCsv('/api/failure-codes/import.csv', FC_HEADER, [
        [code, 'Self parent', code],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('own parent');
      expect(await prisma.failureCode.count({ where: { code } })).toBe(0);
    });

    it('rejects a pair that would close a cycle', async () => {
      const a = `${failureCode}A`;
      const b = `${failureCode}B`;
      const res = await sendCsv('/api/failure-codes/import.csv', FC_HEADER, [
        [a, 'Cycle a', b],
        [b, 'Cycle b', a],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cycle');
      // A cycle would hide both codes from /tree, and the rollback means
      // neither was stored.
      expect(await prisma.failureCode.count({ where: { code: { in: [a, b] } } })).toBe(0);
    });

    it('exports the parent by code', async () => {
      const res = await exportCsv('/api/failure-codes/export.csv');
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(FC_HEADER.join(','));
      const row = rowStartingWith(res, `${failureCode}C`);
      expect(row).toBeDefined();
      expect(row!.split(',')[2]).toBe(`${failureCode}P`);
    });
  });

  describe('maintenance plans', () => {
    let anchor = '';

    beforeAll(async () => {
      anchor = await importWorkCenter(wcPlanCode);
      const res = await sendCsv('/api/task-lists/import.csv', TL_HEADER, [
        [planTaskListCode, 'Plan task list', '', '', wcPlanCode],
      ]);
      expect(res.status).toBe(200);
    });

    it('creates a plan with one target and writes the target list generation reads', async () => {
      const res = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [planCode, 'Imported plan', wcPlanCode, planTaskListCode, 'Time', '30', 'Days', '7', 'Days', '2026-11-01', '', 'Medium', 'Draft', '', 'PL-01', '', 'true'],
      ]);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const plan = await prisma.maintenancePlan.findFirstOrThrow({
        where: { planCode, isDeleted: false },
        include: { targets: true },
      });
      expect(plan.workCenterId).toBe(anchor);
      expect(plan.targets).toHaveLength(1);
      expect(plan.targets[0].functionalLocationId).not.toBeNull();
      expect(plan.targets[0].equipmentId).toBeNull();
    });

    it('never changes an existing plan target, even when the row names another asset', async () => {
      const plan = await prisma.maintenancePlan.findFirstOrThrow({
        where: { planCode, isDeleted: false },
        include: { targets: true },
      });
      const originalTarget = plan.targets[0].functionalLocationId;
      const originalId = plan.planId;

      // P-1001 exists in the seed; the row points the plan at it instead of the
      // location, which must not move the plan.
      const res = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [planCode, 'Imported plan v2', wcPlanCode, planTaskListCode, 'Time', '45', 'Days', '7', 'Days', '2026-11-01', '', 'High', 'Planned', 'P-1001', '', '', 'true'],
      ]);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const after = await prisma.maintenancePlan.findUniqueOrThrow({
        where: { planId: originalId },
        include: { targets: true },
      });
      expect(after.description).toBe('Imported plan v2');
      expect(after.intervalValue).toBe(45);
      expect(after.priority).toBe('High');
      // Header fields move; targeting does not. A plan may cover many assets
      // and this file cannot express that, so it is left alone.
      expect(after.functionalLocationId).toBe(plan.functionalLocationId);
      expect(after.equipmentId).toBeNull();
      expect(after.targets).toHaveLength(1);
      expect(after.targets[0].functionalLocationId).toBe(originalTarget);
    });

    it('refuses a Meter plan that has no meter thresholds, because it could never come due', async () => {
      const code = `${planCode}M`;
      const res = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [code, 'Meter plan', wcPlanCode, planTaskListCode, 'Meter', '100', 'Days', '7', 'Units', '2026-11-01', '', 'Medium', 'Draft', '', 'PL-01', '', 'true'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('meter thresholds');
      expect(await prisma.maintenancePlan.count({ where: { planCode: code } })).toBe(0);
    });

    it('refuses a row naming both targets or neither', async () => {
      const both = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [`${planCode}B`, 'Both targets', wcPlanCode, planTaskListCode, 'Time', '30', 'Days', '7', 'Days', '2026-11-01', '', 'Medium', 'Draft', 'P-1001', 'PL-01', '', 'true'],
      ]);
      expect(both.status).toBe(400);
      expect(both.body.error).toContain('exactly one of equipmentCode or functionalLocationCode');

      const neither = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [`${planCode}N`, 'No target', wcPlanCode, planTaskListCode, 'Time', '30', 'Days', '7', 'Days', '2026-11-01', '', 'Medium', 'Draft', '', '', '', 'true'],
      ]);
      expect(neither.status).toBe(400);
    });

    it('rejects an unknown task list code', async () => {
      const code = `${planCode}X`;
      const res = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [code, 'Orphan plan', wcPlanCode, 'NO-SUCH-TL', 'Time', '30', 'Days', '7', 'Days', '2026-11-01', '', 'Medium', 'Draft', '', 'PL-01', '', 'true'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("unknown taskListCode 'NO-SUCH-TL'");
      expect(await prisma.maintenancePlan.count({ where: { planCode: code } })).toBe(0);
    });

    it('rejects a date cell that is not a date', async () => {
      const code = `${planCode}D`;
      const res = await sendCsv('/api/maintenance-plans/import.csv', PLAN_HEADER, [
        [code, 'Bad date', wcPlanCode, planTaskListCode, 'Time', '30', 'Days', '7', 'Days', 'next tuesday', '', 'Medium', 'Draft', '', 'PL-01', '', 'true'],
      ]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('startDate');
    });

    it('exports dates as YYYY-MM-DD and targets by code', async () => {
      const res = await exportCsv('/api/maintenance-plans/export.csv');
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(PLAN_HEADER.join(','));
      const row = rowStartingWith(res, planCode);
      expect(row).toBeDefined();
      const cells = row!.split(',');
      expect(cells[2]).toBe(wcPlanCode);
      expect(cells[3]).toBe(planTaskListCode);
      expect(cells[9]).toBe('2026-11-01');
      expect(cells[14]).toBe('PL-01');
    });
  });

  describe('notifications (export only)', () => {
    it('exports the declared header with resolved codes', async () => {
      const res = await exportCsv('/api/notifications/export.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(headerOf(res)).toBe(NOTIFICATION_HEADER.join(','));
      const lines = res.text.split(/\r?\n/).filter((l) => l.length > 0);
      for (const line of lines) expect(line.split(',')).toHaveLength(NOTIFICATION_HEADER.length);
    });

    it('has no import route: the workflow is not master data', async () => {
      const res = await sendCsv('/api/notifications/import.csv', NOTIFICATION_HEADER, [['x']]);
      expect(res.status).toBe(404);
    });
  });

  describe('users (export only)', () => {
    it('is Administrator-only, like the JSON list', async () => {
      const denied = await exportCsv('/api/users/export.csv', ctx.plannerToken);
      expect(denied.status).toBe(403);

      const res = await exportCsv('/api/users/export.csv', ctx.adminToken);
      expect(res.status).toBe(200);
      expect(headerOf(res)).toBe(USER_HEADER.join(','));
      expect(rowStartingWith(res, 'admin')).toBeDefined();
    });

    it('never writes a credential column', async () => {
      const res = await exportCsv('/api/users/export.csv', ctx.adminToken);
      expect(res.text.toLowerCase()).not.toContain('password');
      expect(res.text).not.toMatch(/\$2[aby]\$/);
    });

    it('has no import route', async () => {
      const res = await sendCsv('/api/users/import.csv', USER_HEADER, [['x']], ctx.adminToken);
      expect(res.status).toBe(404);
    });
  });
});
