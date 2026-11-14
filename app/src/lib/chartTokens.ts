// ============================================================
// Chart tokens — the single source of chart colour truth.
// ============================================================
// Recharts writes `fill`/`stroke` as SVG presentation attributes, where a
// `var(--x)` reference is not reliably resolved across engines. Charts
// therefore read the computed `--chart-*` tokens once per render, with the
// light-theme values as a fallback (also used by jsdom in tests, which does
// not load index.css).
//
// Never hardcode a hex in a chart. Add a token to index.css and read it here.

export interface ChartTokens {
  axisTick: string
  axisLine: string
  grid: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  /** Categorical series, all ≥ 4.5:1 against the pane surface. */
  series: string[]
  /** Status tones for status pies/bars — colour matches the badge tones. */
  status: Record<StatusChartKey, string>
  /** Work-order types (CM, PM, PdM, EM, CAL). */
  type: Record<WorkOrderTypeChartKey, string>
}

export type StatusChartKey =
  | 'open'
  | 'scheduled'
  | 'active'
  | 'hold'
  | 'done'
  | 'void'
  | 'overdue'
  | 'breakdown'

export type WorkOrderTypeChartKey = 'CM' | 'PM' | 'PdM' | 'EM' | 'CAL'

const FALLBACK = {
  axisTick: '#4a5058',
  axisLine: '#b6bcc6',
  grid: '#d5d9e0',
  tooltipBg: '#ffffff',
  tooltipBorder: '#b6bcc6',
  tooltipText: '#16181d',
  series: ['#1d4ed8', '#b45309', '#0f766e', '#b91c1c', '#6d28d9', '#475569'],
  status: {
    open: '#b45309',
    scheduled: '#1e40af',
    active: '#1d4ed8',
    hold: '#646b75',
    done: '#047857',
    void: '#646b75',
    overdue: '#b91c1c',
    breakdown: '#b91c1c',
  },
  type: {
    CM: '#b45309',
    PM: '#1d4ed8',
    PdM: '#6d28d9',
    EM: '#b91c1c',
    CAL: '#0f766e',
  },
} as const

function read(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return fallback
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function chartTokens(): ChartTokens {
  return {
    axisTick: read('--chart-axis-tick', FALLBACK.axisTick),
    axisLine: read('--chart-axis-line', FALLBACK.axisLine),
    grid: read('--chart-grid', FALLBACK.grid),
    tooltipBg: read('--chart-tooltip-bg', FALLBACK.tooltipBg),
    tooltipBorder: read('--chart-tooltip-border', FALLBACK.tooltipBorder),
    tooltipText: read('--chart-tooltip-text', FALLBACK.tooltipText),
    series: FALLBACK.series.map((fallback, i) =>
      read(`--chart-series-${i + 1}`, fallback),
    ),
    status: {
      open: read('--status-open-border', FALLBACK.status.open),
      scheduled: read('--status-scheduled-border', FALLBACK.status.scheduled),
      active: read('--status-active-border', FALLBACK.status.active),
      hold: read('--status-hold-border', FALLBACK.status.hold),
      done: read('--status-done-border', FALLBACK.status.done),
      void: read('--status-void-border', FALLBACK.status.void),
      overdue: read('--status-overdue-border', FALLBACK.status.overdue),
      breakdown: read('--status-breakdown-border', FALLBACK.status.breakdown),
    },
    type: {
      CM: read('--chart-series-2', FALLBACK.type.CM),
      PM: read('--chart-series-1', FALLBACK.type.PM),
      PdM: read('--chart-series-5', FALLBACK.type.PdM),
      EM: read('--chart-series-4', FALLBACK.type.EM),
      CAL: read('--chart-series-3', FALLBACK.type.CAL),
    },
  }
}

/** Fallback values exported for tests that must not depend on a live DOM. */
export const chartTokenFallback = FALLBACK
