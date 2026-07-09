// ============================================================
// CommandPulse CMMS — Core Type Definitions
// Based on SOW Database Design (Section 5.3)
// ============================================================

// ─── Base Auditable Entity ───
export interface Auditable {
  createdBy: string;
  createdDate: string;
  modifiedBy: string;
  modifiedDate: string;
  isDeleted: boolean;
}

// ─── Functional Location (§3.1.1) ───
export interface FunctionalLocation extends Auditable {
  functionalLocationId: string;
  locationCode: string;
  description: string;
  parentLocationId: string | null;
  locationType: 'Plant' | 'Area' | 'Unit' | 'Sub-unit' | 'System';
  operationalStatus: 'Active' | 'Inactive';
  installationDate: string | null;
  gpsCoordinates: string | null;
  safetyCritical: boolean;
}

// ─── Equipment (§3.1.2) ───
export interface Equipment extends Auditable {
  equipmentId: string;
  equipmentCode: string;
  name: string;
  description: string;
  functionalLocationId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  equipmentClass: string;
  criticality: 'A' | 'B' | 'C';
  installationDate: string | null;
  warrantyExpiryDate: string | null;
  operationalStatus: 'Active' | 'Inactive' | 'Decommissioned';
  technicalParameters: Record<string, string>;
}

// ─── Equipment Meter (§3.1.2) ───
export interface EquipmentMeter extends Auditable {
  meterId: string;
  equipmentId: string;
  meterName: string;
  unitOfMeasure: string;
  lastReading: number;
  lastReadingDate: string | null;
}

export interface MeterReading extends Auditable {
  readingId: string;
  meterId: string;
  readingValue: number;
  readingDate: string;
  notes: string;
}

// ─── Work Center (§3.1.3) ───
export interface WorkCenter extends Auditable {
  workCenterId: string;
  code: string;
  name: string;
  dailyCapacityHours: number;
  costRatePerHour: number;
  isActive: boolean;
}

// ─── Craft (§3.1.3) ───
export interface Craft extends Auditable {
  craftId: string;
  workCenterId: string;
  craftCode: string;
  description: string;
  hourlyRate: number;
}

// ─── Material / Spare Parts (§3.1.5) ───
export interface Material extends Auditable {
  materialId: string;
  materialCode: string;
  description: string;
  unitOfMeasure: string;
  standardCost: number;
  currentStock: number;
}

// ─── Equipment BOM (§3.1.2) ───
export interface EquipmentBOM {
  bomId: string;
  equipmentId: string;
  materialId: string;
  quantity: number;
}

// ─── Failure Code (§3.1.4) ───
export interface FailureCode extends Auditable {
  failureCodeId: string;
  parentCodeId: string | null;
  code: string;
  description: string;
}

// ─── Cause Code (§3.1.4) ───
export interface CauseCode extends Auditable {
  causeCodeId: string;
  code: string;
  description: string;
}

// ─── Task List (§3.1.4) ───
export interface TaskList extends Auditable {
  taskListId: string;
  code: string;
  description: string;
  equipmentClass: string | null;
  equipmentId: string | null;
}

export interface TaskListOperation extends Auditable {
  taskOperationId: string;
  taskListId: string;
  sequenceNumber: number;
  description: string;
  craftId: string;
  plannedHours: number;
  numberOfTechnicians: number;
}

// ─── Notification (§3.2) ───
export type NotificationType = 'M1' | 'M2' | 'M3';
export type NotificationStatus = 'Open' | 'In Process' | 'Completed' | 'Converted';
export type Priority = 'High' | 'Medium' | 'Low';

export interface Notification extends Auditable {
  notificationId: string;
  notificationNumber: string;
  type: NotificationType;
  priority: Priority;
  functionalLocationId: string;
  equipmentId: string | null;
  reportedByUserId: string;
  description: string;
  breakdownFlag: boolean;
  status: NotificationStatus;
  workOrderIds: string[];
}

// ─── Work Order (§3.3) ───
export type WorkOrderType = 'CM' | 'PM' | 'PdM' | 'EM' | 'CAL';
export type WorkOrderStatus =
  | 'Draft'
  | 'Planned'
  | 'Scheduled'
  | 'In Progress'
  | 'Suspended'
  | 'Completed'
  | 'Closed'
  | 'Cancelled';

export interface WorkOrder extends Auditable {
  workOrderId: string;
  woNumber: string;
  type: WorkOrderType;
  priority: Priority;
  status: WorkOrderStatus;
  functionalLocationId: string;
  equipmentId: string | null;
  description: string;
  workCenterId: string;
  supervisorUserId: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  costCenterCode: string;
  internalOrder: string;
  breakdownFlag: boolean;
  safetyCriticalFlag: boolean;
  plannedCost: number;
  actualCost: number;
}

