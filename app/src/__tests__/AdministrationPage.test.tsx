// G3 regression: the Administration user table could create and deactivate a
// user but never edit one, even though PUT /users/:id (userUpdateSchema) and
// userService.update both existed. Deactivate stays a separate action (soft
// delete); G11 deferred undelete is out of scope.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdministrationPage from '@/pages/AdministrationPage';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { userService } from '@/services/userService';
import { systemConfigService } from '@/services/systemConfigService';
import { auditLogService } from '@/services/auditLogService';
import { ApiError } from '@/lib/api';
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
  auditLogService: { getAll: vi.fn(), purge: vi.fn() },
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

// F3: POST /users, PUT /users/:id and PUT /users/:id/password were all exposed,
// and ChangePasswordDialog already had an adminMode, but the users table only
// offered Edit and Deactivate. An Administrator could create an account and then
// had no way to recover it.
describe('AdministrationPage password reset (F3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ users: [adminUser, targetUser], workCenters: [], loading: false, error: null });
    vi.mocked(systemConfigService.getAll).mockResolvedValue([]);
    vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  });

  it('opens the reset dialog in admin mode, without asking for the current password', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reset password for TechUser' }));

    expect(screen.getByRole('dialog', { name: 'Reset password' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('sends newPassword only, for the row it was opened on', async () => {
    vi.mocked(userService.changePassword).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reset password for TechUser' }));
    await user.type(screen.getByLabelText('New password'), 'Reset-Pass-123456');
    await user.type(screen.getByLabelText('Confirm new password'), 'Reset-Pass-123456');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(vi.mocked(userService.changePassword)).toHaveBeenCalledWith('u-tech', {
        newPassword: 'Reset-Pass-123456',
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated.');
  });

  it('keeps the dialog open and shows the message when the API rejects', async () => {
    vi.mocked(userService.changePassword).mockRejectedValue(new ApiError(400, 'Password does not meet policy'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reset password for TechUser' }));
    await user.type(screen.getByLabelText('New password'), 'Reset-Pass-123456');
    await user.type(screen.getByLabelText('Confirm new password'), 'Reset-Pass-123456');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password does not meet policy');
    expect(screen.getByRole('dialog', { name: 'Reset password' })).toBeInTheDocument();
  });
});

// v1.1-23: POST /audit-log/purge was Administrator-only and already read the
// retention window from SystemConfig, but the UI never exposed it, so the log
// only grew. The control is shown to Administrators only and asks before it
// deletes anything, because the action is irreversible.
describe('AdministrationPage audit log purge (v1.1-23)', () => {
  const openAuditTab = async (user: ReturnType<typeof userEvent.setup>) => {
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Audit Log' }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ users: [adminUser, targetUser], workCenters: [], loading: false, error: null });
    vi.mocked(systemConfigService.getAll).mockResolvedValue([]);
    vi.mocked(auditLogService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 100 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('purges after confirmation, reports the count and reloads the table', async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    vi.mocked(auditLogService.purge).mockResolvedValue({
      ranAt: '2026-11-11T09:00:00.000Z',
      retentionYears: 7,
      cutoff: '2019-11-11T09:00:00.000Z',
      deleted: 12,
    });
    const user = userEvent.setup();
    await openAuditTab(user);

    const purgeButton = await screen.findByRole('button', { name: 'Purge expired audit entries' });
    await waitFor(() => expect(vi.mocked(auditLogService.getAll)).toHaveBeenCalledTimes(1));
    await user.click(purgeButton);

    expect(confirm).toHaveBeenCalledWith(
      'Delete audit entries older than the configured retention window? This cannot be undone.'
    );
    await waitFor(() => expect(vi.mocked(auditLogService.purge)).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Purged 12 entries older than 7 years.');
    // The purge rewrote the log, so the current page is re-fetched.
    await waitFor(() => expect(vi.mocked(auditLogService.getAll)).toHaveBeenCalledTimes(2));
  });

  it('does nothing when the confirmation is dismissed', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const user = userEvent.setup();
    await openAuditTab(user);

    await user.click(await screen.findByRole('button', { name: 'Purge expired audit entries' }));

    expect(vi.mocked(auditLogService.purge)).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is not offered to a non-Administrator', async () => {
    useAuthStore.setState({ user: targetUser, isAuthenticated: true, loading: false, error: null });
    const user = userEvent.setup();
    await openAuditTab(user);

    expect(await screen.findByText('0 entries')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Purge expired audit entries' })
    ).not.toBeInTheDocument();
  });

  it('shows the server message and keeps the button when the API rejects', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.mocked(auditLogService.purge).mockRejectedValue(new ApiError(403, 'Forbidden'));
    const user = userEvent.setup();
    await openAuditTab(user);

    await user.click(await screen.findByRole('button', { name: 'Purge expired audit entries' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.getByRole('button', { name: 'Purge expired audit entries' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
