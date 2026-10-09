import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';
import { JWT_SECRET } from '../../src/utils/config.js';
import { allocate } from '../../src/utils/costSplits.js';

// SOW 3.5.2 (matrix :175): cost-split validation and read-back over the
// route â€” the percentage allocation of the work order's own actualCost across
// cost centres, verified against live rows. The pure allocate/checkAllocation
// and the zod schemas had unit coverage; the write path had only static
// source-regex tests. These cases drive PUT/GET/DELETE
// /api/work-order-cost-splits against a fixture work order whose every cost
// bucket is filled, and assert the reconciliation invariant: the allocated
// shares re-add exactly to actualCost.

type Split = {
  splitId: string;
  workOrderId: string;
  costCenterCode: string;
  percentage: number;
  allocatedActualCost: number;
  isDeleted: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

let fitterId = '';
let fitterRate = 0;
let flatId = '';
let mcId = '';
let techId = '';
let supId = '';
let plannerToken = '';
let woId = '';
let opId = '';

let expectedPlanned = 0;
let expectedActual = 0;

const stamp = Date.now();

afterAll(async () => {
  // One helper for the whole subtree. The previous teardown worked through the
  // children individually and then deleted the work order - which cannot
  // succeed, because a snapshot restricts the work order and this file takes one
  // whenever it changes a status. The P2003 that followed was swallowed by the
  // `.catch` on each line, so the order and its audit rows stayed.
  await purgeWorkOrders([woId]);
});

beforeAll(async () => {
  const [fitter, loc, mech, tech, sup, planner, material] = await Promise.all([
    prisma.craft.findFirst({ where: { craftCode: 'FITTER', isDeleted: false } }),
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.workCenter.findFirst({ where: { code: 'MECH', isDeleted: false } }),
    prisma.user.findFirst({ where: { username: 'tech1' } }),
    prisma.user.findFirst({ where: { username: 'supervisor' } }),
    prisma.user.findFirst({ where: { username: 'planner' } }),
    prisma.material.findFirst({ where: { materialCode: 'MECH-SEAL-001', isDeleted: false } }),
  ]);
  if (!fitter || !loc || !mech || !tech || !sup || !planner || !material) {
    throw new Error('seeded fixture data not found');
  }
  fitterId = fitter.craftId;
  fitterRate = Number(fitter.hourlyRate);
  flatId = loc.functionalLocationId;
  mcId = mech.workCenterId;
  techId = tech.userId;
  supId = sup.userId;
  plannerToken = jwt.sign({ userId: planner.userId, username: planner.username, role: planner.role }, JWT_SECRET, {
    expiresIn: '8h',
  });

  const made = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'CM',
      priority: 'Medium',
      description: 'cost split fixture',
      functionalLocationId: flatId,
      workCenterId: mcId,
      supervisorUserId: supId,
      costCenterCode: 'CC-100',
    });
  expect(made.status).toBe(201);
  woId = made.body.workOrderId;

  const op = await api()
    .post('/api/work-order-operations')
    .set(authHeaders(ctx.technicianToken))
    .send({ workOrderId: woId, sequenceNumber: 10, description: 'split fixture step', craftId: fitterId, plannedHours: 4 });
  expect(op.status).toBe(201);
  opId = op.body.operationId;

  const mat = await api()
    .post('/api/work-order-materials')
    .set(authHeaders(ctx.technicianToken))
    .send({ workOrderId: woId, materialId: material.materialId, operationId: opId, plannedQuantity: 3, actualQuantity: 2, unitCost: 10 });
  expect(mat.status).toBe(201);

  const svc = await api()
    .post('/api/external-services')
    .set(authHeaders(ctx.technicianToken))
    .send({ workOrderId: woId, vendor: 'Split Vendor', description: 'on-bucket service', cost: 100, category: 'Service' });
  expect(svc.status).toBe(201);

  const misc = await api()
    .post('/api/external-services')
    .set(authHeaders(ctx.technicianToken))
    .send({ workOrderId: woId, vendor: 'Split Travel', description: 'travel bucket', cost: 25, category: 'Travel' });
  expect(misc.status).toBe(201);

  const labor = await api()
    .post('/api/labor')
    .set(authHeaders(ctx.technicianToken))
    .send({ operationId: opId, hoursWorked: 5 });
  expect(labor.status).toBe(201);

  // SOW 3.5.1 buckets: planned = 4h at rate + 3*10 + 100 + 25;
  // actual = 5h at rate + 2*10 + 100 + 25 (serviceCost charges both).
  expectedPlanned = round2(4 * fitterRate + 30 + 125);
  expectedActual = round2(5 * fitterRate + 20 + 125);

  const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: woId } });
  expect(Number(stored.plannedCost)).toBe(expectedPlanned);
  expect(Number(stored.actualCost)).toBe(expectedActual);
});

