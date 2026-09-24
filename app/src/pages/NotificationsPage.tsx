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
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { notificationService } from '@/services/notificationService';
import { ApiError } from '@/lib/api';
import type { Notification, NotificationType, Priority } from '@/types';

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

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [page, setPage] = useState(0);

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

  return (
    <>
      <Header title="NOTIFICATIONS" showActions={false} />

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
        </div>

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