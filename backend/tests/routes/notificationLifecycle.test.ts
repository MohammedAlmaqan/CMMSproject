import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

// SOW 3.2.x (matrix :104, :106, :108, :115, :116): M3 completion confirmation,
// the notification transition validity map driven through the live routes,
// the mandatory location/equipment pair, the two-way work-order navigation
// link, and the auto-close of linked notifications on completion. The pure
// map (notificationLifecycle.test.ts) and the zod contract
// (notificationLocationSelection.test.ts) were already covered; none of these
// behaviours had been observed against live rows through the routes.

type Notification = {
  notificationId: string;
  notificationNumber: string;
  type: string;
  priority: string;
  status: string;
  description: string;
  breakdownFlag: boolean;
  reportedByUserId: string;
  createdBy: string;
  modifiedBy: string;
};

let techId = '';
let supId = '';
let flatId = '';
let flat2Id = '';
let equipId = '';
let equipFlId = '';
let mcId = '';
let fitterId = '';
const woIds: string[] = [];
const notifIds: string[] = [];
const opIds: string[] = [];
const snapshotIds: string[] = [];

const stamp = Date.now();
let nseq = 0;
const nextSeq = () => (nseq += 1);

async function createWoDirect(args: {
  status: string;
  woNumber: string;
  priority?: string;
  withBat?: boolean;
}): Promise<string> {
  const wo = await prisma.workOrder.create({
    data: {
      woNumber: args.woNumber,
      type: 'CM',
      priority: args.priority ?? 'Medium',
      status: args.status,
      description: 'notification lifecycle fixture',
      functionalLocationId: flatId,
      workCenterId: mcId,
      breakdownFlag: args.withBat ?? false,
      supervisorUserId: supId,
      reportedByUserId: techId,
      createdBy: techId,
      modifiedBy: techId,
    },
  });
  woIds.push(wo.workOrderId);
  return wo.workOrderId;
}

async function createOperation(workOrderId: string): Promise<void> {
  const op = await prisma.workOrderOperation.create({
    data: {
      workOrderId,
      sequenceNumber: 10,
      description: 'lifecycle fixture step',
      craftId: fitterId,
      plannedHours: 2,
    },
  });
  opIds.push(op.operationId);
}

async function createNotifDirect(args: {
  type?: string;
  status: string;
  description: string;
}): Promise<Notification> {
  const n = await prisma.notification.create({
    data: {
      notificationNumber: `NFX-${stamp}-${nextSeq()}`,
      type: args.type ?? 'M1',
      priority: 'Medium',
      functionalLocationId: flatId,
      description: args.description,
      reportedByUserId: techId,
      status: args.status,
      breakdownFlag: false,
      createdBy: techId,
      modifiedBy: techId,
    },
  });
  notifIds.push(n.notificationId);
  return n;
}

async function linkNotification(workOrderId: string, notificationId: string): Promise<void> {
  await prisma.workOrderNotifLink.create({
    data: { workOrderId, notificationId },
  });
}

async function walkStatus(token: string, workOrderId: string, path: string[]): Promise<void> {
  for (const s of path) {
    const res = await api()
      .put(`/api/work-orders/${workOrderId}/status`)
      .set(authHeaders(token))
      .send({ status: s });
    expect(res.status).toBe(200);
  }
}

beforeAll(async () => {
  const tech = await prisma.user.findFirst({ where: { username: 'tech1' } });
  const sup = await prisma.user.findFirst({ where: { username: 'supervisor' } });
  const [locations, equip, mech, fitter] = await Promise.all([
    prisma.functionalLocation.findMany({ where: { isDeleted: false }, orderBy: { locationCode: 'asc' } }),
    prisma.equipment.findFirst({ where: { equipmentCode: 'P-1001', isDeleted: false } }),
    prisma.workCenter.findFirst({ where: { code: 'MECH', isDeleted: false } }),
    prisma.craft.findFirst({ where: { craftCode: 'FITTER', isDeleted: false } }),
  ]);
  if (!tech || !sup || !equip || !mech || !fitter || locations.length < 2) {
    throw new Error('seeded users, equipment, work center or locations not found');
  }
  techId = tech.userId;
  supId = sup.userId;
  flatId = locations[0].functionalLocationId;
  flat2Id = locations[1].functionalLocationId;
  equipId = equip.equipmentId;
  equipFlId = equip.functionalLocationId;
  mcId = mech.workCenterId;
  fitterId = fitter.craftId;
});

afterAll(async () => {
  await prisma.auditLogEntry
    .deleteMany({ where: { recordId: { in: [...notifIds, ...woIds] } } })
    .catch(() => {});
  await prisma.workOrderNotifLink
    .deleteMany({ where: { OR: [{ workOrderId: { in: woIds } }, { notificationId: { in: notifIds } }] } })
    .catch(() => {});
  await prisma.workOrderSnapshot
    .deleteMany({ where: { workOrderId: { in: woIds } } })
    .catch(() => {});
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { notificationId: { in: notifIds } } }).catch(() => {});
});

