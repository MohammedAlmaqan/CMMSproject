import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.1.4: work orders can copy operations from a reusable task list.
//
// The matrix held this row at "IMPLEMENTED, NOT VERIFIED": `taskListId` never
// appeared in any route test, so the create path that copies steps — in the same
// transaction as the work order — had never been called. It must copy the steps,
// their per-step required materials, and the pricing: planned material cost is
// plannedQuantity x unitCost, so a copied requirement must carry the material's
// standard cost rather than the default zero.

let flat = '';
let wc = '';
let craftId = '';
let materialA = '';
let materialB = '';
let templateId = '';
let createdIds: string[] = [];

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const body = (overrides: Record<string, unknown> = {}) => ({
  type: 'CM',
  priority: 'Medium',
  description: 'template copy work order',
  functionalLocationId: flat,
  workCenterId: wc,
  supervisorUserId: ctx.adminId,
  ...overrides,
});

describe('copying operations from a task list into a work order (SOW 3.1.4)', () => {
  beforeAll(async () => {
    const [fls, wcs, crafts] = await Promise.all([
      api().get('/api/functional-locations').set(authHeaders(ctx.adminToken)),
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
      api().get('/api/crafts').set(authHeaders(ctx.adminToken)),
    ]);
    flat = fls.body[0].functionalLocationId;
    wc = wcs.body[0].workCenterId;
    const all: Array<{ craftId: string; workCenterId: string }> = crafts.body;
    craftId = (all.find((c) => c.workCenterId === wc) ?? all[0]).craftId;

    // Isolated materials rather than the shared master's first two rows: the
    // parallel workers keep mutating that catalog, and a concurrent delete of a
    // picked row would race the copying path mid-test.
    const [a, b] = await Promise.all([
      prisma.material.create({
        data: {
          materialCode: `TPC-A-${Date.now()}`,
          description: 'template fixture A',
          unitOfMeasure: 'EA',
          standardCost: 12.5,
          currentStock: 0,
        },
      }),
      prisma.material.create({
        data: {
          materialCode: `TPC-B-${Date.now()}`,
          description: 'template fixture B',
          unitOfMeasure: 'EA',
          standardCost: 0,
          currentStock: 0,
        },
      }),
    ]);
    materialA = a.materialId;
    materialB = b.materialId;
  });

afterAll(async () => {
    for (const id of createdIds) {
      await api().delete(`/api/work-orders/${id}`).set(authHeaders(ctx.adminToken)).catch(() => {});
    }
    await prisma.workOrderMaterial.deleteMany({ where: { materialId: { in: [materialA, materialB] } } }).catch(() => {});
    if (templateId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: templateId } }).catch(() => {});
      await prisma.taskListMaterial.deleteMany({ where: { taskOperation: { taskListId: templateId } } }).catch(() => {});
      await prisma.taskListOperation.deleteMany({ where: { taskListId: templateId } }).catch(() => {});
      await prisma.taskList.deleteMany({ where: { taskListId: templateId } }).catch(() => {});
    }
    await prisma.material.deleteMany({ where: { materialId: { in: [materialA, materialB] } } }).catch(() => {});
  });

  it('copies the template operations and their per-step materials into the draft', async () => {
    const tpl = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({
        code: `TPC-${stamp}`,
        description: 'template copy fixture',
        workCenterId: wc,
        operations: [
          {
            sequenceNumber: 10,
            description: 'step one',
            craftId,
            plannedHours: 2,
            numberOfTechnicians: 1,
            materials: [{ materialId: materialA, quantity: 3 }],
          },
          {
            sequenceNumber: 20,
            description: 'step two',
            craftId,
            plannedHours: 1,
            numberOfTechnicians: 2,
            materials: [{ materialId: materialB, quantity: 0 }],
          },
        ],
      });
    expect(tpl.status).toBe(201);
    templateId = tpl.body.taskListId;
    expect(tpl.body.operations.length).toBe(2);
    expect(tpl.body.operations[0].materials[0].materialId).toBe(materialA);

    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send(body({ taskListId: templateId, description: 'copied from template' }));
    expect(res.status).toBe(201);
    createdIds.push(res.body.workOrderId);

    const operations = await prisma.workOrderOperation.findMany({
      where: { workOrderId: res.body.workOrderId },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(operations.length).toBe(2);
    // The template plan is copied verbatim: sequence, craft, planned hours,
    // technician count, and the deliberate Pending/zero-actuals starting state.
    expect(operations.map((o) => o.sequenceNumber)).toEqual([10, 20]);
    expect(operations.map((o) => o.craftId)).toEqual([craftId, craftId]);
    expect(operations.map((o) => o.plannedHours)).toEqual([2, 1]);
    expect(operations.map((o) => o.numberOfTechnicians)).toEqual([1, 2]);
    for (const op of operations) {
      expect(op.status).toBe('Pending');
      expect(op.actualHours).toBe(0);
    }

    const materialLines = await prisma.workOrderMaterial.findMany({
      where: { workOrderId: res.body.workOrderId },
      include: { material: true },
      // Order by the step, not the line id: UUID ordering is arbitrary and must
      // not decide which line lands on sequence 10.
      orderBy: { operation: { sequenceNumber: 'asc' } },
    });
    expect(materialLines.length).toBe(2);
    // Each requirement lands against the step it was attached to, priced at the
    // material's standard cost, issued as a plan (zero actual, zero reserved).
    const [lineA, lineB] = materialLines;
    expect(lineA.operationId).toBe(operations[0].operationId);
    expect(lineA.materialId).toBe(materialA);
    expect(lineA.plannedQuantity).toBe(3);
    expect(Number(lineA.unitCost)).toBe(12.5);
    expect(Number(lineA.unitCost)).toBe(Number(lineA.material.standardCost || 0));
    expect(lineA.actualQuantity).toBe(0);
    expect(lineA.reservationQuantity).toBe(0);
    expect(lineB.operationId).toBe(operations[1].operationId);
    expect(lineB.materialId).toBe(materialB);
    expect(lineB.plannedQuantity).toBe(0);
    expect(Number(lineB.unitCost)).toBe(0);
  });

  it('refuses an unknown task list with 400 before writing the work order', async () => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send(body({ taskListId: 'not-a-real-task-list' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/task list not found/i);
  });

  it('refuses a template with no operations, which would violate SOW 3.3.3', async () => {
    const empty = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({ code: `TPC-E-${stamp}`, description: 'empty template', workCenterId: wc });
    expect(empty.status).toBe(201);

    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send(body({ taskListId: empty.body.taskListId }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no operations/i);

    await prisma.auditLogEntry.deleteMany({ where: { recordId: empty.body.taskListId } }).catch(() => {});
    await prisma.taskList.deleteMany({ where: { taskListId: empty.body.taskListId } }).catch(() => {});
  });
});