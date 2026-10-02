# API Reference

Reference documentation for the CMMS REST API, version 1.0.0.

- **Base URL:** `http://localhost:4000`
- **Interactive UI:** `/api-docs` (Swagger UI)
- **Machine-readable spec:** [`openapi.json`](./openapi.json) (OpenAPI 3.0.0, also served live at `/api-docs.json`)

The spec is generated from `@openapi` annotations in the route source files and served live at `/api-docs.json` by the running server; this document describes the routers as they exist in the repository. The checked-in `docs/openapi.json` is an exported snapshot and may lag the newest routes (the routers currently expose 133 operations; the committed export was taken at 114 operations / 71 paths) — re-export it after a fresh build by saving `/api-docs.json`.

## Authentication

All endpoints require a bearer token **except** `POST /api/auth/login`.

Obtain a token by posting credentials:

```
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "..." }
```

The response carries a JWT plus the user profile. Send it on every subsequent request:

```
Authorization: Bearer <token>
```

The login route is rate limited. A missing or invalid token returns `401`; a token whose role is too low for the endpoint returns `403`.

## Roles

Roles form a hierarchy. A role satisfies a minimum-role check if its level is greater than or equal to the required level.

| Role | Level | Typical access |
| --- | --- | --- |
| View-Only | 1 | Read-only across the application |
| Requester | 2 | Raise notifications, edit task lists, work centers, materials, PM plans |
| Technician | 3 | Execute work: work order operations, materials, labor, external services, checklists |
| Maintenance Supervisor | 4 | Approve and soft-delete master data |
| Maintenance Planner | 5 | Import master data, generate work orders, run schedules |
| Administrator | 6 | Full access, user administration, audit log, manual scheduler run |

The hierarchy is defined in `src/middleware/auth.ts`. Endpoints guarded with `authorizeMinRole('X')` accept X and every higher role; endpoints guarded with `authorize('X')` accept only that exact role. Where a guard is not applied, any authenticated user may call the endpoint. The required role for each operation is stated in its operation description.

## Conventions

- **Validation.** Request bodies are validated by zod schemas in `src/utils/validation.ts` before the handler runs. A validation failure returns `400` with the failing field paths. Each operation names the schema that governs it.
- **Soft versus hard delete.** All transactional records are soft deleted: an `isDeleted` flag is set, the row is filtered out of later reads, and related rows are soft-deleted or retained as the operation specifies. This covers master data (locations, equipment, work centers, materials, task lists, plans, meters), work-order records (operations, material lines, external service costs, labour, cost splits, checklist instances), notifications, comments and alerts. The only tables never soft-deleted are `RefreshToken` (revoked, not deleted), `SequenceCounter` (a numeric semaphore) and the immutable append-only `AuditLogEntry` and `WorkOrderSnapshot`, whose deletion surfaces the API deliberately does not expose.
- **Audit log.** Create, update and delete operations on master data and work orders write an `AuditLogEntry` recording the user and originating IP.
- **Costs.** Work order `plannedCost` and `actualCost` are recomputed server-side from the child records whenever an operation, material line, labor entry or external service cost changes. Clients send quantities and rates, never totals. A craft's `hourlyRate` is one of those rate inputs: editing it re-costs every live work order carrying that craft in the same transaction (soft-deleted work orders are left untouched).
- **Not-found handling.** Missing referenced records return `400` (a Prisma foreign-key error translated at the boundary) or `404` depending on the endpoint; the applicable code is listed per operation.

## Endpoint groups

133 operations across 84 paths and 26 routers. Counted live from a running server's `/api-docs.json` on 2026-10-02; the stale `docs/openapi.json` snapshot shows 114 across 71 paths.

