import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
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
import type { User, WorkOrder, LaborEntry } from '@/types';

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
  userService: { getAll: vi.fn(), getOptions: vi.fn(), getById: vi.fn(), update: vi.fn(), updatePassword: vi.fn(), changePassword: vi.fn() },
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

const requesterUser: User = {
  ...technicianUser,
  userId: 'u-req',
  username: 'req',
  fullName: 'ReqUser',
  email: 'req@example.com',
  role: 'Requester',
};

const viewOnlyUser: User = {
  ...technicianUser,
  userId: 'u-view',
  username: 'view',
  fullName: 'ViewUser',
  email: 'view@example.com',
  role: 'View-Only',
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

// Every service the detail page reads in one Promise.all. Named rather than
// inlined in the first describe's beforeEach so a second describe cannot forget
// one - forgetting failureCodeService.getAll leaves it returning undefined and
// the page reports "Failed to load work order", which reads like a page bug.
function setupDetailMocks() {
  useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
  vi.clearAllMocks();
  vi.mocked(workOrderService.getById).mockResolvedValue(baseWo);
  vi.mocked(workOrderService.getHistory).mockResolvedValue({ data: [], total: 0 });
  vi.mocked(laborService.getByWorkOrder).mockResolvedValue([]);
  vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  vi.mocked(userService.getAll).mockResolvedValue([]);
  vi.mocked(userService.getOptions).mockResolvedValue([]);
  vi.mocked(craftService.getAll).mockResolvedValue([]);
  vi.mocked(materialService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 0 });
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
}

describe('WorkOrderDetailPage', () => {
  beforeEach(() => {
    setupDetailMocks();
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

  it('gives every operation row its own edit and delete names', async () => {
    vi.mocked(workOrderService.getById).mockResolvedValue({
      ...baseWo,
      operations: [
        { operationId: 'op-1', workOrderId: 'wo-1', sequenceNumber: 1, description: 'Isolate supply', craftId: 'cf-1', plannedHours: 2, numberOfTechnicians: 1, actualHours: null, status: 'Pending', craft: null },
        { operationId: 'op-2', workOrderId: 'wo-1', sequenceNumber: 3, description: 'Fit new belt', craftId: 'cf-1', plannedHours: 4, numberOfTechnicians: 1, actualHours: null, status: 'Pending', craft: null },
      ],
    } as WorkOrder);
    renderDetail();

    await screen.findByText('WO-0099');

    expect(screen.getByRole('button', { name: 'Edit operation 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit operation 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete operation 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete operation 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('scopes the service row edit controls to their row', async () => {
    vi.mocked(workOrderService.getById).mockResolvedValue({
      ...baseWo,
      externalServices: [
        { serviceCostId: 'svc-1', workOrderId: 'wo-1', vendor: 'Acme Lift', description: 'Quarterly inspection', cost: 250, invoiceRef: 'INV-1' },
        { serviceCostId: 'svc-2', workOrderId: 'wo-1', vendor: 'Bolt Co', description: 'Fastener supply', cost: 40, invoiceRef: 'INV-2' },
      ],
    } as WorkOrder);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /^Services/ }));

    expect(await screen.findByRole('button', { name: 'Edit service 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit service 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete service 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete service 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit service 1' }));

    expect(await screen.findByRole('button', { name: 'Save service 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel editing service 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('distinguishes labor rows even when the same technician logs two entries', async () => {
    // Both entries are Ada's, so any name derived from the technician alone
    // would put two identical "Edit"/"Delete" buttons in the accessible tree.
    vi.mocked(laborService.getByWorkOrder).mockResolvedValue([
      { laborEntryId: 'le-1', operationId: 'op-1', userId: 'u-1', hoursWorked: 8, entryDateTime: '2026-09-02T08:00:00.000Z', notes: 'Belt fitted', createdBy: 'u-1', createdDate: '2026-09-02T08:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-02T08:00:00.000Z', isDeleted: false, user: { userId: 'u-1', fullName: 'Ada One', username: 'ada' }, operation: { operationId: 'op-1', description: 'Fit new belt', sequenceNumber: 1 } },
      { laborEntryId: 'le-2', operationId: 'op-1', userId: 'u-1', hoursWorked: 3, entryDateTime: '2026-09-03T09:00:00.000Z', notes: 'Re-tension', createdBy: 'u-1', createdDate: '2026-09-03T09:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-03T09:00:00.000Z', isDeleted: false, user: { userId: 'u-1', fullName: 'Ada One', username: 'ada' } },
    ] as unknown as LaborEntry[]);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /^Labor/ }));

    expect(await screen.findByRole('button', { name: 'Edit labor entry 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit labor entry 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete labor entry 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete labor entry 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('gives each attachment row its own download and delete names', async () => {
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([
      { attachmentId: 'at-1', entityType: 'WorkOrder', entityId: 'wo-1', originalName: 'pump-data.pdf', mimeType: 'application/pdf', sizeBytes: 2048, storagePath: 'wo-1/pump-data.pdf', uploadedByUserId: 'u-1', createdBy: 'u-1', createdDate: '2026-09-01T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-01T00:00:00.000Z', isDeleted: false },
      { attachmentId: 'at-2', entityType: 'WorkOrder', entityId: 'wo-1', originalName: 'thermal-scan.jpg', mimeType: 'image/jpeg', sizeBytes: 4096, storagePath: 'wo-1/thermal-scan.jpg', uploadedByUserId: 'u-1', createdBy: 'u-1', createdDate: '2026-09-02T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-02T00:00:00.000Z', isDeleted: false },
    ]);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /^Attachments/ }));

    expect(await screen.findByRole('button', { name: 'Download file 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download file 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete attachment 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete attachment 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('hides the status transitions, comment composer and upload from a View-Only user', async () => {
    // N12: PUT /work-orders/:id/status, POST /comments and POST /attachments are
    // all above View-Only on the API, so none of these controls may be offered.
    useAuthStore.setState({ user: viewOnlyUser, isAuthenticated: true, loading: false, error: null });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');

    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Comments/ }));
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Attachments/ }));
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('offers the comment composer and upload to a Requester but not the status transitions', async () => {
    useAuthStore.setState({ user: requesterUser, isAuthenticated: true, loading: false, error: null });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');

    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Comments/ }));
    expect(screen.getByLabelText('Add a comment')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Attachments/ }));
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('offers the status transitions to a Technician', async () => {
    useAuthStore.setState({ user: technicianUser, isAuthenticated: true, loading: false, error: null });
    renderDetail();

    await screen.findByText('WO-0099');

    expect(screen.getByRole('button', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('lets a Technician log labor against themselves (G1 regression)', async () => {
    // G1: the technician picker used to come from the Administrator-only
    // /users read, so every other role saw an empty select and the Log button
    // could never enable. It now comes from /users/options (Requester+) and
    // defaults to the signed-in user, which is also what the API attributes
    // the entry to when userId is omitted.
    vi.mocked(workOrderService.getById).mockResolvedValue({
      ...baseWo,
      operations: [
        { operationId: 'op-1', workOrderId: 'wo-1', sequenceNumber: 1, description: 'Isolate supply', craftId: 'cf-1', plannedHours: 2, numberOfTechnicians: 1, actualHours: null, status: 'Pending', craft: null },
      ],
    } as WorkOrder);
    vi.mocked(userService.getOptions).mockResolvedValue([
      { userId: 'u-tech', username: 'tech', fullName: 'TechUser', role: 'Technician' },
    ]);
    vi.mocked(laborService.create).mockResolvedValue({} as LaborEntry);
    useAuthStore.setState({ user: technicianUser, isAuthenticated: true, loading: false, error: null });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: /^Labor/ }));
    await user.click(screen.getByRole('button', { name: 'Log Labor' }));

    const technicianSelect = await screen.findByLabelText('Technician');
    expect(technicianSelect).toHaveValue('u-tech');
    expect(screen.getByRole('button', { name: 'Log' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Operation'), 'op-1');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    await waitFor(() =>
      expect(vi.mocked(laborService.create)).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'op-1', userId: 'u-tech' })
      )
    );
  });
});

