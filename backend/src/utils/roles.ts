// Role hierarchy, kept free of any jwt, prisma or config import so that
// authorisation policy can be unit tested without a database or a secret.
//
// Values are ordered least to most privileged. These tiers are the SOW 2.2
// capability floors: View-Only is read access, Requester raises records,
// Technician books labour, Maintenance Supervisor approves and closes,
// Maintenance Planner plans, Administrator administers.

export const roleHierarchy: Record<string, number> = {
  'View-Only': 1,
  Requester: 2,
  Technician: 3,
  'Maintenance Supervisor': 4,
  'Maintenance Planner': 5,
  Administrator: 6,
};

/**
 * Numeric level of a role, for route logic that needs to make its own
 * authorisation decision rather than gate a whole route. Prefer
 * authorizeMinRole wherever the whole route shares one floor.
 */
export function roleLevel(role: string | undefined): number {
  if (!role) return 0;
  return roleHierarchy[role] || 0;
}