| Group | Base path | Operations |
| --- | --- | --- |
| Authentication | `/api/auth` | 2 |
| Functional Locations | `/api/functional-locations` | 6 |
| Equipment | `/api/equipment` | 11 |
| Equipment Meters | `/api/equipment-meters` | 6 |
| Work Centers | `/api/work-centers` | 6 |
| Materials | `/api/materials` | 7 |
| Failure Codes | `/api/failure-codes` | 6 |
| Task Lists | `/api/task-lists` | 5 |
| Notifications | `/api/notifications` | 6 |
| Work Orders | `/api/work-orders` | 7 |
| Work Order Operations | `/api/work-order-operations` | 4 |
| Work Order Materials | `/api/work-order-materials` | 4 |
| Work Order Cost Splits | `/api/work-order-cost-splits` | 3 |
| Labor | `/api/labor` | 4 |
| External Services | `/api/external-services` | 4 |
| Crafts | `/api/crafts` | 5 |
| Maintenance Plans | `/api/maintenance-plans` | 7 |
| Safety Checklists | `/api/safety-checklists` | 7 |
| Reports | `/api/reports` | 11 |
| Alerts | `/api/alerts` | 4 |
| Comments | `/api/comments` | 3 |
| Attachments | `/api/attachments` | 4 |
| Audit Log | `/api/audit-log` | 1 |
| Users | `/api/users` | 5 |
| Dashboard | `/api/dashboard` | 3 |
| System Config | `/api/system-config` | 2 |

### Authentication

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/api/auth/login` | Sign in and obtain a JWT (public) |
| GET | `/api/auth/me` | Return the current user's profile |

### Functional Locations

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/functional-locations` | List functional locations |
| GET | `/api/functional-locations/tree` | Functional location hierarchy as a tree |
| GET | `/api/functional-locations/{id}` | Get one functional location |
| POST | `/api/functional-locations` | Create a functional location |
| PUT | `/api/functional-locations/{id}` | Update a functional location |
| DELETE | `/api/functional-locations/{id}` | Soft delete a functional location |

### Equipment

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/equipment` | List equipment |
| GET | `/api/equipment/{id}` | Get one equipment record |
| GET | `/api/equipment/{id}/history` | Status and attribute change history for an equipment record |
| POST | `/api/equipment` | Create an equipment record |
| PUT | `/api/equipment/{id}` | Update an equipment record |
| DELETE | `/api/equipment/{id}` | Soft delete an equipment record |
| GET | `/api/equipment/export.csv` | Export the equipment register as CSV |
| POST | `/api/equipment/import.csv` | Bulk import equipment from CSV |
| POST | `/api/equipment/{id}/bom` | Attach a BOM material to an equipment record |
| PUT | `/api/equipment/{id}/bom/{bomId}` | Update a BOM material line |
| DELETE | `/api/equipment/{id}/bom/{bomId}` | Remove a BOM material line |

CSV import takes a `multipart/form-data` body with a single `file` part. Each row is validated by `equipmentImportRowSchema`; the response reports the outcome per row, so a partial import is still usable. Import requires the Maintenance Planner role.

### Equipment Meters

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/equipment-meters` | List equipment meters |
| GET | `/api/equipment-meters/{id}` | Get one meter with its reading history |
| POST | `/api/equipment-meters` | Create an equipment meter |
| PUT | `/api/equipment-meters/{id}` | Update an equipment meter |
| DELETE | `/api/equipment-meters/{id}` | Soft delete an equipment meter |
| POST | `/api/equipment-meters/{id}/readings` | Record a meter reading |

### Work Centers

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-centers` | List work centers |
| GET | `/api/work-centers/capacity` | Work center capacity, craft by work order demand |
| GET | `/api/work-centers/{id}` | Get one work center |
| POST | `/api/work-centers` | Create a work center |
| PUT | `/api/work-centers/{id}` | Update a work center |
| DELETE | `/api/work-centers/{id}` | Soft delete a work center |

### Materials

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/materials` | List materials |
| GET | `/api/materials/{id}` | Get one material |
| POST | `/api/materials` | Create a material |
| PUT | `/api/materials/{id}` | Update a material |
| DELETE | `/api/materials/{id}` | Soft delete a material |
| GET | `/api/materials/export.csv` | Export the material master as CSV |
| POST | `/api/materials/import.csv` | Bulk import materials from CSV |

