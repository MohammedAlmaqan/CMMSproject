import { describe, it, expect } from 'vitest';
import { serializeWorkOrderSnapshot } from '../../src/utils/workOrderSnapshots.js';

describe('serializeWorkOrderSnapshot', () => {
  it('returns keys sorted so consecutive snapshots diff cleanly', () => {
    const out = serializeWorkOrderSnapshot({ b: 1, a: 2, c: 3 });
    expect(Object.keys(out)).toEqual(['a', 'b', 'c']);
  });

  it('freezes Date values as ISO strings', () => {
    const when = new Date('2026-09-28T10:00:00.000Z');
    const out = serializeWorkOrderSnapshot({ createdDate: when });
    expect(out.createdDate).toBe('2026-09-28T10:00:00.000Z');
  });

  it('drops undefined and keeps null', () => {
    const out = serializeWorkOrderSnapshot({ present: 1, missing: undefined, empty: null });
    expect(out).toEqual({ present: 1, empty: null });
    expect('missing' in out).toBe(false);
  });

  it('serialises nested objects deterministically', () => {
    const out = serializeWorkOrderSnapshot({
      nested: { z: 'last', a: { when: new Date('2026-01-01T00:00:00.000Z'), n: 5 } },
    });
    expect(Object.keys(out.nested as Record<string, unknown>)).toEqual(['a', 'z']);
    expect(
      (out.nested as { a: Record<string, unknown> }).a.when
    ).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps scalars verbatim', () => {
    const out = serializeWorkOrderSnapshot({ status: 'Planned', woNumber: 'WO-1', flag: false, cost: 12.5 });
    expect(out).toEqual({ status: 'Planned', woNumber: 'WO-1', flag: false, cost: 12.5 });
  });

  it('writes Decimal money values as numbers, not their object internals (D-17)', () => {
    const out = serializeWorkOrderSnapshot({
      plannedCost: { toNumber: (): number => 45.5 },
      actualCost: { toNumber: (): number => 0 },
    });
    expect(out).toEqual({ actualCost: 0, plannedCost: 45.5 });
    expect(typeof out.actualCost).toBe('number');
  });

  // R.9: the cost columns are a cache of the base relations. A snapshot is the
  // one record a later reader trusts absolutely, so freezing the cache into it
  // would make a stale figure indistinguishable from a real historical fact.
  it('substitutes the derived cost over a stale cached one', () => {
    const out = serializeWorkOrderSnapshot(
      { woNumber: 'WO-1', plannedCost: 0, actualCost: 0 },
      { plannedCost: 127.5, actualCost: 42 }
    );
    expect(out.plannedCost).toBe(127.5);
    expect(out.actualCost).toBe(42);
    expect(out.woNumber).toBe('WO-1');
  });

  it('leaves the cache untouched when no derived figures are supplied', () => {
    // The old behaviour, kept so the substitution is provably what changed rather
    // than the serializer always recomputing something.
    const out = serializeWorkOrderSnapshot({ plannedCost: 0, actualCost: 0 });
    expect(out).toEqual({ actualCost: 0, plannedCost: 0 });
  });

  it('creates the cost keys when the row had none, rather than leaving them absent', () => {
    const out = serializeWorkOrderSnapshot({ woNumber: 'WO-1' }, { plannedCost: 90, actualCost: 0 });
    expect(out.plannedCost).toBe(90);
    expect(out.actualCost).toBe(0);
  });
});