-- SOW 3.4.1 and 3.4.3: the remaining plan fields the SOW names, and the
-- plan-target join table that D-10 decided to build.
--
-- Three separate gaps are closed here.
--
-- 1. Priority. SOW 3.4.1 lists Priority as a plan field. It did not exist, and
--    the scheduler hard-coded every generated work order to 'Medium', so a plan
--    could not say that inspecting a safety-critical asset outranks routine
--    lubrication.
--
-- 2. Generated work order status. SOW 3.4.3 requires the created work order's
--    status to be Draft or Planned at the planner's discretion. It was
--    hard-coded to 'Draft' in two separate places.
--
-- 3. Plan targets (D-10). SOW 3.4.1 says a plan targets Equipment or
--    Functional Location "or a list", and D-10 resolved that as a join table so
--    one fleet-wide plan can drive many assets. The single nullable
--    `equipmentId` cannot express "inspect every P-100 monthly".
--
-- notificationId is SOW 3.4.1/3.4.3: a plan may carry an associated
-- notification, created and linked to the work order on each generation.

-- CreateTable
CREATE TABLE "MaintenancePlanTarget" (
    "planTargetId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "functionalLocationId" TEXT,

    CONSTRAINT "MaintenancePlanTarget_pkey" PRIMARY KEY ("planTargetId")
);

-- A target names exactly one asset. Without this a row could name both (which
-- is ambiguous: which asset's meter or location governs?) or neither (which is
-- meaningless), and the UNIQUE indexes below would let any number of all-NULL
-- rows through, because Postgres treats NULLs as distinct in a unique index.
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_exactly_one_target" CHECK (
    (("equipmentId" IS NOT NULL)::int + ("functionalLocationId" IS NOT NULL)::int) = 1
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlanTarget_planId_equipmentId_key" ON "MaintenancePlanTarget"("planId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlanTarget_planId_functionalLocationId_key" ON "MaintenancePlanTarget"("planId", "functionalLocationId");

-- CreateIndex
CREATE INDEX "MaintenancePlanTarget_equipmentId_idx" ON "MaintenancePlanTarget"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenancePlanTarget_functionalLocationId_idx" ON "MaintenancePlanTarget"("functionalLocationId");

-- AlterTable: the two plan fields, plus the notification reference.
-- Defaults are supplied so the change is metadata-only on Postgres and every
-- existing plan keeps working without a backfill: priority 'Medium' matches what
-- the scheduler was already producing, and 'Draft' matches what it was already
-- hard-coding.
ALTER TABLE "MaintenancePlan" ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'Medium';
ALTER TABLE "MaintenancePlan" ADD COLUMN     "generatedWorkOrderStatus" TEXT NOT NULL DEFAULT 'Draft';
ALTER TABLE "MaintenancePlan" ADD COLUMN     "notificationId" TEXT;

-- Backfill: migrate each existing plan's single target into the join table, so
-- the table is the source of truth from the moment it exists and no plan is
-- silently left untargeted. The legacy columns are kept as a compatibility
-- mirror rather than dropped, because the plan API and matrix both still expose
-- them and `functionalLocationId` in particular is already a tracked v1.1 item
-- (it has no foreign key).
INSERT INTO "MaintenancePlanTarget" ("planTargetId", "planId", "equipmentId", "functionalLocationId")
SELECT
    gen_random_uuid()::text,
    "planId",
    "equipmentId",
    CASE WHEN "equipmentId" IS NULL THEN "functionalLocationId" ELSE NULL END
FROM "MaintenancePlan"
WHERE "isDeleted" = false
  AND ("equipmentId" IS NOT NULL OR "functionalLocationId" IS NOT NULL);

-- AddForeignKey
-- CASCADE, because a target row is part of the plan's definition; see the model.
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("planId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT on both asset sides. A target is a statement that this plan covers
-- this asset, so neither the asset nor the plan may be removed from under it
-- silently; the plan is deactivated or retargeted first.
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("equipmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanTarget" ADD CONSTRAINT "MaintenancePlanTarget_functionalLocationId_fkey" FOREIGN KEY ("functionalLocationId") REFERENCES "FunctionalLocation"("functionalLocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL on the notification: a notification is an associated record, not the
-- owner of the plan. If the notification is removed the plan stays valid and
-- simply generates without one.
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("notificationId") ON DELETE SET NULL ON UPDATE CASCADE;
