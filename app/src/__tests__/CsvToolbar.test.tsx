import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import CsvToolbar from '@/components/CsvToolbar';
import { csvService } from '@/services/csvService';
import { ApiError } from '@/lib/api';

vi.mock('@/services/csvService', () => ({
  csvService: { exportCsv: vi.fn(), importCsv: vi.fn() },
}));

const renderToolbar = (props: Partial<ComponentProps<typeof CsvToolbar>> = {}) =>
  render(
    <CsvToolbar
      noun="work orders"
      importPath="/work-orders/import.csv"
      exportPath="/work-orders/export.csv"
      canImport
      {...props}
    />
  );

const csvFile = (name = 'work-orders.csv') =>
  new File(['woNumber,type\n'], name, { type: 'text/csv' });

describe('CsvToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides Import but keeps Export below the import floor', () => {
    renderToolbar({ canImport: false });

    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('renders Export alone for an export-only register', async () => {
    vi.mocked(csvService.exportCsv).mockResolvedValue(undefined);
    const user = userEvent.setup();
    // Notifications and users have no import route: no importPath is passed, so
    // there must be no Import button and no file input to aim at.
    render(<CsvToolbar noun="notifications" exportPath="/notifications/export.csv" />);

    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Import notifications CSV')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() =>
      expect(csvService.exportCsv).toHaveBeenCalledWith('/notifications/export.csv', 'notifications')
    );
  });

  it('downloads the module export through the shared service', async () => {
    vi.mocked(csvService.exportCsv).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() =>
      expect(csvService.exportCsv).toHaveBeenCalledWith('/work-orders/export.csv', 'work-orders')
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Work orders CSV exported');
  });

  it('imports through the shared service, reports the counts and refreshes', async () => {
    vi.mocked(csvService.importCsv).mockResolvedValue({ created: 2, updated: 1, rejected: [] });
    const onImported = vi.fn();
    const user = userEvent.setup();
    renderToolbar({ onImported });

    const input = screen.getByLabelText('Import work orders CSV') as HTMLInputElement;
    await user.upload(input, csvFile());

    await waitFor(() =>
      expect(csvService.importCsv).toHaveBeenCalledWith('/work-orders/import.csv', expect.any(File))
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 2 new, 1 updated');
    expect(onImported).toHaveBeenCalled();
  });

  it('names the first rejected row rather than reporting a clean import', async () => {
    vi.mocked(csvService.importCsv).mockResolvedValue({
      created: 0,
      updated: 0,
      rejected: [{ row: 3, reason: 'criticality: Invalid option' }],
    });
    const user = userEvent.setup();
    renderToolbar();

    await user.upload(screen.getByLabelText('Import work orders CSV'), csvFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 rejected (row 3: criticality: Invalid option)'
    );
  });

  it('clears the file input so the same file can be imported again', async () => {
    vi.mocked(csvService.importCsv).mockResolvedValue({ created: 1, updated: 0, rejected: [] });
    const user = userEvent.setup();
    renderToolbar();

    const input = screen.getByLabelText('Import work orders CSV') as HTMLInputElement;
    await user.upload(input, csvFile());

    await waitFor(() => expect(csvService.importCsv).toHaveBeenCalledTimes(1));
    // Without the reset, picking the same path again fires no change event and
    // the second import silently does nothing.
    expect(input.value).toBe('');
  });

  it('surfaces the API reason when the import is refused', async () => {
    vi.mocked(csvService.importCsv).mockRejectedValue(
      new ApiError(400, 'Row 2: functionalLocationCode is blank but required')
    );
    const user = userEvent.setup();
    renderToolbar();

    await user.upload(screen.getByLabelText('Import work orders CSV'), csvFile());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Row 2: functionalLocationCode is blank but required'
    );
  });
});
