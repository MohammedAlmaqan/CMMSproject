import { describe, it, expect } from 'vitest';
import { computeWorkOrderCosts, roundMoney } from '../../src/utils/costRules.js';
import type { WorkOrderCostInput } from '../../src/utils/costRules.js';

/**
 * SOW 3.5.1 and D-3.
 *
 * D-3 removes the `numberOfTechnicians` multiplier from planned labour. The
 * risk in that change is not that it is wrong, but that it is *sweeping*: a
 * multiplier removed carelessly can quietly alter materials, services or actual
 * labour too, and a cost report that is wrong in three places at once is much
 * harder to notice than one that is wrong in one.
 *
 * So the central case here is differential, not a golden number. The test
 * carries its own reference implementation of the **old** formula and asserts
 * that the new one differs from it in exactly one term, by exactly the
 * multiplier, and is byte-identical everywhere else.
 */

const rate = (hourlyRate: number) => ({ hourlyRate });

const fixture = (): WorkOrderCostInput => ({
  operations: [
    // A crew job: 3 technicians, 6 total planned hours.
    { plannedHours: 6, numberOfTechnicians: 3, craft: rate(50) },
    // A single-tech job, to prove the two are handled alike.
    { plannedHours: 2.5, numberOfTechnicians: 1, craft: rate(80) },
    // A job with no crew recorded at all.
    { plannedHours: 4, numberOfTechnicians: null, craft: rate(25) },
  ],
  woMaterials: [
    { plannedQuantity: 10, actualQuantity: 9, unitCost: 4.25 },
    { plannedQuantity: 2, actualQuantity: 2, unitCost: 100 },
  ],
  externalServices: [{ cost: 150 }, { cost: 0 }],
  laborEntries: [
    { hoursWorked: 3, operation: { craft: rate(50) } },
    { hoursWorked: 1.5, operation: { craft: rate(80) } },
  ],
});

/** The pre-D-3 formula, reproduced here so the difference can be measured. */
function oldFormula(input: WorkOrderCostInput) {
  const plannedLabor = input.operations.reduce(
    (sum, op) =>
      sum +
      (op.plannedHours || 0) *
        Math.max(1, op.numberOfTechnicians || 1) *
        (op.craft.hourlyRate || 0),
    0
  );
  const actualLabor = input.laborEntries.reduce(
    (sum, e) => sum + (e.hoursWorked || 0) * (e.operation.craft.hourlyRate || 0),
    0
  );
  const plannedMaterials = input.woMaterials.reduce(
    (s, m) => s + (m.plannedQuantity || 0) * (m.unitCost || 0),
    0
  );
  const actualMaterials = input.woMaterials.reduce(
    (s, m) => s + (m.actualQuantity || 0) * (m.unitCost || 0),
    0
  );
  const serviceCost = input.externalServices.reduce((s, x) => s + (x.cost || 0), 0);
  return {
    plannedLabor,
    actualLabor,
    plannedMaterials,
    actualMaterials,
    serviceCost,
    plannedCost: plannedLabor + plannedMaterials + serviceCost,
    actualCost: actualLabor + actualMaterials + serviceCost,
  };
}

