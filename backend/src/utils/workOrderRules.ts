/**
 * SOW 3.3.3: every work order must contain at least one operation.
 *
 * Kept pure and separate for the same reason as transitions.ts: the rule should
 * be provable without a database, and it should be readable in one place rather
 * than inlined in a route handler where its scope is easy to misread.
 */

/**
 * Statuses that mean the work order is going to be executed. A work order in one
 * of these is a promise of work, and a promise of work with no operation is not
 * a work order — it cannot be costed, scheduled, or assigned to a technician.
 */
const EXECUTION_STATUSES = new Set(['Planned', 'Scheduled', 'In Progress']);

/**
 * True when this transition must not be allowed to leave the work order with
 * zero operations.
 *
 * Two deliberate carve-outs:
 *
 *  - Only the transition OUT OF Draft is guarded. A work order that already
 *    passed this gate keeps its operations for its whole life, so re-checking
 *    on every later hop would be redundant work on the hot path.
 *  - Cancelled is exempt. Abandoning a draft that was never planned is a
 *    legitimate outcome and must not be blocked by a rule about planned work;
 *    requiring an operation in order to give up on a work order would be
 *    absurd.
 */
export function requiresAtLeastOneOperation(from: string, to: string): boolean {
  if (from !== 'Draft') {
    return false;
  }
  return EXECUTION_STATUSES.has(to);
}

/** Message used verbatim in the 409 response. */
export function missingOperationMessage(): string {
  return 'A work order must contain at least one operation before it can be planned';
}
