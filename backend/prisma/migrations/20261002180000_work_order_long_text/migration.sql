-- SOW 3.3.3: "Rich-text long-text field for job instructions, safety notes,
-- completion remarks".
--
-- Delivered as multi-line plain text rather than WYSIWYG (the approved
-- default): the clause asks for long text, and job instructions are already the
-- free-text "description" column. What was missing is somewhere to record safety
-- notes with the job and remarks against its completion.
--
-- Both columns are nullable. Neither is required to raise or complete a work
-- order, and a NOT NULL text column would force a value that often does not
-- exist yet.
--
-- Prisma maps String to PostgreSQL text, so there is no length ceiling here: any
-- limit is the client's, not the column's.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "safetyNotes" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "completionRemarks" TEXT;
