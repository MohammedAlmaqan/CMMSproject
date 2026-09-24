-- DropIndex
DROP INDEX "Equipment_equipmentCode_key";

-- DropIndex
DROP INDEX "FunctionalLocation_locationCode_key";

-- DropIndex
DROP INDEX "Material_materialCode_key";

-- DropIndex
DROP INDEX "Notification_notificationNumber_key";

-- DropIndex
DROP INDEX "TaskList_code_key";

-- DropIndex
DROP INDEX "User_username_key";

-- DropIndex
DROP INDEX "WorkCenter_code_key";

-- DropIndex
DROP INDEX "WorkOrder_sourcePlanId_sourcePlanCycle_key";

-- DropIndex
DROP INDEX "WorkOrder_woNumber_key";

-- CreateIndex (F3: partial unique on active rows only — soft-deleted rows free their code/number for reuse)
CREATE UNIQUE INDEX "Equipment_equipmentCode_active_key" ON "Equipment"("equipmentCode") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "FunctionalLocation_locationCode_active_key" ON "FunctionalLocation"("locationCode") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "Material_materialCode_active_key" ON "Material"("materialCode") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "Notification_notificationNumber_active_key" ON "Notification"("notificationNumber") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "TaskList_code_active_key" ON "TaskList"("code") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "User_username_active_key" ON "User"("username") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "WorkCenter_code_active_key" ON "WorkCenter"("code") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "WorkOrder_sourcePlanId_sourcePlanCycle_active_key" ON "WorkOrder"("sourcePlanId", "sourcePlanCycle") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "WorkOrder_woNumber_active_key" ON "WorkOrder"("woNumber") WHERE "isDeleted" = false;
