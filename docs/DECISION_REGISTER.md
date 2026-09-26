# Phase A — Scope Freeze and Decision Register

| | |
|---|---|
| **Purpose** | Convert SOW §6.4 from prose into a finite, signed, per-clause work list before any further engineering begins. |
| **Baseline** | `v1.0.0` — tag object `386fe3c`, commit `0d941df`. Shipped and immutable. |
| **Source of record** | `docs/SOW_COMPLIANCE.md` (214 clause rows) |
| **Machine check** | `python scripts/verify/verify_a1.py` — re-derives every count in this document from the matrix. |
| **Status** | ⛔ **NOT SIGNED.** Preparation complete; Client signature outstanding. |
| **Owner of the decisions** | Client. The vendor cannot dispose of a clause. |

---

## 1. Why this document exists

The SOW states its own definition of done in one place: **§6.4 Acceptance Criteria**. Of the six criteria, five are `Not Met` and one is `Partial` in the v1.0.0 matrix.

§6.4.1 reads: *"All functional requirements listed in §3 are implemented and pass UAT scripts."*

Of the 126 §3 clause rows, **38 are Met**, 11 are already out of scope by Client agreement (4 Deferred, 7 Excluded), and **77 are neither Deferred nor Excluded** — they are `Partial` or `Not Met`. Those 77 are the entire engineering question. Each one must either be built, or be waived in writing by the Client, before §6.4.1 can honestly be called `Met`.

This document is the instrument for that. It does not decide anything on the Client's behalf. It presents the 77 rows, states what each would cost in engineering terms, and asks for a signature.

**A phase without a gate is a wish.** The gate for Phase A is at the end of this document. It is unsigned.

---

## 2. Disposition vocabulary

Exactly one of these is applied to each of the 77 rows. No third option exists.

| Disposition | Meaning | Effect on §6.4.1 |
|---|---|---|
| **Build** | The clause is committed for delivery. It appears in a Phase B–I plan and must reach `Met` with evidence. | Row must reach `Met` |
| **Waive** | The Client accepts that the clause will not be delivered. Requires a decision ID and a written business reason. | Row closes as `Waived` against that ID |
| **Deferred** | *Already applied* by prior agreement (D1–D8). Not in this register. | Row already out of scope |
| **Excluded** | *Already applied* by prior Client decision (X1–X7). Not in this register. | Row already out of scope |

A `Waive` is not a deletion. Waived rows stay in `docs/SOW_COMPLIANCE.md` and in every future matrix, marked `Waived` with the decision ID. They are never silently reclassified as `Met`, and the matrix's own instruction stands: X1–X7 *"should not be re-litigated at acceptance."*

**Budget note for the Client.** 77 rows is not a small number. If all 77 are built, the honest answer to "when is this production-ready" is a multi-month programme across Phases B–I, and it is gated on four things no amount of coding accelerates: the Client's signature, a Windows/IIS host, live PostgreSQL credentials, and the Client's legacy data. The purpose of waiving is to make the go-live date depend on the work that matters to the plant rather than on the work that does not.

---

## 3. Decision D-1 — the governing question

> **For each of the 77 rows in §5: Build, or Waive?**

D-1 is not a question the vendor can answer, and it is the only decision that cannot be deferred. Every other decision (D-2 … D-16) narrows the engineering; D-1 decides the size of it.

**Consequences of leaving D-1 open**

- Phases B–I cannot be sized, scheduled or committed to a date.
- The go-live date cannot be stated.
- §6.4.1 remains `Not Met` by arithmetic, regardless of how much is built: 77 rows open means §6.4.1 is `Not Met`.

**Consequences of answering it**

- Every row acquires a disposition and an owner.
- The plan below Phase A becomes a schedule.
- The §6.4 acceptance pack can be assembled, because the number of things it must demonstrate is now known.

---

## 4. Decisions D-2 … D-16

Each decision below is a **question**, not a proposal. Options are stated neutrally. The recommendation is the vendor's engineering opinion and is labelled as such; the Client is free to choose otherwise, and a different answer is not a defect.

