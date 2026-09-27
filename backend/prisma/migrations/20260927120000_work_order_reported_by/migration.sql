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
UPDATE "WorkOrder" SET "reportedByUserId" = "createdBy" WHERE "reportedByUserId" IS NULL;

-- Belt and braces: a work order whose createdBy is itself null (legacy rows
-- created before the audit columns were enforced) still needs a reporter.
UPDATE "WorkOrder" SET "reportedByUserId" = "supervisorUserId" WHERE "reportedByUserId" IS NULL;

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "reportedByUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "WorkOrder_reportedByUserId_idx" ON "WorkOrder"("reportedByUserId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
