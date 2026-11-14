// ============================================================
// Status system — 8 tones, one source of truth.
// ============================================================
// Before this module every page carried its own `statusBadges` map and
// collapsed eight work-order states into four buckets, so Draft read the same
// as Planned and Suspended read the same as Cancelled. Overdue and Breakdown
// were not represented at all.
//
// A tone carries colour (the `.badge-<tone>` class) *and* a label *and* a
// glyph, so status is never conveyed by colour alone (WCAG 1.4.1).

import type { WorkOrder, WorkOrderStatus } from '@/types'

export type StatusTone =
  | 'open'
  | 'scheduled'
  | 'active'
  | 'hold'
  | 'done'
  | 'void'
  | 'overdue'
  | 'breakdown'

export const STATUS_TONES: readonly StatusTone[] = [
  'open',
  'scheduled',
  'active',
  'hold',
  'done',
  'void',
  'overdue',
  'breakdown',
] as const

/** The stored lifecycle state → tone. Derived states are applied on top. */
const TONE_BY_STATUS: Record<WorkOrderStatus, StatusTone> = {
  Draft: 'open',
  Planned: 'open',
  Scheduled: 'scheduled',
  'In Progress': 'active',
  Suspended: 'hold',
  Completed: 'done',
  Closed: 'done',
  Cancelled: 'void',
}

/** Human label for the tone, used where the raw status is not shown. */
const LABEL_BY_TONE: Record<StatusTone, string> = {
  open: 'Open',
  scheduled: 'Scheduled',
  active: 'In Progress',
  hold: 'Suspended',
  done: 'Completed',
  void: 'Cancelled',
  overdue: 'Overdue',
  breakdown: 'Breakdown',
}

/** A closed work order can no longer be overdue or in breakdown. */
const TERMINAL: ReadonlySet<WorkOrderStatus> = new Set<WorkOrderStatus>([
  'Completed',
  'Closed',
  'Cancelled',
])

export function toneForStatus(status: WorkOrderStatus): StatusTone {
  return TONE_BY_STATUS[status] ?? 'void'
}

export function labelForTone(tone: StatusTone): string {
  return LABEL_BY_TONE[tone]
}

export function badgeClassFor(tone: StatusTone): string {
  return `badge-${tone}`
}

/**
 * Overdue is derived, never stored: a non-terminal work order whose
 * `plannedFinish` has passed. Mirrors the backend dashboard rule
 * (`backend/src/routes/dashboard.ts`): status notIn [Completed, Closed,
 * Cancelled] and plannedFinish < now.
 */
export function isOverdue(
  wo: Pick<WorkOrder, 'status' | 'plannedFinish'>,
  now: number = Date.now(),
): boolean {
  if (TERMINAL.has(wo.status) || !wo.plannedFinish) return false
  const finish = Date.parse(wo.plannedFinish)
  return Number.isFinite(finish) && finish < now
}

/**
 * The tone to paint for a work order, with precedence
 * breakdown > overdue > lifecycle state.
 */
export function toneForWorkOrder(
  wo: Pick<WorkOrder, 'status' | 'plannedFinish' | 'breakdownFlag'>,
  now: number = Date.now(),
): StatusTone {
  if (wo.breakdownFlag && !TERMINAL.has(wo.status)) return 'breakdown'
  if (isOverdue(wo, now)) return 'overdue'
  return toneForStatus(wo.status)
}

/** Generic label → tone, for notifications and other non-work-order records. */
const TONE_BY_LABEL: Record<string, StatusTone> = {
  open: 'open',
  new: 'open',
  draft: 'open',
  planned: 'open',
  scheduled: 'scheduled',
  active: 'active',
  'in progress': 'active',
  'in process': 'active',
  suspended: 'hold',
  hold: 'hold',
  'on hold': 'hold',
  pending: 'hold',
  completed: 'done',
  complete: 'done',
  closed: 'done',
  converted: 'done',
  done: 'done',
  cancelled: 'void',
  canceled: 'void',
  void: 'void',
  rejected: 'void',
  overdue: 'overdue',
  breakdown: 'breakdown',
}

export function toneForLabel(label: string | null | undefined): StatusTone {
  return TONE_BY_LABEL[(label ?? '').trim().toLowerCase()] ?? 'void'
}

/** Priority → the existing `.badge-<level>` chip class. */
export function priorityBadgeClass(priority: string | null | undefined): string {
  switch ((priority ?? '').trim().toLowerCase()) {
    case 'high':
    case 'urgent':
    case 'critical':
      return 'badge-high'
    case 'medium':
    case 'normal':
      return 'badge-medium'
    default:
      return 'badge-low'
  }
}
