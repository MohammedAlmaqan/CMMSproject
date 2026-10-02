-- R.6 / SOW 5.2: a read-only SQL view layer over the operational tables, so the
-- Client's BI tool can query the plant directly instead of scraping the JSON
-- reports. It is additive: no table is created or altered, and no route reads a
-- view. The application stays the system of record; the views are a second,
-- stable contract over the same rows.
--
-- The layer has two halves. The fact and dimension views resolve foreign keys to
-- the codes a report shows (report_work_order, report_equipment, ...). The
-- aggregate views expose exactly the figures the standard reports present, so a
-- BI consumer and /api/reports agree by construction. The companion differential
-- backend/scripts/r6-view-differential.ts proves that agreement against the live
-- database, and backend/tests/routes/reportsViews.test.ts proves it against the
-- HTTP reports on fixtures.
--
-- Money columns are DECIMAL(12,2) (D-17); the Float measurement columns are cast
-- to numeric before multiplying by money so the product cannot pick up binary
-- floating point noise. Per-line products are summed unrounded and rounded once
-- at the end, which is the rule the reports follow: rounding each line first
-- and summing drifts by cents over a month.

-- Drop first so the migration is re-runnable in development. CASCADE removes any
-- view built on a view being replaced; every view is recreated below.
DROP VIEW IF EXISTS report_functional_location CASCADE;
DROP VIEW IF EXISTS report_equipment CASCADE;
DROP VIEW IF EXISTS report_work_center CASCADE;
DROP VIEW IF EXISTS report_craft CASCADE;
DROP VIEW IF EXISTS report_work_order CASCADE;
DROP VIEW IF EXISTS report_work_order_operation CASCADE;
DROP VIEW IF EXISTS report_material_consumption CASCADE;
DROP VIEW IF EXISTS report_notification CASCADE;
DROP VIEW IF EXISTS report_maintenance_plan CASCADE;
DROP VIEW IF EXISTS report_pm_occurrence CASCADE;
DROP VIEW IF EXISTS report_backlog CASCADE;
DROP VIEW IF EXISTS report_backlog_hours_by_work_center CASCADE;
DROP VIEW IF EXISTS report_cost_by_cost_center CASCADE;
DROP VIEW IF EXISTS report_cost_by_location CASCADE;
DROP VIEW IF EXISTS report_downtime_by_equipment CASCADE;
DROP VIEW IF EXISTS report_mttr_by_equipment CASCADE;
DROP VIEW IF EXISTS report_mttr_by_location CASCADE;
DROP VIEW IF EXISTS report_mtbf_by_equipment CASCADE;
DROP VIEW IF EXISTS report_material_consumption_by_material CASCADE;
DROP VIEW IF EXISTS report_material_consumption_by_work_order CASCADE;
DROP VIEW IF EXISTS report_material_consumption_by_equipment CASCADE;
DROP VIEW IF EXISTS report_top_cost_equipment CASCADE;
DROP VIEW IF EXISTS report_notifications_awaiting_conversion CASCADE;

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------

CREATE VIEW report_functional_location AS
SELECT
  fl."functionalLocationId" AS functional_location_id,
  fl."locationCode"         AS location_code,
  fl.description            AS description,
  fl."parentLocationId"     AS parent_location_id,
  fl."locationType"         AS location_type,
  fl."operationalStatus"    AS operational_status,
  fl."safetyCritical"       AS safety_critical,
  fl."createdDate"          AS created_date
FROM "FunctionalLocation" fl
WHERE fl."isDeleted" = false;

CREATE VIEW report_equipment AS
SELECT
  e."equipmentId"          AS equipment_id,
  e."equipmentCode"        AS equipment_code,
  e.name                   AS name,
  e."functionalLocationId" AS functional_location_id,
  fl."locationCode"        AS location_code,
  e.criticality            AS criticality,
  e."operationalStatus"    AS operational_status,
  e.manufacturer           AS manufacturer,
  e.model                  AS model,
  e."serialNumber"         AS serial_number,
  e."createdDate"          AS created_date
FROM "Equipment" e
JOIN "FunctionalLocation" fl ON fl."functionalLocationId" = e."functionalLocationId"
WHERE e."isDeleted" = false;