async function getSplits(token: string): Promise<{ status: number; body: any }> {
  return api()
    .get('/api/work-order-cost-splits')
    .set(authHeaders(token))
    .query({ workOrderId: woId });
}

async function putSplits(token: string, splits: unknown[], workId: string = woId) {
  return api()
    .put('/api/work-order-cost-splits')
    .set(authHeaders(token))
    .send({ workOrderId: workId, splits });
}

describe('cost-split route suite (SOW 3.5.2, :175)', () => {
  it('requires the workOrderId query on GET (400)', async () => {
    const res = await api().get('/api/work-order-cost-splits').set(authHeaders(ctx.viewOnlyToken));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('workOrderId query parameter is required');
  });

  it('answers 401 without a token', async () => {
    const res = await api().get('/api/work-order-cost-splits').query({ workOrderId: woId });
    expect(res.status).toBe(401);
  });

  it('answers 404 for an unknown work order', async () => {
    const res = await api().get('/api/work-order-cost-splits').set(authHeaders(ctx.viewOnlyToken)).query({ workOrderId: 'no-such-work-order' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Work order not found');
  });

  it('reads an unallocated work order as balanced with a zero total', async () => {
    const res = await getSplits(ctx.viewOnlyToken);
    expect(res.status).toBe(200);
    expect(res.body.workOrderId).toBe(woId);
    expect(res.body.workOrderCostCenterCode).toBe('CC-100');
    expect(res.body.actualCost).toBe(expectedActual);
    expect(res.body.plannedCost).toBe(expectedPlanned);
    expect(res.body.splits).toEqual([]);
    expect(res.body.totalPercentage).toBe(0);
    expect(res.body.isBalanced).toBe(true);
  });

  it('refuses the PUT below the Maintenance Planner floor (403)', async () => {
    const res = await putSplits(ctx.supervisorToken, [{ costCenterCode: 'CC-100', percentage: 100 }]);
    expect(res.status).toBe(403);
  });

  it('rejects an allocation that does not total 100 (400)', async () => {
    const short = await putSplits(ctx.adminToken, [{ costCenterCode: 'CC-100', percentage: 60 }]);
    expect(short.status).toBe(400);
    expect(short.body.error).toContain('Cost split percentages must total 100 (received 60)');

    const over = await putSplits(ctx.adminToken, [
      { costCenterCode: 'CC-100', percentage: 60 },
      { costCenterCode: 'CC-200', percentage: 60 },
    ]);
    expect(over.status).toBe(400);
    expect(over.body.error).toContain('(received 120)');
  });

  it('rejects a duplicate cost centre case-insensitively (400)', async () => {
    const res = await putSplits(ctx.adminToken, [
      { costCenterCode: 'CC-100', percentage: 50 },
      { costCenterCode: 'cc-100', percentage: 50 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('allocated more than once');
  });

  it('rejects a single line claiming the whole work order (400 from the schema)', async () => {
    const res = await putSplits(ctx.adminToken, [{ costCenterCode: 'CC-100', percentage: 100 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('percentage');
  });

  it('refuses a body without a work order (400 from the schema)', async () => {
    const res = await api()
      .put('/api/work-order-cost-splits')
      .set(authHeaders(ctx.adminToken))
      .send({ splits: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workOrderId');
  });

  it('answers 404 for a PUT against an unknown work order and writes nothing', async () => {
    const res = await putSplits(ctx.adminToken, [{ costCenterCode: 'CC-100', percentage: 60 }, { costCenterCode: 'CC-200', percentage: 40 }], 'no-such-work-order');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Work order not found');
    const rows = await prisma.costSplit.count({ where: { workOrderId: 'no-such-work-order' } });
    expect(rows).toBe(0);
  });

  it('writes a valid allocation and reads back 100% balanced', async () => {
    const put = await putSplits(ctx.adminToken, [
      { costCenterCode: 'CC-100', percentage: 60 },
      { costCenterCode: 'CC-200', percentage: 40 },
    ]);
    expect(put.status).toBe(200);
    expect(put.body.totalPercentage).toBe(100);

    const res = await getSplits(ctx.viewOnlyToken);
    expect(res.status).toBe(200);
    expect(res.body.totalPercentage).toBe(100);
    expect(res.body.isBalanced).toBe(true);
    expect(res.body.splits.map((s: Split) => s.costCenterCode)).toEqual(['CC-100', 'CC-200']);

    const amounts = allocate(expectedActual, [
      { costCenterCode: 'CC-100', percentage: 60 },
      { costCenterCode: 'CC-200', percentage: 40 },
    ]);
    expect(res.body.splits.map((s: Split) => s.allocatedActualCost)).toEqual(amounts);
    const sum = res.body.splits.reduce((a: number, s: Split) => a + s.allocatedActualCost, 0);
    expect(round2(sum)).toBe(round2(expectedActual));

    const audit = await prisma.auditLogEntry.findFirst({
      where: { tableName: 'CostSplit', recordId: woId, action: 'Update' },
    });
    expect(audit).toBeTruthy();
    // C6a: the whole-set replace is audited as one set-level field diff.
    expect(audit?.fieldName).toBe('costAllocation');
    expect(audit?.newValue).toContain('CC-100');
    expect(audit?.newValue).toContain('CC-200');
  });

  it('keeps the previous allocation intact after a rejected set', async () => {
    const res = await putSplits(ctx.adminToken, [{ costCenterCode: 'CC-100', percentage: 10 }]);
    expect(res.status).toBe(400);

    const after = await getSplits(ctx.viewOnlyToken);
    expect(after.body.totalPercentage).toBe(100);
    expect(after.body.isBalanced).toBe(true);
    expect(after.body.splits.map((s: Split) => s.costCenterCode)).toEqual(['CC-100', 'CC-200']);
  });

  it('replacing soft-retires the old rows and serves only the new set', async () => {
    const put = await putSplits(ctx.adminToken, [
      { costCenterCode: 'CC-300', percentage: 60 },
      { costCenterCode: 'CC-400', percentage: 40 },
    ]);
    expect(put.status).toBe(200);
    expect(put.body.replacedCount).toBe(2);

    const rows = await prisma.costSplit.findMany({ where: { workOrderId: woId } });
    expect(rows.length).toBe(4);
    expect(rows.filter((r) => r.isDeleted).length).toBe(2);
    expect(rows.filter((r) => !r.isDeleted).length).toBe(2);

    const after = await getSplits(ctx.viewOnlyToken);
    expect(after.body.totalPercentage).toBe(100);
    expect(after.body.splits.map((s: Split) => s.costCenterCode)).toEqual(['CC-300', 'CC-400']);
  });

  it('clears an allocation with an empty set', async () => {
    const put = await putSplits(ctx.adminToken, []);
    expect(put.status).toBe(200);
    expect(put.body.replacedCount).toBe(2);
    expect(put.body.splits).toEqual([]);

    const after = await getSplits(ctx.viewOnlyToken);
    expect(after.body.splits).toEqual([]);
    expect(after.body.totalPercentage).toBe(0);
    expect(after.body.isBalanced).toBe(true);
  });

  it('refuses a DELETE that would leave the set unbalanced', async () => {
    const put = await putSplits(ctx.adminToken, [
      { costCenterCode: 'CC-100', percentage: 60 },
      { costCenterCode: 'CC-200', percentage: 40 },
    ]);
    expect(put.status).toBe(200);
    const line = put.body.splits[0];

    const res = await api()
      .delete(`/api/work-order-cost-splits/${line.splitId}`)
      .set(authHeaders(ctx.supervisorToken));
    expect(res.status).toBe(400);

    const kept = await prisma.costSplit.findUnique({ where: { splitId: line.splitId } });
    expect(kept?.isDeleted).toBe(false);
  });

  it('refuses the DELETE below the Maintenance Supervisor floor (403)', async () => {
    const rows = await prisma.costSplit.findMany({ where: { workOrderId: woId, isDeleted: false } });
    const res = await api()
      .delete(`/api/work-order-cost-splits/${rows[0].splitId}`)
      .set(authHeaders(ctx.technicianToken));
    expect(res.status).toBe(403);
  });

  it('answers 404 for an unknown or already-deleted split', async () => {
    const res = await api()
      .delete('/api/work-order-cost-splits/no-such-split')
      .set(authHeaders(ctx.supervisorToken));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Cost split not found');
  });

  it('deletes the final remaining line and returns the work order to unallocated', async () => {
    await putSplits(ctx.adminToken, []);
    const lone = await prisma.costSplit.create({
      data: {
        workOrderId: woId,
        costCenterCode: 'CC-900',
        percentage: 100,
        createdBy: ctx.adminId,
      },
    });

    const res = await api()
      .delete(`/api/work-order-cost-splits/${lone.splitId}`)
      .set(authHeaders(ctx.supervisorToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cost split deleted successfully');

    const after = await getSplits(ctx.viewOnlyToken);
    expect(after.body.splits).toEqual([]);
    expect(after.body.totalPercentage).toBe(0);
    expect(after.body.isBalanced).toBe(true);

    const audit = await prisma.auditLogEntry.findFirst({
      where: { tableName: 'CostSplit', recordId: lone.splitId, action: 'Delete' },
    });
    expect(audit).toBeTruthy();
  });
});