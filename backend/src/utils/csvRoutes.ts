/**
 * One contract for CSV import and export routes (F7 P1).
 *
 * CSV support grew per page: equipment and materials each carry their own
 * multer setup, header check, validation loop and result shape, while work
 * orders and functional locations delegate to the migration importers and
 * return a different shape again. A client cannot consume both, and the two
 * bespoke implementations disagreed with their own API reference about what
 * happens to a file with one bad row.
 *
 * This module owns the parts that must not differ between modules:
 *
 *  - the upload (one size limit, one MIME check, a 400 rather than a 500 when
 *    the part is not a CSV);
 *  - the header contract (`columns` are matched by name, case-insensitively and
 *    in any order, so a hand-edited file is not a positional guessing game);
 *  - row validation through the module's zod schema, when it has one;
 *  - the transaction, and therefore the policy: `strict` rolls the whole file
 *    back on the first rejected row and answers 400, `partial` keeps the rows it
 *    accepted and reports the rest;
 *  - `?dryRun=1`, which runs the real thing and rolls it back, so an operator
 *    can find out what would happen without writing anything;
 *  - one result shape: `{ created, updated, rejected: [{ row, reason }] }`.
 *
 * What stays with the module is what only it can know: which columns it owns,
 * how a row becomes a record, and how a record is written. Work orders and
 * functional locations hand that last part to the migration importers, which
 * also resolve natural-key foreign keys and are shared with the accuracy trial;
 * equipment and materials validate with their zod row schemas here and upsert
 * by natural key themselves.
 */
import type { Prisma } from '@prisma/client';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authorizeMinRole } from '../middleware/auth.js';
import { parseCsv } from '../migration-trial/importers/csv.js';
import { prisma } from './prisma.js';
import { toCsv, CsvRowError } from './csv.js';
import { logger } from './logger.js';

/** How a file with an unacceptable row is treated. */
export type CsvImportMode = 'strict' | 'partial';

export interface CsvRejection {
  /** 1-based line in the uploaded file; the header is line 1. */
  row: number;
  reason: string;
}

export interface CsvImportOutcome {
  created: number;
  updated: number;
  rejected: CsvRejection[];
}

export interface CsvRow<T> {
  number: number;
  /** The row after the module's zod schema has parsed and coerced it. */
  record: T;
  /** Every cell as uploaded, keyed by its header and trimmed. */
  cells: Record<string, string>;
}

export interface CsvImportContext {
  tx: Prisma.TransactionClient;
  userId: string;
  ipAddress: string | undefined;
}

export interface CsvImportSpec<T = Record<string, string>> {
  /** Used in log lines: 'equipment', 'work orders'. */
  noun: string;
  /** Every column this module owns. Defaults to `required`. */
  columns?: readonly string[];
  /** Columns the file must carry. Defaults to `columns`. */
  required?: readonly string[];
  /**
   * Validates one row. Omit it where the semantic rules live in a shared
   * importer (work orders, functional locations) - that importer already rejects
   * a bad row with a better message than a shape check could.
   */
  schema?: z.ZodType<T>;
  mode: CsvImportMode;
  /**
   * Transaction limits, for a module whose writes fan out (a craft rate change
   * re-costs every work order that uses it). Omitted means Prisma's defaults.
   */
  txOptions?: { maxWait?: number; timeout?: number };
  /**
   * Persists the rows whose shape was accepted. Data problems must be returned
   * in `rejected`, not thrown: in `strict` mode the factory turns the first one
   * into a rollback and a 400, and in `partial` mode it returns them.
   */
  run: (ctx: CsvImportContext, rows: CsvRow<T>[]) => Promise<CsvImportOutcome>;
}

export interface CsvExportSpec {
  /** Used in log lines: 'equipment', 'work orders'. */
  noun: string;
  /** File-name stem; the date is appended, e.g. `equipment-2026-10-25.csv`. */
  filename: string;
  columns: readonly string[];
  rows: () => Promise<Array<Array<string | number | null | undefined>>>;
}

/** A request-shaped problem, answered with `status` and `message`. */
class CsvRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'CsvRequestError';
  }
}

/** Carries the dry-run outcome out through Prisma's rollback. */
class DryRunRollback extends Error {
  constructor(readonly outcome: CsvImportOutcome) {
    super('dry run');
    this.name = 'DryRunRollback';
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'text/csv') {
      return cb(new Error('Unsupported file type: only text/csv is allowed'));
    }
    cb(null, true);
  },
});

/**
 * multer hands its own failures to Express, which would make a wrong file type
 * a 500. It is a client mistake, so it is answered as one.
 */
const acceptFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) {
      logger.warn({ err: error }, 'CSV upload rejected');
      res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed' });
      return;
    }
    next();
  });
};