CREATE VIEW report_work_center AS
SELECT
  wc."workCenterId"       AS work_center_id,
  wc.code                 AS work_center_code,
  wc.name                 AS work_center_name,
  wc."dailyCapacityHours" AS daily_capacity_hours,
  wc."costRatePerHour"    AS cost_rate_per_hour
FROM "WorkCenter" wc
WHERE wc."isDeleted" = false;

CREATE VIEW report_craft AS
SELECT
  c."craftId"      AS craft_id,
  c."craftCode"    AS craft_code,
  c.description    AS description,
  c."workCenterId" AS work_center_id,
  c."hourlyRate"   AS hourly_rate
FROM "Craft" c
WHERE c."isDeleted" = false;

-- ---------------------------------------------------------------------------
-- Facts
-- ---------------------------------------------------------------------------

-- One row per live work order with every dimension resolved and the cost
-- derivation the reports use (SOW 3.5.3): labour from operations and their
-- craft rate, materials from each line's own unit cost, external services at
-- their recorded cost. planned_hours and downtime_hours are left unrounded so
-- the aggregates can sum them first and round once.
CREATE VIEW report_work_order AS
SELECT
  wo."workOrderId"          AS work_order_id,
  wo."woNumber"             AS wo_number,
  wo.type                   AS type,
  wo.status                 AS status,
  wo.priority               AS priority,
  wo.description            AS description,
  wo."workCenterId"         AS work_center_id,
  wc.code                   AS work_center_code,
  wc.name                   AS work_center_name,
  wo."costCenterCode"       AS cost_center_code,
  wo."internalOrder"        AS internal_order,
  wo."functionalLocationId" AS functional_location_id,
  fl."locationCode"         AS location_code,
  fl.description            AS location_description,
  wo."equipmentId"          AS equipment_id,
  e."equipmentCode"         AS equipment_code,
  e.name                    AS equipment_name,
  wo."createdDate"          AS created_date,
  wo."plannedStart"         AS planned_start,
  wo."plannedFinish"        AS planned_finish,
  wo."actualStart"          AS actual_start,
  wo."actualFinish"         AS actual_finish,
  wo."breakdownFlag"        AS breakdown_flag,
  wo."safetyCriticalFlag"   AS safety_critical_flag,
  wo."sourcePlanId"         AS source_plan_id,
  wo."sourcePlanCycle"      AS source_plan_cycle,
  wo."plannedCost"          AS stored_planned_cost,
  wo."actualCost"           AS stored_actual_cost,
  (wo.status NOT IN ('Completed', 'Closed', 'Cancelled')) AS is_open,
  COALESCE(ops.planned_hours, 0)                AS planned_hours,
  COALESCE(pl.planned_labor, 0)                 AS planned_labor_cost,
  COALESCE(al.actual_labor, 0)                  AS actual_labor_cost,
  COALESCE(mat.planned_materials, 0)            AS planned_material_cost,
  COALESCE(mat.actual_materials, 0)             AS actual_material_cost,
  COALESCE(svc.service_cost, 0)                 AS service_cost,
  ROUND(COALESCE(pl.planned_labor, 0) + COALESCE(mat.planned_materials, 0) + COALESCE(svc.service_cost, 0), 2) AS derived_planned_cost,
  ROUND(COALESCE(al.actual_labor, 0) + COALESCE(mat.actual_materials, 0) + COALESCE(svc.service_cost, 0), 2)   AS derived_actual_cost,
  CASE
    WHEN wo.type IN ('EM', 'CM') AND wo."actualStart" IS NOT NULL AND wo."actualFinish" IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (wo."actualFinish" - wo."actualStart")) / 3600.0)::numeric
    ELSE 0
  END AS downtime_hours
