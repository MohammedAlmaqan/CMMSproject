import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const equipmentCode = `EQ-T${stamp}`;
let createdId = '';
let flat = '';
let wc = '';

describe('equipment routes', () => {
  beforeAll(async () => {
    // SOW 3.1.2 / equipment.ts:515: equipment may only be placed at a
    // lowest-level functional location, which locationRules.ts defines
    // structurally as one with no non-deleted children. Picking an arbitrary
    // first row therefore only worked by accident: it was green for as long as
    // the seed happened to put a leaf at the front, and broke as soon as
    // Phase C added locations ahead of it. Select a real leaf, deterministically.
    const leaf = await prisma.functionalLocation.findFirst({
      where: { isDeleted: false, children: { none: { isDeleted: false } } },
      select: { functionalLocationId: true },
      orderBy: { functionalLocationId: 'asc' },
    });
    if (!leaf) throw new Error('no lowest-level functional location in the seed; equipment tests cannot run');
    flat = leaf.functionalLocationId;

    const center = await prisma.workCenter.findFirst({
      where: { isDeleted: false },
      select: { workCenterId: true },
      orderBy: { workCenterId: 'asc' },
    });
    if (!center) throw new Error('no work center in the seed; equipment tests cannot run');
    wc = center.workCenterId;
  });

  afterAll(async () => {
    if (createdId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } });
      await prisma.equipment.deleteMany({ where: { equipmentId: createdId } });
    }
  });

  it('returns the seeded equipment list', async () => {
    const res = await api().get('/api/equipment').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/equipment');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.operatorToken))
      .send({ equipmentCode, name: 'Test Pump', functionalLocationId: flat, criticality: 'B' });
    expect(res.status).toBe(403);
  });

  it('creates equipment (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode, name: 'Test Pump', functionalLocationId: flat, criticality: 'B', operationalStatus: 'Active' });
    expect(res.status).toBe(201);
    createdId = res.body.equipmentId;
    expect(res.body.equipmentCode).toBe(equipmentCode);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Equipment', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode: '', name: '', functionalLocationId: '', criticality: 'Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('criticality');
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/equipment/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes equipment (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/equipment/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Equipment', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });

  describe('equipment maintenance history (SOW 3.6)', () => {
    let hisId = '';
    const hisCodes: string[] = [];
    const waIds: string[] = [];

    afterAll(async () => {
      for (const id of waIds) {
        await prisma.workOrder.deleteMany({ where: { workOrderId: id } });
        await prisma.auditLogEntry.deleteMany({ where: { recordId: id } });
      }
      if (hisId) {
        await prisma.auditLogEntry.deleteMany({ where: { recordId: hisId } });
        await prisma.equipment.deleteMany({ where: { equipmentId: hisId } });
      }
    });

    const createHisEquipment = async () => {
      const code = `EQH-${Date.now()}`;
      hisCodes.push(code);
      const res = await api()
        .post('/api/equipment')
        .set(authHeaders(ctx.adminToken))
        .send({
          equipmentCode: code,
          name: 'History Test Pump',
          functionalLocationId: flat,
          criticality: 'B',
          operationalStatus: 'Active',
        });
      expect(res.status).toBe(201);
      return res.body.equipmentId as string;
    };

    it('returns the maintenance history newest-to-oldest with date, type, cost and downtime hours', async () => {
      hisId = await createHisEquipment();

      const wo = async (type: string) => {
        const res = await api()
          .post('/api/work-orders')
          .set(authHeaders(ctx.operatorToken))
          .send({
            type,
            priority: 'Medium',
            description: `history ${type}`,
            functionalLocationId: flat,
            workCenterId: wc,
            equipmentId: hisId,
            supervisorUserId: ctx.adminId,
          });
        expect(res.status).toBe(201);
        waIds.push(res.body.workOrderId);
        return res.body.workOrderId as string;
      };

      // Order is by createdDate, and two rows created in the same millisecond
      // could tie, so force the chronology, the costs and the downtime directly
      // on the rows the same way a maintenance team records them, then read
      // through the API. plannedCost and actualCost are bookkeeping fields the
      // create schema deliberately does not accept, so they are set this way.
      const firstId = await wo('CM');
      const secondId = await wo('PM');
      const base = new Date();
      await prisma.workOrder.update({
        where: { workOrderId: firstId },
        data: {
          createdDate: new Date(base.getTime() - 60_000),
          plannedCost: 100,
          actualCost: 110,
          actualStart: base,
          actualFinish: new Date(base.getTime() + 90 * 60_000),
        },
      });
      await prisma.workOrder.update({
        where: { workOrderId: secondId },
        data: { createdDate: base },
      });
      expect(firstId).toBeTruthy();

      const res = await api().get(`/api/equipment/${hisId}/history`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.map((d: { type: string }) => d.type)).toEqual(['CM', 'PM']);

      const cm = res.body.data[0];
      expect(cm.workOrderId).toBe(firstId);
      expect(cm.woNumber).toMatch(/^WO-/);
      expect(cm.downtimeHours).toBe(1.5);
      expect(cm.cost).toBe(110);
      expect(cm.plannedCost).toBe(100);
      expect(cm.downtimeHours).not.toBeNull();
    });

    it('paginates through the whole history and excludes soft-deleted work orders', async () => {
      const page1 = await api().get(`/api/equipment/${hisId}/history?skip=0&take=1`).set(authHeaders(ctx.adminToken));
      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(1);
      expect(page1.body.total).toBe(2);
      expect(page1.body.data[0].type).toBe('CM');

      const page2 = await api().get(`/api/equipment/${hisId}/history?skip=1&take=1`).set(authHeaders(ctx.adminToken));
      expect(page2.body.data[0].type).toBe('PM');

      // Deleting a work order retires it from the equipment's maintenance
      // history: a cancelled or wrongly-created job is not maintenance done.
      const gone = waIds[1];
      await api().delete(`/api/work-orders/${gone}`).set(authHeaders(ctx.adminToken));

      const after = await api().get(`/api/equipment/${hisId}/history`).set(authHeaders(ctx.adminToken));
      expect(after.body.total).toBe(1);
      expect(after.body.data[0].workOrderId).toBe(waIds[0]);
      expect(after.body.data[0].downtimeHours).toBe(1.5);
    });

    it('returns a 404 for an unknown or deleted equipment', async () => {
      const missing = await api().get('/api/equipment/not-a-real-id/history').set(authHeaders(ctx.adminToken));
      expect(missing.status).toBe(404);
    });
  });
});