| ID | Clause | Question | Options | Vendor recommendation | Owner | **Answer** (Client) |
|---|---|---|---|---|---|---|
| **D-2** | §6.4.6 | §6.4.6 requires "Documentation delivered **and training completed**". Decision X7 already removed training from scope. The criterion cannot be satisfied as written. | (a) Amend §6.4.6 to documentation-only, consistent with X7. (b) Reinstate training, reversing X7. | **(a)**. X7 was an explicit Client decision; leaving the contradictory criterion in place creates a permanent unmeetable acceptance criterion. | Client |  |
| **D-3** | §3.5.1 | Planned labour cost is implemented as `plannedHours × numberOfTechnicians × craftRate`. The SOW formula reads `planned labour hours × craft rate`. The SOW does not state whether planned hours are per technician or per operation. **Every planned-cost figure and the §3.7.1 cost summary depend on the answer.** | (a) Planned hours are per technician — current implementation stands. (b) Planned hours are per operation — divide out the technician multiplier. (c) Treat as unspecified and agree a plant convention. | **(c)**, then (a) or (b) as the convention. This is a Finance question, not an engineering one, and the two answers produce materially different planned totals. | Client — Maintenance / Finance |  |
| **D-4** | §4.3 | §4.3 requires **RPO < 1 hour**. The delivered backup is a daily `pg_dump`, giving an RPO of up to 24 hours — three times the objective. | (a) Implement WAL archiving and differential backups to meet 1 h. Requires PostgreSQL configuration and a second backup target. (b) Accept a 24 h RPO in writing as a deviation, with the business impact stated. | **(a)** if the plant cannot absorb a day of lost work; **(b)** is acceptable only if someone with authority signs the risk. A daily schedule cannot be described as meeting §4.3. | Client IT / Operations |  |
| **D-5** | §5.5, §3.10 | §5.5 requires OAuth2 / OpenID Connect with Azure AD or on-premises AD. §3.10 requires the API to use OAuth2. v1.0.0 ships first-party JWT login, with no OAuth2 flow and no directory integration. | (a) An Azure AD tenant and app registration are available — implement OAuth2/OIDC. (b) No tenant available — accept first-party JWT as a written §5.5 deviation. | Depends entirely on **(a)** being available. If no tenant exists, (b) is the only route, and it should be recorded as a deviation rather than left as a silent `Not Met`. | Client IT |  |
| **D-6** | §3.9 | §3.9 requires a *"Responsive web interface that functions on tablets and smartphones"*. X2–X4 removed mobile **camera**, **offline** and **signatures**; they did not remove the responsive shell. This row is `Not Met` and carries no exclusion. | (a) Tablets and phones are in scope — build a responsive layout. (b) Desktop/laptop only — waive the row and record that field devices are out of scope. | Depends on how the plant actually works. If technicians use tablets in the field, (a). The current fixed-width sidebar and multi-column tables are not usable at phone width. | Client — Operations |  |
| **D-7** | §4.2 | §4.2 requires row-level data access control *"if multisite/cost-centre separation is required (optional, TBD)"*. The SOW itself marks this optional and undetermined. | (a) Separation is required — implement per-user / per-cost-centre scoping on list routes. (b) Not required — close the row. | **(b)** unless the Client operates multiple sites with separate cost-centre visibility. The SOW wrote "optional, TBD"; leaving it unanswered leaves the row permanently open. | Client |  |
| **D-8** | §4.5 | §4.5 states the data model *"should align"* with ISO 14224. No alignment assessment exists. | (a) Documentation-only field mapping is sufficient. (b) A structural alignment is required. | **(a)**. "Should align" is not a functional requirement; a documented mapping table satisfies the intent and is a Phase I deliverable. | Client — Engineering |  |
| **D-9** | §3.7.1 | §3.7.1 requires all reports exportable to **PDF and Excel**. The delivered export is **CSV** only, for two entities. | (a) PDF and Excel are required — build both. (b) CSV satisfies the operational need — waive the PDF/Excel limb. | **(a)** unless the plant's reporting process genuinely accepts CSV. The SOW names PDF and Excel; CSV is not among them. | Client — Operations / Finance |  |
| **D-10** | §3.4.1 | §3.4.1 requires a maintenance plan to target Equipment / Functional Location *"**or a list**"*. The schema has a single nullable `equipmentId`. | (a) A plan may cover multiple equipment — add a join table. (b) One plan per asset is sufficient. | **(a)** if the plant maintains fleet-wide plans (e.g. "inspect all P-100 class units monthly"); **(b)** if plans are always asset-specific. This is a genuine modelling fork, not a UI detail. | Client — Maintenance Planning |  |
| **D-11** | §3.3.8 | §3.3.8 requires *"**Any** file type"* up to 10 MB. The delivered allowlist accepts 7 MIME types (jpeg, png, webp, pdf, txt, xlsx, xls). | (a) Any file type — remove the allowlist, keep the 10 MB cap. (b) The allowlist is acceptable. | **(a)** if engineers attach CAD, DWG or proprietary formats; **(b)** is the safer default and the 10 MB cap is met either way. Note the security trade-off: an open upload path is an attack surface. | Client — Engineering / IT Security |  |
| **D-12** | §3.3.8 | §3.3.8 requires **threaded** comments. The delivered `Comment` model has no `parentId`; comments are a flat list. | (a) Threading is required. (b) A flat comment list is acceptable. | **(b)** unless a specific workflow needs reply chains. Low cost either way — a `parentId` column and one query change. | Client — Maintenance |  |
| **D-13** | §5.2, §3.7.1 | §5.2 requires an embedded reporting engine (JasperReports, DevExpress) **or SQL views** for external BI. Neither exists; reports are hand-written TypeScript. Separately, §3.7.1 requires actual-vs-**budget**, and there is no budget data anywhere in the schema. | (a) SQL views for the Client's BI tool. (b) An embedded engine. And for budget: (i) budget figures are in scope — add budget master data. (ii) actual-vs-planned satisfies the need — reword the criterion. | **SQL views (a)** — cheaper, and it unblocks the deferred D2 ad-hoc reporting item. For budget, **(ii)** is likely; actual-vs-planned variance is already delivered per cost centre and no budget source exists in the SOW. | Client — Finance / IT |  |
| **D-14** | §4.6, §1.3 | §4.6 *"Planned maintenance windows agreed in advance"* is Deferred as an operational process. §1.3's three-month post-go-live warranty is Deferred as an operational obligation. Both are `Deferred`, not failed — but nobody owns them. | Name the process and the accountable owner for each, effective at go-live. | Accept as an operational obligation, but record the owner. A deferred obligation with no owner reappears as a defect at month two. | Client Operations |  |
| **D-15** | §3.2.2 vs §2.2 | §3.2.2 says *"**Any** authenticated user can create a notification"*. §2.2 defines View-Only / Auditor as *"**read** access to all master data, work orders, history, reports"*. These two SOW clauses contradict each other. v1.0.0 resolves it by denying View-Only (HTTP 403). | (a) View-Only may raise notifications — §2.2 "read-only" is narrowed. (b) View-Only may not — §3.2.2 "any authenticated user" is narrowed. | **(b)**, and record it as a SOW interpretation. A role named "View-Only" that can create records is self-contradictory, and the same reasoning supports keeping §2.2 intact elsewhere. | Client — document owner |  |
| **D-16** | §3.3.5 vs §3.5.1 | §3.3.5 says actual labour cost = hours × craft rate *"**from work center master**"*. §3.5.1 says the same figure = hours × **craft rate**. The implementation uses `Craft.hourlyRate` and never reads `WorkCenter.costRatePerHour`, which exists in the schema precisely for this. The SOW names two different rate sources. | (a) `Craft.hourlyRate` is authoritative. (b) `WorkCenter.costRatePerHour` is authoritative. (c) `Craft.hourlyRate` by default, falling back to the work-centre rate where no craft rate is set. | **(c)**. It honours both SOW clauses, needs no new master data, and makes the currently-dead `costRatePerHour` column meaningful. | Client — Maintenance / Finance |  |

