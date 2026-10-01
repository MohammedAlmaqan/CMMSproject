import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeTaskLists } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const code = `TL-T${stamp}`;
let createdId = '';
let workCenterId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'TaskList', recordId, action },
  });
}

// The list this file creates in its main body. Declared out here, with the other
// teardown, because it was previously never deleted: it held no operations, so
// nothing in the file had a reason to remember it after the assertions passed.
const rootIds: string[] = [];

describe('task lists routes', () => {
  beforeAll(async () => {
    const wcs = await api().get('/api/work-centers').set(authHeaders(ctx.adminToken));
    workCenterId = wcs.body[0].workCenterId;
  });

  afterAll(async () => {
    await purgeTaskLists([createdId, ...rootIds]);
  });

  it('returns the task list list', async () => {
    const res = await api().get('/api/task-lists').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/task-lists');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ code, description: 'x', workCenterId });
    expect(res.status).toBe(403);
  });

  it('creates a task list (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({ code, description: 'test task list', workCenterId });
    expect(res.status).toBe(201);
    createdId = res.body.taskListId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({ code: '', description: 'x', workCenterId: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workCenterId');
  });

  it('updates a task list (soft-replace operations) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/task-lists/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated task list' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated task list');
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/task-lists/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a task list (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/task-lists/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });

  describe('per-step required materials (SOW 3.1.4)', () => {
    let craftId = '';
    let materialA = '';
    let materialB = '';
    let matTemplateId = '';
    const tmpIds: string[] = [];

    beforeAll(async () => {
      const crafts = await api().get('/api/crafts').set(authHeaders(ctx.adminToken));
      craftId = crafts.body[0].craftId;
      const mats = await prisma.material.findMany({
        where: { isDeleted: false },
        orderBy: { materialCode: 'asc' },
        take: 2,
      });
      materialA = mats[0].materialId;
      materialB = mats[1].materialId;
    });

    afterAll(async () => {
      // One helper for the whole subtree: the steps, the per-step materials and
      // the list itself. The previous teardown ran the four deletes separately
      // with each error swallowed, so a single failure left the list in place -
      // which is why 53 of the task lists in the database had a `TL-T` code and
      // no owner.
      await purgeTaskLists([...tmpIds, matTemplateId]);
    });

    it('persists and returns the materials each step requires', async () => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLM-${Date.now()}`,
          description: 'per-step materials',
          workCenterId,
          operations: [
            {
              sequenceNumber: 10,
              description: 'needs one part',
              craftId,
              plannedHours: 1,
              materials: [{ materialId: materialA, quantity: 3 }],
            },
            {
              sequenceNumber: 20,
              description: 'needs another',
              craftId,
              plannedHours: 1,
              materials: [{ materialId: materialB, quantity: 1 }],
            },
          ],
        });
      expect(res.status).toBe(201);
      matTemplateId = res.body.taskListId;
      tmpIds.push(matTemplateId);
      expect(res.body.operations.length).toBe(2);

      // Each step answers with its own requirement, not a merged list-level one.
      const op10 = res.body.operations.find((o: any) => o.sequenceNumber === 10);
      const op20 = res.body.operations.find((o: any) => o.sequenceNumber === 20);
      expect(op10.materials).toEqual([expect.objectContaining({ materialId: materialA, quantity: 3 })]);
      expect(op20.materials).toEqual([expect.objectContaining({ materialId: materialB, quantity: 1 })]);

      const rows = await prisma.taskListMaterial.findMany({
        where: { taskOperation: { taskListId: matTemplateId } },
      });
      expect(rows.length).toBe(2);
      expect(rows.map((r) => r.materialId).sort()).toEqual([materialA, materialB].sort());

      // The detail read carries the same requirements.
      const detail = await api().get(`/api/task-lists/${matTemplateId}`).set(authHeaders(ctx.adminToken));
      expect(detail.status).toBe(200);
      expect(detail.body.operations.length).toBe(2);
    });

    it('refuses the same material twice on one step (400)', async () => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLD-${Date.now()}`,
          description: 'duplicate requirement fixture',
          workCenterId,
          operations: [
            {
              sequenceNumber: 10,
              description: 'lists the same part twice',
              craftId,
              plannedHours: 1,
              materials: [
                { materialId: materialA, quantity: 1 },
                { materialId: materialA, quantity: 2 },
              ],
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/more than once/);
    });

    it('accepts a zero quantity as "required, not yet quantified"', async () => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLZ-${Date.now()}`,
          description: 'zero quantity means required but unquantified',
          workCenterId,
          operations: [
            {
              sequenceNumber: 10,
              description: 'unquantified step',
              craftId,
              plannedHours: 1,
              materials: [{ materialId: materialA, quantity: 0 }],
            },
          ],
        });
      expect(res.status).toBe(201);
      tmpIds.push(res.body.taskListId);
      expect(
        (await prisma.taskListMaterial.findFirstOrThrow({
          where: { taskOperation: { taskListId: res.body.taskListId } },
        })).quantity
      ).toBe(0);
    });

    it('rejects a negative quantity, which would reduce stock when issued', async () => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLN-${Date.now()}`,
          description: 'negative quantity fixture',
          workCenterId,
          operations: [
            {
              sequenceNumber: 10,
              description: 'negative step',
              craftId,
              plannedHours: 1,
              materials: [{ materialId: materialA, quantity: -1 }],
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('quantity');
    });
  });
});