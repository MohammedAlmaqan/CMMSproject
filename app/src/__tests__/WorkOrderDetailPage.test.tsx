import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WorkOrderDetailPage from '@/pages/WorkOrderDetailPage';
import { useAuthStore } from '@/store/authStore';
import { workOrderService } from '@/services/workOrderService';
import { laborService } from '@/services/laborService';
import { auditLogService } from '@/services/auditLogService';
import { userService } from '@/services/userService';
import { craftService } from '@/services/craftService';
import { materialService } from '@/services/materialService';
import { safetyChecklistService } from '@/services/safetyChecklistService';
import { attachmentService } from '@/services/attachmentService';
import type { User, WorkOrder } from '@/types';

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

vi.mock('@/services/laborService', () => ({
  laborService: { getByWorkOrder: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getAll: vi.fn() },
}));

vi.mock('@/services/userService', () => ({
  userService: { getAll: vi.fn(), getById: vi.fn(), update: vi.fn(), updatePassword: vi.fn() },
}));

vi.mock('@/services/craftService', () => ({
  craftService: { getAll: vi.fn() },
}));

vi.mock('@/services/materialService', () => ({
  materialService: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/services/safetyChecklistService', () => ({
  safetyChecklistService: { getTemplates: vi.fn(), attachToWorkOrder: vi.fn() },
}));

vi.mock('@/services/attachmentService', () => ({
  attachmentService: { getByEntity: vi.fn(), upload: vi.fn(), download: vi.fn(), remove: vi.fn() },
}));

const adminUser: User = {
  userId: 'u-admin',
  username: 'admin',
  fullName: 'AdminUser',
  email: 'admin@example.com',
  role: 'Administrator',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

const baseWo: WorkOrder = {
  workOrderId: 'wo-1',
  woNumber: 'WO-0099',
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

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/work-orders/wo-1']}>
      <Routes>
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('WorkOrderDetailPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(workOrderService.getById).mockResolvedValue(baseWo);
    vi.mocked(laborService.getByWorkOrder).mockResolvedValue([]);
    vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
    vi.mocked(userService.getAll).mockResolvedValue([]);
    vi.mocked(craftService.getAll).mockResolvedValue([]);
    vi.mocked(materialService.getAll).mockResolvedValue([]);
    vi.mocked(safetyChecklistService.getTemplates).mockResolvedValue([]);
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([]);
    vi.mocked(workOrderService.transitionStatus).mockResolvedValue(baseWo);
  });

  it('renders the loading state while the detail fetch is pending', () => {
    let resolveFetch!: (value: WorkOrder) => void;
    vi.mocked(workOrderService.getById).mockImplementationOnce(
      () => new Promise<WorkOrder>((resolve) => { resolveFetch = resolve; })
    );

    renderDetail();

    expect(screen.getByText('Loading work order...')).toBeInTheDocument();

    act(() => {
      resolveFetch(baseWo);
    });
  });

  it('shows an error panel (not a blank screen) when fetching /api/work-orders/:id fails', async () => {
    vi.mocked(workOrderService.getById).mockRejectedValueOnce(new Error('Failed to load work order'));

    renderDetail();

    expect(await screen.findByText('Failed to load work order')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();
    expect(screen.queryByText('WO-0099')).not.toBeInTheDocument();
  });

  it('renders the work order header once loaded', async () => {
    renderDetail();

    expect(await screen.findByText('WO-0099')).toBeInTheDocument();
    expect(screen.getByText('Replace drive belt')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operations/ })).toBeInTheDocument();
  });

  it('shows only the transition buttons allowed for a Draft work order', async () => {
    renderDetail();

    await screen.findByText('WO-0099');

    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('calls transitionStatus when the allowed Plan transition is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Plan' }));

    await waitFor(() => {
      expect(vi.mocked(workOrderService.transitionStatus)).toHaveBeenCalledWith('wo-1', 'Planned');
    });
  });

  it('shows the Close transition for a Completed work order and calls transitionStatus', async () => {
    vi.mocked(workOrderService.getById).mockResolvedValue({ ...baseWo, status: 'Completed' });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(closeBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();

    await user.click(closeBtn);

    await waitFor(() => {
      expect(vi.mocked(workOrderService.transitionStatus)).toHaveBeenCalledWith('wo-1', 'Closed');
    });
  });
});