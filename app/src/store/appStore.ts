// ============================================================
// App Store — Zustand (Main CMMS State Management)
// ============================================================

import { create } from 'zustand';
import type {
  WorkOrder,
  Notification,
  Equipment,
  FunctionalLocation,
  WorkCenter,
  Craft,
  Material,
  TaskList,
  MaintenancePlan,
  SystemAlert,
  AuditLogEntry,
  User,
  WorkOrderOperation,
  WorkOrderMaterial,
  LaborEntry,
  ExternalServiceCost,
  WorkOrderChecklist,
  MeterReading,
  DashboardKPIs,
  WorkOrderStatus,
  NotificationStatus,
  SafetyChecklistTemplate,
} from '@/types';
import {
  mockWorkOrders,
  mockNotifications,
  mockEquipment,
  mockLocations,
  mockWorkCenters,
  mockCrafts,
  mockMaterials,
  mockTaskLists,
  mockTaskListOperations,
  mockMaintenancePlans,
  mockAlerts,
  mockAuditLog,
  mockUsers,
  mockWorkOrderOperations,
  mockWorkOrderMaterials,
  mockLaborEntries,
  mockExternalServices,
  mockWorkOrderChecklists,
  mockChecklistTemplates,
  mockChecklistItems,
  mockMeters,
  mockMeterReadings,
  mockDashboardKPIs,
  mockComments,
} from '@/data/mockData';

interface AppState {
  // Data
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

  // Actions: Work Orders
  addWorkOrder: (wo: WorkOrder) => void;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
  deleteWorkOrder: (id: string) => void;
  transitionWorkOrderStatus: (id: string, newStatus: WorkOrderStatus) => void;

  // Actions: Notifications
  addNotification: (notif: Notification) => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  convertNotificationToWO: (notifId: string) => WorkOrder | null;

  // Actions: Equipment
  addEquipment: (eq: Equipment) => void;
  updateEquipment: (id: string, updates: Partial<Equipment>) => void;

  // Actions: Locations
  addLocation: (loc: FunctionalLocation) => void;
  updateLocation: (id: string, updates: Partial<FunctionalLocation>) => void;

  // Actions: Maintenance Plans
  addMaintenancePlan: (plan: MaintenancePlan) => void;
  updateMaintenancePlan: (id: string, updates: Partial<MaintenancePlan>) => void;

  // Actions: Alerts
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;

  // Actions: Materials
  addMaterial: (mat: Material) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;

  // Actions: Work Centers
  addWorkCenter: (wc: WorkCenter) => void;

  // Actions: Users
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;

  // Actions: Labor
  addLaborEntry: (entry: LaborEntry) => void;

  // Actions: Meter Readings
  addMeterReading: (reading: MeterReading) => void;

