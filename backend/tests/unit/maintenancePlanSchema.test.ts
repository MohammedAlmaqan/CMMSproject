import { describe, it, expect } from 'vitest';
import {
  maintenancePlanCreateSchema,
  maintenancePlanUpdateSchema,
  planTargetSchema,
  planPatchIssues,
} from '../../src/utils/validation.js';

/**
 * SOW 3.4.1 / 3.4.2 / D-10 boundary validation for maintenance plans.
 *
 * These rules exist because each one previously let through a plan that the
 * scheduler could not act on, and a plan that cannot generate looks exactly like
 * a plan that has simply not come due yet.
 */

const base = {
  planCode: 'PM-1',
  description: 'inspect',
  workCenterId: 'WC-1',
  taskListId: 'TL-1',
  strategyType: 'Time' as const,
  intervalValue: 30,
  intervalUnit: 'Days' as const,
  startDate: '2026-01-01T00:00:00.000Z',
  equipmentId: 'EQ-1',
};

const ok = (over: Record<string, unknown> = {}) => maintenancePlanCreateSchema.safeParse({ ...base, ...over });

describe('maintenancePlanCreateSchema - targeting', () => {
  it('accepts a plan targeting one equipment', () => {
    expect(ok().success).toBe(true);
  });

  it('rejects a plan that targets nothing', () => {
    // SOW 3.4.1: the plan must say what it covers. An untargeted plan used to
    // be accepted and then fail at generation time with "no functional
    // location", which reads like a scheduler fault rather than bad data.
    const r = ok({ equipmentId: undefined });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected rejection');
    expect(r.error.issues.some((i) => /target at least one/i.test(i.message))).toBe(true);
  });

  it('accepts a functional-location target', () => {
    expect(ok({ equipmentId: undefined, functionalLocationId: 'FL-1' }).success).toBe(true);
  });

  it('accepts a D-10 target list covering several assets', () => {
    const r = ok({
      equipmentId: undefined,
      targets: [{ equipmentId: 'EQ-1' }, { equipmentId: 'EQ-2' }, { functionalLocationId: 'FL-9' }],
    });
    expect(r.success).toBe(true);
  });
});

describe('planTargetSchema', () => {
  it('accepts a target naming exactly one asset', () => {
    expect(planTargetSchema.safeParse({ equipmentId: 'EQ-1' }).success).toBe(true);
    expect(planTargetSchema.safeParse({ functionalLocationId: 'FL-1' }).success).toBe(true);
  });

  it('rejects a target naming both assets', () => {
    const r = planTargetSchema.safeParse({ equipmentId: 'EQ-1', functionalLocationId: 'FL-1' });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected rejection');
    expect(r.error.issues[0].message).toMatch(/exactly one/i);
  });

  it('rejects a target naming neither asset', () => {
    expect(planTargetSchema.safeParse({}).success).toBe(false);
  });
});

