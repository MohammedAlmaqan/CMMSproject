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