### Failure Codes

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/failure-codes` | List failure codes |
| GET | `/api/failure-codes/tree` | Failure code hierarchy as a tree |
| GET | `/api/failure-codes/{id}` | Get one failure code |
| POST | `/api/failure-codes` | Create a failure code |
| PUT | `/api/failure-codes/{id}` | Update a failure code |
| DELETE | `/api/failure-codes/{id}` | Soft delete a failure code |

### Cause Codes

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/cause-codes` | List cause codes |
| GET | `/api/cause-codes/{id}` | Get one cause code |
| POST | `/api/cause-codes` | Create a cause code |
| PUT | `/api/cause-codes/{id}` | Update a cause code |
| DELETE | `/api/cause-codes/{id}` | Soft delete a cause code |

Cause codes are the root-cause categories (SOW 3.1.4) a work order can name. The list accepts a `search` filter over code and description.

### Task Lists

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/task-lists` | List task lists |
| GET | `/api/task-lists/{id}` | Get one task list |
| POST | `/api/task-lists` | Create a task list |
| PUT | `/api/task-lists/{id}` | Update a task list |
| DELETE | `/api/task-lists/{id}` | Soft delete a task list |

### Notifications

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/{id}` | Get one notification |
| POST | `/api/notifications` | Raise a notification |
| PUT | `/api/notifications/{id}` | Update a notification |
| DELETE | `/api/notifications/{id}` | Soft delete a notification |
| POST | `/api/notifications/{id}/convert-to-wo` | Convert a notification into a corrective work order |

Converting a notification creates a corrective work order — type `EM` when the notification's breakdown flag is set, otherwise `CM` — copies the location and equipment, links the notification to the new work order and sets the notification status to `Converted`. A breakdown conversion is an emergency order, so its priority is raised to `High` regardless of the notification's own priority; a non-breakdown conversion keeps the notification's priority.

### Work Orders

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-orders` | List work orders (paginated with filters) |
| GET | `/api/work-orders/{id}` | Get a work order by id (full sub-domain detail) |
| GET | `/api/work-orders/{id}/history` | Status-change snapshot history for a work order |
| POST | `/api/work-orders` | Create a work order |
| PUT | `/api/work-orders/{id}` | Update a work order |
| DELETE | `/api/work-orders/{id}` | Soft-delete a work order |
| PUT | `/api/work-orders/{id}/status` | Transition work order status |

The list endpoint is paginated with `skip` and `take`. Status changes go through the dedicated status endpoint rather than a general update, so the transition is validated. An `EM` (emergency) work order is always the highest priority: `POST` and `PUT` force `High` whatever the request contains, so an emergency cannot be raised or demoted below the top of the scale. A work order also carries two nullable long-text fields, `safetyNotes` and `completionRemarks` (SOW 3.3.3), accepted on `POST` and `PUT`: multi-line plain text up to 20000 characters each, and send `null` to clear one. A work order may also name a root-cause `causeCodeId` (nullable), accepted on `POST` and `PUT` and returned on the list and detail reads; a breakdown work order cannot move to `Completed` until it names one.

### Work Order Operations

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-order-operations` | List work order operations |
| POST | `/api/work-order-operations` | Add an operation to a work order |
| PUT | `/api/work-order-operations/{id}` | Update a work order operation |
| DELETE | `/api/work-order-operations/{id}` | Delete a work order operation |

`GET` requires `workOrderId`. Operations are the unit that labor entries and craft costs attach to; deleting one also removes the labor booked against it.

