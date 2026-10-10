import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorkOrderCreatePage from '@/pages/WorkOrderCreatePage';
import { useAuthStore } from '@/store/authStore';
import { functionalLocationService } from '@/services/functionalLocationService';
import { equipmentService } from '@/services/equipmentService';
import { workCenterService } from '@/services/workCenterService';
import { taskListService } from '@/services/taskListService';
import { causeCodeService } from '@/services/causeCodeService';
import { userService } from '@/services/userService';
import type {
  CauseCode,
  Equipment,
  FunctionalLocation,
  TaskList,
  User,
  WorkCenter,
} from '@/types';

vi.mock('@/services/functionalLocationService', () => ({
  functionalLocationService: { getAll: vi.fn() },
}));

vi.mock('@/services/equipmentService', () => ({
  equipmentService: { getAll: vi.fn() },
}));

vi.mock('@/services/workCenterService', () => ({
  workCenterService: { getAll: vi.fn() },
}));

vi.mock('@/services/taskListService', () => ({
  taskListService: { getAll: vi.fn(), create: vi.fn() },
}));

vi.mock('@/services/causeCodeService', () => ({
  causeCodeService: { getAll: vi.fn() },
}));

vi.mock('@/services/userService', () => ({
  userService: { getOptions: vi.fn(), getAll: vi.fn() },
}));

