import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.7 (matrix :140): labour is attributed to the authenticated
// technician; a client-supplied userId cannot turn a Technician's booking
// into someone else's. The pure policy (laborAttribution.test.ts) and the
// zod/source contract (laborSchema.test.ts) were covered, but no route test
// ever asserted who the stored entry belongs to, and the blocked/override
// paths had never been observed through HTTP against live rows.

let tech1Id = '';
let tech2Id = '';
let supId = '';
let flatId = '';
let mcId = '';
let fitterId = '';
let fitterRate = 0;
let woId = '';
let wo2Id = '';
let opId = '';
const laborIds: string[] = [];

const stamp = Date.now();
let nseq = 0;
const nextSeq = () => (nseq += 1);

async function createWo(): Promise<string> {
  const wo = await prisma.workOrder.create({
    data: {
      woNumber: `WO-LBR-${stamp}-${nextSeq()}`,
      type: 'CM',
      priority: 'Medium',
      status: 'In Progress',
      description: 'labour attribution fixture',
      functionalLocationId: flatId,
      workCenterId: mcId,
      supervisorUserId: supId,
      reportedByUserId: tech1Id,
      createdBy: ctx.adminId,
      modifiedBy: ctx.adminId,
    },
  });
  return wo.workOrderId;
}

async function createOp(workId: string): Promise<string> {
  const op = await prisma.workOrderOperation.create({
    data: {
      workOrderId: workId,
      sequenceNumber: 10,
      description: 'labour fixture step',
      craftId: fitterId,
      plannedHours: 2,
    },
  });
  return op.operationId;
}

const cleanBlockedRows = async () => {
  await prisma.auditLogEntry
    .deleteMany({ where: { tableName: 'LaborEntry', action: 'Blocked' } })
    .catch(() => {});
};

afterAll(async () => {
  await cleanBlockedRows();
  await prisma.auditLogEntry
    .deleteMany({ where: { recordId: { in: [...laborIds, opId, woId, wo2Id] } } })
    .catch(() => {});
  await prisma.laborEntry.deleteMany({ where: { laborEntryId: { in: laborIds } } }).catch(() => {});
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: [woId, wo2Id] } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { workOrderId: { in: [woId, wo2Id] } } }).catch(() => {});
});

beforeAll(async () => {
  const [tech1, tech2, sup, loc, mech, fitter] = await Promise.all([
    prisma.user.findFirst({ where: { username: 'tech1' } }),
    prisma.user.findFirst({ where: { username: 'tech2' } }),
    prisma.user.findFirst({ where: { username: 'supervisor' } }),
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.workCenter.findFirst({ where: { code: 'MECH', isDeleted: false } }),
    prisma.craft.findFirst({ where: { craftCode: 'FITTER', isDeleted: false } }),
  ]);
  if (!tech1 || !tech2 || !sup || !loc || !mech || !fitter) {
    throw new Error('seeded users, location, work center or craft not found');
  }
  tech1Id = tech1.userId;
  tech2Id = tech2.userId;
  supId = sup.userId;
  flatId = loc.functionalLocationId;
  mcId = mech.workCenterId;
  fitterId = fitter.craftId;
  fitterRate = Number(fitter.hourlyRate);

  woId = await createWo();
  wo2Id = await createWo();
  opId = await createOp(woId);
});

