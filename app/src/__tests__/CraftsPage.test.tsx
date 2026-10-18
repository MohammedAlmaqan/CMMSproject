import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CraftsPage from '@/pages/CraftsPage';
import { useAuthStore } from '@/store/authStore';
import { craftService } from '@/services/craftService';
import { workCenterService } from '@/services/workCenterService';
import type { Craft, WorkCenter, User } from '@/types';

vi.mock('@/services/craftService', () => ({
  craftService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/services/workCenterService', () => ({
  workCenterService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getCapacity: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

const workCenter: WorkCenter = {
  ...audit,
  workCenterId: 'wc-1',
  code: 'WC-E',
  name: 'Electrical',
  dailyCapacityHours: 8,
  costRatePerHour: 50,
  isActive: true,
};

const craft: Craft = {
  ...audit,
  craftId: 'craft-1',
  workCenterId: 'wc-1',
  craftCode: 'ELEC-A',
  description: 'Electrician A',
  hourlyRate: 45,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <CraftsPage />
    </MemoryRouter>
  );

describe('CraftsPage craft CRUD (tracker v1.1-15)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(craftService.getAll).mockResolvedValue([craft]);
    vi.mocked(workCenterService.getAll).mockResolvedValue([workCenter]);
  });

  it('creates a craft and reports its code', async () => {
    const user = userEvent.setup();
    vi.mocked(craftService.create).mockResolvedValue({
      ...craft,
      craftId: 'craft-2',
      craftCode: 'ELEC-B',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new craft/i }));
    await user.type(screen.getByLabelText('Craft Code'), 'ELEC-B');
    await user.type(screen.getByLabelText('Description'), 'Electrician B');
    await user.selectOptions(screen.getByLabelText('Work Center'), 'wc-1');
    await user.type(screen.getByLabelText('Hourly Rate ($)'), '50');
    await user.click(screen.getByRole('button', { name: /create craft/i }));

    await waitFor(() => expect(craftService.create).toHaveBeenCalledTimes(1));
    expect(craftService.create).toHaveBeenCalledWith({
      workCenterId: 'wc-1',
      craftCode: 'ELEC-B',
      description: 'Electrician B',
      hourlyRate: 50,
    });
    expect(await screen.findByText(/ELEC-B created/i)).toBeInTheDocument();
  }, 20000);

  it('edits a craft, prefilling from the row', async () => {
    const user = userEvent.setup();
    vi.mocked(craftService.update).mockResolvedValue(craft);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit elec-a/i }));

    expect(screen.getByLabelText('Craft Code')).toHaveValue('ELEC-A');
    expect(screen.getByLabelText('Description')).toHaveValue('Electrician A');
    expect(screen.getByLabelText('Work Center')).toHaveValue('wc-1');
    expect(screen.getByLabelText('Hourly Rate ($)')).toHaveValue(45);

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Electrician A (senior)');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(craftService.update).toHaveBeenCalledTimes(1));
    expect(craftService.update).toHaveBeenCalledWith(
      'craft-1',
      expect.objectContaining({
        craftCode: 'ELEC-A',
        description: 'Electrician A (senior)',
        hourlyRate: 45,
      })
    );
    expect(await screen.findByText(/ELEC-A updated/i)).toBeInTheDocument();
  }, 20000);

  it('deletes a craft', async () => {
    const user = userEvent.setup();
    vi.mocked(craftService.delete).mockResolvedValue({ message: 'deleted' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete elec-a/i }));

    await waitFor(() => expect(craftService.delete).toHaveBeenCalledWith('craft-1'));
    expect(await screen.findByText(/ELEC-A deleted/i)).toBeInTheDocument();
  }, 20000);

  it('shows delete but hides create/edit from a Maintenance Supervisor', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Maintenance Supervisor' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(craftService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new craft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit elec-a/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete elec-a/i })).toBeInTheDocument();
  }, 20000);

  it('hides all CRUD controls from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(craftService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new craft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit elec-a/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete elec-a/i })).not.toBeInTheDocument();
  }, 20000);
});
