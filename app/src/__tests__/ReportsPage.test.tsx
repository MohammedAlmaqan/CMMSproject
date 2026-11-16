import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/pages/ReportsPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { reportService } from '@/services/reportService';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { ApiError } from '@/lib/api';
import { chartTokenFallback } from '@/lib/chartTokens';
import type { User } from '@/types';

vi.mock('@/services/reportService', () => ({
  reportService: {
    getBacklog: vi.fn(),
    getPMCompliance: vi.fn(),
    getMTBF: vi.fn(),
    getMTTR: vi.fn(),
    getCostSummary: vi.fn(),
    getDowntime: vi.fn(),
    getMaterialConsumption: vi.fn(),
  },
}));

// Recharts lays out nothing in jsdom (a ResponsiveContainer has no width), so
// these stand-ins keep the props the page actually passes to the axes - the
// tick text colour is the thing under test (v1.1-13).
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="chart" data-rows={JSON.stringify(data ?? [])}>{children}</div>
  ),
  Bar: () => <div />,
  XAxis: ({ stroke, tick, dataKey }: { stroke?: string; tick?: { fill?: string }; dataKey?: string }) => (
    <div data-testid="chart-axis" data-stroke={stroke} data-tick-fill={tick?.fill} data-key={dataKey} />
  ),
  YAxis: ({ stroke, tick }: { stroke?: string; tick?: { fill?: string } }) => (
    <div data-testid="chart-axis" data-stroke={stroke} data-tick-fill={tick?.fill} />
  ),
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

describe('ReportsPage chart ticks (v1.1-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportService.getBacklog).mockResolvedValue({
      byStatus: [{ status: 'Open', count: 1, totalPlannedHours: 5 }],
      byPriority: [{ priority: 'High', count: 1, totalPlannedHours: 5 }],
      byWorkCenter: [
        { workCenterId: 'wc-1', workCenterCode: 'MECH', workCenterName: 'Mechanical', count: 1, totalPlannedHours: 5 },
      ],
    });
  });

  it('paints every backlog chart axis from the chart tokens', async () => {
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    // Three backlog charts (by status, by priority, by work centre) at two
    // axes each.
    const axes = await screen.findAllByTestId('chart-axis');
    expect(axes.length).toBe(6);
    for (const axis of axes) {
      // Token identity, not a literal: jsdom has no stylesheet, so the
      // fallback is the value the token resolves to in the light theme.
      expect(axis.dataset.tickFill).toBe(chartTokenFallback.axisTick);
      expect(axis.dataset.stroke).toBe(chartTokenFallback.axisLine);
    }
    expect(reportService.getBacklog).toHaveBeenCalledTimes(1);
  });
});

const requester: User = {
  userId: 'u-req',
  username: 'req',
  fullName: 'Requester',
  email: 'req@example.com',
  role: 'Requester',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

const audit = {
  createdBy: 'u-admin',
  createdDate: '2026-01-01T00:00:00.000Z',
  modifiedBy: '',
  modifiedDate: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
};

describe('ReportsPage filters (G8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: requester, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({
      locations: [
        { ...audit, functionalLocationId: 'fl-1', locationCode: 'PLANT-01', description: 'Main plant', parentLocationId: null, locationType: 'Plant', operationalStatus: 'Active', installationDate: null, gpsCoordinates: null, safetyCritical: false },
      ],
      equipment: [],
      workCenters: [],
    });
    vi.mocked(reportService.getBacklog).mockResolvedValue({
      byStatus: [{ status: 'Open', count: 1, totalPlannedHours: 5 }],
      byPriority: [{ priority: 'High', count: 1, totalPlannedHours: 5 }],
      byWorkCenter: [],
    });
  });

  it('threads the from/to dates into the report request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    await user.type(await screen.findByLabelText('Report from date'), '2026-01-01');
    await user.type(screen.getByLabelText('Report to date'), '2026-03-31');

    await waitFor(() =>
      expect(vi.mocked(reportService.getBacklog)).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-01-01', to: '2026-03-31' })
      )
    );
  }, 20000);

  it('sends the location and descendant toggle together', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    await user.selectOptions(await screen.findByLabelText('Report functional location'), 'fl-1');
    await user.click(screen.getByRole('checkbox', { name: 'Include sub-locations' }));

    await waitFor(() =>
      expect(vi.mocked(reportService.getBacklog)).toHaveBeenLastCalledWith(
        expect.objectContaining({ functionalLocationId: 'fl-1', includeDescendantLocations: 'true' })
      )
    );
  }, 20000);

  it('surfaces a 400 filter rejection in the report pane', async () => {
    vi.mocked(reportService.getBacklog).mockRejectedValue(
      new ApiError(400, 'from must not be later than to')
    );
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    await user.type(await screen.findByLabelText('Report from date'), '2026-03-31');
    await user.type(screen.getByLabelText('Report to date'), '2026-01-01');

    expect(await screen.findByRole('alert')).toHaveTextContent('from must not be later than to');
  }, 20000);
});

/**
 * The defect this guards against: the report handlers returned only the
 * equipment's database id, and the page mapped it straight onto the axis, so
 * the charts and the Excel export both showed UUIDs.
 */
describe('ReportsPage axis labels carry the equipment code', () => {
  const uuid = '3f2a1c4e-9b8d-4f6a-8e21-5c7d0b9a1e33';

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: requester, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ locations: [], equipment: [], workCenters: [] });
    // The page opens on the backlog report; an empty one keeps the pane out of
    // the way so the only chart rendered is the one under test.
    vi.mocked(reportService.getBacklog).mockResolvedValue({ byStatus: [], byPriority: [], byWorkCenter: [] });
  });

  it('draws MTBF, MTTR and downtime from the code, never the id', async () => {
    vi.mocked(reportService.getMTBF).mockResolvedValue([
      { equipmentId: uuid, equipmentCode: 'P-101', equipmentName: 'Feed pump', mtbfHours: 18, breakdownCount: 2 },
    ]);
    vi.mocked(reportService.getMTTR).mockResolvedValue({
      byEquipment: [
        { equipmentId: uuid, equipmentCode: 'P-101', equipmentName: 'Feed pump', mttrHours: 3, breakdownCount: 2 },
      ],
      byLocation: [],
      excludedIncomplete: 0,
    });
    vi.mocked(reportService.getDowntime).mockResolvedValue([
      { equipmentId: uuid, equipmentCode: 'P-101', equipmentName: 'Feed pump', totalDowntimeHours: 6, workOrderCount: 2 },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    for (const report of ['MTBF', 'MTTR', 'Downtime']) {
      await user.click(screen.getByRole('button', { name: report }));
      // MTTR paints two charts (by equipment, by location); the equipment one
      // is first and is the one that must carry the code.
      const chart = (await screen.findAllByTestId('chart'))[0];
      await waitFor(() => expect(chart.dataset.rows).toContain('P-101'));
      expect(chart.dataset.rows, `${report} rows`).not.toContain(uuid);
      expect(screen.getAllByTestId('chart-axis')[0].dataset.key).toBe('equipment');
    }
  }, 30000);
});
