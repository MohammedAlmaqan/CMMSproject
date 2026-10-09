import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole, routeFloor } from '@/lib/rbac';
import type { User, UserRole } from '@/types';

vi.mock('@/services/authService', () => ({
  authService: { login: vi.fn(), logout: vi.fn() },
}));

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

vi.mock('@/services/functionalLocationService', () => ({
  functionalLocationService: { getAll: vi.fn() },
}));

vi.mock('@/services/equipmentService', () => ({
  equipmentService: { getAll: vi.fn() },
}));

vi.mock('@/services/notificationService', () => ({
  notificationService: { getAll: vi.fn() },
}));

vi.mock('@/services/materialService', () => ({
  materialService: { getAll: vi.fn() },
}));

vi.mock('@/services/workCenterService', () => ({
  workCenterService: { getAll: vi.fn() },
}));

vi.mock('@/services/maintenancePlanService', () => ({
  maintenancePlanService: { getAll: vi.fn() },
}));

vi.mock('@/services/taskListService', () => ({
  taskListService: { getAll: vi.fn(), create: vi.fn() },
}));

vi.mock('@/services/craftService', () => ({
  craftService: { getAll: vi.fn() },
}));

vi.mock('@/services/causeCodeService', () => ({
  causeCodeService: { getAll: vi.fn() },
}));

vi.mock('@/services/userService', () => ({
  userService: { getAll: vi.fn(), getOptions: vi.fn() },
}));

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getAll: vi.fn() },
}));

vi.mock('@/services/dashboardService', () => ({
  dashboardService: { getKPIs: vi.fn(), getAlerts: vi.fn(), getCostSummary: vi.fn() },
}));

vi.mock('@/services/alertService', () => ({
  alertService: { getAll: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

const makeUser = (role: UserRole): User => ({
  userId: `u-${role}`,
  username: role.toLowerCase(),
  fullName: `${role} User`,
  email: 'user@example.com',
  role,
  workCenterId: null,
  isActive: true,
  lastLogin: null,
});

const awaitServices = async () => {
  const { workOrderService } = await import('@/services/workOrderService');
  const { functionalLocationService } = await import('@/services/functionalLocationService');
  const { equipmentService } = await import('@/services/equipmentService');
  const { notificationService } = await import('@/services/notificationService');
  const { materialService } = await import('@/services/materialService');
  const { workCenterService } = await import('@/services/workCenterService');
  const { maintenancePlanService } = await import('@/services/maintenancePlanService');
  const { taskListService } = await import('@/services/taskListService');
  const { craftService } = await import('@/services/craftService');
  const { causeCodeService } = await import('@/services/causeCodeService');
  const { userService } = await import('@/services/userService');
  const { auditLogService } = await import('@/services/auditLogService');
  const { dashboardService } = await import('@/services/dashboardService');
  const { alertService } = await import('@/services/alertService');
  vi.mocked(workOrderService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 250 });
  vi.mocked(functionalLocationService.getAll).mockResolvedValue([]);
  vi.mocked(equipmentService.getAll).mockResolvedValue([]);
  vi.mocked(notificationService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 250 });
  vi.mocked(materialService.getAll).mockResolvedValue([]);
  vi.mocked(workCenterService.getAll).mockResolvedValue([]);
  vi.mocked(maintenancePlanService.getAll).mockResolvedValue([]);
  vi.mocked(taskListService.getAll).mockResolvedValue([]);
  vi.mocked(craftService.getAll).mockResolvedValue([]);
  vi.mocked(causeCodeService.getAll).mockResolvedValue([]);
  vi.mocked(userService.getAll).mockResolvedValue([]);
  vi.mocked(userService.getOptions).mockResolvedValue([]);
  vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  vi.mocked(dashboardService.getKPIs).mockResolvedValue({
    activeWorkOrders: 0,
    overdueWorkOrders: 0,
    scheduledToday: 0,
    completionRate: 0,
    openNotifications: 0,
    pmCompliance: 0,
  });
  vi.mocked(dashboardService.getAlerts).mockResolvedValue([]);
  vi.mocked(dashboardService.getCostSummary).mockResolvedValue([]);
  vi.mocked(alertService.getAll).mockResolvedValue([]);
};

function renderApp(route: string, role: UserRole) {
  useAuthStore.setState({ user: makeUser(role), isAuthenticated: true });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe('rbac role model', () => {
  it('orders roles by the shared hierarchy', () => {
    expect(hasMinRole('Administrator', 'Administrator')).toBe(true);
    expect(hasMinRole('Technician', 'Requester')).toBe(true);
    expect(hasMinRole('Requester', 'Technician')).toBe(false);
    expect(hasMinRole('View-Only', 'Requester')).toBe(false);
    expect(hasMinRole(undefined, 'View-Only')).toBe(false);
  });

  it('resolves guarded route floors and defaults unlisted routes to View-Only', () => {
    expect(routeFloor('/administration')).toBe('Administrator');
    expect(routeFloor('/work-orders/new')).toBe('Requester');
    expect(routeFloor('/dashboard')).toBe('View-Only');
  });
});

describe('rbac navigation filtering', () => {
  beforeEach(async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, error: null });
    vi.clearAllMocks();
    await awaitServices();
  });

  it('shows the Administration entry to an Administrator', async () => {
    renderApp('/dashboard', 'Administrator');
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
  });

  it('hides the Administration entry from a Requester', async () => {
    renderApp('/dashboard', 'Requester');
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });
});

describe('rbac route guards', () => {
  beforeEach(async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, error: null });
    vi.clearAllMocks();
    await awaitServices();
  });

  it('redirects a Requester away from /administration to the dashboard', async () => {
    renderApp('/administration', 'Requester');
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('ADMINISTRATION')).not.toBeInTheDocument();
  });

  it('redirects a View-Only user away from /work-orders/new to the dashboard', async () => {
    renderApp('/work-orders/new', 'View-Only');
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('CREATE WORK ORDER')).not.toBeInTheDocument();
  });

  it('admits a Requester to /work-orders/new', async () => {
    renderApp('/work-orders/new', 'Requester');
    expect(await screen.findByText('CREATE WORK ORDER')).toBeInTheDocument();
  });

  it('hides the Create affordance on the work orders list below Requester', async () => {
    renderApp('/work-orders', 'View-Only');
    expect(await screen.findByText('No work orders found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });

  it('shows the Create affordance on the work orders list for a Requester', async () => {
    renderApp('/work-orders', 'Requester');
    expect(await screen.findByText('No work orders found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});
