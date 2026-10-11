import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LocationsPage from '@/pages/LocationsPage';
import { useAuthStore } from '@/store/authStore';
import { functionalLocationService } from '@/services/functionalLocationService';
import type { FunctionalLocation, User } from '@/types';

vi.mock('@/services/functionalLocationService', () => ({
  functionalLocationService: {
    getAll: vi.fn(),
    getTree: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/services/equipmentService', () => ({
  equipmentService: {
    getAll: vi.fn(),
  },
}));

import { equipmentService } from '@/services/equipmentService';

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

const location: FunctionalLocation = {
  ...audit,
  functionalLocationId: 'fl-1',
  locationCode: 'FL-01',
  description: 'Pump hall',
  parentLocationId: null,
  locationType: 'Unit',
  operationalStatus: 'Active',
  installationDate: null,
  gpsCoordinates: null,
  safetyCritical: false,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <LocationsPage />
    </MemoryRouter>
  );

describe('LocationsPage functional-location CRUD (SOW 3.1.1)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(functionalLocationService.getAll).mockResolvedValue([location]);
    vi.mocked(functionalLocationService.getTree).mockResolvedValue([{ ...location, children: [] }]);
    vi.mocked(equipmentService.getAll).mockResolvedValue([]);
  });

  it('creates a location and reports its code', async () => {
    const user = userEvent.setup();
    vi.mocked(functionalLocationService.create).mockResolvedValue({
      ...location,
      functionalLocationId: 'fl-2',
      locationCode: 'AR-01',
      locationType: 'Area',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new location/i }));
    await user.type(screen.getByLabelText('Location Code'), 'AR-01');
    await user.type(screen.getByLabelText('Description'), 'North area');
    await user.selectOptions(screen.getByLabelText('Location Type'), 'Area');
    await user.click(screen.getByRole('button', { name: /create location/i }));

    await waitFor(() => expect(functionalLocationService.create).toHaveBeenCalledTimes(1));
    expect(functionalLocationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCode: 'AR-01',
        description: 'North area',
        locationType: 'Area',
        parentLocationId: null,
        operationalStatus: 'Active',
      })
    );
    expect(await screen.findByText(/AR-01 created/i)).toBeInTheDocument();
  }, 20000);

  it('edits a location, prefilling from the row', async () => {
    const user = userEvent.setup();
    vi.mocked(functionalLocationService.update).mockResolvedValue(location);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit fl-01/i }));

    const code = screen.getByLabelText('Location Code');
    expect(code).toHaveValue('FL-01');
    expect(screen.getByLabelText('Description')).toHaveValue('Pump hall');

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Pump hall (renamed)');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(functionalLocationService.update).toHaveBeenCalledTimes(1));
    expect(functionalLocationService.update).toHaveBeenCalledWith(
      'fl-1',
      expect.objectContaining({
        locationCode: 'FL-01',
        description: 'Pump hall (renamed)',
      })
    );
    expect(await screen.findByText(/FL-01 updated/i)).toBeInTheDocument();
  }, 20000);

  it('deletes a location', async () => {
    const user = userEvent.setup();
    vi.mocked(functionalLocationService.delete).mockResolvedValue({ message: 'deleted' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete fl-01/i }));

    await waitFor(() => expect(functionalLocationService.delete).toHaveBeenCalledWith('fl-1'));
    expect(await screen.findByText(/FL-01 deleted/i)).toBeInTheDocument();
  }, 20000);

  it('hides the CRUD controls from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(functionalLocationService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit fl-01/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete fl-01/i })).not.toBeInTheDocument();
  }, 20000);
});