import { api } from '@/lib/api';

/** SOW 3.7.2 row 65. One row per non-deleted work centre, empty ones included. */
export interface BacklogHoursByWorkCenterRow {
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  openWorkOrderCount: number;
  backlogHours: number;
}

/** SOW 3.7.2 row 66. */
export interface TopCostEquipmentRow {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  workOrderCount: number;
  plannedCost: number;
  actualCost: number;
  totalCost: number;
}

/** SOW 3.7.2 row 67. `oldestAgeDays` is null when nothing is awaiting conversion. */
export interface NotificationsAwaitingConversion {
  total: number;
  byPriority: Array<{ priority: string; count: number }>;
  oldestAgeDays: number | null;
}

export const reportService = {
  getBacklog: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/backlog', params),
  getPMCompliance: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/pm-compliance', params),
  getMTBF: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/mtbf', params),
  getMTTR: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/mttr', params),
  getCostSummary: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/cost-summary', params),
  getDowntime: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/downtime', params),
  getMaterialConsumption: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/material-consumption', params),
  /**
   * SOW 3.7.2 row 65. Hours, not a count of work orders: see
   * `GET /reports/backlog-hours-by-work-center`.
   */
  getBacklogHoursByWorkCenter: (params?: Record<string, string>) =>
    api.get<BacklogHoursByWorkCenterRow[]>('/reports/backlog-hours-by-work-center', params),
  /** SOW 3.7.2 row 66. Ten rows, most expensive first. */
  getTopCostEquipment: (params?: Record<string, string>) =>
    api.get<TopCostEquipmentRow[]>('/reports/top-cost-equipment', params),
  /**
   * SOW 3.7.2 row 67. `workCenterId` is not a supported filter here and the
   * route rejects it with a 400, because a notification is not assigned to a
   * work centre.
   */
  getNotificationsAwaitingConversion: (params?: Record<string, string>) =>
    api.get<NotificationsAwaitingConversion>('/reports/notifications-awaiting-conversion', params),
};
