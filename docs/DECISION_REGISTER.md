# Phase A — Scope Freeze and Decision Register

| | |
|---|---|
| **Purpose** | Convert SOW §6.4 from prose into a finite, signed, per-clause work list before any further engineering begins. |
| **Baseline** | `v1.0.0` — tag object `386fe3c`, commit `0d941df`. Shipped and immutable. |
| **Source of record** | `docs/SOW_COMPLIANCE.md` (214 clause rows) |
| **Machine check** | `python scripts/verify/verify_a1.py` — re-derives every count in this document from the matrix. |
| **Status** | ✅ **DECIDED.** All 77 rows dispositioned and all 16 decisions answered, under the delegated authority recorded in §6. |
| **Decision authority** | Delegated to the vendor by the SOW owner on 2026-09-26 (see §6). |

---

## 1. Why this document exists

The SOW states its own definition of done in one place: **§6.4 Acceptance Criteria**. Of the six criteria, five are `Not Met` and one is `Partial` in the v1.0.0 matrix.

§6.4.1 reads: *"All functional requirements listed in §3 are implemented and pass UAT scripts."*

Of the 126 §3 clause rows, **48 are Met**, 11 are already out of scope by Client agreement (4 Deferred, 7 Excluded), and 10 more are `Waived` by decision recorded in this register. That leaves **57 that are neither Deferred, Excluded nor Waived** — they are `Partial` or `Not Met`. Those 57 are the entire engineering question. Each one must either be built, or be waived in writing by the Client, before §6.4.1 can honestly be called `Met`.

*Corrected 2026-09-27:* this previously read "38 are Met ... 77 are Partial or Not Met". Ten rows have moved to `Met` since: nine in §3.4 (six from `Partial`, three from `Not Met`), and row 35, whose residual — item-level checklist acknowledgement — the Phase D work closed. `Met` 38 → 48, open set 77 → 57. The previous wording also described the 10 `Waived` rows as part of the open set, which they are not: a waiver is a decision, not a gap.

This document is the instrument for that. Each row carries a disposition and a one-line business reason, and each decision carries an answer and its rationale. The authority under which those were recorded is stated in §6 — it is delegated engineering judgement, **not** a client signature, and this document does not claim to be one.

**A phase without a gate is a wish.** The Phase A gate is in §6. It now checks that every row is dispositioned and reasoned, and that no decision is left dangling — not that a human signed, because the signature requirement was withdrawn.

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

## 3. Decision D-1 — the governing question (answered)

> **For each of the 77 rows in §5: Build, or Waive?**

D-1 is answered: **68 Build, 9 Waive.** Every other decision (D-2 … D-17) narrows the engineering; D-1 fixed its size. The dispositions and the reasoning behind them are in §5.

**Consequences of leaving D-1 open**

- Phases B–I cannot be sized, scheduled or committed to a date.
- The go-live date cannot be stated.
- §6.4.1 remains `Not Met` by arithmetic, regardless of how much is built: 77 rows open means §6.4.1 is `Not Met`.

**Consequences of answering it**

- Every row acquires a disposition and an owner.
- The plan below Phase A becomes a schedule.
- The §6.4 acceptance pack can be assembled, because the number of things it must demonstrate is now known.

---

## 4. Decisions D-2 … D-17

Each decision is posed as a **question** with neutral options, so the reasoning is auditable rather than asserted. The **Decision taken** column records what was chosen; §4.1 records why. D-2, D-3, D-15 and D-16 carry positions supplied directly by the SOW owner; the remainder were decided on engineering judgement under the delegated authority in §6.

> **ID namespace warning.** These `D-n` IDs are Phase A decision IDs and are **not** the same thing as the `D1`–`D8` deferred work items in `docs/SOW_COMPLIANCE.md`. The two sets overlap numerically and mean different things — matrix `D5` is CauseCode wiring, Phase A `D-5` is OAuth2. Matrix items are always cited here as *deferred Dn*.

