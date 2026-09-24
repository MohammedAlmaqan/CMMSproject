// ============================================================
// Work Orders Page — List View + Board View + Full Management
// Live data from API (Milestone A)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  CalendarClock,
  CalendarCheck,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAuthStore } from '@/store/authStore';
import { workOrderService } from '@/services/workOrderService';
import { ApiError } from '@/lib/api';
import type { WorkOrder, ViewMode, WorkOrderStatus, Priority } from '@/types';

interface WorkOrderRow extends WorkOrder {
  functionalLocation?: { functionalLocationId: string; locationCode: string; description?: string };
  equipment?: { equipmentId: string; equipmentCode: string; name?: string } | null;
  workCenter?: { workCenterId: string; code: string; name?: string };
}

const statusBadges: Record<WorkOrderStatus, string> = {
  Draft: 'badge-open',
  Planned: 'badge-open',
  Scheduled: 'badge-in-progress',
  'In Progress': 'badge-in-progress',
  Suspended: 'badge-cancelled',
  Completed: 'badge-completed',
  Closed: 'badge-completed',
  Cancelled: 'badge-cancelled',
};

const statusColors: Record<WorkOrderStatus, string> = {
  Draft: '#D97706',
  Planned: '#D97706',
  Scheduled: '#2563EB',
  'In Progress': '#2563EB',
  Suspended: '#DC2626',
  Completed: '#059669',
  Closed: '#059669',
  Cancelled: '#92929B',
};

