import { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export type AuditAction = 'Create' | 'Update' | 'Delete' | 'Run' | 'Blocked';

type AuditDb = Pick<PrismaClient, 'auditLogEntry'>;

/**
 * Fields every audit row must carry, whatever the kind.
 *
 * `userId` and `ipAddress` live on the entry object rather than being positional
 * arguments. They used to be positional, optional and nullable, which is three
 * separate ways for a call site to lose them without noticing. As required
 * properties they cannot be omitted, so SOW 3.6's "including IP address and
 * user" is enforced by the compiler rather than by whoever remembers.
 *
 * `ipAddress` is required but nullable: Express types `req.ip` as
 * `string | undefined`, and when the socket is genuinely gone the honest record
 * is a NULL, not a fabricated address. The property still has to be passed
 * deliberately.
 */
interface CommonEntry {
  table: string;
  recordId: string;
  userId: string;
  ipAddress: string | undefined;
  /** Route the audit row through a transaction client so a bulk write and its
   *  audit row commit or roll back together. */
  db?: AuditDb;
}

/**
 * A field was modified. `field`, `oldValue` and `newValue` are all required:
 * a diff that does not say which field, or what it was before, is not a diff.
 * The value types accept null because a field can genuinely move to or from
 * empty, and a creation genuinely had nothing before — the caller must say so
 * explicitly rather than omit it.
 */
export interface FieldChangeEntry extends CommonEntry {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  /** A field change is a create, an update, or a refusal. It is never a
   *  Delete: a deleted row has no value left to record. */
  action: Extract<AuditAction, 'Create' | 'Update' | 'Blocked'>;
}

/**
 * Something happened that is not a field diff: a row was created, deleted, a
 * job ran, a request was blocked. The value fields are deliberately absent from
 * this type, so a call site cannot pass a half-populated diff to it — the
 * object literal would carry properties this shape does not declare.
 */
export interface ActionEntry extends CommonEntry {
  action: AuditAction;
}

interface Row {
  tableName: string;
  recordId: string;
  action: AuditAction;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  userId: string;
  ipAddress: string | null;
}

// A failed audit write must not fail the request that triggered it: the business
// change has already committed, and losing it because the log was unavailable
// would be worse than the missing row. It is logged loudly instead.
async function write(row: Row, db: AuditDb) {
  try {
    await db.auditLogEntry.create({ data: row });
  } catch (error) {
    logger.error({ err: error, table: row.tableName, recordId: row.recordId }, 'Audit log error');
  }
}

export async function logAuditFieldChange(entry: FieldChangeEntry) {
  await write(
    {
      tableName: entry.table,
      recordId: entry.recordId,
      action: entry.action,
      fieldName: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      userId: entry.userId,
      ipAddress: entry.ipAddress ?? null,
    },
    entry.db ?? prisma
  );
}

export async function logAuditAction(entry: ActionEntry) {
  await write(
    {
      tableName: entry.table,
      recordId: entry.recordId,
      action: entry.action,
      fieldName: null,
      oldValue: null,
      newValue: null,
      userId: entry.userId,
      ipAddress: entry.ipAddress ?? null,
    },
    entry.db ?? prisma
  );
}

export function auditMiddleware(tableName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode < 400 && req.user) {
        const recordId = req.params.id || body?.id || body?.recordId;
        const action = req.method === 'POST' ? 'Create' : req.method === 'PUT' || req.method === 'PATCH' ? 'Update' : 'Delete';
        if (recordId) {
          void logAuditAction({
            table: tableName,
            recordId,
            action,
            userId: req.user.userId,
            ipAddress: req.ip,
          });
        }
      }
      return originalJson(body);
    };
    next();
  };
}

/** A value as it is recorded in an audit row: one string, or null for empty. */
function auditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return stableStringify(value);
  return String(value);
}

/** JSON with object keys sorted, so a column that did not change cannot produce
 *  a diff purely because Postgres returned its keys in a different order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * The columns that moved between two versions of a row, with the values as they
 * are recorded. Pure: it decides, it does not write, so it can be tested without
 * a database and the decision is in one place rather than inside a loop that
 * also talks to one.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[]
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  for (const field of fields) {
    const oldValue = auditValue(before[field]);
    const newValue = auditValue(after[field]);
    if (oldValue === newValue) continue;
    changes.push({ field, oldValue, newValue });
  }
  return changes;
}

/**
 * Records the fields that actually moved between two versions of a row, one
 * audit row each.
 *
 * This exists so master-data edits get real old/new values without every route
 * hand-writing its own comparison. Hand-written diffs drift: they name the wrong
 * field, or compare against a value fetched after the write, and the mistake is
 * invisible until someone reads the trail. Here the route passes the row as it
 * was and the row as it now is, and the comparison is the same everywhere.
 *
 * `fields` is the auditable business columns of the table. The system columns
 * (created/modified stamps, isDeleted, the primary key) are deliberately absent:
 * recording that `modifiedBy` changed on every edit would bury the edits that
 * matter under noise.
 *
 * Only genuine differences are recorded, so an unchanged field produces nothing.
 */
export async function logFieldChanges(opts: {
  table: string;
  recordId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields: readonly string[];
  userId: string;
  ipAddress: string | undefined;
  db?: AuditDb;
}): Promise<void> {
  for (const change of changedFields(opts.before, opts.after, opts.fields)) {
    await logAuditFieldChange({
      table: opts.table,
      recordId: opts.recordId,
      action: 'Update',
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      userId: opts.userId,
      ipAddress: opts.ipAddress,
      db: opts.db,
    });
  }
}
