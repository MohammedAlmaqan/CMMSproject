-- Phase E: the soft-delete sweep. Sixteen transactional/child/system tables
-- still hard-delete and lose history (operations, issued materials, service
-- costs, cost splits, checklist rows, checklist responses, BOM lines, plan
-- targets and meters, comment/notification links, alerts, config keys and
-- scheduler runs). Each gains the same audit trail + isDeleted the 18 already
-- soft-deletable models carry, so delete becomes a hidden row, not a lost one.
--
-- F3: the few @unique columns among them are replaced by partial unique
-- indexes (WHERE "isDeleted" = false), so a soft-deleted row frees its key or
-- its pair for reuse. Postgres treats NULLs as distinct in a unique index, so
-- the MaintenancePlanTarget CHECK constraint (exactly one asset) is unaffected.

-- 1. Add the audit trail + isDeleted to the 13 tables that lack audit columns.
ALTER TABLE "EquipmentBOMMaterial"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrderNotifLink"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrderMaterial"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ExternalServiceCost"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChecklistItem"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrderChecklistItem"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MaintenancePlanTarget"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MaintenancePlanMeter"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CostSplit"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SystemAlert"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Comment"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SystemConfig"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SchedulerRun"
    ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "modifiedBy" TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN "modifiedDate" TIMESTAMP(3),
    ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill modifiedDate for the tables above, then make it NOT NULL so the
--    column matches the @updatedAt field. Every existing row is annotated as
--    modified at migrate time.
UPDATE "EquipmentBOMMaterial" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "EquipmentBOMMaterial" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "WorkOrderNotifLink" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "WorkOrderNotifLink" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "WorkOrderMaterial" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "WorkOrderMaterial" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "ExternalServiceCost" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "ExternalServiceCost" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "ChecklistItem" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "ChecklistItem" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "WorkOrderChecklistItem" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "WorkOrderChecklistItem" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "MaintenancePlanTarget" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "MaintenancePlanTarget" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "MaintenancePlanMeter" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "MaintenancePlanMeter" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "CostSplit" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "CostSplit" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "SystemAlert" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "SystemAlert" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "Comment" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "Comment" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "SystemConfig" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "SystemConfig" ALTER COLUMN "modifiedDate" SET NOT NULL;

UPDATE "SchedulerRun" SET "modifiedDate" = CURRENT_TIMESTAMP WHERE "modifiedDate" IS NULL;
ALTER TABLE "SchedulerRun" ALTER COLUMN "modifiedDate" SET NOT NULL;

-- 3. isDeleted for the three tables that already carry the audit trail.
ALTER TABLE "TaskListMaterial" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrderOperation" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrderChecklist" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- 4. F3: swap the plain unique indexes for partial unique indexes on active
--    rows, so a soft-deleted row frees its key/pair for reuse.
-- The legacy index carries the @@unique name on a fresh migrate run and the
-- Prisma-default composite name on environments scaffolded by db push; drop
-- whichever exists so the partial index is the single source of truth.
DROP INDEX IF EXISTS "TaskListMaterial_op_material_key";
DROP INDEX IF EXISTS "TaskListMaterial_taskOperationId_materialId_key";
CREATE UNIQUE INDEX "TaskListMaterial_taskOperationId_materialId_active_key"
  ON "TaskListMaterial" ("taskOperationId", "materialId")
  WHERE "isDeleted" = false;

DROP INDEX "MaintenancePlanTarget_planId_equipmentId_key";
CREATE UNIQUE INDEX "MaintenancePlanTarget_planId_equipmentId_active_key"
  ON "MaintenancePlanTarget" ("planId", "equipmentId")
  WHERE "isDeleted" = false;

DROP INDEX "MaintenancePlanTarget_planId_functionalLocationId_key";
CREATE UNIQUE INDEX "MaintenancePlanTarget_planId_functionalLocationId_active_key"
  ON "MaintenancePlanTarget" ("planId", "functionalLocationId")
  WHERE "isDeleted" = false;

DROP INDEX "SystemConfig_key_key";
CREATE UNIQUE INDEX "SystemConfig_key_active_key"
  ON "SystemConfig" ("key")
  WHERE "isDeleted" = false;