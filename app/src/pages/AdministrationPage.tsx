// ============================================================
// Administration Page — Users, Roles, Audit Log, Settings
// ============================================================

import { useState } from 'react';
import {
  Users,
  Shield,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import Header from '@/components/layout/Header';

type AdminTab = 'users' | 'audit' | 'settings';

const PAGE_SIZE = 10;

export default function AdministrationPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const users = useAppStore((s) => s.users);
  const auditLog = useAppStore((s) => s.auditLog);
  const workCenters = useAppStore((s) => s.workCenters);

  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [userPage, setUserPage] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditFilter, setAuditFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const filteredAudit = auditLog.filter((a) => {
    if (!auditFilter) return true;
    const q = auditFilter.toLowerCase();
    return a.tableName.toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || a.userId.toLowerCase().includes(q);
  });

  const userPaged = filteredUsers.slice(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE);
  const userTotalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);

  const auditPaged = filteredAudit.slice(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE);
  const auditTotalPages = Math.ceil(filteredAudit.length / PAGE_SIZE);

  const tabs: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'audit', label: 'Audit Log', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <Header title="ADMINISTRATION" showActions={false} />
      <div className="flex-1 overflow-hidden flex">
        {/* Tab selector sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-subtle" style={{ backgroundColor: '#18181B' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs transition-all ${
                  activeTab === tab.id
                    ? 'text-amber border-r-2 border-amber'
                    : 'text-secondary hover:text-primary hover:bg-surface-tertiary'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
          <div className="border-t border-subtle mt-4 pt-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-amber flex items-center justify-center">
                <span className="text-xs font-semibold" style={{ color: '#111113' }}>{user?.fullName?.charAt(0) || 'U'}</span>
              </div>
              <div>
                <div className="text-primary text-xs font-medium">{user?.fullName}</div>
                <div className="text-tertiary" style={{ fontSize: '10px' }}>{user?.role}</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-red-status text-xs hover:underline"
            >
              <LogOut className="w-3 h-3" /> Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'users' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
                  <input
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(0); }}
                    placeholder="Search users..."
                    className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  />
                </div>
                <span className="text-tertiary text-xs ml-auto">{filteredUsers.length} users</span>
              </div>

              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Username', 'Full Name', 'Email', 'Role', 'Work Center', 'Status', 'Last Login'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {userPaged.map((u, idx) => {
                      const wc = workCenters.find((w) => w.workCenterId === u.workCenterId);
                      return (
                        <tr key={u.userId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                          <td className="px-4 py-2.5 font-mono text-xs text-primary">{u.username}</td>
                          <td className="px-4 py-2.5 text-xs text-primary font-medium">{u.fullName}</td>
                          <td className="px-4 py-2.5 text-xs text-secondary">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded badge-open">{u.role}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-secondary">{wc?.code || '-'}</td>
                          <td className="px-4 py-2.5">
                            {u.isActive ? (
                              <span className="flex items-center gap-1 text-green-status text-xs">
                                <CheckCircle className="w-3 h-3" /> Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-status text-xs">
                                <XCircle className="w-3 h-3" /> Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-tertiary text-xs">Showing {userPage * PAGE_SIZE + 1}-{Math.min((userPage + 1) * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setUserPage((p) => Math.max(0, p - 1))} disabled={userPage === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{userPage + 1} / {userTotalPages}</span>
                  <button onClick={() => setUserPage((p) => Math.min(userTotalPages - 1, p + 1))} disabled={userPage >= userTotalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
                  <input
                    value={auditFilter}
                    onChange={(e) => { setAuditFilter(e.target.value); setAuditPage(0); }}
                    placeholder="Filter audit log..."
                    className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  />
                </div>
                <span className="text-tertiary text-xs ml-auto">{filteredAudit.length} entries</span>
              </div>

              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Timestamp', 'Table', 'Action', 'Record ID', 'Field', 'Old Value', 'New Value', 'User', 'IP'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditPaged.map((entry, idx) => {
                      const actor = users.find((u) => u.userId === entry.userId);
                      return (
                        <tr key={entry.auditId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                          <td className="px-4 py-2 font-mono text-xs text-secondary">{new Date(entry.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-2 font-mono text-xs text-primary">{entry.tableName}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              entry.action === 'Create' ? 'badge-completed' :
                              entry.action === 'Update' ? 'badge-in-progress' : 'badge-cancelled'
                            }`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-secondary">{entry.recordId}</td>
                          <td className="px-4 py-2 font-mono text-xs text-tertiary">{entry.fieldName || '-'}</td>
                          <td className="px-4 py-2 text-xs text-red-status">{entry.oldValue || '-'}</td>
                          <td className="px-4 py-2 text-xs text-green-status">{entry.newValue || '-'}</td>
                          <td className="px-4 py-2 text-xs text-primary">{actor?.fullName || entry.userId}</td>
                          <td className="px-4 py-2 font-mono text-xs text-tertiary">{entry.ipAddress}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-tertiary text-xs">Showing {auditPage * PAGE_SIZE + 1}-{Math.min((auditPage + 1) * PAGE_SIZE, filteredAudit.length)} of {filteredAudit.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAuditPage((p) => Math.max(0, p - 1))} disabled={auditPage === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{auditPage + 1} / {auditTotalPages}</span>
                  <button onClick={() => setAuditPage((p) => Math.min(auditTotalPages - 1, p + 1))} disabled={auditPage >= auditTotalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-lg">
              <div className="industrial-card rounded p-4">
                <h3 className="text-primary text-sm font-semibold mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber" /> System Settings
                </h3>
                <div className="space-y-4">
                  <SettingItem label="WO Number Prefix" value="WO-" description="Prefix for auto-generated work order numbers" />
                  <SettingItem label="Notification Prefix" value="NOT-" description="Prefix for auto-generated notification numbers" />
                  <SettingItem label="Session Timeout" value="30 minutes" description="User session timeout for inactivity" />
                  <SettingItem label="PM Scheduler" value="Daily at 06:00" description="When the PM generation scheduler runs" />
                  <SettingItem label="Audit Log Retention" value="7 years" description="How long audit logs are retained" />
                  <SettingItem label="File Upload Limit" value="10 MB" description="Maximum file size for attachments" />
                  <SettingItem label="Password Policy" value="bcrypt + lockout" description="Account lockout after 5 failed attempts" />
                  <SettingItem label="Multi-language" value="English" description="Current system language" />
                </div>
              </div>

              <div className="industrial-card rounded p-4">
                <h3 className="text-primary text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber" /> RBAC Configuration
                </h3>
                <div className="space-y-2">
                  {[
                    { role: 'Administrator', desc: 'Full system access' },
                    { role: 'Maintenance Planner', desc: 'Create/plan WOs, manage PM plans' },
                    { role: 'Maintenance Supervisor', desc: 'Approve WOs, close WOs, run reports' },
                    { role: 'Technician', desc: 'Execute WOs, record labor/materials' },
                    { role: 'Requester', desc: 'Create notifications, view own requests' },
                    { role: 'View-Only', desc: 'Read access to all data and reports' },
                  ].map((r) => (
                    <div key={r.role} className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
                      <div>
                        <div className="text-primary text-xs font-medium">{r.role}</div>
                        <div className="text-tertiary" style={{ fontSize: '10px' }}>{r.desc}</div>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-tertiary" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SettingItem({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-subtle last:border-0">
      <div>
        <div className="text-primary text-xs font-medium">{label}</div>
        <div className="text-tertiary" style={{ fontSize: '10px' }}>{description}</div>
      </div>
      <span className="font-mono text-xs text-amber">{value}</span>
    </div>
  );
}
