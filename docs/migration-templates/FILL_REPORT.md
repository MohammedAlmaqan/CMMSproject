# Trial-run fill report

What the per-template sample in the `*.filled.csv` files next to this
report contains, why each value is mapped the way it is, and what is deliberately
left out. Re-derived from the source workbooks in `dataset/`, not from earlier
notes: counts were recomputed against `PM Tracker_V2_Updated__WO&Notf` (2,259 real
rows), the `Equip list` master (6,163 rows), `Materials` (5,954 rows) and the two
reference workbooks `WO Status.xlsx` / `Maint Activity Types.xlsx`.

## Scope

- **Filled (9 templates):** `WorkCenter`, `User`, `FunctionalLocation`,
  `Equipment`, `Material`, `Notification`, `WorkOrder`, `WorkOrderNotifLink`,
  `Comment` — parents before children, rows name only rows inside the sample.
- **Sample size:** 13 work orders + 13 paired notifications + 13 links + 1
  comment; 4 work centres; 2 users; 22 functional locations; 9 equipment; 14
  materials. The transaction tables (`Notification`, `WorkOrder`,
  `WorkOrderNotifLink` = 13 each, `Material` = 14) are within the requested
  12–15. The master tables (`WorkCenter` = 4, `User` = 2, `Equipment` = 9,
  `FunctionalLocation` = 22) are sized to **FK-closure** — they contain exactly
  the codes the transaction rows reference plus the parent FL chain up to the
  plant — so their row counts follow the closure, not the 12–15 band.
