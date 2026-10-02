import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeCrafts, purgeTaskLists, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.3: crafts are assigned to a work centre, each with its own hourly
// rate, and the assignment is a real write path. The matrix held the row
// because crafts.test.ts only covered the list and a 401 — none of POST/PUT,
// and none of the 409 retirement refusals this row is built on.

const stamp = Date.now();
let createdIds: string[] = [];
let workCenterId = '';
let refCraftId = '';
let taskCraftId = '';
let blockedWoId = '';
let blockedTaskListId = '';

async function createCraft(craftCode: string, overrides: Record<string, unknown> = {}, token = ctx.adminToken) {
  return api()
    .post('/api/crafts')
    .set(authHeaders(token))
    .send({ workCenterId, craftCode, description: 'craft fixture', hourlyRate: 42.5, ...overrides });
}

describe('crafts routes', () => {
  beforeAll(async () => {
    const wcs = await api().get('/api/work-centers').set(authHeaders(ctx.adminToken));
    workCenterId = wcs.body[0].workCenterId;
  });

  afterAll(async () => {
    // The blocked-path fixtures are pruned before the crafts, because a craft is
    // restricted by both operation tables: the work order and the task list
    // created above to prove the guard rejects them both hold operations naming
    // one of these crafts, and deleting the craft first fails with P2003 - which
    // the `.catch` this replaces used to swallow, leaving both behind.
    await purgeWorkOrders([blockedWoId]);
    await purgeTaskLists([blockedTaskListId]);
    await purgeCrafts(createdIds);
  });

  it('returns the craft list', async () => {
    const res = await api().get('/api/crafts').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/crafts');
    expect(res.status).toBe(401);
  });

  describe('craft write path (SOW 3.1.3)', () => {
    it('creates a craft with its own hourly rate and persists it', async () => {
      const res = await createCraft(`CRF-W-${stamp}`);
      expect(res.status).toBe(201);
      const id = res.body.craftId;
      createdIds.push(id);
      const row = await prisma.craft.findUniqueOrThrow({ where: { craftId: id } });
      expect(Number(row.hourlyRate)).toBe(42.5);
      expect(row.workCenterId).toBe(workCenterId);
    });

    it('refuses a duplicate craft code within the same work centre with 409', async () => {
      const res = await createCraft(`CRF-W-${stamp}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/);
    });

    it('rejects a craft without an hourly rate as malformed (400)', async () => {
      const res = await api()
        .post('/api/crafts')
        .set(authHeaders(ctx.adminToken))
        .send({ workCenterId, craftCode: `CRF-NR-${stamp}`, description: 'no rate' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('hourlyRate');
    });

    it('rejects create by a below-Planner role with 403', async () => {
      const res = await createCraft(`CRF-ROLE-${stamp}`, {}, ctx.operatorToken);
      expect(res.status).toBe(403);
    });

    it('updates a craft rate and persists the new value', async () => {
      const made = await createCraft(`CRF-U-${stamp}`);
      expect(made.status).toBe(201);
      createdIds.push(made.body.craftId);

      const res = await api()
        .put(`/api/crafts/${made.body.craftId}`)
        .set(authHeaders(ctx.adminToken))
        .send({ hourlyRate: 55 });
      expect(res.status).toBe(200);
      expect(Number(res.body.hourlyRate)).toBe(55);
      expect(Number((await prisma.craft.findUniqueOrThrow({ where: { craftId: made.body.craftId } })).hourlyRate)).toBe(55);
    });

    it('refuses retirement while a work order operation references the craft (409)', async () => {
      const made = await createCraft(`CRF-BWO-${stamp}`);
      expect(made.status).toBe(201);
      refCraftId = made.body.craftId;
      createdIds.push(refCraftId);

      const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
      const wo = await prisma.workOrder.create({
        data: {
          woNumber: `WO-CRF-${stamp}`,
          type: 'CM',
          priority: 'Medium',
          status: 'Draft',
          description: 'craft retirement block fixture',
          functionalLocationId: fl.functionalLocationId,
          workCenterId,
          supervisorUserId: ctx.adminId,
          reportedByUserId: ctx.adminId,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });
      blockedWoId = wo.workOrderId;
      await prisma.workOrderOperation.create({
        data: {
          workOrderId: wo.workOrderId,
          sequenceNumber: 10,
          description: 'operation using the craft',
          craftId: refCraftId,
          plannedHours: 1,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });

      const res = await api().delete(`/api/crafts/${refCraftId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/work order operation/);
      expect((await prisma.craft.findUniqueOrThrow({ where: { craftId: refCraftId } })).isDeleted).toBe(false);
    });

    it('refuses retirement while a live task list step references the craft (409)', async () => {
      const made = await createCraft(`CRF-BTL-${stamp}`);
      expect(made.status).toBe(201);
      taskCraftId = made.body.craftId;
      createdIds.push(taskCraftId);

      const tpl = await prisma.taskList.create({
        data: {
          code: `TL-CRF-${stamp}`,
          description: 'craft retirement block template',
          workCenterId,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });
      blockedTaskListId = tpl.taskListId;
      await prisma.taskListOperation.create({
        data: {
          taskListId: tpl.taskListId,
          sequenceNumber: 10,
          description: 'step using the craft',
          craftId: taskCraftId,
          plannedHours: 1,
          numberOfTechnicians: 1,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });

      const res = await api().delete(`/api/crafts/${taskCraftId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/task list step/);
      expect((await prisma.craft.findUniqueOrThrow({ where: { craftId: taskCraftId } })).isDeleted).toBe(false);
    });

    it('retires a craft once nothing references it', async () => {
      const made = await createCraft(`CRF-FREE-${stamp}`);
      expect(made.status).toBe(201);
      const id = made.body.craftId;
      createdIds.push(id);

      const res = await api().delete(`/api/crafts/${id}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect((await prisma.craft.findUniqueOrThrow({ where: { craftId: id } })).isDeleted).toBe(true);
    });
  });

  // R.10: a craft's hourlyRate is the basis SOW 3.5.1 planned labour is priced
  // from, so editing it invalidates the cached cost of every work order carrying
  // the craft. The write path re-costs them in the same transaction; these tests
  // pin that, the scoping (rate-only), and the soft-delete exclusion.
  describe('craft rate fan-out (R.10)', () => {
    async function makeCraftAndWorkOrder(code: string, rate: number, plannedHours: number, isDeleted = false) {
      const made = await createCraft(code, { hourlyRate: rate });
      expect(made.status).toBe(201);
      createdIds.push(made.body.craftId);
      const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
      const wo = await prisma.workOrder.create({
        data: {
          woNumber: `WO-${code}`,
          type: 'CM',
          priority: 'Medium',
          status: 'Draft',
          description: 'craft rate fan-out fixture',
          functionalLocationId: fl.functionalLocationId,
          workCenterId,
          supervisorUserId: ctx.adminId,
          reportedByUserId: ctx.adminId,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
          isDeleted,
        },
      });
      await prisma.workOrderOperation.create({
        data: {
          workOrderId: wo.workOrderId,
          sequenceNumber: 10,
          description: 'operation on the craft',
          craftId: made.body.craftId,
          plannedHours,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });
      return { craftId: made.body.craftId as string, workOrderId: wo.workOrderId };
    }

    it('re-costs every live work order carrying the craft when its rate moves', async () => {
      const { craftId, workOrderId } = await makeCraftAndWorkOrder(`CRF-FAN-${stamp}`, 40, 2);

      // Written straight through Prisma, the cache starts at 0, so a move to 110
      // can only be the fan-out recompute.
      expect(Number((await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } })).plannedCost)).toBe(0);

      const res = await api().put(`/api/crafts/${craftId}`).set(authHeaders(ctx.adminToken)).send({ hourlyRate: 55 });
      expect(res.status).toBe(200);
      expect(res.body.recomputedWorkOrders).toBe(1);

      const after = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } });
      expect(Number(after.plannedCost)).toBe(110); // 2 h x 55
      const audit = await prisma.auditLogEntry.findFirst({
        where: { tableName: 'WorkOrder', recordId: workOrderId, action: 'Update', fieldName: 'plannedCost' },
      });
      expect(audit?.newValue).toBe('110');
    });

    it('does not re-cost on a non-rate edit', async () => {
      const { craftId, workOrderId } = await makeCraftAndWorkOrder(`CRF-NORATE-${stamp}`, 40, 2);
      // Corrupt only the cache, so a stray recompute shows up as 110 rather than 999.
      await prisma.workOrder.update({ where: { workOrderId }, data: { plannedCost: 999 } });

      const res = await api().put(`/api/crafts/${craftId}`).set(authHeaders(ctx.adminToken)).send({ description: 'renamed' });
      expect(res.status).toBe(200);
      expect(res.body.recomputedWorkOrders).toBe(0);
      expect(Number((await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } })).plannedCost)).toBe(999);
    });

    it("leaves a soft-deleted work order's stored cost untouched when the rate moves", async () => {
      const { craftId, workOrderId } = await makeCraftAndWorkOrder(`CRF-SDEL-${stamp}`, 40, 2, true);
      await prisma.workOrder.update({ where: { workOrderId }, data: { plannedCost: 7 } });

      const res = await api().put(`/api/crafts/${craftId}`).set(authHeaders(ctx.adminToken)).send({ hourlyRate: 80 });
      expect(res.status).toBe(200);
      expect(res.body.recomputedWorkOrders).toBe(0);
      expect(Number((await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId } })).plannedCost)).toBe(7);
    });
  });
});
