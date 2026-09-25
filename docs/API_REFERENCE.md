# API Reference

Reference documentation for the CMMS REST API, version 1.0.0.

- **Base URL:** `http://localhost:4000`
- **Interactive UI:** `/api-docs` (Swagger UI)
- **Machine-readable spec:** [`openapi.json`](./openapi.json) (OpenAPI 3.0.0, also served live at `/api-docs.json`)

The spec is generated from `@openapi` annotations in the route source files, so it always matches the running code. Regenerate it with `npm run build && npm start` and re-export from `/api-docs.json`.

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
- **Soft versus hard delete.** Most records are soft deleted: an `isDeleted` flag is set, the row is filtered out of later reads, and child rows are retained. This covers master data (locations, equipment, work centers, materials, task lists, plans, meters) and work-order records including labor entries and work orders. The exceptions are physically removed, with the parent work order as the soft-delete boundary: work order operations, work order material lines, external service costs, comments and checklist instances. These tables have no `isDeleted` column, so a delete there is not reversible through the API.
- **Audit log.** Create, update and delete operations on master data and work orders write an `AuditLogEntry` recording the user and originating IP.
- **Costs.** Work order `estimatedCost` and `actualCost` are recomputed server-side from the child records whenever an operation, material line, labor entry or external service cost changes. Clients send quantities and rates, never totals.
- **Not-found handling.** Missing referenced records return `400` (a Prisma foreign-key error translated at the boundary) or `404` depending on the endpoint; the applicable code is listed per operation.

## Endpoint groups

114 operations across 71 paths and 24 routers.

| Group | Base path | Operations |
| --- | --- | --- |
| Authentication | `/api/auth` | 2 |
| Functional Locations | `/api/functional-locations` | 6 |
| Equipment | `/api/equipment` | 7 |
| Equipment Meters | `/api/equipment-meters` | 6 |
| Work Centers | `/api/work-centers` | 5 |
| Materials | `/api/materials` | 7 |
| Failure Codes | `/api/failure-codes` | 6 |
| Task Lists | `/api/task-lists` | 5 |
| Notifications | `/api/notifications` | 6 |
| Work Orders | `/api/work-orders` | 6 |
| Work Order Operations | `/api/work-order-operations` | 4 |
| Work Order Materials | `/api/work-order-materials` | 4 |
| Labor | `/api/labor` | 4 |
| External Services | `/api/external-services` | 4 |
| Crafts | `/api/crafts` | 1 |
| Maintenance Plans | `/api/maintenance-plans` | 7 |
| Safety Checklists | `/api/safety-checklists` | 7 |
| Reports | `/api/reports` | 7 |
| Alerts | `/api/alerts` | 4 |
| Comments | `/api/comments` | 3 |
| Attachments | `/api/attachments` | 4 |
| Audit Log | `/api/audit-log` | 1 |
| Users | `/api/users` | 5 |
| Dashboard | `/api/dashboard` | 3 |

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
| POST | `/api/equipment` | Create an equipment record |
| PUT | `/api/equipment/{id}` | Update an equipment record |
| DELETE | `/api/equipment/{id}` | Soft delete an equipment record |
| GET | `/api/equipment/export.csv` | Export the equipment register as CSV |
| POST | `/api/equipment/import.csv` | Bulk import equipment from CSV |

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

Converting a notification creates a CM work order, copies the location, equipment, priority and breakdown flag, links the notification to the new work order and sets the notification status to `Converted`.

### Work Orders

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/work-orders` | List work orders (paginated with filters) |
| GET | `/api/work-orders/{id}` | Get a work order by id (full sub-domain detail) |
| POST | `/api/work-orders` | Create a work order |
| PUT | `/api/work-orders/{id}` | Update a work order |
| DELETE | `/api/work-orders/{id}` | Soft-delete a work order |
| PUT | `/api/work-orders/{id}/status` | Transition work order status |

The list endpoint is paginated with `skip` and `take`. Status changes go through the dedicated status endpoint rather than a general update, so the transition is validated.

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

Crafts are seeded reference data and are read-only through the API in v1.0.0.

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
| GET | `/api/reports/backlog` | Work order backlog by status |
| GET | `/api/reports/pm-compliance` | PM compliance rate for a month |
| GET | `/api/reports/mtbf` | Mean time between failures |
| GET | `/api/reports/mttr` | Mean time to repair |
| GET | `/api/reports/cost-summary` | Work order cost summary for a month |
| GET | `/api/reports/downtime` | Equipment downtime for a month |
| GET | `/api/reports/material-consumption` | Material consumption for a month |

The month-scoped reports accept `year` and `month` and default to the current month. All reports are read-only and available to any authenticated role.

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

Upload takes a `multipart/form-data` body with a single `file` part.

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

## Known v1.0.0 limitations

These are documented gaps, not bugs to work around silently. All are tracked as v1.1 items.

- Monetary fields (`standardCost`, `cost`, `unitCost`, `costRatePerHour`, work order cost totals) are Float rather than Decimal.
- `MaintenancePlan.functionalLocationId` is not enforced as a foreign key.
- Failure codes and causes are not yet referenced by any work order column.
- `WorkOrderOperation.status` and several other status and type columns are free text rather than constrained enums.
