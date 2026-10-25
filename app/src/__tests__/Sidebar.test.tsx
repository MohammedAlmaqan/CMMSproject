import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

vi.mock('@/services/authService', () => ({
  authService: { logout: vi.fn().mockResolvedValue(undefined) },
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

const technicianUser: User = {
  userId: 'u-tech',
  username: 'tech',
  fullName: 'TechUser',
  email: 'tech@example.com',
  role: 'Technician',
  workCenterId: null,
  isActive: true,
  lastLogin: null,
};

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <Sidebar onOpenCommandPalette={vi.fn()} />
    </MemoryRouter>
  );

describe('Sidebar (tracker v1.1-14)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
  });

  it('exposes each nav button name via aria-label when expanded', () => {
    renderSidebar();

    for (const name of ['Dashboard', 'Work Orders', 'Preventive Maintenance', 'Administration']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-label', name);
    }
  });

  it('keeps the aria-label when collapsed', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Work Orders' })).toHaveAttribute('aria-label', 'Work Orders');
    expect(screen.getByRole('button', { name: 'Administration' })).toHaveAttribute('aria-label', 'Administration');
  });
});

// F2: the only sign-out control was on AdministrationPage, whose route floor is
// Administrator. Four of the six roles therefore had no way to end a session.
describe('Sidebar sign out (F2)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: technicianUser, isAuthenticated: true, loading: false, error: null });
  });

  it('offers Sign out to a Technician', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('ends the session when Sign out is clicked', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not turn the profile block into an Administration link', () => {
    renderSidebar();
    // A7: for non-admins this button was a dead click - /administration has an
    // Administrator floor, so RoleRoute bounced them to /dashboard.
    expect(screen.queryByRole('button', { name: /TechUser/ })).not.toBeInTheDocument();
    expect(screen.getByText('TechUser')).toBeInTheDocument();
  });
});
