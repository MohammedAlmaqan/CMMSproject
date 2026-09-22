// ============================================================
// Work Order Detail Page — Full WO Lifecycle Management
// Live data from API (Milestone A)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  CalendarCheck,
  Play,
  Pause,
  CheckCircle,
  Lock,
  XCircle,
  Trash2,
  Send,
  AlertTriangle,
  Loader2,
  DollarSign,
  Package,
  Users,
  Wrench,
  Shield,
  MessageSquare,
  ClipboardList,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { workOrderService } from '@/services/workOrderService';
import { laborService } from '@/services/laborService';
import { auditLogService } from '@/services/auditLogService';
import { commentService } from '@/services/commentService';
import { userService } from '@/services/userService';
import { ApiError } from '@/lib/api';
import type {
  WorkOrder,
  WorkOrderStatus,
  OperationStatus,
  AuditLogEntry,
  Comment,
  LaborEntry,
  User,
} from '@/types';

type DetailTab = 'operations' | 'materials' | 'labor' | 'services' | 'checklists' | 'comments' | 'history';

interface CraftRef { craftId: string; craftCode: string; craftName?: string; hourlyRate?: number }

interface OperationDetail {
  operationId: string;
  workOrderId: string;
  sequenceNumber: number;
  description: string;
  craftId: string | null;
  plannedHours: number;
  numberOfTechnicians: number;
  actualHours: number | null;
  status: OperationStatus;
  craft: CraftRef | null;
}

interface MaterialRef { materialId: string; materialCode: string; description?: string }

interface WoMaterialDetail {
  woMaterialId: string;
  workOrderId: string;
  materialId: string;
  plannedQuantity: number;
  actualQuantity: number;
  unitCost: number;
  reservationQuantity: number;
  material: MaterialRef | null;
}

interface ExternalServiceDetail {
  serviceCostId: string;
  workOrderId: string;
  vendor: string;
  description: string;
  cost: number;
  invoiceRef: string;
}

interface ChecklistItemRef { itemId: string; checklistTemplateId: string; sequenceNumber: number; description: string }

interface ChecklistItemDetail {
  woChecklistItemId: string;
  woChecklistId: string;
  itemId: string;
  response: string;
  comment?: string;
  item?: ChecklistItemRef;
}

interface ChecklistDetail {
  woChecklistId: string;
  workOrderId: string;
  checklistTemplateId: string;
  status: string;
  signedBy: string | null;
  signedDate: string | null;
  template?: { name?: string; description?: string; isMandatory?: boolean } | null;
  items?: ChecklistItemDetail[];
}

interface LaborEntryDetail extends LaborEntry {
  operation?: { operationId: string; description: string; sequenceNumber: number };
  user?: { userId: string; fullName: string; username: string };
}

interface WorkOrderDetail extends WorkOrder {
  functionalLocation?: { functionalLocationId: string; locationCode: string; description?: string } | null;
  equipment?: { equipmentId: string; equipmentCode: string; name?: string } | null;
  workCenter?: { workCenterId: string; code: string; name?: string } | null;
  supervisor?: { userId: string; fullName: string; username: string } | null;
  operations?: OperationDetail[];
  woMaterials?: WoMaterialDetail[];
  externalServices?: ExternalServiceDetail[];
  checklists?: ChecklistDetail[];
  comments?: Array<Comment & { user?: { userId: string; fullName: string } }>;
}