**Decisions that gate worksheet rows:** 13 of the 77 rows cannot be responsibly dispositioned until a decision lands — rows 7, 8, 14, 17, 32, 36, 37, 39, 49, 59, 63, 75, 76. The remaining **64 rows can be dispositioned immediately** on the matrix evidence alone, without waiting for anything.

---

## 5. The 77-row disposition worksheet

Generated from `docs/SOW_COMPLIANCE.md` by machine; every row's clause text and status are transcribed from the matrix, not retyped. `scripts/verify/verify_a1.py` re-parses this table and fails if it drifts from the matrix.

**Proposed phase** — the vendor's sequencing proposal, offered so the Client can see what each `Build` implies. It is advisory; the disposition, not the phase, is the decision.

| Phase | Objective | Rows |
|---|---|---|
| **B** | Trust and authorization — close the §6.4.4 Major defects | 6 |
| **C** | Workflow surfaces and master-data write paths | 18 |
| **D** | PM engine correctness (§3.4) | 11 |
| **E** | Data integrity, audit and history | 11 |
| **F** | Reporting, BI layer and the UAT pack (§6.4.1, §6.4.2) | 15 |
| **G** | Non-functional and operational readiness (§6.4.3) | 1 |
| **H** | Remaining §3 surface | 15 |
| | **Total** | **77** |

