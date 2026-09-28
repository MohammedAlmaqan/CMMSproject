import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SOW 3.4.3, the parts of generation that are about *how* the work order is
 * written rather than what it contains.
 *
 * These cases run without a database on purpose. The transaction-boundary
 * dispatch in particular cannot be covered by the DB-backed suite, and it is
 * where a real defect lived: a transaction client has no `$transaction` method,
 * so calling it threw `db.$transaction is not a function` and every generation
 * returned 500. Nothing in the integration tests explains that; a stub does.
 */

const mocks = vi.hoisted(() => ({
  woCounter: { n: 0 },
}));

vi.mock('../../src/utils/sequence.js', () => ({
  generateWoNumber: vi.fn(async () => `WO-${(mocks.woCounter.n += 1)}`),
  generateNotifNumber: vi.fn(async () => 'NTF-1'),
  nextSequence: vi.fn(async () => 1),
}));

vi.mock('../../src/utils/prisma.js', () => ({ prisma: { $transaction: undefined } }));

import { baseCycleKey, generatePmWorkOrder, PmGenerationError, storedCycleKey } from '../../src/services/pmGeneration.js';

type PlanOverrides = Record<string, unknown>;

function plan(over: PlanOverrides = {}) {
  return {
    planId: 'P1',
    planCode: 'PM-1',
    description: 'inspect',
    workCenterId: 'WC1',
    createdBy: 'U1',
    priority: 'Medium',
    generatedWorkOrderStatus: 'Draft',
    notificationId: null,
    equipmentId: 'E1',
    functionalLocationId: null,
    equipment: { equipmentId: 'E1', functionalLocationId: 'F1' },
    targets: [
      {
        planTargetId: 'T1',
        equipmentId: 'E1',
        functionalLocationId: null,
        equipment: { equipmentId: 'E1', functionalLocationId: 'F1' },
        functionalLocation: null,
      },
    ],
    taskList: {
      operations: [{ sequenceNumber: 10, description: 'align', craftId: 'C1', plannedHours: 1, numberOfTechnicians: 1 }],
    },
    notification: null,
    ...over,
  };
}

function stubDb(opts: { plan?: ReturnType<typeof plan>; existing?: { workOrderId: string; woNumber: string } | null; withTransaction?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const client = {
    maintenancePlan: {
      findFirst: vi.fn(async () => (opts.plan === null ? null : (opts.plan ?? plan()))),
    },
    workOrder: {
      findFirst: vi.fn(async () => opts.existing ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { workOrderId: 'WO1', ...data };
      }),
    },
    workOrderOperation: { create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ notificationId: 'N1', ...data })) },
    workOrderNotifLink: { create: vi.fn(async () => ({})) },
    equipment: { findUnique: vi.fn(async () => null) },
  };
  const db = opts.withTransaction ? { ...client, $transaction: async (fn: (tx: unknown) => unknown) => fn(client) } : client;
  return { db: db as never, client, created };
}

const input = { planId: 'P1', cycleKey: '2026-03-02', basis: 'Time' as const, actorUserId: 'scheduler' };

beforeEach(() => {
  mocks.woCounter.n = 0;
});

describe('cycle keys', () => {
  it('appends the target for a D-10 plan', () => {
    expect(storedCycleKey('2026-03-02', 'T1')).toBe('2026-03-02#T1');
  });

  it('leaves a single-target cycle key bare', () => {
    expect(storedCycleKey('2026-03-02', null)).toBe('2026-03-02');
  });

  it('recovers the cycle day from a targeted key', () => {
    expect(baseCycleKey('2026-03-02#T1')).toBe('2026-03-02');
  });

  it('returns null for a key that is not a cycle day', () => {
    expect(baseCycleKey('not-a-cycle')).toBeNull();
    expect(baseCycleKey(null)).toBeNull();
    expect(baseCycleKey(undefined)).toBeNull();
  });
});

