import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/pages/DashboardPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { reportService } from '@/services/reportService';
import { dashboardService } from '@/services/dashboardService';
import { useAppStore } from '@/store/appStore';
import type { WorkOrder } from '@/types';

vi.mock('@/services/reportService', () => ({
  reportService: {
    getBacklogHoursByWorkCenter: vi.fn(),
    getTopCostEquipment: vi.fn(),
    getNotificationsAwaitingConversion: vi.fn(),
  },
}));

vi.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getKPIs: vi.fn(),
    getAlerts: vi.fn().mockResolvedValue([]),
    getCostSummary: vi.fn().mockResolvedValue([]),
  },
}));

// The 3D backdrop needs WebGL, which jsdom has none of, and it is lazy-loaded so
// it would otherwise be pulled in as a side effect of rendering the page.
vi.mock('@/components/dashboard/TacticalDashboardGrid', () => ({
  default: () => <div data-testid="tactical-grid" />,
}));

/**
 * Recharts renders nothing measurable in jsdom -- a ResponsiveContainer has no
 * width, so its children never lay out. These stand-ins keep the props the page
 * actually passes, which is the thing under test: the backlog widget must hand
 * the chart `backlogHours`, not a count.
 *
 * In recharts a `Bar` reads its rows from the enclosing `BarChart` through
 * context, so the mock carries them the same way. `h.data` is assigned by the
 * chart while it renders, which happens before its bars.
 */
const h = vi.hoisted(() => ({ data: [] as Array<Record<string, unknown>> }));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data?: Array<Record<string, unknown>>; children: React.ReactNode }) => {
    h.data = data ?? [];
    return <div>{children}</div>;
  },
  Bar: ({ dataKey }: { dataKey: string }) => (
    <div
      data-testid={`bar-${dataKey}`}
      data-values={JSON.stringify(h.data.map((row) => row[dataKey]))}
    />
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => <div data-testid="area" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

/** One open work order for WC-1 in the store, against a report of 10 hours. */
const storeWorkOrder: WorkOrder = {
  workOrderId: 'wo-1',
  woNumber: 'WO-0001',
  type: 'CM',
  priority: 'Medium',
  status: 'Draft',
  functionalLocationId: 'fl-1',
  equipmentId: 'eq-1',
  description: 'Replace drive belt',
  workCenterId: 'WC-1',
  supervisorUserId: '',
  plannedStart: null,
  plannedFinish: null,
  actualStart: null,
  actualFinish: null,
  costCenterCode: '',
  internalOrder: '',
  breakdownFlag: false,
  safetyCriticalFlag: false,
  plannedCost: 0,
  actualCost: 0,
  createdBy: 'seed',
  createdDate: '2026-09-01T00:00:00.000Z',
  modifiedBy: '',
  modifiedDate: '2026-09-01T00:00:00.000Z',
  isDeleted: false,
};

describe('DashboardPage rows 65-67', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardService.getAlerts).mockResolvedValue([]);
    vi.mocked(dashboardService.getCostSummary).mockResolvedValue([]);

    vi.mocked(reportService.getBacklogHoursByWorkCenter).mockResolvedValue([
      { workCenterId: 'WC-1', workCenterCode: 'MECH', workCenterName: 'Mechanical', openWorkOrderCount: 1, backlogHours: 10 },
    ]);
    vi.mocked(reportService.getTopCostEquipment).mockResolvedValue([
      { equipmentId: 'eq-1', equipmentCode: 'PUMP-01', equipmentName: 'Feed pump', workOrderCount: 2, plannedCost: 500, actualCost: 300, totalCost: 300 },
    ]);
    vi.mocked(reportService.getNotificationsAwaitingConversion).mockResolvedValue({
      total: 4,
      byPriority: [{ priority: 'High', count: 3 }, { priority: 'Low', count: 1 }],
      oldestAgeDays: 6,
    });

    // The store carries one work order for WC-1. Every figure below is read from
    // a report, so the store's contents must not be able to produce any of them.
    useAppStore.setState({ workOrders: [storeWorkOrder], error: null });
  });

  it('row 65: charts the report\'s backlog hours, not a count of work orders', async () => {
    renderWithProviders(<DashboardPage />, { route: '/' });

    const bar = await screen.findByTestId('bar-backlogHours');
    // The chart mounts before the report resolves, so the assertion waits for
    // the data rather than for the element.
    await waitFor(() => expect(bar.dataset.values).toBe('[10]'));
    // A widget counting the store's work orders would emit `count` with [1].
    expect(screen.queryByTestId('bar-count')).toBeNull();
    expect(screen.getByText('Backlog Hours by Work Center')).toBeInTheDocument();
  });

  it('row 65: asks the report for the whole estate, not the store', async () => {
    renderWithProviders(<DashboardPage />, { route: '/' });
    await screen.findByTestId('bar-backlogHours');
    expect(reportService.getBacklogHoursByWorkCenter).toHaveBeenCalledTimes(1);
  });

  it('row 66: lists the equipment the report ranked', async () => {
    renderWithProviders(<DashboardPage />, { route: '/' });
    expect(await screen.findByText('PUMP-01')).toBeInTheDocument();
    expect(screen.getByText('Top 10 Highest-Cost Equipment')).toBeInTheDocument();
  });

  it('row 67: shows the awaiting-conversion total, breakdown and oldest age', async () => {
    renderWithProviders(<DashboardPage />, { route: '/' });
    expect(await screen.findByText('Awaiting Conversion')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Oldest waiting 6 days')).toBeInTheDocument();
  });

  it('says a report failed rather than rendering a zero', async () => {
    vi.mocked(reportService.getNotificationsAwaitingConversion).mockRejectedValue(new Error('boom'));
    renderWithProviders(<DashboardPage />, { route: '/' });
    // The count stays 0 because that is the initial state, but the widget is
    // marked unavailable so the zero cannot be read as "nothing is waiting".
    await waitFor(() => expect(screen.getByText('unavailable')).toBeInTheDocument());
  });
});
