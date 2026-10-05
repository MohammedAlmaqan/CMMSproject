import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeFailureCodes } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.4 (owner decision 2026-10-05), the second half of the clause that
// deferred item D5 left open: the FailureCode table was delivered and fully
// manageable, but no work order could name one, so a maintained failure list
// existed with nothing behind it.
//
// The field under test is `WorkOrder.failureCodeId`. It is deliberately
// distinct from `causeCodeId`, which is what breakdownCause.test.ts covers:
// a failure records what was observed, a cause records why, and a work order
// frequently knows the first long before the second.
//
// No completion gate exists for a failure code, and these tests are what hold
// that line. SOW 3.2.2's notification key fields name no failure code and no
// clause makes one mandatory, so a work order must still complete without one.
// If a future change adds a blocking rule, the last two cases here are the ones
// that should fail first.

let flat = '';
let wc = '';
let sup = '';
let craftId = '';
let causeId = '';
let failureId = '';
const woIds: string[] = [];

async function createWo(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'CM',
      priority: 'Medium',
      description: 'failure capture probe',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
      ...overrides,
    });
  expect(res.status).toBe(201);
  woIds.push(res.body.workOrderId);
  return res.body.workOrderId;
}

async function walkToInProgress(id: string): Promise<void> {
  const op = await api()
    .post('/api/work-order-operations')
    .set(authHeaders(ctx.technicianToken))
    .send({ workOrderId: id, sequenceNumber: 10, description: 'test operation', craftId, plannedHours: 1 });
  expect(op.status).toBe(201);
  for (const step of ['Planned', 'Scheduled', 'In Progress']) {
    const res = await api().put(`/api/work-orders/${id}/status`).set(authHeaders(ctx.technicianToken)).send({ status: step });
    expect(res.status).toBe(200);
  }
}

beforeAll(async () => {
  const [loc, center, supervisor, craft] = await Promise.all([
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.workCenter.findFirst({ where: { isDeleted: false } }),
    prisma.user.findFirst({ where: { username: 'supervisor' } }),
    prisma.craft.findFirst({ where: { isDeleted: false } }),
  ]);
  if (!loc || !center || !supervisor || !craft) {
    throw new Error('seeded location, work center, supervisor or craft not found');
  }
  flat = loc.functionalLocationId;
  wc = center.workCenterId;
  sup = supervisor.userId;
  craftId = craft.craftId;

  // A parent with a child, because the picker is driven off the hierarchy and a
  // flat list would not prove that a child code is reachable.
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const parent = await prisma.failureCode.create({
    data: { code: `FC-PRB-${stamp}`, description: 'failure capture probe (parent)' },
  });
  await prisma.failureCode.create({
    data: { code: `FC-CHD-${stamp}`, description: 'failure capture probe (child)', parentCodeId: parent.failureCodeId },
  });
  failureId = parent.failureCodeId;

  const cause = await prisma.causeCode.create({
    data: { code: `CC-FC-${stamp}`, description: 'failure capture probe cause' },
  });
  causeId = cause.causeCodeId;
});

afterAll(async () => {
  await purgeWorkOrders(woIds);
  await purgeFailureCodes([failureId]);
  await prisma.causeCode.deleteMany({ where: { causeCodeId: causeId } });
});

