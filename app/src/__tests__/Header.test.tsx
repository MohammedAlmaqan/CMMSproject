import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

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

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header title="Dashboard" />
    </MemoryRouter>
  );

describe('Header alerts bell gating (N12)', () => {
  beforeEach(() => {
    useAppStore.setState({ getUnreadAlertCount: () => 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mark alerts read for a View-Only user', async () => {
    // PUT /alerts/read-all is Requester+, so a View-Only click must only navigate.
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    const markAll = vi.spyOn(useAppStore.getState(), 'markAllAlertsRead');
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(markAll).not.toHaveBeenCalled();
  });

  it('marks alerts read for a Requester', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Requester' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    const markAll = vi.spyOn(useAppStore.getState(), 'markAllAlertsRead');
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(markAll).toHaveBeenCalledTimes(1);
  });
});
