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
});