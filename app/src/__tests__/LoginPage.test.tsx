import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import type { User } from '@/types';

vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
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

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD_SENTINEL</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, error: null });
    vi.clearAllMocks();
  });

  it('renders the login form with username, password and submit button', () => {
    renderLogin();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows an error message when credentials are invalid', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(new Error('Invalid credentials'));
    const user = userEvent.setup();
    renderLogin();

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'operator');
    await user.type(screen.getByPlaceholderText('Enter password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD_SENTINEL')).not.toBeInTheDocument();
  });

  it('surfaces the 429 rate-limit message from the API', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(
      new Error('Too many login attempts. Please wait before trying again.')
    );
    const user = userEvent.setup();
    renderLogin();

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'operator');
    await user.type(screen.getByPlaceholderText('Enter password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(
      await screen.findByText('Too many login attempts. Please wait before trying again.')
    ).toBeInTheDocument();
  });

  it('navigates to /dashboard on successful login', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(adminUser);
    const user = userEvent.setup();
    renderLogin();

    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('DASHBOARD_SENTINEL')).toBeInTheDocument();
  });
});