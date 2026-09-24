-- DropIndex
DROP INDEX "MaintenancePlan_planCode_key";

-- F3: partial unique index — planCode must be unique only among ACTIVE plans,
-- so soft-deleted rows (isDeleted=true) release their planCode for reuse.
-- This is the manual raw-SQL part Prisma cannot express in schema.prisma.
CREATE UNIQUE INDEX "MaintenancePlan_planCode_active_key"
  ON "MaintenancePlan" ("planCode")
  WHERE "isDeleted" = false;