// F4: the header fields had no edit affordance anywhere in the app. The only way
// to reassign a supervisor or move a planned date was a raw PUT /api/work-orders.
describe('WorkOrderDetailPage header edit (F4)', () => {
  const plannerUser: User = {
    ...technicianUser,
    userId: 'u-plan',
    username: 'planner',
    fullName: 'PlanUser',
    email: 'planner@example.com',
    role: 'Maintenance Planner',
  };

  const headerWo: WorkOrder = {
    ...baseWo,
    supervisorUserId: 'u-sup',
    plannedStart: '2026-10-26T06:00:00.000Z',
    plannedFinish: '2026-10-26T14:00:00.000Z',
  };

  beforeEach(() => {
    setupDetailMocks();
    vi.mocked(workOrderService.getById).mockResolvedValue(headerWo);
    vi.mocked(userService.getOptions).mockResolvedValue([
      { userId: 'u-sup', username: 'sup', fullName: 'SupUser', role: 'Maintenance Supervisor' },
      { userId: 'u-tech', username: 'tech', fullName: 'TechUser', role: 'Technician' },
    ]);
  });

  it('offers the edit to a Maintenance Planner', async () => {
    useAuthStore.setState({ user: plannerUser, isAuthenticated: true, loading: false, error: null });
    renderDetail();

    await screen.findByText('WO-0099');
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });

  it('does not offer the edit to a Technician', async () => {
    // A technician owns the work, not the schedule (owner decision 2026-10-25).
    useAuthStore.setState({ user: technicianUser, isAuthenticated: true, loading: false, error: null });
    renderDetail();

    await screen.findByText('WO-0099');
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it('opens with the current supervisor and planned dates', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Edit details' }));

    expect(screen.getByLabelText('Supervisor')).toHaveValue('u-sup');
    // Rendered in local time, not sliced from the UTC ISO string.
    expect(screen.getByLabelText('Planned start')).toHaveValue(
      toDateTimeLocal(headerWo.plannedStart)
    );
    expect(screen.getByLabelText('Planned finish')).toHaveValue(
      toDateTimeLocal(headerWo.plannedFinish)
    );
  });

  it('saves the supervisor and both dates through PUT /work-orders/:id', async () => {
    vi.mocked(workOrderService.update).mockResolvedValue({
      ...headerWo,
      supervisorUserId: 'u-tech',
      plannedStart: '2026-10-27T06:00:00.000Z',
      plannedFinish: '2026-10-27T14:00:00.000Z',
    });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.selectOptions(screen.getByLabelText('Supervisor'), 'u-tech');
    await user.clear(screen.getByLabelText('Planned start'));
    await user.type(screen.getByLabelText('Planned start'), '2026-10-27T09:00');
    await user.clear(screen.getByLabelText('Planned finish'));
    await user.type(screen.getByLabelText('Planned finish'), '2026-10-27T17:00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(workOrderService.update)).toHaveBeenCalledWith(
        'wo-1',
        expect.objectContaining({
          supervisorUserId: 'u-tech',
          plannedStart: new Date('2026-10-27T09:00').toISOString(),
          plannedFinish: new Date('2026-10-27T17:00').toISOString(),
        })
      )
    );
    await waitFor(() => expect(screen.queryByLabelText('Supervisor')).not.toBeInTheDocument());
  });

  it('refuses a finish before the start without calling the API', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Planned start'));
    await user.type(screen.getByLabelText('Planned start'), '2026-10-27T17:00');
    await user.clear(screen.getByLabelText('Planned finish'));
    await user.type(screen.getByLabelText('Planned finish'), '2026-10-27T09:00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Planned finish must be on or after planned start'
    );
    expect(vi.mocked(workOrderService.update)).not.toHaveBeenCalled();
  });

  it('clears a planned date to null when the field is emptied', async () => {
    vi.mocked(workOrderService.update).mockResolvedValue({
      ...headerWo,
      plannedStart: null,
      plannedFinish: '2026-10-26T14:00:00.000Z',
    });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Planned start'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(workOrderService.update)).toHaveBeenCalledWith(
        'wo-1',
        expect.objectContaining({ plannedStart: null })
      )
    );
  });
});