describe('maintenancePlanCreateSchema - interval', () => {
  it('rejects a zero interval', () => {
    // The scheduler divides the elapsed days by the step. A zero step made that
    // Infinity, which silently stopped the plan generating instead of being
    // reported as a configuration error.
    const r = ok({ intervalValue: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects a negative interval', () => {
    expect(ok({ intervalValue: -5 }).success).toBe(false);
  });

  it('rejects a fractional interval', () => {
    expect(ok({ intervalValue: 1.5 }).success).toBe(false);
  });
});

describe('maintenancePlanCreateSchema - strategy and meters', () => {
  it('rejects a Meter strategy with no meter threshold', () => {
    // A meter plan with no threshold can never come due, which is
    // indistinguishable from a plan that is simply not due yet.
    const r = ok({ strategyType: 'Meter' });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected rejection');
    expect(r.error.issues.some((i) => /at least one meter threshold/i.test(i.message))).toBe(true);
  });

  it('rejects a Combined strategy with no meter threshold', () => {
    expect(ok({ strategyType: 'Combined' }).success).toBe(false);
  });

  it('accepts a Meter strategy with one threshold', () => {
    const r = ok({ strategyType: 'Meter', planMeters: [{ meterId: 'M-1', meterInterval: 500 }] });
    expect(r.success).toBe(true);
  });

  it('accepts a Combined strategy with several thresholds', () => {
    const r = ok({
      strategyType: 'Combined',
      planMeters: [
        { meterId: 'M-1', meterInterval: 500 },
        { meterId: 'M-2', meterInterval: 1000 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-positive meter threshold', () => {
    const r = ok({ strategyType: 'Meter', planMeters: [{ meterId: 'M-1', meterInterval: 0 }] });
    expect(r.success).toBe(false);
  });

  it('does not require meters for a Time strategy', () => {
    expect(ok({ strategyType: 'Time' }).success).toBe(true);
  });
});

describe('maintenancePlanCreateSchema - dates', () => {
  it('rejects an endDate before the startDate', () => {
    const r = ok({ startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('expected rejection');
    expect(r.error.issues.some((i) => /endDate cannot be before startDate/i.test(i.message))).toBe(true);
  });

  it('accepts an endDate after the startDate', () => {
    const r = ok({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2027-01-01T00:00:00.000Z' });
    expect(r.success).toBe(true);
  });

  it('accepts an equal start and end date', () => {
    const r = ok({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' });
    expect(r.success).toBe(true);
  });

  it('accepts no endDate at all', () => {
    expect(ok().success).toBe(true);
  });
});

describe('maintenancePlanCreateSchema - new SOW 3.4.1/3.4.3 fields', () => {
  it('accepts a priority', () => {
    expect(ok({ priority: 'High' }).success).toBe(true);
  });

  it('rejects a priority outside High/Medium/Low', () => {
    expect(ok({ priority: 'Critical' }).success).toBe(false);
  });

  it('accepts either generated work order status', () => {
    expect(ok({ generatedWorkOrderStatus: 'Planned' }).success).toBe(true);
    expect(ok({ generatedWorkOrderStatus: 'Draft' }).success).toBe(true);
  });

  it('rejects a generated status beyond Draft and Planned', () => {
    // SOW 3.4.3 names exactly these two. Allowing 'In Progress' here would let
    // a plan open work that nobody triaged and that has not been safety-checked.
    expect(ok({ generatedWorkOrderStatus: 'In Progress' }).success).toBe(false);
    expect(ok({ generatedWorkOrderStatus: 'Scheduled' }).success).toBe(false);
  });

  it('accepts an associated notification', () => {
    expect(ok({ notificationId: 'N-1' }).success).toBe(true);
  });

  it('accepts an explicitly null notification', () => {
    expect(ok({ notificationId: null }).success).toBe(true);
  });
});

describe('maintenancePlanUpdateSchema', () => {
  it('rejects an empty update', () => {
    const r = maintenancePlanUpdateSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('accepts a single-field update without re-asserting create-time requirements', () => {
    // A partial update must not demand the fields create requires, or editing a
    // priority on a meter plan would be impossible without resending the world.
    expect(maintenancePlanUpdateSchema.safeParse({ priority: 'Low' }).success).toBe(true);
    expect(maintenancePlanUpdateSchema.safeParse({ planCode: 'PM-2' }).success).toBe(true);
  });

  it('still rejects invalid values on a partial update', () => {
    expect(maintenancePlanUpdateSchema.safeParse({ priority: 'Nope' }).success).toBe(false);
    expect(maintenancePlanUpdateSchema.safeParse({ generatedWorkOrderStatus: 'Completed' }).success).toBe(false);
  });
});

/**
 * The same boundary rules, reached through a patch instead of a whole plan.
 *
 * `maintenancePlanUpdateSchema` cannot enforce them: it is `.partial()`, so it
 * has no way to know what the rest of the plan currently says. `planPatchIssues`
 * is the other half - it is handed the merged record and decides which rules
 * the patch has made relevant.
 */
describe('planPatchIssues - meter strategy', () => {
  const existing = { strategyType: 'Time' };
  const sets = { targetCount: 1, storedMeterCount: 0 };

  it('rejects switching a Time plan to Meter with no threshold attached', () => {
    const issues = planPatchIssues({ strategyType: 'Meter' }, existing, sets);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/strategyType 'Meter' requires at least one meter threshold/);
  });

  it('rejects switching to Combined with no threshold attached', () => {
    expect(planPatchIssues({ strategyType: 'Combined' }, existing, sets)).toHaveLength(1);
  });

  it('accepts the switch when the patch carries the thresholds', () => {
    expect(
      planPatchIssues(
        { strategyType: 'Meter', planMeters: [{ meterId: 'M-1', meterInterval: 500 }] },
        existing,
        sets
      )
    ).toEqual([]);
  });

  it('accepts the switch when the plan already has thresholds stored', () => {
    expect(
      planPatchIssues({ strategyType: 'Meter' }, existing, { targetCount: 1, storedMeterCount: 2 })
    ).toEqual([]);
  });

  it('rejects clearing the last threshold on a Meter plan', () => {
    expect(planPatchIssues({ planMeters: [] }, { strategyType: 'Meter' }, sets)).toHaveLength(1);
  });

  it('leaves a legacy plan alone when the patch touches neither strategy nor meters', () => {
    // A plan that already violates the rule must still be editable, otherwise a
    // broken plan could never be deactivated or repaired.
    const broken = { strategyType: 'Combined' };
    expect(planPatchIssues({ activeFlag: false }, broken, sets)).toEqual([]);
    expect(planPatchIssues({ priority: 'Low' }, broken, sets)).toEqual([]);
  });
});

describe('planPatchIssues - dates', () => {
  const existing = { strategyType: 'Time', startDate: '2026-01-01T00:00:00.000Z', endDate: null };
  const sets = { targetCount: 1, storedMeterCount: 0 };

  it('rejects an endDate earlier than the existing startDate', () => {
    const issues = planPatchIssues({ endDate: '2025-12-31T00:00:00.000Z' }, existing, sets);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/endDate cannot be before startDate/);
  });

  it('rejects a startDate moved past the existing endDate', () => {
    const issues = planPatchIssues({ startDate: '2027-01-01T00:00:00.000Z' }, {
      ...existing,
      endDate: '2026-06-01T00:00:00.000Z',
    }, sets);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/endDate cannot be before startDate/);
  });

  it('accepts clearing endDate back to open-ended', () => {
    expect(planPatchIssues({ endDate: null }, existing, sets)).toEqual([]);
  });

  it('accepts an endDate on or after the startDate', () => {
    expect(planPatchIssues({ endDate: '2026-01-01T00:00:00.000Z' }, existing, sets)).toEqual([]);
    expect(planPatchIssues({ endDate: '2026-12-01T00:00:00.000Z' }, existing, sets)).toEqual([]);
  });

  it('does not re-check dates the patch never mentions', () => {
    expect(
      planPatchIssues({ description: 'renamed' }, { ...existing, endDate: '2020-01-01T00:00:00.000Z' }, sets)
    ).toEqual([]);
  });

  it('reads a startDate held as a Date, as Prisma returns it', () => {
    const issues = planPatchIssues(
      { endDate: '2025-01-01T00:00:00.000Z' },
      { ...existing, startDate: new Date('2026-01-01T00:00:00.000Z') },
      sets
    );
    expect(issues).toHaveLength(1);
  });
});

describe('planPatchIssues - targeting', () => {
  const existing = { strategyType: 'Time' };

  it('rejects a patch that would leave the plan targeting nothing', () => {
    const issues = planPatchIssues(
      { equipmentId: null, functionalLocationId: null, targets: [] },
      existing,
      { targetCount: 0, storedMeterCount: 0 }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/must target at least one/);
  });

  it('accepts replacing the target list with a non-empty one', () => {
    expect(
      planPatchIssues({ targets: [{ equipmentId: 'EQ-9' }] }, existing, { targetCount: 2, storedMeterCount: 0 })
    ).toEqual([]);
  });

  it('does not re-check targeting when the patch never mentions an asset', () => {
    expect(planPatchIssues({ priority: 'High' }, existing, { targetCount: 0, storedMeterCount: 0 })).toEqual([]);
  });
});
