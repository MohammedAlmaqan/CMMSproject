import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let templateId = '';
let woId = '';
let woChecklistId = '';
let itemIds: string[] = [];

describe('safety checklists routes', () => {
  beforeAll(async () => {
    const fl = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))!;
    const wc = (await prisma.workCenter.findFirst({ where: { isDeleted: false } }))!;
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-T${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'test checklist WO',
        functionalLocationId: fl.functionalLocationId,
        workCenterId: wc.workCenterId,
        supervisorUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    woId = wo.workOrderId;
  });

  afterAll(async () => {
    if (woChecklistId) {
      await prisma.workOrderChecklistItem.deleteMany({ where: { woChecklistId } }).catch(() => {});
      await prisma.workOrderChecklist.deleteMany({ where: { woChecklistId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: woChecklistId } }).catch(() => {});
    }
    if (templateId) {
      await prisma.checklistItem.deleteMany({ where: { checklistTemplateId: templateId } }).catch(() => {});
      await prisma.safetyChecklistTemplate.deleteMany({ where: { checklistTemplateId: templateId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: templateId } }).catch(() => {});
    }
    await prisma.workOrder.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
  });

  const templateBody = () => ({
    name: 'Test Checklist',
    description: 'test items',
    items: [
      { sequenceNumber: 10, description: 'Check item A' },
      { sequenceNumber: 20, description: 'Check item B' },
    ],
  });

  it('returns the template list', async () => {
    const res = await api().get('/api/safety-checklists/templates').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects template create by a below-Planner role with 403', async () => {
    const res = await api().post('/api/safety-checklists/templates').set(authHeaders(ctx.operatorToken)).send(templateBody());
    expect(res.status).toBe(403);
  });

  it('creates a template (Planner+) and writes an audit row', async () => {
    const res = await api().post('/api/safety-checklists/templates').set(authHeaders(ctx.adminToken)).send(templateBody());
    expect(res.status).toBe(201);
    templateId = res.body.checklistTemplateId;
    itemIds = res.body.items.map((i: { itemId: string }) => i.itemId);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'SafetyChecklistTemplate', recordId: templateId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed template with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/safety-checklists/templates')
      .set(authHeaders(ctx.adminToken))
      .send({ name: 'x', description: 'x', items: [] });
    expect(res.status).toBe(400);
  });

  it('rejects attach by a below-Technician role with 403', async () => {
    const res = await api()
      .post(`/api/safety-checklists/work-order/${woId}/attach`)
      .set(authHeaders(ctx.operatorToken))
      .send({ checklistTemplateId: templateId });
    expect(res.status).toBe(403);
  });

  it('attaches a checklist to a work order (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post(`/api/safety-checklists/work-order/${woId}/attach`)
      .set(authHeaders(ctx.adminToken))
      .send({ checklistTemplateId: templateId });
    expect(res.status).toBe(201);
    woChecklistId = res.body.woChecklistId;
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrderChecklist', recordId: woChecklistId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects checklist delete by a below-Technician role with 403', async () => {
    const res = await api().delete(`/api/safety-checklists/work-order-checklist/${woChecklistId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('deletes a work order checklist (Technician+), this time creating a fresh one', async () => {
    const created = await api()
      .post(`/api/safety-checklists/work-order/${woId}/attach`)
      .set(authHeaders(ctx.adminToken))
      .send({ checklistTemplateId: templateId });
    const tmpId = created.body.woChecklistId;
    const res = await api().delete(`/api/safety-checklists/work-order-checklist/${tmpId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    await prisma.workOrderChecklistItem.deleteMany({ where: { woChecklistId: tmpId } }).catch(() => {});
    await prisma.workOrderChecklist.deleteMany({ where: { woChecklistId: tmpId } }).catch(() => {});
    await prisma.auditLogEntry.deleteMany({ where: { recordId: tmpId } }).catch(() => {});
  });
})