describe('notification mandatory location/equipment pair (SOW 3.2.2, :108)', () => {
  it('refuses a notification with neither location nor equipment (400)', async () => {
    const res = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M1',
        priority: 'High',
        description: 'mandatory pair refusal',
        reportedByUserId: techId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('functionalLocationId');
    expect(res.body.error).toContain('mandatory');
  });

  it('derives the functional location from the equipment when only equipment is given', async () => {
    const res = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M1',
        priority: 'High',
        description: 'location derived from equipment',
        equipmentId: equipId,
        reportedByUserId: techId,
      });
    expect(res.status).toBe(201);
    expect(res.body.functionalLocationId).toBe(equipFlId);
    expect(res.body.status).toBe('Open');
    notifIds.push(res.body.notificationId);
  });

  it('rejects a location that contradicts the equipment (400)', async () => {
    const other = equipFlId === flatId ? flat2Id : flatId;
    const res = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M1',
        priority: 'Low',
        description: 'contradictory pair refusal',
        functionalLocationId: other,
        equipmentId: equipId,
        reportedByUserId: techId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Equipment is not located at the selected functional location');
  });

  it('rejects an equipment that does not exist in the catalog (400)', async () => {
    const res = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M2',
        priority: 'Low',
        description: 'unknown equipment refusal',
        equipmentId: 'no-such-equipment',
        reportedByUserId: techId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Equipment not found');
  });
});

