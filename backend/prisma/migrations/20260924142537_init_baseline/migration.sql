-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workCenterId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "tokenId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "FunctionalLocation" (
    "functionalLocationId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parentLocationId" TEXT,
    "locationType" TEXT NOT NULL,
    "operationalStatus" TEXT NOT NULL DEFAULT 'Active',
    "installationDate" TIMESTAMP(3),
    "gpsCoordinates" TEXT,
    "safetyCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FunctionalLocation_pkey" PRIMARY KEY ("functionalLocationId")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "equipmentId" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "functionalLocationId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "equipmentClass" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "installationDate" TIMESTAMP(3),
    "warrantyExpiryDate" TIMESTAMP(3),
    "operationalStatus" TEXT NOT NULL DEFAULT 'Active',
    "technicalParameters" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("equipmentId")
);

-- CreateTable
CREATE TABLE "EquipmentMeter" (
    "meterId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "meterName" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "lastReading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastReadingDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EquipmentMeter_pkey" PRIMARY KEY ("meterId")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "readingId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "readingValue" DOUBLE PRECISION NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("readingId")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "workCenterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dailyCapacityHours" DOUBLE PRECISION NOT NULL,
    "costRatePerHour" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("workCenterId")
);

-- CreateTable
CREATE TABLE "Craft" (
    "craftId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "craftCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Craft_pkey" PRIMARY KEY ("craftId")
);

-- CreateTable
CREATE TABLE "Material" (
    "materialId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "standardCost" DOUBLE PRECISION NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("materialId")
);

-- CreateTable
CREATE TABLE "EquipmentBOMMaterial" (
    "bomId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EquipmentBOMMaterial_pkey" PRIMARY KEY ("bomId")
);

-- CreateTable
CREATE TABLE "FailureCode" (
    "failureCodeId" TEXT NOT NULL,
    "parentCodeId" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FailureCode_pkey" PRIMARY KEY ("failureCodeId")
);

-- CreateTable
CREATE TABLE "CauseCode" (
    "causeCodeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CauseCode_pkey" PRIMARY KEY ("causeCodeId")
);

-- CreateTable
CREATE TABLE "TaskList" (
    "taskListId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "equipmentClass" TEXT,
    "equipmentId" TEXT,
    "workCenterId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("taskListId")
);

-- CreateTable
CREATE TABLE "TaskListOperation" (
    "taskOperationId" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "craftId" TEXT NOT NULL,
    "plannedHours" DOUBLE PRECISION NOT NULL,
    "numberOfTechnicians" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TaskListOperation_pkey" PRIMARY KEY ("taskOperationId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "notificationId" TEXT NOT NULL,
    "notificationNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "functionalLocationId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "reportedByUserId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "breakdownFlag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "workOrderId" TEXT NOT NULL,
    "woNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "functionalLocationId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "description" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "supervisorUserId" TEXT NOT NULL,
    "plannedStart" TIMESTAMP(3),
    "plannedFinish" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualFinish" TIMESTAMP(3),
    "costCenterCode" TEXT NOT NULL DEFAULT '',
    "internalOrder" TEXT NOT NULL DEFAULT '',
    "breakdownFlag" BOOLEAN NOT NULL DEFAULT false,
    "safetyCriticalFlag" BOOLEAN NOT NULL DEFAULT false,
    "plannedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "sourcePlanId" TEXT,
    "sourcePlanCycle" TEXT,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("workOrderId")
);

-- CreateTable
CREATE TABLE "WorkOrderNotifLink" (
    "workOrderId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,

    CONSTRAINT "WorkOrderNotifLink_pkey" PRIMARY KEY ("workOrderId","notificationId")
);

-- CreateTable
CREATE TABLE "WorkOrderOperation" (
    "operationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "craftId" TEXT NOT NULL,
    "plannedHours" DOUBLE PRECISION NOT NULL,
    "numberOfTechnicians" INTEGER NOT NULL DEFAULT 1,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderOperation_pkey" PRIMARY KEY ("operationId")
);

-- CreateTable
CREATE TABLE "WorkOrderMaterial" (
    "woMaterialId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservationQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WorkOrderMaterial_pkey" PRIMARY KEY ("woMaterialId")
);

-- CreateTable
CREATE TABLE "LaborEntry" (
    "laborEntryId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "entryDateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("laborEntryId")
);

-- CreateTable
CREATE TABLE "ExternalServiceCost" (
    "serviceCostId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "invoiceRef" TEXT NOT NULL,

    CONSTRAINT "ExternalServiceCost_pkey" PRIMARY KEY ("serviceCostId")
);

