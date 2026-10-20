import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EquipmentDetailPage from '@/pages/EquipmentDetailPage';
import { useAuthStore } from '@/store/authStore';
import { equipmentService } from '@/services/equipmentService';
import { equipmentMeterService } from '@/services/equipmentMeterService';
import { functionalLocationService } from '@/services/functionalLocationService';
import { materialService } from '@/services/materialService';
import { attachmentService } from '@/services/attachmentService';
import { ApiError } from '@/lib/api';
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

vi.mock('@/services/functionalLocationService', () => ({
  functionalLocationService: { getAllPages: vi.fn() },
}));

vi.mock('@/services/equipmentMeterService', () => ({
  equipmentMeterService: { getAll: vi.fn(), addReading: vi.fn() },
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

describe('EquipmentDetailPage master-data edit (G4)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(equipmentService.getById).mockResolvedValue(equipment);
    vi.mocked(equipmentService.getHistory).mockResolvedValue({ data: [], total: 0, skip: 0, take: 200 });
    vi.mocked(materialService.getAllPages).mockResolvedValue([]);
    vi.mocked(materialService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 50 });
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([]);
    vi.mocked(functionalLocationService.getAllPages).mockResolvedValue([
      { functionalLocationId: 'fl-1', locationCode: 'PLANT-01', description: 'Main plant', parentLocationId: null, locationType: 'Plant', operationalStatus: 'Active', installationDate: null, gpsCoordinates: null, safetyCritical: false, createdBy: 'u-admin', createdDate: '2026-09-01T00:00:00.000Z', modifiedBy: '', modifiedDate: '2026-09-01T00:00:00.000Z', isDeleted: false },
    ]);
  });

  it('saves master-data changes through equipmentService.update and reloads', async () => {
    vi.mocked(equipmentService.update).mockResolvedValue({
      ...equipment,
      name: 'Feed pump Mk2',
      criticality: 'S',
    });
    // First read serves the initial render; the post-save reload must see the
    // saved values, so subsequent reads return the updated record.
    vi.mocked(equipmentService.getById)
      .mockResolvedValueOnce(equipment)
      .mockResolvedValue({ ...equipment, name: 'Feed pump Mk2', criticality: 'S' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    const name = await screen.findByLabelText('Equipment name');
    expect(name).toHaveValue('Feed pump');
    await user.clear(name);
    await user.type(name, 'Feed pump Mk2');
    await user.selectOptions(screen.getByLabelText('Equipment criticality'), 'S');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(equipmentService.update)).toHaveBeenCalledWith(
        'eq-1',
        expect.objectContaining({ name: 'Feed pump Mk2', criticality: 'S' })
      )
    );
    // The page reloads after save, so the header shows the new name.
    expect(await screen.findByText('Feed pump Mk2')).toBeInTheDocument();
  }, 20000);

  it('offers S (Safety Critical) in the criticality picker, matching the API enum', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    const criticality = await screen.findByLabelText('Equipment criticality');
    for (const value of ['S', 'A', 'B', 'C']) {
      expect(criticality.querySelector(`option[value="${value}"]`)).toBeInTheDocument();
    }
  }, 20000);

  it('hides the edit control from a View-Only user (PUT floor is Technician)', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    expect(await screen.findByText('PUMP-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  }, 20000);

  it('surfaces the API rejection and keeps the form open', async () => {
    vi.mocked(equipmentService.update).mockRejectedValue(new ApiError(409, 'Equipment code already exists'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Equipment code already exists');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  }, 20000);
});

describe('EquipmentDetailPage meter readings (G7)', () => {
  const withMeter: Equipment = {
    ...equipment,
    meters: [
      {
        ...audit,
        meterId: 'meter-1',
        equipmentId: 'eq-1',
        meterName: 'Running hours',
        unitOfMeasure: 'h',
        lastReading: 1200,
        lastReadingDate: '2026-09-01T00:00:00.000Z',
        readings: [],
      },
    ],
  };

  const openMetersTab = async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /^Meters$/ }));
    await screen.findByText('Running hours');
    return user;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.mocked(equipmentService.getById).mockResolvedValue(withMeter);
    vi.mocked(equipmentService.getHistory).mockResolvedValue({ data: [], total: 0, skip: 0, take: 200 });
    vi.mocked(materialService.getAll).mockResolvedValue({ data: [], total: 0, skip: 0, take: 50 });
    vi.mocked(materialService.getAllPages).mockResolvedValue([]);
    vi.mocked(attachmentService.getByEntity).mockResolvedValue([]);
  });

  it('records a reading through equipmentMeterService.addReading and reloads', async () => {
    vi.mocked(equipmentMeterService.addReading).mockResolvedValue({
      ...audit,
      readingId: 'r-1',
      meterId: 'meter-1',
      readingValue: 1234,
      readingDate: '2026-10-20T00:00:00.000Z',
      notes: 'shift check',
    });
    const user = await openMetersTab();

    await user.click(screen.getByRole('button', { name: 'Add reading' }));
    await user.type(screen.getByLabelText('Value'), '1234');
    await user.type(screen.getByLabelText('Notes'), 'shift check');
    await user.click(screen.getByRole('button', { name: 'Record reading' }));

    await waitFor(() =>
      expect(vi.mocked(equipmentMeterService.addReading)).toHaveBeenCalledWith(
        'meter-1',
        expect.objectContaining({ readingValue: 1234, notes: 'shift check' })
      )
    );
    expect(await screen.findByText('Reading recorded')).toBeInTheDocument();
  }, 20000);

  it('surfaces the API rejection and keeps the reading form open', async () => {
    vi.mocked(equipmentMeterService.addReading).mockRejectedValue(new ApiError(400, 'Reading value must be monotonic'));
    const user = await openMetersTab();

    await user.click(screen.getByRole('button', { name: 'Add reading' }));
    await user.type(screen.getByLabelText('Value'), '5');
    await user.click(screen.getByRole('button', { name: 'Record reading' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Reading value must be monotonic');
    expect(screen.getByRole('button', { name: 'Record reading' })).toBeInTheDocument();
  }, 20000);

  it('hides the Add reading control from a View-Only user', async () => {
    useAuthStore.setState({ user: { ...adminUser, role: 'View-Only' }, isAuthenticated: true, loading: false, error: null });
    await openMetersTab();

    expect(screen.queryByRole('button', { name: 'Add reading' })).not.toBeInTheDocument();
  }, 20000);
});