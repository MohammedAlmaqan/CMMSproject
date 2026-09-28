import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.3 (matrix :89): work centers and crafts feed scheduling and cost
// estimation — the capacity board. buildCapacityBoard was pure-function tested
// in capacity.test.ts but had never executed against live rows: the seed ships
// no work orders, so a route call had zero effect to observe. These cases run
// GET /api/work-centers/capacity with fixture work orders of their own and
// assert the resulting board shape and the load/capacity arithmetic.

type BoardEntry = {
  workCenterId: string;
  workCenterCode: string;
  name: string;
  capacityHours: number;
  days: Array<{ date: string; plannedHours: number; capacityHours: number; utilisation: number | null; overCapacity: boolean; crafts: Array<{ craftId: string; plannedHours: number }> }>;
  unscheduledHours: number;
  unscheduledWorkOrders: string[];
};

const base = '2031-01-05';

let mechId = '';
let elecId = '';
let instId = '';
let fitterId = '';
let welderId = '';
let elecTechId = '';
let instTechId = '';
let flId = '';
const woIds: string[] = [];
const opIds: string[] = [];

const stamp = Date.now();
let seq = 0;
const next = () => (seq += 1);

async function createWo(args: {
  workCenterId: string;
  status: string;
  plannedStart?: string | null;
  plannedFinish?: string | null;
}): Promise<string> {
  const wo = await prisma.workOrder.create({
    data: {
      woNumber: `WO-CAP-${stamp}-${next()}`,
      type: 'CM',
      priority: 'Medium',
      status: args.status,
      description: 'capacity board fixture',
      functionalLocationId: flId,
      workCenterId: args.workCenterId,
      plannedStart: args.plannedStart ? new Date(args.plannedStart) : null,
      plannedFinish: args.plannedFinish ? new Date(args.plannedFinish) : null,
      supervisorUserId: ctx.adminId,
      reportedByUserId: ctx.adminId,
      createdBy: ctx.adminId,
      modifiedBy: ctx.adminId,
    },
  });
  woIds.push(wo.workOrderId);
  return wo.workOrderId;
}

async function addOperation(workOrderId: string, craftId: string, plannedHours: number): Promise<void> {
  const op = await prisma.workOrderOperation.create({
    data: {
      workOrderId,
      sequenceNumber: 10,
      description: 'capacity fixture step',
      craftId,
      plannedHours,
    },
  });
  opIds.push(op.operationId);
}

beforeAll(async () => {
  const [mech, elec, inst, fl] = await Promise.all([
    prisma.workCenter.findFirst({ where: { code: 'MECH', isDeleted: false } }),
    prisma.workCenter.findFirst({ where: { code: 'ELEC', isDeleted: false } }),
    prisma.workCenter.findFirst({ where: { code: 'INST', isDeleted: false } }),
    prisma.functionalLocation.findFirst({ where: { isDeleted: false } }),
  ]);
  if (!mech || !elec || !inst || !fl) throw new Error('seeded work centers or locations not found');
  mechId = mech.workCenterId;
  elecId = elec.workCenterId;
  instId = inst.workCenterId;
  flId = fl.functionalLocationId;

  const crafts = await prisma.craft.findMany({ where: { isDeleted: false } });
  const byCode = new Map(crafts.map((c) => [c.craftCode, c.craftId]));
  fitterId = byCode.get('FITTER')!;
  welderId = byCode.get('WELDER')!;
  elecTechId = byCode.get('ELEC_TECH')!;
  instTechId = byCode.get('INST_TECH')!;

  // MECH carries 6 h of work on the single board day: 4 h Fitter + 2 h Welder.
  await addOperation(await createWo({ workCenterId: mechId, status: 'In Progress', plannedStart: `${base}T08:00:00Z`, plannedFinish: `${base}T17:00:00Z` }), fitterId, 4);
  await addOperation(await createWo({ workCenterId: mechId, status: 'Scheduled', plannedStart: `${base}T08:00:00Z`, plannedFinish: `${base}T17:00:00Z` }), welderId, 2);

  // A Draft must NOT consume capacity: the board plans real work, and a
  // proposal waiting for approval is not work being scheduled.
  await addOperation(await createWo({ workCenterId: mechId, status: 'Draft', plannedStart: `${base}T08:00:00Z`, plannedFinish: `${base}T17:00:00Z` }), fitterId, 100);

  // Undated work is surfaced separately, never placed on a day it may not start.
  await addOperation(await createWo({ workCenterId: elecId, status: 'Planned', plannedStart: null, plannedFinish: null }), elecTechId, 6);

  // INST over its 8 h/day ceiling on the single day.
  await addOperation(await createWo({ workCenterId: instId, status: 'In Progress', plannedStart: `${base}T08:00:00Z`, plannedFinish: `${base}T17:00:00Z` }), instTechId, 10);
});

