// ============================================================
// Work Order Detail Page — Full WO Lifecycle Management
// ============================================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle,
  Lock,
  XCircle,
  Clock,
  DollarSign,
  Package,
  Users,
  Wrench,
  Shield,
  MessageSquare,
  ClipboardList,
  FileText,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import type { WorkOrderStatus } from '@/types';

type DetailTab = 'operations' | 'materials' | 'labor' | 'services' | 'checklists' | 'comments' | 'history';

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workOrders = useAppStore((s) => s.workOrders);
  const locations = useAppStore((s) => s.locations);
  const equipment = useAppStore((s) => s.equipment);
  const workCenters = useAppStore((s) => s.workCenters);
  const crafts = useAppStore((s) => s.crafts);
  const materials = useAppStore((s) => s.materials);
  const users = useAppStore((s) => s.users);
  const transitionStatus = useAppStore((s) => s.transitionWorkOrderStatus);
  const getWorkOrderOperations = useAppStore((s) => s.getWorkOrderOperations);
  const getWorkOrderMaterials = useAppStore((s) => s.getWorkOrderMaterials);
  const getWorkOrderLabor = useAppStore((s) => s.getWorkOrderLabor);
  const getWorkOrderServices = useAppStore((s) => s.getWorkOrderServices);
  const getWorkOrderComments = useAppStore((s) => s.getWorkOrderComments);
  const auditLog = useAppStore((s) => s.auditLog);
  const woChecklists = useAppStore((s) => s.woChecklists);
  const checklistTemplates = useAppStore((s) => s.checklistTemplates);
  const checklistItems = useAppStore((s) => s.checklistItems);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [activeTab, setActiveTab] = useState<DetailTab>('operations');

  const wo = workOrders.find((w) => w.workOrderId === id);
  if (!wo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ClipboardList className="w-12 h-12 text-tertiary mx-auto mb-3" />
          <p className="text-secondary text-sm">Work Order not found</p>
          <button
            onClick={() => navigate('/work-orders')}
            className="text-amber text-xs mt-2 hover:underline"
          >
            Back to Work Orders
          </button>
        </div>
      </div>
    );
  }

  const operations = getWorkOrderOperations(wo.workOrderId);
  const woMaterials = getWorkOrderMaterials(wo.workOrderId);
  const labor = getWorkOrderLabor(wo.workOrderId);
  const services = getWorkOrderServices(wo.workOrderId);
  const comments = getWorkOrderComments(wo.workOrderId);
  const history = auditLog.filter((a) => a.recordId === wo.workOrderId);
  const checklists = woChecklists.filter((c) => c.workOrderId === wo.workOrderId);

  const locationName = locations.find((l) => l.functionalLocationId === wo.functionalLocationId);
  const equipmentItem = equipment.find((e) => e.equipmentId === wo.equipmentId);
  const workCenter = workCenters.find((w) => w.workCenterId === wo.workCenterId);
  const supervisor = users.find((u) => u.userId === wo.supervisorUserId);

  const canTransition = (newStatus: WorkOrderStatus) => {
    const transitions: Record<string, string[]> = {
      Draft: ['Planned', 'Cancelled'],
      Planned: ['Scheduled', 'Draft'],
      Scheduled: ['In Progress', 'Planned', 'Cancelled'],
      'In Progress': ['Completed', 'Suspended'],
      Suspended: ['In Progress', 'Cancelled'],
      Completed: ['Closed'],
      Closed: [],
      Cancelled: ['Draft'],
    };
    return transitions[wo.status]?.includes(newStatus);
  };

  const statusColor =
    wo.status === 'In Progress' ? '#2563EB' :
    wo.status === 'Completed' || wo.status === 'Closed' ? '#059669' :
    wo.status === 'Suspended' || wo.status === 'Cancelled' ? '#DC2626' : '#D97706';

  const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'operations', label: 'Operations', icon: Wrench, count: operations.length },
    { id: 'materials', label: 'Materials', icon: Package, count: woMaterials.length },
    { id: 'labor', label: 'Labor', icon: Users, count: labor.length },
    { id: 'services', label: 'Services', icon: DollarSign, count: services.length },
    { id: 'checklists', label: 'Checklists', icon: Shield, count: checklists.length },
    { id: 'comments', label: 'Comments', icon: MessageSquare, count: comments.length },
    { id: 'history', label: 'History', icon: FileText, count: history.length },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* WO Header */}
      <div className="px-6 py-4 border-b border-subtle" style={{ backgroundColor: '#18181B' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/work-orders')}
              className="p-1.5 text-secondary hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-primary">{wo.woNumber}</span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{
                    color: statusColor,
                    backgroundColor: `${statusColor}20`,
                    border: `1px solid ${statusColor}50`,
                  }}
                >
                  {wo.status}
                </span>
                {wo.breakdownFlag && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold text-red-status border border-red-status/50 bg-red-status/10">
                    BREAKDOWN
                  </span>
                )}
              </div>
              <p className="text-secondary text-sm mt-1">{wo.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canTransition('In Progress') && (
              <button
                onClick={() => transitionStatus(wo.workOrderId, 'In Progress')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-status border border-green-status/50 hover:bg-green-status/10 transition-all"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            )}
            {canTransition('Completed') && (
              <button
                onClick={() => transitionStatus(wo.workOrderId, 'Completed')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-status border border-green-status/50 hover:bg-green-status/10 transition-all"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Complete
              </button>
            )}
            {canTransition('Closed') && hasPermission(['Maintenance Supervisor', 'Administrator']) && (
              <button
                onClick={() => transitionStatus(wo.workOrderId, 'Closed')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-primary border border-subtle hover:bg-surface-tertiary transition-all"
              >
                <Lock className="w-3.5 h-3.5" /> Close
              </button>
            )}
            {canTransition('Suspended') && (
              <button
                onClick={() => transitionStatus(wo.workOrderId, 'Suspended')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
              >
                <Pause className="w-3.5 h-3.5" /> Suspend
              </button>
            )}
            {canTransition('Cancelled') && (
              <button
                onClick={() => transitionStatus(wo.workOrderId, 'Cancelled')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-red-status border border-red-status/50 hover:bg-red-status/10 transition-all"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* WO Info Cards */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-subtle">
        <InfoCard label="Type" value={wo.type} color={wo.type === 'EM' ? '#DC2626' : wo.type === 'PM' ? '#2563EB' : '#A1A1AA'} />
        <InfoCard label="Priority" value={wo.priority} color={wo.priority === 'High' ? '#DC2626' : wo.priority === 'Medium' ? '#D97706' : '#52525B'} />
        <InfoCard label="Location" value={locationName?.locationCode || '-'} />
        <InfoCard label="Equipment" value={equipmentItem?.equipmentCode || '-'} />
        <InfoCard label="Work Center" value={workCenter?.code || '-'} />
        <InfoCard label="Supervisor" value={supervisor?.fullName || '-'} />
        <InfoCard label="Planned Cost" value={`$${wo.plannedCost.toLocaleString()}`} color="#D97706" />
        <InfoCard label="Actual Cost" value={`$${wo.actualCost.toLocaleString()}`} color={wo.actualCost > wo.plannedCost ? '#DC2626' : '#059669'} />
        <InfoCard
          label="Planned Start"
          value={wo.plannedStart ? new Date(wo.plannedStart).toLocaleDateString() : '-'}
        />
        <InfoCard
          label="Planned Finish"
          value={wo.plannedFinish ? new Date(wo.plannedFinish).toLocaleDateString() : '-'}
        />
        <InfoCard label="Cost Center" value={wo.costCenterCode} />
        <InfoCard label="Internal Order" value={wo.internalOrder || '-'} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-subtle overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-primary border-amber'
                  : 'text-secondary border-transparent hover:text-primary hover:border-subtle'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-tertiary">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'operations' && (
          <div className="industrial-card rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#27272A' }}>
                  {['Seq', 'Description', 'Craft', 'Planned Hrs', 'Techs', 'Actual Hrs', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operations.map((op, idx) => {
                  const craft = crafts.find((c) => c.craftId === op.craftId);
                  return (
                    <tr key={op.operationId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{op.sequenceNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-primary">{op.description}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{craft?.craftCode || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{op.plannedHours}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{op.numberOfTechnicians}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{op.actualHours || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          op.status === 'Completed' ? 'badge-completed' :
                          op.status === 'In Progress' ? 'badge-in-progress' : 'badge-open'
                        }`}>
                          {op.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="industrial-card rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#27272A' }}>
                  {['Material Code', 'Description', 'Planned Qty', 'Actual Qty', 'Reserved', 'Unit Cost', 'Total'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {woMaterials.map((wm, idx) => {
                  const mat = materials.find((m) => m.materialId === wm.materialId);
                  return (
                    <tr key={wm.woMaterialId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{mat?.materialCode || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{mat?.description || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{wm.plannedQuantity}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{wm.actualQuantity || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-amber">{wm.reservationQuantity}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">${wm.unitCost}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">${(wm.actualQuantity * wm.unitCost).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'labor' && (
          <div className="industrial-card rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#27272A' }}>
                  {['Technician', 'Operation', 'Hours', 'Date/Time', 'Notes'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labor.map((l, idx) => {
                  const tech = users.find((u) => u.userId === l.userId);
                  const op = operations.find((o) => o.operationId === l.operationId);
                  return (
                    <tr key={l.laborEntryId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 text-xs text-primary">{tech?.fullName || l.userId}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{op?.description || '-'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{l.hoursWorked}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{new Date(l.entryDateTime).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{l.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="industrial-card rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#27272A' }}>
                  {['Vendor', 'Description', 'Cost', 'Invoice Ref'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((s, idx) => (
                  <tr key={s.serviceCostId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                    <td className="px-4 py-2.5 text-xs text-primary">{s.vendor}</td>
                    <td className="px-4 py-2.5 text-xs text-secondary">{s.description}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary">${s.cost.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">{s.invoiceRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'checklists' && (
          <div className="space-y-3">
            {checklists.map((cl) => {
              const template = checklistTemplates.find((t) => t.checklistTemplateId === cl.checklistTemplateId);
              const items = checklistItems.filter((i) => i.checklistTemplateId === cl.checklistTemplateId);
              const signedBy = users.find((u) => u.userId === cl.signedBy);
              return (
                <div key={cl.woChecklistId} className="industrial-card rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber" />
                      <span className="text-primary text-sm font-medium">{template?.name}</span>
                      {template?.isMandatory && (
                        <span className="text-red-status text-xs px-1.5 py-0.5 rounded border border-red-status/50">MANDATORY</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      cl.status === 'Completed' ? 'badge-completed' : 'badge-open'
                    }`}>
                      {cl.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.itemId} className="flex items-center gap-3 py-1">
                        <div className="w-4 h-4 rounded border border-subtle flex items-center justify-center" />
                        <span className="text-secondary text-xs">{item.description}</span>
                      </div>
                    ))}
                  </div>
                  {cl.signedBy && (
                    <div className="mt-3 pt-2 border-t border-subtle text-tertiary text-xs">
                      Signed by {signedBy?.fullName || cl.signedBy} on {new Date(cl.signedDate || '').toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-3">
            {comments.map((c) => {
              const user = users.find((u) => u.userId === c.userId);
              return (
                <div key={c.commentId} className="industrial-card rounded p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {(user?.fullName || c.userId).charAt(0)}
                      </span>
                    </div>
                    <span className="text-primary text-xs font-medium">{user?.fullName || c.userId}</span>
                    <span className="text-tertiary text-xs">{new Date(c.createdDate).toLocaleString()}</span>
                  </div>
                  <p className="text-secondary text-sm pl-8">{c.content}</p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="industrial-card rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#27272A' }}>
                  {['Timestamp', 'Action', 'Field', 'Old Value', 'New Value', 'User', 'IP'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => {
                  const user = users.find((u) => u.userId === h.userId);
                  return (
                    <tr key={h.auditId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{new Date(h.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          h.action === 'Create' ? 'badge-completed' : h.action === 'Update' ? 'badge-in-progress' : 'badge-cancelled'
                        }`}>
                          {h.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{h.fieldName || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-red-status">{h.oldValue || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-green-status">{h.newValue || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-primary">{user?.fullName || h.userId}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-tertiary">{h.ipAddress}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded border border-subtle" style={{ backgroundColor: '#1E1E22' }}>
      <div className="text-tertiary mb-1" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div className="text-sm font-medium truncate" style={{ color: color || '#FAFAFA' }}>
        {value}
      </div>
    </div>
  );
}
