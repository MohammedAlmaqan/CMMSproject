// ============================================================
// Role-based access control — single source of truth (C2)
// Mirrors backend/src/utils/roles.ts hierarchy and the API
// read floors verified for each module.
// ============================================================

import type { UserRole } from '@/types';

export const roleHierarchy: Record<UserRole, number> = {
  'View-Only': 1,
  Requester: 2,
  Technician: 3,
  'Maintenance Supervisor': 4,
  'Maintenance Planner': 5,
  Administrator: 6,
};

export function roleLevel(role: UserRole | undefined): number {
  if (!role) return 0;
  return roleHierarchy[role] ?? 0;
}

/** True when `role` is at or above `minRole` on the hierarchy. */
export function hasMinRole(role: UserRole | undefined, minRole: UserRole): boolean {
  return roleLevel(role) >= roleLevel(minRole);
}

/**
 * Minimum role allowed to open each guarded route, mirroring the API's
 * read floors. Most pages read master data that any authenticated role may
 * read (authenticate-only GETs); only pages backed by an Administrator-only
 * read floor are restricted. `/work-orders/new` maps to the Requester floor
 * of `POST /api/work-orders`.
 */
export const ROUTE_FLOORS: Record<string, UserRole> = {
  '/administration': 'Administrator',
  '/work-orders/new': 'Requester',
};

/** Minimum role required to open `path`; unlisted routes are open to every authenticated role. */
export function routeFloor(path: string): UserRole {
  return ROUTE_FLOORS[path] ?? 'View-Only';
}