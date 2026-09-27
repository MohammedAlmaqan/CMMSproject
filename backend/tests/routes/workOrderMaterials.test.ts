import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let materialId = '';
let woMatId = '';

describe('work order materials routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test mat WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        reportedByUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
    materialId = (await prisma.material.findFirst({ where: { isDeleted: false } }))!.materialId;
  });

  afterAll(async () => {
    if (woMatId) {
      await prisma.workOrderMaterial.deleteMany({ where: { woMaterialId: woMatId } }).catch(() => {});
    }
    await prisma.auditLogEntry.deleteMany({ where: { recordId: woId } }).catch(() => {});
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  /**
   * SOW 3.3.4 "Vendor must implement a material reservation concept".
   *
   * `reservationQuantity` was already stored on every write. The gap was that
   * nothing acted on it, so these cases pin down the behaviour that makes it a
   * reservation: a second job cannot take stock the first job is holding, a
   * line can be raised against its own reservation, and a finished job lets go.
   */
  describe('material reservation', () => {
    let stockMaterialId = '';
    let reservationWoId = '';
    let otherWoId = '';
    const createdLineIds: string[] = [];

    beforeAll(async () => {
      const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
      const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;

      // An isolated material, so the shared material master's own reservations
      // cannot influence the expected totals.
      const m = await prisma.material.create({
        data: {
          materialCode: `RSV-${Date.now()}`,
          description: 'reservation test stock',
          unitOfMeasure: 'EA',
          standardCost: 10,
          currentStock: 100,
        },
      });
      stockMaterialId = m.materialId;

      // A work order of this block's own. The release case cancels a work
      // order, and the outer suite shares one -- cancelling that one would leave
      // later tests running against a job nobody asked to cancel.
      const reservation = await prisma.workOrder.create({
        data: {
          woNumber: `WO-T${Date.now()}-RES`,
          type: 'CM',
          priority: 'Medium',
          status: 'Draft',
          description: 'job holding the reservation',
          functionalLocationId: fl.functionalLocationId,
          workCenterId: wc.workCenterId,
          supervisorUserId: ctx.adminId,
          reportedByUserId: ctx.adminId,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });
      reservationWoId = reservation.workOrderId;

      const other = await prisma.workOrder.create({
        data: {
          woNumber: `WO-T${Date.now()}-R`,
          type: 'CM',
          priority: 'Medium',
          status: 'Draft',
          description: 'second job competing for the same stock',
          functionalLocationId: fl.functionalLocationId,
          workCenterId: wc.workCenterId,
          supervisorUserId: ctx.adminId,
          reportedByUserId: ctx.adminId,
          createdBy: ctx.adminId,
          modifiedBy: ctx.adminId,
        },
      });
      otherWoId = other.workOrderId;
    });

    afterAll(async () => {
      for (const id of createdLineIds) {
        await prisma.workOrderMaterial.deleteMany({ where: { woMaterialId: id } }).catch(() => {});
      }
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: createdLineIds } } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: [reservationWoId, otherWoId] } } }).catch(() => {});
      await prisma.workOrder.deleteMany({ where: { workOrderId: { in: [reservationWoId, otherWoId] } } }).catch(() => {});
      await prisma.material.deleteMany({ where: { materialId: stockMaterialId } }).catch(() => {});
    });

    async function reserve(workOrder: string, quantity: number) {
      const res = await api()
        .post('/api/work-order-materials')
        .set(authHeaders(ctx.adminToken))
        .send({ workOrderId: workOrder, materialId: stockMaterialId, plannedQuantity: quantity, reservationQuantity: quantity });
      if (res.status === 201) createdLineIds.push(res.body.woMaterialId);
      return res;
    }

    it('reports availability on the material detail read', async () => {
      const res = await api().get(`/api/materials/${stockMaterialId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.availability.currentStock).toBe(100);
      expect(res.body.availability.reservedQuantity).toBe(0);
      expect(res.body.availability.availableQuantity).toBe(100);
    });

    it('reserves against the live job and reduces what is available', async () => {
      const res = await reserve(reservationWoId, 30);
      expect(res.status).toBe(201);
      expect(res.body.availability.reservedQuantity).toBe(30);
      expect(res.body.availability.availableQuantity).toBe(70);
    });

    it('refuses a second job reserving stock the first job already holds', async () => {
      const res = await reserve(otherWoId, 80);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already reserved');
      // The refusal must actually have prevented the line, not merely complained.
      const count = await prisma.workOrderMaterial.count({
        where: { workOrderId: otherWoId, materialId: stockMaterialId },
      });
      expect(count).toBe(0);
    });

    it('allows the second job to take only what is genuinely free', async () => {
      const res = await reserve(otherWoId, 70);
      expect(res.status).toBe(201);
      expect(res.body.availability.reservedQuantity).toBe(100);
      expect(res.body.availability.availableQuantity).toBe(0);
    });

    it('raises an existing line against its own reservation without counting the old value twice', async () => {
      const line = await prisma.workOrderMaterial.findFirstOrThrow({
        where: { workOrderId: reservationWoId, materialId: stockMaterialId },
      });
      // Everything is already reserved, so this only succeeds if the line's own
      // 30 is excluded from the check before the 30 is added back.
      const res = await api()
        .put(`/api/work-order-materials/${line.woMaterialId}`)
        .set(authHeaders(ctx.adminToken))
        .send({ reservationQuantity: 30 });
      expect(res.status).toBe(200);
      expect(res.body.availability.reservedQuantity).toBe(100);
    });

    it('releases the reservation when the holding work order is cancelled', async () => {
      await prisma.workOrder.update({ where: { workOrderId: reservationWoId }, data: { status: 'Cancelled' } });

      const res = await api().get(`/api/materials/${stockMaterialId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      // The cancelled job's 30 is no longer holding anything; the live job's 70 is.
      expect(res.body.availability.reservedQuantity).toBe(70);
      expect(res.body.availability.availableQuantity).toBe(30);
    });
  });

  it('returns the materials for a work order', async () => {
    const res = await api().get(`/api/work-order-materials?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.operatorToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: 2 });
    expect(res.status).toBe(403);
  });

  it('creates a WO material (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: 2 });
    expect(res.status).toBe(201);
    woMatId = res.body.woMaterialId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderMaterial', recordId: woMatId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-order-materials')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, materialId, plannedQuantity: -5 });
    expect(res.status).toBe(400);
  });

  it('hard-deletes a WO material (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-order-materials/${woMatId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderMaterial', recordId: woMatId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});