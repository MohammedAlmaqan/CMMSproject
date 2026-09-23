// ============================================================
// Preventive Maintenance Page — Plans, Scheduling, Auto-Gen
// ============================================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Clock,
  Gauge,
  Calendar,
  Play,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Settings,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { maintenancePlanService } from '@/services/maintenancePlanService';
import { ApiError } from '@/lib/api';
import type { MaintenancePlan } from '@/types';

const PAGE_SIZE = 8;

export default function PreventiveMaintenancePage() {
  const navigate = useNavigate();
  const maintenancePlans = useAppStore((s) => s.maintenancePlans);
  const equipment = useAppStore((s) => s.equipment);
  const locations = useAppStore((s) => s.locations);
  const workCenters = useAppStore((s) => s.workCenters);
  const taskLists = useAppStore((s) => s.taskLists);

  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const loadFromApi = useAppStore((s) => s.loadFromApi);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleGenerate = async (planId: string) => {
    setGeneratingId(planId);
    try {
      const wo = await maintenancePlanService.generateWorkOrder(planId);
      setToast(`${wo.woNumber} generated`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Failed to generate work order');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <>
      <Header title="PREVENTIVE MAINTENANCE" showActions={false} />
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded border border-emerald-500/50 bg-emerald-500/10 px-4 py-2">
          <span className="text-xs text-primary">{toast}</span>
          <button onClick={() => setToast(null)} className="text-tertiary hover:text-primary"><X className="w-3.5 h-3.5" /></button>
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
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <select
            value={strategyFilter}
            onChange={(e) => { setStrategyFilter(e.target.value); setPage(0); }}
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
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="text-tertiary text-xs ml-auto">{filtered.length} plans</span>
        </div>

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
                <button onClick={() => setErrorDismissed(true)} className="text-tertiary hover:text-primary"><X className="w-4 h-4" /></button>
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
                {['Plan Code', 'Description', 'Equipment', 'Strategy', 'Interval', 'Call Horizon', 'Work Center', 'Task List', 'Status', 'Next Due', 'Generate'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((plan, idx) => {
                const eq = equipment.find((e) => e.equipmentId === plan.equipmentId);
                const loc = locations.find((l) => l.functionalLocationId === plan.functionalLocationId);
                const wc = workCenters.find((w) => w.workCenterId === plan.workCenterId);
                const tl = taskLists.find((t) => t.taskListId === plan.taskListId);
                return (
                  <tr
                    key={plan.planId}
                    className="border-t border-subtle"
                    style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-amber">{plan.planCode}</td>
                    <td className="px-4 py-2.5 text-xs text-primary">{plan.description}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                      {eq?.equipmentCode || loc?.locationCode || '-'}
                    </td>
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
                      <button
                        onClick={() => handleGenerate(plan.planId)}
                        disabled={generatingId === plan.planId}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-primary border border-subtle hover:border-highlight disabled:opacity-50"
                      >
                        {generatingId === plan.planId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Generate WO
                      </button>
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
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        )}
      </div>
    </>
  );
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
