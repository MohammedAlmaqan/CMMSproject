-- DropForeignKey
ALTER TABLE "MaintenancePlanTarget" DROP CONSTRAINT "MaintenancePlanTarget_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenancePlanTarget" DROP CONSTRAINT "MaintenancePlanTarget_functionalLocationId_fkey";

-- DropIndex
DROP INDEX "WorkOrder_reportedByUserId_idx";

-- DropIndex
DROP INDEX "WorkOrderMaterial_operationId_idx";

-- AlterTable
ALTER TABLE "TaskListMaterial" ALTER COLUMN "modifiedDate" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WorkOrderSnapshot" (
    "snapshotId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "takenByUserId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderSnapshot_pkey" PRIMARY KEY ("snapshotId")
);

-- CreateIndex
CREATE INDEX "WorkOrderSnapshot_workOrderId_takenAt_idx" ON "WorkOrderSnapshot"("workOrderId", "takenAt");

-- AddForeignKey
ALTER TABLE "WorkOrderSnapshot" ADD CONSTRAINT "WorkOrderSnapshot_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("workOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderSnapshot" ADD CONSTRAINT "WorkOrderSnapshot_takenByUserId_fkey" FOREIGN KEY ("takenByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_functionalLocationId_fkey" FOREIGN KEY ("functionalLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "TaskListMaterial_op_material_key" RENAME TO "TaskListMaterial_taskOperationId_materialId_key";