Evidence for each row — the exact code path, endpoint or absence that justifies its status — is in `docs/SOW_COMPLIANCE.md` at the cited clause. This table does not restate it.

| # | Clause | Requirement | Status | Phase | Decision | Disposition | Decision ID / reason |
|---|---|---|---|---|---|---|---|
| 1 | §3.1.1 | Drag-and-drop restructuring of the hierarchy | Not Met | C | - | [ ] Build [ ] Waive |  |
| 2 | §3.1.1 | Display open work orders and notification count for each node | Partial | C | - | [ ] Build [ ] Waive |  |
| 3 | §3.1.2 | Each equipment record assigned to exactly one functional location (lowest level) | Partial | C | - | [ ] Build [ ] Waive |  |
| 4 | §3.1.2 | BOM: associate spare parts from the material catalog with an equipment | Partial | C | - | [ ] Build [ ] Waive |  |
| 5 | §3.1.2 | Documents: attach manuals, datasheets, certificates to equipment | Partial | C | - | [ ] Build [ ] Waive |  |
| 6 | §3.1.3 | Assign crafts to each work center, each with its own hourly rate | Partial | C | - | [ ] Build [ ] Waive |  |
| 7 | §3.1.3 | Work centers and crafts used for scheduling and cost estimation | Partial | C | D-16 | [ ] Build [ ] Waive |  |
| 8 | §3.1.4 | Cause codes as root-cause categories | Partial | H | D-5 | [ ] Build [ ] Waive |  |
| 9 | §3.1.4 | Task lists: reusable sets of operation steps with estimated labour hours, craft, and required materials | Partial | C | - | [ ] Build [ ] Waive |  |
| 10 | §3.1.4 | Task lists associated with an equipment class or specific equipment | Not Met | C | - | [ ] Build [ ] Waive |  |
| 11 | §3.1.4 | Work orders can copy operations from a task list | Partial | C | - | [ ] Build [ ] Waive |  |
| 12 | §3.1.5 | Link materials to equipment BOM | Partial | C | - | [ ] Build [ ] Waive |  |
| 13 | §3.1.5 | Link materials to work order operations | Partial | C | - | [ ] Build [ ] Waive |  |
| 14 | §3.2.1 | Notification types M1 (Malfunction), M2 (Maintenance Request), M3 (Completion Confirmation) | Partial | B | D-15 | [ ] Build [ ] Waive |  |
| 15 | §3.2.1 | M3 autogenerated when a work order is completed | Not Met | B | - | [ ] Build [ ] Waive |  |
| 16 | §3.2.1 | Transition validity enforced (illegal transitions rejected) | Not Met | B | - | [ ] Build [ ] Waive |  |
| 17 | §3.2.2 | Any authenticated user can create a notification | Partial | B | D-15 | [ ] Build [ ] Waive |  |
| 18 | §3.2.2 | Key fields: auto number, Type, Priority, Functional Location / Equipment (mandatory selection), Reported By, Date & Time, Description, Breakdown indicator, Damages/observations | Partial | C | - | [ ] Build [ ] Waive |  |
| 19 | §3.2.2 | Damages/observations field | Not Met | E | - | [ ] Build [ ] Waive |  |
| 20 | §3.2.2 | Multiple notifications aggregated into one work order | Not Met | H | - | [ ] Build [ ] Waive |  |
| 21 | §3.2.3 | System shows the relationship and allows navigation between notification and work order | Partial | C | - | [ ] Build [ ] Waive |  |
| 22 | §3.2.3 | After work order completion, notification status can be set to Completed manually or automatically | Not Met | B | - | [ ] Build [ ] Waive |  |
| 23 | §3.3.1 | Emergency automatically sets highest priority | Not Met | H | - | [ ] Build [ ] Waive |  |
| 24 | §3.3.1 | Calibration work orders with pass/fail tracking | Not Met | H | - | [ ] Build [ ] Waive |  |
| 25 | §3.3.3 | WO Number auto-generated with a configurable prefix | Partial | C | - | [ ] Build [ ] Waive |  |
| 26 | §3.3.3 | Header fields: Type, Priority, Status, Equipment/Functional Location (mandatory), Description, Reported By, Responsible Work Center, Assigned Supervisor, planned & actual start/finish, Breakdown flag, Safety critical flag | Partial | E | - | [ ] Build [ ] Waive |  |
| 27 | §3.3.3 | Each work order must contain at least one operation | Not Met | C | - | [ ] Build [ ] Waive |  |
| 28 | §3.3.3 | Per operation: sequence, description, craft, planned hours, number of technicians, actual hours, status (Pending/In Progress/Completed) | Partial | C | - | [ ] Build [ ] Waive |  |
| 29 | §3.3.3 | Rich-text long-text field for job instructions, safety notes, completion remarks | Not Met | H | - | [ ] Build [ ] Waive |  |
| 30 | §3.3.4 | Material issue entries must deduct from stock if inventory is managed inside the CMMS | Not Met | E | - | [ ] Build [ ] Waive |  |
| 31 | §3.3.4 | Vendor must implement a material reservation concept | Not Met | E | - | [ ] Build [ ] Waive |  |
| 32 | §3.3.5 | Actual labour cost = hours × craft rate (from work center master) | Partial | E | D-16 | [ ] Build [ ] Waive |  |
| 33 | §3.3.5 | Technician identification via login; entries stamped with user and timestamp | Partial | B | - | [ ] Build [ ] Waive |  |
| 34 | §3.3.6 | Additional miscellaneous costs (travel, permits) as line items | Not Met | E | - | [ ] Build [ ] Waive |  |
| 35 | §3.3.7 | WO cannot be set to "In Progress" unless all mandatory safety checklists are acknowledged (sign-off via electronic signature) | Partial | D | - | [ ] Build [ ] Waive |  |
| 36 | §3.3.8 | Any file type may be attached up to 10 MB per file | Partial | H | D-11 | [ ] Build [ ] Waive |  |
| 37 | §3.3.8 | Threaded comments visible in the work order detail view, posted by any participant | Not Met | H | D-12 | [ ] Build [ ] Waive |  |
| 38 | §3.3.8 | Complete audit log recording user, timestamp, action, and old/new value for field modifications | Partial | E | - | [ ] Build [ ] Waive |  |
| 39 | §3.4.1 | Plan fields: Plan Code, Description, Equipment/Functional Location (one or a list), Work Center, Task List template, Priority, associated Notifications | Partial | D | D-10 | [ ] Build [ ] Waive |  |
| 40 | §3.4.1 | Strategy: time-based, meter-based, or a combination, whichever is due first | Partial | D | - | [ ] Build [ ] Waive |  |
| 41 | §3.4.2 | Time-based: interval in days/weeks/months with fixed start date and optional end date | Partial | D | - | [ ] Build [ ] Waive |  |
| 42 | §3.4.2 | Meter-based: meter associated with the equipment, interval value, support for multiple meters per plan | Partial | D | - | [ ] Build [ ] Waive |  |
| 43 | §3.4.2 | Call Horizon: user-defined days/units ahead of due date during which generation occurs | Not Met | D | - | [ ] Build [ ] Waive |  |
| 44 | §3.4.2 | Seasonal/exclusion blackout dates where generation is suppressed or shifted | Not Met | D | - | [ ] Build [ ] Waive |  |
| 45 | §3.4.3 | When due date (factoring call horizon) is reached, create a Work Order populated from the plan's task list | Partial | D | - | [ ] Build [ ] Waive |  |
| 46 | §3.4.3 | Created work order status Draft or Planned, configurable | Not Met | D | - | [ ] Build [ ] Waive |  |
| 47 | §3.4.3 | If a plan has an associated notification, create it and link them | Not Met | D | - | [ ] Build [ ] Waive |  |
| 48 | §3.4.3 | Generation must be idempotent (no duplicate WO if the due date stays inside the horizon) | Partial | D | - | [ ] Build [ ] Waive |  |
| 49 | §3.5.1 | Planned Cost = planned labour hours × craft rate + planned materials × standard cost + planned services + other planned | Partial | E | D-3 | [ ] Build [ ] Waive |  |
| 50 | §3.5.2 | Support cost splitting when a work order covers multiple cost centers (percentage allocation) | Partial | C | - | [ ] Build [ ] Waive |  |
| 51 | §3.5.3 | Costs summarisable by functional location hierarchy (rollup to any level) | Not Met | F | - | [ ] Build [ ] Waive |  |
| 52 | §3.5.3 | Costs summarisable by equipment | Not Met | F | - | [ ] Build [ ] Waive |  |
| 53 | §3.5.3 | Costs summarisable by work order type | Not Met | F | - | [ ] Build [ ] Waive |  |
| 54 | §3.5.3 | Costs summarisable by time period (year, quarter, month) | Partial | F | - | [ ] Build [ ] Waive |  |
| 55 | §3.6 | Work Order History: complete snapshot of the work order at each major status change, stored as immutable records | Not Met | E | - | [ ] Build [ ] Waive |  |
| 56 | §3.6 | Equipment Maintenance History: chronological list of all work orders on an equipment with date, type, cost, downtime | Partial | E | - | [ ] Build [ ] Waive |  |
| 57 | §3.6 | General change log: every create/update/delete on master data and transactions, including IP address and user | Partial | E | - | [ ] Build [ ] Waive |  |
| 58 | §3.7.1 | All reports filterable by date range, location, equipment, and work center | Not Met | F | - | [ ] Build [ ] Waive |  |
| 59 | §3.7.1 | All reports exportable to PDF and Excel (raw data) | Not Met | F | D-9 | [ ] Build [ ] Waive |  |
| 60 | §3.7.1 | Work Order Backlog — count and total estimated hours by status, priority, and work center | Partial | F | - | [ ] Build [ ] Waive |  |
| 61 | §3.7.1 | PM Compliance — (Completed PMs / Scheduled PMs) × 100 for a given period | Partial | F | - | [ ] Build [ ] Waive |  |
| 62 | §3.7.1 | MTTR — average repair duration, per equipment/location | Partial | F | - | [ ] Build [ ] Waive |  |
| 63 | §3.7.1 | Maintenance Cost Summary — actual vs. budget by cost center/location | Partial | F | D-13 | [ ] Build [ ] Waive |  |
| 64 | §3.7.1 | Material Consumption Report — by material, work order, and equipment | Partial | F | - | [ ] Build [ ] Waive |  |
| 65 | §3.7.2 | Backlog Hours by Work Center | Not Met | F | - | [ ] Build [ ] Waive |  |
| 66 | §3.7.2 | Top 10 Highest-Cost Equipment | Not Met | F | - | [ ] Build [ ] Waive |  |
| 67 | §3.7.2 | Notifications Awaiting Conversion | Partial | F | - | [ ] Build [ ] Waive |  |
| 68 | §3.7.2 | Dashboard data is realtime and widgets offer drilldown | Not Met | F | - | [ ] Build [ ] Waive |  |
| 69 | §3.8 | In-app alert: work order assignment to technician/supervisor | Not Met | H | - | [ ] Build [ ] Waive |  |
| 70 | §3.8 | In-app alert: overdue work orders (not completed by due date) | Not Met | H | - | [ ] Build [ ] Waive |  |
| 71 | §3.8 | In-app alert: PM generation failure | Partial | H | - | [ ] Build [ ] Waive |  |
| 72 | §3.8 | In-app alert: new high-priority notification raised | Not Met | H | - | [ ] Build [ ] Waive |  |
| 73 | §3.8 | Email delivery of alerts | Not Met | H | - | [ ] Build [ ] Waive |  |
| 74 | §3.8 | Configuration by role/user to opt in or out of specific alert types | Not Met | H | - | [ ] Build [ ] Waive |  |
| 75 | §3.9 | Responsive web interface that functions on tablets and smartphones without installing software | Not Met | H | D-6 | [ ] Build [ ] Waive |  |
| 76 | §3.10 | API must use OAuth2 authentication | Not Met | G | D-5 | [ ] Build [ ] Waive |  |
| 77 | §3.10 | API must include bulk endpoints for master data | Partial | H | - | [ ] Build [ ] Waive |  |