describe('notification to work-order navigation link (SOW 3.2.3, :115)', () => {
  let notifId = '';
  let woId = '';

  it('convert-to-wo links the notification and turns it into a Draft work order', async () => {
    const created = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M1',
        priority: 'Medium',
        description: 'convert navigation fixture',
        equipmentId: equipId,
        reportedByUserId: techId,
      });
    expect(created.status).toBe(201);
    notifId = created.body.notificationId;

    const conv = await api()
      .post(`/api/notifications/${notifId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(conv.status).toBe(201);
    expect(conv.body.status).toBe('Draft');
    expect(conv.body.type).toBe('CM');
    woId = conv.body.workOrderId;
    woIds.push(woId);

    const after = await prisma.notification.findUniqueOrThrow({ where: { notificationId: notifId } });
    expect(after.status).toBe('Converted');
  });

  it('GET /api/notifications/:id exposes the linked work order', async () => {
    const res = await api().get(`/api/notifications/${notifId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    const link = res.body.workOrders?.[0];
    expect(link).toBeTruthy();
    expect(link.workOrder.workOrderId).toBe(woId);
    expect(link.workOrder.woNumber).toBeTruthy();
    expect(link.workOrder.status).toBe('Draft');
    expect(link.workOrder.type).toBe('CM');
  });

  it('GET /api/work-orders/:id exposes the attached notification', async () => {
    const res = await api().get(`/api/work-orders/${woId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    const n = res.body.notifications?.[0];
    expect(n).toBeTruthy();
    expect(n.notification.notificationId).toBe(notifId);
    expect(n.notification.notificationNumber).toBeTruthy();
    expect(n.notification.status).toBe('Converted');
  });
});

describe('notification transition validity driven both ways (SOW 3.2.3, :116)', () => {
  it('rejects a Completed notification being reopened with a Blocked audit trail', async () => {
    const n = await createNotifDirect({ status: 'Open', description: 'transition reopen fixture' });

    const ok = await api()
      .put(`/api/notifications/${n.notificationId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Completed' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('Completed');

    const bad = await api()
      .put(`/api/notifications/${n.notificationId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Open' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid transition from 'Completed' to 'Open'");
    expect(bad.body.currentStatus).toBe('Completed');
    expect(bad.body.allowedTransitions).toEqual([]);

    const blocked = await prisma.auditLogEntry.findFirst({
      where: { recordId: n.notificationId, action: 'Blocked', fieldName: 'status' },
    });
    expect(blocked).toBeTruthy();
    expect(blocked?.oldValue).toBe('Completed');
    expect(blocked?.newValue).toBe('Open');
  });

  it('rejects an In Process notification being stepped back to Open', async () => {
    const n = await createNotifDirect({ status: 'In Process', description: 'transition rewind fixture' });
    const res = await api()
      .put(`/api/notifications/${n.notificationId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ status: 'Open' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid transition from 'In Process' to 'Open'");
  });

  it('refuses to convert a Completed notification to a work order', async () => {
    const n = await createNotifDirect({ status: 'Completed', description: 'convert refusal fixture' });
    const res = await api()
      .post(`/api/notifications/${n.notificationId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid transition from 'Completed' to 'Converted'");
    expect(res.body.allowedTransitions).toEqual([]);
  });

  it('refuses to convert the same notification twice', async () => {
    const created = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M2',
        priority: 'Low',
        description: 'double convert fixture',
        equipmentId: equipId,
        reportedByUserId: techId,
      });
    expect(created.status).toBe(201);
    notifIds.push(created.body.notificationId);

    const first = await api()
      .post(`/api/notifications/${created.body.notificationId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(first.status).toBe(201);
    woIds.push(first.body.workOrderId);

    const second = await api()
      .post(`/api/notifications/${created.body.notificationId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('Notification already converted');
  });
});

describe('M3 completion confirmation (SOW 3.2.4, :104)', () => {
  let woId = '';
  let woNumber = '';
  let m3: Notification | null = null;

  it('auto-creates an M3 notification when the work order is completed', async () => {
    woId = await createWoDirect({ status: 'In Progress', priority: 'High', woNumber: `WO-NAV-${stamp}-${nextSeq()}` });
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderId: woId } });
    woNumber = wo.woNumber;

    await walkStatus(ctx.technicianToken, woId, ['Completed']);

    m3 = await prisma.notification.findFirst({
      where: { description: `Completion confirmation for work order ${woNumber}`, isDeleted: false },
    });
    expect(m3).toBeTruthy();
    expect(m3?.type).toBe('M3');
    expect(m3?.status).toBe('Open');
    expect(m3?.reportedByUserId).toBe(techId);
    expect(m3?.createdBy).toBe(techId);
    expect(m3?.modifiedBy).toBe(techId);
    expect(m3?.priority).toBe('High');
    expect(m3?.breakdownFlag).toBe(false);
    expect(m3?.functionalLocationId).toBe(flatId);
    expect(m3?.notificationNumber).toMatch(/^N-\d{6}$/);
    if (m3) notifIds.push(m3.notificationId);
  });

  it('serves the M3 back through the public notification list', async () => {
    const res = await api()
      .get('/api/notifications')
      .set(authHeaders(ctx.viewOnlyToken))
      .query({ search: woNumber });
    expect(res.status).toBe(200);
    const found = (res.body.data ?? res.body ?? []).some(
      (n: Notification) => n.notificationId === m3?.notificationId,
    );
    expect(found).toBe(true);
  });
});

describe('linked notifications auto-close on completion (SOW 3.2.5, :104)', () => {
  it('drives a Converted notification to Completed when its work order completes', async () => {
    const created = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M3',
        priority: 'Medium',
        description: 'auto-close fixture via convert',
        equipmentId: equipId,
        reportedByUserId: techId,
      });
    expect(created.status).toBe(201);
    const notifId = created.body.notificationId;

    const conv = await api()
      .post(`/api/notifications/${notifId}/convert-to-wo`)
      .set(authHeaders(ctx.adminToken));
    expect(conv.status).toBe(201);
    const woId = conv.body.workOrderId;
    woIds.push(woId);
    notifIds.push(notifId);

    await createOperation(woId);
    await walkStatus(ctx.technicianToken, woId, ['Planned', 'Scheduled', 'In Progress', 'Completed']);

    const after = await prisma.notification.findUniqueOrThrow({ where: { notificationId: notifId } });
    expect(after.status).toBe('Completed');

    const audit = await prisma.auditLogEntry.findFirst({
      where: {
        recordId: notifId,
        action: 'Update',
        fieldName: 'status',
        oldValue: 'Converted',
        newValue: 'Completed',
      },
    });
    expect(audit).toBeTruthy();
  });

  it('leaves an already-Completed linked notification untouched', async () => {
    const woId = await createWoDirect({ status: 'In Progress', woNumber: `WO-NAV-${stamp}-${nextSeq()}` });
    const n = await createNotifDirect({ status: 'Completed', description: 'already completed fixture' });
    await linkNotification(woId, n.notificationId);

    const before = await prisma.notification.findUniqueOrThrow({ where: { notificationId: n.notificationId } });
    await walkStatus(ctx.technicianToken, woId, ['Completed']);
    const after = await prisma.notification.findUniqueOrThrow({ where: { notificationId: n.notificationId } });

    expect(after.status).toBe('Completed');
    expect(after.modifiedBy).toBe(before.modifiedBy);
    expect(after.modifiedDate.toISOString()).toBe(before.modifiedDate.toISOString());

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordId: n.notificationId, action: 'Update', fieldName: 'status', newValue: 'Completed' },
    });
    expect(audit).toBeFalsy();
  });

  it('does not touch a notification that shares the location but has no link', async () => {
    const woId = await createWoDirect({ status: 'In Progress', woNumber: `WO-NAV-${stamp}-${nextSeq()}` });
    const n = await createNotifDirect({ status: 'Open', description: 'unlinked same-location fixture' });

    await walkStatus(ctx.technicianToken, woId, ['Completed']);
    const after = await prisma.notification.findUniqueOrThrow({ where: { notificationId: n.notificationId } });
    expect(after.status).toBe('Open');
  });
});