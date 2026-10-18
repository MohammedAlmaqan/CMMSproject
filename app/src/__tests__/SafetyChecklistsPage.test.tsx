import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SafetyChecklistsPage from '@/pages/SafetyChecklistsPage';
import { useAuthStore } from '@/store/authStore';
import { safetyChecklistService } from '@/services/safetyChecklistService';
import { ApiError } from '@/lib/api';
import type { SafetyChecklistTemplate, User } from '@/types';

vi.mock('@/services/safetyChecklistService', () => ({
  safetyChecklistService: {
    getTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getByWorkOrder: vi.fn(),
    attachToWorkOrder: vi.fn(),
    updateChecklistStatus: vi.fn(),
    updateChecklistItem: vi.fn(),
    deleteChecklist: vi.fn(),
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

const template: SafetyChecklistTemplate = {
  ...audit,
  checklistTemplateId: 'tpl-1',
  name: 'Monthly LOTO',
  description: 'Lockout/tagout monthly check',
  isMandatory: true,
  items: [
    { itemId: 'item-1', checklistTemplateId: 'tpl-1', sequenceNumber: 10, description: 'Verify energy sources isolated' },
    { itemId: 'item-2', checklistTemplateId: 'tpl-1', sequenceNumber: 20, description: 'Tags legible and intact' },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <SafetyChecklistsPage />
    </MemoryRouter>
  );

describe('SafetyChecklistsPage template management (tracker v1.1-17)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true, loading: false, error: null });
    vi.clearAllMocks();
    vi.mocked(safetyChecklistService.getTemplates).mockResolvedValue([template]);
  });

  it('creates a template with its first item and reports its name', async () => {
    const user = userEvent.setup();
    vi.mocked(safetyChecklistService.createTemplate).mockResolvedValue(template);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /new template/i }));
    await user.type(screen.getByLabelText('Template Name'), 'Confined Space Entry');
    await user.type(screen.getByLabelText('Description'), 'Pre-entry checks');
    await user.type(screen.getByLabelText('Item 1 description'), 'Atmosphere tested');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() => expect(safetyChecklistService.createTemplate).toHaveBeenCalledTimes(1));
    expect(safetyChecklistService.createTemplate).toHaveBeenCalledWith({
      name: 'Confined Space Entry',
      description: 'Pre-entry checks',
      isMandatory: false,
      items: [{ sequenceNumber: 10, description: 'Atmosphere tested' }],
    });
    expect(await screen.findByText(/Confined Space Entry created/i)).toBeInTheDocument();
  }, 20000);

  it('edits a template, prefilling name, flag and items with their itemIds', async () => {
    const user = userEvent.setup();
    vi.mocked(safetyChecklistService.updateTemplate).mockResolvedValue(template);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /edit template monthly loto/i }));

    expect(screen.getByLabelText('Template Name')).toHaveValue('Monthly LOTO');
    expect(screen.getByLabelText('Description')).toHaveValue('Lockout/tagout monthly check');
    expect(screen.getByLabelText('Mandatory checklist')).toBeChecked();
    expect(screen.getByLabelText('Item 1 description')).toHaveValue('Verify energy sources isolated');

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Lockout/tagout check (revised)');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(safetyChecklistService.updateTemplate).toHaveBeenCalledTimes(1));
    expect(safetyChecklistService.updateTemplate).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({
        description: 'Lockout/tagout check (revised)',
        items: [
          expect.objectContaining({ itemId: 'item-1', sequenceNumber: 10 }),
          expect.objectContaining({ itemId: 'item-2', sequenceNumber: 20 }),
        ],
      })
    );
    expect(await screen.findByText(/Monthly LOTO updated/i)).toBeInTheDocument();
  }, 20000);

  it('deletes a template', async () => {
    const user = userEvent.setup();
    vi.mocked(safetyChecklistService.deleteTemplate).mockResolvedValue({ message: 'deleted' });
    // The list still shows the template before the click; the reload after the
    // delete finds nothing left.
    vi.mocked(safetyChecklistService.getTemplates).mockResolvedValueOnce([template]).mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete template monthly loto/i }));

    await waitFor(() => expect(safetyChecklistService.deleteTemplate).toHaveBeenCalledWith('tpl-1'));
    expect(await screen.findByText(/Monthly LOTO deleted/i)).toBeInTheDocument();
  }, 20000);

  it('surfaces the API refusal when a delete is rejected with 409', async () => {
    const user = userEvent.setup();
    vi.mocked(safetyChecklistService.deleteTemplate).mockRejectedValue(
      new ApiError(409, 'Checklist template is attached to a work order and cannot be deleted')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete template monthly loto/i }));

    expect(
      await screen.findByText(/attached to a work order and cannot be deleted/i)
    ).toBeInTheDocument();
    expect(safetyChecklistService.deleteTemplate).toHaveBeenCalledWith('tpl-1');
  }, 20000);

  it('shows delete but hides create/edit from a Maintenance Supervisor', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'Maintenance Supervisor' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(safetyChecklistService.getTemplates).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit template monthly loto/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete template monthly loto/i })).toBeInTheDocument();
  }, 20000);

  it('hides all CRUD controls from a View-Only user', async () => {
    useAuthStore.setState({
      user: { ...adminUser, role: 'View-Only' },
      isAuthenticated: true,
      loading: false,
      error: null,
    });
    renderPage();

    await waitFor(() => expect(safetyChecklistService.getTemplates).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit template monthly loto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete template monthly loto/i })).not.toBeInTheDocument();
  }, 20000);
});
