import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PreventiveMaintenancePage from '@/pages/PreventiveMaintenancePage';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { maintenancePlanService } from '@/services/maintenancePlanService';
import { equipmentMeterService } from '@/services/equipmentMeterService';
import type {
  Equipment,
  EquipmentMeter,
  FunctionalLocation,
  MaintenancePlan,
  TaskList,
  User,
  WorkCenter,
} from '@/types';

vi.mock('@/services/maintenancePlanService', () => ({
  maintenancePlanService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    generateWorkOrder: vi.fn(),
    runScheduler: vi.fn(),
  },
}));

vi.mock('@/services/equipmentMeterService', () => ({
  equipmentMeterService: { getAll: vi.fn() },
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

const workCenter: WorkCenter = {
  ...audit,
  workCenterId: 'wc-1',
  code: 'MC-01',
  name: 'Mechanical',
  dailyCapacityHours: 8,
  costRatePerHour: 50,
  isActive: true,
};

const taskList: TaskList = {
  ...audit,
  taskListId: 'tl-1',
  code: 'TL-PUMP',
  description: 'Pump overhaul',
  equipmentClass: null,
  equipmentId: null,
  workCenterId: 'wc-1',
};

const equipment: Equipment = {
  ...audit,
  equipmentId: 'eq-1',
  equipmentCode: 'PUMP-01',
  name: 'Feed pump',
  description: 'Feed water pump',
  functionalLocationId: 'fl-1',
  manufacturer: 'ACME',
  model: 'X100',
  serialNumber: 'SN-1',
  assetTag: 'AT-1',
  equipmentClass: 'PUMP',
  criticality: 'B',
  installationDate: null,
  warrantyExpiryDate: null,
  operationalStatus: 'Active',
  technicalParameters: {},
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

const meter: EquipmentMeter = {
  ...audit,
  meterId: 'mt-1',
  equipmentId: 'eq-1',
  meterName: 'Running hours',
  unitOfMeasure: 'h',
  lastReading: 100,
  lastReadingDate: null,
  equipment: { equipmentId: 'eq-1', equipmentCode: 'PUMP-01', name: 'Feed pump' },
};

const basePlan: MaintenancePlan = {
  ...audit,
  planId: 'plan-1',
  planCode: 'PM-001',
  description: 'Monthly pump check',
  equipmentId: 'eq-1',
  functionalLocationId: null,
  workCenterId: 'wc-1',
  taskListId: 'tl-1',
  strategyType: 'Time',
  intervalValue: 1,
  intervalUnit: 'Months',
  callHorizonValue: 7,
  callHorizonUnit: 'Days',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: null,
  activeFlag: true,
  priority: 'Medium',
  generatedWorkOrderStatus: 'Draft',
  notificationId: null,
  targets: [
    {
      planTargetId: 't-1',
      planId: 'plan-1',
      equipmentId: 'eq-1',
      functionalLocationId: null,
      equipment: { equipmentId: 'eq-1', equipmentCode: 'PUMP-01', name: 'Feed pump' },
    },
  ],
  planMeters: [],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <PreventiveMaintenancePage />
    </MemoryRouter>
  );

const seedStore = (plans: MaintenancePlan[]) =>
  useAppStore.setState({
    equipment: [equipment],
    locations: [location],
    workCenters: [workCenter],
    taskLists: [taskList],
    maintenancePlans: plans,
    loading: false,
    error: null,
    // The page reloads the store after a write; stub it so the test never
    // reaches the network, which is the API's job, not this screen's.
    loadFromApi: vi.fn().mockResolvedValue(undefined),
  });

describe('PreventiveMaintenancePage plan management (SOW 2.2 / D-10 / 3.4.2)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(equipmentMeterService.getAll).mockResolvedValue([meter]);
    seedStore([basePlan]);
  });

  it('creates a Time plan targeting the chosen equipment', async () => {
    const user = userEvent.setup();
    vi.mocked(maintenancePlanService.create).mockResolvedValue(basePlan);
    renderPage();

    await user.click(screen.getByRole('button', { name: /new plan/i }));
    await user.type(screen.getByLabelText('Plan Code'), 'PM-100');
    await user.type(screen.getByLabelText('Description'), 'Quarterly inspection');
    await user.selectOptions(screen.getByLabelText('Work Center'), 'wc-1');
    await user.selectOptions(screen.getByLabelText('Task List'), 'tl-1');
    await user.selectOptions(screen.getByLabelText('Target 1'), 'eq-1');
    await user.click(screen.getByRole('button', { name: /create plan/i }));

    await waitFor(() => expect(maintenancePlanService.create).toHaveBeenCalledTimes(1));
    expect(maintenancePlanService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        planCode: 'PM-100',
        description: 'Quarterly inspection',
        strategyType: 'Time',
        targets: [{ equipmentId: 'eq-1', functionalLocationId: null }],
        planMeters: [],
      })
    );
  }, 20000);

  it('refuses a Meter plan with no threshold before calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /new plan/i }));
    await user.type(screen.getByLabelText('Plan Code'), 'PM-200');
    await user.type(screen.getByLabelText('Description'), 'Meter routine');
    await user.selectOptions(screen.getByLabelText('Work Center'), 'wc-1');
    await user.selectOptions(screen.getByLabelText('Task List'), 'tl-1');
    await user.selectOptions(screen.getByLabelText('Strategy'), 'Meter');
    await user.selectOptions(screen.getByLabelText('Target 1'), 'eq-1');
    await user.click(screen.getByRole('button', { name: /create plan/i }));

    expect(await screen.findByText('A meter strategy needs at least one meter threshold')).toBeInTheDocument();
    expect(maintenancePlanService.create).not.toHaveBeenCalled();
  }, 20000);

  it('edits a plan and never resends the immutable plan code', async () => {
    const user = userEvent.setup();
    vi.mocked(maintenancePlanService.update).mockResolvedValue(basePlan);
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit PM-001' }));
    expect(screen.getByLabelText('Plan Code')).toHaveValue('PM-001');
    expect(screen.getByLabelText('Plan Code')).toBeDisabled();

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Updated description');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(maintenancePlanService.update).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(maintenancePlanService.update).mock.calls[0];
    expect(id).toBe('plan-1');
    expect(body.description).toBe('Updated description');
    expect(body).not.toHaveProperty('planCode');
  }, 20000);

  it('runs the scheduler on demand and reports the generated count', async () => {
    const user = userEvent.setup();
    vi.mocked(maintenancePlanService.runScheduler).mockResolvedValue({
      ranAt: '2026-10-12T00:00:00.000Z',
      plansEvaluated: 3,
      wosCreated: 2,
      wosSkipped: 1,
      errors: [],
    });
    renderPage();

    await user.click(screen.getByRole('button', { name: /run scheduler/i }));

    await waitFor(() => expect(maintenancePlanService.runScheduler).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/scheduler generated 2 work orders/i)).toBeInTheDocument();
  }, 20000);

  it('does not offer the scheduler control to a non-Administrator', () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Maintenance Planner' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    expect(screen.queryByRole('button', { name: /run scheduler/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new plan/i })).toBeInTheDocument();
  }, 20000);

  it('hides write controls from a View-Only user', () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    expect(screen.queryByRole('button', { name: /new plan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit PM-001/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete PM-001/i })).not.toBeInTheDocument();
  }, 20000);
});
