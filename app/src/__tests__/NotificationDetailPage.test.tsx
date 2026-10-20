import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotificationDetailPage from '@/pages/NotificationDetailPage';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { notificationService } from '@/services/notificationService';
import { ApiError } from '@/lib/api';
import type { Notification, User } from '@/types';

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

const plannerUser: User = {
  ...adminUser,
  userId: 'u-planner',
  username: 'planner',
  fullName: 'PlannerUser',
  email: 'planner@example.com',
  role: 'Maintenance Planner',
};

const notification: Notification = {
  notificationId: 'n-1',
  notificationNumber: 'NTF-0001',
  type: 'M1',
  priority: 'Medium',
  functionalLocationId: 'fl-1',
  equipmentId: 'eq-1',
  reportedByUserId: 'u-admin',
  description: 'Pump leaking',
  damagesObservations: null,
  breakdownFlag: false,
  status: 'Open',
  createdBy: 'admin',
  createdDate: '2026-09-01T00:00:00.000Z',
  modifiedBy: 'admin',
  modifiedDate: '2026-09-01T00:00:00.000Z',
  isDeleted: false,
};

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/notifications/n-1']}>
      <Routes>
        <Route path="/notifications/:id" element={<NotificationDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('NotificationDetailPage conversion gating (SOW 3.2 / N12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationService.getById).mockResolvedValue(notification);
  });

  it('offers the Convert to WO control at the Maintenance Planner floor', async () => {
    useAuthStore.setState({
      user: plannerUser,
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderDetail();

    await screen.findByText('NTF-0001');
    expect(screen.getAllByRole('button', { name: /convert to wo/i }).length).toBeGreaterThan(0);
  });

  it('hides the Convert to WO control from a Requester', async () => {
    // POST /notifications/:id/convert-to-wo is Maintenance Planner+ on the API.
    useAuthStore.setState({
      user: { ...adminUser, role: 'Requester' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderDetail();

    await screen.findByText('NTF-0001');

    expect(screen.queryByRole('button', { name: /convert to WO/i })).not.toBeInTheDocument();
  });
});

describe('NotificationDetailPage edit (G9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({
      locations: [
        { functionalLocationId: 'fl-1', locationCode: 'PLANT-01', description: 'Main plant', parentLocationId: null, locationType: 'Plant', operationalStatus: 'Active', installationDate: null, gpsCoordinates: null, safetyCritical: false, createdBy: 'admin', createdDate: '2026-01-01T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-01-01T00:00:00.000Z', isDeleted: false },
        { functionalLocationId: 'fl-2', locationCode: 'AREA-02', description: 'Utilities', parentLocationId: null, locationType: 'Area', operationalStatus: 'Active', installationDate: null, gpsCoordinates: null, safetyCritical: false, createdBy: 'admin', createdDate: '2026-01-01T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-01-01T00:00:00.000Z', isDeleted: false },
      ],
      equipment: [],
    });
    vi.mocked(notificationService.getById).mockResolvedValue(notification);
  });

  it('edits a notification through notificationService.update and reloads', async () => {
    vi.mocked(notificationService.update).mockResolvedValue({ ...notification, description: 'Pump leaking badly', functionalLocationId: 'fl-2' });
    vi.mocked(notificationService.getById)
      .mockResolvedValueOnce(notification)
      .mockResolvedValue({ ...notification, description: 'Pump leaking badly', functionalLocationId: 'fl-2' });
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const desc = await screen.findByLabelText('Notification description');
    expect(desc).toHaveValue('Pump leaking');
    await user.clear(desc);
    await user.type(desc, 'Pump leaking badly');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(notificationService.update)).toHaveBeenCalledWith(
        'n-1',
        expect.objectContaining({ description: 'Pump leaking badly' })
      )
    );
    expect(await screen.findByText('Pump leaking badly')).toBeInTheDocument();
  }, 20000);

  it('surfaces the API rejection and keeps the edit form open', async () => {
    vi.mocked(notificationService.update).mockRejectedValue(new ApiError(400, 'description must be at least 3 characters'));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const desc = await screen.findByLabelText('Notification description');
    await user.clear(desc);
    await user.type(desc, 'Valid length text');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('description must be at least 3 characters');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  }, 20000);

  it('hides the Edit control once the notification is Converted', async () => {
    vi.mocked(notificationService.getById).mockResolvedValue({ ...notification, status: 'Converted' });
    renderDetail();

    await screen.findByText('NTF-0001');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  }, 20000);

  it('hides the Edit control below the Requester floor', async () => {
    useAuthStore.setState({ user: { ...adminUser, role: 'View-Only' }, isAuthenticated: true, loading: false, error: null });
    renderDetail();

    await screen.findByText('NTF-0001');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  }, 20000);
});
