// ============================================================
// Master Command Header
// ============================================================

import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Plus, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole } from '@/lib/rbac';

interface HeaderProps {
  title: string;
  onCreate?: () => void;
  tabs?: { label: string; value: string; active: boolean; onClick: () => void }[];
  showActions?: boolean;
}

export default function Header({ title, onCreate, tabs, showActions = true }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useAppStore((s) => s.getUnreadAlertCount());
  const markAllAlertsRead = useAppStore((s) => s.markAllAlertsRead);
  // PUT /alerts/read-all is Requester+ on the API. The bell still opens the
  // notifications list for every role; only the mark-all-read call is gated.
  const role = useAuthStore((s) => s.user?.role);
  const canMarkAllRead = hasMinRole(role, 'Requester');

  const getBreadcrumb = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    return parts.map((p, i) => (
      <span key={i} className="flex items-center">
        {i > 0 && <ChevronRight className="w-3 h-3 mx-1 text-tertiary" />}
        <span className="text-secondary capitalize" style={{ fontSize: '11px' }}>
          {p.replace(/-/g, ' ')}
        </span>
      </span>
    ));
  };

  return (
    <div
      className="flex items-center justify-between px-5 h-14 border-b border-subtle flex-shrink-0 bg-surface"
    >
      {/* Left: Title & Breadcrumb */}
      <div className="flex flex-col justify-center">
        <h1 className="text-primary text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {getBreadcrumb() && (
          <div className="flex items-center mt-0.5">{getBreadcrumb()}</div>
        )}
      </div>

      {/* Center: Tabs */}
      {tabs && (
        <div className="flex items-center rounded overflow-hidden bg-surface-secondary">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={tab.onClick}
              className={`px-4 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                tab.active
                  ? 'text-primary bg-surface border-[var(--accent)]'
                  : 'text-tertiary border-transparent hover:text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Right: Actions */}
      {showActions && (
        <div className="flex items-center gap-2">
          {/* Alerts Bell */}
          <button
            onClick={() => {
              if (canMarkAllRead) markAllAlertsRead();
              navigate('/notifications');
            }}
            aria-label="Notifications"
            className="relative p-2 text-secondary hover:text-primary transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber text-2xs font-semibold flex items-center justify-center" style={{ color: 'var(--accent-ink)' }}>
                {unreadCount}
              </span>
            )}
          </button>

          {onCreate && (
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 px-4 h-control text-xs font-semibold rounded bg-amber transition-colors hover:bg-[var(--amber-600)]"
              style={{ color: 'var(--accent-ink)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
