import { useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { csvService } from '@/services/csvService';
import type { CsvImportResult } from '@/services/csvService';

interface CsvToolbarProps {
  /** Lower-case, plural where it reads better: 'work orders', 'equipment'. */
  noun: string;
  /** e.g. '/work-orders/import.csv'. POST, Maintenance Planner+ on the API. */
  importPath: string;
  /** e.g. '/work-orders/export.csv'. GET, authentication only. */
  exportPath: string;
  /** False hides Import and leaves Export, matching the API's role floors. */
  canImport: boolean;
  onImported?: () => void;
  className?: string;
}

function describe(result: CsvImportResult): string {
  const parts = [`Imported ${result.created} new, ${result.updated} updated`];
  if (result.rejected.length > 0) {
    const first = result.rejected[0];
    parts.push(
      `${result.rejected.length} rejected (row ${first.row}: ${first.reason})`
    );
  }
  return parts.join(' - ');
}

/**
 * The Import/Export pair for a module's CSV surface (F7).
 *
 * It exists so four pages cannot grow four behaviours again: the same button
 * pair, the same busy labels, the same rule that a rejected row is reported
 * rather than swallowed, and the same reset of the file input (without it,
 * picking the same file twice fires no change event and the second import
 * silently does nothing). The role floor is the caller's to pass, because only
 * the page knows which module it is showing; the API enforces it regardless.
 */
export default function CsvToolbar({
  noun,
  importPath,
  exportPath,
  canImport,
  onImported,
  className,
}: CsvToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleExport = async () => {
    setExportBusy(true);
    setMessage(null);
    try {
      await csvService.exportCsv(exportPath, noun.replace(/\s+/g, '-'));
      setMessage({ text: `${noun[0].toUpperCase()}${noun.slice(1)} CSV exported`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : 'CSV export failed', error: true });
    } finally {
      setExportBusy(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Always clear the selection: re-choosing the same file must import again.
    e.target.value = '';
    if (!file) return;

    setImportBusy(true);
    setMessage(null);
    try {
      const result = await csvService.importCsv(importPath, file);
      setMessage({ text: describe(result), error: result.rejected.length > 0 });
      onImported?.();
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : 'CSV import failed', error: true });
    } finally {
      setImportBusy(false);
    }
  };

  const buttonClass =
    'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber disabled:opacity-50';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label={`Import ${noun} CSV`}
        onChange={handleImportFile}
      />
      {canImport && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importBusy}
          className={buttonClass}
        >
          {importBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {importBusy ? 'Importing…' : 'Import'}
        </button>
      )}
      <button type="button" onClick={handleExport} disabled={exportBusy} className={buttonClass}>
        {exportBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {exportBusy ? 'Exporting…' : 'Export'}
      </button>
      {message && (
        <span
          role="status"
          title={message.text}
          className={cn(
            'max-w-[22rem] truncate text-xs',
            message.error ? 'text-red-status' : 'text-green-status'
          )}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
