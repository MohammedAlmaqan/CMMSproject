import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.4 (matrix :127): the configured work-order-number prefix reaches the
// rows the routes create; SOW 3.5 (matrix :130): the operation update route
// survives a full Zod parse without clobbering fields it was not sent.
// generateWoNumber and the assistant-counting logic were unit-pinned, and
// POST /api/work-order-operations had route coverage, but the configurable
// prefix had never been proven against live rows and PUT /api/work-order-
// operations/:id had no DB-backed test at all.

let flatId = '';
let mcId = '';
let fitterId = '';
let craftId = '';
let techId = '';
let supId = '';
const woIds: string[] = [];
const opIds: string[] = [];

const stamp = Date.now();
let nseq = 0;
const nextSeq = () => (nseq += 1);

async function createWoDirect(extra?: { functionalLocationId?: string }): Promise<string> {
  const wo = await prisma.workOrder.create({
    data: {
      woNumber: `WO-RULES-${stamp}-${nextSeq()}`,
      type: 'CM',
      priority: 'Medium',
      status: 'Draft',
      description: 'work order rules fixture',
      functionalLocationId: extra?.functionalLocationId ?? flatId,
      workCenterId: mcId,
      supervisorUserId: supId,
      reportedByUserId: techId,
      createdBy: ctx.adminId,
      modifiedBy: ctx.adminId,
    },
  });
  woIds.push(wo.workOrderId);
  return wo.workOrderId;
}

async function restorePrefix(): Promise<void> {
  await prisma.systemConfig.updateMany({ where: { key: 'wo_number_prefix', isDeleted: false }, data: { value: 'WO' } });
}

beforeAll(async () => {
  const [locations, mech, fitter, tech, sup] = await Promise.all([
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.workCenter.findFirst({ where: { code: 'MECH', isDeleted: false } }),
    prisma.craft.findFirst({ where: { craftCode: 'FITTER', isDeleted: false } }),
    prisma.user.findFirst({ where: { username: 'tech1' } }),
    prisma.user.findFirst({ where: { username: 'supervisor' } }),
  ]);
  if (!locations || !mech || !fitter || !tech || !sup) {
    throw new Error('seeded locations, work center, craft or users not found');
  }
  flatId = locations.functionalLocationId;
  mcId = mech.workCenterId;
  fitterId = fitter.craftId;
  techId = tech.userId;
  supId = sup.userId;
});

afterAll(async () => {
  await restorePrefix();
  await prisma.auditLogEntry
    .deleteMany({ where: { recordId: { in: [...woIds, ...opIds] } } })
    .catch(() => {});
  await prisma.systemConfig
    .updateMany({ where: { key: 'wo_number_prefix', isDeleted: false }, data: { value: 'WO' } })
    .catch(() => {});
  await prisma.workOrderOperation.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
});

describe('configured work-order number prefix (SOW 3.4, :127)', () => {
  it('PUT /api/system-config is Administrator-only (403 below)', async () => {
    const res = await api()
      .put('/api/system-config')
      .set(authHeaders(ctx.supervisorToken))
      .send({ key: 'wo_number_prefix', value: 'MRO' });
    expect(res.status).toBe(403);
  });

  it('rejects a non-allow-listed key with 400', async () => {
    const res = await api()
      .put('/api/system-config')
      .set(authHeaders(ctx.adminToken))
      .send({ key: 'session_timeout_minutes', value: '60' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('wo_number_prefix');
  });

  it('the very next created work order carries the configured prefix', async () => {
    const set = await api()
      .put('/api/system-config')
      .set(authHeaders(ctx.adminToken))
      .send({ key: 'wo_number_prefix', value: 'MRO' });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ key: 'wo_number_prefix', value: 'MRO' });

    const made = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description: 'configured prefix probe',
        functionalLocationId: flatId,
        workCenterId: mcId,
        supervisorUserId: supId,
      });
    expect(made.status).toBe(201);
    expect(made.body.woNumber).toMatch(/^MRO-\d{6}$/);
    woIds.push(made.body.workOrderId);
  });

  it('the prefix is read fresh: restoring WO changes the next number back', async () => {
    const restore = await api()
      .put('/api/system-config')
      .set(authHeaders(ctx.adminToken))
      .send({ key: 'wo_number_prefix', value: 'WO' });
    expect(restore.status).toBe(200);

    const made = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'CM',
        priority: 'Medium',
        description: 'default prefix probe',
        functionalLocationId: flatId,
        workCenterId: mcId,
        supervisorUserId: supId,
      });
    expect(made.status).toBe(201);
    expect(made.body.woNumber).toMatch(/^WO-\d{6}$/);
    woIds.push(made.body.workOrderId);
  });
});

