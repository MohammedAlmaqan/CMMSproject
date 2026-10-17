#!/usr/bin/env node
/**
 * Live cutover loader.
 *
 * Loads the nine extracted `*.filled.csv` datasets into the live database's
 * `public` schema *additively*. It reuses the same database-free importers and
 * the same `persistDataset` core the accuracy trial (`run.ts`) and the live API
 * import routes use, so a cutover row lands exactly as the measured trial row
 * did - there is one place that knows how a source cell becomes a record.
 *
 * Unlike the trial harness, this never creates or drops a schema and never
 * touches a row it did not create. The baseline data the Client dataset does not
 * supply is therefore preserved without a merge step: the Administrator user,
 * failure codes, crafts, task lists, system config and checklist templates live
 * in tables no importer writes, and the client master natural keys (`I_MECH`,
 * `khaled9`, `YE002`, ...) do not collide with the seeded ones (`MECH`,
 * `admin`, `PL-01`, ...).
 *
 * Safety, mirroring `run.ts`:
 *  - refuses unless `CUTOVER_ALLOW_DB=1` is set;
 *  - refuses unless the host is localhost;
 *  - refuses if the target already holds the client dataset, so a second run
 *    cannot duplicate the two keyless join datasets (WorkOrderNotifLink,
 *    Comment);
 *  - when `CUTOVER_EXPECTED` names the reviewed ledger, refuses unless every
 *    dataset's mapped count equals the ledger's, so a changed source cannot
 *    half-load;
 *  - loads inside a single transaction and rolls the whole load back if any row
 *    is rejected, so a rejected row cannot leave a half-loaded database;
 *  - never prints a connection string.
 */
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  DATASET_IMPORTERS,
  parseCsv,
  type DatasetImporter,
  type DatasetResult,
  type TrialCsvRow,
} from './importers/index.js';
import { persistDataset, type LiveImportRejection } from './liveImport.js';
import { envValue, safeHost } from './env.js';

const actorIp = 'local-cutover';

/** Ledger key, per dataset, in the extractor's FULL_LOAD_LEDGER.json. */
const LEDGER_COUNT_KEYS: Record<string, string> = {
  WorkCenter: 'workCenters_emitted',
  User: 'users_emitted',
  FunctionalLocation: 'functionalLocations_emitted',
  Equipment: 'equipment_emitted',
  Material: 'materials_emitted',
  Notification: 'notifications_emitted',
  WorkOrder: 'workOrders_emitted',
  WorkOrderNotifLink: 'workOrderNotifLinks_emitted',
  Comment: 'comments_emitted',
};

interface DatasetInput {
  importer: DatasetImporter;
  rows: TrialCsvRow[];
  mapped: DatasetResult;
}

interface DatasetOutcome {
  name: string;
  input: number;
  mapped: number;
  created: number;
  updated: number;
  rejected: LiveImportRejection[];
}

class CutoverRejected extends Error {
  constructor(readonly outcomes: DatasetOutcome[]) {
    const total = outcomes.reduce((n, o) => n + o.rejected.length, 0);
    super(`${total} row(s) rejected; the transaction will roll back`);
    this.name = 'CutoverRejected';
  }
}

function isLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Read every CSV and map it once, before any write, so a missing file fails
 *  before the transaction opens rather than after. */
function readInputs(csvDir: string): DatasetInput[] {
  return DATASET_IMPORTERS.map((importer) => {
    const file = path.join(csvDir, `${importer.name}.filled.csv`);
    const text = readFileSync(file, 'utf8');
    const rows = parseCsv(text).rows;
    return { importer, rows, mapped: importer.parse(rows) };
  });
}

/** The reviewed ledger's emitted count for each of the nine datasets. */
function loadLedger(file: string): Map<string, number> {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>;
  const expected = new Map<string, number>();
  for (const [dataset, key] of Object.entries(LEDGER_COUNT_KEYS)) {
    const value = parsed[key];
    if (typeof value !== 'number') throw new Error(`ledger has no numeric '${key}'`);
    expected.set(dataset, value);
  }
  return expected;
}

/** The Administrator the import is attributed to, preferring the built-in
 *  `admin` account. Null when the database holds no active administrator. */
async function resolveActor(
  client: PrismaClient,
): Promise<{ userId: string; username: string } | null> {
  const byName = await client.user.findFirst({
    where: { username: 'admin', role: 'Administrator', isDeleted: false, isActive: true },
    select: { userId: true, username: true },
  });
  if (byName) return byName;
  return client.user.findFirst({
    where: { role: 'Administrator', isDeleted: false, isActive: true },
    select: { userId: true, username: true },
  });
}

/** The sentinel that says the client dataset is already loaded: one of the
 *  client work-centre codes. Present means a re-run would duplicate rows, so the
 *  loader refuses. Null when none of them is live yet. */
async function alreadyLoaded(client: PrismaClient, inputs: DatasetInput[]): Promise<string | null> {
  const workCenters = inputs.find((i) => i.importer.name === 'WorkCenter');
  if (workCenters === undefined) return null;
  const codes = workCenters.mapped.rows
    .map((r) => r.target.code)
    .filter((code): code is string => typeof code === 'string' && code !== '');
  if (codes.length === 0) return null;
  const hit = await client.workCenter.findFirst({
    where: { code: { in: codes }, isDeleted: false },
    select: { code: true },
  });
  return hit?.code ?? null;
}