afterAll(async () => {
  await prisma.workOrderOperation.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
});

describe('work center capacity board (SOW 3.1.3, :89)', () => {
  it('builds the board from live data for the requested window', async () => {
    const res = await api()
      .get('/api/work-centers/capacity')
      .set(authHeaders(ctx.viewOnlyToken))
      .query({ from: base, to: base });
    expect(res.status).toBe(200);
    expect(res.body.from).toBe(base);
    expect(res.body.to).toBe(base);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(3);

    const codes = res.body.entries.map((e: BoardEntry) => e.workCenterCode);
    expect(codes).toContain('MECH');
    expect(codes).toContain('ELEC');
    expect(codes).toContain('INST');
  });

  it('spreads each work order across its calendar days and charges capacity', async () => {
    const res = await api()
      .get('/api/work-centers/capacity')
      .set(authHeaders(ctx.operatorToken))
      .query({ from: base, to: base });
    const mech = res.body.entries.find((e: BoardEntry) => e.workCenterCode === 'MECH');

    expect(mech.capacityHours).toBe(8);
    expect(mech.days.length).toBe(1);
    const day = mech.days[0];
    expect(day.date).toBe(base);
    // 4 + 2 planned hours land exactly on the single day; the 100 h Draft is excluded.
    expect(day.plannedHours).toBe(6);
    expect(day.capacityHours).toBe(8);
    expect(day.utilisation).toBe(0.75);
    expect(day.overCapacity).toBe(false);
    // Both MECH crafts are present, someone else's craft is not, sorted desc.
    expect(day.crafts).toEqual([
      { craftId: fitterId, plannedHours: 4 },
      { craftId: welderId, plannedHours: 2 },
    ]);
  });

  it('surfaces undated work as unscheduled instead of pinning it to a day', async () => {
    const res = await api()
      .get('/api/work-centers/capacity')
      .set(authHeaders(ctx.operatorToken))
      .query({ from: base, to: base });
    const elec = res.body.entries.find((e: BoardEntry) => e.workCenterCode === 'ELEC');

    expect(elec.days.every((d: { plannedHours: number }) => d.plannedHours === 0)).toBe(true);
    expect(elec.unscheduledHours).toBe(6);
    expect(elec.unscheduledWorkOrders.length).toBe(1);
  });

  it('flags a work center whose window load exceeds its daily capacity', async () => {
    const res = await api()
      .get('/api/work-centers/capacity')
      .set(authHeaders(ctx.operatorToken))
      .query({ from: base, to: base });
    const inst = res.body.entries.find((e: BoardEntry) => e.workCenterCode === 'INST');

    expect(inst.days[0].plannedHours).toBe(10);
    expect(inst.days[0].capacityHours).toBe(8);
    expect(inst.days[0].overCapacity).toBe(true);
    expect(inst.days[0].utilisation).toBe(1.25);
  });

  it('rejects an inverted date range with 400', async () => {
    const res = await api()
      .get('/api/work-centers/capacity')
      .set(authHeaders(ctx.operatorToken))
      .query({ from: base, to: '2030-12-01' });
    expect(res.status).toBe(400);
  });

  it('requires a caller (401 without a token)', async () => {
    const res = await api().get('/api/work-centers/capacity').query({ from: base, to: base });
    expect(res.status).toBe(401);
  });
});