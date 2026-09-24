// ============================================================
// Work Order Detail Page — Full WO Lifecycle Management
// Live data from API (Milestone A) + sub-domain CRUD (Milestone B)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Paperclip,
  Upload,
  Download,
  Pencil,
  Plus,
  Check,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { workOrderService } from '@/services/workOrderService';
import { workOrderOperationService } from '@/services/workOrderOperationService';
import { workOrderMaterialService } from '@/services/workOrderMaterialService';
import { laborService } from '@/services/laborService';
import { externalServiceService } from '@/services/externalServiceService';
import { safetyChecklistService } from '@/services/safetyChecklistService';
import { auditLogService } from '@/services/auditLogService';
import { commentService } from '@/services/commentService';
import { attachmentService } from '@/services/attachmentService';
import { userService } from '@/services/userService';
import { craftService } from '@/services/craftService';
import { materialService } from '@/services/materialService';
import { ApiError } from '@/lib/api';
import type {
  WorkOrder,
  WorkOrderStatus,
  OperationStatus,
  AuditLogEntry,
  Comment,
  LaborEntry,
  User,
  Craft,
  Material,
  SafetyChecklistTemplate,
  Attachment,
} from '@/types';

type DetailTab = 'operations' | 'materials' | 'labor' | 'services' | 'checklists' | 'comments' | 'attachments' | 'history';

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

const inputCls =
  'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
const selectCls = inputCls;
const thCls =
  'text-left px-4 py-2.5 font-medium text-tertiary truncate';
const tdCls = 'px-4 py-2.5';
const rowBg = (idx: number) => (idx % 2 === 0 ? '#1E1E22' : '#111113');

interface OpFormState {
  description: string;
  craftId: string;
  plannedHours: string;
  numberOfTechnicians: string;
}
const emptyOpForm: OpFormState = { description: '', craftId: '', plannedHours: '0', numberOfTechnicians: '1' };

interface MatFormState {
  materialId: string;
  plannedQuantity: string;
  actualQuantity: string;
  unitCost: string;
}
const emptyMatForm: MatFormState = { materialId: '', plannedQuantity: '1', actualQuantity: '', unitCost: '' };

interface LaborFormState {
  operationId: string;
  userId: string;
  hoursWorked: string;
  notes: string;
}
const emptyLaborForm: LaborFormState = { operationId: '', userId: '', hoursWorked: '1', notes: '' };

