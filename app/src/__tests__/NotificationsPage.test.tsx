import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from '@/pages/NotificationsPage';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { notificationService } from '@/services/notificationService';
import type { Equipment, FunctionalLocation, Notification, User } from '@/types';

vi.mock('@/services/notificationService', () => ({
  notificationService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    convertToWorkOrder: vi.fn(),
  },
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

const created: Notification = {
  ...audit,
  notificationId: 'n-1',
  notificationNumber: 'NTF-0001',
  type: 'M1',
  priority: 'Medium',
  functionalLocationId: 'fl-1',
  equipmentId: 'eq-1',
  reportedByUserId: 'u-admin',
  description: 'Pump leaking',
  breakdownFlag: false,
  status: 'Open',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  );

describe('NotificationsPage intake (SOW 3.2.2)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ equipment: [equipment], locations: [location] });
    vi.clearAllMocks();
    vi.mocked(notificationService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 250 });
  });

  it('raises a notification and reports its number', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationService.create).mockResolvedValue(created);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new notification/i }));
    await user.type(screen.getByLabelText('Description'), 'Pump leaking');
    await user.selectOptions(screen.getByLabelText('Equipment (optional)'), 'eq-1');
    await user.click(screen.getByRole('button', { name: /raise notification/i }));

    await waitFor(() => expect(notificationService.create).toHaveBeenCalledTimes(1));
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Pump leaking',
        equipmentId: 'eq-1',
        functionalLocationId: 'fl-1',
        reportedByUserId: 'u-admin',
      })
    );
    expect(await screen.findByText(/NTF-0001 raised/i)).toBeInTheDocument();
  }, 20000);

  it('derives the location from the chosen equipment and locks it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new notification/i }));
    await user.selectOptions(screen.getByLabelText('Equipment (optional)'), 'eq-1');

    const loc = screen.getByLabelText('Functional Location');
    expect(loc).toHaveValue('fl-1');
    expect(loc).toBeDisabled();
  }, 20000);

  it('refuses a description shorter than three characters', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new notification/i }));
    await user.type(screen.getByLabelText('Description'), 'no');
    await user.click(screen.getByRole('button', { name: /raise notification/i }));

    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
    expect(notificationService.create).not.toHaveBeenCalled();
  }, 20000);

  it('hides the intake control from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(notificationService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new notification/i })).not.toBeInTheDocument();
  }, 20000);
});
