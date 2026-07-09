// ============================================================
// Notifications Page — Inbox + Creation + Conversion
// ============================================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  AlertTriangle,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import type { NotificationType, Priority } from '@/types';

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
  const notifications = useAppStore((s) => s.notifications);
  const locations = useAppStore((s) => s.locations);
  const equipment = useAppStore((s) => s.equipment);
  const users = useAppStore((s) => s.users);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [page, setPage] = useState(0);

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

  const getLocationCode = (id: string) =>
    locations.find((l) => l.functionalLocationId === id)?.locationCode || id;
  const getEquipmentCode = (id: string | null) =>
    id ? equipment.find((e) => e.equipmentId === id)?.equipmentCode || id : '-';
  const getReporterName = (id: string) =>
    users.find((u) => u.userId === id)?.fullName || id;

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
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight transition-colors"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
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
            {filtered.length} notifications
          </span>
        </div>

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
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{getLocationCode(notif.functionalLocationId)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{getEquipmentCode(notif.equipmentId)}</td>
                    <td className="px-4 py-2.5 text-xs text-secondary">{getReporterName(notif.reportedByUserId)}</td>
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
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
