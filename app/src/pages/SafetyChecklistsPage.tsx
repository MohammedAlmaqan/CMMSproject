// ============================================================
// Safety Checklists Page — Template Management (tracker v1.1-17)
// Flat CRUD over /api/safety-checklists/templates (C3, owner
// decision 2). Write controls sit at the API's Maintenance
// Planner floor and delete at Maintenance Supervisor; controls
// the API would reject are hidden, not disabled. Item editing
// is full-list reconciliation: kept rows carry their itemId,
// new rows do not, and the API refuses (409) to remove an item
// that is already attached to a work order.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import {
  Search,
  ListChecks,
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
import CsvToolbar from '@/components/CsvToolbar';
import { safetyChecklistService } from '@/services/safetyChecklistService';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import type { SafetyChecklistTemplate } from '@/types';

interface ItemDraft {
  itemId?: string;
  sequenceNumber: number;
  description: string;
}

export default function SafetyChecklistsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [templates, setTemplates] = useState<SafetyChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  // Backend floors (backend/src/routes/safetyChecklists.ts): POST/PUT need
  // Maintenance Planner, DELETE needs Maintenance Supervisor.
  const canWrite = hasPermission(['Maintenance Planner', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMandatory, setFormMandatory] = useState(false);
  const [formItems, setFormItems] = useState<ItemDraft[]>([]);

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
      setTemplates(await safetyChecklistService.getTemplates());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load checklist templates');
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
    setFormName('');
    setFormDescription('');
    setFormMandatory(false);
    setFormItems([{ sequenceNumber: 10, description: '' }]);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (template: SafetyChecklistTemplate) => {
    setEditingId(template.checklistTemplateId);
    setFormName(template.name);
    setFormDescription(template.description);
    setFormMandatory(template.isMandatory);
    setFormItems(
      (template.items ?? []).map((item) => ({
        itemId: item.itemId,
        sequenceNumber: item.sequenceNumber,
        description: item.description,
      }))
    );
    setShowForm(true);
  };

  const setItemField = (index: number, patch: Partial<ItemDraft>) => {
    setFormItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    setFormItems((prev) => {
      const nextSeq = prev.reduce((max, item) => Math.max(max, item.sequenceNumber), 0) + 10;
      return [...prev, { sequenceNumber: nextSeq, description: '' }];
    });
  };

  const removeItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDescription.trim()) {
      notify('Template name and description are required', true);
      return;
    }
    const items = formItems
      .filter((item) => item.description.trim() !== '')
      .map((item) => ({
        ...(item.itemId ? { itemId: item.itemId } : {}),
        sequenceNumber: Number(item.sequenceNumber),
        description: item.description.trim(),
      }));
    if (items.length === 0) {
      notify('At least one checklist item with a description is required', true);
      return;
    }
    if (items.some((item) => !Number.isInteger(item.sequenceNumber) || item.sequenceNumber < 1)) {
      notify('Item sequence numbers must be positive integers', true);
      return;
    }
    const body = {
      name: formName.trim(),
      description: formDescription.trim(),
      isMandatory: formMandatory,
      items,
    };
    setBusy('save');
    try {
      if (editingId) {
        await safetyChecklistService.updateTemplate(editingId, body);
        notify(`Template ${body.name} updated`);
      } else {
        await safetyChecklistService.createTemplate(body);
        notify(`Template ${body.name} created`);
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

  const remove = async (template: SafetyChecklistTemplate) => {
    setBusy(`del:${template.checklistTemplateId}`);
    try {
      await safetyChecklistService.deleteTemplate(template.checklistTemplateId);
      notify(`Template ${template.name} deleted`);
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const filteredTemplates = templates.filter((template) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return template.name.toLowerCase().includes(q) || template.description.toLowerCase().includes(q);
  });

  return (
    <>
      <Header title="SAFETY CHECKLISTS" showActions={false} />
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
              placeholder="Search templates..."
              aria-label="Search safety checklist templates"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <span className="text-tertiary text-xs ml-auto">
            {loading ? 'Loading…' : `${templates.length} templates`}
          </span>
          <CsvToolbar
            noun="safety checklists"
            importPath="/safety-checklists/import.csv"
            exportPath="/safety-checklists/export.csv"
            canImport={canWrite}
            onImported={reload}
          />
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
              <Plus className="w-3.5 h-3.5" /> New Template
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">
                {editingId ? 'Edit Template' : 'New Template'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-tertiary hover:text-primary"
                aria-label="Cancel template form"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-[1fr_2fr_auto] gap-3 items-end">
              <div>
                <label className={labelCls} htmlFor="tpl-name">Template Name</label>
                <input
                  id="tpl-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={editingId ? undefined : 'e.g. LOTO Monthly Check'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="tpl-desc">Description</label>
                <input
                  id="tpl-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-secondary pb-1.5">
                <input
                  type="checkbox"
                  checked={formMandatory}
                  onChange={(e) => setFormMandatory(e.target.checked)}
                  aria-label="Mandatory checklist"
                />
                Mandatory
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={labelCls + ' mb-0'}>Checklist Items</span>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary border border-subtle hover:border-highlight"
                  aria-label="Add checklist item"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>
              <div className="space-y-2">
                {formItems.map((item, index) => (
                  <div key={item.itemId ?? `new-${index}`} className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.sequenceNumber}
                      onChange={(e) => setItemField(index, { sequenceNumber: Number(e.target.value) })}
                      aria-label={`Item ${index + 1} sequence number`}
                      className={inputCls + ' w-20 font-mono'}
                    />
                    <input
                      value={item.description}
                      onChange={(e) => setItemField(index, { description: e.target.value })}
                      placeholder={`Item ${index + 1} question`}
                      aria-label={`Item ${index + 1} description`}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={formItems.length <= 1}
                      className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
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
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading checklist templates...</span>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <ListChecks className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">{loadError}</p>
              <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
            </div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <ListChecks className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">No checklist templates found</p>
            </div>
          </div>
        ) : (
          <div className="industrial-card rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_2fr_90px_80px_auto] gap-4 px-3 py-2 border-b border-subtle" style={{ backgroundColor: '#27272A' }}>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Name</span>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</span>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Mandatory</span>
              <span className="text-tertiary font-medium text-right" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Items</span>
              <span className="w-16" />
            </div>
            {filteredTemplates.map((template) => (
              <div
                key={template.checklistTemplateId}
                className="grid grid-cols-[1fr_2fr_90px_80px_auto] gap-4 px-3 py-2 text-xs border-b border-subtle hover:bg-surface-tertiary transition-colors"
                style={{ backgroundColor: '#151517' }}
              >
                <span className="font-mono text-primary truncate">{template.name}</span>
                <span className="text-secondary truncate">{template.description}</span>
                <span className={template.isMandatory ? 'text-amber' : 'text-tertiary'}>{template.isMandatory ? 'Yes' : 'No'}</span>
                <span className="font-mono text-secondary text-right">{template.items?.length ?? 0}</span>
                <div className="flex items-center gap-1 w-16 justify-end">
                  {canWrite && (
                    <button
                      onClick={() => openEdit(template)}
                      disabled={busy !== null}
                      className="p-1 text-tertiary hover:text-primary transition-colors disabled:opacity-40"
                      title="Edit template"
                      aria-label={`Edit template ${template.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(template)}
                      disabled={busy !== null}
                      className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                      title="Delete template"
                      aria-label={`Delete template ${template.name}`}
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
