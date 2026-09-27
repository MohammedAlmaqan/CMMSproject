-- SOW 3.2.2: "Key fields: auto number, Type, Priority, Functional Location /
-- Equipment (mandatory selection), Reported By, Date & Time, Description,
-- Breakdown indicator, Damages/observations".
--
-- Damages/observations was the one key field on this clause with nowhere to go.
-- The only free text was `description`, which is the caller's summary written at
-- raise time. What a technician later finds at the asset is a different fact and
-- belongs somewhere else: folding the two together means an observation captured
-- after inspection silently overwrites the original report, and the original
-- report is gone.
--
-- Nullable on purpose. A notification is raised *before* anyone inspects
-- anything, so requiring this field would force an observation that does not
-- exist yet to be invented at raise time. Metadata-only on Postgres: no default,
-- no rewrite, no backfill.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "damagesObservations" TEXT;
