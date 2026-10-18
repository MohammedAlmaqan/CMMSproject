// ============================================================
// Crafts Page — Trade/Craft Management (tracker v1.1-15)
// Flat CRUD over /api/crafts, cloned from the C4a LocationsPage
// pattern. Write buttons are shown at the API's Maintenance
// Planner floor and delete at Maintenance Supervisor; controls
// the API would reject are hidden, not disabled.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import {
  Search,
  HardHat,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { craftService } from '@/services/craftService';
import { workCenterService } from '@/services/workCenterService';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import type { Craft, WorkCenter } from '@/types';

export default function CraftsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [crafts, setCrafts] = useState<Craft[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  // Backend floors (backend/src/routes/crafts.ts): POST/PUT need Maintenance
  // Planner, DELETE needs Maintenance Supervisor.
  const canWrite = hasPermission(['Maintenance Planner', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);

  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formWorkCenter, setFormWorkCenter] = useState('');
  const [formRate, setFormRate] = useState('');

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [craftRes, wcRes] = await Promise.all([craftService.getAll(), workCenterService.getAll()]);
      setCrafts(craftRes);
      setWorkCenters(wcRes);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load crafts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const inputCls =
    'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
  const labelCls = 'block text-tertiary mb-1';

  const resetForm = () => {
    setEditingId(null);
    setFormCode('');
    setFormDescription('');
    setFormWorkCenter('');
    setFormRate('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (craft: Craft) => {
    setEditingId(craft.craftId);
    setFormCode(craft.craftCode);
    setFormDescription(craft.description);
    setFormWorkCenter(craft.workCenterId);
    setFormRate(String(craft.hourlyRate));
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(formRate);
    if (!formCode.trim() || !formDescription.trim() || !formWorkCenter) {
      notify('Craft code, description and work center are required', true);
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      notify('Hourly rate must be a non-negative number', true);
      return;
    }
    const body = {
      workCenterId: formWorkCenter,
      craftCode: formCode.trim(),
      description: formDescription.trim(),
      hourlyRate: rate,
    };
    setBusy('save');
    try {
      if (editingId) {
        await craftService.update(editingId, body);
        notify(`Craft ${body.craftCode} updated`);
      } else {
        await craftService.create(body);
        notify(`Craft ${body.craftCode} created`);
      }
      setShowForm(false);
      resetForm();
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Save failed', true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (craft: Craft) => {
    setBusy(`del:${craft.craftId}`);
    try {
      await craftService.delete(craft.craftId);
      notify(`Craft ${craft.craftCode} deleted`);
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const workCenterLabel = (id: string) => {
    const wc = workCenters.find((w) => w.workCenterId === id);
    return wc ? `${wc.code} — ${wc.name}` : id;
  };

  const filteredCrafts = crafts.filter((craft) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      craft.craftCode.toLowerCase().includes(q) ||
      craft.description.toLowerCase().includes(q) ||
      workCenterLabel(craft.workCenterId).toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Header title="CRAFTS" showActions={false} />
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded border px-4 py-2 ${
            toast.error ? 'border-red-500/50 bg-red-500/10' : 'border-emerald-500/50 bg-emerald-500/10'
          }`}
        >
          {toast.error ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-xs text-primary">{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message" className="text-tertiary hover:text-primary"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search crafts..."
              aria-label="Search crafts"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <span className="text-tertiary text-xs ml-auto">
            {loading ? 'Loading…' : `${crafts.length} crafts`}
          </span>
          {loadError && (
            <button
              onClick={reload}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber border border-amber/50 hover:bg-amber/10"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              <Plus className="w-3.5 h-3.5" /> New Craft
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">
                {editingId ? 'Edit Craft' : 'New Craft'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-tertiary hover:text-primary"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="craft-code">Craft Code</label>
                <input
                  id="craft-code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={editingId ? undefined : 'e.g. ELEC-A'}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="craft-desc">Description</label>
                <input id="craft-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="craft-rate">Hourly Rate ($)</label>
                <input
                  id="craft-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="craft-wc">Work Center</label>
              <select id="craft-wc" value={formWorkCenter} onChange={(e) => setFormWorkCenter(e.target.value)} className={inputCls}>
                <option value="">Select a work center…</option>
                {workCenters.map((wc) => (
                  <option key={wc.workCenterId} value={wc.workCenterId}>
                    {wc.code} — {wc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'save'}
                className="px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Save Changes' : 'Create Craft'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading crafts...</span>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <HardHat className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">{loadError}</p>
              <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
            </div>
          </div>
        ) : filteredCrafts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <HardHat className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">No crafts found</p>
            </div>
          </div>
        ) : (
          <div className="industrial-card rounded overflow-hidden">
            <div className="grid grid-cols-[120px_1fr_1fr_100px_auto] gap-4 px-3 py-2 border-b border-subtle" style={{ backgroundColor: '#27272A' }}>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Code</span>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</span>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Work Center</span>
              <span className="text-tertiary font-medium text-right" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hourly Rate</span>
              <span className="w-16" />
            </div>
            {filteredCrafts.map((craft) => (
              <div
                key={craft.craftId}
                className="grid grid-cols-[120px_1fr_1fr_100px_auto] gap-4 px-3 py-2 text-xs border-b border-subtle hover:bg-surface-tertiary transition-colors"
                style={{ backgroundColor: '#111113' }}
              >
                <span className="font-mono text-primary">{craft.craftCode}</span>
                <span className="text-secondary truncate">{craft.description}</span>
                <span className="text-secondary truncate">{workCenterLabel(craft.workCenterId)}</span>
                <span className="font-mono text-amber text-right">${craft.hourlyRate}/hr</span>
                <div className="flex items-center gap-1 w-16 justify-end">
                  {canWrite && (
                    <button
                      onClick={() => openEdit(craft)}
                      disabled={busy !== null}
                      className="p-1 text-tertiary hover:text-primary transition-colors disabled:opacity-40"
                      title="Edit craft"
                      aria-label={`Edit ${craft.craftCode}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(craft)}
                      disabled={busy !== null}
                      className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                      title="Delete craft"
                      aria-label={`Delete ${craft.craftCode}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
