import { create } from 'zustand';
import type {
  WorkOrder, Notification, Equipment, FunctionalLocation, WorkCenter,
  Craft, Material, TaskList, MaintenancePlan, SystemAlert, AuditLogEntry,
  User, WorkOrderOperation, WorkOrderMaterial, LaborEntry, ExternalServiceCost,
  WorkOrderChecklist, MeterReading, DashboardKPIs, WorkOrderStatus,
  SafetyChecklistTemplate,
} from '@/types';
import {
  mockWorkOrders, mockNotifications, mockEquipment, mockLocations,
  mockWorkCenters, mockCrafts, mockMaterials, mockTaskLists,
  mockTaskListOperations, mockMaintenancePlans, mockAlerts, mockAuditLog,
  mockUsers, mockWorkOrderOperations, mockWorkOrderMaterials, mockLaborEntries,
  mockExternalServices, mockWorkOrderChecklists, mockChecklistTemplates,
  mockChecklistItems, mockMeters, mockMeterReadings, mockDashboardKPIs,
  mockComments,
} from '@/data/mockData';
import { functionalLocationService } from '@/services/functionalLocationService';
import { equipmentService } from '@/services/equipmentService';
import { workOrderService } from '@/services/workOrderService';
import { notificationService } from '@/services/notificationService';
import { materialService } from '@/services/materialService';
import { workCenterService } from '@/services/workCenterService';
import { maintenancePlanService } from '@/services/maintenancePlanService';
import { dashboardService } from '@/services/dashboardService';
import { alertService } from '@/services/alertService';
import { commentService } from '@/services/commentService';

interface AppState {
  workOrders: WorkOrder[];
  notifications: Notification[];
  equipment: Equipment[];
  locations: FunctionalLocation[];
  workCenters: WorkCenter[];
  crafts: Craft[];
  materials: Material[];
  taskLists: TaskList[];
  taskListOperations: typeof mockTaskListOperations;
  maintenancePlans: MaintenancePlan[];
  alerts: SystemAlert[];
  auditLog: AuditLogEntry[];
  users: User[];
  operations: WorkOrderOperation[];
  woMaterials: WorkOrderMaterial[];
  laborEntries: LaborEntry[];
  externalServices: ExternalServiceCost[];
  woChecklists: WorkOrderChecklist[];
  checklistTemplates: SafetyChecklistTemplate[];
  checklistItems: typeof mockChecklistItems;
  meters: typeof mockMeters;
  meterReadings: MeterReading[];
  dashboardKPIs: DashboardKPIs;
  comments: typeof mockComments;
  loading: boolean;
  error: string | null;

  loadFromApi: () => Promise<void>;
  loadDashboardKPIs: () => Promise<void>;
  loadAlerts: () => Promise<void>;

  addWorkOrder: (wo: WorkOrder) => void;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
  deleteWorkOrder: (id: string) => void;
  transitionWorkOrderStatus: (id: string, newStatus: WorkOrderStatus) => void;

  addNotification: (notif: Notification) => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  convertNotificationToWO: (notifId: string) => WorkOrder | null;

  addEquipment: (eq: Equipment) => void;
  updateEquipment: (id: string, updates: Partial<Equipment>) => void;

  addLocation: (loc: FunctionalLocation) => void;
  updateLocation: (id: string, updates: Partial<FunctionalLocation>) => void;

  addMaintenancePlan: (plan: MaintenancePlan) => void;
  updateMaintenancePlan: (id: string, updates: Partial<MaintenancePlan>) => void;

  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;

  addMaterial: (mat: Material) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;

  addWorkCenter: (wc: WorkCenter) => void;

  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;

  addLaborEntry: (entry: LaborEntry) => void;
  addMeterReading: (reading: MeterReading) => void;

  getEquipmentByLocation: (locationId: string) => Equipment[];
  getWorkOrdersByEquipment: (equipmentId: string) => WorkOrder[];
  getOpenWorkOrders: () => WorkOrder[];
  getOverdueWorkOrders: () => WorkOrder[];
  getUnreadAlertCount: () => number;
  getWorkOrderOperations: (woId: string) => WorkOrderOperation[];
  getWorkOrderMaterials: (woId: string) => WorkOrderMaterial[];
  getWorkOrderLabor: (woId: string) => LaborEntry[];
  getWorkOrderServices: (woId: string) => ExternalServiceCost[];
  getWorkOrderComments: (woId: string) => typeof mockComments;
  getNotificationsAwaitingConversion: () => Notification[];
  getEquipmentMeterReadings: (meterId: string) => MeterReading[];
}

