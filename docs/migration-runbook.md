# Migration runbook — full legacy load and cutover

This is the SOW §5.7 migration runbook. It covers the full legacy load (SOW §1.3 data
migration) and the accuracy measurement (SOW §6.4 / d, > 99.9%). It records the tooling,
the cleaning policy, the dry-run procedure, the measured result on the Client's dataset,
and the cutover steps.

Evidence artefacts: `docs/migration-templates/FULL_LOAD_LEDGER.json` (every source row
dropped or merged, and why) and `docs/migration-templates/TRIAL_RUN_REPORT_FULL.md` (the
full-dataset accuracy report). The tooling is `scripts/migration/extract_full_dataset.py`,
the accuracy harness `backend/src/migration-trial/run.ts`, and the cutover loader
`backend/src/migration-trial/cutover.ts`.

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

The cutover is performed by the one-shot loader
`backend/src/migration-trial/cutover.ts`. It reuses the same importers and `persistDataset`
core as the §2b harness — a cutover row lands exactly as the measured trial row did — but
it writes into the live `public` schema **additively** instead of a throwaway schema. It is
the only authorised writer of the Client dataset against the live database (`AGENTS.md`,
Data safety).

What the loader does, and its guard-rails:

- Loads all nine datasets in one transaction; if any row is rejected the whole load rolls
  back, leaving the database exactly as the backup captured it.
- Writes only the nine tables the importers own. The baseline the Client dataset does not
  supply — the Administrator user, failure codes, crafts, task lists, system config,
  checklist templates — lives in tables no importer writes, so it is preserved without a
  merge step.
- Refuses unless `CUTOVER_ALLOW_DB=1` is set and the host is `localhost`.
- Refuses if the client dataset is already present: a second run would duplicate
  `WorkOrderNotifLink` and `Comment`, which have no natural key.
- When `CUTOVER_EXPECTED` names the reviewed ledger, refuses unless every dataset's mapped
  count equals the ledger's, so a changed source cannot half-load.
- Attributes every row and its audit entry to the active Administrator (preferring `admin`).
- Never prints a connection string.

Procedure (parents before children; the loader already orders the nine datasets):

- **Back up** the live database with `scripts/backup.bat` (see `docs/ADMIN_GUIDE.md`) and
  confirm the dump file exists and is non-empty. This is the recovery point for §3b.
- **Confirm the ledger** — re-run the extractor (§2) and check every emitted count against
  `FULL_LOAD_LEDGER.json`. A mismatch means the source changed since the last load.
- **Run the loader** from `backend` against the live `cmms` database:

  ```
  $env:DATABASE_URL='postgresql://<user>:<pw>@localhost:5432/cmms?schema=public'
  $env:CUTOVER_ALLOW_DB='1'
  $env:CUTOVER_CSV_DIR='<extractor --out dir>'
  $env:CUTOVER_EXPECTED='<repo>/docs/migration-templates/FULL_LOAD_LEDGER.json'
  $env:CUTOVER_REPORT_PATH='<path to write the cutover report>'
  node node_modules\tsx\dist\cli.mjs src\migration-trial\cutover.ts
  ```

  Exit codes: `0` loaded and committed; `1` refused (opt-in, host, actor or sentinel) or a
  missing input file; `2` ledger mismatch; `3` a row was rejected and the load rolled back.
- **Verify** row counts against the ledger, confirm the baseline is intact (the
  Administrator can log in; failure codes, crafts, task lists, system config and checklist
  templates are unchanged), and spot-check work-order statuses (TECO→Completed,
  Released→Scheduled, WPART→Suspended).

## 3b. Rollback

The load is additive and never touches a row it did not create, but it is **not**
idempotent: `WorkOrderNotifLink` and `Comment` have no natural key, so the loader refuses a
second run rather than duplicate them. The recovery point is the pre-load `pg_dump` backup
from step 1; restore it with the standard procedure in `docs/ADMIN_GUIDE.md`. A run rejected
mid-load needs no restore — the whole load is one transaction and rolls back. The harness's
throwaway schema is dropped automatically, so a dry run leaves no residue.

## 4. Re-running

The extractor and the harness are deterministic and re-runnable; both are exercised by
the committed `FULL_LOAD_LEDGER.json` and `TRIAL_RUN_REPORT_FULL.md`. A sample run with
no environment overrides reproduces the reviewed `TRIAL_RUN_REPORT.md`.