function isDryRun(value: unknown): boolean {
  const requested = String(value ?? '').toLowerCase();
  return requested === '1' || requested === 'true' || requested === 'yes';
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Reads the uploaded file into rows keyed by header. Header matching is by name
 * (trimmed, case-insensitive) because a column map is a contract, not an
 * ordering: the export writes them in `columns` order, but a user who reorders
 * or adds a column in Excel has not broken the data.
 */
function readRows<T>(spec: CsvImportSpec<T>, req: Request): { rows: CsvRow<T>[]; rejected: CsvRejection[] } {
  if (!req.file?.buffer) {
    throw new CsvRequestError(400, 'No file uploaded');
  }

  let parsed;
  try {
    parsed = parseCsv(req.file.buffer.toString('utf8'));
  } catch (error) {
    logger.warn({ err: error, noun: spec.noun }, 'CSV parse failed');
    throw new CsvRequestError(400, `Malformed CSV: ${error instanceof Error ? error.message : 'unreadable'}`);
  }
  if (parsed.headers.length === 0) {
    throw new CsvRequestError(400, 'CSV is empty');
  }
  if (parsed.rows.length === 0) {
    throw new CsvRequestError(400, 'CSV has no data rows');
  }

  const indexByHeader = new Map<string, number>();
  parsed.headers.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    if (!indexByHeader.has(key)) indexByHeader.set(key, index);
  });

  const columns = spec.columns ?? spec.required ?? [];
  const required = spec.required ?? columns;
  const missing = required.filter((column) => !indexByHeader.has(column.toLowerCase()));
  if (missing.length > 0) {
    throw new CsvRequestError(400, `CSV header is missing: ${missing.join(', ')}`);
  }

  const rows: CsvRow<T>[] = [];
  const rejected: CsvRejection[] = [];
  for (const row of parsed.rows) {
    const cells: Record<string, string> = {};
    for (const [header, value] of Object.entries(row.cells)) {
      const name = header.trim();
      if (!(name in cells)) cells[name] = value.trim();
    }

    let record: T;
    if (spec.schema) {
      // Presented in the module's own column names, whatever case the header
      // used, and with unknown columns dropped by the object schema. `cells` is
      // keyed by the raw header, so the raw name is read back from the header
      // list rather than re-derived from the column.
      const shaped: Record<string, string> = {};
      for (const column of columns) {
        const header = parsed.headers[indexByHeader.get(column.toLowerCase()) ?? -1];
        shaped[column] = header === undefined ? '' : (row.cells[header] ?? '').trim();
      }
      const parsedRow = spec.schema.safeParse(shaped);
      if (!parsedRow.success) {
        const reason = describeIssues(parsedRow.error);
        if (spec.mode === 'strict') {
          throw new CsvRowError(row.number, reason);
        }
        rejected.push({ row: row.number, reason });
        continue;
      }
      record = parsedRow.data;
    } else {
      record = cells as T;
    }

    rows.push({ number: row.number, record, cells });
  }

  return { rows, rejected };
}

async function executeImport<T>(spec: CsvImportSpec<T>, req: Request): Promise<CsvImportOutcome> {
  const userId = req.user?.userId;
  if (!userId) {
    // authenticate() guarantees this; failing loudly is better than writing an
    // audit row with no actor if a future route forgets the middleware.
    throw new CsvRequestError(401, 'Authentication required');
  }

  const { rows, rejected } = readRows(spec, req);
  const dryRun = isDryRun(req.query.dryRun);

  try {
    return await prisma.$transaction(async (tx) => {
      const outcome = await spec.run({ tx, userId, ipAddress: req.ip }, rows);
      const merged: CsvImportOutcome = {
        created: outcome.created,
        updated: outcome.updated,
        rejected: [...rejected, ...outcome.rejected].sort((a, b) => a.row - b.row),
      };

      // A strict import has no meaningful partial outcome: the first bad row
      // means the caller gets nothing but the reason, and the writes above are
      // rolled back with the throw.
      if (spec.mode === 'strict' && merged.rejected.length > 0) {
        const first = merged.rejected[0];
        throw new CsvRowError(first.row, first.reason);
      }

      if (dryRun) throw new DryRunRollback(merged);
      return merged;
    }, spec.txOptions);
  } catch (error) {
    if (error instanceof DryRunRollback) return error.outcome;
    throw error;
  }
}

/**
 * Builds the POST handler list for a module's `import.csv`. Attach it with
 * `router.post('/import.csv', ...csvImportRoute(spec))`.
 */
export function csvImportRoute<T>(spec: CsvImportSpec<T>): RequestHandler[] {
  return [
    // Import is a write of master data; every import route has used this floor.
    authorizeMinRole('Maintenance Planner'),
    acceptFile,
    async (req: Request, res: Response) => {
      try {
        res.json(await executeImport(spec, req));
      } catch (error) {
        if (error instanceof CsvRequestError) {
          return res.status(error.status).json({ error: error.message });
        }
        if (error instanceof CsvRowError) {
          return res.status(400).json({ error: `Row ${error.row}: ${error.reason}` });
        }
        logger.error({ err: error, noun: spec.noun }, `Error importing ${spec.noun}`);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  ];
}

/**
 * Date-only cell, the form the importers accept (`YYYY-MM-DD`). An absent date
 * is an empty cell, not "null": the importer's dateCol reads `''` as "no date"
 * and would reject the word.
 */
export function csvDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * Builds the GET handler for a module's `export.csv`. Authentication is the
 * caller's (the module router already applies it), matching the read floor of
 * the JSON list endpoint it mirrors.
 */
export function csvExportRoute(spec: CsvExportSpec): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      const rows = await spec.rows();
      const date = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${spec.filename}-${date}.csv"`);
      res.send(toCsv([[...spec.columns], ...rows]));
    } catch (error) {
      logger.error({ err: error, noun: spec.noun }, `Error exporting ${spec.noun}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