### Work Order Materials

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-order-materials` | List work order material lines |
| POST | `/api/work-order-materials` | Add a material line to a work order |
| PUT | `/api/work-order-materials/{id}` | Update a work order material line |
| DELETE | `/api/work-order-materials/{id}` | Delete a work order material line |

`GET` requires `workOrderId`.

### Work Order Cost Splits

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-order-cost-splits` | List cost split lines for a work order |
| PUT | `/api/work-order-cost-splits` | Replace the cost split lines of a work order (Maintenance Planner and above) |
| DELETE | `/api/work-order-cost-splits/{id}` | Delete a cost split line (Maintenance Supervisor and above) |

The split is used to allocate a work order's cost across internal orders or cost centers. `GET` requires `workOrderId`; the replace endpoint validates against `costSplitReplaceSchema`.

### Labor

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/labor` | List labor entries |
| POST | `/api/labor` | Book labour against an operation |
| PUT | `/api/labor/{id}` | Update a labor entry |
| DELETE | `/api/labor/{id}` | Delete a labor entry |

`GET` requires `workOrderId`. Booking labor recomputes the work order's cost from the craft hourly rate.

### External Services

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/external-services` | List external service cost lines |
| POST | `/api/external-services` | Record an external service cost |
| PUT | `/api/external-services/{id}` | Update an external service cost line |
| DELETE | `/api/external-services/{id}` | Delete an external service cost line |

`GET` requires `workOrderId`. Vendor invoice lines are hard deleted.

### Crafts

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/crafts` | List crafts |
| GET | `/api/crafts/{id}` | Get one craft |
| POST | `/api/crafts` | Create a craft |
| PUT | `/api/crafts/{id}` | Update a craft |
| DELETE | `/api/crafts/{id}` | Soft delete a craft |

Crafts are seeded reference data. They are CRUD through the API (write guards: Maintenance Planner for create/update, Maintenance Supervisor for delete).

### Maintenance Plans

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/maintenance-plans` | List maintenance plans |
| GET | `/api/maintenance-plans/{id}` | Get one maintenance plan |
| POST | `/api/maintenance-plans` | Create a maintenance plan |
| PUT | `/api/maintenance-plans/{id}` | Update a maintenance plan |
| DELETE | `/api/maintenance-plans/{id}` | Soft delete a maintenance plan |
| POST | `/api/maintenance-plans/run-scheduler` | Run the PM scheduler immediately (Administrator) |
| POST | `/api/maintenance-plans/{id}/generate-wo` | Generate a work order from a maintenance plan |

### Safety Checklists

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/safety-checklists/templates` | List safety checklist templates |
| POST | `/api/safety-checklists/templates` | Create a safety checklist template |
| GET | `/api/safety-checklists/work-order/{woId}` | List the checklists attached to a work order |
| POST | `/api/safety-checklists/work-order/{woId}/attach` | Attach a checklist template to a work order |
| PUT | `/api/safety-checklists/work-order-checklist/{id}` | Update the status of a work order checklist |
| PUT | `/api/safety-checklists/work-order-checklist-item/{id}` | Record the response to a checklist item |
| DELETE | `/api/safety-checklists/work-order-checklist/{id}` | Delete a work order checklist |

Attaching a template instantiates it as a `Pending` checklist and copies each template item into an unanswered item instance. Item responses are `Yes`, `No` or `NA`.

### Reports

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/reports/backlog` | Work order backlog by status, priority and work centre |
| GET | `/api/reports/pm-compliance` | PM compliance rate for a month |
| GET | `/api/reports/mtbf` | Mean time between failures |
| GET | `/api/reports/mttr` | Mean time to repair, by equipment and location |
| GET | `/api/reports/cost-summary` | Work order cost summary for a month, by cost centre and location |
| GET | `/api/reports/downtime` | Equipment downtime for a month |
| GET | `/api/reports/material-consumption` | Material consumption by material, work order and equipment |
| GET | `/api/reports/backlog-hours-by-work-center` | Open backlog hours per work centre (dashboard widget) |
| GET | `/api/reports/top-cost-equipment` | Highest-cost equipment by committed cost (dashboard widget) |
| GET | `/api/reports/notifications-awaiting-conversion` | Notifications awaiting work-order conversion (dashboard widget) |
| GET | `/api/reports/{report}/export.xlsx` | Export any of the ten reports above as a server-built `.xlsx` workbook |