  // Getters
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

export const useAppStore = create<AppState>()((set, get) => ({
  // Initial data
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

  // ─── Work Order Actions ───
  addWorkOrder: (wo) =>
    set((s) => {
      const entry: AuditLogEntry = {
        auditId: `AUD-${Date.now()}`,
        tableName: 'WorkOrder',
        recordId: wo.workOrderId,
        action: 'Create',
        fieldName: null,
        oldValue: null,
        newValue: `WO ${wo.woNumber} created`,
        userId: wo.createdBy,
        ipAddress: '192.168.1.100',
        timestamp: new Date().toISOString(),
      };
      return { workOrders: [...s.workOrders, wo], auditLog: [...s.auditLog, entry] };
    }),

  updateWorkOrder: (id, updates) =>
    set((s) => {
      const old = s.workOrders.find((w) => w.workOrderId === id);
      if (!old) return s;
      const entries: AuditLogEntry[] = [];
      for (const [key, val] of Object.entries(updates)) {
        const oldVal = (old as unknown as Record<string, unknown>)[key];
        if (oldVal !== val) {
          entries.push({
            auditId: `AUD-${Date.now()}-${key}`,
            tableName: 'WorkOrder',
            recordId: id,
            action: 'Update',
            fieldName: key,
            oldValue: String(oldVal ?? ''),
            newValue: String(val ?? ''),
            userId: 'USR-002',
            ipAddress: '192.168.1.100',
            timestamp: new Date().toISOString(),
          });
        }
      }
      return {
        workOrders: s.workOrders.map((w) =>
          w.workOrderId === id ? { ...w, ...updates } : w
        ),
        auditLog: [...s.auditLog, ...entries],
      };
    }),

  deleteWorkOrder: (id) =>
    set((s) => ({
      workOrders: s.workOrders.filter((w) => w.workOrderId !== id),
    })),

  transitionWorkOrderStatus: (id, newStatus) =>
    set((s) => {
      const wo = s.workOrders.find((w) => w.workOrderId === id);
      if (!wo) return s;
      const entry: AuditLogEntry = {
        auditId: `AUD-${Date.now()}`,
        tableName: 'WorkOrder',
        recordId: id,
        action: 'Update',
        fieldName: 'status',
        oldValue: wo.status,
        newValue: newStatus,
        userId: 'USR-003',
        ipAddress: '192.168.1.100',
        timestamp: new Date().toISOString(),
      };
      return {
        workOrders: s.workOrders.map((w) =>
          w.workOrderId === id ? { ...w, status: newStatus } : w
        ),
        auditLog: [...s.auditLog, entry],
      };
    }),

  // ─── Notification Actions ───
  addNotification: (notif) =>
    set((s) => ({
      notifications: [...s.notifications, notif],
    })),

  updateNotification: (id, updates) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.notificationId === id ? { ...n, ...updates } : n
      ),
    })),

  convertNotificationToWO: (notifId) => {
    const s = get();
    const notif = s.notifications.find((n) => n.notificationId === notifId);
    if (!notif) return null;

    const newWO: WorkOrder = {
      workOrderId: `WO-${Date.now()}`,
      woNumber: `WO-2026-${String(s.workOrders.length + 1).padStart(4, '0')}`,
      type: notif.breakdownFlag ? 'EM' : 'CM',
      priority: notif.priority,
      status: 'Draft',
      functionalLocationId: notif.functionalLocationId,
      equipmentId: notif.equipmentId,
      description: `Converted from ${notif.notificationNumber}: ${notif.description}`,
      workCenterId: 'WC-001',
      supervisorUserId: 'USR-003',
      plannedStart: null,
      plannedFinish: null,
      actualStart: null,
      actualFinish: null,
      costCenterCode: 'CC-PROD-01',
      internalOrder: '',
      breakdownFlag: notif.breakdownFlag,
      safetyCriticalFlag: false,
      plannedCost: 0,
      actualCost: 0,
      createdBy: 'USR-002',
      createdDate: new Date().toISOString(),
      modifiedBy: 'USR-002',
      modifiedDate: new Date().toISOString(),
      isDeleted: false,
    };

    set({
      workOrders: [...s.workOrders, newWO],
      notifications: s.notifications.map((n) =>
        n.notificationId === notifId
          ? { ...n, status: 'Converted' as NotificationStatus, workOrderIds: [...n.workOrderIds, newWO.workOrderId] }
          : n
      ),
    });

    return newWO;
  },

  // ─── Equipment Actions ───
  addEquipment: (eq) =>
    set((s) => ({
      equipment: [...s.equipment, eq],
    })),
  updateEquipment: (id, updates) =>
    set((s) => ({
      equipment: s.equipment.map((e) =>
        e.equipmentId === id ? { ...e, ...updates } : e
      ),
    })),

  // ─── Location Actions ───
  addLocation: (loc) =>
    set((s) => ({
      locations: [...s.locations, loc],
    })),
  updateLocation: (id, updates) =>
    set((s) => ({
      locations: s.locations.map((l) =>
        l.functionalLocationId === id ? { ...l, ...updates } : l
      ),
    })),

  // ─── Maintenance Plan Actions ───
  addMaintenancePlan: (plan) =>
    set((s) => ({
      maintenancePlans: [...s.maintenancePlans, plan],
    })),
  updateMaintenancePlan: (id, updates) =>
    set((s) => ({
      maintenancePlans: s.maintenancePlans.map((p) =>
        p.planId === id ? { ...p, ...updates } : p
      ),
    })),

  // ─── Alert Actions ───
  markAlertRead: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.alertId === id ? { ...a, isRead: true } : a
      ),
    })),
  markAllAlertsRead: () =>
    set((s) => ({
      alerts: s.alerts.map((a) => ({ ...a, isRead: true })),
    })),

  // ─── Material Actions ───
  addMaterial: (mat) =>
    set((s) => ({ materials: [...s.materials, mat] })),
  updateMaterial: (id, updates) =>
    set((s) => ({
      materials: s.materials.map((m) =>
        m.materialId === id ? { ...m, ...updates } : m
      ),
    })),

  // ─── Work Center Actions ───
  addWorkCenter: (wc) =>
    set((s) => ({ workCenters: [...s.workCenters, wc] })),

  // ─── User Actions ───
  addUser: (user) =>
    set((s) => ({ users: [...s.users, user] })),
  updateUser: (id, updates) =>
    set((s) => ({
      users: s.users.map((u) => (u.userId === id ? { ...u, ...updates } : u)),
    })),

  // ─── Labor Actions ───
  addLaborEntry: (entry) =>
    set((s) => ({ laborEntries: [...s.laborEntries, entry] })),

  // ─── Meter Reading Actions ───
  addMeterReading: (reading) =>
    set((s) => ({
      meterReadings: [...s.meterReadings, reading],
    })),

  // ─── Getters ───
  getEquipmentByLocation: (locationId) => {
    const s = get();
    // Include equipment at this location and all sub-locations
    const allLocationIds = new Set<string>();
    const collectChildren = (parentId: string) => {
      allLocationIds.add(parentId);
      s.locations
        .filter((l) => l.parentLocationId === parentId)
        .forEach((l) => collectChildren(l.functionalLocationId));
    };
    collectChildren(locationId);
    return s.equipment.filter((e) => allLocationIds.has(e.functionalLocationId));
  },

  getWorkOrdersByEquipment: (equipmentId) => {
    return get().workOrders.filter((w) => w.equipmentId === equipmentId);
  },

  getOpenWorkOrders: () => {
    return get().workOrders.filter(
      (w) => !['Closed', 'Cancelled'].includes(w.status)
    );
  },

  getOverdueWorkOrders: () => {
    const now = new Date().toISOString();
    return get().workOrders.filter(
      (w) =>
        w.plannedFinish &&
        w.plannedFinish < now &&
        !['Closed', 'Completed', 'Cancelled'].includes(w.status)
    );
  },

  getUnreadAlertCount: () => {
    return get().alerts.filter((a) => !a.isRead).length;
  },

  getWorkOrderOperations: (woId) => {
    return get().operations.filter((o) => o.workOrderId === woId);
  },

  getWorkOrderMaterials: (woId) => {
    return get().woMaterials.filter((m) => m.workOrderId === woId);
  },

  getWorkOrderLabor: (woId) => {
    const opIds = get()
      .operations.filter((o) => o.workOrderId === woId)
      .map((o) => o.operationId);
    return get().laborEntries.filter((l) => opIds.includes(l.operationId));
  },

  getWorkOrderServices: (woId) => {
    return get().externalServices.filter((s) => s.workOrderId === woId);
  },

  getWorkOrderComments: (woId) => {
    return get().comments.filter((c) => c.entityId === woId);
  },

  getNotificationsAwaitingConversion: () => {
    return get().notifications.filter(
      (n) => n.status === 'Open' || n.status === 'In Process'
    );
  },

  getEquipmentMeterReadings: (meterId) => {
    return get().meterReadings.filter((r) => r.meterId === meterId);
  },
}));