FROM "WorkOrder" wo
JOIN "WorkCenter" wc         ON wc."workCenterId" = wo."workCenterId"
JOIN "FunctionalLocation" fl ON fl."functionalLocationId" = wo."functionalLocationId"
LEFT JOIN "Equipment" e      ON e."equipmentId" = wo."equipmentId"
LEFT JOIN LATERAL (
  SELECT SUM(op."plannedHours") AS planned_hours
  FROM "WorkOrderOperation" op
  WHERE op."workOrderId" = wo."workOrderId" AND op."isDeleted" = false
) ops ON true
LEFT JOIN LATERAL (
  SELECT SUM(op."plannedHours"::numeric * c."hourlyRate") AS planned_labor
  FROM "WorkOrderOperation" op
  JOIN "Craft" c ON c."craftId" = op."craftId"
  WHERE op."workOrderId" = wo."workOrderId" AND op."isDeleted" = false
) pl ON true
LEFT JOIN LATERAL (
  SELECT SUM(le."hoursWorked"::numeric * c."hourlyRate") AS actual_labor
  FROM "LaborEntry" le
  JOIN "WorkOrderOperation" op ON op."operationId" = le."operationId"
  JOIN "Craft" c ON c."craftId" = op."craftId"
  WHERE op."workOrderId" = wo."workOrderId" AND op."isDeleted" = false AND le."isDeleted" = false
) al ON true
LEFT JOIN LATERAL (
  SELECT SUM(m."plannedQuantity"::numeric * m."unitCost") AS planned_materials,
         SUM(m."actualQuantity"::numeric * m."unitCost")  AS actual_materials
  FROM "WorkOrderMaterial" m
  WHERE m."workOrderId" = wo."workOrderId" AND m."isDeleted" = false
) mat ON true
LEFT JOIN LATERAL (
  SELECT SUM(s."cost") AS service_cost
  FROM "ExternalServiceCost" s
  WHERE s."workOrderId" = wo."workOrderId" AND s."isDeleted" = false
) svc ON true
WHERE wo."isDeleted" = false;

CREATE VIEW report_work_order_operation AS
SELECT
  op."operationId"    AS operation_id,
  op."workOrderId"    AS work_order_id,
  wo."woNumber"       AS wo_number,
  op."sequenceNumber" AS sequence_number,
  op.description      AS description,
  op."craftId"        AS craft_id,
  c."craftCode"       AS craft_code,
  c."hourlyRate"      AS hourly_rate,
  op."plannedHours"   AS planned_hours,
  op."actualHours"    AS actual_hours,
  op.status           AS status,
  COALESCE(le.actual_labor_hours, 0) AS actual_labor_hours
FROM "WorkOrderOperation" op
JOIN "WorkOrder" wo ON wo."workOrderId" = op."workOrderId"
JOIN "Craft" c ON c."craftId" = op."craftId"
LEFT JOIN LATERAL (
  SELECT SUM(le."hoursWorked") AS actual_labor_hours
  FROM "LaborEntry" le
  WHERE le."operationId" = op."operationId" AND le."isDeleted" = false
) le ON true
WHERE op."isDeleted" = false AND wo."isDeleted" = false;

CREATE VIEW report_material_consumption AS
SELECT
  m."woMaterialId"    AS wo_material_id,
  m."workOrderId"     AS work_order_id,
  wo."woNumber"       AS wo_number,
  m."materialId"      AS material_id,
  mat."materialCode"  AS material_code,
  mat.description     AS material_description,
  mat."unitOfMeasure" AS unit_of_measure,
  m."actualQuantity"  AS actual_quantity,
  m."unitCost"        AS unit_cost,
  (m."actualQuantity"::numeric * m."unitCost") AS line_cost,
  wo."equipmentId"    AS equipment_id,
  e."equipmentCode"   AS equipment_code,
  e.name              AS equipment_name,
  wo."createdDate"    AS work_order_created_date
FROM "WorkOrderMaterial" m
JOIN "WorkOrder" wo ON wo."workOrderId" = m."workOrderId"
JOIN "Material" mat ON mat."materialId" = m."materialId"
LEFT JOIN "Equipment" e ON e."equipmentId" = wo."equipmentId"
WHERE m."isDeleted" = false AND m."actualQuantity" > 0 AND wo."isDeleted" = false;

