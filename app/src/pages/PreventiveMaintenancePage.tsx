// ============================================================
// Preventive Maintenance Page — Plans, Scheduling, Auto-Gen
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  Clock,
  Gauge,
  Play,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Settings,
  Loader2,
  RefreshCw,
  X,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { maintenancePlanService } from '@/services/maintenancePlanService';
import { equipmentMeterService } from '@/services/equipmentMeterService';
import { ApiError } from '@/lib/api';
import type {
  MaintenancePlan,
  MaintenancePlanInput,
  StrategyType,
  IntervalUnit,
  Priority,
  EquipmentMeter,
} from '@/types';

const PAGE_SIZE = 8;
const INTERVAL_UNITS: IntervalUnit[] = ['Days', 'Weeks', 'Months'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

/** One asset a plan covers, held as an exclusive kind + id while editing. */
interface DraftTarget {
  kind: 'equipment' | 'location';
  id: string;
}

/** One meter threshold on a plan (SOW 3.4.2). */
interface DraftMeter {
  meterId: string;
  meterInterval: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function PreventiveMaintenancePage() {
  const maintenancePlans = useAppStore((s) => s.maintenancePlans);
  const equipment = useAppStore((s) => s.equipment);
  const locations = useAppStore((s) => s.locations);
  const workCenters = useAppStore((s) => s.workCenters);
  const taskLists = useAppStore((s) => s.taskLists);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const loadFromApi = useAppStore((s) => s.loadFromApi);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  const [meters, setMeters] = useState<EquipmentMeter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [planCode, setPlanCode] = useState('');
  const [description, setDescription] = useState('');
  const [workCenterId, setWorkCenterId] = useState('');
  const [taskListId, setTaskListId] = useState('');
  const [strategyType, setStrategyType] = useState<StrategyType>('Time');
  const [intervalValue, setIntervalValue] = useState('1');
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('Months');
  const [callHorizonValue, setCallHorizonValue] = useState('7');
  const [callHorizonUnit, setCallHorizonUnit] = useState<'Days' | 'Units'>('Days');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [activeFlag, setActiveFlag] = useState(true);
  const [priority, setPriority] = useState<Priority>('Medium');
  const [generatedWorkOrderStatus, setGeneratedWorkOrderStatus] = useState<'Draft' | 'Planned'>('Draft');
  const [targets, setTargets] = useState<DraftTarget[]>([{ kind: 'equipment', id: '' }]);
  const [planMeters, setPlanMeters] = useState<DraftMeter[]>([]);

  // The API allows Requester and above to write plans; delete needs a
  // Supervisor. The screen hides controls the API would reject rather than
  // offering a button that always fails.
  const canWrite = hasPermission(['Requester', 'Technician', 'Maintenance Supervisor', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Administrator']);
  const canRunScheduler = hasPermission(['Administrator']);
  // POST /maintenance-plans/:id/generate-wo is Maintenance Planner+ on the API.
  const canGenerate = hasPermission(['Maintenance Planner', 'Administrator']);

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    // Meter thresholds need the meter list to pick from. A failure here only
    // empties the picker, so it must not take the whole page down.
    equipmentMeterService.getAll().then(setMeters).catch(() => setMeters([]));
  }, []);

  const filtered = useMemo(() => {
    let data = [...maintenancePlans];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (p) =>
          p.planCode.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }
    if (strategyFilter !== 'All') data = data.filter((p) => p.strategyType === strategyFilter);
    if (statusFilter !== 'All') {
      data = data.filter((p) =>
        statusFilter === 'Active' ? p.activeFlag : !p.activeFlag
      );
    }
    return data;
  }, [maintenancePlans, searchQuery, strategyFilter, statusFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const meterLabel = useCallback(
    (meterId: string) => {
      const m = meters.find((x) => x.meterId === meterId);
      if (!m) return meterId;
      const asset = m.equipment?.equipmentCode ? ` (${m.equipment.equipmentCode})` : '';
      return `${m.meterName}${asset} — ${m.unitOfMeasure}`;
    },
    [meters]
  );

  const resetForm = () => {
    setPlanCode('');
    setDescription('');
    setWorkCenterId(workCenters[0]?.workCenterId ?? '');
    setTaskListId('');
    setStrategyType('Time');
    setIntervalValue('1');
    setIntervalUnit('Months');
    setCallHorizonValue('7');
    setCallHorizonUnit('Days');
    setStartDate(today());
    setEndDate('');
    setActiveFlag(true);
    setPriority('Medium');
    setGeneratedWorkOrderStatus('Draft');
    setTargets([{ kind: 'equipment', id: '' }]);
    setPlanMeters([]);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (plan: MaintenancePlan) => {
    setEditingId(plan.planId);
    setPlanCode(plan.planCode);
    setDescription(plan.description);
    setWorkCenterId(plan.workCenterId);
    setTaskListId(plan.taskListId);
    setStrategyType(plan.strategyType);
    setIntervalValue(String(plan.intervalValue));
    setIntervalUnit(plan.intervalUnit);
    setCallHorizonValue(String(plan.callHorizonValue));
    setCallHorizonUnit(plan.callHorizonUnit);
    setStartDate(plan.startDate.slice(0, 10));
    setEndDate(plan.endDate ? plan.endDate.slice(0, 10) : '');
    setActiveFlag(plan.activeFlag);
    setPriority(plan.priority ?? 'Medium');
    setGeneratedWorkOrderStatus(plan.generatedWorkOrderStatus ?? 'Draft');
    const ts = plan.targets ?? [];
    setTargets(
      ts.length > 0
        ? ts.map((t) =>
            t.equipmentId
              ? { kind: 'equipment' as const, id: t.equipmentId }
              : { kind: 'location' as const, id: t.functionalLocationId ?? '' }
          )
        : plan.equipmentId
          ? [{ kind: 'equipment', id: plan.equipmentId }]
          : plan.functionalLocationId
            ? [{ kind: 'location', id: plan.functionalLocationId }]
            : [{ kind: 'equipment', id: '' }]
    );
    setPlanMeters(
      (plan.planMeters ?? []).map((m) => ({
        meterId: m.meterId,
        meterInterval: String(m.meterInterval),
      }))
    );
    setShowForm(true);
  };

  const handleGenerate = async (planId: string) => {
    setGeneratingId(planId);
    try {
      const wo = await maintenancePlanService.generateWorkOrder(planId);
      notify(`${wo.woNumber} generated`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to generate work order', true);
    } finally {
      setGeneratingId(null);
    }
  };

  const runScheduler = async () => {
    setRunningScheduler(true);
    try {
      const result = await maintenancePlanService.runScheduler();
      const n = result.wosCreated ?? 0;
      notify(
        n === 0 ? 'Scheduler ran — no work orders were due' : `Scheduler generated ${n} work order${n === 1 ? '' : 's'}`,
        (result.errors?.length ?? 0) > 0
      );
      await loadFromApi();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Scheduler run failed', true);
    } finally {
      setRunningScheduler(false);
    }
  };

  const setTarget = (index: number, patch: Partial<DraftTarget>) =>
    setTargets((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const addTarget = () => setTargets((prev) => [...prev, { kind: 'equipment', id: '' }]);

  const removeTarget = (index: number) =>
    setTargets((prev) => prev.filter((_, i) => i !== index));

  const setMeter = (index: number, patch: Partial<DraftMeter>) =>
    setPlanMeters((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const addMeter = () =>
    setPlanMeters((prev) => [...prev, { meterId: '', meterInterval: '1' }]);

  const removeMeter = (index: number) =>
    setPlanMeters((prev) => prev.filter((_, i) => i !== index));

  /** Local convenience checks; the API re-validates the same rules. */
  const validate = (): string | null => {
    if (!description.trim()) return 'Description is required';
    if (!workCenterId) return 'A work center is required';
    if (!taskListId) return 'A task list is required';
    const iv = Number(intervalValue);
    if (!Number.isInteger(iv) || iv <= 0) return 'Interval must be a positive whole number';
    if (!startDate) return 'A start date is required';
    if (endDate && Date.parse(endDate) < Date.parse(startDate)) {
      return 'The end date cannot be before the start date';
    }
    const usableTargets = targets.filter((t) => t.id);
    if (usableTargets.length === 0) return 'A plan must target at least one asset or location';
    const seenTargets = new Set<string>();
    for (const t of usableTargets) {
      const key = `${t.kind}:${t.id}`;
      if (seenTargets.has(key)) return 'The same target is listed more than once';
      seenTargets.add(key);
    }
    if (strategyType === 'Meter' || strategyType === 'Combined') {
      const usableMeters = planMeters.filter((m) => m.meterId);
      if (usableMeters.length === 0) {
        return `A ${strategyType.toLowerCase()} strategy needs at least one meter threshold`;
      }
      const seenMeters = new Set<string>();
      for (const m of usableMeters) {
        if (seenMeters.has(m.meterId)) return `${meterLabel(m.meterId)} is listed more than once`;
        seenMeters.add(m.meterId);
        if (!(Number(m.meterInterval) > 0)) return 'Meter intervals must be greater than zero';
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

    const usableTargets = targets.filter((t) => t.id);
    const body: MaintenancePlanInput = {
      ...(editingId ? {} : { planCode: planCode.trim() }),
      description: description.trim(),
      workCenterId,
      taskListId,
      strategyType,
      intervalValue: Number(intervalValue),
      intervalUnit,
      callHorizonValue: callHorizonValue === '' ? 0 : Number(callHorizonValue),
      callHorizonUnit,
      startDate,
      endDate: endDate || null,
      activeFlag,
      priority,
      generatedWorkOrderStatus,
      targets: usableTargets.map((t) =>
        t.kind === 'equipment'
          ? { equipmentId: t.id, functionalLocationId: null }
          : { equipmentId: null, functionalLocationId: t.id }
      ),
      // A Time plan carries no thresholds; sending the empty list on a switch
      // away from Meter clears any that were attached.
      planMeters:
        strategyType === 'Time'
          ? []
          : planMeters
              .filter((m) => m.meterId)
              .map((m) => ({ meterId: m.meterId, meterInterval: Number(m.meterInterval) })),
    };

    setBusy('save');
    try {
      if (editingId) {
        await maintenancePlanService.update(editingId, body);
        notify(`Plan ${planCode} updated`);
      } else {
        await maintenancePlanService.create(body);
        notify(`Plan ${body.planCode} created`);
      }
      setShowForm(false);
      resetForm();
      await loadFromApi();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Save failed', true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (plan: MaintenancePlan) => {
    setBusy(`del:${plan.planId}`);
    try {
      await maintenancePlanService.delete(plan.planId);
      notify(`Plan ${plan.planCode} deleted`);
      await loadFromApi();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const inputCls =
    'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
  const labelCls = 'block text-tertiary mb-1';
  const metersRequired = strategyType === 'Meter' || strategyType === 'Combined';

  return (
    <>
      <Header title="PREVENTIVE MAINTENANCE" showActions={false} />
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
        {/* Strategy Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <SummaryCard
            icon={<Clock className="w-5 h-5" />}
            label="Time-Based Plans"
            value={String(maintenancePlans.filter((p) => p.strategyType === 'Time').length)}
            color="#D97706"
          />
          <SummaryCard
            icon={<Gauge className="w-5 h-5" />}
            label="Meter-Based Plans"
            value={String(maintenancePlans.filter((p) => p.strategyType === 'Meter').length)}
            color="#2563EB"
          />
          <SummaryCard
            icon={<Zap className="w-5 h-5" />}
            label="Combined Plans"
            value={String(maintenancePlans.filter((p) => p.strategyType === 'Combined').length)}
            color="#7C3AED"
          />
          <SummaryCard
            icon={<Settings className="w-5 h-5" />}
            label="Active Plans"
            value={String(maintenancePlans.filter((p) => p.activeFlag).length)}
            color="#059669"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search maintenance plans..."
              aria-label="Search maintenance plans"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <select
            value={strategyFilter}
            onChange={(e) => { setStrategyFilter(e.target.value); setPage(0); }}
            aria-label="Filter by strategy"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Strategies</option>
            <option value="Time">Time-Based</option>
            <option value="Meter">Meter-Based</option>
            <option value="Combined">Combined</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            aria-label="Filter by status"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="text-tertiary text-xs ml-auto">{filtered.length} plans</span>
          {canRunScheduler && (
            <button
              onClick={runScheduler}
              disabled={runningScheduler}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-primary border border-subtle hover:border-highlight disabled:opacity-50"
            >
              {runningScheduler ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run Scheduler
            </button>
          )}
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              <Plus className="w-3.5 h-3.5" /> New Plan
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">
                {editingId ? 'Edit Maintenance Plan' : 'New Maintenance Plan'}
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
                <label className={labelCls} htmlFor="plan-code">Plan Code</label>
                <input
                  id="plan-code"
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value)}
                  disabled={!!editingId}
                  placeholder={editingId ? undefined : 'e.g. PM-PUMP-01'}
                  className={`${inputCls} disabled:opacity-60`}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="plan-desc">Description</label>
                <input id="plan-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-wc">Work Center</label>
                <select id="plan-wc" value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
                  {workCenters.map((w) => (
                    <option key={w.workCenterId} value={w.workCenterId}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="plan-tl">Task List</label>
                <select id="plan-tl" value={taskListId} onChange={(e) => setTaskListId(e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
                  {taskLists.map((t) => (
                    <option key={t.taskListId} value={t.taskListId}>{t.code} — {t.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-strategy">Strategy</label>
                <select id="plan-strategy" value={strategyType} onChange={(e) => setStrategyType(e.target.value as StrategyType)} className={inputCls}>
                  <option value="Time">Time</option>
                  <option value="Meter">Meter</option>
                  <option value="Combined">Combined</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-priority">Priority</label>
                <select id="plan-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-active">Status</label>
                <select id="plan-active" value={activeFlag ? 'true' : 'false'} onChange={(e) => setActiveFlag(e.target.value === 'true')} className={inputCls}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="plan-iv">Interval</label>
                <input id="plan-iv" type="number" min="1" step="1" value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-iu">Interval Unit</label>
                <select id="plan-iu" value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)} className={inputCls}>
                  {INTERVAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-chv">Call Horizon</label>
                <input id="plan-chv" type="number" min="0" step="1" value={callHorizonValue} onChange={(e) => setCallHorizonValue(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-chu">Horizon Unit</label>
                <select id="plan-chu" value={callHorizonUnit} onChange={(e) => setCallHorizonUnit(e.target.value as 'Days' | 'Units')} className={inputCls}>
                  <option value="Days">Days</option>
                  <option value="Units">Units</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="plan-start">Start Date</label>
                <input id="plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-end">End Date (optional)</label>
                <input id="plan-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-wo-status">Generated WO Status</label>
                <select id="plan-wo-status" value={generatedWorkOrderStatus} onChange={(e) => setGeneratedWorkOrderStatus(e.target.value as 'Draft' | 'Planned')} className={inputCls}>
                  <option value="Draft">Draft</option>
                  <option value="Planned">Planned</option>
                </select>
              </div>
            </div>

            {/* D-10: one plan may cover many assets. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-secondary text-xs font-semibold">Targets</h3>
                <button type="button" onClick={addTarget} className="flex items-center gap-1 text-xs text-amber hover:underline">
                  <Plus className="w-3 h-3" /> Add target
                </button>
              </div>
              {targets.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                  <div className="col-span-4">
                    <select
                      value={t.kind}
                      onChange={(e) => setTarget(i, { kind: e.target.value as DraftTarget['kind'], id: '' })}
                      aria-label={`Target ${i + 1} type`}
                      className={inputCls}
                    >
                      <option value="equipment">Equipment</option>
                      <option value="location">Functional Location</option>
                    </select>
                  </div>
                  <div className="col-span-7">
                    <select
                      value={t.id}
                      onChange={(e) => setTarget(i, { id: e.target.value })}
                      aria-label={`Target ${i + 1}`}
                      className={inputCls}
                    >
                      <option value="">Select...</option>
                      {t.kind === 'equipment'
                        ? equipment.map((eq) => (
                            <option key={eq.equipmentId} value={eq.equipmentId}>{eq.equipmentCode} — {eq.name}</option>
                          ))
                        : locations.map((l) => (
                            <option key={l.functionalLocationId} value={l.functionalLocationId}>{l.locationCode} — {l.description}</option>
                          ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeTarget(i)}
                      disabled={targets.length === 1}
                      className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                      title="Remove target"
                      aria-label={`Remove target ${i + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* SOW 3.4.2: meter thresholds, required for Meter/Combined. */}
            {metersRequired && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-secondary text-xs font-semibold">Meter Thresholds</h3>
                  <button type="button" onClick={addMeter} className="flex items-center gap-1 text-xs text-amber hover:underline">
                    <Plus className="w-3 h-3" /> Add meter
                  </button>
                </div>
                {planMeters.length === 0 && (
                  <p className="text-tertiary text-xs mb-2">A {strategyType.toLowerCase()} plan needs at least one meter threshold.</p>
                )}
                {planMeters.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <div className="col-span-8">
                      <select
                        value={m.meterId}
                        onChange={(e) => setMeter(i, { meterId: e.target.value })}
                        aria-label={`Meter ${i + 1}`}
                        className={inputCls}
                      >
                        <option value="">Select a meter...</option>
                        {meters.map((mt) => (
                          <option key={mt.meterId} value={mt.meterId}>{meterLabel(mt.meterId)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={m.meterInterval}
                        onChange={(e) => setMeter(i, { meterInterval: e.target.value })}
                        aria-label={`Meter ${i + 1} interval`}
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeMeter(i)}
                        className="p-1 text-tertiary hover:text-red-status transition-colors"
                        title="Remove meter"
                        aria-label={`Remove meter ${i + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
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
                {editingId ? 'Save changes' : 'Create plan'}
              </button>
            </div>
          </form>
        )}

        {/* Plans Table */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading maintenance plans...</span>
          </div>
        ) : storeError && !errorDismissed ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="max-w-md w-full mx-4">
              <div className="flex items-start justify-between gap-3 rounded border border-amber/50 bg-amber/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber" />
                  <p className="text-secondary text-sm">{storeError}</p>
                </div>
                <button onClick={() => setErrorDismissed(true)} aria-label="Dismiss error" className="text-tertiary hover:text-primary"><X className="w-4 h-4" /></button>
              </div>
              <button onClick={() => { setErrorDismissed(false); loadFromApi(); }} className="flex items-center gap-1 text-amber text-xs mt-2 hover:underline"><RefreshCw className="w-3 h-3" /> Retry</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <p className="text-secondary text-sm">No maintenance plans found</p>
            </div>
          </div>
        ) : (
        <div className="industrial-card rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: '#27272A' }}>
                {['Plan Code', 'Description', 'Target', 'Strategy', 'Interval', 'Call Horizon', 'Work Center', 'Task List', 'Status', 'Next Due', 'Generate', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((plan, idx) => {
                const wc = workCenters.find((w) => w.workCenterId === plan.workCenterId);
                const tl = taskLists.find((t) => t.taskListId === plan.taskListId);
                return (
                  <tr
                    key={plan.planId}
                    className="border-t border-subtle"
                    style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#151517' }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-amber">{plan.planCode}</td>
                    <td className="px-4 py-2.5 text-xs text-primary">{plan.description}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{targetLabel(plan, equipment, locations)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        plan.strategyType === 'Time' ? 'badge-open' :
                        plan.strategyType === 'Meter' ? 'badge-in-progress' : 'badge-completed'
                      }`}>
                        {plan.strategyType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-secondary">
                      Every {plan.intervalValue} {plan.intervalUnit}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-secondary">
                      {plan.callHorizonValue} {plan.callHorizonUnit}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{wc?.code || '-'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{tl?.code || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${plan.activeFlag ? 'badge-completed' : 'badge-cancelled'}`}>
                        {plan.activeFlag ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-secondary">{dueLabel(plan)}</td>
                    <td className="px-4 py-2.5">
                      {canGenerate && (
                        <button
                          onClick={() => handleGenerate(plan.planId)}
                          disabled={generatingId === plan.planId}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-primary border border-subtle hover:border-highlight disabled:opacity-50"
                        >
                          {generatingId === plan.planId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Generate WO
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <button
                            onClick={() => openEdit(plan)}
                            className="p-1.5 text-tertiary hover:text-primary transition-colors"
                            title="Edit plan"
                            aria-label={`Edit ${plan.planCode}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => remove(plan)}
                            disabled={busy === `del:${plan.planId}`}
                            className="p-1.5 text-tertiary hover:text-red-status transition-colors disabled:opacity-50"
                            title="Delete plan"
                            aria-label={`Delete ${plan.planCode}`}
                          >
                            {busy === `del:${plan.planId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-tertiary text-xs">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        )}
      </div>
    </>
  );
}

/** D-10: show the first covered asset plus a count when a plan covers many. */
function targetLabel(
  plan: MaintenancePlan,
  equipment: { equipmentId: string; equipmentCode: string }[],
  locations: { functionalLocationId: string; locationCode: string }[]
): string {
  const ts = plan.targets ?? [];
  if (ts.length > 0) {
    const first = ts[0];
    const code = first.equipment?.equipmentCode || first.functionalLocation?.locationCode;
    if (!code) {
      const eq = equipment.find((e) => e.equipmentId === first.equipmentId);
      const loc = locations.find((l) => l.functionalLocationId === first.functionalLocationId);
      return fallbackTarget(eq?.equipmentCode, loc?.locationCode, ts.length);
    }
    return ts.length > 1 ? `${code} +${ts.length - 1}` : code;
  }
  const eq = equipment.find((e) => e.equipmentId === plan.equipmentId);
  const loc = locations.find((l) => l.functionalLocationId === plan.functionalLocationId);
  return eq?.equipmentCode || loc?.locationCode || '-';
}

function fallbackTarget(
  equipmentCode: string | undefined,
  locationCode: string | undefined,
  count: number
): string {
  const code = equipmentCode || locationCode || '-';
  return count > 1 ? `${code} +${count - 1}` : code;
}

function dueLabel(plan: MaintenancePlan): string {
  if (plan.strategyType === 'Meter') {
    return `${plan.intervalValue} ${plan.callHorizonUnit === 'Units' ? 'units' : plan.intervalUnit}`;
  }
  const d = new Date(plan.startDate);
  const mult = plan.intervalUnit === 'Weeks' ? 7 : plan.intervalUnit === 'Months' ? 30 : 1;
  d.setDate(d.getDate() + plan.intervalValue * mult);
  return d.toISOString().slice(0, 10);
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="industrial-card rounded p-4 flex items-center gap-3">
      <div style={{ color }}>{icon}</div>
      <div>
        <div className="text-lg font-bold" style={{ color }}>{value}</div>
        <div className="text-tertiary" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  );
}
