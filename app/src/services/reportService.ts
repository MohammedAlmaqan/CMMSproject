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

/** SOW 3.7.1 row 60. The same open backlog sliced three ways. */
export interface BacklogReport {
  byStatus: Array<{ status: string; count: number; totalPlannedHours: number }>;
  byPriority: Array<{ priority: string; count: number; totalPlannedHours: number }>;
  byWorkCenter: Array<{
    workCenterId: string;
    workCenterCode: string;
    workCenterName: string;
    count: number;
    totalPlannedHours: number;
  }>;
}

/** SOW 3.7.1 row 61. `scheduledPM` is from the plan schedule, not raised orders. */
export interface PMComplianceReport {
  period: string;
  scheduledPM: number;
  completedPM: number;
  complianceRate: number;
  excludedMeterPlans: number;
  exclusionNote: string;
}

/** SOW 3.7.1 row 62. `excludedIncomplete` counts breakdowns with no duration. */
export interface MTTRReport {
  byEquipment: Array<{ equipmentId: string; mttrHours: number; breakdownCount: number }>;
  byLocation: Array<{
    functionalLocationId: string;
    locationCode: string;
    description: string;
    mttrHours: number;
    breakdownCount: number;
  }>;
  excludedIncomplete: number;
}

/** SOW 3.7.1 row 63. Budget comparison is waived (D-13). */
export interface CostSummaryReport {
  period: string;
  budgetNote: string;
  byCostCenter: Array<{
    costCenterCode: string;
    plannedCost: number;
    actualCost: number;
    variance: number;
    workOrderCount: number;
  }>;
  byLocation: Array<{
    functionalLocationId: string;
    locationCode: string;
    description: string;
    plannedCost: number;
    actualCost: number;
    variance: number;
    workOrderCount: number;
  }>;
}

/** SOW 3.7.1 row 64. Cost is sum of quantity x unit cost over the lines. */
export interface MaterialConsumptionReport {
  byMaterial: Array<{
    materialId: string;
    materialCode: string;
    description: string;
    unitOfMeasure: string;
    totalQuantityUsed: number;
    totalCost: number;
    usageCount: number;
  }>;
  byWorkOrder: Array<{
    workOrderId: string;
    woNumber: string;
    totalQuantityUsed: number;
    totalCost: number;
    lineCount: number;
  }>;
  byEquipment: Array<{
    equipmentId: string;
    equipmentCode: string;
    equipmentName: string;
    totalQuantityUsed: number;
    totalCost: number;
    lineCount: number;
  }>;
}

export interface MbtfReportRow {
  equipmentId: string;
  mtbfHours: number;
}

export interface DowntimeReportRow {
  equipmentId: string;
  totalDowntimeHours: number;
}

export const reportService = {
  /** SOW 3.7.1 row 60: by status, by priority and by work centre. */
  getBacklog: (params?: Record<string, string>) =>
    api.get<BacklogReport>('/reports/backlog', params),
  /** SOW 3.7.1 row 61: scheduled occurrences, not raised work orders. */
  getPMCompliance: (params?: Record<string, string>) =>
    api.get<PMComplianceReport>('/reports/pm-compliance', params),
  getMTBF: (params?: Record<string, string>) =>
    api.get<MbtfReportRow[]>('/reports/mtbf', params),
  /** SOW 3.7.1 row 62: per equipment and per location. */
  getMTTR: (params?: Record<string, string>) =>
    api.get<MTTRReport>('/reports/mttr', params),
  /** SOW 3.7.1 row 63: by cost centre and by location. */
  getCostSummary: (params?: Record<string, string>) =>
    api.get<CostSummaryReport>('/reports/cost-summary', params),
  getDowntime: (params?: Record<string, string>) =>
    api.get<DowntimeReportRow[]>('/reports/downtime', params),
  /** SOW 3.7.1 row 64: by material, by work order and by equipment. */
  getMaterialConsumption: (params?: Record<string, string>) =>
    api.get<MaterialConsumptionReport>('/reports/material-consumption', params),
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