CREATE VIEW report_notification AS
SELECT
  n."notificationId"       AS notification_id,
  n."notificationNumber"   AS notification_number,
  n.type                   AS type,
  n.priority               AS priority,
  n.status                 AS status,
  (n.status IN ('Open', 'In Process')) AS is_awaiting_conversion,
  n."functionalLocationId" AS functional_location_id,
  fl."locationCode"        AS location_code,
  n."equipmentId"          AS equipment_id,
  e."equipmentCode"        AS equipment_code,
  n."breakdownFlag"        AS breakdown_flag,
  n.description            AS description,
  n."createdDate"          AS created_date
FROM "Notification" n
JOIN "FunctionalLocation" fl ON fl."functionalLocationId" = n."functionalLocationId"
LEFT JOIN "Equipment" e ON e."equipmentId" = n."equipmentId"
WHERE n."isDeleted" = false;

CREATE VIEW report_maintenance_plan AS
SELECT
  p."planId"              AS plan_id,
  p."planCode"            AS plan_code,
  p.description           AS description,
  p."workCenterId"        AS work_center_id,
  wc.code                 AS work_center_code,
  p."strategyType"        AS strategy_type,
  p."intervalValue"       AS interval_value,
  p."intervalUnit"        AS interval_unit,
  p."callHorizonValue"    AS call_horizon_value,
  p."callHorizonUnit"     AS call_horizon_unit,
  p."startDate"           AS start_date,
  p."endDate"             AS end_date,
  p.priority              AS priority,
  p."activeFlag"          AS active_flag
FROM "MaintenancePlan" p
JOIN "WorkCenter" wc ON wc."workCenterId" = p."workCenterId"
WHERE p."isDeleted" = false;

-- One row per time-based occurrence due, per plan target, generated from the
-- plan's start date and interval. Meter-driven plans have no calendar due date
-- and are excluded, matching the PM compliance report's denominator. The
-- generate_series is capped so an open-ended plan does not produce an unbounded
-- set; a BI consumer slices the window it wants off due_date.
CREATE VIEW report_pm_occurrence AS
SELECT
  p."planId"               AS plan_id,
  p."planCode"             AS plan_code,
  p.description            AS description,
  p."workCenterId"         AS work_center_id,
  p."strategyType"         AS strategy_type,
  p."intervalValue"        AS interval_value,
  p."intervalUnit"         AS interval_unit,
  p."startDate"            AS start_date,
  p."endDate"              AS end_date,
  t."planTargetId"         AS plan_target_id,
  t."equipmentId"          AS equipment_id,
  t."functionalLocationId" AS functional_location_id,
  occ.due_date             AS due_date
FROM "MaintenancePlan" p
LEFT JOIN "MaintenancePlanTarget" t
  ON t."planId" = p."planId" AND t."isDeleted" = false
CROSS JOIN LATERAL generate_series(
  p."startDate",
  LEAST(COALESCE(p."endDate", now() + interval '100 years'), now() + interval '100 years'),
  CASE p."intervalUnit"
    WHEN 'Days'   THEN make_interval(days   => p."intervalValue")
    WHEN 'Weeks'  THEN make_interval(weeks  => p."intervalValue")
    WHEN 'Months' THEN make_interval(months => p."intervalValue")
    ELSE interval '1 day'
  END
) AS occ(due_date)
WHERE p."isDeleted" = false AND p."strategyType" <> 'Meter';

-- ---------------------------------------------------------------------------
-- Aggregates
-- ---------------------------------------------------------------------------

-- Long form: one row per (dimension, key). A consumer pivots on dimension, or
-- filters one dimension. The three breakdowns partition one backlog and carry
-- the same hours, which is the property /backlog relies on.
CREATE VIEW report_backlog AS
SELECT 'status'::text AS dimension,
       status        AS key,
       status        AS label,
       COUNT(*)::int AS open_count,
       SUM(planned_hours) AS planned_hours
FROM report_work_order
WHERE is_open
GROUP BY status
UNION ALL
SELECT 'priority', priority, priority, COUNT(*)::int, SUM(planned_hours)
FROM report_work_order
WHERE is_open
GROUP BY priority
UNION ALL
SELECT 'work_center', work_center_id, COALESCE(work_center_code, work_center_name, work_center_id),
       COUNT(*)::int, SUM(planned_hours)
