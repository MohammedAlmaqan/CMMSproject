import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorkCentersPage from '@/pages/WorkCentersPage';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { workCenterService } from '@/services/workCenterService';
import { ApiError } from '@/lib/api';
import type { User, WorkCenter } from '@/types';

vi.mock('@/services/workCenterService', () => ({
  workCenterService: {
    getAll: vi.fn(),
    getCapacity: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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

const workCenter: WorkCenter = {
  workCenterId: 'wc-1',
  code: 'MILL-01',
  name: 'CNC Milling',
  dailyCapacityHours: 16,
  costRatePerHour: 85,
  isActive: true,
  createdBy: 'u-admin',
  createdDate: '2026-01-01T00:00:00.000Z',
  modifiedBy: '',
  modifiedDate: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <WorkCentersPage />
    </MemoryRouter>
  );

describe('WorkCentersPage CRUD (G6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    useAppStore.setState({ workCenters: [workCenter], crafts: [], loading: false, error: null });
    vi.mocked(workCenterService.getCapacity).mockResolvedValue({
      from: '2026-10-20',
      to: '2026-11-03',
      entries: [],
    });
  });

  it('creates a work centre through workCenterService.create and adds it to the list', async () => {
    const created: WorkCenter = { ...workCenter, workCenterId: 'wc-2', code: 'LATHE-02', name: 'CNC Lathe' };
    vi.mocked(workCenterService.create).mockResolvedValue(created);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add work center' }));
    await user.type(screen.getByLabelText('Code'), 'LATHE-02');
    await user.type(screen.getByLabelText('Name'), 'CNC Lathe');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(workCenterService.create)).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'LATHE-02', name: 'CNC Lathe' })
      )
    );
    expect(await screen.findByText('LATHE-02')).toBeInTheDocument();
  }, 20000);

  it('edits a work centre through workCenterService.update and refreshes the card', async () => {
    vi.mocked(workCenterService.update).mockResolvedValue({
      ...workCenter,
      name: 'CNC Milling (2nd shift)',
      isActive: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit work center MILL-01' }));
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('CNC Milling');
    await user.clear(name);
    await user.type(name, 'CNC Milling (2nd shift)');
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(workCenterService.update)).toHaveBeenCalledWith(
        'wc-1',
        expect.objectContaining({ name: 'CNC Milling (2nd shift)', isActive: false })
      )
    );
    expect(await screen.findByText('CNC Milling (2nd shift)')).toBeInTheDocument();
    expect(await screen.findByText('Inactive')).toBeInTheDocument();
  }, 20000);

  it('surfaces the API rejection and keeps the form open', async () => {
    vi.mocked(workCenterService.create).mockRejectedValue(
      new ApiError(409, 'Work center code already exists')
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add work center' }));
    await user.type(screen.getByLabelText('Code'), 'MILL-01');
    await user.type(screen.getByLabelText('Name'), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Work center code already exists');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  }, 20000);

  it('hides Add Work Center and Edit below the Requester floor', async () => {
    useAuthStore.setState({ user: { ...adminUser, role: 'View-Only' }, isAuthenticated: true, loading: false, error: null });
    renderPage();

    expect(await screen.findByText('MILL-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add work center' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit work center MILL-01' })).not.toBeInTheDocument();
  }, 20000);
});
