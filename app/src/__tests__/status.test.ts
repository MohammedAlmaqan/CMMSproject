import { describe, expect, it } from 'vitest'
import {
  badgeClassFor,
  isDerivedTone,
  isOverdue,
  labelForTone,
  priorityBadgeClass,
  toneForLabel,
  toneForStatus,
  toneForWorkOrder,
  WORK_ORDER_STATUSES,
} from '@/lib/status'

const NOW = Date.parse('2026-11-14T12:00:00Z')
const PAST = '2026-11-10T08:00:00Z'
const FUTURE = '2026-11-20T08:00:00Z'

function wo(
  overrides: Partial<{ status: (typeof WORK_ORDER_STATUSES)[number]; plannedFinish: string | null; breakdownFlag: boolean }> = {},
) {
  return {
    status: 'In Progress' as (typeof WORK_ORDER_STATUSES)[number],
    plannedFinish: FUTURE as string | null,
    breakdownFlag: false,
    ...overrides,
  }
}

describe('status tones', () => {
  it('maps every stored status to exactly one tone', () => {
    expect(WORK_ORDER_STATUSES.map(toneForStatus)).toEqual([
      'open',
      'open',
      'scheduled',
      'active',
      'hold',
      'done',
      'done',
      'void',
    ])
  })

  it('gives every tone a badge class and a label', () => {
    expect(badgeClassFor('overdue')).toBe('badge-overdue')
    expect(labelForTone('breakdown')).toBe('Breakdown')
    expect(isDerivedTone('overdue')).toBe(true)
    expect(isDerivedTone('breakdown')).toBe(true)
    expect(isDerivedTone('done')).toBe(false)
  })
})

describe('derived states', () => {
  it('treats a non-terminal work order past its planned finish as overdue', () => {
    expect(isOverdue(wo({ status: 'Planned', plannedFinish: PAST }), NOW)).toBe(true)
    expect(isOverdue(wo({ status: 'In Progress', plannedFinish: PAST }), NOW)).toBe(true)
  })

  it('never marks a terminal work order overdue', () => {
    for (const status of ['Completed', 'Closed', 'Cancelled'] as const) {
      expect(isOverdue(wo({ status, plannedFinish: PAST }), NOW)).toBe(false)
    }
  })

  it('ignores a missing or future planned finish', () => {
    expect(isOverdue(wo({ plannedFinish: null }), NOW)).toBe(false)
    expect(isOverdue(wo({ plannedFinish: FUTURE }), NOW)).toBe(false)
  })

  it('lets breakdown outrank overdue, and overdue outrank the lifecycle', () => {
    expect(toneForWorkOrder(wo({ breakdownFlag: true, plannedFinish: PAST }), NOW)).toBe('breakdown')
    expect(toneForWorkOrder(wo({ status: 'Planned', plannedFinish: PAST }), NOW)).toBe('overdue')
    expect(toneForWorkOrder(wo({ status: 'Scheduled', plannedFinish: FUTURE }), NOW)).toBe('scheduled')
  })

  it('stops showing breakdown once the work order is closed', () => {
    expect(toneForWorkOrder(wo({ status: 'Closed', breakdownFlag: true, plannedFinish: PAST }), NOW)).toBe('done')
  })
})

describe('generic labels and priority', () => {
  it('maps common record labels to tones', () => {
    expect(toneForLabel('In Process')).toBe('active')
    expect(toneForLabel('Converted')).toBe('done')
    expect(toneForLabel('cancelled')).toBe('void')
    expect(toneForLabel('something unknown')).toBe('void')
    expect(toneForLabel(null)).toBe('void')
  })

  it('maps priority to a chip class', () => {
    expect(priorityBadgeClass('High')).toBe('badge-high')
    expect(priorityBadgeClass('Medium')).toBe('badge-medium')
    expect(priorityBadgeClass('Low')).toBe('badge-low')
    expect(priorityBadgeClass(undefined)).toBe('badge-low')
  })
})
