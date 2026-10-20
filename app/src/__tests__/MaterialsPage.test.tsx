import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MaterialsPage from '@/pages/MaterialsPage';
import { useAuthStore } from '@/store/authStore';
import { materialService } from '@/services/materialService';
import { ApiError } from '@/lib/api';
import type { Material, User } from '@/types';

vi.mock('@/services/materialService', () => ({
  materialService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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

const material: Material = {
  materialId: 'mat-1',
  materialCode: 'BRG-6205',
  description: 'Deep groove ball bearing',
  unitOfMeasure: 'EA',
  standardCost: 12.5,
  currentStock: 40,
  createdBy: 'u-admin',
  createdDate: '2026-01-01T00:00:00.000Z',
  modifiedBy: '',
  modifiedDate: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
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

describe('MaterialsPage catalog CRUD (G5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.mocked(materialService.getAll).mockResolvedValue({ data: [material], total: 1, skip: 0, take: 10 });
  });

  it('creates a material through materialService.create', async () => {
    vi.mocked(materialService.create).mockResolvedValue(material);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add Material' }));
    await user.type(screen.getByLabelText('Material code'), 'FLT-1234');
    await user.type(screen.getByLabelText('Description'), 'Oil filter element');
    await user.type(screen.getByLabelText('Unit of measure'), 'EA');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(materialService.create)).toHaveBeenCalledWith(
        expect.objectContaining({ materialCode: 'FLT-1234', description: 'Oil filter element', unitOfMeasure: 'EA' })
      )
    );
  }, 20000);

  it('edits a material through materialService.update', async () => {
    vi.mocked(materialService.update).mockResolvedValue({ ...material, description: 'Bearing, sealed' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit material BRG-6205' }));
    const desc = await screen.findByLabelText('Description');
    expect(desc).toHaveValue('Deep groove ball bearing');
    await user.clear(desc);
    await user.type(desc, 'Bearing, sealed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(materialService.update)).toHaveBeenCalledWith(
        'mat-1',
        expect.objectContaining({ description: 'Bearing, sealed' })
      )
    );
  }, 20000);

  it('surfaces the API rejection and keeps the form open', async () => {
    vi.mocked(materialService.create).mockRejectedValue(new ApiError(409, 'duplicate code'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add Material' }));
    await user.type(screen.getByLabelText('Material code'), 'BRG-6205');
    await user.type(screen.getByLabelText('Description'), 'dupe');
    await user.type(screen.getByLabelText('Unit of measure'), 'EA');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('duplicate code');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  }, 20000);

  it('hides Add Material and Edit below the Requester floor', async () => {
    useAuthStore.setState({ user: { ...adminUser, role: 'View-Only' }, isAuthenticated: true, loading: false, error: null });
    renderPage();

    expect(await screen.findByText('BRG-6205')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Material' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit material BRG-6205' })).not.toBeInTheDocument();
  }, 20000);
});
