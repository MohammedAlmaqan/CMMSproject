import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeCauseCodes } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.4 (matrix row 8, deferred item D5): cause codes as root-cause
// categories. The CauseCode table existed but no work order could name one, so
// the MTTR report (row 62, SOW §3.7.1 per equipment/location) had no breakdown
// data behind it.
//
// The rule under test is deliberately at the end of the lifecycle, not the
// start: a breakdown may be raised before its cause is known, but it cannot be
// completed until one is named. Every case is paired with its inverse so the
// gate is shown to be narrow as well as real: a breakdown without a cause is
// blocked, and a non-breakdown is never asked for one.

let flat = '';
let wc = '';
let sup = '';
let craftId = '';
let causeCodeId = '';
const woIds: string[] = [];

async function createWo(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'CM',
      priority: 'Medium',
      description: 'breakdown cause probe',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
      ...overrides,
    });
  expect(res.status).toBe(201);
  woIds.push(res.body.workOrderId);
  return res.body.workOrderId;
}

async function addOperation(workOrderId: string): Promise<void> {
  const res = await api()
    .post('/api/work-order-operations')
    .set(authHeaders(ctx.technicianToken))
    .send({
      workOrderId,
      sequenceNumber: 10,
      description: 'test operation',
      craftId,
      plannedHours: 1,
    });
  expect(res.status).toBe(201);
}

async function transition(id: string, status: string, token = ctx.technicianToken) {
  return api().put(`/api/work-orders/${id}/status`).set(authHeaders(token)).send({ status });
}

async function walkToInProgress(id: string): Promise<void> {
  await addOperation(id);
  for (const step of ['Planned', 'Scheduled', 'In Progress']) {
    const res = await transition(id, step);
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

  const cause = await prisma.causeCode.create({
    data: {
      code: `CC-BD-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
      description: 'breakdown cause probe',
    },
  });
  causeCodeId = cause.causeCodeId;
});

afterAll(async () => {
  await purgeWorkOrders(woIds);
  await purgeCauseCodes([causeCodeId]);
});

describe('SOW 3.1.4 breakdown cause codes (row 8)', () => {
  it('persists a cause code set when a breakdown is created', async () => {
    const id = await createWo({ breakdownFlag: true, causeCodeId });
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.causeCodeId).toBe(causeCodeId);

    const detail = await api().get(`/api/work-orders/${id}`).set(authHeaders(ctx.adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.causeCode.causeCodeId).toBe(causeCodeId);
  });

  it('allows a breakdown to be raised before its cause is known', async () => {
    const id = await createWo({ breakdownFlag: true });
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.causeCodeId).toBeNull();
  });

  it('sets a cause code later with a partial update', async () => {
    const id = await createWo({ breakdownFlag: true });
    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ causeCodeId });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.causeCodeId).toBe(causeCodeId);
  });

  it('blocks completing a breakdown that names no cause', async () => {
    const id = await createWo({ breakdownFlag: true });
    await walkToInProgress(id);

    const res = await transition(id, 'Completed');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('cause code');

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('In Progress');
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: id, action: 'Blocked' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('completes the same breakdown once a cause code is set', async () => {
    const id = await createWo({ breakdownFlag: true });
    await walkToInProgress(id);
    await api().put(`/api/work-orders/${id}`).set(authHeaders(ctx.operatorToken)).send({ causeCodeId });

    const res = await transition(id, 'Completed');
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('Completed');
    expect(stored.causeCodeId).toBe(causeCodeId);
  });

  it('lets a non-breakdown complete without a cause code', async () => {
    const id = await createWo({ breakdownFlag: false });
    await walkToInProgress(id);
    const res = await transition(id, 'Completed');
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('Completed');
    expect(stored.causeCodeId).toBeNull();
  });

  it('cannot bypass the gate through the update route, which does not change status', async () => {
    // The update route does not declare `status` in its zod schema, so a body
    // that names it is stripped and the work order keeps its current status.
    // That is why the completion rule only has to live on the /status route -
    // and why this case asserts the status is unchanged rather than a 409. The
    // cause can still be set on this route, which is the supported way to fill
    // it in before completing.
    const id = await createWo({ breakdownFlag: true });
    await walkToInProgress(id);

    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Completed' });
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('In Progress');
  });
});
