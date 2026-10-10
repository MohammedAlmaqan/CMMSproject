# Migration runbook — full legacy load and cutover

This is the SOW §5.7 migration runbook. It covers the full legacy load (SOW §1.3 data
migration) and the accuracy measurement (SOW §6.4 / d, > 99.9%). It records the tooling,
the cleaning policy, the dry-run procedure, the measured result on the Client's dataset,
and the cutover steps.

Evidence artefacts: `docs/migration-templates/FULL_LOAD_LEDGER.json` (every source row
dropped or merged, and why) and `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md` (the
full-dataset accuracy report). The tooling is `scripts/migration/extract_full_dataset.py`
and the harness `backend/src/migration-trial/run.ts`.

## 1. Scope and inputs

Three Client workbooks under `docs/migration-templates/dataset/` (untracked raw source):

| Workbook / sheet | Rows | Produces |
|---|---|---|
| `PM Tracker_V2_Updated.xlsm` — `WO&Notf` | 2,259 | Notifications, WorkOrders, links, Comments |
| `PM Tracker_V2_Updated.xlsm` — `Equip list` | 6,163 | FunctionalLocations, Equipment |
| `PM Tracker_V2_Updated.xlsm` — `Materials` | 5,954 | Materials |
| (distinct values in `WO&Notf`) | — | WorkCenters, Users |

The extractor emits nine `*.filled.csv` files in the exact column contract the trial-run
importers expect, matching the reviewed sample under `docs/migration-templates/`:

1. `WorkCenter.filled.csv`
2. `User.filled.csv`
3. `FunctionalLocation.filled.csv`
4. `Equipment.filled.csv`
4. `Material.filled.csv`
5. `Notification.filled.csv`
6. `WorkOrder.filled.csv`
7. `WorkOrderNotifLink.filled.csv`
8. `Comment.filled.csv`

The other templates in the directory are out of scope: `FILL_REPORT.md` §Scope records
that they have no source rows or are deliberately deferred (the meter patch).

## 2. Extraction

```
python scripts/migration/extract_full_dataset.py --out <output-dir>
```

- Default dataset dir: `<repo>/docs/migration-templates/dataset` (override with
  `--dataset`). `--out` is required and must be a scratch directory; the reviewed sample
  is never overwritten.
- Requires `openpyxl` (reads `.xlsm`); CSVs are written by the standard library as UTF-8
  without BOM.
- Writes `EXCLUSION_LEDGER.json` alongside the CSVs recording every dropped or merged
  source row. A copy of the full-run ledger is committed at
  `docs/migration-templates/FULL_LOAD_LEDGER.json`.
- A row-width assertion fails fast on any column mismatch, so a changed source layout
  stops the run rather than emitting a silently wrong CSV.

### Cleaning policy (owner decision, 2026-10-10)

Keep the full work-order set and the full master sets, **cleaned to a loadable set with
every exclusion logged**. Applied by the extractor:

1. Drop WO rows typed `E3_Non-Maintenance` (no value in the CM/PM/PdM/EM/CAL schema;
   `FILL_REPORT.md` already marks these out of scope).
2. Drop WO rows with a blank/`#N/A` functional location or a blank job description.
3. Keep-first on duplicate `woNumber` and duplicate `notificationNumber` (the partial
   unique indexes on those natural keys reject a second row otherwise).
4. Blank the WO/notification equipment FK when the source `Equip#` resolves to no
   Equipment master row. `Equip#` holds **either** a `TechIdentNo.` (the master key)
   **or** the numeric SAP equipment number; the extractor maps the latter through the
   `Equip list` number→`TechIdentNo.` table before deciding.
5. Drop Equipment rows with a blank `TechIdentNo.`, blank functional location, blank
   name/description, blank/unknown criticality, or a duplicate `TechIdentNo.`.
6. Aggregate Materials by material code (stock summed; standard cost from the `A-NEW`
   vetted value/quantity, falling back to every batch when no `A-NEW`).
7. Fold `i_elec` → `I_ELEC`.

### Full-load ledger (2026-10-10)

