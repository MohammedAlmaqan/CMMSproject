-- C.15: database constraints for status and type values.
--
-- Permitted values for these columns used to exist only in the Prisma schema
-- comments and the zod request schemas at the API boundary. This migration
-- pins each closed value domain with a CHECK constraint, keeping the pattern
-- established by `MaintenancePlanTarget_exactly_one_target`: free text plus
-- constraints, not native `CREATE TYPE` enums, so every one of these stays
-- reversible in place.
--
-- Domains mirror the zod enums in backend/src/utils/validation.ts and the
-- value lists in the schema comments. `SystemAlert.alertType` additionally
-- admits `Account_Lockout` (written by the auth route on lockout), which the
-- schema comment omits. `Comment.entityType` admits `MaintenancePlan`
-- (validation.ts commentEntityTypeSchema), which the schema comment omits.
--
-- CHECK constraints pass for NULL, so the nullable columns (calibrationResult,
-- calibrationIntervalUnit, response) remain valid when unanswered.

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_status_check" CHECK ("status" IN ('Draft', 'Planned', 'Scheduled', 'In Progress', 'Suspended', 'Completed', 'Closed', 'Cancelled'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_type_check" CHECK ("type" IN ('CM', 'PM', 'PdM', 'EM', 'CAL'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_priority_check" CHECK ("priority" IN ('High', 'Medium', 'Low'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_calibrationResult_check" CHECK ("calibrationResult" IN ('Pass', 'Fail'));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_calibrationIntervalUnit_check" CHECK ("calibrationIntervalUnit" IN ('Days', 'Months', 'Years'));

ALTER TABLE "WorkOrderOperation" ADD CONSTRAINT "WorkOrderOperation_status_check" CHECK ("status" IN ('Pending', 'In Progress', 'Completed'));

ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_status_check" CHECK ("status" IN ('Pending', 'In Progress', 'Completed'));

ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_response_check" CHECK ("response" IN ('Yes', 'No', 'NA'));

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check" CHECK ("type" IN ('M1', 'M2', 'M3'));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_priority_check" CHECK ("priority" IN ('High', 'Medium', 'Low'));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_status_check" CHECK ("status" IN ('Open', 'In Process', 'Completed', 'Converted'));

ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_strategyType_check" CHECK ("strategyType" IN ('Time', 'Meter', 'Combined'));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_intervalUnit_check" CHECK ("intervalUnit" IN ('Days', 'Weeks', 'Months'));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_callHorizonUnit_check" CHECK ("callHorizonUnit" IN ('Days', 'Units'));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_priority_check" CHECK ("priority" IN ('High', 'Medium', 'Low'));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_generatedWorkOrderStatus_check" CHECK ("generatedWorkOrderStatus" IN ('Draft', 'Planned'));

ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_criticality_check" CHECK ("criticality" IN ('S', 'A', 'B', 'C'));
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_operationalStatus_check" CHECK ("operationalStatus" IN ('Active', 'Inactive', 'Decommissioned'));

ALTER TABLE "FunctionalLocation" ADD CONSTRAINT "FunctionalLocation_locationType_check" CHECK ("locationType" IN ('Plant', 'Area', 'Unit', 'Sub-unit', 'System'));
ALTER TABLE "FunctionalLocation" ADD CONSTRAINT "FunctionalLocation_operationalStatus_check" CHECK ("operationalStatus" IN ('Active', 'Inactive'));

ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('View-Only', 'Requester', 'Technician', 'Maintenance Supervisor', 'Maintenance Planner', 'Administrator'));

ALTER TABLE "SystemAlert" ADD CONSTRAINT "SystemAlert_alertType_check" CHECK ("alertType" IN ('WO_Assigned', 'WO_Overdue', 'PM_Generation', 'PM_Generation_Failed', 'High_Priority_Notification', 'Account_Lockout'));

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_entityType_check" CHECK ("entityType" IN ('WorkOrder', 'Notification', 'Equipment', 'MaintenancePlan'));

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_entityType_check" CHECK ("entityType" IN ('WorkOrder', 'Notification', 'Equipment'));