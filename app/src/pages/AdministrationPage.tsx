// ============================================================
// Administration Page — Users, Roles, Audit Log, Settings
// ============================================================

import { useState, useEffect } from 'react';
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
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { systemConfigService, type SystemSetting } from '@/services/systemConfigService';
import { userService } from '@/services/userService';
import type { User, UserRole, WorkCenter } from '@/types';
import Header from '@/components/layout/Header';

type AdminTab = 'users' | 'audit' | 'settings';

const PAGE_SIZE = 10;

const USER_ROLES: UserRole[] = [
  'View-Only',
  'Requester',
  'Technician',
  'Maintenance Supervisor',
  'Maintenance Planner',
  'Administrator',
];

export default function AdministrationPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const users = useAppStore((s) => s.users);
  const auditLog = useAppStore((s) => s.auditLog);
  const workCenters = useAppStore((s) => s.workCenters);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);

  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [userPage, setUserPage] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditFilter, setAuditFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Row 60: an Administrator can onboard a user and deactivate one from the UI.
  const addUser = useAppStore((s) => s.addUser);
  const removeUser = useAppStore((s) => s.removeUser);
  const [showUserForm, setShowUserForm] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState('');
  const [userActionError, setUserActionError] = useState('');

  // SOW 3.3.3 / 3.2.2: the number prefixes were rendered as fixed text, so the
  // setting looked configurable and was not. They are now loaded from the API
  // and saved back to it.
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [savedKey, setSavedKey] = useState('');

  useEffect(() => {
    if (activeTab !== 'settings') return;
    let cancelled = false;
    systemConfigService
      .getAll()
      .then((rows) => {
        if (!cancelled) setSettings(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setSettingsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const saveSetting = async (key: string, value: string) => {
    setSavingKey(key);
    setSettingsError('');
    setSavedKey('');
    try {
      const saved = await systemConfigService.update(key, value);
      setSettings((prev) =>
        prev.map((row) => (row.key === key ? { ...row, value: saved.value, isDefault: false } : row))
      );
      setSavedKey(key);
    } catch (err) {
      setSettingsError((err as Error).message);
    } finally {
      setSavingKey('');
    }
  };

  // Soft delete: the account is deactivated server-side and dropped from the
  // in-memory list here, so the row disappears without a full reload.
  const deactivateUser = async (id: string, name: string) => {
    if (!window.confirm(`Deactivate ${name}? They will no longer be able to sign in.`)) return;
    setDeactivatingId(id);
    setUserActionError('');
    try {
      await userService.remove(id);
      removeUser(id);
    } catch (err) {
      setUserActionError((err as Error).message);
    } finally {
      setDeactivatingId('');
    }
  };

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
          {loading && (
            <div className="mb-4 flex items-center gap-3 text-tertiary text-xs">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-tertiary border-t-transparent animate-spin" />
              Loading administration data...
            </div>
          )}
          {storeError && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              <span>{storeError}</span>
              <button onClick={() => useAppStore.getState().loadFromApi()} className="ml-2 underline hover:text-red-100">Retry</button>
            </div>
          )}
          {activeTab === 'users' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
                  <input
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(0); }}
                    placeholder="Search users..."
                    aria-label="Search users"
                    className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  />
                </div>
                <button
                  onClick={() => { setShowUserForm((v) => !v); setUserActionError(''); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-subtle text-primary hover:border-amber"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add User
                </button>
                <span className="text-tertiary text-xs ml-auto">{filteredUsers.length} users</span>
              </div>
              {userActionError && (
                <p className="mb-4 text-xs text-red-400" role="alert">{userActionError}</p>
              )}
              {showUserForm && (
                <UserForm
                  workCenters={workCenters}
                  onCancel={() => setShowUserForm(false)}
                  onCreated={(created) => { addUser(created); setShowUserForm(false); }}
                />
              )}
              {!loading && !storeError && users.length === 0 && (
                <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No users found in the system.</div>
              )}

              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Username', 'Full Name', 'Email', 'Role', 'Work Center', 'Status', 'Last Login', 'Actions'].map((h) => (
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
                          <td className="px-4 py-2.5">
                            {u.userId === user?.userId ? (
                              <span className="text-tertiary text-xs">You</span>
                            ) : (
                              <button
                                onClick={() => deactivateUser(u.userId, u.fullName)}
                                disabled={!u.isActive || deactivatingId === u.userId}
                                aria-label={`Deactivate ${u.fullName}`}
                                className="text-xs px-2 py-1 rounded border border-subtle text-red-status hover:border-red-status disabled:opacity-40 disabled:text-tertiary"
                              >
                                {deactivatingId === u.userId ? '...' : 'Deactivate'}
                              </button>
                            )}
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
                  <button onClick={() => setUserPage((p) => Math.max(0, p - 1))} disabled={userPage === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{userPage + 1} / {userTotalPages}</span>
                  <button onClick={() => setUserPage((p) => Math.min(userTotalPages - 1, p + 1))} disabled={userPage >= userTotalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
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
                    aria-label="Filter audit log"
                    className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  />
                </div>
                <span className="text-tertiary text-xs ml-auto">{filteredAudit.length} entries</span>
              </div>
              {!loading && !storeError && filteredAudit.length === 0 && (
                <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No audit log entries found.</div>
              )}

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
                  <button onClick={() => setAuditPage((p) => Math.max(0, p - 1))} disabled={auditPage === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{auditPage + 1} / {auditTotalPages}</span>
                  <button onClick={() => setAuditPage((p) => Math.min(auditTotalPages - 1, p + 1))} disabled={auditPage >= auditTotalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
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
                  {settingsError && (
                    <p className="text-xs text-red-400" role="alert">{settingsError}</p>
                  )}
                  {settings.map((setting) => (
                    <EditableSetting
                      key={setting.key}
                      setting={setting}
                      canEdit={user?.role === 'Administrator'}
                      saving={savingKey === setting.key}
                      saved={savedKey === setting.key}
                      onSave={(value) => saveSetting(setting.key, value)}
                    />
                  ))}
                  {settings.length === 0 && !settingsError && (
                    <p className="text-xs text-tertiary">Loading settings...</p>
                  )}
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

// An editable counterpart to SettingItem. The read-only SettingItem above is
// kept for the settings that are genuinely fixed in v1.0.0, so a fixed value is
// still visually distinct from one that can be changed.
function EditableSetting({
  setting,
  canEdit,
  saving,
  saved,
  onSave,
}: {
  setting: SystemSetting;
  canEdit: boolean;
  saving: boolean;
  saved: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(setting.value);
  const [touched, setTouched] = useState(false);

  // Re-sync when the saved value changes underneath us, so a save that the
  // server normalised is reflected instead of being overwritten on next edit.
  useEffect(() => {
    if (!touched) setDraft(setting.value);
  }, [setting.value, touched]);

  const dirty = touched && draft !== setting.value;
  const invalid = draft.trim() === '' || !/^[A-Za-z0-9_-]+$/.test(draft.trim());

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-subtle last:border-0">
      <div>
        <div className="text-primary text-xs font-medium">{setting.label}</div>
        <div className="text-tertiary" style={{ fontSize: '10px' }}>{setting.description}</div>
        {canEdit && invalid && touched && (
          <div className="text-red-400" style={{ fontSize: '10px' }}>
            Use letters, digits, hyphen or underscore only
          </div>
        )}
        {saved && !dirty && (
          <div className="text-green-500" style={{ fontSize: '10px' }}>Saved</div>
        )}
        {setting.isDefault && (
          <div className="text-tertiary" style={{ fontSize: '10px' }}>Using system default</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          maxLength={setting.maxLength}
          disabled={!canEdit}
          aria-label={setting.label}
          onChange={(e) => {
            setDraft(e.target.value);
            setTouched(true);
          }}
          className="industrial-input w-28 px-2 py-1 font-mono text-xs text-primary bg-surface border border-subtle rounded disabled:opacity-60"
        />
        {canEdit && (
          <button
            onClick={() => onSave(draft.trim())}
            disabled={!dirty || invalid || saving}
            className="text-xs px-2 py-1 rounded border border-subtle text-primary disabled:opacity-40 hover:border-amber"
          >
            {saving ? '...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

// Row 60: the create half of the admin user lifecycle. Kept as its own
// component so the page's list/search state is not re-rendered on every
// keystroke in the form.
function UserForm({
  workCenters,
  onCancel,
  onCreated,
}: {
  workCenters: WorkCenter[];
  onCancel: () => void;
  onCreated: (user: User) => void;
}) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    role: 'Technician' as UserRole,
    workCenterId: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await userService.create({
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        workCenterId: form.workCenterId || null,
      });
      onCreated(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="industrial-card rounded p-4 mb-4 space-y-3">
      <h3 className="text-primary text-sm font-semibold flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-amber" /> New User
      </h3>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Username
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            aria-label="New user username"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Full Name
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
            aria-label="New user full name"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            aria-label="New user email"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Temporary Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
            aria-label="New user password"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Role
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            aria-label="New user role"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Work Center
          <select
            value={form.workCenterId}
            onChange={(e) => setForm({ ...form, workCenterId: e.target.value })}
            aria-label="New user work center"
            className="px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="">Unassigned</option>
            {workCenters.map((wc) => (
              <option key={wc.workCenterId} value={wc.workCenterId}>{wc.code} — {wc.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-amber font-medium disabled:opacity-50"
          style={{ color: '#111113' }}
        >
          {submitting ? 'Creating...' : 'Create User'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-subtle text-secondary hover:text-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
