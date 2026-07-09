// ============================================================
// Notification Detail Page
// ============================================================

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
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import type { NotificationType } from '@/types';

const typeConfig: Record<NotificationType, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; label: string }> = {
  M1: { icon: AlertTriangle, color: '#DC2626', label: 'Malfunction Report' },
  M2: { icon: Wrench, color: '#2563EB', label: 'Maintenance Request' },
  M3: { icon: Bell, color: '#059669', label: 'Completion Confirmation' },
};

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notifications = useAppStore((s) => s.notifications);
  const locations = useAppStore((s) => s.locations);
  const equipment = useAppStore((s) => s.equipment);
  const users = useAppStore((s) => s.users);
  const workOrders = useAppStore((s) => s.workOrders);
  const convertNotificationToWO = useAppStore((s) => s.convertNotificationToWO);

  const notif = notifications.find((n) => n.notificationId === id);
  if (!notif) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Bell className="w-12 h-12 text-tertiary mx-auto mb-3" />
          <p className="text-secondary text-sm">Notification not found</p>
          <button onClick={() => navigate('/notifications')} className="text-amber text-xs mt-2 hover:underline">Back to Notifications</button>
        </div>
      </div>
    );
  }

  const typeCfg = typeConfig[notif.type];
  const TypeIcon = typeCfg.icon;
  const location = locations.find((l) => l.functionalLocationId === notif.functionalLocationId);
  const equip = equipment.find((e) => e.equipmentId === notif.equipmentId);
  const reporter = users.find((u) => u.userId === notif.reportedByUserId);
  const linkedWOs = workOrders.filter((w) => notif.workOrderIds.includes(w.workOrderId));

  const handleConvertToWO = () => {
    const wo = convertNotificationToWO(notif.notificationId);
    if (wo) {
      navigate(`/work-orders/${wo.workOrderId}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-subtle" style={{ backgroundColor: '#18181B' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/notifications')} className="p-1.5 text-secondary hover:text-primary transition-colors">
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
              </div>
            </div>
          </div>
          {notif.status !== 'Converted' && (
            <button
              onClick={handleConvertToWO}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Convert to WO
            </button>
          )}
        </div>
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

          <div className="industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-3">Description</h3>
            <p className="text-secondary text-sm leading-relaxed">{notif.description}</p>
          </div>
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
                {notif.status !== 'Converted' && (
                  <button
                    onClick={handleConvertToWO}
                    className="text-amber text-xs mt-2 hover:underline flex items-center gap-1 mx-auto"
                  >
                    Convert to WO <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {linkedWOs.map((wo) => (
                  <div
                    key={wo.workOrderId}
                    onClick={() => navigate(`/work-orders/${wo.workOrderId}`)}
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
                    <p className="text-primary text-xs">{wo.description}</p>
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
