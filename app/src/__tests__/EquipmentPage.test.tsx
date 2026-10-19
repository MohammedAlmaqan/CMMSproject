import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EquipmentPage from '@/pages/EquipmentPage';
import { useAuthStore } from '@/store/authStore';
import { equipmentService } from '@/services/equipmentService';
import { functionalLocationService } from '@/services/functionalLocationService';
import { workOrderService } from '@/services/workOrderService';
import type { User } from '@/types';

vi.mock('@/services/equipmentService', () => ({
  equipmentService: {
    getAllPages: vi.fn(),
    getAll: vi.fn(),
    exportCsv: vi.fn(),
    importCsv: vi.fn(),
  },
}));

vi.mock('@/services/functionalLocationService', () => ({
  functionalLocationService: { getAllPages: vi.fn() },
}));

vi.mock('@/services/workOrderService', () => ({
  workOrderService: { getAllPages: vi.fn() },
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
      <EquipmentPage />
    </MemoryRouter>
  );

describe('EquipmentPage CSV import gating (N12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.mocked(equipmentService.getAllPages).mockResolvedValue([]);
    vi.mocked(equipmentService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 0 });
    vi.mocked(functionalLocationService.getAllPages).mockResolvedValue([]);
    vi.mocked(workOrderService.getAllPages).mockResolvedValue([]);
  });

  it('offers the Import control at the Maintenance Planner floor', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  it('hides the Import control below the Maintenance Planner floor', async () => {
    // POST /equipment/import.csv is Maintenance Planner+ on the API.
    useAuthStore.setState({ user: { ...adminUser, role: 'Requester' }, isAuthenticated: true, loading: false, error: null });
    renderPage();

    await waitFor(() => expect(equipmentService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });
});
