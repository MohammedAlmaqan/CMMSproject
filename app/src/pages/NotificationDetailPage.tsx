// ============================================================
// Notification Detail Page
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Wrench,
  Bell,
  ClipboardList,
  ArrowRight,
  Calendar,
  User,
  MapPin,
  WrenchIcon,
  Loader2,
  Trash2,
  Pencil,
} from 'lucide-react';
import { notificationService } from '@/services/notificationService';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { hasMinRole } from '@/lib/rbac';
import type { Notification, NotificationType, Priority } from '@/types';

const typeConfig: Record<NotificationType, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  M1: { icon: AlertTriangle, color: '#F87171', label: 'Malfunction Report' },
  M2: { icon: Wrench, color: '#2563EB', label: 'Maintenance Request' },
  M3: { icon: Bell, color: '#059669', label: 'Completion Confirmation' },
};

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // POST /notifications/convert-to-wo is Maintenance Planner+ on the API.
  const role = useAuthStore((s) => s.user?.role);
  const canConvert = hasMinRole(role, 'Maintenance Planner');
  // PUT /notifications/:id is Requester+ on the API.
  const canEdit = hasMinRole(role, 'Requester');
  const locations = useAppStore((s) => s.locations);
  const equipmentList = useAppStore((s) => s.equipment);

  const [notif, setNotif] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // DELETE /notifications/:id is Maintenance Supervisor+ on the API.
  const canDelete = hasMinRole(role, 'Maintenance Supervisor');

  // G9: edit form state. Reuses the create field set (type, priority,
  // description, location, equipment, damages, breakdown).
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<NotificationType>('M1');
  const [editPriority, setEditPriority] = useState<Priority>('Medium');
  const [editDescription, setEditDescription] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [editEquipmentId, setEditEquipmentId] = useState('');
  const [editDamages, setEditDamages] = useState('');
  const [editBreakdown, setEditBreakdown] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const n = await notificationService.getById(id);
      setNotif(n);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load notification');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleConvertToWO = async () => {
    if (!notif) return;
    setActionError(null);
    setConverting(true);
    try {
      const wo = await notificationService.convertToWorkOrder(notif.notificationId, {});
      await reload();
      navigate(`/work-orders/${wo.workOrderId}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to convert to work order');
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!notif) return;
    if (!window.confirm(`Delete notification ${notif.notificationNumber}? This cannot be undone.`)) return;
    setActionError(null);
    setDeleting(true);
    try {
      await notificationService.delete(notif.notificationId);
      navigate('/notifications');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete notification');
      setDeleting(false);
    }
  };

  const openEdit = () => {
    if (!notif) return;
    setEditType(notif.type);
    setEditPriority(notif.priority);
    setEditDescription(notif.description);
    setEditLocationId(notif.functionalLocationId ?? '');
    setEditEquipmentId(notif.equipmentId ?? '');
    setEditDamages(notif.damagesObservations ?? '');
    setEditBreakdown(notif.breakdownFlag);
    setEditError(null);
    setEditOpen(true);
  };

  const onEditEquipmentChange = (equipmentId: string) => {
    setEditEquipmentId(equipmentId);
    if (equipmentId) {
      const eq = equipmentList.find((e) => e.equipmentId === equipmentId);
      if (eq?.functionalLocationId) setEditLocationId(eq.functionalLocationId);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notif) return;
    if (editDescription.trim().length < 3) {
      setEditError('Description must be at least 3 characters');
      return;
    }
    if (!editEquipmentId && !editLocationId) {
      setEditError('A functional location or an equipment must be selected');
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await notificationService.update(notif.notificationId, {
        type: editType,
        priority: editPriority,
        description: editDescription.trim(),
        functionalLocationId: editLocationId || undefined,
        equipmentId: editEquipmentId || null,
        damagesObservations: editDamages.trim() || null,
        breakdownFlag: editBreakdown,
      });
      setEditOpen(false);
      await reload();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setEditBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
        <span className="ml-3 text-sm text-tertiary">Loading notification...</span>
      </div>
    );
  }

  if (loadError || !notif) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Bell className="w-12 h-12 text-tertiary mx-auto mb-3" />
          <p className="text-secondary text-sm">{loadError || 'Notification not found'}</p>
          <button onClick={() => navigate('/notifications')} className="text-amber text-xs mt-2 hover:underline">Back to Notifications</button>
        </div>
      </div>
    );
  }

  const typeCfg = typeConfig[notif.type];
  const TypeIcon = typeCfg.icon;
  const location = notif.functionalLocation;
  const equip = notif.equipment;
  const reporter = notif.reportedBy;
  const linkedWOs = notif.workOrders?.map((w) => w.workOrder) || [];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-subtle" style={{ backgroundColor: '#18181B' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/notifications')} aria-label="Back to notifications" className="p-1.5 text-secondary hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <TypeIcon className="w-5 h-5" style={{ color: typeCfg.color }} />
                <span className="font-mono text-lg font-bold text-primary">{notif.notificationNumber}</span>
                <span className="text-xs px-2 py-0.5 rounded border" style={{ color: typeCfg.color, borderColor: `${typeCfg.color}50`, backgroundColor: `${typeCfg.color}10` }}>
                  {typeCfg.label}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  notif.priority === 'High' ? 'badge-high' : notif.priority === 'Medium' ? 'badge-medium' : 'badge-low'
                }`}>
                  {notif.priority}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  notif.status === 'Converted' ? 'badge-completed' : 'badge-open'
                }`}>
                  {notif.status}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notif.status !== 'Converted' && canEdit && !editOpen && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold border border-subtle text-secondary hover:text-primary hover:border-highlight transition-all"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            {notif.status !== 'Converted' && canConvert && (
              <button
                onClick={handleConvertToWO}
                disabled={converting}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {converting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardList className="w-3.5 h-3.5" />}
                Convert to WO
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold border border-red-status/60 text-red-status hover:bg-red-status/10 transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            )}
          </div>
        </div>
        {actionError && (
          <div className="mt-2 text-red-status text-xs">{actionError}</div>
        )}
      </div>

      {/* Breakdown Banner */}
      {notif.breakdownFlag && (
        <div className="breakdown-banner px-6 py-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-status" />
          <span className="text-sm font-semibold">BREAKDOWN REPORTED — Immediate action required</span>
        </div>
      )}

      {/* Detail Content */}
      <div className="grid grid-cols-2 gap-6 p-6">
        {/* Left: Main Details */}
        <div className="space-y-4">
          <div className="industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-3">Details</h3>
            <div className="space-y-3">
              <DetailRow icon={<MapPin className="w-4 h-4" />} label="Functional Location" value={location ? `${location.locationCode} — ${location.description}` : notif.functionalLocationId} />
              {equip && <DetailRow icon={<WrenchIcon className="w-4 h-4" />} label="Equipment" value={`${equip.equipmentCode} — ${equip.name}`} />}
              <DetailRow icon={<User className="w-4 h-4" />} label="Reported By" value={reporter?.fullName || notif.reportedByUserId} />
              <DetailRow icon={<Calendar className="w-4 h-4" />} label="Date & Time" value={new Date(notif.createdDate).toLocaleString()} />
              <DetailRow icon={<AlertTriangle className="w-4 h-4" />} label="Breakdown" value={notif.breakdownFlag ? 'Yes' : 'No'} highlight={notif.breakdownFlag} />
            </div>
          </div>

          {editOpen ? (
            <form onSubmit={saveEdit} aria-label="Edit notification" className="industrial-card rounded p-4 space-y-3">
              <h3 className="text-primary text-sm font-semibold">Edit Notification</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-secondary">
                  Type
                  <select
                    aria-label="Notification type"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as NotificationType)}
                    className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  >
                    <option value="M1">M1 — Malfunction</option>
                    <option value="M2">M2 — Request</option>
                    <option value="M3">M3 — Completion</option>
                  </select>
                </label>
                <label className="text-xs text-secondary">
                  Priority
                  <select
                    aria-label="Notification priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Priority)}
                    className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </label>
                <label className="text-xs text-secondary">
                  Equipment (optional)
                  <select
                    aria-label="Notification equipment"
                    value={editEquipmentId}
                    onChange={(e) => onEditEquipmentChange(e.target.value)}
                    className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight"
                    style={{ backgroundColor: '#27272A' }}
                  >
                    <option value="">No specific asset</option>
                    {equipmentList.map((eq) => (
                      <option key={eq.equipmentId} value={eq.equipmentId}>{eq.equipmentCode} — {eq.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-secondary">
                  Functional location
                  <select
                    aria-label="Notification functional location"
                    value={editLocationId}
                    onChange={(e) => setEditLocationId(e.target.value)}
                    disabled={!!editEquipmentId}
                    className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight disabled:opacity-60"
                    style={{ backgroundColor: '#27272A' }}
                  >
                    <option value="">Select…</option>
                    {locations.map((l) => (
                      <option key={l.functionalLocationId} value={l.functionalLocationId}>{l.locationCode} — {l.description}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-secondary">
                Description
                <input
                  aria-label="Notification description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight"
                  style={{ backgroundColor: '#27272A' }}
                />
              </label>
              <label className="block text-xs text-secondary">
                Damages / Observations (optional)
                <input
                  aria-label="Notification damages observations"
                  value={editDamages}
                  onChange={(e) => setEditDamages(e.target.value)}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-sm text-primary outline-none border border-subtle focus:border-highlight"
                  style={{ backgroundColor: '#27272A' }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={editBreakdown}
                  onChange={(e) => setEditBreakdown(e.target.checked)}
                  className="accent-amber"
                />
                Breakdown
              </label>
              {editError && (
                <div role="alert" className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{editError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={editBusy}
                  className="px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: '#D97706', color: '#111113' }}
                >
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="industrial-card rounded p-4">
              <h3 className="text-primary text-sm font-semibold mb-3">Description</h3>
              <p className="text-secondary text-sm leading-relaxed">{notif.description}</p>
            </div>
          )}

          {/* SOW 3.2.2: kept separate from the description on purpose. The
              description is the caller's report written at raise time; this is
              what somebody actually found at the asset. Shown only once it
              exists, because a notification is raised before anyone inspects. */}
          {notif.damagesObservations && (
            <div className="industrial-card rounded p-4 mt-3">
              <h3 className="text-primary text-sm font-semibold mb-3">Damages / Observations</h3>
              <p className="text-secondary text-sm leading-relaxed whitespace-pre-wrap">{notif.damagesObservations}</p>
            </div>
          )}
        </div>

        {/* Right: Linked Work Orders */}
        <div>
          <div className="industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-3">
              Linked Work Orders ({linkedWOs.length})
            </h3>
            {linkedWOs.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardList className="w-8 h-8 text-tertiary mx-auto mb-2" />
                <p className="text-tertiary text-xs">No work orders linked yet</p>
                {notif.status !== 'Converted' && canConvert && (
                  <button
                    onClick={handleConvertToWO}
                    disabled={converting}
                    className="text-amber text-xs mt-2 hover:underline flex items-center gap-1 mx-auto"
                  >
                    {converting ? 'Converting…' : 'Convert to WO'} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {linkedWOs.map((wo) => (
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
                    className="p-3 rounded border border-subtle cursor-pointer hover:bg-surface-tertiary transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-amber">{wo.woNumber}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        wo.status === 'In Progress' ? 'badge-in-progress' :
                        wo.status === 'Completed' || wo.status === 'Closed' ? 'badge-completed' : 'badge-open'
                      }`}>
                        {wo.status}
                      </span>
                    </div>
                    <p className="text-primary text-xs">{notif.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-tertiary mt-0.5">{icon}</div>
      <div>
        <div className="text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div className={`text-sm ${highlight ? 'text-red-status font-semibold' : 'text-primary'}`}>{value}</div>
      </div>
    </div>
  );
}