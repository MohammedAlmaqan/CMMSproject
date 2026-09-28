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
        reportedByUserId: ctx.adminId,
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
    await prisma.workOrderSnapshot.deleteMany({ where: { workOrderId: woId } }).catch(() => {});
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
});

/**
 * SOW 3.3.7: the work order cannot go In Progress until every mandatory safety
 * checklist is acknowledged, and acknowledgement is per item.
 *
 * This is the database-backed half. The pure rule is covered in
 * tests/unit/checklistRules.test.ts, but only this test proves the route reads
 * the answers rather than the checklist's status alone — which is precisely the
 * defect: the old gate passed a mandatory checklist that was signed off with
 * every item still on its 'NA' pre-fill.
 */
describe('SOW 3.3.7 mandatory checklist gate on the work order status route', () => {
  let mandatoryTemplateId = '';
  let gateWoId = '';
  let gateChecklistId = '';
  let craftId = '';
  const ids: string[] = [];

  beforeAll(async () => {
    const crafts = await api().get('/api/crafts').set(authHeaders(ctx.adminToken));
    craftId = crafts.body[0].craftId;
  });

  afterAll(async () => {
    if (gateChecklistId) {
      await prisma.workOrderChecklistItem.deleteMany({ where: { woChecklistId: gateChecklistId } });
      await prisma.workOrderChecklist.deleteMany({ where: { woChecklistId: gateChecklistId } });
    }
    if (mandatoryTemplateId) {
      await prisma.checklistItem.deleteMany({ where: { checklistTemplateId: mandatoryTemplateId } });
      await prisma.safetyChecklistTemplate.deleteMany({ where: { checklistTemplateId: mandatoryTemplateId } });
    }
if (gateWoId) {
      await prisma.workOrderOperation.deleteMany({ where: { workOrderId: gateWoId } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: gateWoId } });
      await prisma.workOrderSnapshot.deleteMany({ where: { workOrderId: gateWoId } });
      await prisma.workOrder.deleteMany({ where: { workOrderId: gateWoId } });
    }
    for (const id of ids) {
      await prisma.checklistItem.deleteMany({ where: { itemId: id } });
      await prisma.safetyChecklistTemplate.deleteMany({ where: { checklistTemplateId: id } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: id } });
    }
  });

  it('creates a mandatory template and a work order carrying an operation', async () => {
    const tpl = await api()
      .post('/api/safety-checklists/templates')
      .set(authHeaders(ctx.adminToken))
      .send({
        name: `Mandatory Gate ${Date.now()}`,
        description: 'gate test',
        isMandatory: true,
        items: [
          { sequenceNumber: 10, description: 'Gate item A' },
          { sequenceNumber: 20, description: 'Gate item B' },
        ],
      });
    expect(tpl.status).toBe(201);
    expect(tpl.body.isMandatory).toBe(true);
    mandatoryTemplateId = tpl.body.checklistTemplateId;

    const fl = await prisma.functionalLocation.findFirst({
      where: { isDeleted: false, children: { none: { isDeleted: false } } },
      select: { functionalLocationId: true },
    });
    const wc = await prisma.workCenter.findFirst({ where: { isDeleted: false } });
    const wo = await prisma.workOrder.create({
      data: {
        woNumber: `WO-G${Date.now()}`,
        type: 'CM',
        priority: 'Medium',
        status: 'Draft',
        description: 'gate test WO',
        functionalLocationId: fl!.functionalLocationId,
        workCenterId: wc!.workCenterId,
        supervisorUserId: ctx.adminId,
        reportedByUserId: ctx.adminId,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    gateWoId = wo.workOrderId;
    // An operation is required before the work order may leave Draft at all
    // (SOW 3.3.3), so add one to reach the In Progress gate under test.
    await prisma.workOrderOperation.create({
      data: {
        workOrderId: gateWoId,
        sequenceNumber: 10,
        description: 'gate op',
        craftId,
        plannedHours: 1,
        numberOfTechnicians: 1,
        createdBy: ctx.adminId,
        modifiedBy: ctx.adminId,
      },
    });
    ids.push(mandatoryTemplateId);
  });

  it('attaches the mandatory checklist with every item unanswered', async () => {
    const res = await api()
      .post(`/api/safety-checklists/work-order/${gateWoId}/attach`)
      .set(authHeaders(ctx.adminToken))
      .send({ checklistTemplateId: mandatoryTemplateId });
    expect(res.status).toBe(201);
    gateChecklistId = res.body.woChecklistId;
    // The pre-fill is gone: a freshly attached item is null, not 'NA'.
    expect(res.body.items).toHaveLength(2);
    for (const item of res.body.items) {
      expect(item.response).toBeNull();
    }
  });

  it('walks the work order to Scheduled, which the mandatory checklist does not block', async () => {
    for (const status of ['Planned', 'Scheduled']) {
      const res = await api()
        .put(`/api/work-orders/${gateWoId}/status`)
        .set(authHeaders(ctx.adminToken))
        .send({ status });
      expect(res.status).toBe(200);
    }
  });

  it('refuses In Progress while the mandatory checklist is still Pending', async () => {
    const res = await api()
      .put(`/api/work-orders/${gateWoId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'In Progress' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/must be completed/i);
  });

  it('still refuses In Progress when the checklist is Completed but no item is answered', async () => {
    // This is the regression. Signing the checklist off without answering a
    // single question used to pass, because every item was pre-filled 'NA'.
    const signoff = await api()
      .put(`/api/safety-checklists/work-order-checklist/${gateChecklistId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Completed' });
    expect(signoff.status).toBe(200);
    expect(signoff.body.status).toBe('Completed');

    const items = await prisma.workOrderChecklistItem.findMany({ where: { woChecklistId: gateChecklistId } });
    expect(items.every((i) => i.response === null)).toBe(true);

    const res = await api()
      .put(`/api/work-orders/${gateWoId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'In Progress' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/unanswered/i);
    expect(res.body.error).toMatch(/2 unanswered items/);
  });

  it('refuses In Progress when only one of the two items is answered', async () => {
    const items = await prisma.workOrderChecklistItem.findMany({
      where: { woChecklistId: gateChecklistId },
      orderBy: { itemId: 'asc' },
    });
    const res = await api()
      .put(`/api/safety-checklists/work-order-checklist-item/${items[0].woChecklistItemId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ response: 'Yes' });
    expect(res.status).toBe(200);

    const blocked = await api()
      .put(`/api/work-orders/${gateWoId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'In Progress' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/1 unanswered item/);
  });

  it('accepts NA as a deliberate answer and then allows In Progress', async () => {
    const items = await prisma.workOrderChecklistItem.findMany({
      where: { woChecklistId: gateChecklistId },
      orderBy: { itemId: 'asc' },
    });
    const res = await api()
      .put(`/api/safety-checklists/work-order-checklist-item/${items[1].woChecklistItemId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ response: 'NA' });
    expect(res.status).toBe(200);

    const started = await api()
      .put(`/api/work-orders/${gateWoId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'In Progress' });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('In Progress');
    expect(started.body.actualStart).toBeTruthy();
  });

  it('re-arms the gate when an answer is cleared back to unanswered', async () => {
    // Without this, a mistaken answer could never be corrected and the gate
    // would stay open for the rest of the work order's life.
    const items = await prisma.workOrderChecklistItem.findMany({
      where: { woChecklistId: gateChecklistId },
      orderBy: { itemId: 'asc' },
    });
    const cleared = await api()
      .put(`/api/safety-checklists/work-order-checklist-item/${items[0].woChecklistItemId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ response: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.response).toBeNull();

    const back = await prisma.workOrderChecklist.findUnique({ where: { woChecklistId: gateChecklistId } });
    expect(back!.status).toBe('In Progress');
  });
});