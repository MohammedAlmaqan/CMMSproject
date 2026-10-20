import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    create: vi.fn(),
    update: vi.fn(),
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

describe('EquipmentPage create (G4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.mocked(equipmentService.getAllPages).mockResolvedValue([]);
    vi.mocked(equipmentService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 0 });
    vi.mocked(functionalLocationService.getAllPages).mockResolvedValue([
      { functionalLocationId: 'fl-1', locationCode: 'PLANT-01', description: 'Main plant', parentLocationId: null, locationType: 'Plant', operationalStatus: 'Active', installationDate: null, gpsCoordinates: null, safetyCritical: false, createdBy: 'u-admin', createdDate: '2026-09-01T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-01T00:00:00.000Z', isDeleted: false },
    ]);
    vi.mocked(workOrderService.getAllPages).mockResolvedValue([]);
  });

  it('creates equipment through equipmentService.create, including criticality S', async () => {
    vi.mocked(equipmentService.create).mockResolvedValue({
      equipmentId: 'eq-new',
      equipmentCode: 'TK-99',
      name: 'New tank',
      description: '',
      functionalLocationId: 'fl-1',
      manufacturer: '',
      model: '',
      serialNumber: '',
      assetTag: '',
      equipmentClass: 'TANK',
      criticality: 'S',
      installationDate: null,
      warrantyExpiryDate: null,
      operationalStatus: 'Active',
      technicalParameters: {},
      createdBy: 'u-admin',
      createdDate: '2026-10-20T00:00:00.000Z',
      modifiedBy: 'u-admin',
      modifiedDate: '2026-10-20T00:00:00.000Z',
      isDeleted: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add Equipment' }));

    await user.type(screen.getByLabelText('Equipment code'), 'TK-99');
    await user.type(screen.getByLabelText('Equipment name'), 'New tank');
    await user.selectOptions(screen.getByLabelText('Equipment functional location'), 'fl-1');
    await user.selectOptions(screen.getByLabelText('Equipment criticality'), 'S');
    await user.click(screen.getByRole('button', { name: 'Create Equipment' }));

    await waitFor(() =>
      expect(vi.mocked(equipmentService.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          equipmentCode: 'TK-99',
          name: 'New tank',
          functionalLocationId: 'fl-1',
          criticality: 'S',
        })
      )
    );
  });

  it('hides the Add Equipment control below the Technician floor (POST /equipment)', async () => {
    useAuthStore.setState({ user: { ...adminUser, role: 'View-Only' }, isAuthenticated: true, loading: false, error: null });
    renderPage();

    await waitFor(() => expect(equipmentService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Add Equipment' })).not.toBeInTheDocument();
  });

  it('offers S (Safety Critical) in the criticality picker and filter, matching the API enum', async () => {
    const user = userEvent.setup();
    renderPage();

    // Filter dropdown on the toolbar.
    const filter = screen.getByLabelText('Filter by criticality');
    expect(filter.querySelector('option[value="S"]')).toBeInTheDocument();

    // Create-form dropdown.
    await user.click(await screen.findByRole('button', { name: 'Add Equipment' }));
    const criticality = screen.getByLabelText('Equipment criticality');
    for (const value of ['S', 'A', 'B', 'C']) {
      expect(criticality.querySelector(`option[value="${value}"]`)).toBeInTheDocument();
    }
  });
});
