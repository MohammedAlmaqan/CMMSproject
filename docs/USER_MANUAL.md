# CommandPulse CMMS - User Manual

Audience: plant operators, technicians, supervisors, planners, administrators, and auditors who use the CommandPulse CMMS web application.

This manual describes **what the software actually does today**. Where a task is not available in the screen you are looking at, this manual says so and tells you who to contact, rather than describing a button that does not exist. Tasks that currently require the API are marked **API only** and are not part of the point-and-click workflow.

Related documents:

- [Installation & Deployment Guide](../INSTALLATION_GUIDE.md) - for the person installing or hosting the system
- [Administrator Guide](ADMIN_GUIDE.md) - for IT, database, and system administration
- [API Reference](API_REFERENCE.md) - every endpoint the backend exposes
- [README](../README.md) - overview and demo accounts

---

## Table of contents

1. [How to read this manual](#1-how-to-read-this-manual)
2. [Signing in and session behaviour](#2-signing-in-and-session-behaviour)
3. [How the application is laid out](#3-how-the-application-is-laid-out)
4. [Roles and what each one can actually do](#4-roles-and-what-each-one-can-actually-do)
5. [Requester](#5-requester)
6. [Technician](#6-technician)
7. [Maintenance Supervisor](#7-maintenance-supervisor)
8. [Maintenance Planner](#8-maintenance-planner)
9. [Administrator](#9-administrator)
10. [View-Only / Auditor](#10-view-only--auditor)
11. [Reference: the work order lifecycle](#11-reference-the-work-order-lifecycle)
12. [Reference: the seven reports](#12-reference-the-seven-reports)
13. [Reference: work order detail tabs](#13-reference-work-order-detail-tabs)
14. [Reference: operations that are not available in the screen](#14-reference-operations-that-are-not-available-in-the-screen)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. How to read this manual

**Two conventions are used throughout:**

- `API only` - the operation has no screen in the web application. It is done through the API by an administrator, or requested from one.
- `[screenshot pending]` - no screenshot of this step exists yet. The written steps are complete and accurate without it.

**Screenshots** point at images in the `screenshots/` folder of this repository. They are captured from development builds and may differ slightly in wording from your deployment, but the layout, tabs, and buttons are the same.

**Where permissions are enforced.** The menus in this application are not filtered by role: every signed-in user sees all ten navigation items and can open every page. A small number of buttons are hidden based on your role, but most permissions are enforced by the server, not by the screen. If you perform an action your role is not allowed to perform, the server rejects it and you see an error rather than a successful change. This is the normal, expected behaviour, not a fault. It also means a screen that looks editable may still refuse your action.

---

## 2. Signing in and session behaviour

### 2.1 Sign in

1. Open the application URL supplied by your administrator, for example `http://localhost:3000` on a development machine.
2. Enter your username and password on the sign-in screen.
3. Select **Sign in**.

![Sign in screen](../screenshots/login.png)

You are taken to the Dashboard. If you are already signed in and open the application again, you go straight to the Dashboard.

On a fresh demo installation the following accounts exist, all with the password `password`: `admin`, `planner`, `supervisor`, `tech1`, `tech2`, `operator`, and `auditor`. See [README](../README.md#demo-accounts). Change or remove these accounts before the system is used for anything real.

### 2.2 What happens when a sign-in is refused

| What you see | What it means | What to do |
|---|---|---|
| `Invalid credentials` | The username or password is wrong, **or** the account is disabled or deleted. | Check spelling and caps. If you are sure the password is right, ask an administrator to check whether the account is active. A disabled account is deliberately not reported separately, to avoid revealing which usernames exist. |
| `Account temporarily locked. Try again later.` | Five failed sign-ins within 15 minutes. The account is locked for 30 minutes. | Wait 30 minutes. The lock lifts by itself. If it must be lifted sooner, an administrator can clear it - see the [Administrator Guide](ADMIN_GUIDE.md#6-user-administration). |
| The page loads but shows no data, or an error after a click | Too many sign-in attempts from your network address. | Wait 15 minutes. The limit is 20 sign-in attempts per 15 minutes per IP address. |

Note that a correct password entered inside the lockout window still returns the lockout message. The 30-minute window is not shortened by getting the password right.

### 2.3 Idle timeout

If you do not move the mouse, click, type, scroll, or touch the screen for **30 minutes**, a warning appears for 60 seconds and then you are signed out and returned to the sign-in screen. Any of those actions counts as activity, so working normally will not trigger it.

This timeout runs in your browser only. It reduces the risk of an unattended left-open screen, but it is not a server-side session control: if someone bypasses the browser, the token itself remains valid until it expires (8 hours by default). See [Security posture](ADMIN_GUIDE.md#12-security-posture).

---

## 3. How the application is laid out

### 3.1 Navigation

The left sidebar shows all ten sections to every signed-in user:

| Section | What it is for |
|---|---|
| Dashboard | Plant-wide KPIs, system alerts, and work order status summary |
| Work Orders | List, create, and execute work orders |
| Notifications | Equipment problem reports, and conversion to a work order |
| Equipment | Equipment register and per-equipment detail, including meters and BOM |
| Locations | Functional location register |
| Materials | Material register |
| Work Centers | Work center register and craft capabilities |
| Preventive Maintenance | Time, meter, and combined PM plans with due dates |
| Reports | The seven standard reports, each with CSV export |
| Administration | Users and roles, audit log, and settings summary |

### 3.2 Command palette

Press `Ctrl+K` to open the command palette, then search for a screen or an action. `[screenshot pending]`

### 3.3 Standard list behaviour

Every register screen follows the same pattern: a search box, a row of filters, a count of matching records, and a table. Use the search box to filter as you type, and the filters to narrow by the columns offered on that screen. Records that have been deleted are hidden from all lists.

---

## 4. Roles and what each one can actually do

There are six roles. They form a hierarchy, where each role includes the permissions of the roles below it:

```
Administrator  (highest)
   |
Maintenance Planner
   |
Maintenance Supervisor
   |
Technician
   |
Requester
   |
View-Only  (lowest, read only)
```

A **Maintenance Supervisor** can therefore do everything a Technician can do, and a **Maintenance Planner** can do everything a Supervisor can do, in addition to planning.

The Administration screen contains an "RBAC Configuration" panel that lists these roles. Treat that panel as background information only: it is fixed text, it is not configurable, and one line in it is inaccurate. It says a Requester can "view own requests", but the Notifications list in fact shows **all** notifications to every signed-in user, not only your own. Section 5 explains how to work with that in practice.

| Role | In practice |
|---|---|
| Requester | Raise work orders, report problems, track their progress, read the registers and reports |
| Technician | Execute work orders: operations, labor, materials, services, checklists, comments, attachments |
| Maintenance Supervisor | Everything a Technician does, plus approve and close work orders, convert notifications, run the reports |
| Maintenance Planner | Everything a Supervisor does, plus own the preventive maintenance plans |
| Administrator | Everything a Planner does, plus user administration and the audit log |
| View-Only | Read everything, change nothing |

---

## 5. Requester

### 5.1 Create a work order

You can raise a work order for maintenance, repair, or a request.

1. Select **Work Orders** in the sidebar.
2. Select **New Work Order** (or **+ New**, depending on your screen width).
3. Complete the form:
   - **Description** - what needs doing, in plain language.
   - **Type** - `CM` corrective, `PM` preventive, `PdM` predictive, `EM` emergency, or `CAL` calibration.
   - **Priority** - `High`, `Medium`, or `Low`.
   - **Equipment** and **Functional Location** - link the job to the asset.
   - **Reported By** - defaults to you; change it to attribute the report correctly.
   - **Description of the problem / details**, and the planned dates if you know them.
4. Select **Create**.

The work order is created in status **Draft** and appears in the list. Record the work order number shown in the list; you will use it for all follow-up.

![New work order form](../screenshots/g5_3_03_create_form.png)

### 5.2 Track the progress of a work order

1. Select **Work Orders**.
2. Find your work order - search by work order number or description, or filter by status.
3. Select the row to open it.

The detail screen shows the current status, and the **History** tab shows every status change with its date and time.

![Work orders list](../screenshots/g5_3_02_work_orders_list.png)

### 5.3 Raise a problem report (notification)

A **notification** records a problem against a piece of equipment or a location. It can later be converted into a work order.

**`API only` - there is no screen for raising a notification today.** The Notifications screen lists, filters, and opens existing notifications but has no create form. A **Create Notification** entry exists in the command palette, but it only navigates to the list; it does not open a form.

Until a create screen exists, ask an administrator or your supervisor to raise the notification through the API, or have them raise a work order directly using section 5.1. See [section 14](#14-reference-operations-that-are-not-available-in-the-screen) for the API request.

### 5.4 Follow up the status of notifications

1. Select **Notifications**.
2. Filter by **Status** to narrow to `New`, `Acknowledged`, `Converted`, or `Closed`, or use the search box.
3. Select a row to open it. The detail screen shows the reporter, the equipment or location, and the full history.

**Important:** the Notifications list is **not** limited to notifications you raised - every signed-in user sees all of them. To find your own reports, sort or search and then check the **Reported By** name on the detail screen. `[screenshot pending]`

### 5.5 Other things you can do

- Read the Dashboard for plant-wide status and any system alerts.
- Read the Equipment, Locations, Materials, and Work Centers registers.
- Open any of the seven reports and export them to CSV. Reports are available to every signed-in role, including Requester and View-Only.
- Add a comment to a work order and attach a document to a work order you raised.

---

## 6. Technician

### 6.1 Open a work order assigned to you

1. Select **Work Orders**.
2. Search or filter to find the job, then select it to open the detail screen.

The detail screen has eight tabs: **Operations, Materials, Labor, Services, Checklists, Comments, Attachments, History**. See [section 13](#13-reference-work-order-detail-tabs).

### 6.2 Record the work

Work through the tabs as you carry out the job:

- **Operations** - each line of work to be performed. Record what was actually done.
  ![Operations tab](../screenshots/g1_01_operation_added.png)
- **Materials** - parts and consumables issued to the job, drawn from the material register.
  ![Materials tab](../screenshots/g1_02_material_added.png)
- **Labor** - time booked against the work, for yourself or a craft. This is what drives the labour cost shown on the work order.
  ![Labor tab](../screenshots/g1_03_labor_added.png)
- **Services** - work sent to an external contractor, with the cost.
  ![Services tab](../screenshots/g1_04_service_added.png)
- **Checklists** - answer the safety and quality checklist items for this work order.
  ![Checklists tab](../screenshots/g1_05_checklist_responded.png)
- **Comments** - free-text notes and discussion on the job.
  ![Comments tab](../screenshots/ma_05_comments.png)

### 6.3 Attach a document to the work order

1. Open the work order.
2. Select the **Attachments** tab.
3. Select **Upload** and choose a file.
4. The upload completes and the file is listed with its name, size, and who uploaded it.

![Attachments tab](../screenshots/g3_2_01_wo_attachments_tab.png)

**Deleting an attachment** is limited to Maintenance Supervisor and Administrator. As a Technician you can upload and download but not delete. If you uploaded the wrong file, add a comment explaining, and ask a supervisor to remove it.

### 6.4 Complete the work order

When the job is finished:

1. Make sure the work order is **In Progress** (from **Scheduled**). Use the status control at the top of the work order.
2. Record the operations, labor, and materials as above - a work order closed with no labor recorded will show zero labour cost.
3. Select **Completed**.

Only a **Maintenance Supervisor** or **Administrator** can move a work order from **Completed** to **Closed**. Expect your supervisor to do that during review. If you select a status that is not a valid next step for the current status, the change is rejected and the current status is left untouched.

The full set of valid status changes is in [section 11](#11-reference-the-work-order-lifecycle).

---

## 7. Maintenance Supervisor

A Maintenance Supervisor can do everything in [section 6](#6-technician), plus the following.

### 7.1 Approve and schedule a work order

1. Open the work order from the list or the Dashboard.
2. Use the status control to move it through **Draft → Planned → Scheduled** as it is approved and scheduled.
3. Add a comment recording the approval decision if you need to explain it later.

### 7.2 Close a work order

1. Open the work order and confirm the job is genuinely finished: operations recorded, labor booked, materials issued, and any checklist answered.
2. Move it to **Completed**.
3. Select **Close**.

The **Close** button is available to Maintenance Supervisor and Administrator only. Once a work order is **Closed** no further status change is possible, and the record becomes effectively read-only.

![Closed work order](../screenshots/g5_3_04_wo_closed.png)

You can also close from the work orders list: use the close control on the row, which is shown to Maintenance Supervisor and Administrator.

### 7.3 Convert a notification into a work order

This is how a reported problem becomes tracked work.

1. Select **Notifications**.
2. Open the notification you want to action.
3. Review the description, equipment, and location, and add a comment if you need to add detail.
4. Select **Convert to Work Order**.
5. The system creates a linked work order and marks the notification **Converted**.

![Notification detail](../screenshots/g5_3_05_notification_detail.png)
![Converted notification](../screenshots/g2_03_notification_detail_converted.png)

The new work order appears in the work orders list with a link back to the source notification, and the notification remains in the list as a permanent record of what was raised. The History tab on the work order shows the conversion.

### 7.4 Run the reports

1. Select **Reports**.
2. Choose one of the seven reports from the tabs.
3. Set any date range and filters offered on that report.
4. Read the results, then select **Export CSV** to download them for Excel or further analysis.

![Backlog report](../screenshots/g5_01_reports_backlog.png)
![PM compliance report](../screenshots/g5_02_reports_pm_compliance.png)
![Material report](../screenshots/g5_02_reports_material.png)

The seven reports are listed in [section 12](#12-reference-the-seven-reports). Reports are not restricted by role - every signed-in user can run and export them.

---

## 8. Maintenance Planner

A Maintenance Planner can do everything in [section 7](#7-maintenance-supervisor), plus the following. Read the honesty notes carefully: **most preventive maintenance setup is currently `API only`.**

### 8.1 View the preventive maintenance schedule

1. Select **Preventive Maintenance**.
2. The page shows summary tiles for Time-Based, Meter-Based, Combined, and Active plan counts.
3. The table below lists every plan with its plan code, description, equipment, strategy, interval, call horizon, work center, task list, status, next due date, and a **Generate** action.

![PM plan list](../screenshots/g4a_01_plan_list.png)
![PM plan details](../screenshots/g4a_02_plan_row_details.png)

Use the search box and the strategy and status filters to find the plans you own. Note the **Next Due** column: that is the date the plan is next expected to generate a work order.

### 8.2 Generate a work order from a plan immediately

1. On the Preventive Maintenance page, find the plan.
2. Select **Generate** on that row.
3. A work order is created for the plan and the row shows the generation state while it runs.

Use this to test a plan or to bring forward work that the nightly run has not produced yet. The nightly automated run is described in the [Administrator Guide](ADMIN_GUIDE.md#5-scheduler-operations).

### 8.3 Create or edit a PM plan - `API only`

**There is no screen for creating, editing, or deleting a preventive maintenance plan.** The Preventive Maintenance page is a read-only register with a Generate action. A plan can only be added or changed through the API:

- `POST /api/maintenance-plans` - create a plan (Requester and above)
- `PUT /api/maintenance-plans/{id}` - change a plan (Requester and above)
- `DELETE /api/maintenance-plans/{id}` - delete a plan (Maintenance Supervisor and above)

Ask an administrator to apply the change, and supply the plan code, description, equipment, strategy, interval, call horizon, and work center. See the [API Reference](API_REFERENCE.md#maintenance-plans).

### 8.4 Edit a PM task list - `API only`

**There is no screen for task lists at all.** There is no Task Lists item in the sidebar and no task list route in the application. A plan's task list column shows the task list name once one is attached, but it cannot be created or edited on screen. Changes are made through the `/api/task-lists` endpoints.

### 8.5 Run the scheduler manually - `API only`

**There is no button on the Preventive Maintenance page to run the scheduler.** It is triggered by the API:

```
POST /api/maintenance-plans/run-scheduler
```

This requires an Administrator token. See the [Administrator Guide](ADMIN_GUIDE.md#52-running-the-scheduler-manually) for the exact command and for what to check afterwards.

---

## 9. Administrator

A Maintenance Planner can do everything in [section 8](#8-maintenance-planner), plus user and audit administration. As with PM plans, **most user administration is `API only` today.**

### 9.1 Administration screen

Select **Administration**. The screen has three tabs:

- **Users & Roles** - a read-only list of every user with username, full name, email, role, active flag, and last sign-in. There is no create, edit, or delete button on this screen.
- **Audit Log** - every recorded change, filterable by table, action, and free text, and paginated. Only Administrators can read it; any other role selecting this tab receives an error.
- **Settings** - a read-only summary of the current configuration values.

### 9.2 Create a user - `API only`, and the API does not support it either

**There is no `POST /api/users` endpoint and no create-user screen.** Users come from the seed script or are inserted into the database directly. See the [Administrator Guide](ADMIN_GUIDE.md#61-create-a-user) for the supported procedure.

### 9.3 Disable a user

1. Confirm the person should no longer sign in. Disabling takes effect at their next sign-in attempt; they are not signed out of an existing session.
2. Use the API:

```
PUT /api/users/{userId}
{ "isActive": false }
```

A disabled account is refused at sign-in with the generic `Invalid credentials` message - the system deliberately does not tell the user that the account is disabled. Re-enable by sending `"isActive": true`.

### 9.4 Reset a password

```
PUT /api/users/{userId}/password
{ "newPassword": "<the new password>" }
```

This requires an Administrator token and **does not require the target user's current password**. The reset is written to the audit log. Communicate the new password to the user through a channel other than email, and require a change on first use where your policy demands it. Note that the system has no separate "must change password" flag, so treat the reset as final.

### 9.5 Review the audit log

1. Select **Administration**, then the **Audit Log** tab.
2. Filter by table name, action, or search text to isolate what you need.
3. Page through the results.

The audit log is append-only through the application: there is no API to edit or delete an audit entry. For what is and is not recorded, see the [Administrator Guide](ADMIN_GUIDE.md#8-audit-log).

---

## 10. View-Only / Auditor

A View-Only user is a reader.

- You see all ten navigation sections and can open every screen: Dashboard, all registers, all work orders and their detail tabs, notifications, the PM plan register, and all seven reports with CSV export.
- **Every write is refused by the server.** Opening a form, selecting a tab, or seeing an upload or create control does not mean the action will succeed; the save will be rejected. This is expected, not a fault.
- Only Administrators can read the audit log, so the **Audit Log** tab will return an error for you.
- Do not use a View-Only account to test changes, even on a development system: nothing you attempt will take effect, which can waste troubleshooting time.

---

## 11. Reference: the work order lifecycle

A work order moves through a fixed set of statuses. Only the transitions below are accepted; anything else is rejected and the status is left unchanged.

| From | You may move it to |
|---|---|
| Draft | Planned, Cancelled |
| Planned | Scheduled, Draft |
| Scheduled | In Progress, Planned, Cancelled |
| In Progress | Completed, Suspended |
| Suspended | In Progress, Cancelled |
| Completed | Closed |
| Closed | *(nothing - Closed is final)* |
| Cancelled | Draft |

Notes that matter day to day:

- Starting and finishing work (**Scheduled → In Progress → Completed**) needs Technician or above.
- **Closing** (**Completed → Closed**) needs Maintenance Supervisor or Administrator. The Close button is hidden from lower roles.
- Moving a job back to **In Progress** from **Suspended** is how you resume work that was paused.
- **Closed is final.** There is no reopen transition, so confirm the job is truly finished before closing it.
- Moving to **In Progress** and **Completed** records actual start and finish timestamps, which is what the cost and duration figures are calculated from.
- Cancelling from Draft, Planned, Scheduled, or Suspended is allowed; cancelling an In Progress job is not - finish or suspend it first.

---

## 12. Reference: the seven reports

All seven are on the **Reports** screen, all are available to every signed-in role, and all export to CSV.

| Report | What it answers |
|---|---|
| Work Order Backlog | What is outstanding, by status, priority, and age? |
| Work Order Cost Analysis | What does each work order, equipment item, or period actually cost in labor, materials, and services? |
| PM Compliance | Are preventive maintenance plans being generated and completed on time? |
| Material Usage | Which materials are being consumed, and on which work orders? |
| Labor Hours | Who worked how many hours, by craft, equipment, or period? |
| Equipment Downtime | How long has each asset been down, and what drove it? |
| Notification / Failure Analysis | What is failing, how often, and what is the failure pattern? |

![Reports screen](../screenshots/g5_01_reports_backlog.png)

---

## 13. Reference: work order detail tabs

| Tab | What it holds | Typical role |
|---|---|---|
| Operations | The lines of work to be performed, and what was done | Technician |
| Materials | Parts and consumables issued, with quantity and cost | Technician |
| Labor | Time booked, by person and craft, with cost | Technician |
| Services | External contractor work, with cost | Technician |
| Checklists | Safety and quality checklist responses | Technician |
| Comments | Free-text notes and discussion | Everyone |
| Attachments | Uploaded files; delete limited to Supervisor and Administrator | Everyone uploads, Supervisor+ deletes |
| History | Every status change, with timestamp and user | Read only |

Each of the first six tabs has its own add form, so you stay on the work order while you work. The **History** tab is the authoritative record of what changed and when - use it instead of asking colleagues when something happened.

---

## 14. Reference: operations that are not available in the screen

These operations exist in the system but have no screen. This section exists so you are not left looking for a button that is not there.

| Operation | Screen available? | How it is done |
|---|---|---|
| Raise a notification | No | `POST /api/notifications` - Requester and above |
| Create / edit / delete a PM plan | No | `/api/maintenance-plans` endpoints - Maintenance Planner and above |
| Create or edit a PM task list | No | `/api/maintenance-plans/task-lists` endpoints |
| Run the PM scheduler manually | No | `POST /api/maintenance-plans/run-scheduler` - Administrator |
| Create a user | No | **No API exists.** Insert into the database - see the [Administrator Guide](ADMIN_GUIDE.md#61-create-a-user) |
| Reset a user's password | No | `PUT /api/users/{userId}/password` - Administrator |
| Disable a user | No | `PUT /api/users/{userId}` with `isActive: false` |
| Delete a user | No | **No API exists.** Soft delete by database update - see the [Administrator Guide](ADMIN_GUIDE.md#67-delete-or-decommission-a-user) |
| Clear a lockout early | No | **No API exists.** Database update - see the [Administrator Guide](ADMIN_GUIDE.md#64-clear-an-account-lockout) |
| Edit system settings | No | Read-only screen; settings come from environment variables - see the [Administrator Guide](ADMIN_GUIDE.md#3-configuration) |

If a task you need is on this list and there is no screen for it, raise it with your administrator. It is a known gap, not user error.

---

## 15. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `Invalid credentials` and the password is definitely right | The account is disabled or deleted | Ask an administrator to check the account's active flag |
| `Account temporarily locked` | Five failed attempts in 15 minutes | Wait 30 minutes, or ask an administrator to clear it early |
| Error after clicking Save, on a form you can see | Your role is not permitted to perform that write | This is the server refusing the action. Ask a colleague with a higher role, or see [section 14](#14-reference-operations-that-are-not-available-in-the-screen) |
| A record you just created is not in the list | Search or filter is still applied | Clear the search box and filters |
| An attachment will not upload | File too large, or a duplicate name in use | Check the size limit, and rename the file |
| The Audit Log tab shows an error | Only Administrators can read the audit log | Expected for every other role |
| Signed out unexpectedly after a long pause | 30-minute idle timeout | Sign in again; unsaved form entries are lost |
| Reports show no rows | Date range or filters too narrow | Widen the date range and clear filters |
| A PM plan has not generated a work order | Not yet due, or the nightly run has not happened | Check **Next Due** on the plan, and ask an administrator to check the scheduler - see the [Administrator Guide](ADMIN_GUIDE.md#53-when-the-scheduler-reports-stale) |
| "Service temporarily unavailable" on a page | The backend is not running or is unreachable | Contact your administrator; this is a server-side problem, not yours |

When you report a problem, include the work order or notification number, the screen, what you selected, and the exact error text. The **History** tab on a work order often answers "what changed and when" without needing anyone to look it up.
