import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotificationDetailPage from '@/pages/NotificationDetailPage';
import { useAuthStore } from '@/store/authStore';
import { notificationService } from '@/services/notificationService';
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
