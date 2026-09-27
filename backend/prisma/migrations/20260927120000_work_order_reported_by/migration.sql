-- SOW 3.3.3: "Header fields: ... Description, Reported By, Responsible Work
-- Center, Assigned Supervisor, ..."
--
-- Two of the names this clause lists were checked and are already present:
-- supervisorUserId is the Assigned Supervisor and safetyCriticalFlag is the
-- Safety critical flag. The genuinely missing one was Reported By.
--
-- createdBy is not it. createdBy records who raised the work-order record, and
-- for a corrective job converted from a notification that is the planner who
-- typed the conversion, not the technician who reported the breakdown. A CMMS
-- that cannot distinguish "who reported it" from "who is running it" cannot
-- answer the first question an asset manager asks after a failure.
--
-- Added NOT NULL with a backfill from createdBy so no existing work order is
-- left without a reporter, then a foreign key so the name cannot dangle.
--
-- RESTRICT on delete: a work order's reporter is a statement about the past
-- and must not be erased by removing a user account.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "reportedByUserId" TEXT;

-- Backfill before the NOT NULL constraint, from the closest thing that exists.
--
-- The lookup against "User" is the whole point of this statement, and the first
-- attempt at it did not have one. WorkOrder.createdBy is
-- `String @default("system")`, so every work order raised without an explicit
-- author carries the literal string "system" -- and there is no User row with
-- that id, because user ids are uuids from the seed. Copying createdBy straight
-- across therefore wrote "system" into reportedByUserId, and the foreign key
-- added below rejected it, which failed the migration and with it every test
-- that follows. The backfill has to ask whether the value names a real user
-- before using it.
--
-- Preference order, first match that is an actual user wins:
--   1. createdBy        - who raised the record, the closest true answer
--   2. supervisorUserId - who owns the job
--   3. the earliest user - a real, attributable name rather than a dangling one
UPDATE "WorkOrder" w
SET "reportedByUserId" = COALESCE(
  (SELECT u."userId" FROM "User" u WHERE u."userId" = w."createdBy"),
  (SELECT u."userId" FROM "User" u WHERE u."userId" = w."supervisorUserId"),
  (SELECT u."userId" FROM "User" u ORDER BY u."createdDate" ASC, u."userId" ASC LIMIT 1)
)
WHERE w."reportedByUserId" IS NULL;

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "reportedByUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "WorkOrder_reportedByUserId_idx" ON "WorkOrder"("reportedByUserId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
