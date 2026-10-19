import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EquipmentDetailPage from '@/pages/EquipmentDetailPage';
import { useAuthStore } from '@/store/authStore';
import { equipmentService } from '@/services/equipmentService';
import { materialService } from '@/services/materialService';
import { attachmentService } from '@/services/attachmentService';
import type { Equipment, Material, User } from '@/types';

vi.mock('@/services/equipmentService', () => ({
  equipmentService: {
    getAll: vi.fn(),
    getAllPages: vi.fn(),
    exportCsv: vi.fn(),
    importCsv: vi.fn(),
    getById: vi.fn(),
    getHistory: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createBom: vi.fn(),
    updateBom: vi.fn(),
    deleteBom: vi.fn(),
  },
}));

vi.mock('@/services/materialService', () => ({
  materialService: { getAll: vi.fn(), getAllPages: vi.fn(), exportCsv: vi.fn(), importCsv: vi.fn() },
}));

vi.mock('@/services/attachmentService', () => ({
  attachmentService: {
    getByEntity: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    download: vi.fn(),
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

const audit = {
  createdBy: 'admin',
  createdDate: '2026-09-01T00:00:00.000Z',
  modifiedBy: 'admin',
  modifiedDate: '2026-09-01T00:00:00.000Z',
  isDeleted: false,
};

const equipment: Equipment = {
  ...audit,
  equipmentId: 'eq-1',
  equipmentCode: 'PUMP-01',
  name: 'Feed pump',
  description: 'Feed water pump',
  functionalLocationId: 'fl-1',
  manufacturer: 'ACME',
  model: 'X100',
  serialNumber: 'SN-1',
  assetTag: 'AT-1',
  equipmentClass: 'PUMP',
  criticality: 'B',
  installationDate: null,
  warrantyExpiryDate: null,
  operationalStatus: 'Active',
  technicalParameters: {},
  bomItems: [
    { bomId: 'bom-1', equipmentId: 'eq-1', materialId: 'mat-1', quantity: 3, material: { materialCode: 'MAT-1' } },
  ],
};

const material: Material = {
  ...audit,
  materialId: 'mat-2',
  materialCode: 'MAT-2',
  description: 'Seal kit',
  unitOfMeasure: 'EA',
  standardCost: 25,
  currentStock: 10,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/equipment/eq-1']}>
      <Routes>
        <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('EquipmentDetailPage BOM editing (SOW 3.1.2)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(equipmentService.getById).mockResolvedValue(equipment);
    vi.mocked(equipmentService.getHistory).mockResolvedValue({ data: [], total: 0, skip: 0, take: 200 });
    vi.mocked(materialService.getAll).mockResolvedValue({data:[material],total:1,skip:0,take:50});
    vi.mocked(materialService.getAllPages).mockResolvedValue([material]);
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([]);
  });

  it('adds a BOM item and reports success', async () => {
    const user = userEvent.setup();
    vi.mocked(equipmentService.createBom).mockResolvedValue({
      bomId: 'bom-2',
      equipmentId: 'eq-1',
      materialId: 'mat-2',
      quantity: 5,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /add item/i }));
    await user.selectOptions(screen.getByLabelText('Material'), 'mat-2');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '5');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(equipmentService.createBom).toHaveBeenCalledTimes(1));
    expect(equipmentService.createBom).toHaveBeenCalledWith('eq-1', { materialId: 'mat-2', quantity: 5 });
    expect(await screen.findByText(/BOM item added/i)).toBeInTheDocument();
  }, 20000);

  it('edits a BOM item quantity', async () => {
    const user = userEvent.setup();
    vi.mocked(equipmentService.updateBom).mockResolvedValue({
      bomId: 'bom-1',
      equipmentId: 'eq-1',
      materialId: 'mat-1',
      quantity: 7,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit bom mat-1/i }));
    const qty = screen.getByLabelText('Quantity');
    expect(qty).toHaveValue(3);
    await user.clear(qty);
    await user.type(qty, '7');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(equipmentService.updateBom).toHaveBeenCalledTimes(1));
    expect(equipmentService.updateBom).toHaveBeenCalledWith('eq-1', 'bom-1', { quantity: 7 });
    expect(await screen.findByText(/BOM item updated/i)).toBeInTheDocument();
  }, 20000);

  it('removes a BOM item', async () => {
    const user = userEvent.setup();
    vi.mocked(equipmentService.deleteBom).mockResolvedValue({ message: 'deleted' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /remove bom mat-1/i }));

    await waitFor(() => expect(equipmentService.deleteBom).toHaveBeenCalledWith('eq-1', 'bom-1'));
    expect(await screen.findByText(/BOM item removed/i)).toBeInTheDocument();
  }, 20000);

  it('hides BOM controls from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(equipmentService.getById).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit bom mat-1/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove bom mat-1/i })).not.toBeInTheDocument();
  }, 20000);

  it('hides the document upload from a View-Only user', async () => {
    // POST /attachments is Requester+ on the API.
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /documents/i }));

    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  }, 20000);

  it('offers the document upload to a Requester', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Requester' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /documents/i }));

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  }, 20000);
});