// ─── Work Order Operation (§3.3.3) ───
export type OperationStatus = 'Pending' | 'In Progress' | 'Completed';

export interface WorkOrderOperation {
  operationId: string;
  workOrderId: string;
  sequenceNumber: number;
  description: string;
  craftId: string;
  plannedHours: number;
  numberOfTechnicians: number;
  actualHours: number;
  status: OperationStatus;
}

// ─── Work Order Material (§3.3.4) ───
export interface WorkOrderMaterial {
  woMaterialId: string;
  workOrderId: string;
  materialId: string;
  plannedQuantity: number;
  actualQuantity: number;
  unitCost: number;
  reservationQuantity: number;
}

// ─── Labor Entry (§3.3.5) ───
export interface LaborEntry extends Auditable {
  laborEntryId: string;
  operationId: string;
  userId: string;
  hoursWorked: number;
  entryDateTime: string;
  notes: string;
}

// ─── External Service Cost (§3.3.6) ───
export interface ExternalServiceCost {
  serviceCostId: string;
  workOrderId: string;
  vendor: string;
  description: string;
  cost: number;
  invoiceRef: string;
}

// ─── Safety Checklist (§3.3.7) ───
export interface SafetyChecklistTemplate extends Auditable {
  checklistTemplateId: string;
  name: string;
  description: string;
  isMandatory: boolean;
}

export interface ChecklistItem {
  itemId: string;
  checklistTemplateId: string;
  sequenceNumber: number;
  description: string;
}

export interface WorkOrderChecklist {
  woChecklistId: string;
  workOrderId: string;
  checklistTemplateId: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  signedBy: string | null;
  signedDate: string | null;
}

export interface WorkOrderChecklistItem {
  woChecklistItemId: string;
  woChecklistId: string;
  itemId: string;
  response: 'Yes' | 'No' | 'NA';
  comment: string;
}

// ─── Maintenance Plan (§3.4) ───
export type StrategyType = 'Time' | 'Meter' | 'Combined';
export type IntervalUnit = 'Days' | 'Weeks' | 'Months';

export interface MaintenancePlan extends Auditable {
  planId: string;
  planCode: string;
  description: string;
  equipmentId: string | null;
  functionalLocationId: string | null;
  workCenterId: string;
  taskListId: string;
  strategyType: StrategyType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  callHorizonValue: number;
  callHorizonUnit: 'Days' | 'Units';
  startDate: string;
  endDate: string | null;
  activeFlag: boolean;
}

export interface MaintenancePlanMeter {
  planMeterId: string;
  planId: string;
  meterId: string;
  meterInterval: number;
}

// ─── Audit Log (§3.6) ───
export interface AuditLogEntry {
  auditId: string;
  tableName: string;
  recordId: string;
  action: 'Create' | 'Update' | 'Delete';
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  userId: string;
  ipAddress: string;
  timestamp: string;
}

// ─── User & Roles (§2.2) ───
export type UserRole =
  | 'Administrator'
  | 'Maintenance Planner'
  | 'Maintenance Supervisor'
  | 'Technician'
  | 'Requester'
  | 'View-Only';

export interface User {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  workCenterId: string | null;
  isActive: boolean;
  lastLogin: string | null;
}

// ─── System Alert (§3.8) ───
export interface SystemAlert {
  alertId: string;
  alertType: 'WO_Assigned' | 'WO_Overdue' | 'PM_Generation' | 'High_Priority_Notification';
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdDate: string;
  relatedEntityId: string;
  relatedEntityType: string;
}

// ─── Comment / Attachment (§3.3.8) ───
export interface Comment {
  commentId: string;
  entityType: 'WorkOrder' | 'Notification' | 'Equipment';
  entityId: string;
  userId: string;
  content: string;
  createdDate: string;
}

export interface Attachment {
  attachmentId: string;
  entityType: 'WorkOrder' | 'Notification' | 'Equipment';
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedDate: string;
  fileUrl: string;
}

// ─── Cost Splitting (§3.5.2) ───
export interface CostSplit {
  splitId: string;
  workOrderId: string;
  costCenterCode: string;
  percentage: number;
}

// ─── Dashboard KPI Types ───
export interface DashboardKPIs {
  activeWorkOrders: number;
  overdueWorkOrders: number;
  scheduledToday: number;
  completionRate: number;
  openNotifications: number;
  pmCompliance: number;
}

export interface WorkOrderBacklogItem {
  status: WorkOrderStatus;
  count: number;
  totalHours: number;
}

export interface CostSummaryItem {
  costCenterCode: string;
  plannedCost: number;
  actualCost: number;
  variance: number;
}

// ─── View Modes ───
export type ViewMode = 'list' | 'board' | 'calendar';

// ─── Command Palette Item ───
export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: string;
  action: () => void;
}
