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

  // SOW 3.1.4 also requires a task list to be associable with an equipment
  // class or a specific piece of equipment. Both columns had existed since the
  // schema was written and the API had always persisted, filtered on and
  // returned them, but no case here proved it - the row was held Partial on the
  // strength of an untested claim rather than an observed defect. These cases
  // close that: association set, read back through a second request, filtered
  // on, and cleared.
  describe('equipment class and asset association (SOW 3.1.4)', () => {
    const CLASS_NAME = `PUMP-STATION-${stamp}`;
    const OTHER_CLASS_NAME = `VALVE-STATION-${stamp}`;
    const assocIds: string[] = [];
    let assetOne = '';
    let assetTwo = '';

    beforeAll(async () => {
      // Two distinct real assets. equipmentId is a foreign key onto Equipment, so
      // this cannot be exercised with an arbitrary string - which is itself worth
      // asserting rather than working around.
      const eqs = await api().get('/api/equipment').set(authHeaders(ctx.adminToken));
      const live = eqs.body.filter((e: { isDeleted: boolean }) => !e.isDeleted);
      expect(live.length).toBeGreaterThanOrEqual(2);
      assetOne = live[0].equipmentId;
      assetTwo = live[1].equipmentId;
      expect(assetOne).not.toBe(assetTwo);
    });

    afterAll(async () => {
      await purgeTaskLists(assocIds);
    });

    const mk = async (extra: Record<string, unknown>, suffix: string) => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLA-${suffix}-${Date.now()}`,
          description: `association ${suffix}`,
          workCenterId,
          ...extra,
        });
      expect(res.status).toBe(201);
      assocIds.push(res.body.taskListId);
      return res;
    };

    it('persists an equipment class and returns it with no asset set', async () => {
      const res = await mk({ equipmentClass: CLASS_NAME }, 'CLASS');

      expect(res.body.equipmentClass).toBe(CLASS_NAME);
      expect(res.body.equipmentId).toBeNull();
      // A second request, so this is persistence and not just an echo of the body.
      const read = await api().get(`/api/task-lists/${res.body.taskListId}`).set(authHeaders(ctx.operatorToken));
      expect(read.status).toBe(200);
      expect(read.body.equipmentClass).toBe(CLASS_NAME);
      expect(read.body.equipmentId).toBeNull();
    });

    it('persists a specific asset and returns it with no class set', async () => {
      const res = await mk({ equipmentId: assetOne }, 'ASSET');

      expect(res.body.equipmentId).toBe(assetOne);
      expect(res.body.equipmentClass).toBeNull();
      const read = await api().get(`/api/task-lists/${res.body.taskListId}`).set(authHeaders(ctx.operatorToken));
      expect(read.body.equipmentId).toBe(assetOne);
      expect(read.body.equipmentClass).toBeNull();
    });

    it('refuses an asset that does not exist, rather than storing a dangling reference', async () => {
      const res = await api()
        .post('/api/task-lists')
        .set(authHeaders(ctx.operatorToken))
        .send({
          code: `TLA-BAD-${Date.now()}`,
          description: 'unknown asset',
          workCenterId,
          equipmentId: 'no-such-equipment',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const stored = await prisma.taskList.count({
        where: { code: { startsWith: 'TLA-BAD-' }, isDeleted: false },
      });
      expect(stored).toBe(0);
    });

    it('filters by equipment class, and a class query does not match an asset-scoped list', async () => {
      const mine = await mk({ equipmentClass: CLASS_NAME }, 'FILTERCLASS');
      // Same asset as another list, different class: proves the class filter is
      // a real predicate and not a substring match on the wrong column.
      const otherClass = await mk(
        { equipmentClass: OTHER_CLASS_NAME, equipmentId: assetTwo },
        'FILTEROTHER',
      );

      const res = await api()
        .get(`/api/task-lists?equipmentClass=${encodeURIComponent(CLASS_NAME)}`)
        .set(authHeaders(ctx.operatorToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const ids = res.body.map((t: { taskListId: string }) => t.taskListId);
      expect(ids).toContain(mine.body.taskListId);
      expect(ids).not.toContain(otherClass.body.taskListId);
      // Every row returned actually carries the class that was asked for.
      for (const t of res.body) {
        expect(t.equipmentClass).toBe(CLASS_NAME);
      }
    });

    it('filters by specific asset, excluding the class-wide list and any other asset', async () => {
      const scoped = await mk({ equipmentId: assetOne }, 'FILTERASSET');
      const classWide = await mk({ equipmentClass: CLASS_NAME }, 'FILTERWIDE');
      const otherAsset = await mk({ equipmentId: assetTwo }, 'FILTEROTHERASSET');

      const res = await api()
        .get(`/api/task-lists?equipmentId=${encodeURIComponent(assetOne)}`)
        .set(authHeaders(ctx.operatorToken));
      expect(res.status).toBe(200);

      const ids = res.body.map((t: { taskListId: string }) => t.taskListId);
      expect(ids).toContain(scoped.body.taskListId);
      expect(ids).not.toContain(classWide.body.taskListId);
      expect(ids).not.toContain(otherAsset.body.taskListId);
      for (const t of res.body) {
        expect(t.equipmentId).toBe(assetOne);
      }
    });

    it('clears both associations back to a fleet-wide routine', async () => {
      const res = await mk({ equipmentClass: CLASS_NAME, equipmentId: assetOne }, 'CLEAR');

      // null is the clearing contract: both columns are nullable in
      // taskListUpdateSchema. An empty string is not accepted for equipmentId,
      // which is min(1), so sending '' fails validation before the route runs.
      const put = await api()
        .put(`/api/task-lists/${res.body.taskListId}`)
        .set(authHeaders(ctx.operatorToken))
        .send({ equipmentClass: null, equipmentId: null });
      expect(put.status).toBe(200);
      expect(put.body.equipmentClass).toBeNull();
      expect(put.body.equipmentId).toBeNull();

      const read = await api().get(`/api/task-lists/${res.body.taskListId}`).set(authHeaders(ctx.operatorToken));
      expect(read.body.equipmentClass).toBeNull();
      expect(read.body.equipmentId).toBeNull();

      // And the cleared list is no longer reachable through either filter.
      for (const query of [`equipmentId=${encodeURIComponent(assetOne)}`, `equipmentClass=${encodeURIComponent(CLASS_NAME)}`]) {
        const filtered = await api().get(`/api/task-lists?${query}`).set(authHeaders(ctx.operatorToken));
        const ids = filtered.body.map((t: { taskListId: string }) => t.taskListId);
        expect(ids).not.toContain(res.body.taskListId);
      }
    });
  });
});