describe('labour attribution to the authenticated technician (SOW 3.7, :140)', () => {
  it('books without a body userId against the session technician', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: opId, hoursWorked: 2 });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(tech1Id);
    expect(res.body.operationId).toBe(opId);
    laborIds.push(res.body.laborEntryId);
  });

  it('accepts a body userId that matches the caller', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: opId, hoursWorked: 1, userId: tech1Id });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(tech1Id);
    laborIds.push(res.body.laborEntryId);
  });

  it('refuses a Technician booking hours for another user (403) and records nothing', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: opId, hoursWorked: 2, userId: tech2Id });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Labour is attributed to the authenticated user');
    expect(res.body.attributedUserId).toBe(tech1Id);
    expect(res.body.requestedUserId).toBe(tech2Id);

    const none = await prisma.laborEntry.count({ where: { operationId: opId, userId: tech2Id } });
    expect(none).toBe(0);

    const blocked = await prisma.auditLogEntry.findFirst({
      where: { tableName: 'LaborEntry', action: 'Blocked', recordId: 'uncreated', fieldName: 'userId' },
    });
    expect(blocked).toBeTruthy();
    expect(blocked?.newValue).toBe(tech2Id);
  });

  it('lets a Maintenance Supervisor book on behalf of another user (override)', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.supervisorToken))
      .send({ operationId: opId, hoursWorked: 3, userId: tech2Id });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(tech2Id);
    laborIds.push(res.body.laborEntryId);
  });

  it('answers 404 when an override names a user that does not exist', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.supervisorToken))
      .send({ operationId: opId, hoursWorked: 1, userId: 'no-such-user' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('answers 404 for an operation that does not exist', async () => {
    const res = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: 'no-such-operation', hoursWorked: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Operation not found');
  });

  it('requires the workOrderId query on the list (400)', async () => {
    const missing = await api().get('/api/labor').set(authHeaders(ctx.viewOnlyToken));
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('workOrderId query parameter is required');

    const listed = await api()
      .get('/api/labor')
      .set(authHeaders(ctx.viewOnlyToken))
      .query({ workOrderId: woId });
    expect(listed.status).toBe(200);
    const ours = listed.body.filter((e: { userId: string }) => e.userId === tech1Id || e.userId === tech2Id);
    expect(ours.length).toBeGreaterThanOrEqual(3);
    expect(ours[0].user).toBeTruthy();
    expect(ours[0].operation.operationId).toBe(opId);
  });

  it('feeds hours into the work order actual cost at the craft rate', async () => {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: woId } });
    expect(Number(wo.actualCost)).toBe(Math.round(6 * fitterRate * 100) / 100);
  });

  it('PUT keeps the stored technician when userId is omitted and recomputes cost', async () => {
    const entry = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: opId, hoursWorked: 1 });
    expect(entry.status).toBe(201);
    laborIds.push(entry.body.laborEntryId);

    const updated = await api()
      .put(`/api/labor/${entry.body.laborEntryId}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ hoursWorked: 5 });
    expect(updated.status).toBe(200);
    expect(updated.body.userId).toBe(tech1Id);
    expect(updated.body.hoursWorked).toBe(5);

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: woId } });
    const labourHours = await prisma.laborEntry.aggregate({
      where: { operationId: opId, isDeleted: false },
      _sum: { hoursWorked: true },
    });
    expect(Number(wo.actualCost)).toBe(Number((labourHours._sum.hoursWorked ?? 0)) * fitterRate);
  });

  it('PUT refuses a Technician reassigning the entry to another user (403 + Blocked audit)', async () => {
    const entry = await api()
      .post('/api/labor')
      .set(authHeaders(ctx.technicianToken))
      .send({ operationId: opId, hoursWorked: 1 });
    expect(entry.status).toBe(201);
    laborIds.push(entry.body.laborEntryId);

    const res = await api()
      .put(`/api/labor/${entry.body.laborEntryId}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ userId: tech2Id });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Labour is attributed to the authenticated user');

    const stored = await prisma.laborEntry.findUniqueOrThrow({ where: { laborEntryId: entry.body.laborEntryId } });
    expect(stored.userId).toBe(tech1Id);

    const blocked = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'LaborEntry',
        action: 'Blocked',
        recordId: entry.body.laborEntryId,
        fieldName: 'userId',
      },
    });
    expect(blocked).toBeTruthy();
    expect(blocked?.newValue).toBe(tech2Id);
  });

  it('answers 401 without a token', async () => {
    const res = await api()
      .post('/api/labor')
      .send({ operationId: opId, hoursWorked: 1 });
    expect(res.status).toBe(401);
  });
});