function getAllDescendantIds(locations: FunctionalLocation[], parentId: string): string[] {
  const ids: string[] = [parentId];
  const children = locations.filter((l) => l.parentLocationId === parentId);
  for (const child of children) {
    ids.push(...getAllDescendantIds(locations, child.functionalLocationId));
  }
  return ids;
}

export const useAppStore = create<AppState>()((set, get) => ({
  workOrders: mockWorkOrders,
  notifications: mockNotifications,
  equipment: mockEquipment,
  locations: mockLocations,
  workCenters: mockWorkCenters,
  crafts: mockCrafts,
  materials: mockMaterials,
  taskLists: mockTaskLists,
  taskListOperations: mockTaskListOperations,
  maintenancePlans: mockMaintenancePlans,
  alerts: mockAlerts,
  auditLog: mockAuditLog,
  users: mockUsers,
  operations: mockWorkOrderOperations,
  woMaterials: mockWorkOrderMaterials,
  laborEntries: mockLaborEntries,
  externalServices: mockExternalServices,
  woChecklists: mockWorkOrderChecklists,
  checklistTemplates: mockChecklistTemplates,
  checklistItems: mockChecklistItems,
  meters: mockMeters,
  meterReadings: mockMeterReadings,
  dashboardKPIs: mockDashboardKPIs,
  comments: mockComments,
  loading: false,
  error: null,

  loadFromApi: async () => {
    set({ loading: true, error: null });
    try {
      const [locations, equipment, workOrders, notifications, materials, workCenters, maintenancePlans] =
        await Promise.all([
          functionalLocationService.getAll().catch(() => get().locations),
          equipmentService.getAll().catch(() => get().equipment),
          workOrderService.getAll({ take: 200 }).then(r => r.data).catch(() => get().workOrders),
          notificationService.getAll().catch(() => get().notifications),
          materialService.getAll().catch(() => get().materials),
          workCenterService.getAll().catch(() => get().workCenters),
          maintenancePlanService.getAll().catch(() => get().maintenancePlans),
        ]);
      set({
        locations, equipment, workOrders, notifications,
        materials, workCenters, maintenancePlans, loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  loadDashboardKPIs: async () => {
    try {
      const kpis = await dashboardService.getKPIs();
      set({ dashboardKPIs: kpis });
    } catch { /* keep mock */ }
  },

  loadAlerts: async () => {
    try {
      const alerts = await alertService.getAll();
      set({ alerts });
    } catch { /* keep mock */ }
  },

  addWorkOrder: (wo) => {
    set((s) => ({ workOrders: [wo, ...s.workOrders] }));
  },

  updateWorkOrder: (id, updates) => {
    set((s) => ({
      workOrders: s.workOrders.map((wo) =>
        wo.workOrderId === id ? { ...wo, ...updates } : wo
      ),
    }));
  },

  deleteWorkOrder: (id) => {
    set((s) => ({
      workOrders: s.workOrders.filter((wo) => wo.workOrderId !== id),
    }));
  },

  transitionWorkOrderStatus: (id, newStatus) => {
    set((s) => ({
      workOrders: s.workOrders.map((wo) =>
        wo.workOrderId === id ? { ...wo, status: newStatus } : wo
      ),
    }));
  },

  addNotification: (notif) => {
    set((s) => ({ notifications: [notif, ...s.notifications] }));
  },

  updateNotification: (id, updates) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.notificationId === id ? { ...n, ...updates } : n
      ),
    }));
  },

  convertNotificationToWO: (notifId) => {
    const notif = get().notifications.find((n) => n.notificationId === notifId);
    if (!notif) return null;
    const wo: WorkOrder = {
      workOrderId: `wo-${Date.now()}`,
      woNumber: `WO-${Date.now()}`,
      type: notif.breakdownFlag ? 'EM' : 'CM',
      priority: notif.priority,
      status: 'Draft',
      functionalLocationId: notif.functionalLocationId,
      equipmentId: notif.equipmentId,
      description: `Converted from notification: ${notif.description}`,
      workCenterId: '',
      supervisorUserId: '',
      plannedStart: null,
      plannedFinish: null,
      actualStart: null,
      actualFinish: null,
      costCenterCode: '',
      internalOrder: '',
      breakdownFlag: notif.breakdownFlag,
      safetyCriticalFlag: false,
      plannedCost: 0,
      actualCost: 0,
      createdBy: '',
      createdDate: new Date().toISOString(),
      modifiedBy: '',
      modifiedDate: new Date().toISOString(),
      isDeleted: false,
    };
    set((s) => ({
      workOrders: [wo, ...s.workOrders],
      notifications: s.notifications.map((n) =>
        n.notificationId === notifId ? { ...n, status: 'Converted' as any, workOrderIds: [...n.workOrderIds, wo.workOrderId] } : n
      ),
    }));
    return wo;
  },

  addEquipment: (eq) => {
    set((s) => ({ equipment: [eq, ...s.equipment] }));
  },

  updateEquipment: (id, updates) => {
    set((s) => ({
      equipment: s.equipment.map((e) =>
        e.equipmentId === id ? { ...e, ...updates } : e
      ),
    }));
  },

  addLocation: (loc) => {
    set((s) => ({ locations: [...s.locations, loc] }));
  },

  updateLocation: (id, updates) => {
    set((s) => ({
      locations: s.locations.map((l) =>
        l.functionalLocationId === id ? { ...l, ...updates } : l
      ),
    }));
  },

  addMaintenancePlan: (plan) => {
    set((s) => ({ maintenancePlans: [plan, ...s.maintenancePlans] }));
  },

  updateMaintenancePlan: (id, updates) => {
    set((s) => ({
      maintenancePlans: s.maintenancePlans.map((p) =>
        p.planId === id ? { ...p, ...updates } : p
      ),
    }));
  },

  markAlertRead: (id) => {
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.alertId === id ? { ...a, isRead: true } : a
      ),
    }));
    alertService.markRead(id).catch(() => {});
  },

  markAllAlertsRead: () => {
    set((s) => ({
      alerts: s.alerts.map((a) => ({ ...a, isRead: true })),
    }));
    alertService.markAllRead().catch(() => {});
  },

  addMaterial: (mat) => {
    set((s) => ({ materials: [mat, ...s.materials] }));
  },

  updateMaterial: (id, updates) => {
    set((s) => ({
      materials: s.materials.map((m) =>
        m.materialId === id ? { ...m, ...updates } : m
      ),
    }));
  },

  addWorkCenter: (wc) => {
    set((s) => ({ workCenters: [...s.workCenters, wc] }));
  },

  addUser: (user) => {
    set((s) => ({ users: [...s.users, user] }));
  },

  updateUser: (id, updates) => {
    set((s) => ({
      users: s.users.map((u) =>
        u.userId === id ? { ...u, ...updates } : u
      ),
    }));
  },

  addLaborEntry: (entry) => {
    set((s) => ({ laborEntries: [...s.laborEntries, entry] }));
  },

  addMeterReading: (reading) => {
    set((s) => ({ meterReadings: [...s.meterReadings, reading] }));
  },

  getEquipmentByLocation: (locationId) => {
    const locIds = getAllDescendantIds(get().locations, locationId);
    return get().equipment.filter((e) => locIds.includes(e.functionalLocationId));
  },

  getWorkOrdersByEquipment: (equipmentId) => {
    return get().workOrders.filter((wo) => wo.equipmentId === equipmentId);
  },

  getOpenWorkOrders: () => {
    return get().workOrders.filter((wo) =>
      !['Completed', 'Closed', 'Cancelled'].includes(wo.status)
    );
  },

  getOverdueWorkOrders: () => {
    return get().workOrders.filter((wo) => {
      if (['Completed', 'Closed', 'Cancelled'].includes(wo.status)) return false;
      if (!wo.plannedFinish) return false;
      return new Date(wo.plannedFinish) < new Date();
    });
  },

  getUnreadAlertCount: () => {
    return get().alerts.filter((a) => !a.isRead).length;
  },

  getWorkOrderOperations: (woId) => {
    return get().operations.filter((op) => op.workOrderId === woId);
  },

  getWorkOrderMaterials: (woId) => {
    return get().woMaterials.filter((wm) => wm.workOrderId === woId);
  },

  getWorkOrderLabor: (woId) => {
    const opIds = get().operations.filter((op) => op.workOrderId === woId).map((op) => op.operationId);
    return get().laborEntries.filter((le) => opIds.includes(le.operationId));
  },

  getWorkOrderServices: (woId) => {
    return get().externalServices.filter((es) => es.workOrderId === woId);
  },

  getWorkOrderComments: (woId) => {
    return get().comments.filter((c) => c.entityType === 'WorkOrder' && c.entityId === woId);
  },

  getNotificationsAwaitingConversion: () => {
    return get().notifications.filter((n) => n.status === 'Open' || n.status === 'In Process');
  },

  getEquipmentMeterReadings: (meterId) => {
    return get().meterReadings.filter((r) => r.meterId === meterId);
  },
}));
