-- SOW 3.1.4 (owner decision 2026-10-05): wire failure codes onto work orders.
-- The FailureCode table and its CRUD API were delivered and fully manageable, but
-- nothing could name one, so a maintained failure list existed with no work orders
-- behind it. This column is what makes it usable data.
--
-- Kept separate from "causeCodeId" (added in 20261002190000_work_order_cause_code)
-- on purpose. The two answer different questions: a failure code records what was
-- observed, a cause code records why it happened. Collapsing them into one column
-- would force a choice between them at data-entry time and lose one of them.
--
-- The column is nullable and there is no completion gate. SOW 3.2.2's notification
-- key fields name no failure code, and no clause in the SOW makes a failure
-- mandatory before completion, so making one blocking would be a requirement this
-- system invented. The clause asks that a failure be recordable, and that is what
-- this delivers.
--
-- ON DELETE SET NULL matches an optional relation: retiring a failure code must
-- not delete or block work-order history that referenced it.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "failureCodeId" TEXT;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_failureCodeId_fkey" FOREIGN KEY ("failureCodeId") REFERENCES "FailureCode"("failureCodeId") ON DELETE SET NULL ON UPDATE CASCADE;
