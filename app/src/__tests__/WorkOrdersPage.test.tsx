import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkOrdersPage from '@/pages/WorkOrdersPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { workOrderService } from '@/services/workOrderService';
import type { PaginatedResponse } from '@/lib/api';
import type { WorkOrder } from '@/types';

vi.mock('@/services/workOrderService', () => ({
  workOrderService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transitionStatus: vi.fn(),
  },
}));

const row: WorkOrder = {
  workOrderId: 'wo-1',
  woNumber: 'WO-0001',
  type: 'CM',
  priority: 'Medium',
  status: 'Draft',
  functionalLocationId: 'fl-1',
  equipmentId: 'eq-1',
  description: 'Replace drive belt',
  workCenterId: 'wc-1',
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

const page = (items: WorkOrder[]): PaginatedResponse<WorkOrder> => ({ data: items, total: items.length, skip: 0, take: 250 });

describe('WorkOrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading state while the fetch is pending', () => {
    let resolveFetch!: (value: PaginatedResponse<WorkOrder>) => void;
    vi.mocked(workOrderService.getAll).mockImplementation(
      () => new Promise<PaginatedResponse<WorkOrder>>((resolve) => { resolveFetch = resolve; })
    );

    renderWithProviders(<WorkOrdersPage />, { route: '/work-orders' });

    expect(screen.getByText('Loading work orders...')).toBeInTheDocument();

    act(() => {
      resolveFetch(page([]));
    });
  });

  it('shows an error panel with a Retry action when the API request fails, and Retry recovers', async () => {
    vi.mocked(workOrderService.getAll).mockRejectedValueOnce(new Error('Failed to load work orders'));
    const user = userEvent.setup();

    renderWithProviders(<WorkOrdersPage />, { route: '/work-orders' });

    expect(await screen.findByText('Failed to load work orders')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();

    vi.mocked(workOrderService.getAll).mockResolvedValueOnce(page([row]));
    await user.click(retry);

    expect(await screen.findByText('WO-0001')).toBeInTheDocument();
  });

  it('renders populated rows from the mocked service', async () => {
    vi.mocked(workOrderService.getAll).mockResolvedValueOnce(
      page([{ ...row, workOrderId: 'wo-2', woNumber: 'WO-0002', description: 'Lubricate gearbox' }])
    );

    renderWithProviders(<WorkOrdersPage />, { route: '/work-orders' });

    expect(await screen.findByText('WO-0002')).toBeInTheDocument();
    expect(screen.getByText('Lubricate gearbox')).toBeInTheDocument();
    expect(screen.getByText('Draft', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/1 work orders/)).toBeInTheDocument();
  });

  it('renders the empty state when the list has no work orders', async () => {
    vi.mocked(workOrderService.getAll).mockResolvedValueOnce(page([]));

    renderWithProviders(<WorkOrdersPage />, { route: '/work-orders' });

    expect(await screen.findByText('No work orders found')).toBeInTheDocument();
  });
});