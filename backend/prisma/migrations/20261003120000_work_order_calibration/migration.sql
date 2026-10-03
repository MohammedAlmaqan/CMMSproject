-- SOW 3.3.1 (row 24): calibration work orders at the owner-selected full depth.
--
-- The register's "pass/fail label" was withdrawn as too narrow; on 2026-10-02 the
-- SOW owner selected full depth - pass/fail plus as-found/as-left readings, the
-- reference standard used, and the calibration due date and interval. The type
-- label 'CAL' already existed, but nothing captured a result.
--
-- Every column is nullable. Calibration data applies only to a CAL work order,
-- and a job is filled in as it is executed, so a NOT NULL column would force a
-- value that does not exist yet. A CAL work order cannot be moved to Completed
-- without a result: that rule is enforced in the API
-- (backend/src/utils/workOrderRules.ts, applied in backend/src/routes/workOrders.ts),
-- matching the cause-code gate rather than a database constraint.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationResult" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationAsFound" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationAsLeft" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationReferenceStandard" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationDueDate" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationIntervalValue" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN "calibrationIntervalUnit" TEXT;
