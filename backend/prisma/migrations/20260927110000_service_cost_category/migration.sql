-- SOW 3.3.6: "Additional miscellaneous costs (travel, permits) as line items".
--
-- The table already held every non-labour, non-material cost charged to a work
-- order, so travel and permits were storable in principle -- but with no
-- discriminator they were indistinguishable from a contractor service invoice.
-- A cost report could total a travel line and an invoice together and call the
-- result "services".
--
-- One column fixes that. 'Service' is the contractor case and the default, which
-- is what every existing line already is, so the default is also the backfill:
-- an older client that never sends a category keeps exactly the meaning it had.
-- The permitted values are enforced in the zod schema at the API boundary
-- (externalServiceCreateSchema), consistent with the other status and type
-- columns in this schema; see v1.1-4.
--
-- NOT NULL DEFAULT is deliberate: on Postgres 11+ this is a metadata-only change,
-- so the table is not rewritten and no concurrent read blocks on it.

-- AlterTable
ALTER TABLE "ExternalServiceCost" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Service';
