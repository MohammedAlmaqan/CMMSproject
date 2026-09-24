// ============================================================
// Materials Page — Spare Parts Catalog
// ============================================================

import { useState, useMemo, useRef } from 'react';
import {
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Upload,
  Download,
  X,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { materialService } from '@/services/materialService';
import { ApiError } from '@/lib/api';

const PAGE_SIZE = 10;

export default function MaterialsPage() {
  const materials = useAppStore((s) => s.materials);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<string>('materialCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);

  const handleExport = async () => {
    setExportBusy(true);
    try {
      await materialService.exportCsv();
      setToastError(false);
      setToast('Materials CSV exported');
    } catch (err) {
      setToastError(true);
      setToast(err instanceof ApiError ? err.message : 'CSV export failed');
    } finally {
      setExportBusy(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportBusy(true);
    try {
      const res = await materialService.importCsv(file);
      await useAppStore.getState().loadFromApi();
      setToastError(false);
      setToast(`Import complete: ${res.created} created, ${res.updated} updated`);
    } catch (err) {
      setToastError(true);
      setToast(err instanceof ApiError ? err.message : 'CSV import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const filtered = useMemo(() => {
    let data = [...materials];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (m) =>
          m.materialCode.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField] as string;
      const bVal = (b as unknown as Record<string, unknown>)[sortField] as string;
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return data;
  }, [materials, searchQuery, sortField, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  return (
    <>
      <Header title="MATERIALS" showActions={false} />
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded border px-4 py-2 ${toastError ? 'border-red-500/50 bg-red-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
          <span className="text-xs text-primary">{toast}</span>
          <button onClick={() => setToast(null)} className="text-tertiary hover:text-primary" aria-label="Dismiss message"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="mb-4 flex items-center gap-3 text-tertiary text-xs">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-tertiary border-t-transparent animate-spin" />
            Loading materials...
          </div>
        )}
        {storeError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{storeError}</span>
            <button onClick={() => useAppStore.getState().loadFromApi()} className="ml-2 underline hover:text-red-100">Retry</button>
          </div>
        )}
        {!loading && !storeError && materials.length === 0 && (
          <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No materials found in the system.</div>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search materials..."
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Import materials CSV"
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importBusy}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" /> {importBusy ? 'Importing…' : 'Import'}
            </button>
            <button
              onClick={handleExport}
              disabled={exportBusy}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> {exportBusy ? 'Exporting…' : 'Export'}
            </button>
            <span className="text-tertiary text-xs">{filtered.length} materials</span>
          </div>
        </div>

        <div className="industrial-card rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: '#27272A' }}>
                {[
                  { key: 'materialCode', label: 'Material Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'unitOfMeasure', label: 'UOM' },
                  { key: 'standardCost', label: 'Std Cost' },
                  { key: 'currentStock', label: 'Stock' },
                  { key: 'value', label: 'Value' },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-2.5 font-medium text-tertiary cursor-pointer select-none"
                    style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    onClick={() => col.key !== 'value' && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key !== 'value' && <ArrowUpDown className="w-3 h-3" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((mat, idx) => (
                <tr
                  key={mat.materialId}
                  className="border-t border-subtle"
                  style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-primary">{mat.materialCode}</td>
                  <td className="px-4 py-2.5 text-xs text-primary">{mat.description}</td>
                  <td className="px-4 py-2.5 text-xs text-secondary">{mat.unitOfMeasure}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-secondary">${mat.standardCost.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-xs ${
                      mat.currentStock < 5 ? 'text-red-status' : mat.currentStock < 10 ? 'text-amber' : 'text-green-status'
                    }`}>
                      {mat.currentStock}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-primary">
                    ${(mat.currentStock * mat.standardCost).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-tertiary text-xs">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </>
  );
}
