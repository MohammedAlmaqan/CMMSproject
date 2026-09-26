// SOW 3.3.5 labour attribution policy, as a pure function.
//
// "Technician identification via login; entries stamped with user and timestamp."
//
// The route used to take `userId` from the request body and store it verbatim,
// so any Technician could book hours against any other user and move labour
// cost between technicians. This module decides who an entry is attributed to;
// the route applies the decision and writes the audit trail.
//
// It imports only the role hierarchy, so it is unit testable with no database,
// no jwt and no environment. The original route logic is preserved in the test
// suite under tests/unit/laborAttribution.test.ts.

import { roleLevel } from './roles.js';

export const ATTRIBUTION_OVERRIDE_FLOOR = 'Maintenance Supervisor';

export interface AuthenticatedCaller {
  userId: string;
  role: string;
}

export type AttributionOutcome = 'none' | 'override';

export interface AttributionDecision {
  /** The user the labour is attributed to. Always an existing user id. */
  userId: string;
  /** 'override' when a supervisor booked on someone else's behalf. */
  outcome: AttributionOutcome;
  /**
   * True when the caller tried to attribute labour to another user without
   * holding the override floor. The caller must reject the request rather than
   * silently book it to themselves, so a misconfigured client surfaces instead
   * of quietly moving cost between technicians.
   */
  rejected: boolean;
  /** The user id that was asked for, when one was supplied. */
  requestedUserId?: string;
}

export function resolveAttributedUser(
  caller: AuthenticatedCaller,
  requestedUserId: unknown
): AttributionDecision {
  const self: AttributionDecision = {
    userId: caller.userId,
    outcome: 'none',
    rejected: false,
  };

  if (typeof requestedUserId !== 'string' || requestedUserId.length === 0) {
    return self;
  }
  if (requestedUserId === caller.userId) {
    return self;
  }
  if (roleLevel(caller.role) >= roleLevel(ATTRIBUTION_OVERRIDE_FLOOR)) {
    return {
      userId: requestedUserId,
      outcome: 'override',
      rejected: false,
      requestedUserId,
    };
  }
  return { ...self, rejected: true, requestedUserId };
}
