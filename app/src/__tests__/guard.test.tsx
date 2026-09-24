import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

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
  taskListService: { getAll: vi.fn() },
}));

vi.mock('@/services/craftService', () => ({
  craftService: { getAll: vi.fn() },
}));

vi.mock('@/services/userService', () => ({
  userService: { getAll: vi.fn() },
}));

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getAll: vi.fn() },
}));

vi.mock('@/services/dashboardService', () => ({
  dashboardService: { getKPIs: vi.fn() },
}));

vi.mock('@/services/alertService', () => ({
  alertService: { getAll: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
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
  vi.mocked(userService.getAll).mockResolvedValue([]);
  vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  vi.mocked(dashboardService.getKPIs).mockResolvedValue({
    activeWorkOrders: 0,
    overdueWorkOrders: 0,
    scheduledToday: 0,
    completionRate: 0,
    openNotifications: 0,
    pmCompliance: 0,
  });
  vi.mocked(alertService.getAll).mockResolvedValue([]);
};

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe('ProtectedRoute guard', () => {
  beforeEach(async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, error: null });
    vi.clearAllMocks();
    await awaitServices();
  });

  it('redirects an unauthenticated user away from a protected route to /login', async () => {
    renderApp('/work-orders');

    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByText('No work orders found')).not.toBeInTheDocument();
  });

  it('renders the requested protected page for an authenticated user', async () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true });
    renderApp('/work-orders');

    expect(await screen.findByText('No work orders found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByText('WORK ORDERS')).toBeInTheDocument();
  });
});