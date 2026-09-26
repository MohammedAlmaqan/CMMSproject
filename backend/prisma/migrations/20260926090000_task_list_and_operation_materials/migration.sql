-- SOW 3.1.4 and 3.1.5: the materials a task list step requires, and the
-- operation a material is issued to on a work order.
--
-- Both changes place materials against an operation rather than against a whole
-- job. A part belongs to the step that consumes it: that is what tells the store
-- which shelf must have stock before the step can start, and it is what makes
-- material cost land against the right operation in the cost rollup.

-- CreateTable
CREATE TABLE "TaskListMaterial" (
    "taskListMaterialId" TEXT NOT NULL,
    "taskOperationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    "modifiedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskListMaterial_pkey" PRIMARY KEY ("taskListMaterialId")
);

-- A step cannot require the same part twice at two different quantities; that
-- is a data-entry mistake and summing it later would hide the mistake.
CREATE UNIQUE INDEX "TaskListMaterial_op_material_key" ON "TaskListMaterial"("taskOperationId", "materialId");

-- CreateIndex
CREATE INDEX "TaskListMaterial_materialId_idx" ON "TaskListMaterial"("materialId");

-- AlterTable
-- Nullable, and added without a default, so no table rewrite and no backfill:
-- existing material lines predate the link and remain valid as job-level lines.
ALTER TABLE "WorkOrderMaterial" ADD COLUMN     "operationId" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrderMaterial_operationId_idx" ON "WorkOrderMaterial"("operationId");

-- AddForeignKey
-- RESTRICT on the task list side: a requirement is a statement about what the
-- step needs. Deleting the step must not leave that statement behind with no
-- owner, so the delete is refused and the requirement is removed first.
ALTER TABLE "TaskListMaterial" ADD CONSTRAINT "TaskListMaterial_taskOperationId_fkey" FOREIGN KEY ("taskOperationId") REFERENCES "TaskListOperation"("taskOperationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListMaterial" ADD CONSTRAINT "TaskListMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("materialId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL on the work order side, which is the opposite choice on purpose. The
-- material was really issued and its cost is really incurred, so deleting the
-- operation must not delete the issue. The line falls back to job-level, which
-- keeps the cost in the rollup and loses only the attribution.
ALTER TABLE "WorkOrderMaterial" ADD CONSTRAINT "WorkOrderMaterial_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "WorkOrderOperation"("operationId") ON DELETE SET NULL ON UPDATE CASCADE;
