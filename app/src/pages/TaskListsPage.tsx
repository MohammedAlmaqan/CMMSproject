// ============================================================
// Task Lists Page — Reusable Maintenance Templates (SOW 3.1.4)
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  X,
  Package,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Wrench,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { taskListService } from '@/services/taskListService';
import { ApiError } from '@/lib/api';
import type {
  TaskList,
  TaskListOperationInput,
  TaskListInput,
} from '@/types';

/** One step being edited. Materials hang off the step, never off the list. */
interface DraftOperation {
  sequenceNumber: number;
  description: string;
  craftId: string;
  plannedHours: string;
  numberOfTechnicians: string;
  materials: { materialId: string; quantity: string }[];
}

const emptyDraft = (seq: number): DraftOperation => ({
  sequenceNumber: seq,
  description: '',
  craftId: '',
  plannedHours: '',
  numberOfTechnicians: '1',
  materials: [],
});

export default function TaskListsPage() {
  const taskLists = useAppStore((s) => s.taskLists);
  const workCenters = useAppStore((s) => s.workCenters);
  const crafts = useAppStore((s) => s.crafts);
  const materials = useAppStore((s) => s.materials);
  const equipment = useAppStore((s) => s.equipment);
  const storeLoading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [workCenterId, setWorkCenterId] = useState('');
  const [equipmentClass, setEquipmentClass] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [ops, setOps] = useState<DraftOperation[]>([emptyDraft(1)]);

  // The API allows Requester and above to write; the screen hides controls the
  // API would reject rather than offering a button that always fails.
  const canWrite = hasPermission(['Requester', 'Technician', 'Maintenance Supervisor', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Administrator']);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return taskLists;
    const q = searchQuery.toLowerCase();
    return taskLists.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.equipmentClass ?? '').toLowerCase().includes(q)
    );
  }, [taskLists, searchQuery]);

  const craftName = (craftId: string) => {
    const c = crafts.find((x) => x.craftId === craftId);
    return c ? c.craftCode : craftId;
  };

  const materialLabel = (materialId: string) => {
    const m = materials.find((x) => x.materialId === materialId);
    return m ? `${m.materialCode} — ${m.description}` : materialId;
  };

  const resetForm = () => {
    setCode('');
    setDescription('');
    setWorkCenterId(workCenters[0]?.workCenterId ?? '');
    setEquipmentClass('');
    setEquipmentId('');
    setOps([emptyDraft(1)]);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = async (tl: TaskList) => {
    setEditingId(tl.taskListId);
    setCode(tl.code);
    setDescription(tl.description);
    setWorkCenterId(tl.workCenterId ?? '');
    setEquipmentClass(tl.equipmentClass ?? '');
    setEquipmentId(tl.equipmentId ?? '');
    setBusy(`load:${tl.taskListId}`);
    try {
      // Re-read rather than editing the list payload: the list read is shared
      // with the store and an edit must start from the current server state.
      const full = await taskListService.getById(tl.taskListId);
      setOps(
        (full.operations ?? []).map((o) => ({
          sequenceNumber: o.sequenceNumber,
          description: o.description,
          craftId: o.craftId,
          plannedHours: String(o.plannedHours ?? ''),
          numberOfTechnicians: String(o.numberOfTechnicians ?? 1),
          materials: (o.materials ?? []).map((m) => ({
            materialId: m.materialId,
            quantity: String(m.quantity),
          })),
        }))
      );
      setShowForm(true);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not load the task list', true);
      setEditingId(null);
    } finally {
      setBusy(null);
    }
  };

  const setOp = (index: number, patch: Partial<DraftOperation>) => {
    setOps((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addOp = () => setOps((prev) => [...prev, emptyDraft(prev.length + 1)]);

  const removeOp = (index: number) =>
    setOps((prev) =>
      prev
        .filter((_, i) => i !== index)
        // Renumber so the sequence stays 1..n after a removal, rather than
        // leaving a gap that the API would then reject as not contiguous.
        .map((o, i) => ({ ...o, sequenceNumber: i + 1 }))
    );

  const addMaterial = (index: number) =>
    setOps((prev) =>
      prev.map((o, i) =>
        i === index
          ? {
              ...o,
              materials: [
                ...o.materials.filter((m) => m.materialId !== ''),
                { materialId: '', quantity: '1' },
              ],
            }
          : o
      )
    );

  const setMaterial = (opIndex: number, mIndex: number, patch: { materialId?: string; quantity?: string }) =>
    setOps((prev) =>
      prev.map((o, i) =>
        i === opIndex
          ? { ...o, materials: o.materials.map((m, j) => (j === mIndex ? { ...m, ...patch } : m)) }
          : o
      )
    );

  const removeMaterial = (opIndex: number, mIndex: number) =>
    setOps((prev) =>
      prev.map((o, i) =>
        i === opIndex ? { ...o, materials: o.materials.filter((_, j) => j !== mIndex) } : o
      )
    );

  /**
   * Local validation before the round trip, so the obvious mistakes are caught
   * while the planner is still looking at the form. The API validates the same
   * rules independently; this is a convenience, not the enforcement.
   */
  const validate = (): string | null => {
    if (!code.trim()) return 'Code is required';
    if (!description.trim()) return 'Description is required';
    if (!workCenterId) return 'A work center is required';
    const usable = ops.filter((o) => o.description.trim() || o.materials.length > 0);
    if (usable.length === 0) return 'A task list needs at least one step';
    for (const o of usable) {
      if (!o.description.trim()) return `Step ${o.sequenceNumber} needs a description`;
      if (!o.craftId) return `Step ${o.sequenceNumber} needs a craft`;
      const seen = new Set<string>();
      for (const m of o.materials) {
        if (!m.materialId) return `Step ${o.sequenceNumber} has a material with no selection`;
        if (seen.has(m.materialId)) {
          return `Step ${o.sequenceNumber} lists ${materialLabel(m.materialId)} more than once`;
        }
        seen.add(m.materialId);
        if (Number(m.quantity) < 0) return `Step ${o.sequenceNumber} has a negative quantity`;
      }
    }
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      notify(problem, true);
      return;
    }

    const usable = ops.filter((o) => o.description.trim() || o.materials.length > 0);
    const body: TaskListInput = {
      code: code.trim(),
      description: description.trim(),
      workCenterId,
      equipmentClass: equipmentClass.trim() || null,
      equipmentId: equipmentId || null,
      operations: usable.map<TaskListOperationInput>((o, i) => ({
        sequenceNumber: i + 1,
        description: o.description.trim(),
        craftId: o.craftId,
        plannedHours: o.plannedHours === '' ? undefined : Number(o.plannedHours),
        numberOfTechnicians: Number(o.numberOfTechnicians) || 1,
        ...(o.materials.length > 0 && {
          materials: o.materials.map((m) => ({
            materialId: m.materialId,
            quantity: Number(m.quantity),
          })),
        }),
      })),
    };

    setBusy('save');
    try {
      if (editingId) {
        await taskListService.update(editingId, body);
        notify(`Task list ${body.code} updated`);
      } else {
        await taskListService.create(body);
        notify(`Task list ${body.code} created`);
      }
      setShowForm(false);
      resetForm();
      await useAppStore.getState().loadFromApi();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Save failed', true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (tl: TaskList) => {
    setBusy(`del:${tl.taskListId}`);
    try {
      await taskListService.remove(tl.taskListId);
      notify(`Task list ${tl.code} deleted`);
      await useAppStore.getState().loadFromApi();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const inputCls =
    'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
  const labelCls =
    'block text-tertiary mb-1';

  return (
    <>
      <Header title="TASK LISTS" showActions={false} />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded border px-4 py-2 ${
            toast.error
              ? 'border-red-500/50 bg-red-500/10'
              : 'border-emerald-500/50 bg-emerald-500/10'
          }`}
        >
          {toast.error ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-xs text-primary">{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="text-tertiary hover:text-primary"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, description or equipment class..."
              aria-label="Search task lists"
              className={`${inputCls} pl-8`}
            />
          </div>
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              <Plus className="w-3.5 h-3.5" /> New Task List
            </button>
          )}
        </div>

        {storeLoading && (
          <div className="mb-4 flex items-center gap-3 text-tertiary text-xs">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-tertiary border-t-transparent animate-spin" />
            Loading task lists...
          </div>
        )}
        {storeError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{storeError}</span>
            <button
              onClick={() => useAppStore.getState().loadFromApi()}
              className="ml-2 underline hover:text-red-100"
            >
              Retry
            </button>
          </div>
        )}
        {!storeLoading && !storeError && filtered.length === 0 && (
          <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">
            {searchQuery
              ? 'No task lists match that search.'
              : 'No task lists yet. A task list is the template a planner builds a work order from.'}
          </div>
        )}

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">
                {editingId ? 'Edit Task List' : 'New Task List'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-tertiary hover:text-primary"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="tl-code">Code</label>
                <input id="tl-code" value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="tl-desc">Description</label>
                <input id="tl-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="tl-wc">Work Center</label>
                <select id="tl-wc" value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
                  {workCenters.map((w) => (
                    <option key={w.workCenterId} value={w.workCenterId}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="tl-class">Equipment Class (optional)</label>
                {/* SOW 3.1.4: a list may be templated by asset class rather than
                    by one asset, which is how a fleet-wide routine is written
                    once and applied to every unit that matches. */}
                <input
                  id="tl-class"
                  value={equipmentClass}
                  onChange={(e) => setEquipmentClass(e.target.value)}
                  placeholder="e.g. PUMP-100"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="tl-eq">Specific Equipment (optional)</label>
                <select id="tl-eq" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={inputCls}>
                  <option value="">Not tied to one asset</option>
                  {equipment.map((eq) => (
                    <option key={eq.equipmentId} value={eq.equipmentId}>
                      {eq.equipmentCode} — {eq.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-secondary text-xs font-semibold">Steps</h3>
                <button
                  type="button"
                  onClick={addOp}
                  className="flex items-center gap-1 text-xs text-amber hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add step
                </button>
              </div>

              {ops.map((o, i) => (
                <div key={i} className="rounded border border-subtle p-3 mb-2" style={{ backgroundColor: '#111113' }}>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-1">
                      <span className={labelCls}>#{o.sequenceNumber}</span>
                    </div>
                    <div className="col-span-4">
                      <label className={labelCls} htmlFor={`op-desc-${i}`}>Step</label>
                      <input
                        id={`op-desc-${i}`}
                        value={o.description}
                        onChange={(e) => setOp(i, { description: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls} htmlFor={`op-craft-${i}`}>Craft</label>
                      <select
                        id={`op-craft-${i}`}
                        value={o.craftId}
                        onChange={(e) => setOp(i, { craftId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">Select...</option>
                        {crafts.map((c) => (
                          <option key={c.craftId} value={c.craftId}>
                            {c.craftCode}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls} htmlFor={`op-hrs-${i}`}>Planned Hours</label>
                      <input
                        id={`op-hrs-${i}`}
                        type="number"
                        min="0"
                        step="0.25"
                        value={o.plannedHours}
                        onChange={(e) => setOp(i, { plannedHours: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls} htmlFor={`op-tech-${i}`}>Technicians</label>
                      <input
                        id={`op-tech-${i}`}
                        type="number"
                        min="1"
                        step="1"
                        value={o.numberOfTechnicians}
                        onChange={(e) => setOp(i, { numberOfTechnicians: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeOp(i)}
                        className="p-1 text-tertiary hover:text-red-status transition-colors"
                        title="Remove step"
                        aria-label={`Remove step ${o.sequenceNumber}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* SOW 3.1.4 required materials, per step. */}
                  <div className="mt-2 pl-6">
                    <div className="flex items-center justify-between">
                      <span className="text-tertiary" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Required materials
                      </span>
                      <button
                        type="button"
                        onClick={() => addMaterial(i)}
                        className="flex items-center gap-1 text-[10px] text-amber hover:underline"
                      >
                        <Package className="w-3 h-3" /> Add material
                      </button>
                    </div>
                    {o.materials.length === 0 ? (
                      <p className="text-tertiary text-xs mt-1">
                        None. This step needs no parts, only labour.
                      </p>
                    ) : (
                      o.materials.map((m, j) => (
                        <div key={j} className="grid grid-cols-12 gap-2 items-center mt-1">
                          <div className="col-span-9">
                            <select
                              value={m.materialId}
                              onChange={(e) => setMaterial(i, j, { materialId: e.target.value })}
                              aria-label={`Material for step ${o.sequenceNumber}`}
                              className={inputCls}
                            >
                              <option value="">Select a material...</option>
                              {materials.map((mat) => (
                                <option key={mat.materialId} value={mat.materialId}>
                                  {mat.materialCode} — {mat.description}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={m.quantity}
                              onChange={(e) => setMaterial(i, j, { quantity: e.target.value })}
                              aria-label={`Quantity for step ${o.sequenceNumber}`}
                              className={inputCls}
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeMaterial(i, j)}
                              className="p-1 text-tertiary hover:text-red-status transition-colors"
                              title="Remove material"
                              aria-label={`Remove material from step ${o.sequenceNumber}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'save'}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Save changes' : 'Create task list'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {filtered.map((tl) => {
            const isExpanded = expanded.has(tl.taskListId);
            const steps = tl.operations ?? [];
            const materialCount = steps.reduce((n, o) => n + (o.materials?.length ?? 0), 0);
            return (
              <div key={tl.taskListId} className="industrial-card rounded overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggle(tl.taskListId)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${tl.code}`}
                    className="flex items-center gap-3 text-left flex-1 hover:bg-surface-tertiary transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-tertiary flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-tertiary flex-shrink-0" />
                    )}
                    <ClipboardList className="w-4 h-4 text-amber flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary font-semibold">{tl.code}</span>
                        <span className="text-xs text-secondary truncate">{tl.description}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {tl.equipmentClass && (
                          <span className="text-[10px] text-tertiary">Class: {tl.equipmentClass}</span>
                        )}
                        {tl.equipmentId && (
                          <span className="text-[10px] text-tertiary">
                            Asset: {equipment.find((e) => e.equipmentId === tl.equipmentId)?.equipmentCode ?? tl.equipmentId}
                          </span>
                        )}
                        {!tl.equipmentClass && !tl.equipmentId && (
                          <span className="text-[10px] text-tertiary">Not tied to an asset or class</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                      <span className="text-tertiary text-xs">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
                      {materialCount > 0 && (
                        <span className="text-tertiary text-xs flex items-center gap-1">
                          <Package className="w-3 h-3" />{materialCount}
                        </span>
                      )}
                    </div>
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => openEdit(tl)}
                      disabled={busy === `load:${tl.taskListId}`}
                      className="p-1.5 text-tertiary hover:text-primary transition-colors disabled:opacity-50"
                      title="Edit task list"
                      aria-label={`Edit ${tl.code}`}
                    >
                      {busy === `load:${tl.taskListId}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Pencil className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(tl)}
                      disabled={busy === `del:${tl.taskListId}`}
                      className="p-1.5 text-tertiary hover:text-red-status transition-colors disabled:opacity-50"
                      title="Delete task list"
                      aria-label={`Delete ${tl.code}`}
                    >
                      {busy === `del:${tl.taskListId}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-subtle">
                    {steps.length === 0 ? (
                      <p className="text-tertiary text-xs px-4 py-4">
                        This template has no steps. A work order cannot be built from it.
                      </p>
                    ) : (
                      steps.map((o) => (
                        <div key={o.taskOperationId} className="px-4 py-3 border-b border-subtle last:border-b-0">
                          <div className="flex items-start gap-3">
                            <span className="font-mono text-xs text-tertiary w-6 flex-shrink-0">
                              {o.sequenceNumber}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-primary">{o.description}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded text-blue-status border border-blue-status/40 flex items-center gap-1">
                                  <Wrench className="w-2.5 h-2.5" />{craftName(o.craftId)}
                                </span>
                                <span className="text-[10px] text-tertiary">
                                  {o.plannedHours}h × {o.numberOfTechnicians} tech
                                </span>
                              </div>
                              {(o.materials?.length ?? 0) > 0 && (
                                <div className="mt-1.5 space-y-0.5">
                                  {o.materials!.map((m) => (
                                    <div key={m.taskListMaterialId} className="flex items-center gap-2 text-[11px]">
                                      <Package className="w-2.5 h-2.5 text-tertiary flex-shrink-0" />
                                      <span className="text-secondary truncate">{materialLabel(m.materialId)}</span>
                                      <span className="font-mono text-amber flex-shrink-0">
                                        ×{m.quantity}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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