| ID | Clause | Question | Options | Vendor recommendation | Owner | **Answer** (Client) |
|---|---|---|---|---|---|---|
| **D-2** | §6.4.6 | §6.4.6 requires "Documentation delivered **and training completed**". Decision X7 already removed training from scope. The criterion cannot be satisfied as written. | (a) Amend §6.4.6 to documentation-only, consistent with X7. (b) Reinstate training, reversing X7. | **(a)**. X7 was an explicit Client decision; leaving the contradictory criterion in place creates a permanent unmeetable acceptance criterion. | Client | Amend SOW 6.4.6 to "Documentation delivered". The training limb is removed entirely, consistent with X7. **Applied**: the matrix row is amended with the original wording struck through. |
| **D-3** | §3.5.1 | Planned labour cost is implemented as `plannedHours × numberOfTechnicians × craftRate`. The SOW formula reads `planned labour hours × craft rate`. The SOW does not state whether planned hours are per technician or per operation. **Every planned-cost figure and the §3.7.1 cost summary depend on the answer.** | (a) Planned hours are per technician — current implementation stands. (b) Planned hours are per operation — divide out the technician multiplier. (c) Treat as unspecified and agree a plant convention. | **(c)**, then (a) or (b) as the convention. This is a Finance question, not an engineering one, and the two answers produce materially different planned totals. | Client — Maintenance / Finance | Planned hours are the operation's **total** labour hours, so planned labour cost = planned hours x craft rate, exactly as SOW 3.5.1 states. **Confirmed by the SOW owner 2026-09-26**: remove the `numberOfTechnicians` multiplier from `backend/src/utils/costs.ts:19`. The code change lands with row 49 in Phase E. |
| **D-4** | §4.3 | §4.3 requires **RPO < 1 hour**. The delivered backup is a daily `pg_dump`, giving an RPO of up to 24 hours — three times the objective. | (a) Implement WAL archiving and differential backups to meet 1 h. Requires PostgreSQL configuration and a second backup target. (b) Accept a 24 h RPO in writing as a deviation, with the business impact stated. | **(a)** if the plant cannot absorb a day of lost work; **(b)** is acceptable only if someone with authority signs the risk. A daily schedule cannot be described as meeting §4.3. | Client IT / Operations | Build WAL archiving plus base/differential backup to meet RPO < 1 h. **Confirmed by the SOW owner 2026-09-26**: write the WAL archiving config and update the backup/restore scripts. The proof-of-working is recorded as a **pending rehearsal** against a live PostgreSQL host and a second backup target - a pending verification, NOT a scope reduction. |
| **D-5** | §5.5, §3.10 | §5.5 requires OAuth2 / OpenID Connect with Azure AD or on-premises AD. §3.10 requires the API to use OAuth2. v1.0.0 ships first-party JWT login, with no OAuth2 flow and no directory integration. | (a) An Azure AD tenant and app registration are available — implement OAuth2/OIDC. (b) No tenant available — accept first-party JWT as a written §5.5 deviation. | Depends entirely on **(a)** being available. If no tenant exists, (b) is the only route, and it should be recorded as a deviation rather than left as a silent `Not Met`. | Client IT | Retain first-party JWT login. OAuth2/OIDC is **waived as a formal, documented SOW 5.5 deviation**. **Confirmed by the SOW owner 2026-09-26**: internal use only, no Azure AD. Does not reopen. |
| **D-6** | §3.9 | §3.9 requires a *"Responsive web interface that functions on tablets and smartphones"*. X2–X4 removed mobile **camera**, **offline** and **signatures**; they did not remove the responsive shell. This row is `Not Met` and carries no exclusion. | (a) Tablets and phones are in scope — build a responsive layout. (b) Desktop/laptop only — waive the row and record that field devices are out of scope. | Depends on how the plant actually works. If technicians use tablets in the field, (a). The current fixed-width sidebar and multi-column tables are not usable at phone width. | Client — Operations | Build a responsive web layout: Tailwind breakpoints, mobile navigation drawer, table stacking. **No PWA, offline, camera or signature** - X2 to X4 stand. |
| **D-7** | §4.2 | §4.2 requires row-level data access control *"if multisite/cost-centre separation is required (optional, TBD)"*. The SOW itself marks this optional and undetermined. | (a) Separation is required — implement per-user / per-cost-centre scoping on list routes. (b) Not required — close the row. | **(b)** unless the Client operates multiple sites with separate cost-centre visibility. The SOW wrote "optional, TBD"; leaving it unanswered leaves the row permanently open. | Client | Not required. Row closed as out of scope; no code. |
| **D-8** | §4.5 | §4.5 states the data model *"should align"* with ISO 14224. No alignment assessment exists. | (a) Documentation-only field mapping is sufficient. (b) A structural alignment is required. | **(a)**. "Should align" is not a functional requirement; a documented mapping table satisfies the intent and is a Phase I deliverable. | Client — Engineering | Documentation-only field mapping is sufficient. Deliver the mapping table; no structural migration. |
| **D-9** | §3.7.1 | §3.7.1 requires all reports exportable to **PDF and Excel**. The delivered export is **CSV** only, for two entities. | (a) PDF and Excel are required — build both. (b) CSV satisfies the operational need — waive the PDF/Excel limb. | **(a)** unless the plant's reporting process genuinely accepts CSV. The SOW names PDF and Excel; CSV is not among them. | Client — Operations / Finance | Build Excel (.xlsx) export. **The PDF limb is waived**. |
| **D-10** | §3.4.1 | §3.4.1 requires a maintenance plan to target Equipment / Functional Location *"**or a list**"*. The schema has a single nullable `equipmentId`. | (a) A plan may cover multiple equipment — add a join table. (b) One plan per asset is sufficient. | **(a)** if the plant maintains fleet-wide plans (e.g. "inspect all P-100 class units monthly"); **(b)** if plans are always asset-specific. This is a genuine modelling fork, not a UI detail. | Client — Maintenance Planning | Build a plan-target join table so one plan can cover many equipment. |
| **D-11** | §3.3.8 | §3.3.8 requires *"**Any** file type"* up to 10 MB. The delivered allowlist accepts 7 MIME types (jpeg, png, webp, pdf, txt, xlsx, xls). | (a) Any file type — remove the allowlist, keep the 10 MB cap. (b) The allowlist is acceptable. | **(a)** if engineers attach CAD, DWG or proprietary formats; **(b)** is the safer default and the 10 MB cap is met either way. Note the security trade-off: an open upload path is an attack surface. | Client — Engineering / IT Security | Build a widened document-type allowlist. Keep the 10 MB cap. Continue to block executables and scripts. **The "any file type" limb is waived.** |
| **D-12** | §3.3.8 | §3.3.8 requires **threaded** comments. The delivered `Comment` model has no `parentId`; comments are a flat list. | (a) Threading is required. (b) A flat comment list is acceptable. | **(b)** unless a specific workflow needs reply chains. Low cost either way — a `parentId` column and one query change. | Client — Maintenance | Waive threading. Keep a flat comment list. |
| **D-13** | §5.2, §3.7.1 | §5.2 requires an embedded reporting engine (JasperReports, DevExpress) **or SQL views** for external BI. Neither exists; reports are hand-written TypeScript. Separately, §3.7.1 requires actual-vs-**budget**, and there is no budget data anywhere in the schema. | (a) SQL views for the Client's BI tool. (b) An embedded engine. And for budget: (i) budget figures are in scope — add budget master data. (ii) actual-vs-planned satisfies the need — reword the criterion. | **SQL views (a)** — cheaper, and it unblocks the deferred D2 ad-hoc reporting item. For budget, **(ii)** is likely; actual-vs-planned variance is already delivered per cost centre and no budget source exists in the SOW. | Client — Finance / IT | Build **SQL views** for the Client's BI tool (SOW 5.2's stated alternative). Reword the cost summary to **actual vs planned**; the **budget limb is waived**. |
| **D-14** | §4.6, §1.3 | §4.6 *"Planned maintenance windows agreed in advance"* is Deferred as an operational process. §1.3's three-month post-go-live warranty is Deferred as an operational obligation. Both are `Deferred`, not failed — but nobody owns them. | Name the process and the accountable owner for each, effective at go-live. | Accept as an operational obligation, but record the owner. A deferred obligation with no owner reappears as a defect at month two. | Client Operations | Record both as **operational obligations owned by Client Operations**, effective at go-live. No code. |
| **D-15** | §3.2.2 vs §2.2 | §3.2.2 says *"**Any** authenticated user can create a notification"*. §2.2 defines View-Only / Auditor as *"**read** access to all master data, work orders, history, reports"*. These two SOW clauses contradict each other. v1.0.0 resolves it by denying View-Only (HTTP 403). | (a) View-Only may raise notifications — §2.2 "read-only" is narrowed. (b) View-Only may not — §3.2.2 "any authenticated user" is narrowed. | **(b)**, and record it as a SOW interpretation. A role named "View-Only" that can create records is self-contradictory, and the same reasoning supports keeping §2.2 intact elsewhere. | Client — document owner | **SOW 2.2 wins.** View-Only / Auditor stays read-only; 3.2.2's "any authenticated user" narrows to **Requester and above**. The existing 403 is already correct - **no code change**; the matrix row moves to Met. |
| **D-16** | §3.3.5 vs §3.5.1 | §3.3.5 says actual labour cost = hours × craft rate *"**from work center master**"*. §3.5.1 says the same figure = hours × **craft rate**. The implementation uses `Craft.hourlyRate` and never reads `WorkCenter.costRatePerHour`, which exists in the schema precisely for this. The SOW names two different rate sources. | (a) `Craft.hourlyRate` is authoritative. (b) `WorkCenter.costRatePerHour` is authoritative. (c) `Craft.hourlyRate` by default, falling back to the work-centre rate where no craft rate is set. | **(c)**. It honours both SOW clauses, needs no new master data, and makes the currently-dead `costRatePerHour` column meaningful. | Client — Maintenance / Finance | **Craft.hourlyRate is the single authoritative labour rate.** Amend 3.3.5's "from work center master" to "from craft master". `WorkCenter.costRatePerHour` is a work-centre overhead concept, is not read by cost calculation, and is not a labour rate. |
| **D-17** | §5.3 / deferred D6 | The SOW's monetary and quantity columns ship as binary floating point. Deferred item D6 parks the `Float` -> `Decimal` migration in v1.1, but Phase F builds cost rollups and cost reports. Should the migration happen before or after that reporting work? | (a) Migrate to `Decimal` in Phase E, before the rollups exist. (b) Leave in v1.1 and build the rollups on `Float`. | **(a)**. Rounding differences baked into new cost reporting are expensive to unpick later, and the totals are otherwise unauditable. | Client - Finance | Build the **Float -> Decimal migration** for monetary columns in Phase E, promoting deferred item D6 out of v1.1. |

**Decisions that gated worksheet rows:** 13 rows were dispositioned on a decision rather than on matrix evidence alone — rows 7, 8, 14, 17, 32, 36, 37, 39, 49, 59, 63, 75, 76. All 13 are resolved. Row 75 was subsequently waived outright and row 24, which was not in this list, was subsequently built; both changes came from the SOW owner's answers in §6.4. The remaining 64 were dispositioned directly on the matrix evidence.

---

### 4.1 Decision rationale

One line per decision, so the reasoning is auditable without re-reading the options.

| ID | Why this answer |
|---|---|
| **D-2** | X7 already removed training from scope, so the criterion was unmeetable as written; deleting the limb resolves a standing contradiction instead of leaving a permanent failure. |
| **D-3** | Matches the SOW formula literally and the common CMMS convention in which the operation carries total planned labour, and removes a crew multiplier the SOW never mentions. **Confirmed by the SOW owner. IMPLEMENTED in Phase E**, commit `ca9aa63`: the multiplier is gone from `computeWorkOrderCosts`, and the differential test proves the planned total changed by exactly the multiplier and by nothing else. |
| **D-4** | A daily pg_dump against a 1-hour RPO objective is a 24x miss, and a plant cannot absorb a day of lost work orders. **Cannot be verified until a live PostgreSQL host and a second backup target are provided.** |
| **D-5** | Internal use only, so no identity provider is needed. An integration that could be neither completed nor verified is worse than a recorded deviation. **Confirmed by the SOW owner: does not reopen.** |
| **D-6** | SOW 1.3 and 3.9 both expect tablet and browser use, and the fixed sidebar plus multi-column tables are unusable at phone width. |
| **D-7** | The SOW itself marks row-level data access control "optional, TBD" and no multisite cost-centre separation requirement has been stated. |
| **D-8** | SOW 4.5 says the model "should align", which is not a functional requirement; a documented mapping satisfies the intent. |
| **D-9** | Excel and CSV satisfy the operational reporting need; no plant workflow requiring print-ready PDF has been stated. |
| **D-10** | Fleet-wide plans such as "inspect every P-100 monthly" are standard practice and the single nullable equipmentId cannot express them. |
| **D-11** | Engineers must attach CAD and proprietary drawings, but an unbounded upload path is an attack surface; the residual "any file type" requirement is not worth that exposure. |
| **D-12** | A flat list meets the collaboration need; threading adds a parent relation and a recursive query for negligible operational gain. |
| **D-13** | SQL views are far cheaper than an embedded engine and satisfy 5.2 as written; no budget data source is named anywhere in the SOW, so a budget figure would be invented scope. |
| **D-14** | They are Deferred rather than failed, but an unowned deferred obligation resurfaces as a defect at month two. |
| **D-15** | The role hierarchy makes Viewer the read-only tier, so "any authenticated user" is best read as "any holder of the Requester capability". 3.3.2's Close role floor was remediated the same way. |
| **D-16** | One authoritative rate removes a silent ambiguity. Craft rate is the correct granularity for labour cost, and no requirement consumes a work-centre rate. |
| **D-17** | Phase F builds 3.5.3 cost rollups and 3.7.1 cost reports; producing new cost reporting on binary floating point bakes rounding differences into new work and leaves the totals unauditable. Migrating before the rollups exist is cheaper than after. **IMPLEMENTED in Phase E**, E.13: the seven monetary columns are `DECIMAL(12,2)`, still served to the API as JSON numbers, and deferred D6 is promoted out of v1.1. |


## 5. The 77-row disposition worksheet

Generated from `docs/SOW_COMPLIANCE.md` by machine; every row's clause text and status are transcribed from the matrix, not retyped. `scripts/verify/verify_a1.py` re-parses this table and fails if it drifts from the matrix.

**Phase** — the sequencing each row falls under. A `Waive` drops out of its phase entirely, so the Build counts below are the real remaining scope.

| Phase | Objective | Build | Waive |
|---|---|---|---|
| **B** | Trust and authorisation - close the 6.4.4 Major defects | 6 | 0 |
| **C** | Workflow surfaces and master-data write paths | 17 | 1 |
| **D** | PM engine correctness (3.4) | 10 | 1 |
| **E** | Data integrity, audit, history and costing basis | 10 | 1 |
| **F** | Reporting, BI layer and the UAT pack (6.4.1, 6.4.2) | 14 | 1 |
| **G** | Non-functional and operational readiness (6.4.3) | 0 | 1 |
| **H** | Remaining §3 surface, including calibration and alerts | 10 | 5 |
| | **Total** | **67** | **10** |

**Phase G has no §3 build rows and that is not an oversight.** Its only §3 clause was OAuth2
(row 76), waived under D-5. The non-functional work that §6.4.3 actually demands — the 100-VU
performance run, the 200-VU §4.1 test, and the backup/restore rehearsal under D-4 — lives in
§4 and §6.4, not in the §3 register, so it does not appear in this worksheet. It is tracked in
§7 and in the tracker, and **two of those three cannot be run at all** until the dependencies
in §7 are provided.

Evidence for each row — the exact code path, endpoint or absence that justifies its status — is in `docs/SOW_COMPLIANCE.md` at the cited clause. This table does not restate it.

| # | Clause | Requirement | Status | Phase | Decision | Disposition | Decision ID / reason |
|---|---|---|---|---|---|---|---|
| 1 | §3.1.1 | Drag-and-drop restructuring of the hierarchy | Waived | C | - | **Waive** | Re-parenting is delivered; drag-and-drop is an input affordance with no operational value and a fixed tree is cheaper to maintain. |
| 2 | §3.1.1 | Display open work orders and notification count for each node | Partial | C | - | **Build** | A planner cannot see load per node without it; small read-model change. |
| 3 | §3.1.2 | Each equipment record assigned to exactly one functional location (lowest level) | Partial | C | - | **Build** | The single-parent invariant is what makes the hierarchy rollups in rows 51-53 correct. |
| 4 | §3.1.2 | BOM: associate spare parts from the material catalog with an equipment | Partial | C | - | **Build** | Knowing which spares fit an asset is core to maintenance planning. |
| 5 | §3.1.2 | Documents: attach manuals, datasheets, certificates to equipment | Partial | C | - | **Build** | Manuals and certificates are the first thing a technician needs on an asset. |
| 6 | §3.1.3 | Assign crafts to each work center, each with its own hourly rate | Partial | C | D-16 | **Build** | [D-16] Scheduling and costing both key off the craft-to-work-centre link. |
| 7 | §3.1.3 | Work centers and crafts used for scheduling and cost estimation | Partial | C | D-16 | **Build** | [D-16] Crafts must participate in scheduling and cost estimation, not sit unused in a lookup table. |
| 8 | §3.1.4 | Cause codes as root-cause categories | Partial | H | deferred D5 | **Build** | [deferred D5] Cause and failure capture on a work order is what makes MTTR-by-cause in row 62 possible. Matrix deferred item D5. |
| 9 | §3.1.4 | Task lists: reusable sets of operation steps with estimated labour hours, craft, and required materials | Partial | C | - | **Build** | Task lists are the template the PM generator in row 45 builds work orders from. |
| 10 | §3.1.4 | Task lists associated with an equipment class or specific equipment | Not Met | C | - | **Build** | Maintenance cannot be templated by asset class without it. |
| 11 | §3.1.4 | Work orders can copy operations from a task list | Partial | C | - | **Build** | Copying operations is the step that turns a template into a work order. |
| 12 | §3.1.5 | Link materials to equipment BOM | Partial | C | - | **Build** | Same equipment-BOM link as row 4; the SOW splits one capability across two clauses. |
| 13 | §3.1.5 | Link materials to work order operations | Partial | C | - | **Build** | Materials must be issued to a specific operation for cost and consumption reporting to be right. |
| 14 | §3.2.1 | Notification types M1 (Malfunction), M2 (Maintenance Request), M3 (Completion Confirmation) | Partial | B | - | **Build** | M1/M2/M3 are accepted values but M3 is never produced, so the type set is incomplete in practice. See row 15. |
| 15 | §3.2.1 | M3 autogenerated when a work order is completed | Not Met | B | - | **Build** | Closing a work order must confirm the originating notification. Named an open 6.4 item. |
| 16 | §3.2.1 | Transition validity enforced (illegal transitions rejected) | Not Met | B | - | **Build** | Status is taken straight from the request body with no transition map, so the notification lifecycle is unenforced. |
| 17 | §3.2.2 | Any authenticated user can create a notification | Partial | B | D-15 | **Build** | [D-15] D-15 confirms the existing 403 is correct. No code change; the matrix row moves to Met. |
| 18 | §3.2.2 | Key fields: auto number, Type, Priority, Functional Location / Equipment (mandatory selection), Reported By, Date & Time, Description, Breakdown indicator, Damages/observations | Partial | C | - | **Build** | Equipment is optional today, so the mandatory location/equipment pair the SOW requires is not enforced. |
| 19 | 3.2.2 | Damages/observations field | Met | E | - | **Build** | Resolved. Added `Notification.damagesObservations` (migration 20260927130000_notification_damages_observations) as a field separate from `description`, nullable because a notification is raised before anyone inspects the asset. |
| 20 | §3.2.2 | Multiple notifications aggregated into one work order | Not Met | H | - | **Build** | One breakdown commonly raises several notifications that belong to a single job. |
| 21 | §3.2.3 | System shows the relationship and allows navigation between notification and work order | Partial | C | - | **Build** | Notification-to-work-order traceability is the core audit path. |
| 22 | §3.2.3 | After work order completion, notification status can be set to Completed manually or automatically | Not Met | B | - | **Build** | A converted notification never reaches Completed, so the conversion queue never clears. |
| 23 | §3.3.1 | Emergency automatically sets highest priority | Not Met | H | - | **Build** | Emergency work must outrank planned work without relying on the operator to remember. |
| 24 | §3.3.1 | Calibration work orders with pass/fail tracking | Not Met | H | - | **Build** | SOW owner confirmed 2026-09-26 that the plant DOES run a calibration programme, so the clause applies. SCOPE GATE: the deliverable is larger than a pass/fail label. Do NOT build the label-only version. Depth (pass/fail vs full as-found/as-left plus reference standard plus due-date tracking) must be confirmed with the SOW owner before Phase H work starts. |
| 25 | §3.3.3 | WO Number auto-generated with a configurable prefix | Partial | C | - | **Build** | Trivial change, and auditors expect a configurable, recognisable work-order prefix. |
| 26 | §3.3.3 | Header fields: Type, Priority, Status, Equipment/Functional Location (mandatory), Description, Reported By, Responsible Work Center, Assigned Supervisor, planned & actual start/finish, Breakdown flag, Safety critical flag | Partial | E | - | **Build** | The register previously said "Assigned Supervisor and Safety critical are absent from the work-order header". That was WRONG and was checked before building anything: supervisorUserId and safetyCriticalFlag both already exist. The genuinely missing field was Reported By, which is now added as WorkOrder.reportedByUserId (migration 20260927120000_work_order_reported_by) and carries the notification reporter across a conversion, so it is not createdBy. |
| 27 | §3.3.3 | Each work order must contain at least one operation | Not Met | C | - | **Build** | An operation-less work order has no cost, no labour and no plan lineage. |
| 28 | §3.3.3 | Per operation: sequence, description, craft, planned hours, number of technicians, actual hours, status (Pending/In Progress/Completed) | Partial | C | - | **Build** | The operation row is the labour record; its fields drive costing and progress. |
| 29 | §3.3.3 | Rich-text long-text field for job instructions, safety notes, completion remarks | Not Met | H | - | **Build** | Safety notes and job instructions need more than a single-line text field. |
| 30 | §3.3.4 | Material issue entries must deduct from stock if inventory is managed inside the CMMS | Waived | E | - | **Waive** | SOW owner confirmed 2026-09-26: the warehouse team controls inventory, so the SOW's "if inventory is managed inside the CMMS" condition is NOT met. The CMMS records consumption for cost and traceability but does not own the on-hand count. Material.currentStock stays a manually maintained reference field (Materials page or CSV import), informational only, NOT authoritative, and is not auto-decremented. Consumption on material issue is still recorded - quantity, unit cost, rolled into work order cost and the material consumption report. |
| 31 | 3.3.4 | Vendor must implement a material reservation concept | Met | E | - | **Build** | Resolved. The register's claim that reservedQuantity "is never written" was inaccurate — it was written on create and update. The real gap was that it had no effect. Added derived availability (reserved/available) and a 409 guard refusing over-reservation, with release on work-order close or cancel. |
| 32 | 3.3.5 | Actual labour cost = hours x craft rate (from work center master) | Met | E | D-16 | **Build** | Closed on a wording correction, not a code change. D-16 makes Craft.hourlyRate authoritative, so the clause's "(from work center master)" parenthetical is superseded. Actual labour is hoursWorked x Craft.hourlyRate (costRules.ts:90-92); WorkCenter.costRatePerHour remains master data but is read by no cost path. |
| 33 | §3.3.5 | Technician identification via login; entries stamped with user and timestamp | Partial | B | - | **Build** | The labour route trusts a client-supplied userId, so labour cost can be attributed to the wrong technician. Named an open 6.4 item. |
| 34 | §3.3.6 | Additional miscellaneous costs (travel, permits) as line items | Not Met | E | - | **Build** | Travel and permit costs are real and currently have nowhere to be recorded. |
| 35 | §3.3.7 | WO cannot be set to "In Progress" unless all mandatory safety checklists are acknowledged (sign-off via electronic signature) | Met | D | - | **Build** | The safety gate enforced checklist status, not item answers; making `response` nullable and dropping the `'NA'` pre-fill closed it. Electronic signature stays excluded per X4. **[Closed in Phase D — `9b2e9bd`, `369ff13`, `7b3a17a`. The gate now requires `status = 'Completed'` *and* zero unanswered items, and clearing an answer re-arms the sign-off. The X4 exclusion is unaffected and is carried by its own matrix row.]** |
| 36 | §3.3.8 | Any file type may be attached up to 10 MB per file | Partial | H | D-11 | **Build** | [D-11] Widened document allowlist under D-11; the 10 MB cap is already met and executables stay blocked. |
| 37 | §3.3.8 | Threaded comments visible in the work order detail view, posted by any participant | Waived | H | D-12 | **Waive** | [D-12] A flat comment list meets the collaboration need; threading adds a parent relation and recursive query for negligible gain. |
| 38 | §3.3.8 | Complete audit log recording user, timestamp, action, and old/new value for field modifications | Partial | E | - | **Build** | Old and new values are captured at only a minority of write sites, so the audit log cannot support an investigation. |
| 39 | §3.4.1 | Plan fields: Plan Code, Description, Equipment/Functional Location (one or a list), Work Center, Task List template, Priority, associated Notifications | Partial | D | D-10 | **Build** | [D-10] A plan cannot target the equipment class, or the list of assets, that the SOW describes. See D-10. |
| 40 | §3.4.1 | Strategy: time-based, meter-based, or a combination, whichever is due first | Partial | D | - | **Build** | Strategy selection is the switch that makes the PM engine usable at all. |
| 41 | §3.4.2 | Time-based: interval in days/weeks/months with fixed start date and optional end date | Partial | D | - | **Build** | Time-based scheduling is the base case for most plant assets. |
| 42 | §3.4.2 | Meter-based: meter associated with the equipment, interval value, support for multiple meters per plan | Partial | D | - | **Build** | Meter-based scheduling is required for usage-driven and rotating equipment. |
| 43 | §3.4.2 | Call Horizon: user-defined days/units ahead of due date during which generation occurs | Not Met | D | - | **Build** | Without a call horizon every due plan generates at once and floods the backlog. |
| 44 | §3.4.2 | Seasonal/exclusion blackout dates where generation is suppressed or shifted | Waived | D | - | **Waive** | No shutdown calendar has been supplied, and PM-suppression logic risks silently dropping planned maintenance. |
| 45 | §3.4.3 | When due date (factoring call horizon) is reached, create a Work Order populated from the plan's task list | Partial | D | - | **Build** | Generating the work order from the plan is the core preventive-maintenance function. |
| 46 | §3.4.3 | Created work order status Draft or Planned, configurable | Not Met | D | - | **Build** | Draft versus Planned must be the planner's choice; trivial to expose. |
| 47 | §3.4.3 | If a plan has an associated notification, create it and link them | Not Met | D | - | **Build** | A plan that references a notification must create and link it. |
| 48 | §3.4.3 | Generation must be idempotent (no duplicate WO if the due date stays inside the horizon) | Partial | D | - | **Build** | Duplicate work orders from a repeated generation window are an operational failure, not a cosmetic one. |
| 49 | 3.5.1 | Planned Cost = planned labour hours x craft rate + planned materials x standard cost + planned services + other planned | Met | E | D-3 | **Build — DONE, Phase E** | [D-3] CONFIRMED by the SOW owner 2026-09-26: planned hours are the operation's TOTAL labour, not per-technician. The `numberOfTechnicians` multiplier is **removed**; `computeWorkOrderCosts` in `backend/src/utils/costRules.ts` computes `plannedHours x craftRate`. The `+ other planned` term gained its source in the same phase via the row-34 category discriminator, so every term of the formula is now separately sourced. Commits `ca9aa63` and the row-34 commit. Differential test proves the planned total moved by exactly the removed multiplier and nothing else. |
| 50 | §3.5.2 | Support cost splitting when a work order covers multiple cost centers (percentage allocation) | Partial | C | - | **Build** | One work order legitimately serves several cost centres and the percentage split is named in the SOW. |
| 51 | §3.5.3 | Costs summarisable by functional location hierarchy (rollup to any level) | Not Met | F | - | **Build** | Cost rollup by hierarchy is what makes location-level spend visible. |
| 52 | §3.5.3 | Costs summarisable by equipment | Not Met | F | - | **Build** | Cost by equipment is the asset manager's view and shares the rollup engine. |
| 53 | §3.5.3 | Costs summarisable by work order type | Not Met | F | - | **Build** | Cost by work-order type separates planned from corrective spend; same engine. |
| 54 | §3.5.3 | Costs summarisable by time period (year, quarter, month) | Partial | F | - | **Build** | Period rollup is the third axis of the same rollup engine. |
| 55 | §3.6 | Work Order History: complete snapshot of the work order at each major status change, stored as immutable records | Met | E | - | **Build — DONE, Phase E** | Resolved in E.11. `WorkOrderSnapshot` (migration `20260928151746_work_order_snapshot`) is written inside the status-transition transaction (`backend/src/routes/workOrders.ts:801-813`), served via `GET /api/work-orders/:id/history`, and has no update or delete surface — append-only is what "stored as immutable records" means. |
| 56 | §3.6 | Equipment Maintenance History: chronological list of all work orders on an equipment with date, type, cost, downtime | Met | E | - | **Build — DONE, Phase E** | Resolved in E.11. `GET /api/equipment/:id/history` returns the full chronological set (paginated, excluding soft-deleted work orders) with date, type, cost, planned cost and downtime hours derived exactly as the downtime report does. |
| 57 | §3.6 | General change log: every create/update/delete on master data and transactions, including IP address and user | Partial | E | - | **Build** | The change log omits IP address, which the SOW names explicitly and audits need. |
| 58 | §3.7.1 | All reports filterable by date range, location, equipment, and work center | Not Met | F | - | **Build** | A report whose filters do not work cannot answer the question it exists to answer. |
| 59 | §3.7.1 | All reports exportable to PDF and Excel (raw data) | Not Met | F | D-9 | **Build** | [D-9] Excel export is the operational need; the PDF limb is waived under D-9. |
| 60 | §3.7.1 | Work Order Backlog — count and total estimated hours by status, priority, and work center | Partial | F | - | **Build** | Backlog by status, priority and work centre is the planner's primary screen. |
| 61 | §3.7.1 | PM Compliance — (Completed PMs / Scheduled PMs) × 100 for a given period | Partial | F | - | **Build** | PM compliance is a named KPI and a contractual reporting measure. |
| 62 | §3.7.1 | MTTR — average repair duration, per equipment/location | Partial | F | - | **Build** | MTTR depends on the cause and failure data delivered by row 8. |
| 63 | §3.7.1 | Maintenance Cost Summary — actual vs. budget by cost center/location | Partial | F | D-13 | **Build** | [D-13] Actual-versus-planned variance is delivered and SQL-viewable; the budget limb is waived under D-13 because no budget source exists in the SOW. |
| 64 | §3.7.1 | Material Consumption Report — by material, work order, and equipment | Partial | F | - | **Build** | Material consumption is a named report and supports the reservation work in row 31. |
| 65 | §3.7.2 | Backlog Hours by Work Center | Not Met | F | - | **Build** | Backlog hours by work centre is a trivial extension of row 60. |
| 66 | §3.7.2 | Top 10 Highest-Cost Equipment | Not Met | F | - | **Build** | Top-cost equipment is a trivial extension of the cost rollup. |
| 67 | §3.7.2 | Notifications Awaiting Conversion | Partial | F | - | **Build** | The conversion queue is how a planner finds notifications nobody has actioned. |
| 68 | §3.7.2 | Dashboard data is realtime and widgets offer drilldown | Waived | F | - | **Waive** | Realtime push updates and per-widget drilldown are dashboard-product scope; the underlying reports are delivered in rows 60-67. |
| 69 | §3.8 | In-app alert: work order assignment to technician/supervisor | Not Met | H | - | **Build** | Without an assignment alert a technician has no way to learn a job is theirs. |
| 70 | §3.8 | In-app alert: overdue work orders (not completed by due date) | Not Met | H | - | **Build** | Overdue work is the single most important exception a maintenance organisation tracks. |
| 71 | §3.8 | In-app alert: PM generation failure | Partial | H | - | **Build** | A PM generation failure is silent today, so planned maintenance quietly stops without anyone noticing. |
| 72 | §3.8 | In-app alert: new high-priority notification raised | Not Met | H | - | **Build** | High-priority notifications are the ones that must reach a human immediately. |
| 73 | §3.8 | Email delivery of alerts | Waived | H | - | **Waive** | In-app alerts cover the operational need; email delivery needs a client mail server that is not held and adds an unconfigured failure mode. |
| 74 | §3.8 | Configuration by role/user to opt in or out of specific alert types | Waived | H | - | **Waive** | The plant wants alerts on, not selectively suppressed; a per-role opt-in matrix adds configuration surface with no stated value. |
| 75 | §3.9 | Responsive web interface that functions on tablets and smartphones without installing software | Waived | H | D-6 | **Waive** | SOW owner confirmed 2026-09-26: no tablet or phone use in the field. The desktop layout stands as is. D-6's buildable subset (responsive layout) is therefore not required, and the related PWA/offline/camera/signature items stay waived. |
| 76 | §3.10 | API must use OAuth2 authentication | Waived | G | D-5 | **Waive** | [D-5] No Azure AD tenant or on-prem AD is available. Retained JWT login is recorded as a formal SOW 5.5 deviation under D-5. |
| 77 | §3.10 | API must include bulk endpoints for master data | Waived | H | - | **Waive** | Redundant with the SOW 5.7 CSV importers, which already cover the plant's actual master-data volumes. |

---

## 6. Phase A gate

Phase A is complete when every row carries a disposition with a reason, every decision
carries an answer, and the machine check agrees. That is the gate as it now stands.

| Gate condition | State |
|---|---|
| Baseline inventory machine-frozen and re-derivable | ✅ `verify_a1.py` exit 0 |
| All 77 in-scope §3 rows listed with matrix-sourced clause and status | ✅ §5 |
| Every row carries a proposed phase and any gating decision | ✅ §5 |
| D-2 … D-17 posed with options, an answer and a rationale | ✅ §4, §4.1 |
| **Every one of the 77 rows dispositioned `Build` or `Waive`** | ✅ **77 of 77** |
| **Every waive carries a one-line business reason** | ✅ **10 of 10** |
| **Every decision answered** | ✅ **16 of 16** |
| **Rationale recorded for every decision** | ✅ **16 of 16** |

**Gate result: PASSED**, subject to one gate that was withdrawn.

### 6.1 Authority and provenance

**The signature requirement was withdrawn by the SOW owner on 2026-09-26.** The 77
dispositions and the 16 decisions in this document were decided by the vendor under
delegated authority, on engineering judgement, applying the stated principles: build what
closes a go-live blocker, fills a genuine functional gap in the maintenance workflow, or is
small and clearly useful; waive what is nice-to-have, redundant with existing capability, or
costly relative to the value it delivers.

Stated plainly, because a reader deserves to know what this document is:

- This is **not** a client-signed scope freeze, and it is not presented as one.
- It is **not** an SOW amendment. Amending the SOW is the SOW owner's act. D-2 was applied to
  the compliance matrix as a *record* of the owner's instruction, with the original wording
  struck through so the change is auditable.
- Every waive is a **proposed** scope reduction. All six Phase A flags were answered by the
  SOW owner on 2026-09-26 (§6.4); three of those answers changed a disposition, and one
  (row 24) attached a scope gate that must be closed before Phase H.
- If the SOW owner disagrees with any disposition, the fix is to change that row; the
  machine check re-derives the counts, so the register cannot drift out of step with the matrix.

### 6.2 What the gate no longer checks

The previous gate required a Client signature. Withdrawing it removes the only control that
was **not** vendor-controlled. What replaces it is weaker and should be named as such: the
gate now proves the register is *complete, internally consistent and traceable to the matrix*.
It cannot prove the dispositions are *correct*. That is a judgement, and judgement is what was
delegated.

### 6.3 What unblocks next

1. `verify_a1_dispositions.py` is the live gate: it fails if any row is undispositioned,
   any waive lacks a reason, any decision is unanswered, any decision is unreferenced, or the
   register drifts from the matrix.
2. `docs/SOW_COMPLIANCE.md` is re-issued per row as Phases B–H land, moving each built row to
   `Met` with evidence and each waived row to `Waived` with its decision ID. No row is deleted.
3. Phases B–H are sized from the Build counts, not from the raw 77.
4. `v1.0.0` is **not** re-tagged. The next tag is `v1.1.0`, cut only when the §6.4 criteria
   are met or waived.

### 6.4 Flagged items - answered 2026-09-26

The SOW owner answered all six flags on 2026-09-26. Each answer is recorded against
its decision and worksheet row. They are listed here so the reasoning behind each
answer stays auditable, not because any of them is still open.

**Row 24 - calibration work orders - `Build` (was provisional `Waive`).** The plant
**does** run a calibration programme, so the clause applies and the waive is
withdrawn. The scope is **larger than the register's pass/fail label**, so the row
carries a **scope gate**: before Phase H work starts, the SOW owner must be asked
for the required depth - pass/fail only, or full as-found/as-left plus reference
standard plus due-date tracking. **The label-only version must not be built.** The
clause wording itself ("with pass/fail tracking") is narrower than a real
calibration programme, so this is recorded as a scope clarification the owner must
close, not a decision the vendor may make.

**Row 30 - stock deduction on material issue - `Waive` (was `Build`).** The
warehouse team controls inventory, so the SOW's own conditional - "if inventory is
managed inside the CMMS" - is **not** met. `Material.currentStock` remains a
manually maintained reference field, updated via the Materials page or CSV import,
**informational only and not authoritative**, and is not auto-decremented.
Consumption on material issue is still recorded - quantity and unit cost, rolled
into work order cost and the material consumption report - so costing and
traceability are unaffected. This reverses the Phase A judgement, which built the
row because the material routes already maintain `currentStock`; maintaining the
field is not the same as the CMMS owning the count, and the owner has now drawn
that line explicitly.

**Row 75 - responsive layout - `Waive` (was `Build`).** No tablet or phone use in
the field, so the desktop layout stands. This retires the single largest
discretionary item identified in Phase A. D-6's buildable subset is therefore not
required, and the related PWA, offline, camera and signature items stay waived.

**D-3 - planned cost - confirmed per-operation total.** Planned hours are the
operation's total labour, not per-technician, so the `numberOfTechnicians`
multiplier in `backend/src/utils/costs.ts:19` is removed and
`plannedCost = plannedHours x craftRate` matches 3.5.1 exactly. The code change
lands with row 49 in Phase E.

**D-4 - backup RPO - confirmed `Build`, proof pending.** The WAL archiving config
and the backup/restore scripts get written. The restore rehearsal **cannot be
run** without a live PostgreSQL host and a second backup target, so it is recorded
as a **pending rehearsal** in §7 - a pending verification, explicitly **not** a
scope reduction and not a waiver.

**D-5 / row 76 - OAuth2 - waive confirmed, does not reopen.** Internal use only;
no Azure AD and no on-premises AD. The 5.5 deviation stands as documented in
D-5. Unlike the other flags, this one will not be revisited.

### 6.5 One arithmetic correction

The SOW owner expected a final tally of **66 Build / 11 Waive**. The verified
tally is **67 Build / 10 Waive**.

Three worksheet rows changed disposition, and each was named explicitly:

| Row | Change | Effect |
|---|---|---|
| 24 | `Waive` to `Build` | Build +1, Waive -1 |
| 30 | `Build` to `Waive` | Build -1, Waive +1 |
| 75 | `Build` to `Waive` | Build -1, Waive +1 |

Net effect on the 68 / 9 baseline: **Build -1, Waive +1**, giving 67 / 10. D-3,
D-4 and D-5 changed decision *answers* but no row's disposition, so they do not
move the totals. Reaching 66 / 11 needs exactly one further row waived, and no
such row was named, so none has been assumed. The correct fix is either to name
the eleventh row or to accept 67 / 10; the register records 67 / 10 because that
is what the named decisions actually produce. The `Waived` status added to the
compliance matrix makes 67 independently re-derivable: 38 Met + 67 build + 10
waived + 4 Deferred + 7 Excluded = 126.

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
