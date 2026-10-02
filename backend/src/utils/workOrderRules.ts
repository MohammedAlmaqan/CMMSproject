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

/**
 * SOW 3.3.1: an emergency work order must outrank everything else.
 *
 * `EM` is the emergency type in `workOrderTypeSchema`; `High` is the top of
 * `prioritySchema`. Both are named here rather than inlined so the rule reads
 * as the clause does.
 */
export const EMERGENCY_WORK_ORDER_TYPE = 'EM';
export const HIGHEST_PRIORITY = 'High';

/**
 * SOW 3.3.1: "Emergency automatically sets highest priority."
 *
 * Applied at every write path that can set a work order's type or priority, so
 * an emergency cannot be raised — or demoted on a later edit — below the top of
 * the scale. Non-emergency types pass the requested priority through untouched:
 * this rule only exists to protect the emergency case, not to police priority.
 */
export function resolveWorkOrderPriority(type: string, requestedPriority: string): string {
  return type === EMERGENCY_WORK_ORDER_TYPE ? HIGHEST_PRIORITY : requestedPriority;
}

/**
 * SOW 3.1.4 (deferred item D5): "Cause codes as root-cause categories".
 *
 * A breakdown may be raised before anyone knows why the machine stopped, so the
 * cause is not required at creation. It is required at the other end: a
 * breakdown cannot be recorded as Completed until it names a cause. Without this
 * the CauseCode column would be optional everywhere and the MTTR-by-cause
 * report (row 62) would rest on data nobody was ever asked for.
 *
 * The check is written against the *effective* values, not the submitted body:
 * an edit that completes a work order whose cause was set earlier, or that
 * saves the cause and completes in one call, must both pass.
 */
export const BREAKDOWN_CAUSE_REQUIRED_MESSAGE =
  'A breakdown work order cannot be completed without a cause code';

export function isCompletionBlockedForMissingCause(input: {
  nextStatus: string;
  breakdownFlag: boolean;
  causeCodeId: string | null | undefined;
}): boolean {
  return input.nextStatus === 'Completed' && input.breakdownFlag && !input.causeCodeId;
}