describe('SOW 3.1.4 failure capture (row 8)', () => {
  it('persists a failure code named at creation', async () => {
    const id = await createWo({ failureCodeId: failureId });
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBe(failureId);

    const detail = await api().get(`/api/work-orders/${id}`).set(authHeaders(ctx.adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.failureCode.failureCodeId).toBe(failureId);
    expect(detail.body.failureCode.code).toMatch(/^FC-PRB-/);
    expect(detail.body.failureCode.description).toBe('failure capture probe (parent)');
  });

  it('exposes the failure code on the list route, not only on the detail route', async () => {
    const id = await createWo({ failureCodeId: failureId });
    const res = await api()
      .get(`/api/work-orders?search=${encodeURIComponent('failure capture probe')}&take=100`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    const listed = (res.body.data as { workOrderId: string; failureCode: { failureCodeId: string } }[]).find(
      (w) => w.workOrderId === id
    );
    expect(listed).toBeDefined();
    expect(listed!.failureCode.failureCodeId).toBe(failureId);
  });

  it('raises a work order before its failure is known', async () => {
    const id = await createWo();
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBeNull();
  });

  it('sets a failure code later with a partial update', async () => {
    const id = await createWo();
    const res = await api().put(`/api/work-orders/${id}`).set(authHeaders(ctx.operatorToken)).send({ failureCodeId: failureId });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBe(failureId);
  });

  it('clears a failure code back to none', async () => {
    const id = await createWo({ failureCodeId: failureId });
    const res = await api().put(`/api/work-orders/${id}`).set(authHeaders(ctx.operatorToken)).send({ failureCodeId: null });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBeNull();
  });

  it('refuses a work order that names a failure code which does not exist', async () => {
    // Asserted as "not created" rather than as a specific status: the route
    // surfaces the foreign-key violation through its generic 500 handler, which
    // is an app-wide behaviour this change should not silently redefine. What
    // matters here is that a bad reference cannot be persisted.
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description: 'failure capture probe',
        functionalLocationId: flat,
        workCenterId: wc,
        supervisorUserId: sup,
        failureCodeId: 'no-such-failure-code',
      });
    expect(res.status).not.toBe(201);
    expect(
      await prisma.workOrder.count({ where: { failureCodeId: 'no-such-failure-code' } })
    ).toBe(0);
  });

  it('keeps the failure independent of the cause', async () => {
    // The point of two columns rather than one: naming a failure must not imply
    // a cause, and naming a cause must not overwrite the failure.
    const id = await createWo({ failureCodeId: failureId, breakdownFlag: true, causeCodeId: causeId });
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBe(failureId);
    expect(stored.causeCodeId).toBe(causeId);
  });

  it('audits a change to the failure code', async () => {
    const id = await createWo();
    await api().put(`/api/work-orders/${id}`).set(authHeaders(ctx.operatorToken)).send({ failureCodeId: failureId });
    const entries = await prisma.auditLogEntry.findMany({
      where: { tableName: 'WorkOrder', recordId: id, fieldName: 'failureCodeId' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('completes a work order that names no failure, because no clause requires one', async () => {
    const id = await createWo();
    await walkToInProgress(id);
    const res = await api().put(`/api/work-orders/${id}/status`).set(authHeaders(ctx.technicianToken)).send({ status: 'Completed' });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('Completed');
    expect(stored.failureCodeId).toBeNull();
  });

  it('completes a breakdown that names a failure but no cause only when the cause gate is satisfied', async () => {
    // Guards the boundary between the two fields: the failure code must not
    // satisfy the breakdown cause-code rule that breakdownCause.test.ts owns.
    const id = await createWo({ breakdownFlag: true, failureCodeId: failureId });
    await walkToInProgress(id);

    const blocked = await api().put(`/api/work-orders/${id}/status`).set(authHeaders(ctx.technicianToken)).send({ status: 'Completed' });
    expect(blocked.status).toBe(409);

    await api().put(`/api/work-orders/${id}`).set(authHeaders(ctx.operatorToken)).send({ causeCodeId: causeId });
    const allowed = await api().put(`/api/work-orders/${id}/status`).set(authHeaders(ctx.technicianToken)).send({ status: 'Completed' });
    expect(allowed.status).toBe(200);

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBe(failureId);
  });

  it('unlinks rather than blocks when a referenced failure code is retired', async () => {
    // ON DELETE SET NULL on the foreign key: retiring a code must not delete or
    // block the work-order history that named it.
    const throwaway = await prisma.failureCode.create({
      data: { code: `FC-TMP-${Date.now()}`, description: 'failure capture probe (retiring)' },
    });
    const id = await createWo({ failureCodeId: throwaway.failureCodeId });

    await prisma.failureCode.delete({ where: { failureCodeId: throwaway.failureCodeId } });

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.failureCodeId).toBeNull();
  });
});
