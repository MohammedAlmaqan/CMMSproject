import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CodeListsPage from '@/pages/CodeListsPage';
import { useAuthStore } from '@/store/authStore';
import { causeCodeService } from '@/services/causeCodeService';
import { failureCodeService } from '@/services/failureCodeService';
import type { CauseCode, FailureCode, User } from '@/types';

vi.mock('@/services/causeCodeService', () => ({
  causeCodeService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/services/failureCodeService', () => ({
  failureCodeService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getTree: vi.fn(),
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

const cause: CauseCode = {
  ...audit,
  causeCodeId: 'cc-1',
  code: 'C-LOOSE',
  description: 'Loose connection',
};

const failureRoot: FailureCode = {
  ...audit,
  failureCodeId: 'fc-1',
  parentCodeId: null,
  code: 'F-MECH',
  description: 'Mechanical failure',
};

const failureChild: FailureCode = {
  ...audit,
  failureCodeId: 'fc-2',
  parentCodeId: 'fc-1',
  code: 'F-LEAK',
  description: 'Seal leak',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <CodeListsPage />
    </MemoryRouter>
  );

describe('CodeListsPage cause/failure management (tracker v1.1-16)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(causeCodeService.getAll).mockResolvedValue([cause]);
    vi.mocked(failureCodeService.getAll).mockResolvedValue([failureRoot, failureChild]);
  });

  it('creates a cause code and reports its code', async () => {
    const user = userEvent.setup();
    vi.mocked(causeCodeService.create).mockResolvedValue({ ...cause, causeCodeId: 'cc-2', code: 'C-WEAR' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new cause code/i }));
    await user.type(screen.getByLabelText('Cause Code'), 'C-WEAR');
    await user.type(screen.getByLabelText('Cause Description'), 'Normal wear');
    await user.click(screen.getByRole('button', { name: /create cause code/i }));

    await waitFor(() => expect(causeCodeService.create).toHaveBeenCalledTimes(1));
    expect(causeCodeService.create).toHaveBeenCalledWith({ code: 'C-WEAR', description: 'Normal wear' });
    expect(await screen.findByText(/C-WEAR created/i)).toBeInTheDocument();
  }, 20000);

  it('creates a failure code with a parent selection', async () => {
    const user = userEvent.setup();
    vi.mocked(failureCodeService.create).mockResolvedValue({ ...failureChild, failureCodeId: 'fc-3', code: 'F-BEAR' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new failure code/i }));
    await user.type(screen.getByLabelText('Failure Code'), 'F-BEAR');
    await user.type(screen.getByLabelText('Failure Description'), 'Bearing failure');
    await user.selectOptions(screen.getByLabelText('Parent Failure Code'), 'fc-1');
    await user.click(screen.getByRole('button', { name: /create failure code/i }));

    await waitFor(() => expect(failureCodeService.create).toHaveBeenCalledTimes(1));
    expect(failureCodeService.create).toHaveBeenCalledWith({
      code: 'F-BEAR',
      description: 'Bearing failure',
      parentCodeId: 'fc-1',
    });
    expect(await screen.findByText(/F-BEAR created/i)).toBeInTheDocument();
  }, 20000);

  it('edits a failure code, prefilling code, description and parent', async () => {
    const user = userEvent.setup();
    vi.mocked(failureCodeService.update).mockResolvedValue(failureChild);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit failure code f-leak/i }));

    expect(screen.getByLabelText('Failure Code')).toHaveValue('F-LEAK');
    expect(screen.getByLabelText('Failure Description')).toHaveValue('Seal leak');
    expect(screen.getByLabelText('Parent Failure Code')).toHaveValue('fc-1');

    await user.clear(screen.getByLabelText('Failure Description'));
    await user.type(screen.getByLabelText('Failure Description'), 'Seal leak (major)');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(failureCodeService.update).toHaveBeenCalledTimes(1));
    expect(failureCodeService.update).toHaveBeenCalledWith(
      'fc-2',
      expect.objectContaining({
        code: 'F-LEAK',
        description: 'Seal leak (major)',
        parentCodeId: 'fc-1',
      })
    );
    expect(await screen.findByText(/F-LEAK updated/i)).toBeInTheDocument();
  }, 20000);

  it('deletes a cause code', async () => {
    const user = userEvent.setup();
    vi.mocked(causeCodeService.delete).mockResolvedValue({ message: 'deleted' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete cause code c-loose/i }));

    await waitFor(() => expect(causeCodeService.delete).toHaveBeenCalledWith('cc-1'));
    expect(await screen.findByText(/C-LOOSE deleted/i)).toBeInTheDocument();
  }, 20000);

  it('shows create/edit but hides delete from a Technician', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Technician' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(causeCodeService.getAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /new cause code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit cause code c-loose/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete cause code c-loose/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete failure code f-mech/i })).not.toBeInTheDocument();
  }, 20000);

  it('hides all write controls from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(causeCodeService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new cause code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new failure code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit cause code c-loose/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete failure code f-leak/i })).not.toBeInTheDocument();
  }, 20000);
});