-- CreateTable
CREATE TABLE "SafetyChecklistTemplate" (
    "checklistTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SafetyChecklistTemplate_pkey" PRIMARY KEY ("checklistTemplateId")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "itemId" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "WorkOrderChecklist" (
    "woChecklistId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "signedBy" TEXT,
    "signedDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderChecklist_pkey" PRIMARY KEY ("woChecklistId")
);

-- CreateTable
CREATE TABLE "WorkOrderChecklistItem" (
    "woChecklistItemId" TEXT NOT NULL,
    "woChecklistId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("woChecklistItemId")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "planId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "equipmentId" TEXT,
    "functionalLocationId" TEXT,
    "workCenterId" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "intervalValue" INTEGER NOT NULL,
    "intervalUnit" TEXT NOT NULL,
    "callHorizonValue" INTEGER NOT NULL DEFAULT 7,
    "callHorizonUnit" TEXT NOT NULL DEFAULT 'Days',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "activeFlag" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("planId")
);

-- CreateTable
CREATE TABLE "MaintenancePlanMeter" (
    "planMeterId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "meterInterval" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MaintenancePlanMeter_pkey" PRIMARY KEY ("planMeterId")
);

-- CreateTable
CREATE TABLE "CostSplit" (
    "splitId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CostSplit_pkey" PRIMARY KEY ("splitId")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "auditId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("auditId")
);

-- CreateTable
CREATE TABLE "SystemAlert" (
    "alertId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("alertId")
);

-- CreateTable
CREATE TABLE "Comment" (
    "commentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("commentId")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "configId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("configId")
);

-- CreateTable
CREATE TABLE "SchedulerRun" (
    "schedulerRunId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "plansEvaluated" INTEGER NOT NULL DEFAULT 0,
    "wosCreated" INTEGER NOT NULL DEFAULT 0,
    "wosSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "SchedulerRun_pkey" PRIMARY KEY ("schedulerRunId")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "code" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionalLocation_locationCode_key" ON "FunctionalLocation"("locationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_equipmentCode_key" ON "Equipment"("equipmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_materialCode_key" ON "Material"("materialCode");

-- CreateIndex
CREATE UNIQUE INDEX "TaskList_code_key" ON "TaskList"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_notificationNumber_key" ON "Notification"("notificationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_woNumber_key" ON "WorkOrder"("woNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_sourcePlanId_sourcePlanCycle_key" ON "WorkOrder"("sourcePlanId", "sourcePlanCycle");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlan_planCode_key" ON "MaintenancePlan"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SchedulerRun_status_heartbeatAt_idx" ON "SchedulerRun"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "SchedulerRun_completedAt_idx" ON "SchedulerRun"("completedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("workCenterId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionalLocation" ADD CONSTRAINT "FunctionalLocation_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_functionalLocationId_fkey" FOREIGN KEY ("functionalLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMeter" ADD CONSTRAINT "EquipmentMeter_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "EquipmentMeter"("meterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Craft" ADD CONSTRAINT "Craft_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("workCenterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentBOMMaterial" ADD CONSTRAINT "EquipmentBOMMaterial_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentBOMMaterial" ADD CONSTRAINT "EquipmentBOMMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("materialId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureCode" ADD CONSTRAINT "FailureCode_parentCodeId_fkey" FOREIGN KEY ("parentCodeId") REFERENCES "FailureCode"("failureCodeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("workCenterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListOperation" ADD CONSTRAINT "TaskListOperation_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("taskListId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListOperation" ADD CONSTRAINT "TaskListOperation_craftId_fkey" FOREIGN KEY ("craftId") REFERENCES "Craft"("craftId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_functionalLocationId_fkey" FOREIGN KEY ("functionalLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_functionalLocationId_fkey" FOREIGN KEY ("functionalLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("workCenterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNotifLink" ADD CONSTRAINT "WorkOrderNotifLink_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNotifLink" ADD CONSTRAINT "WorkOrderNotifLink_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("notificationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderOperation" ADD CONSTRAINT "WorkOrderOperation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderOperation" ADD CONSTRAINT "WorkOrderOperation_craftId_fkey" FOREIGN KEY ("craftId") REFERENCES "Craft"("craftId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMaterial" ADD CONSTRAINT "WorkOrderMaterial_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMaterial" ADD CONSTRAINT "WorkOrderMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("materialId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "WorkOrderOperation"("operationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalServiceCost" ADD CONSTRAINT "ExternalServiceCost_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "SafetyChecklistTemplate"("checklistTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "SafetyChecklistTemplate"("checklistTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_woChecklistId_fkey" FOREIGN KEY ("woChecklistId") REFERENCES "WorkOrderChecklist"("woChecklistId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("workCenterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("taskListId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanMeter" ADD CONSTRAINT "MaintenancePlanMeter_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanMeter" ADD CONSTRAINT "MaintenancePlanMeter_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "EquipmentMeter"("meterId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSplit" ADD CONSTRAINT "CostSplit_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAlert" ADD CONSTRAINT "SystemAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

