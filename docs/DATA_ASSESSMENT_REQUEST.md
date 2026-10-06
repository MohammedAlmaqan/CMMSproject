# Data Assessment Request — go-live migration trial run

Requested 2026-10-06 to unblock rows 40 (§1.3), 307 (§5.7) and 335 (§6.4 / d, the
go-live blocker). No importer is built or requested here: this is the data
assessment that decides whether the migration trial run can be attempted.

## What is being asked

Please supply a **trial sample** (not the full dataset) of the three sources the
migration must load, in three separate CSV files:

1. **Open work orders** — the work orders still open at cutover.
2. **Functional locations** — the location hierarchy the equipment will be
   placed under.
3. **Equipment and materials** — the equipment master plus the material
   catalogue, supplied together so each record can be cross-checked against the
   other (BOM and operation links).

One CSV file per dataset, UTF-8 encoded, with a single header row.

**"CSV-equivalent" for an Excel/paper source:** one row per record and one column
per field, no merged cells, no nested or repeating blocks inside a row, and no
aggregated subtotal rows. Export the sheet as-is; flattening is our job.

## Sample size

**10–20 rows per dataset.** The full dataset is deliberately not requested yet.
The trial run must be proven on a sample first; the full dataset is accepted
only after the trial-run report above passes.

## What the trial run will measure

A row is **correct** when every field this importer maps arrives with its source
value unchanged and the row is not rejected by the importer.

The **accuracy figure** is:

  correct rows ÷ mapped rows × 100

against a target of **99.9%**. Unmapped source fields (columns the import does
not consume) do not count against the row and are listed separately in the
report rather than hidden.

## What you will receive back (trial-run report)

For each dataset: total rows, mapped rows, rejected rows with the reason per
row, the list of unmapped source fields, the final accuracy figure, and the
elapsed time to import the sample.

## Constraints

- **No live data.** The sample must be representative but not the live plant
  dataset.
- **Sample only** — see the sample size above.
- **Sanitisation is allowed.** Data may be anonymised (names, serial numbers,
  addresses) as long as the shape, field names and values that the importer maps
  are representative.