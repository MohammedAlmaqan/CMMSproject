import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders, purgeSafetyChecklistTemplates } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let createdId = '';
let flat = '';
let wc = '';
let sup = '';
let craftId = '';
let gateTemplateId = '';
const extraIds: string[] = [];
const checklistIds: string[] = [];

describe('work orders routes', () => {
  beforeAll(async () => {
    const [fls, wcs, crafts] = await Promise.all([
      api().get('/api/functional-locations').set(authHeaders(ctx.adminToken)),
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
      api().get('/api/crafts').set(authHeaders(ctx.adminToken)),
    ]);
    flat = fls.body[0].functionalLocationId;
    wc = wcs.body[0].workCenterId;
    sup = ctx.adminId;
    // An operation needs a craft, and the work order's own work centre is the
    // one the craft is expected to sit in, so prefer a match and fall back to
    // the first seeded craft rather than depending on seed ordering.
    const all: Array<{ craftId: string; workCenterId: string }> = crafts.body;
    craftId = (all.find((c) => c.workCenterId === wc) ?? all[0]).craftId;
  });

  /**
   * SOW 3.3.3: a work order may not leave Draft with zero operations, so every
   * test that walks a work order up the lifecycle has to give it one first.
   * The 409 is the intended behaviour, not an obstacle to route around -- see
   * the dedicated case below.
   */
  const addOperation = async (workOrderId: string) => {
    const res = await api()
      .post('/api/work-order-operations')
      .set(authHeaders(ctx.technicianToken))
      .send({
        workOrderId,
        sequenceNumber: 10,
        description: 'test operation',
        craftId,
        plannedHours: 1,
      });
    expect(res.status).toBe(201);
  };

  afterAll(async () => {
    // Hard-delete, and delete the whole subtree. Going through the DELETE route
    // soft-deleted, which leaves a row that still occupies the table - and a
    // snapshot, an operation, a checklist and a notification per order is how
    // one file left 122 rows behind in a single run. The helper also finds the
    // snapshots and children, so a work order created by a route that the test
    // never saw an id for is still collected.
    await purgeWorkOrders([createdId, ...extraIds]);
    if (gateTemplateId) {
      await purgeSafetyChecklistTemplates([gateTemplateId]);
    }
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    type: 'CM',
    priority: 'Medium',
    description: 'test work order',
    functionalLocationId: flat,
    workCenterId: wc,
    supervisorUserId: sup,
    ...overrides,
  });

  it('returns the work order list', async () => {
    const res = await api().get('/api/work-orders').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/work-orders');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Requester role with 403', async () => {
    const res = await api().post('/api/work-orders').set(authHeaders(ctx.viewOnlyToken)).send(body());
    expect(res.status).toBe(403);
  });

  it('creates a work order (Requester+) and writes an audit row', async () => {
    const res = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    expect(res.status).toBe(201);
    createdId = res.body.workOrderId;
    expect(res.body.status).toBe('Draft');
    expect(res.body.woNumber).toMatch(/^WO-/);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-orders')
      .set(authHeaders(ctx.operatorToken))
      .send({ type: 'NOPE', description: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('type');
  });

  it('rejects an invalid status transition with 400 and accepts a valid one (Technician+)', async () => {
    const bad = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Completed' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('Invalid transition');

    const op = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Planned' });
    expect(op.status).toBe(403);

    await addOperation(createdId);

    const good = await api()
      .put(`/api/work-orders/${createdId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Planned' });
    expect(good.status).toBe(200);
    expect(good.body.status).toBe('Planned');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update', fieldName: 'status' },
      })
    ).toBeGreaterThanOrEqual(1);
  });

  it('blocks In Progress while a mandatory safety checklist is incomplete and allows it once Completed', async () => {
    const tpl = await api()
      .post('/api/safety-checklists/templates')
      .set(authHeaders(ctx.adminToken))
      .send({
        name: `Mandatory Gate ${Date.now()}`,
        description: 'gate test template',
        isMandatory: true,
        items: [{ sequenceNumber: 10, description: 'Isolate the energy source' }],
      });
    expect(tpl.status).toBe(201);
    gateTemplateId = tpl.body.checklistTemplateId;

    const gated = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    const plain = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    extraIds.push(gated.body.workOrderId, plain.body.workOrderId);

    for (const id of [gated.body.workOrderId, plain.body.workOrderId]) {
      await addOperation(id);
      for (const step of ['Planned', 'Scheduled']) {
        const r = await api()
          .put(`/api/work-orders/${id}/status`)
          .set(authHeaders(ctx.technicianToken))
          .send({ status: step });
        expect(r.status).toBe(200);
      }
    }

    const attached = await api()
      .post(`/api/safety-checklists/work-order/${gated.body.workOrderId}/attach`)
      .set(authHeaders(ctx.technicianToken))
      .send({ checklistTemplateId: gateTemplateId });
    expect(attached.status).toBe(201);
    checklistIds.push(attached.body.woChecklistId);

    const blocked = await api()
      .put(`/api/work-orders/${gated.body.workOrderId}/status`)
      .set(authHeaders(ctx.technicianToken))
      .send({ status: 'In Progress' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('must be completed');

    // SOW 3.4.1: the checklist is itemised, and an itemised checklist is only
    // acknowledged when every item carries an answer. Signing the checklist off
    // while its items are blank is no longer enough, so answer them first. The
    // "Completed but nothing answered still blocks" case is asserted directly,
    // against a blank checklist, in safetyChecklists.test.ts.
    const gateItems = await prisma.workOrderChecklistItem.findMany({
      where: { woChecklistId: attached.body.woChecklistId },
      orderBy: { itemId: 'asc' },
    });
    expect(gateItems.length).toBeGreaterThan(0);
    for (const gateItem of gateItems) {
      const answered = await api()
        .put(`/api/safety-checklists/work-order-checklist-item/${gateItem.woChecklistItemId}`)
        .set(authHeaders(ctx.technicianToken))
        .send({ response: 'Yes' });
      expect(answered.status).toBe(200);
    }

    await api()
      .put(`/api/safety-checklists/work-order-checklist/${attached.body.woChecklistId}`)
      .set(authHeaders(ctx.technicianToken))
      .send({ status: 'Completed' });

    const allowed = await api()
      .put(`/api/work-orders/${gated.body.workOrderId}/status`)
      .set(authHeaders(ctx.technicianToken))
      .send({ status: 'In Progress' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.status).toBe('In Progress');

    const noChecklist = await api()
      .put(`/api/work-orders/${plain.body.workOrderId}/status`)
      .set(authHeaders(ctx.technicianToken))
      .send({ status: 'In Progress' });
    expect(noChecklist.status).toBe(200);

    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrder', recordId: gated.body.workOrderId, action: 'Blocked' },
      })
    ).toBe(1);
  });

  it('requires Supervisor+ to close a work order and lets Technician run every other transition', async () => {
    const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    extraIds.push(made.body.workOrderId);
    const id = made.body.workOrderId;
    await addOperation(id);

    for (const step of ['Planned', 'Scheduled', 'In Progress', 'Completed']) {
      const r = await api()
        .put(`/api/work-orders/${id}/status`)
        .set(authHeaders(ctx.technicianToken))
        .send({ status: step });
      expect(r.status).toBe(200);
    }

    const tech = await api()
      .put(`/api/work-orders/${id}/status`)
      .set(authHeaders(ctx.technicianToken))
      .send({ status: 'Closed' });
    expect(tech.status).toBe(403);

    const sup = await api()
      .put(`/api/work-orders/${id}/status`)
      .set(authHeaders(ctx.supervisorToken))
      .send({ status: 'Closed' });
    expect(sup.status).toBe(200);
    expect(sup.body.status).toBe('Closed');

    const stillOpen = await prisma.workOrder.findUnique({ where: { workOrderId: id } });
    expect(stillOpen!.status).toBe('Closed');
  });

  it('allows Administrator to close a work order', async () => {
    const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    extraIds.push(made.body.workOrderId);
    const id = made.body.workOrderId;
    await addOperation(id);

    for (const step of ['Planned', 'Scheduled', 'In Progress', 'Completed']) {
      const r = await api()
        .put(`/api/work-orders/${id}/status`)
        .set(authHeaders(ctx.adminToken))
        .send({ status: step });
      expect(r.status).toBe(200);
    }

    const adm = await api()
      .put(`/api/work-orders/${id}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Closed' });
    expect(adm.status).toBe(200);
    expect(adm.body.status).toBe('Closed');
  });

  it('refuses to plan a work order that has no operations, and allows it once one is added', async () => {
    // SOW 3.3.3, and the reason the lifecycle cases above all attach an
    // operation first. This is the database-backed half of the guard: the pure
    // rule is covered in tests/unit/workOrderOperationRule.test.ts, but until
    // this case existed nothing proved the route honoured it.
    const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    extraIds.push(made.body.workOrderId);
    const id = made.body.workOrderId;

    const blocked = await api()
      .put(`/api/work-orders/${id}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Planned' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/operation/i);

    // The refusal is auditable, so a planner can see why the hop was refused.
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrder', recordId: id, action: 'Blocked', fieldName: 'status' },
      })
    ).toBe(1);

    // And the work order really did stay in Draft rather than half-moving.
    expect((await prisma.workOrder.findUnique({ where: { workOrderId: id } }))!.status).toBe('Draft');

    await addOperation(id);

    const allowed = await api()
      .put(`/api/work-orders/${id}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Planned' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.status).toBe('Planned');
  });

  it('lets a work order with no operations be cancelled from Draft', async () => {
    // Cancelled is deliberately exempt: requiring an operation in order to
    // abandon an unplanned draft would be absurd. Pinning the exemption stops
    // a later tightening of the guard from quietly stranding draft work.
    const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body());
    extraIds.push(made.body.workOrderId);

    const cancelled = await api()
      .put(`/api/work-orders/${made.body.workOrderId}/status`)
      .set(authHeaders(ctx.adminToken))
      .send({ status: 'Cancelled' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('Cancelled');
  });

  it('updates a work order (Requester+) and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update' },
    });
    const res = await api()
      .put(`/api/work-orders/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated test work order' });
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update' } })
    ).toBe(before + 1);
  });

  it('diffs the columns that moved on update (row 149)', async () => {
    const prior = await prisma.workOrder.findUnique({ where: { workOrderId: createdId } });
    const nextPriority = prior?.priority === 'High' ? 'Medium' : 'High';

    const res = await api()
      .put(`/api/work-orders/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'edited by row 149', priority: nextPriority });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('edited by row 149');
    expect(res.body.priority).toBe(nextPriority);

    // Row 149 (SOW 3.3.8): a priority change has to be readable from the trail
    // without re-deriving it from another table.
    //
    // Matched on the exact new value rather than with findFirst on the column
    // name: this file has an earlier test that also edits the description, so a
    // name-only lookup can hand back that older row and the assertion then
    // depends on which row the database happens to return first.
    const descriptionDiff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'WorkOrder',
        recordId: createdId,
        action: 'Update',
        fieldName: 'description',
        newValue: 'edited by row 149',
      },
    });
    expect(descriptionDiff).not.toBeNull();
    expect(descriptionDiff?.oldValue).toBe(prior?.description);
    expect(descriptionDiff?.userId).toBe(ctx.operatorId);

    const priorityDiff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'WorkOrder',
        recordId: createdId,
        action: 'Update',
        fieldName: 'priority',
        newValue: nextPriority,
      },
    });
    expect(priorityDiff).not.toBeNull();
    expect(priorityDiff?.oldValue).toBe(prior?.priority);
    expect(priorityDiff?.userId).toBe(ctx.operatorId);
  });

  it('leaves the cost columns to costs.ts instead of logging them twice', async () => {
    // plannedCost and actualCost are absent from AUDITED_FIELDS.WorkOrder on
    // purpose: recomputeWorkOrderCosts writes its own diff for them, so a plain
    // edit of a work order with no cost inputs must add no cost diff of its own.
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update', fieldName: 'plannedCost' },
    });
    const res = await api()
      .put(`/api/work-orders/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ internalOrder: 'IO-ROW149' });
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'WorkOrder', recordId: createdId, action: 'Update', fieldName: 'plannedCost' },
      })
    ).toBe(before);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/work-orders/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a work order (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/work-orders/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'WorkOrder', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });

  /**
   * SOW 3.3.3 names "Reported By" as a header field in its own right, separate
   * from "Assigned Supervisor". The register once recorded this row's residual
   * as "Assigned Supervisor and Safety critical are absent", which was wrong:
   * supervisorUserId and safetyCriticalFlag both exist. The real gap was
   * Reported By, and the whole point of the field is that it is not createdBy.
   */
  describe('reported by', () => {
    const base = () => ({
      type: 'CM',
      priority: 'Medium',
      description: 'reporter case',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
    });

    it('defaults the reporter to the authenticated caller', async () => {
      const res = await api().post('/api/work-orders').set(authHeaders(ctx.adminToken)).send(base());
      expect(res.status).toBe(201);
      extraIds.push(res.body.workOrderId);

      const row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: res.body.workOrderId } });
      expect(row.reportedByUserId).toBe(ctx.adminId);
    });

    it('accepts an explicitly nominated reporter, without disturbing the supervisor', async () => {
      const res = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send({ ...base(), reportedByUserId: ctx.operatorId });
      expect(res.status).toBe(201);
      extraIds.push(res.body.workOrderId);

      const row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: res.body.workOrderId } });
      expect(row.reportedByUserId).toBe(ctx.operatorId);
      // Reporter and assignee are different facts about the same job.
      expect(row.supervisorUserId).toBe(sup);
    });

    it('exposes the reporter on the detail read, separately from the supervisor', async () => {
      const created = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send({ ...base(), reportedByUserId: ctx.operatorId });
      extraIds.push(created.body.workOrderId);

      const res = await api().get(`/api/work-orders/${created.body.workOrderId}`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.reportedBy?.userId).toBe(ctx.operatorId);
      expect(res.body.supervisor?.userId).toBe(sup);
    });

    it('refuses an empty reporter with a zod-derived 400', async () => {
      const res = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send({ ...base(), reportedByUserId: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('long-text notes (SOW 3.3.3)', () => {
    const base = (overrides: Record<string, unknown> = {}) => ({
      type: 'CM',
      priority: 'Medium',
      description: 'notes case',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: sup,
      ...overrides,
    });

    it('persists multi-line safety notes and completion remarks on create', async () => {
      const safetyNotes = 'Isolate the 11 kV feeder.\nWear arc-flash PPE.\nLock out / tag out.';
      const completionRemarks = 'Replaced the bearing.\nVibration back within limits.';
      const res = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send(base({ safetyNotes, completionRemarks }));
      expect(res.status).toBe(201);
      extraIds.push(res.body.workOrderId);

      const row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: res.body.workOrderId } });
      expect(row.safetyNotes).toBe(safetyNotes);
      expect(row.completionRemarks).toBe(completionRemarks);
    });

    it('leaves both notes null when they are not supplied', async () => {
      const res = await api().post('/api/work-orders').set(authHeaders(ctx.adminToken)).send(base());
      expect(res.status).toBe(201);
      extraIds.push(res.body.workOrderId);

      const row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: res.body.workOrderId } });
      expect(row.safetyNotes).toBeNull();
      expect(row.completionRemarks).toBeNull();
    });

    it('sets the notes on update and clears one without touching the other', async () => {
      const made = await api().post('/api/work-orders').set(authHeaders(ctx.adminToken)).send(base());
      expect(made.status).toBe(201);
      const id = made.body.workOrderId;
      extraIds.push(id);

      const set = await api()
        .put(`/api/work-orders/${id}`)
        .set(authHeaders(ctx.operatorToken))
        .send({ safetyNotes: 'Line 1\nLine 2', completionRemarks: 'Done' });
      expect(set.status).toBe(200);

      let row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
      expect(row.safetyNotes).toBe('Line 1\nLine 2');
      expect(row.completionRemarks).toBe('Done');
      expect(row.description).toBe('notes case');

      const clear = await api()
        .put(`/api/work-orders/${id}`)
        .set(authHeaders(ctx.operatorToken))
        .send({ completionRemarks: null });
      expect(clear.status).toBe(200);

      row = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: id } });
      expect(row.completionRemarks).toBeNull();
      // A partial update must not wipe the field it did not mention.
      expect(row.safetyNotes).toBe('Line 1\nLine 2');
    });

    it('rejects a note longer than the sanity bound with a zod-derived 400', async () => {
      const res = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send(base({ safetyNotes: 'x'.repeat(20001) }));
      expect(res.status).toBe(400);
    });
  });

  describe('work order history (SOW 3.6)', () => {
    it('writes one immutable snapshot per successful transition and none for a rejected one, then serves them oldest first', async () => {
      // The snapshot is the state the work order holds AFTER the change, so a
      // walk that started at Draft and passed through four hops leaves exactly
      // four rows, ending on the 'Completed' copy -- and a transition that the
      // route refuses must not leave a row behind.
      const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body({ description: 'history walk' }));
      expect(made.status).toBe(201);
      const id = made.body.workOrderId;
      extraIds.push(id);

      const rejected = await api()
        .put(`/api/work-orders/${id}/status`)
        .set(authHeaders(ctx.technicianToken))
        .send({ status: 'Completed' });
      expect(rejected.status).toBe(400);

      await addOperation(id);

      for (const step of ['Planned', 'Scheduled', 'In Progress', 'Completed']) {
        const r = await api()
          .put(`/api/work-orders/${id}/status`)
          .set(authHeaders(ctx.technicianToken))
          .send({ status: step });
        expect(r.status).toBe(200);
      }

      const rows = await prisma.workOrderSnapshot.findMany({
        where: { workOrderId: id },
        orderBy: { takenAt: 'asc' },
      });
      // The technician drives the walk, so every snapshot records the same
      // actor: the user who performed the transition.
      const technician = await prisma.user.findFirstOrThrow({ where: { username: 'tech1' } });
      expect(rows.map((row) => row.status)).toEqual(['Planned', 'Scheduled', 'In Progress', 'Completed']);
      for (const row of rows) {
        expect(row.takenByUserId).toBe(technician.userId);
        expect(row.status).toBe((row.snapshot as Record<string, unknown>).status);
      }

      const first = rows[0].snapshot as Record<string, unknown>;
      // The stored copy is the full scalar record, dates frozen to ISO strings.
      // (JSONB does not guarantee a key order on the way back out, so sortedness
      // is asserted on the serializer itself in tests/unit.)
      expect(first.description).toBe('history walk');
      expect(first.status).toBe('Planned');
      expect(first.workOrderId).toBe(id);
      expect(typeof first.createdDate).toBe('string');

      const res = await api().get(`/api/work-orders/${id}/history`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(4);
      expect(res.body.data.map((d: { status: string }) => d.status)).toEqual([
        'Planned',
        'Scheduled',
        'In Progress',
        'Completed',
      ]);
      expect(res.body.data[3].takenBy.userId).toBe(technician.userId);
      expect(res.body.data[3].snapshot.woNumber).toMatch(/^WO-/);
      expect(res.body.data[3].snapshot.status).toBe('Completed');
    });

    it('records the derived cost in the snapshot, not the stale cached one (R.9)', async () => {
      // The cost columns are a cache of the base relations. A snapshot is the one
      // record a later reader trusts absolutely, so if it froze the cache it would
      // turn a stale figure into something indistinguishable from a historical
      // fact. The cache is corrupted here by writing straight to Prisma -- exactly
      // what the route tests used to do -- and the snapshot must not inherit it.
      const made = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.operatorToken))
        .send(body({ description: 'snapshot cost' }));
      expect(made.status).toBe(201);
      const id = made.body.workOrderId;
      extraIds.push(id);

      await addOperation(id);

      // Derived from the operation added above, read back rather than assumed.
      const expected = await prisma.workOrder.findUniqueOrThrow({
        where: { workOrderId: id },
        select: { plannedCost: true },
      });
      expect(Number(expected.plannedCost)).toBeGreaterThan(0);

      // Corrupt the cache only. The base relations are untouched, so the derived
      // figure is unchanged and any snapshot recording zero is recording the cache.
      await prisma.workOrder.update({
        where: { workOrderId: id },
        data: { plannedCost: 0, actualCost: 0 },
      });

      const moved = await api()
        .put(`/api/work-orders/${id}/status`)
        .set(authHeaders(ctx.technicianToken))
        .send({ status: 'Planned' });
      expect(moved.status).toBe(200);

      const snap = await prisma.workOrderSnapshot.findFirstOrThrow({ where: { workOrderId: id } });
      const json = snap.snapshot as Record<string, unknown>;

      // The snapshot carries the derived figure...
      expect(json.plannedCost).toBe(Number(expected.plannedCost));
      // ...and the cache has been repaired to match it, so the two cannot diverge.
      const after = await prisma.workOrder.findUniqueOrThrow({
        where: { workOrderId: id },
        select: { plannedCost: true, actualCost: true },
      });
      expect(Number(after.plannedCost)).toBe(Number(expected.plannedCost));
      expect(json.plannedCost).toBe(Number(after.plannedCost));
    });

    it('does not write a snapshot for a plain edit, and a deleted work order stops serving history from the API', async () => {
      const made = await api().post('/api/work-orders').set(authHeaders(ctx.operatorToken)).send(body({ description: 'edit no snapshot' }));
      expect(made.status).toBe(201);
      const id = made.body.workOrderId;
      extraIds.push(id);

      const edited = await api()
        .put(`/api/work-orders/${id}`)
        .set(authHeaders(ctx.operatorToken))
        .send({ description: 'edited, still no snapshot' });
      expect(edited.status).toBe(200);

      await addOperation(id);
      const moved = await api()
        .put(`/api/work-orders/${id}/status`)
        .set(authHeaders(ctx.technicianToken))
        .send({ status: 'Planned' });
      expect(moved.status).toBe(200);

      // One snapshot: the edit must not have produced one.
      expect(await prisma.workOrderSnapshot.count({ where: { workOrderId: id } })).toBe(1);
      expect(moved.body.status).toBe('Planned');

      await api().delete(`/api/work-orders/${id}`).set(authHeaders(ctx.adminToken));

      // The history endpoint mirrors GET /:id: a retired work order is not
      // served any more. The immutable rows themselves are kept -- there is no
      // delete path for them anywhere -- so nothing a reviewer needs has been
      // destroyed, it has just stopped being read from the API.
      const res = await api().get(`/api/work-orders/${id}/history`).set(authHeaders(ctx.adminToken));
      expect(res.status).toBe(404);
      expect(await prisma.workOrderSnapshot.count({ where: { workOrderId: id } })).toBe(1);
    });

    it('returns 401 without a token and 404 for an unknown work order', async () => {
      const anon = await api().get('/api/work-orders/not-a-real-id/history');
      expect(anon.status).toBe(401);

      const unknown = await api().get('/api/work-orders/not-a-real-id/history').set(authHeaders(ctx.adminToken));
      expect(unknown.status).toBe(404);
    });
  });
});