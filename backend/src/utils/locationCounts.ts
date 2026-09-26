/**
 * SOW 3.1.1: the functional location tree shows the open work order count and
 * the notification count for each node.
 *
 * Two things were wrong. The counts did not exist server-side at all — the
 * screen assembled them by issuing one request per node, which on a real plant
 * is hundreds of round trips to render one tree. And "open" had no agreed
 * meaning, so any count would have been arguable.
 *
 * The counts are computed with one grouped query per entity and attached to the
 * tree here, which is pure and therefore testable without a database.
 */

/**
 * A work order is open while it still represents outstanding work. Completed and
 * Closed are finished; Cancelled is a decision not to do the work, which is not
 * the same as outstanding and would otherwise inflate every location's count
 * with work nobody is going to do. Draft is included: a draft work order is
 * still live work in the system and excluding it would understate the backlog.
 */
export const OPEN_WORK_ORDER_STATUSES = [
  'Draft',
  'Planned',
  'Scheduled',
  'In Progress',
  'Suspended',
] as const;

/**
 * A notification is open until it is Completed. Converted is deliberately
 * included: conversion moves the work, it does not finish the issue, and the
 * converted notification is what makes the work order it became reach Completed.
 * Counting only Open would hide every converted issue still awaiting its work.
 */
export const OPEN_NOTIFICATION_STATUSES = ['Open', 'In Process', 'Converted'] as const;

export interface CountableNode {
  functionalLocationId: string;
  children: CountableNode[];
  openWorkOrderCount?: number;
  openNotificationCount?: number;
  openWorkOrderCountTotal?: number;
  openNotificationCountTotal?: number;
}

/** Turns a Prisma groupBy result into a plain id -> count lookup. */
export function toCountMap(
  groups: { functionalLocationId: string | null; _count: { _all: number } }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) {
    if (group.functionalLocationId) {
      map.set(group.functionalLocationId, group._count._all);
    }
  }
  return map;
}

/**
 * Attaches each node's own counts and the roll-up from its descendants, in one
 * pass.
 *
 * Both are reported because they answer different questions and the tree needs
 * both. A leaf's own count is the work physically at that location. A parent's
 * own count is only what was raised directly against the parent, which for a
 * Plant or an Area is nearly always zero and would make the upper tree look
 * idle while the real backlog sits in the leaves. The rolled-up figure is what
 * someone scanning the tree actually wants to see.
 */
export function attachCounts(
  nodes: CountableNode[],
  workOrderCounts: Map<string, number>,
  notificationCounts: Map<string, number>
): CountableNode[] {
  const visit = (node: CountableNode): { workOrders: number; notifications: number } => {
    const ownWorkOrders = workOrderCounts.get(node.functionalLocationId) ?? 0;
    const ownNotifications = notificationCounts.get(node.functionalLocationId) ?? 0;

    let childWorkOrders = 0;
    let childNotifications = 0;
    for (const child of node.children) {
      const totals = visit(child);
      childWorkOrders += totals.workOrders;
      childNotifications += totals.notifications;
    }

    node.openWorkOrderCount = ownWorkOrders;
    node.openNotificationCount = ownNotifications;
    node.openWorkOrderCountTotal = ownWorkOrders + childWorkOrders;
    node.openNotificationCountTotal = ownNotifications + childNotifications;

    return {
      workOrders: ownWorkOrders + childWorkOrders,
      notifications: ownNotifications + childNotifications,
    };
  };

  for (const node of nodes) {
    visit(node);
  }
  return nodes;
}
