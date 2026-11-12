// SOW 3.2.1 notification lifecycle.
//
// SOW 3.2.1 requires transition validity to be enforced and illegal transitions
// to be rejected. Before this map existed, `PUT /api/notifications/:id` took
// `status` straight from the request body, so a caller could move a Completed
// notification back to Open, or revive a deleted-in-spirit one, with no check.
//
// The map mirrors the work order workflow in routes/workOrders.ts, which
// already enforced its own VALID_TRANSITIONS map on the status endpoint.
//
// Open -> Converted and In Process -> Converted are the convert-to-work-order
// path, enforced separately in routes/notifications.ts. Converted -> Completed
// is SOW 3.2.3: a converted notification must reach Completed once the work
// order it became is finished, or the conversion queue never clears.

export const NOTIFICATION_STATUSES = ['Open', 'In Process', 'Completed', 'Converted'] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TRANSITIONS: Record<string, readonly string[]> = {
  Open: ['In Process', 'Converted', 'Completed'],
  'In Process': ['Completed', 'Converted'],
  Converted: ['Completed'],
  Completed: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = NOTIFICATION_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function transitionTargets(from: string): readonly string[] {
  return NOTIFICATION_TRANSITIONS[from] ?? [];
}

/** Message shape kept identical to the work order status route for consistency. */
export function invalidTransitionMessage(from: string, to: string): string {
  return `Invalid transition from '${from}' to '${to}'`;
}

/**
 * A completion confirmation is the M3 notification an earlier release raised
 * automatically when a work order was completed. D-22 (owner, 2026-11-11)
 * stopped the generation, but the rows it already wrote are ordinary Open
 * notifications whose only trace of their origin is their type: they carry no
 * WorkOrderNotifLink back to the order they describe. Converting one starts
 * the loop again, because completing the resulting work order used to raise
 * another. The convert routes refuse them; the type itself stays accepted so
 * the importer and those legacy rows keep working.
 */
export function isCompletionConfirmation(type: string | null | undefined): boolean {
  return type === 'M3';
}

/**
 * Prisma filter fragment for the intake and reporting surfaces. A legacy M3 is
 * kept in the database - it is a historical record and three of them are linked
 * to real work orders - but it is not work anyone has to pick up, so it is not
 * counted as an open notification. D-22 (owner, 2026-11-11). The notification
 * list still shows these rows under the M3 filter on purpose; only the counts
 * that drive queues and reports exclude them.
 */
export const NOT_A_COMPLETION_CONFIRMATION = { type: { not: 'M3' } } as const;