describe('transaction boundary', () => {
  it('joins a transaction it was handed rather than opening a nested one', async () => {
    // A Prisma transaction client has no `$transaction`; calling one threw and
    // turned every generation into a 500.
    const { db, client } = stubDb();
    const r = await generatePmWorkOrder(db, input);
    expect(r.created).toBe(true);
    expect(client.workOrder.create).toHaveBeenCalledTimes(1);
  });

  it('opens its own transaction when given the root client', async () => {
    const { db, client } = stubDb({ withTransaction: true });
    const r = await generatePmWorkOrder(db, input);
    expect(r.created).toBe(true);
    expect(client.workOrder.create).toHaveBeenCalledTimes(1);
  });
});

describe('what the work order records', () => {
  it('takes priority and status from the plan', async () => {
    const { db, client } = stubDb({ plan: plan({ priority: 'High', generatedWorkOrderStatus: 'Planned' }) });
    await generatePmWorkOrder(db, input);
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({ priority: 'High', status: 'Planned' });
  });

  it('copies the plan task list onto the work order (row 45)', async () => {
    const { db, client } = stubDb();
    await generatePmWorkOrder(db, input);
    expect(client.workOrderOperation.create).toHaveBeenCalledTimes(1);
    expect(client.workOrderOperation.create.mock.calls[0][0].data).toMatchObject({
      description: 'align',
      craftId: 'C1',
      plannedHours: 1,
    });
  });

  it('records the plan cycle for idempotency (row 48)', async () => {
    const { db, client } = stubDb();
    await generatePmWorkOrder(db, { ...input, cycleKey: '2026-03-02', targetId: 'T1' });
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({
      sourcePlanId: 'P1',
      sourcePlanCycle: '2026-03-02#T1',
    });
  });

  it('resolves the functional location from the target equipment', async () => {
    const { db, client } = stubDb();
    await generatePmWorkOrder(db, input);
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({
      functionalLocationId: 'F1',
      equipmentId: 'E1',
    });
  });

  it('uses a functional-location target directly', async () => {
    const { db, client } = stubDb({
      plan: plan({
        targets: [
          {
            planTargetId: 'T9',
            equipmentId: null,
            functionalLocationId: 'F9',
            equipment: null,
            functionalLocation: { functionalLocationId: 'F9' },
          },
        ],
      }),
    });
    await generatePmWorkOrder(db, input);
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({ functionalLocationId: 'F9', equipmentId: null });
  });
});

describe('validation of plan-supplied values', () => {
  it('rejects a generated status the SOW does not define', async () => {
    const { db } = stubDb({ plan: plan({ generatedWorkOrderStatus: 'In Progress' }) });
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow(PmGenerationError);
  });

  it('names the offending status in the error', async () => {
    const { db } = stubDb({ plan: plan({ generatedWorkOrderStatus: 'Scheduled' }) });
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow(/Scheduled/);
  });

  it('rejects a priority outside High/Medium/Low', async () => {
    const { db } = stubDb({ plan: plan({ priority: 'Critical' }) });
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow(/Critical/);
  });

  it('rejects a target with no resolvable functional location', async () => {
    const { db } = stubDb({
      plan: plan({
        targets: [{ planTargetId: 'T1', equipmentId: null, functionalLocationId: null, equipment: null, functionalLocation: null }],
      }),
    });
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow(/functional location/i);
  });

  it('rejects a plan that does not exist', async () => {
    const { db } = stubDb({ plan: null });
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow(/not found/i);
  });

  it('rejects a target that is not on the plan', async () => {
    const { db } = stubDb();
    await expect(generatePmWorkOrder(db, { ...input, targetId: 'nope' })).rejects.toThrow(/no target/i);
  });
});

describe('idempotency (row 48)', () => {
  it('returns the existing work order instead of creating a second one', async () => {
    const { db, client } = stubDb({ existing: { workOrderId: 'WO-EXISTING', woNumber: 'WO-9' } });
    const r = await generatePmWorkOrder(db, input);
    expect(r.created).toBe(false);
    expect(r.workOrderId).toBe('WO-EXISTING');
    expect(r.woNumber).toBe('WO-9');
    expect(client.workOrder.create).not.toHaveBeenCalled();
  });

  it('explains why it skipped', async () => {
    const { db } = stubDb({ existing: { workOrderId: 'WO-EXISTING', woNumber: 'WO-9' } });
    const r = await generatePmWorkOrder(db, input);
    expect(r.skipReason).toMatch(/already exists/);
  });

  it('survives a unique-index race between two generators', async () => {
    const { db, client } = stubDb();
    // Simulate the partial unique index firing after the pre-read.
    client.workOrder.create.mockRejectedValueOnce({ code: 'P2002' });
    client.workOrder.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ workOrderId: 'WO-RACE', woNumber: 'WO-RACE' } as never);
    const r = await generatePmWorkOrder(db, input);
    expect(r.created).toBe(false);
    expect(r.woNumber).toBe('WO-RACE');
  });

  it('propagates an error that is not a unique violation', async () => {
    const { db, client } = stubDb();
    client.workOrder.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(generatePmWorkOrder(db, input)).rejects.toThrow('connection lost');
  });
});