const priorityClasses: Record<Priority, string> = {
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

const PAGE_SIZE = 10;

const TRANSITIONS: Record<string, string[]> = {
  Draft: ['Planned', 'Cancelled'],
  Planned: ['Scheduled', 'Draft'],
  Scheduled: ['In Progress', 'Planned', 'Cancelled'],
  'In Progress': ['Completed', 'Suspended'],
  Suspended: ['In Progress', 'Cancelled'],
  Completed: ['Closed'],
  Closed: [],
  Cancelled: ['Draft'],
};

export default function WorkOrdersPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [sortField, setSortField] = useState<string>('woNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await workOrderService.getAll({ take: 250 });
      setWorkOrders((res.data || []) as WorkOrderRow[]);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load work orders');
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      const res = await workOrderService.getAll({ take: 250 });
      setWorkOrders((res.data || []) as WorkOrderRow[]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to refresh work orders');
    }
  }, []);

  const handleTransition = useCallback(
    async (wo: WorkOrderRow, newStatus: WorkOrderStatus) => {
      setActionError(null);
      setBusyIds((b) => ({ ...b, [wo.workOrderId]: true }));
      try {
        await workOrderService.transitionStatus(wo.workOrderId, newStatus);
        await refresh();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : `Failed to update status to ${newStatus}`
        );
      } finally {
        setBusyIds((b) => ({ ...b, [wo.workOrderId]: false }));
      }
    },
    [refresh]
  );

  const filtered = useMemo(() => {
    let data = [...workOrders];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (w) =>
          w.woNumber.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') {
      data = data.filter((w) => w.status === statusFilter);
    }
    if (priorityFilter !== 'All') {
      data = data.filter((w) => w.priority === priorityFilter);
    }
    data.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField] as string;
      const bVal = (b as unknown as Record<string, unknown>)[sortField] as string;
      return sortDir === 'asc' ? aVal?.localeCompare(bVal) : bVal?.localeCompare(aVal);
    });
    return data;
  }, [workOrders, searchQuery, statusFilter, priorityFilter, sortField, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const getEquipmentCode = (wo: WorkOrderRow) => wo.equipment?.equipmentCode || wo.equipmentId || '-';
  const getWorkCenterName = (wo: WorkOrderRow) => wo.workCenter?.code || wo.workCenterId;
  const getLocationCode = (wo: WorkOrderRow) => wo.functionalLocation?.locationCode || wo.functionalLocationId;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const canTransition = (wo: WorkOrderRow, newStatus: WorkOrderStatus) =>
    TRANSITIONS[wo.status]?.includes(newStatus);

  return (
    <>
      <Header
        title="WORK ORDERS"
        onCreate={() => navigate('/work-orders/new')}
        tabs={[
          { label: 'List View', value: 'list', active: viewMode === 'list', onClick: () => setViewMode('list') },
          { label: 'Board View', value: 'board', active: viewMode === 'board', onClick: () => setViewMode('board') },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {actionError && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded text-xs text-red-status border border-red-status/30"
            style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
            <AlertTriangle className="w-4 h-4" />
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading work orders...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <AlertTriangle className="w-8 h-8 text-red-status" />
            <p className="text-sm text-red-status">{loadError}</p>
            <button
              onClick={load}
              className="px-4 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search work orders..."
              aria-label="Search work orders"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight transition-colors"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            aria-label="Filter by status"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Statuses</option>
            {Object.keys(statusBadges).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }}
            aria-label="Filter by priority"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <span className="text-tertiary text-xs ml-auto">
            {filtered.length} work orders
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <p className="text-sm text-secondary">No work orders found</p>
            <button
              onClick={() => navigate('/work-orders/new')}
              className="px-4 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight transition-colors"
            >
              Create Work Order
            </button>
          </div>
        ) : viewMode === 'list' ? (
          <div className="industrial-card rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {[
                      { key: 'status', label: 'Status' },
                      { key: 'priority', label: 'Priority' },
                      { key: 'woNumber', label: 'WO Number' },
                      { key: 'description', label: 'Description' },
                      { key: 'equipmentId', label: 'Equipment' },
                      { key: 'type', label: 'Type' },
                      { key: 'plannedStart', label: 'Start Date' },
                      { key: 'status', label: 'Location' },
                      { key: '', label: 'Actions' },
                    ].map((col) => (
                      <th
                        key={col.key + col.label}
                        className="text-left px-4 py-2.5 font-medium cursor-pointer select-none"
                        style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92929B' }}
                        onClick={() => col.key && handleSort(col.key)}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && col.key) {
                            e.preventDefault();
                            handleSort(col.key);
                          }
                        }}
                        tabIndex={col.key ? 0 : undefined}
                        role={col.key ? 'button' : undefined}
                        aria-label={col.key ? `Sort by ${col.label}` : undefined}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {col.key && <ArrowUpDown className="w-3 h-3" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((wo, idx) => (
                    <tr
                      key={wo.workOrderId}
                      className="table-row-hover cursor-pointer transition-colors border-t border-subtle"
                      style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                      onClick={() => navigate(`/work-orders/${wo.workOrderId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          navigate(`/work-orders/${wo.workOrderId}`);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: statusColors[wo.status] }}
                          />
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadges[wo.status]}`}
                          >
                            {wo.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityClasses[wo.priority]}`}>
                          {wo.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-primary">{wo.woNumber}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-primary text-xs truncate max-w-[200px] block">
                          {wo.description}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-secondary">
                          {getEquipmentCode(wo)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{
                            color: wo.type === 'EM' ? '#DC2626' : wo.type === 'PM' ? '#2563EB' : '#A1A1AA',
                            backgroundColor: wo.type === 'EM' ? 'rgba(220,38,38,0.1)' : wo.type === 'PM' ? 'rgba(37,99,235,0.1)' : 'rgba(82,82,91,0.1)',
                          }}
                        >
                          {wo.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-secondary font-mono">
                          {wo.plannedStart ? new Date(wo.plannedStart).toLocaleDateString() : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-secondary">
                          {getWorkCenterName(wo)} · {getLocationCode(wo)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/work-orders/${wo.workOrderId}`); }}
                            className="p-1 text-tertiary hover:text-primary transition-colors"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {busyIds[wo.workOrderId] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-tertiary" />
                          ) : (
                            <>
                              {canTransition(wo, 'Planned') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Planned'); }}
                                  className="p-1 text-tertiary hover:text-amber transition-colors"
                                  title="Plan"
                                >
                                  <CalendarClock className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'Scheduled') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Scheduled'); }}
                                  className="p-1 text-tertiary hover:text-blue-status transition-colors"
                                  title="Schedule"
                                >
                                  <CalendarCheck className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'In Progress') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'In Progress'); }}
                                  className="p-1 text-tertiary hover:text-green-status transition-colors"
                                  title="Start"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'Completed') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Completed'); }}
                                  className="p-1 text-tertiary hover:text-green-status transition-colors"
                                  title="Complete"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'Suspended') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Suspended'); }}
                                  className="p-1 text-tertiary hover:text-amber transition-colors"
                                  title="Suspend"
                                >
                                  <Pause className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'Closed') && hasPermission(['Maintenance Supervisor', 'Administrator']) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Closed'); }}
                                  className="p-1 text-tertiary hover:text-primary transition-colors"
                                  title="Close"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canTransition(wo, 'Cancelled') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleTransition(wo, 'Cancelled'); }}
                                  className="p-1 text-tertiary hover:text-red-status transition-colors"
                                  title="Cancel"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-subtle">
              <span className="text-tertiary text-xs">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Previous page"
                  className="p-1 text-secondary hover:text-primary disabled:text-tertiary disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-secondary px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  aria-label="Next page"
                  className="p-1 text-secondary hover:text-primary disabled:text-tertiary disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {(['Draft', 'Planned', 'Scheduled', 'In Progress', 'Suspended', 'Completed', 'Closed', 'Cancelled'] as WorkOrderStatus[]).map(
              (status) => {
                const statusWos = filtered.filter((w) => w.status === status);
                return (
                  <div
                    key={status}
                    className="flex-shrink-0 w-64 industrial-card rounded"
                  >
                    <div
                      className="flex items-center justify-between px-3 py-2 rounded-t border-b border-subtle"
                      style={{ backgroundColor: '#27272A' }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: statusColors[status] }}
                        />
                        <span className="text-primary text-xs font-semibold">{status}</span>
                      </div>
                      <span className="text-tertiary text-xs">{statusWos.length}</span>
                    </div>
                    <div className="p-2 space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto">
                      {statusWos.map((wo) => (
                        <div
                          key={wo.workOrderId}
                          onClick={() => navigate(`/work-orders/${wo.workOrderId}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate(`/work-orders/${wo.workOrderId}`);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className="p-2.5 rounded cursor-pointer hover:bg-surface-tertiary transition-colors border border-subtle"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-amber">{wo.woNumber}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${priorityClasses[wo.priority]}`}>
                              {wo.priority}
                            </span>
                          </div>
                          <p className="text-primary text-xs mb-2 line-clamp-2">{wo.description}</p>
                          <div className="flex items-center justify-between text-tertiary" style={{ fontSize: '10px' }}>
                            <span>{getEquipmentCode(wo)}</span>
                            <span>{wo.type}</span>
                          </div>
                        </div>
                      ))}
                      {statusWos.length === 0 && (
                        <div className="text-center text-tertiary py-8 text-xs">No items</div>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
          </>
        )}
      </div>
    </>
  );
}