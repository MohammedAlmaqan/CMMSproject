import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUDIT_RETENTION_YEARS,
  parseRetentionYears,
  retentionCutoff,
} from '../../src/utils/auditRetentionRules.js';

// SOW 4.3: audit history is kept for a configurable number of years. The
// decision of how long and what falls outside is pure, so it is pinned here
// without a database; the service that reads the setting and deletes the rows
// is exercised through the audit-log route tests.

describe('the retention window the purge will actually use', () => {
  it('defaults to 7 years for a missing value', () => {
    expect(parseRetentionYears(null)).toBe(DEFAULT_AUDIT_RETENTION_YEARS);
    expect(parseRetentionYears(undefined)).toBe(DEFAULT_AUDIT_RETENTION_YEARS);
    expect(DEFAULT_AUDIT_RETENTION_YEARS).toBe(7);
  });

  it('defaults rather than trusting an unreadable value', () => {
    // blank, non-numeric, fractional, or out of range must not become "delete
    // everything" (0), "never delete" (a huge number) or a NaN that matches no
    // rows. Each of those changes how much history survives without a decision.
    for (const value of ['', '   ', 'abc', 'NaN', '0', '-1', '101', '7.5']) {
      expect(parseRetentionYears(value)).toBe(DEFAULT_AUDIT_RETENTION_YEARS);
    }
  });

  it('accepts a whole number of years inside the window, trimming', () => {
    expect(parseRetentionYears('7')).toBe(7);
    expect(parseRetentionYears(' 3 ')).toBe(3);
    expect(parseRetentionYears('1')).toBe(1);
    expect(parseRetentionYears('100')).toBe(100);
  });

  it('subtracts whole UTC calendar years for the cutoff', () => {
    // UTC so the boundary is host-independent and cannot drift across a DST
    // change between the two dates.
    expect(retentionCutoff(7, new Date('2026-10-09T12:00:00.000Z')).toISOString())
      .toBe('2019-10-09T12:00:00.000Z');
    expect(retentionCutoff(1, new Date('2026-01-01T00:00:00.000Z')).toISOString())
      .toBe('2025-01-01T00:00:00.000Z');
  });
});
