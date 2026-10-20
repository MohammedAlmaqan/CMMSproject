// G3 regression: the Administration user table could create and deactivate a
// user but never edit one, even though PUT /users/:id (userUpdateSchema) and
// userService.update both existed. Deactivate stays a separate action (soft
// delete); G11 deferred undelete is out of scope.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdministrationPage from '@/pages/AdministrationPage';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { userService } from '@/services/userService';
import { systemConfigService } from '@/services/systemConfigService';
import { auditLogService } from '@/services/auditLogService';
import type { User } from '@/types';

vi.mock('@/services/userService', () => ({
  userService: {
    getAll: vi.fn(),
    getOptions: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock('@/services/systemConfigService', () => ({
  systemConfigService: { getAll: vi.fn(), update: vi.fn() },
}));

vi.mock('@/services/auditLogService', () => ({
  auditLogService: { getAll: vi.fn() },
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

const targetUser: User = {
  userId: 'u-tech',
  username: 'tech',
  fullName: 'TechUser',
  email: 'tech@example.com',
  role: 'Technician',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdministrationPage />
    </MemoryRouter>
  );

describe('AdministrationPage user edit (G3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ users: [adminUser, targetUser], workCenters: [], loading: false, error: null });
    vi.mocked(systemConfigService.getAll).mockResolvedValue([]);
    vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  });

  it('saves profile changes through userService.update and refreshes the row', async () => {
    vi.mocked(userService.update).mockResolvedValue({
      ...targetUser,
      fullName: 'Tech Two',
      email: 'tech2@example.com',
      role: 'Maintenance Supervisor',
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit TechUser' }));

    const fullName = screen.getByLabelText('Edit user full name');
    expect(fullName).toHaveValue('TechUser');
    await user.clear(fullName);
    await user.type(fullName, 'Tech Two');
    await user.clear(screen.getByLabelText('Edit user email'));
    await user.type(screen.getByLabelText('Edit user email'), 'tech2@example.com');
    await user.selectOptions(screen.getByLabelText('Edit user role'), 'Maintenance Supervisor');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(userService.update)).toHaveBeenCalledWith('u-tech', {
        fullName: 'Tech Two',
        email: 'tech2@example.com',
        role: 'Maintenance Supervisor',
        workCenterId: null,
        isActive: true,
      })
    );
    expect(await screen.findByText('Maintenance Supervisor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
  });

  it('keeps the row untouched and shows the message when the API rejects', async () => {
    vi.mocked(userService.update).mockRejectedValue(new Error('Email already in use'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit TechUser' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
    expect(vi.mocked(userService.update)).toHaveBeenCalledTimes(1);
    // The form stays open so the admin can correct the input.
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('closes the edit form without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit TechUser' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Edit user full name')).not.toBeInTheDocument();
    expect(vi.mocked(userService.update)).not.toHaveBeenCalled();
  });

  it('offers Deactivate only on rows other than the signed-in admin', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Deactivate TechUser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate AdminUser' })).not.toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });
});
