import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaterialsPage from '@/pages/MaterialsPage';
import { useAuthStore } from '@/store/authStore';
import { materialService } from '@/services/materialService';
import type { User } from '@/types';

vi.mock('@/services/materialService', () => ({
  materialService: {
    getAll: vi.fn(),
    exportCsv: vi.fn(),
    importCsv: vi.fn(),
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <MaterialsPage />
    </MemoryRouter>
  );

describe('MaterialsPage CSV import gating (N12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.mocked(materialService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 10 });
  });

  it('offers the Import control at the Maintenance Planner floor', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  it('hides the Import control below the Maintenance Planner floor', async () => {
    // POST /materials/import.csv is Maintenance Planner+ on the API.
    useAuthStore.setState({ user: { ...adminUser, role: 'Requester' }, isAuthenticated: true, loading: false, error: null });
    renderPage();

    await waitFor(() => expect(materialService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });
});