FROM report_work_order
WHERE is_open
GROUP BY work_center_id, work_center_code, work_center_name;

CREATE VIEW report_backlog_hours_by_work_center AS
SELECT
  work_center_id,
  work_center_code,
  work_center_name,
  COUNT(*)::int AS open_work_order_count,
  ROUND(SUM(planned_hours)::numeric, 2) AS backlog_hours
FROM report_work_order
WHERE is_open
GROUP BY work_center_id, work_center_code, work_center_name;

CREATE VIEW report_cost_by_cost_center AS
SELECT
  cost_center_code,
  COUNT(*)::int AS work_order_count,
  ROUND(SUM(derived_planned_cost), 2) AS planned_cost,
  ROUND(SUM(derived_actual_cost), 2)  AS actual_cost,
  ROUND(SUM(derived_actual_cost) - SUM(derived_planned_cost), 2) AS variance
FROM report_work_order
GROUP BY cost_center_code;

-- A location's row is its own work orders plus every location beneath it, the
-- subtree total /cost-summary shows. The recursive term walks the non-deleted
-- hierarchy from each root.
CREATE VIEW report_cost_by_location AS
WITH RECURSIVE location_tree AS (
  SELECT fl."functionalLocationId" AS root_id,
         fl."functionalLocationId" AS node_id
  FROM "FunctionalLocation" fl
  WHERE fl."isDeleted" = false
  UNION ALL
  SELECT lt.root_id, child."functionalLocationId"
  FROM location_tree lt
  JOIN "FunctionalLocation" child ON child."parentLocationId" = lt.node_id
  WHERE child."isDeleted" = false
)
SELECT
  fl."functionalLocationId" AS functional_location_id,
  fl."locationCode"         AS location_code,
  fl.description            AS description,
  COUNT(DISTINCT lt.node_id)::int AS subtree_location_count,
  ROUND(COALESCE(SUM(wo.derived_planned_cost), 0), 2) AS planned_cost,
  ROUND(COALESCE(SUM(wo.derived_actual_cost), 0), 2)  AS actual_cost,
  ROUND(COALESCE(SUM(wo.derived_actual_cost), 0) - COALESCE(SUM(wo.derived_planned_cost), 0), 2) AS variance,
  COUNT(wo.work_order_id)::int AS work_order_count
FROM "FunctionalLocation" fl
JOIN location_tree lt ON lt.root_id = fl."functionalLocationId"
LEFT JOIN report_work_order wo ON wo.functional_location_id = lt.node_id
WHERE fl."isDeleted" = false
GROUP BY fl."functionalLocationId", fl."locationCode", fl.description;

-- EM and CM work orders with both actual timestamps carry downtime; the
-- per-order values are summed and rounded once. Only equipment rows appear
-- because downtime names an asset.
CREATE VIEW report_downtime_by_equipment AS
SELECT
  equipment_id,
  equipment_code,
  equipment_name,
  COUNT(*)::int AS work_order_count,
  ROUND(SUM(downtime_hours), 2) AS downtime_hours
FROM report_work_order
WHERE type IN ('EM', 'CM') AND equipment_id IS NOT NULL
  AND actual_start IS NOT NULL AND actual_finish IS NOT NULL
GROUP BY equipment_id, equipment_code, equipment_name;

-- MTTR is only breakdown (EM) work orders, and only those with both actual
-- timestamps; the denominator is the count of those rows.
CREATE VIEW report_mttr_by_equipment AS
SELECT
  equipment_id,
  equipment_code,
  equipment_name,
  COUNT(*)::int AS breakdown_count,
  ROUND(SUM(downtime_hours) / NULLIF(COUNT(*), 0), 2) AS mttr_hours
FROM report_work_order
WHERE type = 'EM' AND equipment_id IS NOT NULL
  AND actual_start IS NOT NULL AND actual_finish IS NOT NULL
GROUP BY equipment_id, equipment_code, equipment_name;

CREATE VIEW report_mttr_by_location AS
SELECT
  functional_location_id,
  location_code,
  location_description AS description,
  COUNT(*)::int AS breakdown_count,
  ROUND(SUM(downtime_hours) / NULLIF(COUNT(*), 0), 2) AS mttr_hours
