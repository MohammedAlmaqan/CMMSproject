/**
 * Live-API import core (C5).
 *
 * The dataset importers in this directory are deliberately database-free: they
 * turn one CSV row into a `target` record plus per-field `provenance`, and mark
 * every foreign key with a `ref` naming the referenced dataset and its natural
 * key. The trial harness (run.ts) consumes that against a throwaway schema.
 *
 * This module consumes the same output against the live database, so a live
 * route and the accuracy trial cannot diverge on how a source cell becomes a
 * record. It loads the natural-key -> id maps the refs name, resolves each ref,
 * then upserts by the importer's natural key and writes an audit entry. Routes
 * stay free of mapping rules; there is exactly one place that knows them.
 */
import type { Prisma } from '@prisma/client';
import { logAuditAction } from '../middleware/audit.js';
import type { DatasetImporter, DatasetResult } from './importers/index.js';

type Client = Prisma.TransactionClient;

export interface LiveImportActor {
  userId: string;
  ipAddress: string | undefined;
}

export interface LiveImportRejection {
  row: number;
  key: string;
  reason: string;
}

export interface LiveImportOutcome {
  created: number;
  updated: number;
  rejected: LiveImportRejection[];
}

/** The slice of a Prisma delegate the importer needs; reached by model name so a
 *  new dataset needs no route-specific code. */
interface DynamicModel {
  findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
}

function model(client: Client, name: string): DynamicModel {
  return (client as unknown as Record<string, DynamicModel>)[name];
}

/** Keep a Prisma failure a row-sized reason instead of a code frame. */
function describeError(err: unknown): string {
  const code =
    err !== null && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? `${(err as { code: string }).code} `
      : '';
  const message =
    err instanceof Error
      ? err.message.split('\n').map((l) => l.trim()).filter((l) => l !== '').pop() ?? err.message
      : String(err);
  return `${code}${message}`;
}

/** Natural-key -> id for one referenced dataset, drawn from the live database. A
 *  dataset with no loader here is a programming error, not a data error, so it
 *  throws rather than silently rejecting every row. */
async function loadReference(client: Client, dataset: string): Promise<Map<string, string>> {
  switch (dataset) {
    case 'FunctionalLocation': {
      const rows = await client.functionalLocation.findMany({
        where: { isDeleted: false },
        select: { locationCode: true, functionalLocationId: true },
      });
      return new Map(rows.map((r) => [r.locationCode, r.functionalLocationId]));
    }
    case 'Equipment': {
      const rows = await client.equipment.findMany({
        where: { isDeleted: false },
        select: { equipmentCode: true, equipmentId: true },
      });
      return new Map(rows.map((r) => [r.equipmentCode, r.equipmentId]));
    }
    case 'WorkCenter': {
      const rows = await client.workCenter.findMany({
        where: { isDeleted: false },
        select: { code: true, workCenterId: true },
      });
      return new Map(rows.map((r) => [r.code, r.workCenterId]));
    }
    case 'User': {
      const rows = await client.user.findMany({
        where: { isDeleted: false },
        select: { username: true, userId: true },
      });
      return new Map(rows.map((r) => [r.username, r.userId]));
    }
    default:
      throw new Error(`No live reference loader for dataset '${dataset}'`);
  }
}

function seed(maps: Map<string, Map<string, string>>, dataset: string, key: unknown, id: unknown): void {
  if (key === undefined || key === null || id === undefined || id === null) return;
  let map = maps.get(dataset);
  if (map === undefined) {
    map = new Map();
    maps.set(dataset, map);
  }
  if (!map.has(String(key))) map.set(String(key), String(id));
}

/**
 * Persist an importer's output. References are resolved against live master
 * data (plus rows created earlier in the same run, so a location's parent can be
 * a row from the same file when it is ordered parent-first). A row whose ref
 * cannot be resolved is rejected with the reason, not silently dropped, and one
 * rejected row does not roll back the rest. The caller supplies the transaction.
 */
export async function persistDataset(
  client: Client,
  importer: DatasetImporter,
  mapped: DatasetResult,
  actor: LiveImportActor,
): Promise<LiveImportOutcome> {
  const datasets = new Set<string>();
  for (const row of mapped.rows) for (const ref of row.refs) datasets.add(ref.dataset);
  const maps = new Map<string, Map<string, string>>();
  for (const dataset of datasets) maps.set(dataset, await loadReference(client, dataset));

  const table = model(client, importer.model);
  const pkField = importer.pkField;
  const keyField = importer.naturalKey?.field;

  const rejected: LiveImportRejection[] = mapped.rejected.map((r) => ({
    row: r.row,
    key: r.key,
    reason: r.reason,
  }));
  let created = 0;
  let updated = 0;

  for (const row of mapped.rows) {
    const data: Record<string, unknown> = { ...row.target };

    let failReason: string | null = null;
    for (const ref of row.refs) {
      const code = String(data[ref.field] ?? '');
      const id = maps.get(ref.dataset)?.get(code);
      if (id === undefined) {
        failReason = `${ref.field}=${code}: no ${ref.dataset}.${ref.column} row in scope`;
        break;
      }
      data[ref.field] = id;
    }
    if (failReason !== null) {
      rejected.push({ row: row.row, key: row.key, reason: failReason });
      continue;
    }

    const keyValue = keyField ? data[keyField] : undefined;
    let existing: Record<string, unknown> | null = null;
    if (keyField && keyValue !== undefined && keyValue !== null) {
      existing = await table.findFirst({ where: { [keyField]: keyValue, isDeleted: false } });
    }

    try {
      if (existing) {
        const updateData = { ...data };
        // Provenance is kept on the row it belongs to: an update must not rewrite
        // who created the record or when.
        delete updateData.createdBy;
        delete updateData.createdDate;
        updateData.modifiedBy = actor.userId;
        const pk = existing[pkField];
        await table.update({ where: { [pkField]: pk }, data: updateData });
        await logAuditAction({
          table: importer.model,
          recordId: String(pk),
          action: 'Update',
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          db: client,
        });
        seed(maps, importer.name, keyValue, pk);
        updated += 1;
      } else {
        const createData = { ...data };
        if (createData.createdBy === undefined) createData.createdBy = actor.userId;
        createData.modifiedBy = actor.userId;
        const createdRow = await table.create({ data: createData });
        await logAuditAction({
          table: importer.model,
          recordId: String(createdRow[pkField]),
          action: 'Create',
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          db: client,
        });
        seed(maps, importer.name, keyValue, createdRow[pkField]);
        created += 1;
      }
    } catch (err) {
      rejected.push({ row: row.row, key: row.key, reason: `persist failed: ${describeError(err)}` });
    }
  }

  return { created, updated, rejected };
}