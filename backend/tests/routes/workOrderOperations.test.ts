import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let woId = '';
let craftId = '';
let opId = '';

describe('work order operations routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test ops WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        reportedByUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
    const c = await prisma.craft.findFirst({ where: { isDeleted: false } });
    craftId = c!.craftId;
  });

afterAll(async () => {
    // The helper clears the operation and its labor entries along with the work
    // order, and the audit rows for both. Deleting the operation and the order
    // separately could not have worked: this file edits the order's status, which
    // takes a snapshot, and a snapshot restricts the order. That P2003 was
    // swallowed by the `.catch` below it and the order survived every run.
    await purgeWorkOrders([woId]);
  });

  it('returns the operations for a work order', async () => {
    const res = await api().get(`/api/work-order-operations?workOrderId=${woId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.operatorToken))
      .send({ workOrderId: woId, sequenceNumber: 10, description: 'op', craftId });
    expect(res.status).toBe(403);
  });

  it('creates an operation (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, sequenceNumber: 10, description: 'test op', craftId });
    expect(res.status).toBe(201);
    opId = res.body.operationId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.adminToken))
      .send({ workOrderId: woId, sequenceNumber: -1, description: '' });
    expect(res.status).toBe(400);
  });

  it('diffs the operation columns that moved on update (row 149)', async () => {
    // Read the values first rather than hardcoding them, so the assertion is
    // about the diff and not about whatever this file happened to create.
    const prior = await prisma.workOrderOperation.findUnique({ where: { operationId: opId } });

    const res = await api()
      .put(`/api/work-order-operations/${opId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ description: 'edited step', plannedHours: 3.5 });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('edited step');

    // Row 149 (SOW 3.3.8): the columns that moved carry their old and new
    // values, so a changed labour step is reconstructable from the trail alone.
    //
    // Matched on the exact new value rather than by column name alone: a
    // name-only lookup depends on which row the database returns first once a
    // file has edited the same column more than once, and the two disagree
    // without either being wrong.
    const descriptionDiff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'WorkOrderOperation',
        recordId: opId,
        action: 'Update',
        fieldName: 'description',
        newValue: 'edited step',
      },
    });
    expect(descriptionDiff).not.toBeNull();
    expect(descriptionDiff?.oldValue).toBe(prior?.description ?? null);
    expect(descriptionDiff?.userId).toBe(ctx.adminId);

    const hoursDiff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'WorkOrderOperation',
        recordId: opId,
        action: 'Update',
        fieldName: 'plannedHours',
        newValue: '3.5',
      },
    });
    expect(hoursDiff).not.toBeNull();
    expect(hoursDiff?.oldValue).toBe(prior?.plannedHours === null || prior?.plannedHours === undefined ? '' : String(prior.plannedHours));
    expect(hoursDiff?.userId).toBe(ctx.adminId);
  });

  it('records no diff row for a column the update did not change', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Update' },
    });
    // Re-sending the value already on the row moves nothing, and the honest
    // outcome of a no-op update is an empty trail, not a row of nulls.
    const res = await api()
      .put(`/api/work-order-operations/${opId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ description: 'edited step' });
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Update' },
      })
    ).toBe(before);
  });

  it('rejects delete by a below-Technician role with 403', async () => {
    const res = await api().delete(`/api/work-order-operations/${opId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('hard-deletes an operation (Technician+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-order-operations/${opId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderOperation', recordId: opId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});