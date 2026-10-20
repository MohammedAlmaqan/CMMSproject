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
  Plus,
  Pencil,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { materialService } from '@/services/materialService';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole } from '@/lib/rbac';
import type { Material } from '@/types';

const PAGE_SIZE = 10;

interface MaterialFormProps {
  initial: Material | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}

function MaterialForm({ initial, onCancel, onSaved }: MaterialFormProps) {
  const [materialCode, setMaterialCode] = useState(initial?.materialCode ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unitOfMeasure, setUnitOfMeasure] = useState(initial?.unitOfMeasure ?? '');
  const [standardCost, setStandardCost] = useState(initial ? String(initial.standardCost) : '');
  const [currentStock, setCurrentStock] = useState(initial ? String(initial.currentStock) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialCode.trim() || !description.trim() || !unitOfMeasure.trim()) {
      setError('Material code, description and unit of measure are required');
      return;
    }
    const payload = {
      materialCode: materialCode.trim(),
      description: description.trim(),
      unitOfMeasure: unitOfMeasure.trim(),
      standardCost: Number(standardCost || 0),
      currentStock: Number(currentStock || 0),
    };
    if (payload.standardCost < 0 || payload.currentStock < 0) {
      setError('Standard cost and stock cannot be negative');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (initial) await materialService.update(initial.materialId, payload);
      else await materialService.create(payload);
      onSaved(initial ? 'Material updated' : 'Material created');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={initial ? 'Edit material' : 'New material'} className="industrial-card rounded p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs text-secondary">
          Material code
          <input
            value={materialCode}
            onChange={(e) => setMaterialCode(e.target.value)}
            required
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Unit of measure
          <input
            value={unitOfMeasure}
            onChange={(e) => setUnitOfMeasure(e.target.value)}
            required
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Standard cost
          <input
            type="number"
            min="0"
            step="0.01"
            value={standardCost}
            onChange={(e) => setStandardCost(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Current stock
          <input
            type="number"
            min="0"
            step="1"
            value={currentStock}
            onChange={(e) => setCurrentStock(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={busy} className="px-3 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

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
  // POST/PUT /materials are Requester+ on the API; delete is deliberately omitted
  // here (no delete endpoint is wired on this page — see the audit's open items).
  const role = useAuthStore((s) => s.user?.role);
  const canImport = hasMinRole(role, 'Maintenance Planner');
  const canManage = hasMinRole(role, 'Requester');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

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
            {canManage && (
              <button
                onClick={() => { setEditing(null); setShowCreateForm(true); }}
                aria-label="Add Material"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber"
              >
                <Plus className="w-3.5 h-3.5" /> Add Material
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Import materials CSV"
              onChange={handleImportFile}
            />
            {canImport && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importBusy}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" /> {importBusy ? 'Importing…' : 'Import'}
              </button>
            )}
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

        {(showCreateForm || editing) && canManage && (
          <MaterialForm
            initial={editing}
            onCancel={() => { setShowCreateForm(false); setEditing(null); }}
            onSaved={(msg) => {
              setShowCreateForm(false);
              setEditing(null);
              setToastError(false);
              setToast(msg);
              reload();
            }}
          />
        )}

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
                  ...(canManage ? [{ key: 'actions', label: 'Actions' }] : []),
                ].map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-2.5 font-medium text-tertiary select-none"
                    style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    {...(col.key !== 'value' && col.key !== 'actions'
                      ? {
                          onClick: () => handleSort(col.key),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col.key);
                            }
                          },
                          tabIndex: 0,
                          role: 'button',
                          'aria-label': `Sort by ${col.label}`,
                        }
                      : {})}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key !== 'value' && col.key !== 'actions' && <ArrowUpDown className="w-3 h-3" />}
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
                  {canManage && (
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => { setShowCreateForm(false); setEditing(mat); }}
                        aria-label={`Edit material ${mat.materialCode}`}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary border border-subtle hover:border-highlight hover:text-amber"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  )}
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
