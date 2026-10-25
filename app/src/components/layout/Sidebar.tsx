// ============================================================
// Tactical Sidebar Navigation
// ============================================================

import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Bell,
  Layers,
  Wrench,
  Package,
  BarChart3,
  Shield,
  Search,
  Hexagon,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  CalendarClock,
  HardHat,
  Tags,
  ListChecks,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole, routeFloor } from '@/lib/rbac';
import { useState } from 'react';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';

interface SidebarProps {
  onOpenCommandPalette: () => void;
}

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Work Orders', icon: ClipboardList, path: '/work-orders' },
  { name: 'Preventive Maintenance', icon: CalendarClock, path: '/preventive-maintenance' },
  { name: 'Notifications', icon: Bell, path: '/notifications' },
  { name: 'Locations', icon: Layers, path: '/locations' },
  { name: 'Equipment', icon: Wrench, path: '/equipment' },
  { name: 'Work Centers', icon: Briefcase, path: '/work-centers' },
  { name: 'Crafts', icon: HardHat, path: '/crafts' },
  { name: 'Task Lists', icon: ClipboardList, path: '/task-lists' },
  { name: 'Materials', icon: Package, path: '/materials' },
  { name: 'Code Lists', icon: Tags, path: '/code-lists' },
  { name: 'Safety Checklists', icon: ListChecks, path: '/safety-checklists' },
  { name: 'Reports', icon: BarChart3, path: '/reports' },
  { name: 'Administration', icon: Shield, path: '/administration' },
];

export default function Sidebar({ onOpenCommandPalette }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [collapsed, setCollapsed] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <div
      className={`h-screen flex flex-col border-r border-subtle transition-all duration-200 relative ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{ backgroundColor: '#18181B' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-subtle">
        <div className="flex items-center justify-center w-8 h-8 rounded">
          <Hexagon className="w-7 h-7 text-amber flex-shrink-0" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-primary font-semibold text-sm tracking-tight whitespace-nowrap">
              CommandPulse
            </div>
            <div
              className="text-tertiary font-medium whitespace-nowrap"
              style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              MAINTENANCE
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navigation
          .filter((item) => hasMinRole(user?.role, routeFloor(item.path)))
          .map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 ${
                isActive
                  ? 'nav-active'
                  : 'text-secondary hover:text-primary hover:bg-surface-tertiary'
              } ${collapsed ? 'justify-center' : ''}`}
              aria-label={item.name}
              title={collapsed ? item.name : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.5} />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </button>
          );
        })}
      </nav>

      {/* Command Palette Button */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenCommandPalette}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs text-secondary border border-subtle hover:border-highlight hover:text-primary transition-all ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && (
            <>
              <span>Command</span>
              <kbd className="ml-auto text-tertiary" style={{ fontSize: '10px' }}>
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* User Profile */}
      <div className="px-3 py-3 border-t border-subtle">
        {/* Display only. This used to be a button that navigated to
            /administration for every role; the route floor is Administrator, so
            five of the six roles clicked their own name and were silently
            redirected to /dashboard. The Administration page is already in the
            navigation list above, filtered by the same floor, so identity here
            needs no target at all. */}
        <div
          className={`w-full flex items-center gap-2 px-2 py-2 rounded ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#D97706' }}>
            <span className="text-xs font-semibold" style={{ color: '#111113' }}>
              {user?.fullName?.charAt(0) || 'U'}
            </span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden text-left">
              <div className="text-primary text-xs font-medium truncate">
                {user?.fullName || 'User'}
              </div>
              <div className="text-tertiary truncate" style={{ fontSize: '10px' }}>
                {user?.role || 'Technician'}
              </div>
            </div>
          )}
        </div>

        {/* Self-service credential rotation (G2). Available to every role;
            the API accepts a self-change with currentPassword for any caller. */}
        <button
          onClick={() => setPasswordOpen(true)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 mt-1 rounded text-xs text-secondary hover:text-primary hover:bg-surface-tertiary transition-all ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label="Change password"
          title={collapsed ? 'Change password' : undefined}
        >
          <KeyRound className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Change password</span>}
        </button>

        {/* Sign out lives in the global chrome, for every role. Before this it
            existed only on AdministrationPage, which is Administrator-only, so
            Technician, Requester, Supervisor and Planner had no in-app way to
            end a session short of closing the browser. */}
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 mt-0.5 rounded text-xs text-secondary hover:text-primary hover:bg-surface-tertiary transition-all ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label="Sign out"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Sign out</span>}
        </button>

        {user && (
          <ChangePasswordDialog
            userId={user.userId}
            open={passwordOpen}
            onClose={() => setPasswordOpen(false)}
          />
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center text-secondary hover:text-primary transition-all z-50"
        style={{ backgroundColor: '#27272A', border: '1px solid #27272A' }}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
