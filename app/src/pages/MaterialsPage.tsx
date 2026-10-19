// ============================================================
// Materials Page — Spare Parts Catalog
// ============================================================

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Upload,
  Download,
  X,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { materialService } from '@/services/materialService';
import { ApiError } from '@/lib/api';
import type { Material } from '@/types';

const PAGE_SIZE = 10;

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      await reload();
      setToastError(false);
      setToast(`Import complete: ${res.created} created, ${res.updated} updated`);
    } catch (err) {
      setToastError(true);
      setToast(err instanceof ApiError ? err.message : 'CSV import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {
      $orderby: `${sortField} ${sortDir}`,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    return params;
  }, [page, searchQuery, sortField, sortDir]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await materialService.getAll(queryParams);
      setMaterials(res.data || []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load materials');
      setMaterials([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    reload();
  }, [reload]);

  const paged = materials;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {loadError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{loadError}</span>
            <button onClick={() => reload()} className="ml-2 underline hover:text-red-100">Retry</button>
          </div>
        )}
        {!loading && !loadError && materials.length === 0 && (
          <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No materials found in the system.</div>
        )}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search materials..."
              aria-label="Search materials"
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
            <span className="text-tertiary text-xs">{total} materials</span>
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
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && col.key !== 'value') {
                        e.preventDefault();
                        handleSort(col.key);
                      }
                    }}
                    tabIndex={col.key !== 'value' ? 0 : undefined}
                    role={col.key !== 'value' ? 'button' : undefined}
                    aria-label={col.key !== 'value' ? `Sort by ${col.label}` : undefined}
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
                  style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#151517' }}
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
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </>
  );
}