describe('PUT /api/work-order-operations/:id survives the Zod parse (SOW 3.5, :130)', () => {
  let woA = '';
  let woB = '';

  beforeAll(async () => {
    woA = await createWoDirect();
    woB = await createWoDirect();
    craftId = fitterId;
  });

  async function createOp(workOrderId: string, seq: number): Promise<string> {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.technicianToken))
      .send({
        workOrderId,
        sequenceNumber: seq,
        description: 'rule fixture step',
        craftId,
        plannedHours: 2,
        numberOfTechnicians: 3,
      });
    expect(res.status).toBe(201);
    opIds.push(res.body.operationId);
    return res.body.operationId;
  }

  it('is forbidden below Technician (403)', async () => {
    const op = await createOp(woA, 10);
    const res = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'nope' });
    expect(res.status).toBe(403);
  });

  it('applies the touched keys, drops unknowns, and cannot re-parent', async () => {
    const op = await createOp(woA, 20);
    const res = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({
        sequenceNumber: 25,
        description: 'reworded step',
        plannedHours: 4,
        numberOfTechnicians: 2,
        actualHours: 1.5,
        status: 'In Progress',
        workOrderId: woB,
        bogusField: 'x',
        isDeleted: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.sequenceNumber).toBe(25);
    expect(res.body.description).toBe('reworded step');
    expect(res.body.plannedHours).toBe(4);
    expect(res.body.numberOfTechnicians).toBe(2);
    expect(res.body.actualHours).toBe(1.5);
    expect(res.body.status).toBe('In Progress');
    expect(res.body.workOrderId).toBe(woA);

    const stored = await prisma.workOrderOperation.findUniqueOrThrow({ where: { operationId: op } });
    expect(stored.workOrderId).toBe(woA);
  });

  it('preserves fields the body does not mention', async () => {
    const op = await createOp(woA, 30);
    const res = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ description: 'only this changed' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('only this changed');
    expect(res.body.sequenceNumber).toBe(30);
    expect(res.body.plannedHours).toBe(2);
    expect(res.body.numberOfTechnicians).toBe(3);
    expect(res.body.status).toBe('Pending');
  });

  it('rejects malformed values with 400 (no coercion of strings)', async () => {
    const op = await createOp(woA, 40);
    const str = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ numberOfTechnicians: '5' });
    expect(str.status).toBe(400);

    const zero = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ sequenceNumber: 0 });
    expect(zero.status).toBe(400);

    const negative = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ plannedHours: -1 });
    expect(negative.status).toBe(400);
  });

  it('answers 404 for a missing or a soft-deleted operation', async () => {
    const missing = await api()
      .put('/api/work-order-operations/no-such-operation')
      .set(authHeaders(ctx.technicianToken))
      .send({ description: 'x' });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('Operation not found');

    const op = await createOp(woA, 50);
    await prisma.workOrderOperation.update({ where: { operationId: op }, data: { isDeleted: true } });
    const gone = await api()
      .put(`/api/work-order-operations/${op}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ description: 'x' });
    expect(gone.status).toBe(404);
  });
});