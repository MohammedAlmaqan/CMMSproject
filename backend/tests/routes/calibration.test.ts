import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';
import { CALIBRATION_RESULT_REQUIRED_MESSAGE } from '../../src/utils/workOrderRules.js';

// SOW 3.3.1 (matrix row 24), full depth: a calibration work order carries a
// pass/fail result, as-found and as-left readings, the reference standard, and
// the due date and interval that drive the next calibration.
//
// The completion gate is the part with teeth, and it is asserted from both
// sides: a CAL order cannot be completed without a result, and a non-CAL order
// is never asked for one. That pairing is what shows the rule is a calibration
// rule and not a second name for the breakdown-cause gate.

let flat = '';
let wc = '';
let sup = '';
let craftId = '';
const woIds: string[] = [];

async function createWo(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/work-orders')
    .set(authHeaders(ctx.operatorToken))
    .send({
      type: 'CAL',
      priority: 'Medium',
      description: 'calibration probe',
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

async function transition(id: string, status: string) {
  return api().put(`/api/work-orders/${id}/status`).set(authHeaders(ctx.technicianToken)).send({ status });
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
});

afterAll(async () => {
  await purgeWorkOrders(woIds);
});

describe('SOW 3.3.1 calibration capture (row 24)', () => {
  it('persists the full calibration record and returns it from the detail route', async () => {
    const id = await createWo({
      calibrationResult: 'Pass',
      calibrationAsFound: '950 ohm',
      calibrationAsLeft: '1000 ohm',
      calibrationReferenceStandard: 'Fluke 87V',
      calibrationDueDate: '2027-01-01',
      calibrationIntervalValue: 12,
      calibrationIntervalUnit: 'Months',
    });

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.calibrationResult).toBe('Pass');
    expect(stored.calibrationAsFound).toBe('950 ohm');
    expect(stored.calibrationAsLeft).toBe('1000 ohm');
    expect(stored.calibrationReferenceStandard).toBe('Fluke 87V');
    expect(stored.calibrationIntervalValue).toBe(12);
    expect(stored.calibrationIntervalUnit).toBe('Months');

    const detail = await api().get(`/api/work-orders/${id}`).set(authHeaders(ctx.adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.calibrationResult).toBe('Pass');
    expect(detail.body.calibrationAsLeft).toBe('1000 ohm');
  });

  it('clears a previously recorded reading when an explicit null is sent', async () => {
    const id = await createWo({ calibrationResult: 'Pass', calibrationAsLeft: '1000 ohm' });

    const res = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ calibrationAsLeft: null });
    expect(res.status).toBe(200);

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.calibrationAsLeft).toBeNull();
    expect(stored.calibrationResult).toBe('Pass');
  });

  it('rejects an unknown calibration result at validation', async () => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CAL',
        priority: 'Medium',
        description: 'calibration validation probe',
        functionalLocationId: flat,
        workCenterId: wc,
        supervisorUserId: sup,
        calibrationResult: 'Maybe',
      });
    expect(res.status).toBe(400);
  });

  it('blocks completing a calibration work order with no result', async () => {
    const id = await createWo();
    await walkToInProgress(id);

    const res = await transition(id, 'Completed');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(CALIBRATION_RESULT_REQUIRED_MESSAGE);

    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('In Progress');
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: id, action: 'Blocked' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('completes the same calibration work order once a result is recorded', async () => {
    const id = await createWo();
    await walkToInProgress(id);

    const saved = await api()
      .put(`/api/work-orders/${id}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ calibrationResult: 'Fail' });
    expect(saved.status).toBe(200);

    const res = await transition(id, 'Completed');
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('Completed');
    expect(stored.calibrationResult).toBe('Fail');
  });

  it('lets a non-calibration work order complete without a result', async () => {
    const id = await createWo({ type: 'CM' });
    await walkToInProgress(id);

    const res = await transition(id, 'Completed');
    expect(res.status).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
    expect(stored.status).toBe('Completed');
    expect(stored.calibrationResult).toBeNull();
  });
});
