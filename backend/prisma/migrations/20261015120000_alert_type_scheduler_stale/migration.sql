-- SystemAlert.alertType: admit `Scheduler_Stale`.
--
-- C.15 (20261009120000) pinned this domain from the schema comment and the
-- validation enums, and additionally admitted `Account_Lockout` (written by the
-- auth route on lockout) which the comment omitted. It missed `Scheduler_Stale`,
-- which `GET /api/health/scheduler` has written since G4b-2 (`5048a17`,
-- 2026-09-23). With C.15 applied that insert violated the CHECK and, because the
-- write is best-effort, the alert was lost silently.
--
-- This migration widens the domain to the seven values the code actually writes.
-- Reversible in place, like C.15: drop and re-add, no data transformation.

ALTER TABLE "SystemAlert" DROP CONSTRAINT "SystemAlert_alertType_check";
ALTER TABLE "SystemAlert" ADD CONSTRAINT "SystemAlert_alertType_check" CHECK ("alertType" IN ('WO_Assigned', 'WO_Overdue', 'PM_Generation', 'PM_Generation_Failed', 'High_Priority_Notification', 'Account_Lockout', 'Scheduler_Stale'));
