import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
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