- **Not filled (with reasons):** the other 21 templates. `Craft`, `FailureCode`,
  `CauseCode`, `TaskList*`, `MaintenancePlan*`, `WorkOrderOperation`,
  `WorkOrderMaterial`, `LaborEntry`, `ExternalServiceCost`, `CostSplit`,
  `WorkOrderChecklist*`, `Attachment`, `SafetyChecklistTemplate`,
  `EquipmentBOMMaterial`, `EquipmentMeter`, `MeterReading` — no source rows, or
  deliberately deferred (see [Meter patch](#meter-patch)); the 8 runtime-only
  exclusions in the README stay excluded.
- The header-only blanks are untouched; the filled sample is a separate
  `*.filled.csv` per template. No importers or trial-run harness have been built
  — those come after this sample is reviewed.

## Sample selection

From the 28 rows open at cutover (every non-`TECO` row: `Released` 23, `WPART` 5),
E3 rows were excluded (`23100048`, `23100075`, `23100076` — see
[Unmapped / excluded](#unmapped--excluded-source-fields)). The 13 rows below cover
both open statuses, both mapped WO types, all four work centres present, the three
source maintenance-activity tags and equipment-based + location-only + campus +
well area work.

| WO# | Notif# | Status (mapped) | WO Type→type | MAT | WC | Equipment | FL |
|-----|--------|-----------------|--------------|-----|----|-----------|----|
| 21100029 | 41103029 | Suspended | E1→CM | MRP | I_INST | T-401-EPF4 | YE002-PF04-200-TK401 |
| 21100030 | 41103030 | Suspended | E1→CM | MRP | I_INST | T-401-EPF4 | YE002-PF04-200-TK404 |
| 21100045 | 41103045 | Suspended | E1→CM | MRP | I_ELEC | LBK01 | YE002-CA01-800 |
| 21100185 | 41103185 | Suspended | E1→CM | MRP | I_MECH | P-08A-EPF3 | YE002-PF03-200-P08A |
| 21100072 | 41103072 | Scheduled | E1→CM | MRP | I_MECH | DG907E | YE002-CA01-480-WMF |
| 21100153 | 41103153 | Scheduled | E1→CM | MRP | I_INST | — | YE002-CA01-480 |
| 21100177 | 41103177 | Scheduled | E1→CM | MRP | I_ELEC | K638B | YE002-WS01 |
| 21100212 | 41103212 | Scheduled | E1→CM | MRP | I_MECH | DG908A | YE002-PF01-800 |
| 22100787 | 42103787 | Scheduled | E2→PM | MRM | I_INSP | — | YE002-PF03 |
| 22101987 | 42104987 | Scheduled | E2→PM | SCE | I_INST | — | YE002-PF04-700 |
| 22102018 | 42105018 | Scheduled | E2→PM | MRM | I_MECH | GG803A | YE002-CA01-800 |
| 22102020 | 42105020 | Scheduled | E2→PM | MRM | I_MECH | JT-01-UNIT | YE002-OF01-100-WELHAB19 |
| 22102023 | 42105023 | Scheduled | E2→PM | MRM | I_MECH | K630I | YE002-CA01-720 |

`22102020` represents the three-way split of one job (`22102020/21/22`); the
sample keeps one row per WO/Notif pair. Users: `khaled9` (8 rows),
`xghilanwe` (5 rows).

## Status mapping (verified against `WO Status.xlsx`)

The reference file is authoritative. Its "Short Name" is the link to the source
state; the delivered status column gets the mapped value:

| Reference short name | Meaning (verbatim) | Source value in WO&Notf | Mapped status |
|----------------------|--------------------|-------------------------|---------------|
| CRTD | created, not yet scheduled | *(none open)* | Draft |
| REL | released, agreed execution date | `Released` (23) | Scheduled |
| TECO | technically completed | `TECO` (2,231) | Completed |
| CLSD | financially closed | *(none present)* | Closed |
| WPRT | waiting parts | `WPART` (5) | Suspended |
| WSHD / WSDL / WMPR | waiting shutdown / schedule / manpower | *(none present)* | Suspended |

Source spells the waiting-parts code `WPART`; the reference calls it `WPRT`. Both
name the same on-hold state, so all five `WPART` rows map to **Suspended** (the
owner's correction to an earlier "In Progress" draft).

## Mapped columns, one row per target

### `WorkCenter` (4)

| `code` | `name` (from `POSSIBLE WORKCENTERS`, EPF export) |
|--------|-------------------------------------------------|
| I_MECH | mechanical goup **[sic]** |
| I_ELEC | electrical group |
| I_INST | instrumentaiton and controlsystem group **[sic]** |
| I_INSP | plant inspection group |

Source work centres are `I_MECH`, `I_ELEC`, `I_INST`, `I_INSP`. The reference
spells the instrument one `I_INSTR`; the source value is kept (no re-keying) and
the reference's description is used. `i_elec` (one corrective row, closed `TECO`)
and `I_CIVIL` (13) are outside the open set and not sampled. `dailyCapacityHours=8`
and `costRatePerHour=0` are **trial-only defaults**, flagged below.

### `User` (2)

`khaled9`, `xghilanwe` — the distinct creators on the open rows, case-collapsed
(`Xghilanwe` → `xghilanwe`; 11 rows share the person). `workCenterId` blank (no
home-centre assignment in source). No source full name, email or role: filled with
letter-for-letter placeholders (see [Trial-only flags](#trial-only-flags)).
`supervisorUserId` is left blank (see WorkOrder).

### `FunctionalLocation` (22)

Every FL referenced by a sampled WO **or** by a sampled equipment's master row,
plus its parent chain up to the plant. `parentLocationId` is the parent's
`locationCode`; parents precede children in the file.

| `locationCode` | `description` (source) | `locationType` |
|----------------|------------------------|----------------|
| YE002 | KHARWAH FIELD **[trial-only]** | Plant |
| YE002-CA01 | KHARWAH (LOC fallback) | Area |
| YE002-CA01-480 | KHARWAH CAMP UTILITIES | Unit |
| YE002-CA01-480-WMF | KHARWAH WASTE MANAGEMENT FACILITY | Sub-unit |
| YE002-CA01-720 | KHARWAH FIRE FIGHTING | Unit |
| YE002-CA01-800 | KHARWAH CAMP POWER GENERATION | Unit |
| YE002-PF01 | EPF-1 (LOC fallback) | Area |
| YE002-PF01-800 | EPF1 MAIN POWER GENERATION | Unit |
| YE002-PF03 | EPF-3 (LOC fallback) | Area |
| YE002-PF03-200 | EPF3 OIL SEPARATION AND STABILIZATION | Unit |
| YE002-PF03-200-P08A | P-08A OIL PROCESS PUMP | Sub-unit |
| YE002-PF04 | EPF-4 (LOC fallback) | Area |
| YE002-PF04-200 | EPF4 OIL SEPARATION AND STABILIZATION | Unit |
| YE002-PF04-200-TK401 | T-401 OIL PROCESS TANK | Sub-unit |
| YE002-PF04-200-TK404 | T-404 OIL PROCESS TANK | Sub-unit |
| YE002-PF04-700 | EPF4 FIRE AND GAS DETECTION SYSTEM | Unit |
| YE002-WS01 | MAINTENANCE WORKSHOP (EPF1 AREA) | Unit |
| YE002-WS01-830 | MAINT. WORKSHOP EMERGENCY POWER GEN | Unit |
| YE002-WS01-830-GX | MAINT. WORKSHOP YARD (GENEARTOR AREA) **[sic]** | Sub-unit |
| YE002-OF01 | HABBAN FIELD | Area |
| YE002-OF01-100 | HABBAN OIL WELLS | Unit |
| YE002-OF01-100-WELHAB19 | HABBAN-19 OIL WELL | Sub-unit |

The CSV carries these descriptions verbatim: an exact `Functional Loc.` row in
the Equip list supplies its second `Description` column; rows with no exact
match (the four area parents `YE002-CA01`, `YE002-PF01`, `YE002-PF03`,
`YE002-PF04`) use the `LOC` column of the first row under them — this is the
source-transparent form of the "LOC fallback" label in the table, so the CSV and
this table agree. (An earlier draft of this table mis-listed a `YE002-PF03-200-TK404`
row and omitted `YE002-WS01-830`; the CSV was correct — `YE002-WS01-830` is the
parent of `YE002-WS01-830-GX` — and this table is corrected to match the CSV.)

`locationType` follows the depth rule from the approved plan (1→Plant, 2→Area,
3→Unit, 4→Sub-unit, 5→System). `safetyCritical` stays default false (FL-level
safety is not derivable from the ABC tag, which is equipment-level).

### `Equipment` (9)

`equipmentCode` is the SAP **Technical identification number**, which is what the
WO `Equip#` resolves through the master; the numeric `Equip#` is a re-key that is
not carried.

| `equipmentCode` | `name` = Description | `manufacturer` / `model` / `serialNumber` | `assetTag` = Sort field (code if Sort blank) | `equipmentClass` = Object type | `criticality` |
|-----------------|----------------------|-------------------------------------------|----------------------------------------------|--------------------------------|---------------|
| T-401-EPF4 | T-401-TANK, PROCESS | *(blank — not in source)* | P10159-03-4EDA-1102 | TACT | S |
| LBK01 | LBK01 LOAD BANK | *(blank)* | LBK01 | ESCA | B (M) |
| P-08A-EPF3 | P-08A-PUMP, OIL PROCESS | FLOWSERVE / 80-50CPX160 / 594165-005-02 | P-08A-EPF3 | PUCE | S |
| DG907E | DG907E DIESEL GENERATOR MODEL GEP110-4 | OLYMPIAN / GEP110-4 / OLY00000PLEN03616 | DG907E | EGGE | B (M) |
| K638B | K638B COMPRESSOR MOBILE ATLAS COPCO | ATLAS COPCO / XAS98 KD / WUX667221 | K638B/ WORKSHOP YARD | COSC | B (M) |
| DG908A | DG908A DIESEL OLYMPIAN GENERATOR GEP1651 | OLYMPIAN / GEP165-1*2614/1500 / OLY00000JLEL02057 | DG908A/ EPF01 | EGGE | B (M) |
| GG803A | GG803A GENERATOR GAS JENBACHER | JENBACHER / LSA 52.3 S7 / 1436142/611025DE01 | GG803A | EGGE | A (H) |
| JT-01-UNIT | JT-01 JET PUMP UNIT | NATIONAL OILWELL VARCO / *(blank)* / *(blank)* | JT-01-UNIT | *(blank — `Object type` empty in source)* | B (M) |
| K630I | K630I COMPRESSOR, AIR UTILITY | FIAC / 1121510641 / IYD0210564 | K630I-FIRE TRUCK PARKING | CORE | C (L) |

ABC→criticality — record of the withdrawn S→A mapping, and the S tier reading
now in force (supersedes the earlier read, 2026-10-07):

- **Superseded:** the first fill read the ABC indicator's `S` as "Safety
  Critical" and mapped it to criticality **A** ("S maps to A, never B; S and H
  both land on A"). That rule is **withdrawn by the owner on 2026-10-07**. The
  history is preserved above; this supersedes it.
- **Reading now in force:** the ABC indicator is a single tier column — one
  character per row, from one dropdown (`H`, `L`, `M`, `S` in the PM Tracker
  `Equip list`; relabelled `A`, `B`, `C`, `S` in
  `dataset/asset - updated with SCE S in ABC indicator.xlsx`). `S` (Safety
  Critical) is the **highest tier on the criticality axis: S > A > B > C**. It is
  not an orthogonal flag.
- **Counts (full dataset):** 2128 of 6000 rows carry `S` in the updated asset
  file (PM Tracker `Equip list` cross-check: 2141 of 6163). The two sources are
  coded differently (H/L/M/S vs A/B/C/S) and agree on the SCE population.
- **No bridge and no loss — the cascade does not apply.** The owner's sequencing
  decision (2026-10-07) makes the tier widening the first v1.1 item, landing
  before the trial harness and importers, so the two SCE rows below carry the
  literal, correct value `S` — not a preview — and no sample row is deferred. A
  deferral would have lost 3 WOs, 3 notifications, 3 links and the sample's only
  Comment row (10 transaction rows) plus the 2 SCE equipment rows; under this
  decision that loss statement is moot and nothing is dropped.
- **v1.1 fix (named):** widen `Equipment.criticality` to accept `S` ranked above
  `A` — the `schema.prisma` comment, the two `z.enum(['S','A','B','C'])` sites
  in `backend/src/utils/validation.ts`, the OpenAPI/Swagger enum docs in
  `backend/src/routes/equipment.ts` and `docs/openapi.json`, the template
  value-set note in `docs/migration-templates/README.md`, and the tier mentions
  in `DATA_DICTIONARY.md` / `ISO_14224_MAPPING.md`. No DB change (the column is
  `TEXT NOT NULL`, no CHECK constraint). Committed as `5aa0094`; the harness and
  importers are built against the widened schema.

`operationalStatus` stays default Active; `technicalParameters` stays `{}`.

### `Notification` (13)

`notificationNumber` = `Notif#` verbatim (e.g. `41103029`). `type` = M1 for E1
corrective, M2 for E2 preventive (from the paired WO; source carries no
notification type of its own). `priority` = Medium **[trial-only]** (no source
priority). `functionalLocationId` / `equipmentId` = the row's FL / equipment
code (equipment blank for location-only rows). `reportedByUserId` = creator
username. `description` = `Job Description` verbatim. `damagesObservations`,
`breakdownFlag`, `status` blank → null / false / default **Open**. Audit:
`createdBy` = the paired WO's creator username, `createdDate` = the WO&Notf
`Created Date` (date part) — the notification itself has no separate creator or
timestamp in source; `modifiedBy` / `modifiedDate` blank (no source modifier).

### `WorkOrder` (13)

`woNumber` = `WO#` verbatim (e.g. `21100029`, not re-keyed). `type` = CM / PM by
WO type suffix (`E1_Corrective Maintenance`→CM, `E2_Preventive Maintenance`→PM;
there is no M3 in the sample). `status` = Completed / Scheduled / Suspended per
the mapping table above. `priority` = Medium **[trial-only]**. `plannedStart` /
`plannedFinish` = `Basic Start` / `Basic Finish`, source datetime stripped to the
date (`2025-10-16`, midnight UTC per the README); blank when the source cell is
empty. `workCenterId` = the row's work centre code. `supervisorUserId` = **blank
by owner decision**; `reportedByUserId` = creator username. `causeCodeId` /
`failureCodeId` blank (no source codes). Audit: `createdBy` = `CreatedBy`
username (case-collapsed), `createdDate` = `Created Date` (date part);
`modifiedBy` / `modifiedDate` blank (no source modifier).

`breakdownFlag` is left **false** on every row, with the plan's earlier "E1 →
true" draft intentionally not applied: E1 is *Corrective* maintenance, not
Emergency; the WO&Notf sheet carries no separate breakdown indicator (a closed
`TECO` row is not a breakdown); and the required-column rules do not force it.
Manual call points and gas-chromatograph troubleshooting rows are jobs, not
breakdowns. Staying at the field's default is the defensible reading, so the
fill keeps it rather than inventing a true.

`MainActivityType` is mapped: the reference `Maint Activity Types.xlsx` resolves
each maintenance-activity tag to Preventive / Corrective / Non-Maintenance and
**refines the coarse WO Type** rather than adding a column the delivered schema
does not have. Sample tags: `MRP`→Corrective (8 rows), `MRM`→Preventive (4),
`SCE`→Preventive (1, the SCE-P/SCE-C split cannot be told apart in source and the
paired WO type is E2). No sample row shows the E2/MRP mismatch that exists
elsewhere (`22100038`).

### `WorkOrderNotifLink` (13)

One pair per WO/Notif, `workOrderId` = `WO#`, `notificationId` = `Notif#`. Audit
mirrors the pair: `createdBy` = creator, `createdDate` = WO&Notf `Created Date`;
`modifiedBy` / `modifiedDate` blank.

### `Comment` (1)

The WO&Notf `Note` column is wired into the delivered `Comment` table:
`entityType` = `WorkOrder`, `entityId` = `WO#`, `userId` = the row's creator
username, `content` = `Note` verbatim. Exactly one sampled row carries a note:
`21100185` → "no material available in warehouse". The other twelve rows have an
empty source `Note` and produce no comment rows. Audit as for WorkOrder
(`createdBy` = creator, `createdDate` = `Created Date`; modified columns blank).

### `Material` (14)

`materialCode` = the numeric material number. `description` = `Material
Description`, `unitOfMeasure` = `Base Unit of Measure` (PCS, SET, M, KG, PAC, L,
DR). `standardCost` = **Value Unrestricted ÷ Unrestricted** per the owner rule,
measured over the A-NEW stock rows only (the `E-SCRAP.` rows are scrap-valuated at
≈ 0.01/unit and would distort a standard cost); the uniform per-batch standard
cost in the source confirms this is the right figure. `currentStock` = sum of
`Unrestricted` across all rows for the material (all storage locations and
batches).

| `materialCode` | std cost | stock | note |
|----------------|----------|-------|------|
| 742 / 743 | 13.20 / 11.58 | 17 / 6 | E003, PCS |
| 62508 | 452.78 | 44 | two E003 batches, uniform cost |
| 62519 | 437.73 | 82 | three batches |
| 63015 / 63016 / 63017 | 61.47 / 109.78 / 218.88 | 10 / 19 / 11 | A-NEW + E-SCRAP rows, cost from A-NEW, stock summed |
| 80224 | 167.49 | 1 | SET |
| 68612 | 30.00 | 200 | M |
| 84555 | 98.00 | 30 | KG |
| 84810 | 0.98 | 44 | PAC |
| 90631 | 25.41 | 100 | E004, L |
| 80995 | 306.57 | 20 | DR |
| 4483 | 0.00 | 6 | E004, zero valuation |

## Audited columns (Step 2)

`createdBy` / `createdDate` / `modifiedBy` / `modifiedDate` are filled from the
closest source record instead of being left blank-on-import. Only the two sample
creators may appear in the by-fields; a value is never invented.

| Table | `createdBy` | `createdDate` | `modifiedBy` / `modifiedDate` |
|-------|-------------|---------------|-------------------------------|
| `WorkOrder`, `Notification`, `WorkOrderNotifLink`, `Comment` | the row's `CreatedBy` username (case-collapsed) | WO&Notf `Created Date`, date part | blank — no source modifier |
| `Equipment` | `Created by` from the Equip list, **only when it is one of the two sample users** (lowercased) | `Created on`, date part | `Changed by` / `Changed on` under the same rule |
| `WorkCenter`, `User`, `FunctionalLocation`, `Material` | blank | blank | blank — no clean source audit trail |

On the sampled equipment the `Created by` / `Changed by` cells are mostly
operator or batch handles (`FF_EMC1`, `ALI023`, `SAJED1`, `FF_X01004559`, …),
so the by-fields land blank there and only the dates are carried; `10042973`
(`KHALED9` → `khaled9`), `10041140` and `10039193` / `10109356` (changed by
`XGHILANWE` → `xghilanwe`) do carry a sample-user name.

## Unmapped / excluded source fields

Every WO&Notf column not carried has exactly one of the two approved labels. No
schema, code or template change was made.

| Source field | Label |
|--------------|-------|
| `Equip Discrp` | **duplicate of canonical source field — filled elsewhere** — free text on the WO that re-states the equipment master description; the canonical copy is carried in `Equipment.description` from the `Equip list` row |
| `F.L Discrp` | **duplicate of canonical source field — filled elsewhere** — re-states the functional-location description carried in `FunctionalLocation.description` |
| `reference1` | **no template target** — no counterpart in the delivered model |
| `Number of Employee:` | **excluded by decision — required source absent** — would map to `WorkOrderOperation.numberOfTechnicians`, but `WorkOrderOperation.craftId` is a required column with no source supply, so operations cannot be built |
| `Duration / Employee` | **excluded by decision — required source absent** — same operations mapping (`plannedHours` / `actualHours`), same blocker |
| `Total Duration` | **excluded by decision — required source absent** — same operations mapping, same blocker |
| E3 / `MCP` rows | **excluded by decision — requires application change** — the delivered `type` set {CM, PM, PdM, EM, CAL} has no Non-Maintenance value; representing the 3 open E3 rows would need a type or a resolution rule in the application |

Carried into the delivered schema are the WO&Notf columns behind the mapped
tables above (**including** `Created Date` → `createdDate` and `Note` →
`Comment.content`, per the audit and Comment sections).

## Meter patch

The `Genset RH_PM Update` meter readings and the `Equip list` meter columns are
out of scope for this sample per the owner (an optional follow-up against
`EquipmentMeter` / `MeterReading`). The README's explanation that the 8 excluded
tables are runtime-only is unaffected.

## Trial-only flags

Values the source cannot supply are filled so every required column is non-empty
on every row. Each is marked here; none is real data:

1. `WorkCenter.dailyCapacityHours` = 8, `costRatePerHour` = 0 (no capacity data).
2. `User.fullName` = the username, `email` = `<username>@migration.local`,
   `role` = Technician (no source names, addresses or roles). `passwordHash`
   blank — the importer fabricates a placeholder per the README.
3. `User.workCenterId` and `WorkOrder.supervisorUserId` blank (owner decision);
   `reportedByUserId` falls back to the creator so the required reporter is not
   fabricated.
4. `Notification.priority` / `WorkOrder.priority` = Medium (no source priority).
5. FL root `YE002` description = "KHARWAH FIELD" (no plant-level description in
   the sources; LOC-column values are used as the fallback for the other parent
   rows).
6. Equipment required columns left blank where the master has no value
   (manufacturer/model/serialNumber for T-401-EPF4 and LBK01, serial/model and
   `equipmentClass` for JT-01-UNIT): the empty string is the as-received "no
   data", and the importer or trial harness must accept it or flag it as missing —
   the trial will surface which side of that rule the importer enforces.

## Source quirks preserved (no sanitisation)

- `10035812` / T-401-EPF4 is used on the TK401 row (its master FL) and on the
  TK404 row (`21100030`); the sample carries both, so a WO can name a different FL
  than its equipment's master.
- Reference work-centre label spells `I_INSTR`; source uses `I_INST`. Kept the
  source spelling, took the reference description.
- Source descriptions are verbatim including case and punctuation
  (`mechanical goup`, `GENEARTOR AREA`, double spaces in `Job Description`).
- `Xghilanwe` is collapsed to `xghilanwe` for user uniqueness.

## Cross-checks run

- Every FK value in every filled file resolves to a code that exists in the
  referenced filled file (WorkCenter.code, User.username, FL.locationCode,
  Equipment.equipmentCode, Material.materialCode, Notification.notificationNumber,
  WorkOrder.woNumber, WorkOrderNotifLink pair, Comment.entityId → WorkOrder +
  Comment.userId → User). Unique keys unique within each file; FL parents precede
  children; every FL row has a non-empty `description`.
- Value sets: WorkOrder.type/status/priority, Notification.type/priority/status,
  Equipment.criticality, FL.locationType, User.role all inside the delivered enums.
- Audit columns: `createdBy` / `modifiedBy` only ever ∅, `khaled9`, `xghilanwe`;
  by-fields and dates consistent (createdBy implies createdDate, modifiedBy
  implies modifiedDate); dates are `YYYY-MM-DD`, decimals two places,
  `currentStock` numeric.
- The 30 header-only blanks are byte-identical single-header files; nothing was
  written into them.
- Repo gates `verify_a1.py` (214 clauses) and `verify_a1_dispositions.py`
  (77 rows) pass; the template gate `verify_migration_templates.py` passes
  (30 importable, 8 excluded, 38 schema models) and is unaffected by the
  `*.filled.csv` files, which it does not treat as editable templates.