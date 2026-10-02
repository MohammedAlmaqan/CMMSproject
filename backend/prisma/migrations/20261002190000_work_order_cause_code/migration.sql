-- SOW 3.1.4 (deferred item D5): wire cause codes onto work orders so the root
-- cause of a breakdown is recorded as data, not buried in free text. This is
-- what makes the MTTR-by-cause report (row 62) possible.
--
-- The column is nullable on purpose. Existing rows have no cause, and a
-- breakdown converted from a notification is raised before anyone knows the
-- cause. The requirement lives at completion: a breakdown work order cannot be
-- moved to Completed without a cause code (enforced in the API, in
-- backend/src/routes/workOrders.ts).
--
-- ON DELETE SET NULL matches an optional relation: retiring a cause code must
-- not delete or block work-order history that referenced it.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "causeCodeId" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_causeCodeId_fkey" FOREIGN KEY ("causeCodeId") REFERENCES "CauseCode"("causeCodeId") ON DELETE SET NULL ON UPDATE CASCADE;
