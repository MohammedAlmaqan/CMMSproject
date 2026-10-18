import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import ReportsPage from '@/pages/ReportsPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { reportService } from '@/services/reportService';

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