interface SvcFormState {
  vendor: string;
  description: string;
  cost: string;
  invoiceRef: string;
}
const emptySvcForm: SvcFormState = { vendor: '', description: '', cost: '', invoiceRef: '' };

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
  const [crafts, setCrafts] = useState<Craft[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [templates, setTemplates] = useState<SafetyChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');

  const [opAdding, setOpAdding] = useState(false);
  const [opForm, setOpForm] = useState<OpFormState>(emptyOpForm);
  const [editingOpId, setEditingOpId] = useState<string | null>(null);
  const [editOpForm, setEditOpForm] = useState<OpFormState>(emptyOpForm);

  const [matAdding, setMatAdding] = useState(false);
  const [matForm, setMatForm] = useState<MatFormState>(emptyMatForm);
  const [editingMatId, setEditingMatId] = useState<string | null>(null);
  const [editMatForm, setEditMatForm] = useState<MatFormState>(emptyMatForm);

  const [laborAdding, setLaborAdding] = useState(false);
  const [laborForm, setLaborForm] = useState<LaborFormState>(emptyLaborForm);
  const [editingLaborId, setEditingLaborId] = useState<string | null>(null);
  const [editLaborForm, setEditLaborForm] = useState<LaborFormState>(emptyLaborForm);

  const [svcAdding, setSvcAdding] = useState(false);
  const [svcForm, setSvcForm] = useState<SvcFormState>(emptySvcForm);
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null);
  const [editSvcForm, setEditSvcForm] = useState<SvcFormState>(emptySvcForm);

  const [attachTemplateId, setAttachTemplateId] = useState('');

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attBusy, setAttBusy] = useState<string | null>(null);
  const [attError, setAttError] = useState<string | null>(null);
  const [attSuccess, setAttSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canDeleteAttachments = hasPermission(['Maintenance Supervisor', 'Administrator']);

  const canEdit = useMemo(
    () => hasPermission(['Technician', 'Maintenance Supervisor', 'Maintenance Planner', 'Administrator']),
    [hasPermission]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [woData, laborData, auditData, usersData, craftsData, materialsData, templatesData, attachmentsData] = await Promise.all([
        workOrderService.getById(id!),
        laborService.getByWorkOrder(id!),
        auditLogService.getAll({ search: id!, take: 100 }),
        userService.getAll(),
        craftService.getAll(),
        materialService.getAll(),
        safetyChecklistService.getTemplates(),
        attachmentService.getByEntity('WorkOrder', id!),
      ]);
      setWo(woData as WorkOrderDetail);
      setLabor(laborData as LaborEntryDetail[]);
      setHistory((auditData?.data || []).filter((a) => a.recordId === id!));
      setUsers(usersData);
      setCrafts(craftsData);
      setMaterials(materialsData);
      setTemplates(templatesData);
      setAttachments(attachmentsData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) reload();
  }, [id, reload]);

  const handleAttachmentUpload = async (file: File | undefined) => {
    if (!file) return;
    setAttBusy('upload');
    setAttError(null);
    setAttSuccess(null);
    try {
      const created = await attachmentService.upload('WorkOrder', id!, file);
      setAttachments((prev) => [created, ...prev]);
      setAttSuccess(`Uploaded ${created.originalName}`);
    } catch (err) {
      setAttError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setAttBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAttachmentDownload = (att: Attachment) => {
    setAttError(null);
    setAttSuccess(null);
    attachmentService.download(att).catch((err) => {
      setAttError(err instanceof ApiError ? err.message : 'Download failed');
    });
  };

  const handleAttachmentDelete = async (att: Attachment) => {
    setAttBusy(`del:${att.attachmentId}`);
    setAttError(null);
    setAttSuccess(null);
    try {
      await attachmentService.remove(att.attachmentId);
      setAttachments((prev) => prev.filter((a) => a.attachmentId !== att.attachmentId));
      setAttSuccess(`Deleted ${att.originalName}`);
    } catch (err) {
      setAttError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setAttBusy(null);
    }
  };

  const afterMutation = useCallback(async () => {
    await reload();
    setActionError(null);
  }, [reload]);

  const runMutation = useCallback(
    async (busyKey: string, fn: () => Promise<unknown>) => {
      setActionError(null);
      setBusy(busyKey);
      try {
        await fn();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Operation failed');
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const performTransition = useCallback(
    async (newStatus: WorkOrderStatus) => {
      if (!wo) return;
      setActionError(null);
      setBusy(`transition:${newStatus}`);
      try {
        await workOrderService.transitionStatus(wo.workOrderId, newStatus);
        await afterMutation();
        setBusy(null);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : `Failed to update status to ${newStatus}`);
        setBusy(null);
      }
    },
    [wo, afterMutation]
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

  // ---- Operations CRUD ----
  const startAddOperation = useCallback(() => {
    setOpForm({ ...emptyOpForm, numberOfTechnicians: '1', plannedHours: '1' });
    setEditingOpId(null);
    setOpAdding(true);
  }, []);

  const handleAddOperation = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !opForm.craftId || !opForm.description.trim()) return;
      await runMutation('op:add', async () => {
        await workOrderOperationService.create({
          workOrderId: wo.workOrderId,
          sequenceNumber: (wo.operations?.length || 0) + 1,
          description: opForm.description.trim(),
          craftId: opForm.craftId,
          plannedHours: parseFloat(opForm.plannedHours) || 0,
          numberOfTechnicians: parseInt(opForm.numberOfTechnicians, 10) || 1,
        });
        setOpAdding(false);
        setOpForm(emptyOpForm);
        await afterMutation();
      });
    },
    [wo, opForm, runMutation, afterMutation]
  );

  const startEditOperation = useCallback(
    (op: OperationDetail) => {
      setEditingOpId(op.operationId);
      setEditOpForm({
        description: op.description,
        craftId: op.craftId || '',
        plannedHours: String(op.plannedHours),
        numberOfTechnicians: String(op.numberOfTechnicians),
      });
    },
    []
  );

  const handleUpdateOperation = useCallback(
    async (op: OperationDetail) => {
      await runMutation(`op:edit:${op.operationId}`, async () => {
        await workOrderOperationService.update(op.operationId, {
          description: editOpForm.description.trim(),
          craftId: editOpForm.craftId,
          plannedHours: parseFloat(editOpForm.plannedHours) || 0,
          numberOfTechnicians: parseInt(editOpForm.numberOfTechnicians, 10) || 1,
        });
        setEditingOpId(null);
        await afterMutation();
      });
    },
    [editOpForm, runMutation, afterMutation]
  );

  const handleDeleteOperation = useCallback(
    async (op: OperationDetail) => {
      if (!window.confirm(`Delete operation "${op.description}"?`)) return;
      await runMutation(`op:del:${op.operationId}`, async () => {
        await workOrderOperationService.delete(op.operationId);
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  // ---- Materials CRUD ----
  const handleAddMaterial = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !matForm.materialId) return;
      await runMutation('mat:add', async () => {
        await workOrderMaterialService.create({
          workOrderId: wo.workOrderId,
          materialId: matForm.materialId,
          plannedQuantity: parseFloat(matForm.plannedQuantity) || 0,
          unitCost: parseFloat(matForm.unitCost) || 0,
        });
        setMatAdding(false);
        setMatForm(emptyMatForm);
        await afterMutation();
      });
    },
    [wo, matForm, runMutation, afterMutation]
  );

  const startEditMaterial = useCallback(
    (wm: WoMaterialDetail) => {
      setEditingMatId(wm.woMaterialId);
      setEditMatForm({
        materialId: wm.materialId,
        plannedQuantity: String(wm.plannedQuantity),
        actualQuantity: String(wm.actualQuantity),
        unitCost: String(wm.unitCost),
      });
    },
    []
  );

  const handleMaterialSelect = useCallback(
    (form: MatFormState, setter: (f: MatFormState) => void, materialId: string) => {
      const m = materials.find((x) => x.materialId === materialId);
      setter({
        ...form,
        materialId,
        unitCost: m && m.standardCost != null && form.unitCost === '' ? String(m.standardCost) : form.unitCost,
      });
    },
    [materials]
  );

  const handleUpdateMaterial = useCallback(
    async (wm: WoMaterialDetail) => {
      await runMutation(`mat:edit:${wm.woMaterialId}`, async () => {
        await workOrderMaterialService.update(wm.woMaterialId, {
          plannedQuantity: parseFloat(editMatForm.plannedQuantity) || 0,
          actualQuantity: parseFloat(editMatForm.actualQuantity) || 0,
          unitCost: parseFloat(editMatForm.unitCost) || 0,
        });
        setEditingMatId(null);
        await afterMutation();
      });
    },
    [editMatForm, runMutation, afterMutation]
  );

  const handleDeleteMaterial = useCallback(
    async (wm: WoMaterialDetail) => {
      if (!window.confirm(`Remove material "${wm.material?.materialCode || wm.materialId}"?`)) return;
      await runMutation(`mat:del:${wm.woMaterialId}`, async () => {
        await workOrderMaterialService.delete(wm.woMaterialId);
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  // ---- Labor CRUD ----
  const handleAddLabor = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !laborForm.operationId || !laborForm.userId) return;
      await runMutation('labor:add', async () => {
        await laborService.create({
          operationId: laborForm.operationId,
          userId: laborForm.userId,
          hoursWorked: parseFloat(laborForm.hoursWorked) || 0,
          notes: laborForm.notes.trim() || undefined,
        });
        setLaborAdding(false);
        setLaborForm(emptyLaborForm);
        await afterMutation();
      });
    },
    [wo, laborForm, runMutation, afterMutation]
  );

  const startEditLabor = useCallback(
    (l: LaborEntryDetail) => {
      setEditingLaborId(l.laborEntryId);
      setEditLaborForm({
        operationId: l.operationId,
        userId: l.userId,
        hoursWorked: String(l.hoursWorked),
        notes: l.notes || '',
      });
    },
    []
  );

  const handleUpdateLabor = useCallback(
    async (l: LaborEntryDetail) => {
      await runMutation(`labor:edit:${l.laborEntryId}`, async () => {
        await laborService.update(l.laborEntryId, {
          hoursWorked: parseFloat(editLaborForm.hoursWorked) || 0,
          notes: editLaborForm.notes.trim() || undefined,
        });
        setEditingLaborId(null);
        await afterMutation();
      });
    },
    [editLaborForm, runMutation, afterMutation]
  );

  const handleDeleteLabor = useCallback(
    async (l: LaborEntryDetail) => {
      if (!window.confirm(`Delete labor entry (${l.hoursWorked}h by ${l.user?.fullName || l.userId})?`)) return;
      await runMutation(`labor:del:${l.laborEntryId}`, async () => {
        await laborService.delete(l.laborEntryId);
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  // ---- Services CRUD ----
  const handleAddService = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !svcForm.vendor.trim() || !svcForm.description.trim()) return;
      await runMutation('svc:add', async () => {
        await externalServiceService.create({
          workOrderId: wo.workOrderId,
          vendor: svcForm.vendor.trim(),
          description: svcForm.description.trim(),
          cost: parseFloat(svcForm.cost) || 0,
          invoiceRef: svcForm.invoiceRef.trim(),
        });
        setSvcAdding(false);
        setSvcForm(emptySvcForm);
        await afterMutation();
      });
    },
    [wo, svcForm, runMutation, afterMutation]
  );

  const startEditService = useCallback(
    (s: ExternalServiceDetail) => {
      setEditingSvcId(s.serviceCostId);
      setEditSvcForm({
        vendor: s.vendor,
        description: s.description,
        cost: String(s.cost),
        invoiceRef: s.invoiceRef || '',
      });
    },
    []
  );

  const handleUpdateService = useCallback(
    async (s: ExternalServiceDetail) => {
      await runMutation(`svc:edit:${s.serviceCostId}`, async () => {
        await externalServiceService.update(s.serviceCostId, {
          vendor: editSvcForm.vendor.trim(),
          description: editSvcForm.description.trim(),
          cost: parseFloat(editSvcForm.cost) || 0,
          invoiceRef: editSvcForm.invoiceRef.trim(),
        });
        setEditingSvcId(null);
        await afterMutation();
      });
    },
    [editSvcForm, runMutation, afterMutation]
  );

  const handleDeleteService = useCallback(
    async (s: ExternalServiceDetail) => {
      if (!window.confirm(`Delete service "${s.description}"?`)) return;
      await runMutation(`svc:del:${s.serviceCostId}`, async () => {
        await externalServiceService.delete(s.serviceCostId);
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  // ---- Checklists CRUD ----
  const handleAttachChecklist = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wo || !attachTemplateId) return;
      await runMutation('cl:attach', async () => {
        await safetyChecklistService.attachToWorkOrder(wo.workOrderId, attachTemplateId);
        setAttachTemplateId('');
        await afterMutation();
      });
    },
    [wo, attachTemplateId, runMutation, afterMutation]
  );

  const handleRespondItem = useCallback(
    async (item: ChecklistItemDetail, response: string) => {
      await runMutation(`cl:item:${item.woChecklistItemId}`, async () => {
        await safetyChecklistService.updateChecklistItem(item.woChecklistItemId, { response });
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  const handleCompleteChecklist = useCallback(
    async (cl: ChecklistDetail) => {
      if (cl.status === 'Completed') return;
      await runMutation(`cl:complete:${cl.woChecklistId}`, async () => {
        await safetyChecklistService.updateChecklistStatus(cl.woChecklistId, { status: 'Completed' });
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
  );

  const handleDeleteChecklist = useCallback(
    async (cl: ChecklistDetail) => {
      if (!window.confirm(`Delete checklist "${cl.template?.name}"?`)) return;
      await runMutation(`cl:del:${cl.woChecklistId}`, async () => {
        await safetyChecklistService.deleteChecklist(cl.woChecklistId);
        await afterMutation();
      });
    },
    [runMutation, afterMutation]
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
      { id: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
      { id: 'history', label: 'History', icon: FileText, count: history.length },
    ];
  }, [wo, labor, history, attachments]);

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
              onClick={() => {
                // tab.id comes from the fixed `tabs` list (constant DetailTab values)
                setActiveTab(tab.id as DetailTab);
              }}
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
          <div className="space-y-3">
            <div className="flex justify-end">
              {canEdit && !opAdding && (
                <button
                  onClick={startAddOperation}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Operation
                </button>
              )}
            </div>
            {opAdding && (
              <form onSubmit={handleAddOperation} className="industrial-card rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">New Operation</span>
                  <button type="button" onClick={() => { setOpAdding(false); setOpForm(emptyOpForm); }} className="text-tertiary hover:text-primary">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-4">
                    <FieldLabel>Description</FieldLabel>
                    <input className={inputCls} value={opForm.description} onChange={(e) => setOpForm({ ...opForm, description: e.target.value })} placeholder="Task description" />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Craft</FieldLabel>
                    <select className={selectCls} value={opForm.craftId} onChange={(e) => setOpForm({ ...opForm, craftId: e.target.value })}>
                      <option value="">Select craft</option>
                      {crafts.map((c) => (
                        <option key={c.craftId} value={c.craftId}>{c.craftCode} (${c.hourlyRate}/h)</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Planned Hours</FieldLabel>
                    <input className={inputCls} type="number" min={0} step="0.5" value={opForm.plannedHours} onChange={(e) => setOpForm({ ...opForm, plannedHours: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Technicians</FieldLabel>
                    <input className={inputCls} type="number" min={1} value={opForm.numberOfTechnicians} onChange={(e) => setOpForm({ ...opForm, numberOfTechnicians: e.target.value })} />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <button
                      type="submit"
                      disabled={!opForm.craftId || !opForm.description.trim() || busy === 'op:add'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold w-full justify-center transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#D97706', color: '#111113' }}
                    >
                      {busy === 'op:add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Add
                    </button>
                  </div>
                </div>
              </form>
            )}
            <div className="industrial-card rounded overflow-hidden">
              {(wo.operations?.length || 0) === 0 ? (
                <EmptyState label="No operations" />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Seq', 'Description', 'Craft', 'Planned Hrs', 'Techs', 'Actual Hrs', 'Status', ''].map((h) => (
                        <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.operations!.map((op, idx) => (
                      <tr key={op.operationId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                        {editingOpId === op.operationId ? (
                          <>
                            <td className={tdCls}>
                              <span className="font-mono text-xs text-secondary">{op.sequenceNumber}</span>
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} value={editOpForm.description} onChange={(e) => setEditOpForm({ ...editOpForm, description: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <select className={selectCls} value={editOpForm.craftId} onChange={(e) => setEditOpForm({ ...editOpForm, craftId: e.target.value })}>
                                {crafts.map((c) => (
                                  <option key={c.craftId} value={c.craftId}>{c.craftCode} (${c.hourlyRate}/h)</option>
                                ))}
                              </select>
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0} step="0.5" value={editOpForm.plannedHours} onChange={(e) => setEditOpForm({ ...editOpForm, plannedHours: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={1} value={editOpForm.numberOfTechnicians} onChange={(e) => setEditOpForm({ ...editOpForm, numberOfTechnicians: e.target.value })} />
                            </td>
                            <td className={tdCls}><span className="font-mono text-xs text-primary">{op.actualHours || '-'}</span></td>
                            <td className={tdCls}>{op.status}</td>
                            <td className={tdCls}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateOperation(op)}
                                  disabled={busy === `op:edit:${op.operationId}` || !editOpForm.craftId || !editOpForm.description.trim()}
                                  className="text-green-status hover:opacity-70 disabled:opacity-40"
                                  title="Save"
                                >
                                  {busy === `op:edit:${op.operationId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setEditingOpId(null)} className="text-tertiary hover:text-primary" title="Cancel">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`${tdCls} font-mono text-xs text-secondary`}>{op.sequenceNumber}</td>
                            <td className={`${tdCls} text-xs text-primary`}>{op.description}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>
                              {op.craft?.craftName || op.craft?.craftCode || '-'}
                            </td>
                            <td className={`${tdCls} text-xs text-secondary`}>{op.plannedHours}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{op.numberOfTechnicians}</td>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>{op.actualHours || '-'}</td>
                            <td className={tdCls}>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                op.status === 'Completed' ? 'badge-completed' :
                                op.status === 'In Progress' ? 'badge-in-progress' : 'badge-open'
                              }`}>
                                {op.status}
                              </span>
                            </td>
                            <td className={tdCls}>
                              {canEdit && (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => startEditOperation(op)} className="text-tertiary hover:text-amber transition-colors" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOperation(op)}
                                    disabled={busy === `op:del:${op.operationId}`}
                                    className="text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                                    title="Delete"
                                  >
                                    {busy === `op:del:${op.operationId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              {canEdit && !matAdding && (
                <button
                  onClick={() => { setEditingMatId(null); setMatForm({ ...emptyMatForm, plannedQuantity: '1' }); setMatAdding(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Material
                </button>
              )}
            </div>
            {matAdding && (
              <form onSubmit={handleAddMaterial} className="industrial-card rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">Add Material</span>
                  <button type="button" onClick={() => { setMatAdding(false); setMatForm(emptyMatForm); }} className="text-tertiary hover:text-primary">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-5">
                    <FieldLabel>Material</FieldLabel>
                    <select
                      className={selectCls}
                      value={matForm.materialId}
                      onChange={(e) => handleMaterialSelect(matForm, setMatForm, e.target.value)}
                    >
                      <option value="">Select material</option>
                      {materials.map((m) => (
                        <option key={m.materialId} value={m.materialId}>{m.materialCode} — {m.description}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Planned Qty</FieldLabel>
                    <input className={inputCls} type="number" min={0} step="0.01" value={matForm.plannedQuantity} onChange={(e) => setMatForm({ ...matForm, plannedQuantity: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Unit Cost $</FieldLabel>
                    <input className={inputCls} type="number" min={0} step="0.01" value={matForm.unitCost} onChange={(e) => setMatForm({ ...matForm, unitCost: e.target.value })} />
                  </div>
                  <div className="col-span-3 flex items-end">
                    <button
                      type="submit"
                      disabled={!matForm.materialId || busy === 'mat:add'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold w-full justify-center transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#D97706', color: '#111113' }}
                    >
                      {busy === 'mat:add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Add
                    </button>
                  </div>
                </div>
              </form>
            )}
            <div className="industrial-card rounded overflow-hidden">
              {(wo.woMaterials?.length || 0) === 0 ? (
                <EmptyState label="No materials" />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Material Code', 'Description', 'Planned Qty', 'Actual Qty', 'Reserved', 'Unit Cost', 'Total', ''].map((h) => (
                        <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.woMaterials!.map((wm, idx) => (
                      <tr key={wm.woMaterialId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                        {editingMatId === wm.woMaterialId ? (
                          <>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>{wm.material?.materialCode || '-'}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{wm.material?.description || '-'}</td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0} step="0.01" value={editMatForm.plannedQuantity} onChange={(e) => setEditMatForm({ ...editMatForm, plannedQuantity: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0} step="0.01" value={editMatForm.actualQuantity} onChange={(e) => setEditMatForm({ ...editMatForm, actualQuantity: e.target.value })} />
                            </td>
                            <td className={`${tdCls} text-xs text-amber`}>{wm.reservationQuantity}</td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0} step="0.01" value={editMatForm.unitCost} onChange={(e) => setEditMatForm({ ...editMatForm, unitCost: e.target.value })} />
                            </td>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>${(wm.actualQuantity * wm.unitCost).toLocaleString()}</td>
                            <td className={tdCls}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateMaterial(wm)}
                                  disabled={busy === `mat:edit:${wm.woMaterialId}`}
                                  className="text-green-status hover:opacity-70 disabled:opacity-40"
                                  title="Save"
                                >
                                  {busy === `mat:edit:${wm.woMaterialId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setEditingMatId(null)} className="text-tertiary hover:text-primary" title="Cancel">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>{wm.material?.materialCode || '-'}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{wm.material?.description || '-'}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{wm.plannedQuantity}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{wm.actualQuantity || '-'}</td>
                            <td className={`${tdCls} text-xs text-amber`}>{wm.reservationQuantity}</td>
                            <td className={`${tdCls} font-mono text-xs text-secondary`}>${wm.unitCost}</td>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>${(wm.actualQuantity * wm.unitCost).toLocaleString()}</td>
                            <td className={tdCls}>
                              {canEdit && (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => startEditMaterial(wm)} className="text-tertiary hover:text-amber transition-colors" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMaterial(wm)}
                                    disabled={busy === `mat:del:${wm.woMaterialId}`}
                                    className="text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                                    title="Remove"
                                  >
                                    {busy === `mat:del:${wm.woMaterialId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'labor' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              {canEdit && !laborAdding && (
                <button
                  onClick={() => { setEditingLaborId(null); setLaborForm({ ...emptyLaborForm, hoursWorked: '1' }); setLaborAdding(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Log Labor
                </button>
              )}
            </div>
            {laborAdding && (
              <form onSubmit={handleAddLabor} className="industrial-card rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">Log Labor</span>
                  <button type="button" onClick={() => { setLaborAdding(false); setLaborForm(emptyLaborForm); }} className="text-tertiary hover:text-primary">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <FieldLabel>Operation</FieldLabel>
                    <select className={selectCls} value={laborForm.operationId} onChange={(e) => setLaborForm({ ...laborForm, operationId: e.target.value })}>
                      <option value="">Select operation</option>
                      {(wo.operations || []).map((op) => (
                        <option key={op.operationId} value={op.operationId}>{op.sequenceNumber} — {op.description}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <FieldLabel>Technician</FieldLabel>
                    <select className={selectCls} value={laborForm.userId} onChange={(e) => setLaborForm({ ...laborForm, userId: e.target.value })}>
                      <option value="">Select user</option>
                      {users.map((u) => (
                        <option key={u.userId} value={u.userId}>{u.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Hours</FieldLabel>
                    <input className={inputCls} type="number" min={0.5} step="0.25" value={laborForm.hoursWorked} onChange={(e) => setLaborForm({ ...laborForm, hoursWorked: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Notes</FieldLabel>
                    <input className={inputCls} value={laborForm.notes} onChange={(e) => setLaborForm({ ...laborForm, notes: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <button
                      type="submit"
                      disabled={!laborForm.operationId || !laborForm.userId || busy === 'labor:add'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold w-full justify-center transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#D97706', color: '#111113' }}
                    >
                      {busy === 'labor:add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Log
                    </button>
                  </div>
                </div>
              </form>
            )}
            <div className="industrial-card rounded overflow-hidden">
              {labor.length === 0 ? (
                <EmptyState label="No labor entries" />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Technician', 'Operation', 'Hours', 'Date/Time', 'Notes', ''].map((h) => (
                        <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {labor.map((l, idx) => (
                      <tr key={l.laborEntryId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                        {editingLaborId === l.laborEntryId ? (
                          <>
                            <td className={`${tdCls} text-xs text-primary`}>{l.user?.fullName || l.userId}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{l.operation?.description || '-'}</td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0.5} step="0.25" value={editLaborForm.hoursWorked} onChange={(e) => setEditLaborForm({ ...editLaborForm, hoursWorked: e.target.value })} />
                            </td>
                            <td className={`${tdCls} font-mono text-xs text-secondary`}>{new Date(l.entryDateTime).toLocaleString()}</td>
                            <td className={tdCls}>
                              <input className={inputCls} value={editLaborForm.notes} onChange={(e) => setEditLaborForm({ ...editLaborForm, notes: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateLabor(l)}
                                  disabled={busy === `labor:edit:${l.laborEntryId}`}
                                  className="text-green-status hover:opacity-70 disabled:opacity-40"
                                  title="Save"
                                >
                                  {busy === `labor:edit:${l.laborEntryId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setEditingLaborId(null)} className="text-tertiary hover:text-primary" title="Cancel">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`${tdCls} text-xs text-primary`}>{l.user?.fullName || l.userId}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{l.operation?.description || '-'}</td>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>{l.hoursWorked}</td>
                            <td className={`${tdCls} font-mono text-xs text-secondary`}>{new Date(l.entryDateTime).toLocaleString()}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{l.notes}</td>
                            <td className={tdCls}>
                              {canEdit && (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => startEditLabor(l)} className="text-tertiary hover:text-amber transition-colors" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLabor(l)}
                                    disabled={busy === `labor:del:${l.laborEntryId}`}
                                    className="text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                                    title="Delete"
                                  >
                                    {busy === `labor:del:${l.laborEntryId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              {canEdit && !svcAdding && (
                <button
                  onClick={() => { setEditingSvcId(null); setSvcForm(emptySvcForm); setSvcAdding(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Service
                </button>
              )}
            </div>
            {svcAdding && (
              <form onSubmit={handleAddService} className="industrial-card rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">Add External Service</span>
                  <button type="button" onClick={() => { setSvcAdding(false); setSvcForm(emptySvcForm); }} className="text-tertiary hover:text-primary">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <FieldLabel>Vendor</FieldLabel>
                    <input className={inputCls} value={svcForm.vendor} onChange={(e) => setSvcForm({ ...svcForm, vendor: e.target.value })} placeholder="Vendor name" />
                  </div>
                  <div className="col-span-4">
                    <FieldLabel>Description</FieldLabel>
                    <input className={inputCls} value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} placeholder="Service description" />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Cost $</FieldLabel>
                    <input className={inputCls} type="number" min={0} step="0.01" value={svcForm.cost} onChange={(e) => setSvcForm({ ...svcForm, cost: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel>Invoice Ref</FieldLabel>
                    <input className={inputCls} value={svcForm.invoiceRef} onChange={(e) => setSvcForm({ ...svcForm, invoiceRef: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <button
                      type="submit"
                      disabled={!svcForm.vendor.trim() || !svcForm.description.trim() || busy === 'svc:add'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold w-full justify-center transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: '#D97706', color: '#111113' }}
                    >
                      {busy === 'svc:add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </form>
            )}
            <div className="industrial-card rounded overflow-hidden">
              {(wo.externalServices?.length || 0) === 0 ? (
                <EmptyState label="No external services" />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Vendor', 'Description', 'Cost', 'Invoice Ref', ''].map((h) => (
                        <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.externalServices!.map((s, idx) => (
                      <tr key={s.serviceCostId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                        {editingSvcId === s.serviceCostId ? (
                          <>
                            <td className={tdCls}>
                              <input className={inputCls} value={editSvcForm.vendor} onChange={(e) => setEditSvcForm({ ...editSvcForm, vendor: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} value={editSvcForm.description} onChange={(e) => setEditSvcForm({ ...editSvcForm, description: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} type="number" min={0} step="0.01" value={editSvcForm.cost} onChange={(e) => setEditSvcForm({ ...editSvcForm, cost: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <input className={inputCls} value={editSvcForm.invoiceRef} onChange={(e) => setEditSvcForm({ ...editSvcForm, invoiceRef: e.target.value })} />
                            </td>
                            <td className={tdCls}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateService(s)}
                                  disabled={busy === `svc:edit:${s.serviceCostId}` || !editSvcForm.vendor.trim() || !editSvcForm.description.trim()}
                                  className="text-green-status hover:opacity-70 disabled:opacity-40"
                                  title="Save"
                                >
                                  {busy === `svc:edit:${s.serviceCostId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setEditingSvcId(null)} className="text-tertiary hover:text-primary" title="Cancel">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`${tdCls} text-xs text-primary`}>{s.vendor}</td>
                            <td className={`${tdCls} text-xs text-secondary`}>{s.description}</td>
                            <td className={`${tdCls} font-mono text-xs text-primary`}>${s.cost.toLocaleString()}</td>
                            <td className={`${tdCls} font-mono text-xs text-secondary`}>{s.invoiceRef}</td>
                            <td className={tdCls}>
                              {canEdit && (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => startEditService(s)} className="text-tertiary hover:text-amber transition-colors" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteService(s)}
                                    disabled={busy === `svc:del:${s.serviceCostId}`}
                                    className="text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                                    title="Delete"
                                  >
                                    {busy === `svc:del:${s.serviceCostId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'checklists' && (
          <div className="space-y-3">
            {canEdit && (
              <form onSubmit={handleAttachChecklist} className="industrial-card rounded p-4 flex items-center gap-3">
                <Shield className="w-4 h-4 text-amber" />
                <select className={selectCls} value={attachTemplateId} onChange={(e) => setAttachTemplateId(e.target.value)}>
                  <option value="">Select checklist template...</option>
                  {templates.map((t) => (
                    <option key={t.checklistTemplateId} value={t.checklistTemplateId}>
                      {t.name}{t.isMandatory ? ' (Mandatory)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!attachTemplateId || busy === 'cl:attach'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
                  style={{ backgroundColor: '#D97706', color: '#111113' }}
                >
                  {busy === 'cl:attach' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Attach
                </button>
              </form>
            )}
            {(wo.checklists?.length || 0) === 0 ? (
              <EmptyState label="No checklists" />
            ) : (
              wo.checklists!.map((cl) => {
                const template = cl.template;
                const signedByUser = users.find((u) => u.userId === cl.signedBy);
                const completed = cl.status === 'Completed';
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
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          completed ? 'badge-completed' : 'badge-open'
                        }`}>
                          {cl.status}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteChecklist(cl)}
                            disabled={busy === `cl:del:${cl.woChecklistId}`}
                            className="text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                            title="Delete checklist"
                          >
                            {busy === `cl:del:${cl.woChecklistId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {(cl.items || []).map((ci) => (
                        <div key={ci.item?.itemId || ci.woChecklistItemId} className="flex items-center gap-3 py-1">
                          <div className="flex items-center gap-1">
                            {canEdit && !completed ? (
                              ['Yes', 'No', 'NA'].map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => handleRespondItem(ci, r)}
                                  disabled={busy === `cl:item:${ci.woChecklistItemId}`}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-40 ${
                                    ci.response === r
                                      ? r === 'Yes'
                                        ? 'text-green-status border-green-status/60 bg-green-status/10'
                                        : r === 'No'
                                          ? 'text-red-status border-red-status/60 bg-red-status/10'
                                          : 'text-amber border-amber/60 bg-amber/10'
                                      : 'text-tertiary border-subtle hover:text-primary hover:border-highlight'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))
                            ) : (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                ci.response === 'Yes' ? 'text-green-status bg-green-status/10'
                                  : ci.response === 'No' ? 'text-red-status bg-red-status/10'
                                  : 'text-amber bg-amber/10'
                              }`}>
                                {ci.response}
                              </span>
                            )}
                          </div>
                          <span className="text-secondary text-xs">{ci.item?.description || '-'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-2 border-t border-subtle flex items-center justify-between">
                      {cl.signedBy ? (
                        <span className="text-tertiary text-xs">
                          Signed by {signedByUser?.fullName || cl.signedBy} on {cl.signedDate ? new Date(cl.signedDate).toLocaleString() : '-'}
                        </span>
                      ) : (
                        <span className="text-tertiary text-xs">Not signed</span>
                      )}
                      {canEdit && !completed && (
                        <button
                          onClick={() => handleCompleteChecklist(cl)}
                          disabled={busy === `cl:complete:${cl.woChecklistId}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-status border border-green-status/50 hover:bg-green-status/10 transition-all disabled:opacity-50"
                        >
                          {busy === `cl:complete:${cl.woChecklistId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          Complete & Sign
                        </button>
                      )}
                    </div>
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

        {activeTab === 'attachments' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleAttachmentUpload(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attBusy === 'upload'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all disabled:opacity-50"
              >
                {attBusy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload
              </button>
              <span className="text-xs text-tertiary">PDF, images, text, Excel — up to 10 MB</span>
            </div>
            {attError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-red-status border border-red-status/30"
                style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
                <AlertTriangle className="w-4 h-4" />
                {attError}
              </div>
            )}
            {attSuccess && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-green-status border border-green-status/30"
                style={{ backgroundColor: 'rgba(5,150,105,0.08)' }}>
                <CheckCircle className="w-4 h-4" />
                {attSuccess}
              </div>
            )}
            {attachments.length === 0 ? (
              <EmptyState label="No attachments" />
            ) : (
              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['File', 'Size', 'Uploaded By', 'Uploaded At', ''].map((h) => (
                        <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attachments.map((att, idx) => {
                      const uploader = users.find((u) => u.userId === att.uploadedByUserId);
                      return (
                        <tr key={att.attachmentId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                          <td className={`${tdCls} font-mono text-xs text-primary`}>{att.originalName}</td>
                          <td className={`${tdCls} text-xs text-secondary`}>{formatBytes(att.sizeBytes)}</td>
                          <td className={`${tdCls} text-xs text-primary`}>{uploader?.fullName || att.createdBy}</td>
                          <td className={`${tdCls} text-xs text-tertiary`}>{new Date(att.createdDate).toLocaleString()}</td>
                          <td className={`${tdCls} text-right`}>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleAttachmentDownload(att)}
                                className="p-1 text-tertiary hover:text-primary transition-colors"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              {canDeleteAttachments && (
                                <button
                                  onClick={() => handleAttachmentDelete(att)}
                                  className="p-1 text-tertiary hover:text-red-status transition-colors"
                                  title="Delete attachment"
                                >
                                  {attBusy === `del:${att.attachmentId}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                      <th key={h} className={thCls} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, idx) => {
                    const user = users.find((u) => u.userId === h.userId);
                    return (
                      <tr key={h.auditId} className="border-t border-subtle" style={{ backgroundColor: rowBg(idx) }}>
                        <td className={`${tdCls} font-mono text-xs text-secondary`}>{new Date(h.timestamp).toLocaleString()}</td>
                        <td className={tdCls}>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            h.action === 'Create' ? 'badge-completed' : h.action === 'Update' ? 'badge-in-progress' : 'badge-cancelled'
                          }`}>
                            {h.action}
                          </span>
                        </td>
                        <td className={`${tdCls} font-mono text-xs text-secondary`}>{h.fieldName || '-'}</td>
                        <td className={`${tdCls} text-xs text-red-status`}>{h.oldValue || '-'}</td>
                        <td className={`${tdCls} text-xs text-green-status`}>{h.newValue || '-'}</td>
                        <td className={`${tdCls} text-xs text-primary`}>{user?.fullName || h.userId}</td>
                        <td className={`${tdCls} font-mono text-xs text-tertiary`}>{h.ipAddress}</td>
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-tertiary mb-1" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}