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
import { failureCodeService } from '@/services/failureCodeService';
import { costSplitService } from '@/services/costSplitService';
import { ApiError } from '@/lib/api';
import type { User, WorkOrder } from '@/types';

vi.mock('@/services/workOrderService', () => ({
  workOrderService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getHistory: vi.fn(),
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
  materialService: { getAll: vi.fn(), getAllPages: vi.fn(), exportCsv: vi.fn(), importCsv: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/services/safetyChecklistService', () => ({
  safetyChecklistService: { getTemplates: vi.fn(), attachToWorkOrder: vi.fn() },
}));

vi.mock('@/services/attachmentService', () => ({
  attachmentService: { getByEntity: vi.fn(), upload: vi.fn(), download: vi.fn(), remove: vi.fn() },
}));

vi.mock('@/services/failureCodeService', () => ({
  failureCodeService: { getAll: vi.fn() },
}));

vi.mock('@/services/costSplitService', () => ({
  costSplitService: { getAllocation: vi.fn(), replace: vi.fn() },
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

const technicianUser: User = {
  userId: 'u-tech',
  username: 'tech',
  fullName: 'TechUser',
  email: 'tech@example.com',
  role: 'Technician',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

// SOW 3.5.2 fixture: a balanced two-way split with the allocated amounts the
// GET endpoint computes by distributing actualCost largest-share-first.
const allocationFixture = {
  workOrderId: 'wo-1',
  workOrderCostCenterCode: 'CC-1',
  actualCost: 1000,
  plannedCost: 800,
  splits: [
    { splitId: 's1', workOrderId: 'wo-1', costCenterCode: 'CC-1', percentage: 60, allocatedActualCost: 600 },
    { splitId: 's2', workOrderId: 'wo-1', costCenterCode: 'CC-2', percentage: 40, allocatedActualCost: 400 },
  ],
  totalPercentage: 100,
  isBalanced: true,
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
    safetyNotes: null,
    causeCodeId: null,
    failureCodeId: null,
  completionRemarks: null,
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
    vi.mocked(workOrderService.getHistory).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(laborService.getByWorkOrder).mockResolvedValue([]);
    vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
    vi.mocked(userService.getAll).mockResolvedValue([]);
    vi.mocked(craftService.getAll).mockResolvedValue([]);
    vi.mocked(materialService.getAll).mockResolvedValue({data:[],total:0,skip:0,take:0});
    vi.mocked(materialService.getAllPages).mockResolvedValue([]);
    vi.mocked(safetyChecklistService.getTemplates).mockResolvedValue([]);
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([]);
    vi.mocked(failureCodeService.getAll).mockResolvedValue([]);
    vi.mocked(costSplitService.getAllocation).mockResolvedValue(allocationFixture);
    vi.mocked(costSplitService.replace).mockResolvedValue({
      workOrderId: 'wo-1',
      splits: [],
      replacedCount: 2,
      totalPercentage: 100,
    });
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

  it('says so when the failure-code lookup fails, instead of showing a list that looks complete', async () => {
    // An empty dropdown is ambiguous: it reads as "no failure codes exist" when
    // the truth may be "the lookup failed". The page still has to load - a
    // secondary lookup must not take the work order down with it - but the
    // picker must not pretend the list is complete.
    vi.mocked(failureCodeService.getAll).mockRejectedValue(new Error('failure-code lookup down'));
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Failure, Cause & Notes' }));

    expect(
      await screen.findByText(/Failure codes could not be loaded/)
    ).toBeInTheDocument();
  });

  it('offers the failure picker without a warning when the lookup succeeds', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Failure, Cause & Notes' }));

    expect(await screen.findByLabelText('Failure code')).toBeInTheDocument();
    expect(screen.queryByText(/Failure codes could not be loaded/)).not.toBeInTheDocument();
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

  it('renders the cost allocation with per-line allocated amounts', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));

    expect(await screen.findByText('$600')).toBeInTheDocument();
    expect(screen.getByText('$400')).toBeInTheDocument();
    expect(screen.getByText('CC-2')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit allocation' })).toBeInTheDocument();
  });

  it('replaces the whole set on save and re-reads the allocation', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit allocation' }));

    expect(screen.getByLabelText('Cost centre row 1')).toHaveValue('CC-1');
    expect(screen.getByLabelText('Percentage row 2')).toHaveValue(40);

    await user.clear(screen.getByLabelText('Cost centre row 2'));
    await user.type(screen.getByLabelText('Cost centre row 2'), 'CC-3');
    await user.click(screen.getByRole('button', { name: 'Save allocation' }));

    await waitFor(() => {
      expect(costSplitService.replace).toHaveBeenCalledWith('wo-1', [
        { costCenterCode: 'CC-1', percentage: 60 },
        { costCenterCode: 'CC-3', percentage: 40 },
      ]);
    });
    expect(await screen.findByText('Allocation saved.')).toBeInTheDocument();
    expect(vi.mocked(costSplitService.getAllocation)).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Save allocation' })).not.toBeInTheDocument();
  });

  it('refuses to submit an allocation that does not total 100', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit allocation' }));

    await user.clear(screen.getByLabelText('Percentage row 2'));
    await user.type(screen.getByLabelText('Percentage row 2'), '30');
    await user.click(screen.getByRole('button', { name: 'Save allocation' }));

    expect(
      await screen.findByText('Cost split percentages must total 100 (received 90).')
    ).toBeInTheDocument();
    expect(costSplitService.replace).not.toHaveBeenCalled();
    // The editor stays open so the bad row can be corrected in place.
    expect(screen.getByLabelText('Cost centre row 1')).toBeInTheDocument();
  });

  it('surfaces the API rejection when the server refuses the set', async () => {
    vi.mocked(costSplitService.replace).mockRejectedValueOnce(
      new ApiError(400, 'Cost center CC-1 is allocated more than once')
    );
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit allocation' }));
    await user.click(screen.getByRole('button', { name: 'Save allocation' }));

    expect(await screen.findByText('Cost center CC-1 is allocated more than once')).toBeInTheDocument();
    expect(screen.getByLabelText('Cost centre row 1')).toBeInTheDocument();
  });

  it('offers no allocation editor below the Maintenance Planner floor', async () => {
    useAuthStore.setState({ user: technicianUser, isAuthenticated: true, loading: false, error: null });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));

    expect(await screen.findByText('$600')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit allocation' })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/Only Maintenance Planners can change the cost allocation/)
    ).toBeInTheDocument();
  });

  it('says so when the allocation read fails, and the retry re-reads it', async () => {
    vi.mocked(costSplitService.getAllocation).mockRejectedValue(new Error('allocation read down'));
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));

    expect(await screen.findByText('Cost allocation could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('No cost split')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry cost allocation load' }));

    await waitFor(() => {
      expect(costSplitService.getAllocation).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Cost allocation could not be loaded.')).toBeInTheDocument();
  });

  it('clearing every row sends an empty set, returning the work order to its own cost centre', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /Costs/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit allocation' }));

    await user.click(screen.getByRole('button', { name: 'Remove cost row 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove cost row 1' }));

    // The next read after the clear returns the now-empty allocation.
    vi.mocked(costSplitService.getAllocation).mockResolvedValueOnce({
      workOrderId: 'wo-1',
      workOrderCostCenterCode: 'CC-1',
      actualCost: 1000,
      plannedCost: 800,
      splits: [],
      totalPercentage: 0,
      isBalanced: true,
    });

    await user.click(screen.getByRole('button', { name: 'Clear allocation' }));

    await waitFor(() => {
      expect(costSplitService.replace).toHaveBeenCalledWith('wo-1', []);
    });
    expect(await screen.findByText('Allocation cleared.')).toBeInTheDocument();
    expect(
      await screen.findByText(/No cost split — charged wholly to CC-1/)
    ).toBeInTheDocument();
  });
});