// Mirrors the page's own helper: what a datetime-local input expects for an ISO
// value, in local time. Duplicated deliberately so the test fails if the page
// switches to slicing the UTC string.
function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// F5: Schedule used to fire a status-only transition, so a work order could be
// Scheduled with no dates and the page never asked for them.
describe('WorkOrderDetailPage schedule dialog (F5)', () => {
  const plannedWo: WorkOrder = { ...baseWo, status: 'Planned' };

  beforeEach(() => {
    setupDetailMocks();
    vi.mocked(workOrderService.getById).mockResolvedValue(plannedWo);
  });

  it('opens the dialog instead of moving the status straight away', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(screen.getByRole('dialog', { name: 'Schedule WO-0099' })).toBeInTheDocument();
    expect(vi.mocked(workOrderService.transitionStatus)).not.toHaveBeenCalled();
  });

  it('sends the status and both dates in one request', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    const dialog = screen.getByRole('dialog', { name: 'Schedule WO-0099' });
    await user.type(within(dialog).getByLabelText('Planned start'), '2026-11-02T08:00');
    await user.type(within(dialog).getByLabelText('Planned finish'), '2026-11-02T16:00');
    await user.click(within(dialog).getByRole('button', { name: 'Schedule' }));

    await waitFor(() =>
      expect(vi.mocked(workOrderService.transitionStatus)).toHaveBeenCalledWith(
        'wo-1',
        'Scheduled',
        {
          plannedStart: new Date('2026-11-02T08:00').toISOString(),
          plannedFinish: new Date('2026-11-02T16:00').toISOString(),
        }
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Schedule WO-0099' })).not.toBeInTheDocument()
    );
  });

  it('refuses a finish before the start without calling the API', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    const dialog = screen.getByRole('dialog', { name: 'Schedule WO-0099' });
    await user.type(within(dialog).getByLabelText('Planned start'), '2026-11-02T16:00');
    await user.type(within(dialog).getByLabelText('Planned finish'), '2026-11-02T08:00');
    await user.click(within(dialog).getByRole('button', { name: 'Schedule' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Planned finish must be on or after planned start'
    );
    expect(vi.mocked(workOrderService.transitionStatus)).not.toHaveBeenCalled();
  });

  it('prefills the dates already on the work order', async () => {
    vi.mocked(workOrderService.getById).mockResolvedValue({
      ...plannedWo,
      plannedStart: '2026-10-26T06:00:00.000Z',
      plannedFinish: '2026-10-26T14:00:00.000Z',
    });
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText('WO-0099');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    const dialog = screen.getByRole('dialog', { name: 'Schedule WO-0099' });
    expect(within(dialog).getByLabelText('Planned start')).toHaveValue(
      toDateTimeLocal('2026-10-26T06:00:00.000Z')
    );
    expect(within(dialog).getByLabelText('Planned finish')).toHaveValue(
      toDateTimeLocal('2026-10-26T14:00:00.000Z')
    );
  });
});