FROM report_work_order
WHERE type = 'EM' AND actual_start IS NOT NULL AND actual_finish IS NOT NULL
GROUP BY functional_location_id, location_code, location_description;

-- MTBF spans the first to last breakdown by actual start (the report's own
-- definition), subtracts the summed downtime, and divides by count-1. A single
-- breakdown has no interval between failures, so it reports zero.
CREATE VIEW report_mtbf_by_equipment AS
SELECT
  equipment_id,
  equipment_code,
  equipment_name,
  COUNT(*)::int AS breakdown_count,
  CASE
    WHEN COUNT(*) < 2 THEN 0::numeric
    ELSE ROUND(
      ( (EXTRACT(EPOCH FROM (MAX(actual_start) - MIN(actual_start))) / 3600.0)::numeric
        - SUM(downtime_hours) ) / (COUNT(*) - 1),
      2)
  END AS mtbf_hours
FROM report_work_order
WHERE type = 'EM' AND equipment_id IS NOT NULL
  AND actual_start IS NOT NULL AND actual_finish IS NOT NULL
GROUP BY equipment_id, equipment_code, equipment_name;

CREATE VIEW report_material_consumption_by_material AS
SELECT
  material_id,
  material_code,
  material_description,
  unit_of_measure,
  COUNT(*)::int AS usage_count,
  ROUND(SUM(actual_quantity)::numeric, 2) AS total_quantity_used,
  ROUND(SUM(line_cost), 2)                AS total_cost
FROM report_material_consumption
GROUP BY material_id, material_code, material_description, unit_of_measure;

CREATE VIEW report_material_consumption_by_work_order AS
SELECT
  work_order_id,
  wo_number,
  COUNT(*)::int AS line_count,
  ROUND(SUM(actual_quantity)::numeric, 2) AS total_quantity_used,
  ROUND(SUM(line_cost), 2)                AS total_cost
FROM report_material_consumption
GROUP BY work_order_id, wo_number;

CREATE VIEW report_material_consumption_by_equipment AS
SELECT
  equipment_id,
  equipment_code,
  equipment_name,
  COUNT(*)::int AS line_count,
  ROUND(SUM(actual_quantity)::numeric, 2) AS total_quantity_used,
  ROUND(SUM(line_cost), 2)                AS total_cost
FROM report_material_consumption
GROUP BY equipment_id, equipment_code, equipment_name;

-- The ranking reads the stored planned/actual cost columns, which is what
-- /top-cost-equipment does: it ranks committed money, not the derived sum. A
-- work order contributes its actual cost once it has one and its planned cost
-- until then. A deleted asset still carries cost, so its identity falls back to
-- the id rather than an empty string.
CREATE VIEW report_top_cost_equipment AS
SELECT
  wo.equipment_id,
  COALESCE(e."equipmentCode", wo.equipment_id) AS equipment_code,
  COALESCE(e.name, wo.equipment_id)            AS equipment_name,
  COUNT(*)::int AS work_order_count,
  ROUND(SUM(wo.stored_planned_cost), 2) AS planned_cost,
  ROUND(SUM(wo.stored_actual_cost), 2)  AS actual_cost,
  ROUND(SUM(CASE WHEN wo.stored_actual_cost > 0 THEN wo.stored_actual_cost ELSE wo.stored_planned_cost END), 2) AS total_cost
FROM report_work_order wo
LEFT JOIN "Equipment" e ON e."equipmentId" = wo.equipment_id
WHERE wo.equipment_id IS NOT NULL
GROUP BY wo.equipment_id, e."equipmentCode", e.name
ORDER BY total_cost DESC, wo.equipment_id ASC
LIMIT 10;

CREATE VIEW report_notifications_awaiting_conversion AS
SELECT
  priority,
  COUNT(*)::int AS notification_count,
  MIN(created_date) AS oldest_created_date,
  FLOOR(EXTRACT(EPOCH FROM (now() - MIN(created_date))) / 86400)::int AS oldest_age_days
FROM report_notification
WHERE is_awaiting_conversion
GROUP BY priority;
