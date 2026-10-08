/** Trial-run importer core types. No database dependency in this file by design. */
import type { TrialCsvRow } from './csv.js';

/**
 * How a delivered field was produced from the source row. `ImportedRow.target`
 * and `ImportedRow.provenance` are mirrors: every field written to `target` gets
 * exactly one provenance entry explaining what was delivered and what the
 * harness must verify against the read-back row.
 *
 * - `mapped`: the source cell carried a value and it is delivered verbatim; the
 *   delivered value must equal `expected`.
 * - `blank-to-null`: the source cell was blank and the column is nullable; the
 *   delivered value is `null`. There is no source value to preserve, so nothing
 *   is compared beyond "the column is null".
 * - `blank-to-default`: the source cell was blank and the schema applies a
 *   default; the delivered value is `expected` (the default). Reported, not
 *   counted as wrong: the source withheld a value, so there is none to lose.
 * - `as-is-empty`: the source cell was blank on a required, non-null, non-default
 *   column; the empty string is the as-received "no data" form and is preserved
 *   as-is (FILL_REPORT "Trial-only flags", item 6).
 * - `derived`: the delivered value is computed by the importer, not read from
 *   the source (isDeleted=false, the passwordHash placeholder, the blank
 *   supervisorUserId backfill). A derivation is deterministic (isDeleted,
 *   supervisor === reporter) or shape-checked (passwordHash format).
 * - `resolved`: the target field holds a natural-key code (e.g. `I_MECH`, a
 *   username) that the harness resolves to the referenced dataset's surrogate id
 *   before persisting. Verification is the resolution itself (the harness
 *   rejects the row if the code is absent) plus a sanity check that a different
 *   value landed; comparing against the raw code would be wrong on purpose.
 */
export type ImportedCell =
  | { kind: 'mapped'; expected: unknown }
  | { kind: 'blank-to-null' }
  | { kind: 'blank-to-default'; expected: unknown }
  | { kind: 'as-is-empty' }
  | { kind: 'derived'; note: string }
  | { kind: 'resolved'; code: string; dataset: string; column: string };

/** One accepted (mapped) source row, ready for the harness to persist. */
export interface ImportedRow {
  /** 1-based position of the row in the CSV data (line = row + 1). */
  row: number;
  /** Unique statement of the row in plain words (woNumber, locationCode, ...). */
  key: string;
  /** Target record passed to the Prisma create. Surrogate ids are omitted. */
  target: Record<string, unknown>;
  /** How each field in `target` was produced; the verification input. */
  provenance: Record<string, ImportedCell>;
  /** FK fields whose target holds a natural-key code, resolved by the harness. */
  refs: { field: string; dataset: string; column: string }[];
}

export interface RejectedRow {
  row: number;
  key: string;
  reason: string;
}

export interface DatasetResult {
  /** Dataset name, e.g. "WorkCenter". */
  name: string;
  /** Prisma model this dataset maps to. */
  model: string;
  /** Target field + its CSV column for the natural key, when one exists. */
  naturalKey?: { field: string; column: string };
  /** Persist-time PK field of the model, used for read-back selection. */
  pkField: string;
  /** Extra invariants verified against the delivered row (e.g. the supervisor
   * backfill). Returns a list of discrepancies; empty means fine. */
  verify?: (created: Record<string, unknown>) => string[];
  rows: ImportedRow[];
  rejected: RejectedRow[];
}

export interface DatasetImporter {
  name: string;
  model: string;
  naturalKey?: { field: string; column: string };
  pkField: string;
  parse: (rows: TrialCsvRow[]) => DatasetResult;
  verify?: (created: Record<string, unknown>) => string[];
}