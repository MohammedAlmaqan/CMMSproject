// ============================================================
// StatusBadge — the only place a status is painted.
// ============================================================
// Colour, glyph and text always travel together (WCAG 1.4.1). Pass a work
// order to get the derived tone (breakdown > overdue > lifecycle); pass an
// explicit `tone` for records that are not work orders.

import { AlertTriangle, Clock } from 'lucide-react'
import {
  badgeClassFor,
  isDerivedTone,
  labelForTone,
  statusDot,
  toneForWorkOrder,
  type StatusTone,
} from '@/lib/status'
import type { WorkOrder } from '@/types'

type ToneSource = Pick<WorkOrder, 'status' | 'plannedFinish' | 'breakdownFlag'>

interface StatusBadgeProps {
  /** Work order to derive the tone from. Ignored when `tone` is given. */
  wo?: ToneSource
  /** Explicit tone, for notifications and other non-work-order records. */
  tone?: StatusTone
  /** Override the visible text (defaults to the status/tone label). */
  label?: string
  /** Show the leading colour dot. */
  showDot?: boolean
}

export default function StatusBadge({ wo, tone, label, showDot = true }: StatusBadgeProps) {
  const resolved: StatusTone = tone ?? (wo ? toneForWorkOrder(wo) : 'void')
  const derived = isDerivedTone(resolved)
  const text = label ?? (wo && !derived ? wo.status : labelForTone(resolved))

  return (
    <span className="inline-flex items-center gap-2">
      {showDot && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusDot(resolved) }}
          aria-hidden="true"
        />
      )}
      <span className={badgeClassFor(resolved)}>
        {resolved === 'breakdown' && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
        {resolved === 'overdue' && <Clock className="w-3 h-3" aria-hidden="true" />}
        {text}
      </span>
    </span>
  )
}