describe('associated notification (row 47)', () => {
  const template = {
    notificationId: 'N-TEMPLATE',
    type: 'M1',
    priority: 'Medium',
    functionalLocationId: 'F1',
    equipmentId: null,
    reportedByUserId: 'U1',
    description: 'Associated notification',
  };

  it('raises and links a notification when the plan has one', async () => {
    const { db, client } = stubDb({ plan: plan({ notificationId: 'N-TEMPLATE', notification: template }) });
    const r = await generatePmWorkOrder(db, input);
    expect(r.notificationId).toBe('N1');
    expect(client.notification.create).toHaveBeenCalledTimes(1);
    expect(client.workOrderNotifLink.create).toHaveBeenCalledWith({
      data: { workOrderId: 'WO1', notificationId: 'N1', createdBy: 'scheduler', modifiedBy: 'scheduler' },
    });
  });

  it('describes the specific job on the notification', async () => {
    const { db, client } = stubDb({ plan: plan({ notificationId: 'N-TEMPLATE', notification: template }) });
    await generatePmWorkOrder(db, input);
    const data = client.notification.create.mock.calls[0][0].data as Record<string, string>;
    // The template text alone would not tell a recipient which job this is.
    expect(data.description).toContain('PM-1');
    expect(data.description).toContain('2026-03-02');
    expect(data.status).toBe('Open');
  });

  it('raises no notification when the plan has none', async () => {
    const { db, client } = stubDb();
    const r = await generatePmWorkOrder(db, input);
    expect(r.notificationId).toBeNull();
    expect(client.notification.create).not.toHaveBeenCalled();
  });
});

describe('D-10 many assets per plan', () => {
  const twoTargets = () =>
    plan({
      targets: [
        { planTargetId: 'T1', equipmentId: 'E1', functionalLocationId: null, equipment: { equipmentId: 'E1', functionalLocationId: 'F1' }, functionalLocation: null },
        { planTargetId: 'T2', equipmentId: 'E2', functionalLocationId: null, equipment: { equipmentId: 'E2', functionalLocationId: 'F2' }, functionalLocation: null },
      ],
    });

  it('raises one work order per target for the same cycle', async () => {
    const { db, client } = stubDb({ plan: twoTargets() });
    await generatePmWorkOrder(db, input);
    expect(client.workOrder.create).toHaveBeenCalledTimes(2);
  });

  it('gives each target a distinct cycle key', async () => {
    const { db, client } = stubDb({ plan: twoTargets() });
    await generatePmWorkOrder(db, input);
    const keys = client.workOrder.create.mock.calls.map((c) => (c[0].data as { sourcePlanCycle: string }).sourcePlanCycle);
    expect(new Set(keys).size).toBe(2);
  });

  it('raises only the requested target', async () => {
    const { db, client } = stubDb({ plan: twoTargets() });
    await generatePmWorkOrder(db, { ...input, targetId: 'T2' });
    expect(client.workOrder.create).toHaveBeenCalledTimes(1);
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({ equipmentId: 'E2' });
  });

  it('falls back to the legacy single-asset columns for a pre-D-10 plan', async () => {
    const { db, client } = stubDb({
      plan: plan({ targets: [], equipmentId: 'E1', functionalLocationId: null }),
    });
    await generatePmWorkOrder(db, input);
    expect(client.workOrder.create).toHaveBeenCalledTimes(1);
    expect(client.workOrder.create.mock.calls[0][0].data).toMatchObject({ equipmentId: 'E1', functionalLocationId: 'F1' });
  });
});
