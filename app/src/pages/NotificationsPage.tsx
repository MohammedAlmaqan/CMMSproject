// ============================================================
// Notifications Page — Inbox + Conversion
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  AlertTriangle,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Plus,
  X,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { notificationService } from '@/services/notificationService';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import type { Notification, NotificationInput, NotificationType, Priority } from '@/types';

const typeConfig: Record<NotificationType, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  M1: { icon: AlertTriangle, color: '#DC2626', label: 'Malfunction' },
  M2: { icon: Wrench, color: '#2563EB', label: 'Request' },
  M3: { icon: Bell, color: '#059669', label: 'Completion' },
};

const priorityClasses: Record<Priority, string> = {
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

const PAGE_SIZE = 8;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const equipment = useAppStore((s) => s.equipment);
  const locations = useAppStore((s) => s.locations);
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [page, setPage] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [formType, setFormType] = useState<NotificationType>('M1');
  const [formPriority, setFormPriority] = useState<Priority>('Medium');
  const [formLocationId, setFormLocationId] = useState('');
  const [formEquipmentId, setFormEquipmentId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDamages, setFormDamages] = useState('');
  const [formBreakdown, setFormBreakdown] = useState(false);

  // The API allows Requester and above to raise a notification; the screen
  // hides the control from roles the API would reject.
  const canWrite = hasPermission(['Requester', 'Technician', 'Maintenance Supervisor', 'Administrator']);

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
      const res = await notificationService.getAll({ take: 250 });
      setNotifications(res.data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    let data = [...notifications];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (n) =>
          n.notificationNumber.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'All') data = data.filter((n) => n.type === typeFilter);
    if (priorityFilter !== 'All') data = data.filter((n) => n.priority === priorityFilter);
    if (statusFilter !== 'All') data = data.filter((n) => n.status === statusFilter);
    data.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
    return data;
  }, [notifications, searchQuery, typeFilter, priorityFilter, statusFilter]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const resetForm = () => {
    setFormType('M1');
    setFormPriority('Medium');
    setFormLocationId('');
    setFormEquipmentId('');
    setFormDescription('');
    setFormDamages('');
    setFormBreakdown(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  // A fault against a machine already determines its location, and the API
  // rejects a location that contradicts the chosen equipment — so the location
  // follows the equipment rather than being a second, editable claim.
  const onEquipmentChange = (equipmentId: string) => {
    setFormEquipmentId(equipmentId);
    if (equipmentId) {
      const eq = equipment.find((e) => e.equipmentId === equipmentId);
      setFormLocationId(eq?.functionalLocationId ?? '');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formDescription.trim().length < 3) {
      notify('Description must be at least 3 characters', true);
      return;
    }
    if (!formLocationId && !formEquipmentId) {
      notify('Select a functional location or an equipment', true);
      return;
    }
    if (!user) {
      notify('No signed-in user to record as reporter', true);
      return;
    }

    const body: NotificationInput = {
      type: formType,
      priority: formPriority,
      description: formDescription.trim(),
      functionalLocationId: formLocationId || null,
      equipmentId: formEquipmentId || null,
      reportedByUserId: user.userId,
      damagesObservations: formDamages.trim() || null,
      breakdownFlag: formBreakdown,
    };

    setBusy(true);
    try {
      const created = await notificationService.create(body);
      notify(`Notification ${created.notificationNumber} raised`);
      setShowForm(false);
      resetForm();
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not raise the notification', true);
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
  const labelCls = 'block text-tertiary mb-1';

  return (
    <>
      <Header title="NOTIFICATIONS" showActions={false} />

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
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search notifications..."
              aria-label="Search notifications"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight transition-colors"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            aria-label="Filter by type"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Types</option>
            <option value="M1">M1 - Malfunction</option>
            <option value="M2">M2 - Request</option>
            <option value="M3">M3 - Completion</option>
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
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            aria-label="Filter by status"
            className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="All">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Process">In Process</option>
            <option value="Completed">Completed</option>
            <option value="Converted">Converted</option>
          </select>
          <span className="text-tertiary text-xs ml-auto">
            {loading ? 'Loading…' : `${filtered.length} notifications`}
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
              <Plus className="w-3.5 h-3.5" /> New Notification
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">New Notification</h2>
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
                <label className={labelCls} htmlFor="ntf-type">Type</label>
                <select id="ntf-type" value={formType} onChange={(e) => setFormType(e.target.value as NotificationType)} className={inputCls}>
                  <option value="M1">M1 — Malfunction</option>
                  <option value="M2">M2 — Request</option>
                  <option value="M3">M3 — Completion</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ntf-priority">Priority</label>
                <select id="ntf-priority" value={formPriority} onChange={(e) => setFormPriority(e.target.value as Priority)} className={inputCls}>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ntf-eq">Equipment (optional)</label>
                <select id="ntf-eq" value={formEquipmentId} onChange={(e) => onEquipmentChange(e.target.value)} className={inputCls}>
                  <option value="">No specific asset</option>
                  {equipment.map((eq) => (
                    <option key={eq.equipmentId} value={eq.equipmentId}>{eq.equipmentCode} — {eq.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ntf-loc">Functional Location</label>
                <select
                  id="ntf-loc"
                  value={formLocationId}
                  onChange={(e) => setFormLocationId(e.target.value)}
                  disabled={!!formEquipmentId}
                  className={`${inputCls} disabled:opacity-60`}
                >
                  <option value="">Select...</option>
                  {locations.map((l) => (
                    <option key={l.functionalLocationId} value={l.functionalLocationId}>{l.locationCode} — {l.description}</option>
                  ))}
                </select>
                {formEquipmentId && (
                  <p className="text-tertiary mt-1" style={{ fontSize: '10px' }}>Derived from the selected equipment.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className={labelCls} htmlFor="ntf-desc">Description</label>
                <input id="ntf-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="ntf-damages">Damages / Observations (optional)</label>
                <input id="ntf-damages" value={formDamages} onChange={(e) => setFormDamages(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input type="checkbox" checked={formBreakdown} onChange={(e) => setFormBreakdown(e.target.checked)} />
                Breakdown
              </label>
              <span className="text-tertiary text-xs">Reported by: {user?.fullName ?? '—'}</span>
            </div>

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
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Raise notification
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading notifications...</span>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <Bell className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">{loadError}</p>
              <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <Bell className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">No notifications match your filters</p>
            </div>
          </div>
        ) : (
          <>
            {/* Notification List */}
            <div className="industrial-card rounded overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {['Type', 'Priority', 'Number', 'Description', 'Location', 'Equipment', 'Reported By', 'Date', 'Status'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((notif, idx) => {
                    const typeCfg = typeConfig[notif.type];
                    const TypeIcon = typeCfg.icon;
                    return (
                      <tr
                        key={notif.notificationId}
                        className="border-t border-subtle cursor-pointer table-row-hover transition-colors"
                        style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                        onClick={() => navigate(`/notifications/${notif.notificationId}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            navigate(`/notifications/${notif.notificationId}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="w-4 h-4 flex-shrink-0" style={{ color: typeCfg.color }} />
                            <span className="text-xs text-primary">{typeCfg.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityClasses[notif.priority]}`}>
                            {notif.priority}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-amber">{notif.notificationNumber}</td>
                        <td className="px-4 py-2.5 text-xs text-primary max-w-[250px] truncate">{notif.description}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                          {notif.functionalLocation?.locationCode || notif.functionalLocationId}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                          {notif.equipment?.equipmentCode || (notif.equipmentId ? notif.equipmentId : '-')}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-secondary">{notif.reportedBy?.fullName || '-'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-secondary">{new Date(notif.createdDate).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            notif.status === 'Converted' ? 'badge-completed' :
                            notif.status === 'In Process' ? 'badge-in-progress' :
                            notif.status === 'Completed' ? 'badge-completed' : 'badge-open'
                          }`}>
                            {notif.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-tertiary text-xs">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
