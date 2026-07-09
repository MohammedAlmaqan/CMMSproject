// ============================================================
// Master Command Header
// ============================================================

import { useLocation } from 'react-router-dom';
import { Bell, Filter, Download, Plus, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

interface HeaderProps {
  title: string;
  onCreate?: () => void;
  tabs?: { label: string; value: string; active: boolean; onClick: () => void }[];
  showActions?: boolean;
}

export default function Header({ title, onCreate, tabs, showActions = true }: HeaderProps) {
  const location = useLocation();
  const unreadCount = useAppStore((s) => s.getUnreadAlertCount());

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
      className="flex items-center justify-between px-6 h-16 border-b border-subtle flex-shrink-0"
      style={{ backgroundColor: '#18181B' }}
    >
      {/* Left: Title & Breadcrumb */}
      <div className="flex flex-col justify-center">
        <h1
          className="text-primary font-bold tracking-tight"
          style={{ fontSize: '20px', letterSpacing: '-0.01em' }}
        >
          {title}
        </h1>
        {getBreadcrumb() && (
          <div className="flex items-center mt-0.5">{getBreadcrumb()}</div>
        )}
      </div>

      {/* Center: Tabs */}
      {tabs && (
        <div className="flex items-center rounded overflow-hidden" style={{ backgroundColor: '#111113' }}>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={tab.onClick}
              className={`px-4 py-1.5 text-xs font-medium transition-all ${
                tab.active
                  ? 'text-primary shadow-sm'
                  : 'text-tertiary hover:text-secondary'
              }`}
              style={
                tab.active
                  ? {
                      backgroundColor: '#27272A',
                      boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
                    }
                  : {}
              }
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
          <button className="relative p-2 text-secondary hover:text-primary transition-colors">
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber text-xs font-medium flex items-center justify-center" style={{ color: '#111113', fontSize: '9px' }}>
                {unreadCount}
              </span>
            )}
          </button>

          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-secondary border border-subtle rounded hover:border-highlight hover:text-primary transition-all">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>

          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-secondary border border-subtle rounded hover:border-highlight hover:text-primary transition-all">
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {onCreate && (
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded transition-all hover:brightness-110"
              style={{
                backgroundColor: '#D97706',
                color: '#111113',
                boxShadow: '0 0 15px rgba(217, 119, 6, 0.3)',
              }}
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