---

## 6. Phase A gate

Phase A is complete when this block is signed. Until then Phase B does not start.

| Gate condition | State |
|---|---|
| Baseline inventory machine-frozen and re-derivable | ✅ `verify_a1.py` exit 0 |
| All 77 in-scope §3 rows listed with matrix-sourced clause and status | ✅ §5 of this document |
| Every row carries a proposed phase and any gating decision | ✅ §5 |
| D-2 … D-16 posed with options, recommendation and named owner | ✅ §4 |
| Every one of the 77 rows dispositioned `Build` or `Waive` | ⛔ **0 of 77** |
| D-2 … D-16 answered | ⛔ **0 of 15** |
| Signed by the Client | ⛔ unsigned |

**Gate result: NOT PASSED.** Preparation is complete; the gate requires a Client signature that the vendor cannot supply and will not simulate.

### Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Client — SOW owner | | | |
| Client — Maintenance / Finance (D-3, D-16) | | | |
| Client — IT (D-4, D-5, D-13) | | | |
| Client — Operations (D-9, D-14, D-6) | | | |
| Vendor — project lead | | | |

### 6.1 What unblocks on signature

1. `verify_a1.py` gains a sign-off assertion and flips to `PASS` once all 77 dispositions and all 15 decisions are recorded. Until then it reports the outstanding count, so the gate cannot be quietly passed.
2. `docs/SOW_COMPLIANCE.md` is re-issued with a `Waived` status and a decision ID against every waived row, and a new `Build` column carrying the committed phase. No row is deleted.
3. Phases B–I are sized and scheduled from the disposition counts, not from the raw 77.
4. `v1.0.0` is **not** re-tagged. The next tag is `v1.1.0`, cut only when the §6.4 criteria are met or waived.

---

## 7. Dependencies the vendor does not hold

Recorded so that no phase is planned around access that does not exist.

| Dependency | Needed by | Status |
|---|---|---|
| Client signature on §6 | Gate A | Not held |
| Windows Server with IIS + ARR | §4.2 TLS rehearsal, Phase G | Not held |
| Live PostgreSQL target + `PGPASSWORD` | First real backup/restore drill, Phase G | Not held — `backup.bat` hardcodes the connection and has never run against a live instance |
| `k6.exe` | §6.4.3 100-VU and §4.1 200-VU runs | Not held — gitignored, deliberately not in the repository |
| Azure AD tenant + app registration | D-5(a), OAuth2/OIDC | Not held |
| Client legacy data (Excel/paper) | §5.7 importers, §6.4.5 migration accuracy | Not held |
| Dry-run migration window | §6.4.5 | Not scheduled |

None of these is an engineering task. All of them gate a §6.4 criterion.