The month-scoped reports accept `year` and `month` and default to the current month. Every report accepts the shared report filters it supports (date range, functional location with `includeDescendantLocations`, equipment, work centre) and rejects an unsupported or malformed filter with `400`; `notifications-awaiting-conversion` rejects `workCenterId` because a notification carries no work centre. The `.xlsx` route accepts the same filters as its JSON sibling. All reports are read-only and available to any authenticated role.

### Alerts

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/alerts` | List alerts for the current user |
| GET | `/api/alerts/unread-count` | Unread alert count for the current user |
| PUT | `/api/alerts/read-all` | Mark all of the current user's alerts as read |
| PUT | `/api/alerts/{id}/read` | Mark one alert as read |

Alert operations are scoped to the authenticated user.

### Comments

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/comments` | List comments for an entity |
| POST | `/api/comments` | Add a comment to an entity |
| DELETE | `/api/comments/{id}` | Delete a comment |

Comments and attachments attach to an entity by `entityType` and `entityId`. Supported entity types are listed per operation in the spec.

### Attachments

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/attachments` | List attachments for an entity |
| POST | `/api/attachments` | Upload a file and attach it to an entity |
| GET | `/api/attachments/{id}/download` | Download an attachment |
| DELETE | `/api/attachments/{id}` | Soft delete an attachment |

Upload takes a `multipart/form-data` body with a single `file` part. Files are capped at 10 MB. The accepted types are a widened document and drawing allowlist (images, PDF, text, CSV, office documents, CAD formats such as `.dwg`/`.dxf`/`.step`); executables and scripts are refused by filename extension regardless of the declared MIME type. The exact sets live in `backend/src/utils/uploadRules.ts`.

### Audit Log

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/audit-log` | List audit log entries (Administrator only) |

### Users

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/users` | List all users (Administrator only) |
| GET | `/api/users/options` | List active users for pickers |
| GET | `/api/users/{id}` | Get one user |
| PUT | `/api/users/{id}` | Update a user (Administrator only) |
| PUT | `/api/users/{id}/password` | Change a password |

Use `/api/users/options` for dropdown and assignee fields; it is available from the Requester role upwards. Password hashes are never returned. A user may change their own password by supplying `currentPassword`; an Administrator may set any user's password without it.

### Dashboard

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/dashboard/kpis` | Dashboard KPI counters |
| GET | `/api/dashboard/alerts` | Alerts addressed to the current user |
| GET | `/api/dashboard/cost-summary` | Monthly planned vs actual cost trend |

### System Config

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/system-config` | List known system configuration values with their current or default values |
| PUT | `/api/system-config` | Set one known system configuration value (Administrator only) |

The writable key set is a fixed allowlist (`wo_number_prefix`, `notif_number_prefix`); anything else is rejected by validation.

## Known v1.0.0 limitations

These are documented gaps, not bugs to work around silently. All are tracked as v1.1 items.

- Monetary fields (`standardCost`, `cost`, `unitCost`, `costRatePerHour`, `hourlyRate`, `plannedCost`, `actualCost`, work order cost totals) are `DECIMAL(12,2)` since D-17/E.13 and are served to the API as JSON numbers. Quantity/duration columns (`currentStock`, hours, `percentage`) remain binary float.
- `MaintenancePlan.functionalLocationId` is a retained compatibility column with no `@relation` and is not enforced as a foreign key. Target-based planning moved to `MaintenancePlanTarget`, whose `functionalLocationId` (and `equipmentId`) **are** enforced foreign keys (schema.prisma, F3).
- Failure codes and causes are not yet referenced by any work order column.
- `WorkOrderOperation.status` and several other status and type columns are free text rather than constrained enums.