const TRANSITIONS: Record<string, string[]> = {
  Draft: ['Planned', 'Cancelled'],
  Planned: ['Scheduled', 'Draft'],
  Scheduled: ['In Progress', 'Planned', 'Cancelled'],
  'In Progress': ['Completed', 'Suspended'],
  Suspended: ['In Progress', 'Cancelled'],
  Completed: ['Closed'],
  Closed: [],
  Cancelled: ['Draft'],
};

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [activeTab, setActiveTab] = useState<DetailTab>('operations');
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [labor, setLabor] = useState<LaborEntryDetail[]>([]);
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [woData, laborData, auditData, usersData] = await Promise.all([
        workOrderService.getById(id!),
        laborService.getByWorkOrder(id!),
        auditLogService.getAll({ search: id!, take: 100 }),
        userService.getAll(),
      ]);
      setWo(woData as WorkOrderDetail);
      setLabor(laborData as LaborEntryDetail[]);
      setHistory((auditData?.data || []).filter((a) => a.recordId === id!));
      setUsers(usersData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) reload();
  }, [id, reload]);

  const refreshDetail = useCallback(async () => {
    try {
      const woData = await workOrderService.getById(id!);
      setWo(woData as WorkOrderDetail);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to refresh work order');
    }
  }, [id]);

  const performTransition = useCallback(
    async (newStatus: WorkOrderStatus) => {
      if (!wo) return;
      setActionError(null);
      setBusy(`transition:${newStatus}`);
      try {
        await workOrderService.transitionStatus(wo.workOrderId, newStatus);
        await refreshDetail();
        const auditData = await auditLogService.getAll({ search: id!, take: 100 });
        setHistory((auditData?.data || []).filter((a) => a.recordId === id!));
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : `Failed to update status to ${newStatus}`);
      } finally {
        setBusy(null);
      }
    },
    [wo, id, refreshDetail]
  );

  const handleDelete = useCallback(async () => {
    if (!wo) return;
    if (!window.confirm(`Delete work order ${wo.woNumber}? This cannot be undone.`)) return;
    setActionError(null);
    setBusy('delete');
    try {
      await workOrderService.delete(wo.workOrderId);
      navigate('/work-orders');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to delete work order');
      setBusy(null);
    }
  }, [wo, navigate]);

  const handleAddComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !newComment.trim()) return;
      setActionError(null);
      setBusy('comment:add');
      try {
        const created = await commentService.create({ entityType: 'WorkOrder', entityId: wo.workOrderId, content: newComment.trim() });
        setWo((prev) =>
          prev ? { ...prev, comments: [created, ...(prev.comments || [])] } : prev
        );
        setNewComment('');
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Failed to add comment');
      } finally {
        setBusy(null);
      }
    },
    [wo, newComment]
  );

  const handleDeleteComment = useCallback(
    async (comment: Comment) => {
      setActionError(null);
      setBusy(`comment:del:${comment.commentId}`);
      try {
        await commentService.delete(comment.commentId);
        setWo((prev) =>
          prev ? { ...prev, comments: (prev.comments || []).filter((c) => c.commentId !== comment.commentId) } : prev
        );
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Failed to delete comment');
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const canTransition = useCallback(
    (newStatus: WorkOrderStatus) => (wo ? TRANSITIONS[wo.status]?.includes(newStatus) : false),
    [wo]
  );

  const statusColor = useMemo(() => {
    if (!wo) return '#D97706';
    return wo.status === 'In Progress' ? '#2563EB'
      : wo.status === 'Completed' || wo.status === 'Closed' ? '#059669'
      : wo.status === 'Suspended' || wo.status === 'Cancelled' ? '#DC2626' : '#D97706';
  }, [wo]);

  const tabs = useMemo(() => {
    if (!wo) return [] as { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[];
    return [
      { id: 'operations', label: 'Operations', icon: Wrench, count: wo.operations?.length || 0 },
      { id: 'materials', label: 'Materials', icon: Package, count: wo.woMaterials?.length || 0 },
      { id: 'labor', label: 'Labor', icon: Users, count: labor.length },
      { id: 'services', label: 'Services', icon: DollarSign, count: wo.externalServices?.length || 0 },
      { id: 'checklists', label: 'Checklists', icon: Shield, count: wo.checklists?.length || 0 },
      { id: 'comments', label: 'Comments', icon: MessageSquare, count: wo.comments?.length || 0 },
      { id: 'history', label: 'History', icon: FileText, count: history.length },
    ];
  }, [wo, labor, history]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
        <span className="ml-3 text-sm text-tertiary">Loading work order...</span>
      </div>
    );
  }

  if (loadError || !wo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ClipboardList className="w-12 h-12 text-tertiary mx-auto mb-3" />
          <p className="text-secondary text-sm">{loadError || 'Work Order not found'}</p>
          <button
            onClick={() => (id ? reload() : navigate('/work-orders'))}
            className="text-amber text-xs mt-2 hover:underline"
          >
            {loadError ? 'Retry' : 'Back to Work Orders'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {actionError && (
        <div className="flex items-center gap-2 mx-6 mt-4 px-3 py-2 rounded text-xs text-red-status border border-red-status/30"
          style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
          <AlertTriangle className="w-4 h-4" />
          {actionError}
        </div>
      )}

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
            {busy?.startsWith('transition:') ? (
              <Loader2 className="w-4 h-4 animate-spin text-tertiary" />
            ) : (
              <>
                {canTransition('Planned') && (
                  <button
                    onClick={() => performTransition('Planned')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                  >
                    <CalendarClock className="w-3.5 h-3.5" /> Plan
                  </button>
                )}
                {canTransition('Scheduled') && (
                  <button
                    onClick={() => performTransition('Scheduled')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-blue-status border border-blue-status/50 hover:bg-blue-status/10 transition-all"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" /> Schedule
                  </button>
                )}
                {canTransition('In Progress') && (
                  <button
                    onClick={() => performTransition('In Progress')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-status border border-green-status/50 hover:bg-green-status/10 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" /> Start
                  </button>
                )}
                {canTransition('Completed') && (
                  <button
                    onClick={() => performTransition('Completed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-status border border-green-status/50 hover:bg-green-status/10 transition-all"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Complete
                  </button>
                )}
                {canTransition('Closed') && hasPermission(['Maintenance Supervisor', 'Administrator']) && (
                  <button
                    onClick={() => performTransition('Closed')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-primary border border-subtle hover:bg-surface-tertiary transition-all"
                  >
                    <Lock className="w-3.5 h-3.5" /> Close
                  </button>
                )}
                {canTransition('Suspended') && (
                  <button
                    onClick={() => performTransition('Suspended')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                  >
                    <Pause className="w-3.5 h-3.5" /> Suspend
                  </button>
                )}
                {canTransition('Cancelled') && (
                  <button
                    onClick={() => performTransition('Cancelled')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-red-status border border-red-status/50 hover:bg-red-status/10 transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
                {hasPermission(['Maintenance Supervisor', 'Administrator']) && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-red-status border border-red-status/50 hover:bg-red-status/10 transition-all"
                  >
                    {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* WO Info Cards */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-subtle">
        <InfoCard label="Type" value={wo.type} color={wo.type === 'EM' ? '#DC2626' : wo.type === 'PM' ? '#2563EB' : '#A1A1AA'} />
        <InfoCard label="Priority" value={wo.priority} color={wo.priority === 'High' ? '#DC2626' : wo.priority === 'Medium' ? '#D97706' : '#52525B'} />
        <InfoCard label="Location" value={wo.functionalLocation?.locationCode || '-'} />
        <InfoCard label="Equipment" value={wo.equipment?.equipmentCode || '-'} />
        <InfoCard label="Work Center" value={wo.workCenter?.code || '-'} />
        <InfoCard label="Supervisor" value={wo.supervisor?.fullName || '-'} />
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
            {(wo.operations?.length || 0) === 0 ? (
              <EmptyState label="No operations" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {['Seq', 'Description', 'Craft', 'Planned Hrs', 'Techs', 'Actual Hrs', 'Status'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wo.operations!.map((op, idx) => (
                    <tr key={op.operationId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{op.sequenceNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-primary">{op.description}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{op.craft?.craftCode || '-'}</td>
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
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="industrial-card rounded overflow-hidden">
            {(wo.woMaterials?.length || 0) === 0 ? (
              <EmptyState label="No materials" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {['Material Code', 'Description', 'Planned Qty', 'Actual Qty', 'Reserved', 'Unit Cost', 'Total'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wo.woMaterials!.map((wm, idx) => (
                    <tr key={wm.woMaterialId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{wm.material?.materialCode || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{wm.material?.description || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{wm.plannedQuantity}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{wm.actualQuantity || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-amber">{wm.reservationQuantity}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">${wm.unitCost}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">${(wm.actualQuantity * wm.unitCost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'labor' && (
          <div className="industrial-card rounded overflow-hidden">
            {labor.length === 0 ? (
              <EmptyState label="No labor entries" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {['Technician', 'Operation', 'Hours', 'Date/Time', 'Notes'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labor.map((l, idx) => (
                    <tr key={l.laborEntryId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 text-xs text-primary">{l.user?.fullName || l.userId}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{l.operation?.description || '-'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{l.hoursWorked}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{new Date(l.entryDateTime).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{l.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div className="industrial-card rounded overflow-hidden">
            {(wo.externalServices?.length || 0) === 0 ? (
              <EmptyState label="No external services" />
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: '#27272A' }}>
                    {['Vendor', 'Description', 'Cost', 'Invoice Ref'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wo.externalServices!.map((s, idx) => (
                    <tr key={s.serviceCostId} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                      <td className="px-4 py-2.5 text-xs text-primary">{s.vendor}</td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{s.description}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">${s.cost.toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-secondary">{s.invoiceRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'checklists' && (
          <div className="space-y-3">
            {(wo.checklists?.length || 0) === 0 ? (
              <EmptyState label="No checklists" />
            ) : (
              wo.checklists!.map((cl) => {
                const template = cl.template;
                const signedByUser = users.find((u) => u.userId === cl.signedBy);
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
                      {(cl.items || []).map((ci) => (
                        <div key={ci.item?.itemId || ci.woChecklistItemId} className="flex items-center gap-3 py-1">
                          <div className="w-4 h-4 rounded border border-subtle flex items-center justify-center" />
                          <span className="text-secondary text-xs">{ci.item?.description || '-'}</span>
                        </div>
                      ))}
                    </div>
                    {cl.signedBy && (
                      <div className="mt-3 pt-2 border-t border-subtle text-tertiary text-xs">
                        Signed by {signedByUser?.fullName || cl.signedBy} on {cl.signedDate ? new Date(cl.signedDate).toLocaleString() : '-'}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-3">
            <form onSubmit={handleAddComment} className="flex items-center gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight transition-colors"
                style={{ backgroundColor: '#27272A' }}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || busy === 'comment:add'}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {busy === 'comment:add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Post
              </button>
            </form>
            {(wo.comments?.length || 0) === 0 ? (
              <EmptyState label="No comments yet" />
            ) : (
              wo.comments!.map((c) => {
                const isOwn = currentUser?.userId === c.userId || currentUser?.role === 'Administrator';
                return (
                  <div key={c.commentId} className="industrial-card rounded p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {(c.user?.fullName || c.userId || '?').charAt(0)}
                        </span>
                      </div>
                      <span className="text-primary text-xs font-medium">{c.user?.fullName || c.userId}</span>
                      <span className="text-tertiary text-xs">{new Date(c.createdDate).toLocaleString()}</span>
                      {isOwn && (
                        <button
                          onClick={() => handleDeleteComment(c)}
                          className="ml-auto p-1 text-tertiary hover:text-red-status transition-colors"
                          title="Delete comment"
                        >
                          {busy === `comment:del:${c.commentId}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-secondary text-sm pl-8">{c.content}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="industrial-card rounded overflow-hidden">
            {history.length === 0 ? (
              <EmptyState label="No history entries" />
            ) : (
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
            )}
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <span className="text-sm text-tertiary">{label}</span>
    </div>
  );
}