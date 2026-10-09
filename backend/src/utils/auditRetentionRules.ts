/**
 * SOW 4.3: audit history is retained for a configurable number of years, default
 * 7, and purged beyond that. The decision of "how long" and "what falls outside"
 * is small and pure, so it lives here and is tested without a database; the
 * service that reads the setting and deletes rows is `services/auditRetention.ts`.
 *
 * AuditLogEntry is append-only and deliberately has no `isDeleted`, so retention
 * is the one place the product hard-deletes a row. That is the exception 4.3
 * names, not an oversight.
 */

export const AUDIT_RETENTION_KEY = 'audit_retention_years';
export const DEFAULT_AUDIT_RETENTION_YEARS = 7;
export const MIN_AUDIT_RETENTION_YEARS = 1;
export const MAX_AUDIT_RETENTION_YEARS = 100;

/**
 * The effective retention window, in whole years.
 *
 * Falls back to the default for a missing or unreadable value rather than
 * trusting it. A blank, a non-number or an out-of-range value must not become
 * "delete everything" (0), "delete nothing this century" (a huge number) or a
 * `NaN` comparison that silently matches no rows - each would change how much
 * history survives without anyone deciding it.
 */
export function parseRetentionYears(value: string | null | undefined): number {
  if (value == null) return DEFAULT_AUDIT_RETENTION_YEARS;
  const years = Number(value.trim());
  if (!Number.isInteger(years) || years < MIN_AUDIT_RETENTION_YEARS || years > MAX_AUDIT_RETENTION_YEARS) {
    return DEFAULT_AUDIT_RETENTION_YEARS;
  }
  return years;
}

/**
 * The oldest instant that is still retained: `now` minus `years` calendar years,
 * subtracted in UTC so the boundary is the same on every host and does not drift
 * across a DST change. An entry is purged when its timestamp is strictly before
 * this.
 */
export function retentionCutoff(years: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}
