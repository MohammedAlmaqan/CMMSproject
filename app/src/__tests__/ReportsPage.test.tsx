import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/pages/ReportsPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { reportService } from '@/services/reportService';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { ApiError } from '@/lib/api';
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
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: ({ stroke, tick }: { stroke?: string; tick?: { fill?: string } }) => (
    <div data-testid="chart-axis" data-stroke={stroke} data-tick-fill={tick?.fill} />
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

  it('paints every backlog chart axis tick with the secondary text colour', async () => {
    renderWithProviders(<ReportsPage />, { route: '/reports' });

    // Three backlog charts (by status, by priority, by work centre) at two
    // axes each.
    const axes = await screen.findAllByTestId('chart-axis');
    expect(axes.length).toBe(6);
    for (const axis of axes) {
      expect(axis.dataset.tickFill).toBe('#A1A1AA');
      // The axis line itself keeps the decorative stroke.
      expect(axis.dataset.stroke).toBe('#92929B');
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