function renderReport(host: string, port: number, actor: string, outcomes: DatasetOutcome[]): string {
  const lines: string[] = [];
  lines.push('status: loaded, transaction committed');
  lines.push(`target: ${host}:${port} (public schema)`);
  lines.push(`actor:  ${actor} (Administrator)`);
  lines.push('');
  lines.push('| Dataset | Input | Mapped | Created | Updated | Rejected |');
  lines.push('|---|---|---|---|---|---|');
  for (const o of outcomes) {
    lines.push(`| ${o.name} | ${o.input} | ${o.mapped} | ${o.created} | ${o.updated} | ${o.rejected.length} |`);
  }
  const mapped = outcomes.reduce((n, o) => n + o.mapped, 0);
  const created = outcomes.reduce((n, o) => n + o.created, 0);
  const updated = outcomes.reduce((n, o) => n + o.updated, 0);
  const rejected = outcomes.reduce((n, o) => n + o.rejected.length, 0);
  lines.push('');
  lines.push(`total: ${mapped} mapped, ${created} created, ${updated} updated, ${rejected} rejected`);
  lines.push('');
  return lines.join('\n');
}

async function run(): Promise<number> {
  process.stdout.write('=== CMMS live cutover loader ===\n');
  if (process.env.CUTOVER_ALLOW_DB !== '1') {
    process.stdout.write(
      'Refusing to run: this writes the Client dataset into the live database. Back up\n' +
        'first (scripts/backup.bat), then re-run with CUTOVER_ALLOW_DB=1.\n',
    );
    return 1;
  }
  const csvDir = process.env.CUTOVER_CSV_DIR;
  if (!csvDir) {
    process.stdout.write('Set CUTOVER_CSV_DIR to the extractor --out directory.\n');
    return 1;
  }
  const dbUrl = envValue('DATABASE_URL');
  if (dbUrl === undefined) {
    process.stdout.write('No DATABASE_URL in the environment or backend/.env.\n');
    return 1;
  }
  const { host, port } = safeHost(dbUrl);
  if (!isLocal(host)) {
    process.stdout.write(`Refusing to write the live dataset on a non-local host (${host}).\n`);
    return 1;
  }

  let inputs: DatasetInput[];
  try {
    inputs = readInputs(path.resolve(csvDir));
  } catch (err) {
    process.stdout.write(
      `Cannot read the extractor output: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  if (process.env.CUTOVER_EXPECTED) {
    const expected = loadLedger(path.resolve(process.env.CUTOVER_EXPECTED));
    for (const { importer, mapped } of inputs) {
      const want = expected.get(importer.name);
      if (want !== undefined && mapped.rows.length !== want) {
        process.stdout.write(
          `Ledger mismatch for ${importer.name}: ledger says ${want}, extractor produced ${mapped.rows.length}.\n`,
        );
        return 2;
      }
    }
    process.stdout.write(`status: ledger check passed against ${process.env.CUTOVER_EXPECTED}\n`);
  }

  const client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await client.$connect();

    const actor = await resolveActor(client);
    if (actor === null) {
      process.stdout.write(
        'Refusing to run: no active Administrator to attribute the import to.\n',
      );
      return 1;
    }
    process.stdout.write(`status: attributes rows to '${actor.username}' (Administrator)\n`);

    const sentinel = await alreadyLoaded(client, inputs);
    if (sentinel !== null) {
      process.stdout.write(
        `Refusing to run: the client dataset is already present (work centre '${sentinel}' exists).\n` +
          'A second load would duplicate WorkOrderNotifLink and Comment, which have no natural key.\n',
      );
      return 1;
    }

    process.stdout.write(
      `status: loading ${inputs.length} datasets into ${host}:${port} (public schema)\n`,
    );

    let outcomes: DatasetOutcome[];
    try {
      // One transaction for the whole cutover: parents, children and their audit
      // rows commit together or not at all. A single rejected row throws, and
      // the rollback leaves the database exactly as the backup captured it.
      outcomes = await client.$transaction(
        async (tx) => {
          const results: DatasetOutcome[] = [];
          for (const { importer, rows, mapped } of inputs) {
            const outcome = await persistDataset(tx, importer, mapped, {
              userId: actor.userId,
              ipAddress: actorIp,
            });
            results.push({
              name: importer.name,
              input: rows.length,
              mapped: mapped.rows.length,
              created: outcome.created,
              updated: outcome.updated,
              rejected: [
                ...mapped.rejected.map((r) => ({ row: r.row, key: r.key, reason: r.reason })),
                ...outcome.rejected,
              ],
            });
          }
          if (results.some((o) => o.rejected.length > 0)) throw new CutoverRejected(results);
          return results;
        },
        { maxWait: 60_000, timeout: 30 * 60 * 1000 },
      );
    } catch (err) {
      if (err instanceof CutoverRejected) {
        for (const outcome of err.outcomes) {
          for (const rejection of outcome.rejected.slice(0, 10)) {
            process.stdout.write(
              `  ${outcome.name} row ${rejection.row} (${rejection.key}): ${rejection.reason}\n`,
            );
          }
        }
        process.stdout.write('status: rolled back - no rows were written\n');
        return 3;
      }
      throw err;
    }

    const report = renderReport(host, port, actor.username, outcomes);
    process.stdout.write(report);
    if (process.env.CUTOVER_REPORT_PATH) {
      const outPath = path.resolve(process.env.CUTOVER_REPORT_PATH);
      await writeFile(outPath, report, 'utf8');
      process.stdout.write(`report: wrote ${outPath}\n`);
    }
    return 0;
  } finally {
    await client.$disconnect();
  }
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`cutover failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
