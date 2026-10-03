import { describe, it, expect } from 'vitest';
import { highestPriority } from '../../src/utils/workOrderRules.js';

// SOW 3.2.2 (row 20): the aggregated work order "takes the highest of their
// priorities". The rule is pure, so it is proven without a database.

describe('highestPriority', () => {
  it('returns the highest of the set whatever the order', () => {
    expect(highestPriority(['Low', 'High', 'Medium'])).toBe('High');
    expect(highestPriority(['High', 'Low', 'Medium'])).toBe('High');
    expect(highestPriority(['Medium', 'Low', 'High'])).toBe('High');
  });

  it('returns the single value for a one-element set', () => {
    expect(highestPriority(['Low'])).toBe('Low');
    expect(highestPriority(['Medium'])).toBe('Medium');
    expect(highestPriority(['High'])).toBe('High');
  });

  it('ranks Medium above Low', () => {
    expect(highestPriority(['Low', 'Medium'])).toBe('Medium');
  });

  it('does not let an unknown value outrank a real one', () => {
    expect(highestPriority(['Low', 'Bogus'])).toBe('Low');
    expect(highestPriority(['Bogus'])).toBe('Low');
  });

  it('falls back to Low for an empty set', () => {
    expect(highestPriority([])).toBe('Low');
  });
});