describe('D-3: removing the technician multiplier', () => {
  it('computes planned labour as plannedHours x craftRate, with no crew factor', () => {
    const c = computeWorkOrderCosts(fixture());
    // 6x50 + 2.5x80 + 4x25 = 300 + 200 + 100
    expect(c.plannedLabor).toBe(600);
  });

  it('is unmoved by the crew size: a 3-tech job costs the same per planned hour as a 1-tech job', () => {
    const threeTechs = computeWorkOrderCosts({
      ...fixture(),
      operations: [{ plannedHours: 6, numberOfTechnicians: 3, craft: rate(50) }],
      woMaterials: [],
      externalServices: [],
      laborEntries: [],
    });
    const oneTech = computeWorkOrderCosts({
      ...fixture(),
      operations: [{ plannedHours: 6, numberOfTechnicians: 1, craft: rate(50) }],
      woMaterials: [],
      externalServices: [],
      laborEntries: [],
    });
    expect(threeTechs.plannedCost).toBe(oneTech.plannedCost);
  });

  it('changes the planned total by exactly the multiplier, and nothing else', () => {
    const input = fixture();
    const before = oldFormula(input);
    const after = computeWorkOrderCosts(input);

    // The one term that may differ: planned labour.
    const labourDelta = before.plannedLabor - after.plannedLabor;
    // 6h x 50 x (3-1) crew on the first operation = 600. The other two carry a
    // multiplier of 1, so they contribute nothing.
    expect(labourDelta).toBe(600);

    // Materials, services and actual labour are untouched.
    expect(after.plannedMaterials).toBe(before.plannedMaterials);
    expect(after.actualMaterials).toBe(before.actualMaterials);
    expect(after.serviceCost).toBe(before.serviceCost);
    expect(after.actualLabor).toBe(before.actualLabor);
    expect(after.actualCost).toBe(before.actualCost);

    // And the planned total moves by exactly that one term, not by a ratio.
    expect(before.plannedCost - after.plannedCost).toBe(labourDelta);
  });

  it('reduces the planned total for a crewed job and leaves an uncrewed one identical', () => {
    const crewed = {
      ...fixture(),
      operations: [{ plannedHours: 10, numberOfTechnicians: 4, craft: rate(60) }],
    };
    expect(oldFormula(crewed).plannedCost).toBe(computeWorkOrderCosts(crewed).plannedCost + 1800);

    const solo = {
      ...fixture(),
      operations: [{ plannedHours: 10, numberOfTechnicians: 1, craft: rate(60) }],
    };
    expect(oldFormula(solo).plannedCost).toBe(computeWorkOrderCosts(solo).plannedCost);
  });

  it('still reports planned labour hours and crew size as data, it just does not bill for the crew', () => {
    // The field survives; only its effect on money is gone. A 0 or null crew must
    // not divide by zero or throw.
    const c = computeWorkOrderCosts({
      ...fixture(),
      operations: [
        { plannedHours: 5, numberOfTechnicians: 0, craft: rate(100) },
        { plannedHours: 5, numberOfTechnicians: null, craft: rate(100) },
      ],
      woMaterials: [],
      externalServices: [],
      laborEntries: [],
    });
    expect(c.plannedLabor).toBe(1000);
  });
});

describe('SOW 3.5.1 formula', () => {
  it('planned cost = planned labour + planned materials + planned services', () => {
    const c = computeWorkOrderCosts(fixture());
    expect(c.plannedCost).toBe(c.plannedLabor + c.plannedMaterials + c.serviceCost);
    // 600 + (10x4.25 + 2x100 = 242.5) + 150
    expect(c.plannedCost).toBe(992.5);
  });

  it('actual cost = actual labour + actual materials + planned services', () => {
    const c = computeWorkOrderCosts(fixture());
    expect(c.actualCost).toBe(c.actualLabor + c.actualMaterials + c.serviceCost);
    // 3x50 + 1.5x80 = 270; (9x4.25 + 2x100 = 238.25); services 150
    expect(c.actualCost).toBe(658.25);
  });

  it('treats a null rate, quantity or hours as zero rather than NaN', () => {
    const c = computeWorkOrderCosts({
      operations: [{ plannedHours: null, numberOfTechnicians: 2, craft: { hourlyRate: null } }],
      woMaterials: [{ plannedQuantity: null, actualQuantity: 5, unitCost: null }],
      externalServices: [{ cost: null }],
      laborEntries: [{ hoursWorked: null, operation: { craft: { hourlyRate: 10 } } }],
    });
    expect(c.plannedLabor).toBe(0);
    expect(c.actualMaterials).toBe(0);
    expect(c.actualCost).toBe(0);
    expect(Number.isNaN(c.plannedCost)).toBe(false);
  });

  it('handles a work order with nothing on it', () => {
    const c = computeWorkOrderCosts({
      operations: [],
      woMaterials: [],
      externalServices: [],
      laborEntries: [],
    });
    expect(c.plannedCost).toBe(0);
    expect(c.actualCost).toBe(0);
  });
});

describe('roundMoney', () => {
  it('rounds to two decimal places at the persist boundary', () => {
    expect(roundMoney(992.5)).toBe(992.5);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(1234.5678)).toBe(1234.57);
  });

  it('cannot round a value that binary floating point cannot represent', () => {
    // 1.005 is stored as 1.00499999999999989..., so *100 is 100.49999... and
    // this rounds DOWN to 1, where a decimal type would give 1.01.
    //
    // This is not a defect introduced here: it is the behaviour the cost code
    // has always had, and changing the rounding would silently move stored
    // figures. It is recorded rather than altered, and it is part of why D-17
    // moves monetary columns to Decimal.
    expect(1.005 * 100).toBeLessThan(100.5);
    expect(roundMoney(1.005)).toBe(1);
  });
});
