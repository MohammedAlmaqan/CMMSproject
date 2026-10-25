// ============================================================
// Work Centers Page — Team & Craft Management
// ============================================================

import { useState } from 'react';
import { Clock, DollarSign, ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react';
import Header from '@/components/layout/Header';
import CapacityBoardPanel from '@/components/capacity/CapacityBoardPanel';
import CsvToolbar from '@/components/CsvToolbar';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole } from '@/lib/rbac';
import { workCenterService } from '@/services/workCenterService';
import { ApiError } from '@/lib/api';
import type { WorkCenter } from '@/types';

interface WorkCenterFormProps {
  initial: WorkCenter | null;
  onCancel: () => void;
  onSaved: (wc: WorkCenter, created: boolean) => void;
}

function WorkCenterForm({ initial, onCancel, onSaved }: WorkCenterFormProps) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [dailyCapacityHours, setDailyCapacityHours] = useState(initial ? String(initial.dailyCapacityHours) : '');
  const [costRatePerHour, setCostRatePerHour] = useState(initial ? String(initial.costRatePerHour) : '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Code and name are required');
      return;
    }
    const cap = Number(dailyCapacityHours || 0);
    const rate = Number(costRatePerHour || 0);
    if (cap < 0 || rate < 0) {
      setError('Capacity and cost rate cannot be negative');
      return;
    }
    const payload = { code: code.trim(), name: name.trim(), dailyCapacityHours: cap, costRatePerHour: rate, isActive };
    setBusy(true);
    setError(null);
    try {
      const saved = initial
        ? await workCenterService.update(initial.workCenterId, payload)
        : await workCenterService.create(payload);
      onSaved(saved, !initial);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={initial ? 'Edit work center' : 'New work center'} className="industrial-card rounded p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="block text-xs text-secondary">
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Daily capacity hours
          <input
            type="number"
            min="0"
            step="0.5"
            value={dailyCapacityHours}
            onChange={(e) => setDailyCapacityHours(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="block text-xs text-secondary">
          Cost rate per hour
          <input
            type="number"
            min="0"
            step="0.01"
            value={costRatePerHour}
            onChange={(e) => setCostRatePerHour(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-secondary">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={busy}
          className="accent-amber"
        />
        Active
      </label>
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

export default function WorkCentersPage() {
  const workCenters = useAppStore((s) => s.workCenters);
  const crafts = useAppStore((s) => s.crafts);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const addWorkCenter = useAppStore((s) => s.addWorkCenter);
  const updateWorkCenter = useAppStore((s) => s.updateWorkCenter);
  const role = useAuthStore((s) => s.user?.role);
  // POST/PUT /work-centers are Requester+ on the API; delete is deliberately omitted
  // (isActive deactivation covers the v1 need — see the audit's G6 note).
  const canManage = hasMinRole(role, 'Requester');
  // The CSV import is Maintenance Planner+; the export is authentication only.
  const canImport = hasMinRole(role, 'Maintenance Planner');
  const [expandedWC, setExpandedWC] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editing, setEditing] = useState<WorkCenter | null>(null);

  const handleSaved = (wc: WorkCenter, created: boolean) => {
    if (created) addWorkCenter(wc);
    else updateWorkCenter(wc.workCenterId, wc);
    setShowCreateForm(false);
    setEditing(null);
  };

  const toggleWC = (id: string) => {
    setExpandedWC((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Header title="WORK CENTERS & CRAFTS" showActions={false} />
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="mb-4 flex items-center gap-3 text-tertiary text-xs">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-tertiary border-t-transparent animate-spin" />
            Loading work centers...
          </div>
        )}
        {storeError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{storeError}</span>
            <button onClick={() => useAppStore.getState().loadFromApi()} className="ml-2 underline hover:text-red-100">Retry</button>
          </div>
        )}
        {!loading && !storeError && workCenters.length === 0 && (
          <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No work centers found in the system.</div>
        )}
        <CapacityBoardPanel crafts={crafts} />
        <div className="flex items-center gap-2 justify-end mb-4">
          <CsvToolbar
            noun="work centers"
            importPath="/work-centers/import.csv"
            exportPath="/work-centers/export.csv"
            canImport={canImport}
            onImported={() => useAppStore.getState().loadFromApi()}
          />
          {canManage && (
            <button
              onClick={() => { setEditing(null); setShowCreateForm(true); }}
              aria-label="Add work center"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber"
            >
              <Plus className="w-3.5 h-3.5" /> Add Work Center
            </button>
          )}
        </div>
        {(showCreateForm || editing) && canManage && (
          <WorkCenterForm initial={editing} onCancel={() => { setShowCreateForm(false); setEditing(null); }} onSaved={handleSaved} />
        )}
        <div className="grid grid-cols-2 gap-4">
          {workCenters.map((wc) => {
            const wcCrafts = crafts.filter((c) => c.workCenterId === wc.workCenterId);
            const isExpanded = expandedWC.has(wc.workCenterId);
            return (
              <div key={wc.workCenterId} className="industrial-card rounded overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 border-b border-subtle"
                  style={{ backgroundColor: '#27272A' }}
                >
                  <button
                    onClick={() => toggleWC(wc.workCenterId)}
                    aria-expanded={isExpanded}
                    className="flex items-center gap-3 text-left flex-1 cursor-pointer hover:bg-surface-tertiary transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-tertiary" /> : <ChevronRight className="w-4 h-4 text-tertiary" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary font-semibold">{wc.code}</span>
                        <span className="text-xs text-secondary">{wc.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                      <span className="text-tertiary text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{wc.dailyCapacityHours}h/day</span>
                      <span className="text-tertiary text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" />${wc.costRatePerHour}/hr</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${wc.isActive ? 'badge-completed' : 'badge-cancelled'}`}>
                        {wc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </button>
                  {canManage && (
                    <button
                      onClick={() => { setShowCreateForm(false); setEditing(wc); }}
                      aria-label={`Edit work center ${wc.code}`}
                      className="flex items-center gap-1.5 px-2 py-1.5 ml-3 rounded text-xs text-secondary border border-subtle hover:border-highlight hover:text-amber"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle" style={{ backgroundColor: '#1E1E22' }}>
                      <span className="text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Craft Code</span>
                      <span className="text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</span>
                      <span className="text-tertiary text-right" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hourly Rate</span>
                    </div>
                    {wcCrafts.map((craft) => (
                      <div key={craft.craftId} className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle" style={{ backgroundColor: '#151517' }}>
                        <span className="font-mono text-xs text-primary">{craft.craftCode}</span>
                        <span className="text-xs text-secondary">{craft.description}</span>
                        <span className="font-mono text-xs text-amber text-right">${craft.hourlyRate}/hr</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
