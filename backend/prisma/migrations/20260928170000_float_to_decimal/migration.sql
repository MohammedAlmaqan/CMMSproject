-- Phase E / D-17: move the monetary columns from double precision to
-- DECIMAL(12,2). The register's rationale: Phase F builds 3.5.3 cost rollups
-- and 3.7.1 cost reports, and producing new cost reporting on binary floating
-- point bakes rounding differences into new work and leaves the totals
-- unauditable. Migrating before the rollups exist is cheaper than after.
--
-- Scope is the seven money columns only. Quantities, hours, meter readings,
-- stock and percentages stay Float: they are measurements, not a unit of
-- account, and the schema documents them as such. The API wire format is
-- unchanged -- Decimal values are normalised back to JSON numbers at the
-- response boundary (src/index.ts) so no caller sees a string where a number
-- used to be.
--
-- double precision -> numeric(12,2) is a lossy cast by construction for any
-- stored figure with more than two decimal places, which is exactly the class
-- of drift this decision exists to retire. Existing values are plant money at
-- two places, so the cast is value-preserving for the seeded data.

ALTER TABLE "WorkCenter"
    ALTER COLUMN "costRatePerHour" SET DATA TYPE DECIMAL(12,2) USING "costRatePerHour"::numeric(12,2);

ALTER TABLE "Craft"
    ALTER COLUMN "hourlyRate" SET DATA TYPE DECIMAL(12,2) USING "hourlyRate"::numeric(12,2);

ALTER TABLE "Material"
    ALTER COLUMN "standardCost" SET DATA TYPE DECIMAL(12,2) USING "standardCost"::numeric(12,2);

ALTER TABLE "WorkOrder"
    ALTER COLUMN "plannedCost" SET DATA TYPE DECIMAL(12,2) USING "plannedCost"::numeric(12,2),
    ALTER COLUMN "actualCost" SET DATA TYPE DECIMAL(12,2) USING "actualCost"::numeric(12,2);

ALTER TABLE "WorkOrderMaterial"
    ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(12,2) USING "unitCost"::numeric(12,2);

ALTER TABLE "ExternalServiceCost"
    ALTER COLUMN "cost" SET DATA TYPE DECIMAL(12,2) USING "cost"::numeric(12,2);