| Dataset | Source rows | Emitted | Excluded / merged |
|---|---|---|---|
| Notifications | 2,259 | 2,160 | 21 duplicate `notificationNumber` |
| WorkOrders | 2,259 | 2,170 | 77 `E3_Non-Maintenance`, 1 blank `#N/A` FL; 11 duplicate `woNumber` |
| WorkOrderNotifLinks | — | 2,170 | — |
| Comments | — | 1,549 | — |
| Equipment | 6,163 | 6,127 | blank code 26, duplicate code 2, blank/unknown criticality 5, blank/`#N/A` FL 3 |
| FunctionalLocations | — | 463 | — |
| Materials | 5,954 | 5,687 | 267 rows merged by code |
| WorkCenters | — | 5 | — |
| Users | — | 2 | — |

`equipment_fk_blanked_unresolved`: 11.

## 2b. Dry run (harness)

The harness maps each CSV through the database-free importers, persists the rows into a
**throwaway schema**, reads every field back and compares it with what the importer said
it delivered. It is opt-in and local-only: it refuses to run unless the host is
`localhost` and `TRIAL_RUN_ALLOW_DB=1`, prints no connection string, and drops the schema
it created (including on failure). The app's `public` schema is never touched.

Usage:

1. Choose a clean target database (gate/test DB), e.g. `cmms_gate_fresh`.
2. From `backend`:

```
$env:DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/<db>?schema=public'
$env:TRIAL_RUN_ALLOW_DB='1'
$env:TRIAL_RUN_CSV_DIR='<extractor --out dir>'
$env:TRIAL_RUN_REPORT_PATH='<path to write the full-run report>'
node node_modules\tsx\dist\cli.mjs src\migration-trial\run.ts
```

`TRIAL_RUN_CSV_DIR` and `TRIAL_RUN_REPORT_PATH` both default to the reviewed sample, so a
full run never overwrites the sample files or their report.

### Measured result (2026-10-10)

Target: **99.9%**. Result on the full Client dataset, run twice with identical totals:

| Dataset | Correct / total | Rejected |
|---|---|---|
| WorkCenter | 5 / 5 | 0 |
| User | 2 / 2 | 0 |
| FunctionalLocation | 463 / 463 | 0 |
| Equipment | 6,127 / 6,127 | 0 |
| Material | 5,687 / 5,687 | 0 |
| Notification | 2,160 / 2,160 | 0 |
| WorkOrder | 2,170 / 2,170 | 0 |
| WorkOrderNotifLink | 2,170 / 2,170 | 0 |
| Comment | 1,549 / 1,549 | 0 |
| **Total** | **20,333 / 20,333 = 100.00%** | **0** |

Target met. Report: `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md`. Sample parity was
validated separately: 8 of 9 datasets are field-identical to the reviewed sample; the only
difference is the root functional-location `YE002` free-text description (sample
`KHARWAH FIELD` vs full `BLOCK S2 - ALUQLAH FIELD`) — cosmetic, no correctness impact.

## 3. Cutover procedure

Order matters: parents before children. The importers resolve FK columns as natural keys.

1. **Back up** the target database (`scripts/backup.bat`; see `ADMIN_GUIDE.md`).
2. **Confirm the ledger** — re-run the extractor and check the counts against
   `FULL_LOAD_LEDGER.json`. A mismatch means the source changed since the last load.
4. **Load master data first** — FunctionalLocations, Equipment, Materials, WorkCenters,
   Users. The live API already imports Equipment and Materials
   (`POST /api/equipment/import`, `POST /api/materials/import`); the harness loads the
   full set into a throwaway schema for the measurement.
5. **Load transactional data** — Notifications, then WorkOrders (parents before the links
   and comments that reference them).
6. **Re-run the harness** against the target and confirm 0 rejected and ≥ 99.9%.
7. **Verify** row counts against the ledger and spot-check work-order statuses
   (TECO→Completed, Released→Scheduled, WPART→Suspended).

## 3b. Rollback

The load is additive and idempotent (natural-key upserts). The recovery point is the
pre-load `pg_dump` backup from step 1; restore it with the standard procedure in
`docs/ADMIN_GUIDE.md`. The harness's throwaway schema is dropped automatically, so a dry
run leaves no residue.

## 4. Re-running

The extractor and the harness are deterministic and re-runnable; both are exercised by
the committed `FULL_LOAD_LEDGER.json` and `TRIAL_RUN_REPORT_FULL.md`. A sample run with
no environment overrides reproduces the reviewed `TRIAL_RUN_REPORT.md`.
