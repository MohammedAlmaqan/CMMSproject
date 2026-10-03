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
  parent?: FunctionalLocation | null;
  children?: FunctionalLocation[];
  equipment?: Equipment[];
  /**
   * SOW 3.1.1 counts, computed server-side by GET /functional-locations/tree.
   * The unsuffixed pair is the node's own count; the Total pair rolls up the
   * node's descendants, which is what the tree badge shows.
   */
  openWorkOrderCount?: number;
  openNotificationCount?: number;
  openWorkOrderCountTotal?: number;
  openNotificationCountTotal?: number;
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
  functionalLocation?: FunctionalLocation | null;
  meters?: EquipmentMeter[];
  bomItems?: EquipmentBOM[];
}

// ─── Equipment Meter (§3.1.2) ───
export interface EquipmentMeter extends Auditable {
  meterId: string;
  equipmentId: string;
  meterName: string;
  unitOfMeasure: string;
  lastReading: number;
  lastReadingDate: string | null;
  equipment?: { equipmentId: string; equipmentCode: string; name: string } | null;
  readings?: MeterReading[];
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

/** SOW 3.1.3: work centre capacity board. See backend/src/utils/capacity.ts. */
export interface CapacityCraftLoad {
  craftId: string;
  plannedHours: number;
}

export interface CapacityDay {
  date: string;
  plannedHours: number;
  capacityHours: number;
  /** null when the centre has no daily capacity set. */
  utilisation: number | null;
  overCapacity: boolean;
  crafts: CapacityCraftLoad[];
}

export interface CapacityBoardEntry {
  workCenterId: string;
  workCenterCode: string;
  name: string;
  capacityHours: number;
  days: CapacityDay[];
  /** Committed hours that have no planned start and so sit on no day. */
  unscheduledHours: number;
  unscheduledWorkOrders: string[];
}

export interface CapacityBoard {
  from: string;
  to: string;
  entries: CapacityBoardEntry[];
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
  material?: { materialCode: string } | null;
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
  workCenterId: string;
  equipmentClass: string | null;
  equipmentId: string | null;
  /**
   * SOW 3.1.4. Each step carries the materials it requires; the read resolves
   * the material, so the screen can show a code and a description rather than an
   * id.
   */
  operations?: TaskListOperationDetail[];
  /** Resolved by the list and detail reads so screens can show codes, not ids. */
  workCenter?: { workCenterId: string; code: string; name: string } | null;
  equipment?: { equipmentId: string; equipmentCode: string; name: string } | null;
}

export interface TaskListMaterialRequirement {
  taskListMaterialId: string;
  taskOperationId: string;
  materialId: string;
  quantity: number;
  material?: Pick<Material, 'materialId' | 'materialCode' | 'description' | 'unitOfMeasure'>;
}

export interface TaskListOperationDetail extends TaskListOperation {
  craft?: Craft;
  materials?: TaskListMaterialRequirement[];
}

/** What the create and update endpoints accept for one step. */
export interface TaskListOperationInput {
  sequenceNumber: number;
  description: string;
  craftId: string;
  plannedHours?: number;
  numberOfTechnicians?: number;
  materials?: { materialId: string; quantity: number }[];
}

export interface TaskListInput {
  code: string;
  description: string;
  equipmentClass?: string | null;
  equipmentId?: string | null;
  workCenterId: string;
  operations?: TaskListOperationInput[];
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
  /** SOW 3.2.2 key field: what was found at the asset, as distinct from the report. */
  damagesObservations?: string | null;
  breakdownFlag: boolean;
  status: NotificationStatus;
  functionalLocation?: { functionalLocationId: string; locationCode: string; description: string };
  equipment?: { equipmentId: string; equipmentCode: string; name: string };
  reportedBy?: { userId: string; fullName: string; username: string };
  workOrders?: { workOrder: { workOrderId: string; woNumber: string; status: string; type: string } }[];
  comments?: Comment[];
  workOrderIds?: string[];
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
  /** SOW 3.3.3 "Reported By": who reported the fault, not who raised the record. */
  reportedByUserId?: string;
  reportedBy?: Pick<User, 'userId' | 'fullName' | 'username'>;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  costCenterCode: string;
  internalOrder: string;
  breakdownFlag: boolean;
  safetyCriticalFlag: boolean;
  /** SOW 3.1.4 (D5): root cause of a breakdown, chosen from CauseCode. Required before a breakdown can be completed. */
  causeCodeId: string | null;
  causeCode?: CauseCode | null;
  /** SOW 3.3.3 long-text field: multi-line plain text, not WYSIWYG. */
  safetyNotes: string | null;
  /** SOW 3.3.3 long-text field: multi-line plain text, not WYSIWYG. */
  completionRemarks: string | null;
  /**
   * SOW 3.3.1 (row 24): calibration capture, only meaningful on a CAL work
   * order. All nullable so non-calibration work orders are unaffected.
   */
  calibrationResult?: 'Pass' | 'Fail' | null;
  calibrationAsFound?: string | null;
  calibrationAsLeft?: string | null;
  calibrationReferenceStandard?: string | null;
  calibrationDueDate?: string | null;
  calibrationIntervalValue?: number | null;
  calibrationIntervalUnit?: 'Days' | 'Months' | 'Years' | null;
  plannedCost: number;
  actualCost: number;
}

/**
 * SOW 3.1.4. `taskListId` is accepted on create only: the server copies the
 * template's steps onto the new work order in the same transaction and does not
 * persist a back-reference, so it is not a field of the row that comes back.
 */
export type WorkOrderCreateInput = Partial<WorkOrder> & { taskListId?: string | null };

// ─── Work Order History (§3.6) ───
// One immutable snapshot of a work order, taken at each status change. The
// `snapshot` object is the frozen copy of the work order's own record.
export interface WorkOrderSnapshotEntry {
  snapshotId: string;
  workOrderId: string;
  status: string;
  snapshot: Record<string, unknown>;
  takenBy: { userId: string; fullName: string; username: string };
  takenAt: string;
}

// ─── Equipment Maintenance History (§3.6) ───
export interface EquipmentHistoryEntry {
  workOrderId: string;
  woNumber: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  breakdownFlag: boolean;
  description: string;
  createdDate: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  cost: number | null;
  plannedCost: number | null;
  downtimeHours: number | null;
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
  /**
   * SOW 3.1.5. The operation this part is issued to, or null for a part that is
   * common to the whole job. The read resolves the operation so the materials tab
   * can group lines under the step that needs them.
   */
  operationId?: string | null;
  operation?: WorkOrderOperation;
  material?: Material;
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
// SOW 3.3.6: "additional miscellaneous costs (travel, permits) as line items".
// Must stay in step with serviceCostCategories in backend/src/utils/validation.ts.
export const serviceCostCategories = ['Service', 'Travel', 'Permit', 'Other'] as const;
export type ServiceCostCategory = (typeof serviceCostCategories)[number];

export interface ExternalServiceCost {
  serviceCostId: string;
  workOrderId: string;
  vendor: string;
  description: string;
  cost: number;
  invoiceRef: string;
  /** SOW 3.3.6: Service is a contractor invoice; Travel/Permit/Other are misc. */
  category?: ServiceCostCategory;
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

export interface UserOption {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
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
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedByUserId: string;
  createdBy: string;
  createdDate: string;
  modifiedBy: string;
  modifiedDate: string;
  isDeleted: boolean;
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
