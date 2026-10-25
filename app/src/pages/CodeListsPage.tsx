// ============================================================
// Code Lists Page — Cause & Failure Code Management (v1.1-16)
// One route (/code-lists) with two sections (owner, 2026-10-18).
// Cause codes are a flat list; failure codes are flat-with-parent
// (owner: no tree editor). Write floors follow the APIs: Requester+
// for POST/PUT, Maintenance Supervisor for DELETE - hidden, not
// disabled. Field labels are section-unique so two panels on one
// page never share an accessible name.
// ============================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Search,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle,
  GitBranch,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import CsvToolbar from '@/components/CsvToolbar';
import { causeCodeService } from '@/services/causeCodeService';
import { failureCodeService } from '@/services/failureCodeService';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import type { CauseCode, FailureCode } from '@/types';

type ToastState = { text: string; error: boolean } | null;
type Notify = (text: string, error?: boolean) => void;

interface CodeSectionProps {
  kind: 'cause' | 'failure';
  noun: string; // 'cause code' / 'failure code' — toasts and aria-labels
  codeLabel: string;
  descriptionLabel: string;
  codePlaceholder: string;
  supportsParent: boolean;
  notify: Notify;
}

function CodeSection({ kind, noun, codeLabel, descriptionLabel, codePlaceholder, supportsParent, notify }: CodeSectionProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  // Both APIs (causeCodes.ts, failureCodes.ts): POST/PUT Requester+, DELETE Supervisor+.
  const canWrite = hasPermission(['Requester', 'Technician', 'Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);
  // The CSV import is Maintenance Planner+ (shared factory floor), higher than
  // this module's Requester+ write floor, so it needs its own gate.
  const canImport = hasPermission(['Maintenance Planner', 'Administrator']);

  const [items, setItems] = useState<(CauseCode | FailureCode)[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formParent, setFormParent] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = kind === 'cause' ? await causeCodeService.getAll() : await failureCodeService.getAll();
      setItems(res);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : `Failed to load ${noun}s`);
    } finally {
      setLoading(false);
    }
  }, [kind, noun]);

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
    setFormParent('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (item: CauseCode | FailureCode) => {
    setEditingId(kind === 'cause' ? (item as CauseCode).causeCodeId : (item as FailureCode).failureCodeId);
    setFormCode(item.code);
    setFormDescription(item.description);
    setFormParent(supportsParent ? ((item as FailureCode).parentCodeId ?? '') : '');
    setShowForm(true);
  };

  const idOf = (item: CauseCode | FailureCode) =>
    kind === 'cause' ? (item as CauseCode).causeCodeId : (item as FailureCode).failureCodeId;

  // Failure codes are a self-reparenting hierarchy: on edit, exclude the row
  // itself and its descendants from the parent picker so a cycle cannot be
  // formed from the UI (the API rejects one, this never offers it).
  const parentCandidates = useMemo(() => {
    if (!supportsParent) return [];
    const all = items as FailureCode[];
    const childrenByParent = new Map<string, string[]>();
    for (const f of all) {
      if (!f.parentCodeId) continue;
      childrenByParent.set(f.parentCodeId, [...(childrenByParent.get(f.parentCodeId) ?? []), f.failureCodeId]);
    }
    const excluded = new Set<string>();
    if (editingId) {
      excluded.add(editingId);
      const stack = [...(childrenByParent.get(editingId) ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (excluded.has(id)) continue;
        excluded.add(id);
        stack.push(...(childrenByParent.get(id) ?? []));
      }
    }
    return all.filter((f) => !excluded.has(f.failureCodeId));
  }, [supportsParent, items, editingId]);

  const parentLabel = (id: string | null) => {
    if (!id) return '—';
    const parent = (items as FailureCode[]).find((f) => f.failureCodeId === id);
    return parent ? parent.code : id;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formDescription.trim()) {
      notify(`${codeLabel} and ${descriptionLabel.toLowerCase()} are required`, true);
      return;
    }
    setBusy('save');
    try {
      if (kind === 'cause') {
        const body = { code: formCode.trim(), description: formDescription.trim() };
        if (editingId) {
          await causeCodeService.update(editingId, body);
          notify(`Cause code ${body.code} updated`);
        } else {
          await causeCodeService.create(body);
          notify(`Cause code ${body.code} created`);
        }
      } else {
        const body = {
          code: formCode.trim(),
          description: formDescription.trim(),
          parentCodeId: formParent || null,
        };
        if (editingId) {
          await failureCodeService.update(editingId, body);
          notify(`Failure code ${body.code} updated`);
        } else {
          await failureCodeService.create(body);
          notify(`Failure code ${body.code} created`);
        }
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

  const remove = async (item: CauseCode | FailureCode) => {
    setBusy(`del:${idOf(item)}`);
    try {
      if (kind === 'cause') {
        await causeCodeService.delete((item as CauseCode).causeCodeId);
      } else {
        await failureCodeService.delete((item as FailureCode).failureCodeId);
      }
      notify(`${noun.replace(/^./, (c) => c.toUpperCase())} ${item.code} deleted`);
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const filtered = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (supportsParent && parentLabel((item as FailureCode).parentCodeId).toLowerCase().includes(q))
    );
  });

  const columns = supportsParent ? 'grid-cols-[110px_1fr_110px_auto]' : 'grid-cols-[110px_1fr_auto]';

  return (
    <div className="industrial-card rounded overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle" style={{ backgroundColor: '#27272A' }}>
        {supportsParent && <GitBranch className="w-3.5 h-3.5 text-tertiary" />}
        <span className="text-primary text-xs font-semibold" style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {kind === 'cause' ? 'Cause Codes' : 'Failure Codes'}
        </span>
        <span className="text-tertiary text-xs ml-auto">{loading ? '…' : `${items.length}`}</span>
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
            <Plus className="w-3.5 h-3.5" /> New {noun}
          </button>
        )}
      </div>

      <div className="px-3 py-2 border-b border-subtle">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${noun}s...`}
              aria-label={`Search ${noun}s`}
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <CsvToolbar
            noun={kind === 'cause' ? 'cause codes' : 'failure codes'}
            importPath={kind === 'cause' ? '/cause-codes/import.csv' : '/failure-codes/import.csv'}
            exportPath={kind === 'cause' ? '/cause-codes/export.csv' : '/failure-codes/export.csv'}
            canImport={canImport}
            onImported={reload}
            className="ml-auto"
          />
        </div>
      </div>

      {showForm && (
        <form onSubmit={save} className="px-3 py-3 border-b border-subtle space-y-3" style={{ backgroundColor: '#1E1E22' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-primary text-xs font-semibold">{editingId ? `Edit ${noun}` : `New ${noun}`}</h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="text-tertiary hover:text-primary"
              aria-label={`Cancel ${noun} form`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className={`grid ${supportsParent ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
            <div>
              <label className={labelCls} htmlFor={`${kind}-code`}>{codeLabel}</label>
              <input
                id={`${kind}-code`}
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder={editingId ? undefined : codePlaceholder}
                className={inputCls}
              />
            </div>
            <div className={supportsParent ? 'col-span-2' : 'col-span-2'}>
              <label className={labelCls} htmlFor={`${kind}-desc`}>{descriptionLabel}</label>
              <input id={`${kind}-desc`} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className={inputCls} />
            </div>
            {supportsParent && (
              <div>
                <label className={labelCls} htmlFor={`${kind}-parent`}>Parent Failure Code</label>
                <select id={`${kind}-parent`} value={formParent} onChange={(e) => setFormParent(e.target.value)} className={inputCls}>
                  <option value="">None (root)</option>
                  {parentCandidates.map((f) => (
                    <option key={f.failureCodeId} value={f.failureCodeId}>
                      {f.code} — {f.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Save Changes' : `Create ${noun}`}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-tertiary" />
          <span className="ml-3 text-xs text-tertiary">Loading {noun}s...</span>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 text-tertiary mx-auto mb-2" />
            <p className="text-secondary text-xs">{loadError}</p>
            <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-secondary text-xs">No {noun}s found</p>
        </div>
      ) : (
        <>
          <div className={`grid ${columns} gap-3 px-3 py-2 border-b border-subtle`} style={{ backgroundColor: '#27272A' }}>
            <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Code</span>
            <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</span>
            {supportsParent && (
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Parent</span>
            )}
            <span className="w-16" />
          </div>
          {filtered.map((item) => (
            <div
              key={idOf(item)}
              className={`grid ${columns} gap-3 px-3 py-2 text-xs border-b border-subtle hover:bg-surface-tertiary transition-colors`}
              style={{ backgroundColor: '#151517' }}
            >
              <span className="font-mono text-primary">{item.code}</span>
              <span className="text-secondary truncate">{item.description}</span>
              {supportsParent && <span className="text-tertiary font-mono">{parentLabel((item as FailureCode).parentCodeId)}</span>}
              <div className="flex items-center gap-1 w-16 justify-end">
                {canWrite && (
                  <button
                    onClick={() => openEdit(item)}
                    disabled={busy !== null}
                    className="p-1 text-tertiary hover:text-primary transition-colors disabled:opacity-40"
                    title={`Edit ${noun}`}
                    aria-label={`Edit ${noun} ${item.code}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => remove(item)}
                    disabled={busy !== null}
                    className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                    title={`Delete ${noun}`}
                    aria-label={`Delete ${noun} ${item.code}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function CodeListsPage() {
  const [toast, setToast] = useState<ToastState>(null);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <Header title="CODE LISTS" showActions={false} />
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
        <div className="grid grid-cols-2 gap-4 items-start">
          <CodeSection
            kind="cause"
            noun="cause code"
            codeLabel="Cause Code"
            descriptionLabel="Cause Description"
            codePlaceholder="e.g. C-LOOSE"
            supportsParent={false}
            notify={notify}
          />
          <CodeSection
            kind="failure"
            noun="failure code"
            codeLabel="Failure Code"
            descriptionLabel="Failure Description"
            codePlaceholder="e.g. F-LEAK"
            supportsParent={true}
            notify={notify}
          />
        </div>
      </div>
    </>
  );
}