vi.mock('@/services/workOrderService', () => ({
  workOrderService: { create: vi.fn(), getAll: vi.fn() },
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

const audit = {
  createdBy: 'admin',
  createdDate: '2026-09-01T00:00:00.000Z',
  modifiedBy: 'admin',
  modifiedDate: '2026-09-01T00:00:00.000Z',
  isDeleted: false,
};

const location: FunctionalLocation = {
  ...audit,
  functionalLocationId: 'fl-1',
  locationCode: 'FL-01',
  description: 'Pump hall',
  parentLocationId: null,
  locationType: 'Unit',
  operationalStatus: 'Active',
  installationDate: null,
  gpsCoordinates: null,
  safetyCritical: false,
};

const assetA: Equipment = {
  ...audit,
  equipmentId: 'eq-a',
  equipmentCode: 'PUMP-01',
  name: 'Feed pump',
  description: 'Centrifugal feed pump',
  functionalLocationId: 'fl-1',
  manufacturer: 'ACME',
  model: 'CP-100',
  serialNumber: 'SN-A',
  assetTag: 'AT-1001',
  equipmentClass: 'PUMP',
  criticality: 'A',
  installationDate: null,
  warrantyExpiryDate: null,
  operationalStatus: 'Active',
  technicalParameters: {},
};

const assetB: Equipment = { ...assetA, equipmentId: 'eq-b', equipmentCode: 'PUMP-02', name: 'Standby pump', serialNumber: 'SN-B', assetTag: 'AT-1002' };

const workCenter: WorkCenter = {
  ...audit,
  workCenterId: 'wc-1',
  code: 'WC-MECH',
  name: 'Mechanical',
  dailyCapacityHours: 8,
  costRatePerHour: 95,
  isActive: true,
};

const baseTl = {
  workCenterId: 'wc-1',
  operations: [],
};

/** A template written for one specific asset. */
const tlForAssetA: TaskList = {
  ...audit,
  ...baseTl,
  taskListId: 'tl-asset',
  code: 'TL-PUMP',
  description: 'Overhaul the feed pump',
  equipmentClass: null,
  equipmentId: 'eq-a',
  equipment: { equipmentId: 'eq-a', equipmentCode: 'PUMP-01', name: 'Feed pump' },
};

/** A fleet-wide routine: no asset, no class. */
const tlFleetWide: TaskList = {
  ...audit,
  ...baseTl,
  taskListId: 'tl-wide',
  code: 'TL-GENERAL',
  description: 'General inspection',
  equipmentClass: null,
  equipmentId: null,
  equipment: null,
};

/** A class-scoped routine: reusable across the class, so never a mismatch. */
const tlClassScoped: TaskList = {
  ...audit,
  ...baseTl,
  taskListId: 'tl-class',
  code: 'TL-PUMP-CLASS',
  description: 'Class routine for any pump',
  equipmentClass: 'PUMP',
  equipmentId: null,
  equipment: null,
};

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={['/work-orders/new']}>
      <WorkOrderCreatePage />
    </MemoryRouter>
  );

/** The Equipment select is filtered by the chosen functional location, and carries no id. */
const selectEquipment = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const option = await screen.findByRole('option', { name: label });
  await user.selectOptions(option.closest('select') as HTMLSelectElement, option);
};

const selectLocation = async (user: ReturnType<typeof userEvent.setup>) => {
  const option = await screen.findByRole('option', { name: 'FL-01' });
  await user.selectOptions(option.closest('select') as HTMLSelectElement, option);
};

describe('WorkOrderCreatePage template/asset warning (SOW 3.1.4)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(functionalLocationService.getAll).mockResolvedValue([location]);
    vi.mocked(equipmentService.getAll).mockResolvedValue([assetA, assetB]);
    vi.mocked(workCenterService.getAll).mockResolvedValue([workCenter]);
    vi.mocked(taskListService.getAll).mockResolvedValue([tlForAssetA, tlFleetWide, tlClassScoped]);
    vi.mocked(causeCodeService.getAll).mockResolvedValue([] as CauseCode[]);
    vi.mocked(userService.getOptions).mockResolvedValue([]);
  });

  it('warns when an asset-specific template is applied to a different asset, naming both', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-02 - Standby pump');
    await user.selectOptions(screen.getByLabelText('Task List Template'), 'tl-asset');

    // The warning must name the work order's asset and the template's own asset.
    expect(
      await screen.findByText(/AT-1002 is written for a different asset \(PUMP-01\)/),
    ).toBeInTheDocument();
  });

  it('does not warn when the template belongs to the asset being worked on', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-01 - Feed pump');
    await user.selectOptions(screen.getByLabelText('Task List Template'), 'tl-asset');

    await waitFor(() => {
      expect(screen.getByLabelText('Task List Template')).toHaveValue('tl-asset');
    });
    expect(screen.queryByText(/is written for a different asset/)).not.toBeInTheDocument();
  });

  it('does not warn for a class-scoped template applied to a particular asset', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-02 - Standby pump');
    await user.selectOptions(screen.getByLabelText('Task List Template'), 'tl-class');

    await waitFor(() => {
      expect(screen.getByLabelText('Task List Template')).toHaveValue('tl-class');
    });
    expect(screen.queryByText(/is written for a different asset/)).not.toBeInTheDocument();
  });

  it('does not warn for a fleet-wide template, which is the "neither" case the screen offers', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-02 - Standby pump');
    await user.selectOptions(screen.getByLabelText('Task List Template'), 'tl-wide');

    await waitFor(() => {
      expect(screen.getByLabelText('Task List Template')).toHaveValue('tl-wide');
    });
    expect(screen.queryByText(/is written for a different asset/)).not.toBeInTheDocument();
  });

  it('does not warn when an asset is chosen but no template is applied', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-02 - Standby pump');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'PUMP-02 - Standby pump' }).closest('select')).toHaveValue('eq-b');
    });
    expect(screen.queryByText(/is written for a different asset/)).not.toBeInTheDocument();
  });

  it('still lets the deviation be recorded rather than blocking the work order', async () => {
    const user = userEvent.setup();
    renderCreate();

    await selectLocation(user);
    await selectEquipment(user, 'PUMP-02 - Standby pump');
    await user.selectOptions(screen.getByLabelText('Task List Template'), 'tl-asset');

    // The warning is advisory: the template stays selected and the form is not
    // disabled, because refusing would leave no way to record the deviation.
    const select = await screen.findByLabelText('Task List Template');
    await waitFor(() => expect(select).toHaveValue('tl-asset'));
    expect(select).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /create work order/i })).not.toBeDisabled();
  });
});