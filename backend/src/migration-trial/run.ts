#!/usr/bin/env node
/**
 * Trial-run harness.
 *
 * For each of the nine in-scope datasets it reads the `*.filled.csv` sample,
 * maps it through the database-free importers, persists the rows into a
 * throwaway schema on the configured PostgreSQL server, reads them back and
 * compares every delivered field against what the importer said it delivered,
 * then writes the trial-run report to docs/migration-templates/
 * TRIAL_RUN_REPORT.md.
 *
 * The CSV directory and report path honour TRIAL_RUN_CSV_DIR and
 * TRIAL_RUN_REPORT_PATH so a full-dataset run reads an extracted CSV set and
 * writes its own report without touching the reviewed sample or its report.
 *
 * Safety: this is a local-runner, opt-in harness exactly like the gate's DB
 * step. It refuses to run unless the host is localhost and TRIAL_RUN_ALLOW_DB=1
 * is set, never prints a connection string, and drops the throwaway schema it
 * created (including on failure). The app's `public` schema is not touched.
 */
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  DATASET_IMPORTERS,
  parseCsv,
  type TrialCsvRow,
  type ImportedCell,
  type DatasetImporter,
} from './importers/index.js';
import { verifyRow } from './verify.js';
import {
  makeClient,
  trialUrl,
  createTrialSchema,
  dropTrialSchema,
  migrateTrial,
} from './trialDb.js';
import { envValue, safeHost, backendDir } from './env.js';
import {
  renderReport,
  type ColumnRule,
  type DatasetReport,
  type ReportInput,
} from './report.js';

const docsDir = path.resolve(backendDir, '..', 'docs', 'migration-templates');
// The reviewed sample lives in docsDir. A full-dataset run points TRIAL_RUN_CSV_DIR
// at an extracted CSV set and TRIAL_RUN_REPORT_PATH at a separate report, so the
// sample files and their trial-run report are never overwritten. Both default to
// the sample behaviour.
const csvDir = process.env.TRIAL_RUN_CSV_DIR
  ? path.resolve(process.env.TRIAL_RUN_CSV_DIR)
  : docsDir;
const reportPath = process.env.TRIAL_RUN_REPORT_PATH
  ? path.resolve(process.env.TRIAL_RUN_REPORT_PATH)
  : path.join(docsDir, 'TRIAL_RUN_REPORT.md');
const ACCURACY_TARGET = 99.9;



function gitShortHead(): string {
  try {
    const r = spawnSync('git', ['-C', path.resolve(docsDir, '..'), 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch {
    // fall through
  }
  return '(unknown)';
}

function fmtValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * One readable line for a row the database refused. Prisma's message opens
 * with a code frame and puts the cause on the last line, so keeping the first
 * line recorded either an empty reason or a source snippet - a rejection table
 * nobody can act on. Keep the tail, squash the whitespace, prefix the Prisma
 * error code when there is one, redact anything that looks like a connection
 * string (the harness never prints one), and cap the length so a row stays a
 * row.
 */
function describeError(err: unknown): string {
  const code =
    err !== null && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? `${(err as { code: string }).code} `
      : '';
  const raw = err instanceof Error ? err.message : String(err);
  const oneLine = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(?:postgres|postgresql):\/\/\S+/gi, '<connection-string>');
  const body = oneLine.length > 300 ? `...${oneLine.slice(-300)}` : oneLine;
  return `${code}${body}`;
}

/** One delivery rule per CSV column, how it acted across the dataset's rows. */
function summarizeColumns(
  headers: string[],
  rows: Array<{ provenance: Record<string, ImportedCell> }>,
): { columns: ColumnRule[]; unmapped: string[] } {
  // One entry per distinct rule a column exhibited. A Set, not a concatenated
  // string: a column that alternates between two rules across thousands of rows
  // (e.g. serialNumber blank on most rows, mapped on some) would otherwise grow
  // a single table cell without bound.
  const rules = new Map<string, Set<string>>();
  for (const header of headers) {
    for (const row of rows) {
      const cell = row.provenance[header];
      if (cell === undefined) continue;
      let rule: string;
      switch (cell.kind) {
        case 'mapped':
          rule = 'mapped - source value delivered verbatim';
          break;
        case 'blank-to-null':
          rule = 'nullable - blank src -> null';
          break;
        case 'blank-to-default':
          rule = `blank src -> ${fmtValue(cell.expected)} (schema default)`;
          break;
        case 'as-is-empty':
          rule = 'blank kept as empty string (as-received "no data")';
          break;
        case 'derived':
          rule = `derived - ${cell.note}`;
          break;
        case 'resolved':
          rule = `FK reference - resolved to the ${cell.dataset} row by ${cell.column}`;
          break;
      }
      let observed = rules.get(header);
      if (observed === undefined) {
        observed = new Set<string>();
        rules.set(header, observed);
      }
      observed.add(rule);
    }
  }
  const columns: ColumnRule[] = headers.map((h) => ({
    name: h,
    rule: rules.has(h)
      ? [...(rules.get(h) as Set<string>)].join('; ')
      : 'not carried (server-generated or blank-on-import default)',
  }));
  const unmapped = headers.filter((h) => !rules.has(h));
  return { columns, unmapped };
}

async function importDataset(
  trial: PrismaClient,
  importer: DatasetImporter,
  rows: TrialCsvRow[],
  maps: Map<string, Map<string, string>>,
): Promise<DatasetReport> {
  const headers = rows.length > 0 ? Object.keys(rows[0].cells) : [];

  const parseStart = performance.now();
  const mapped = importer.parse(rows);
  const parseMs = performance.now() - parseStart;

  const persistStart = performance.now();
  const persistRejected: DatasetReport['parseRejected'] = [];
  const incorrect: DatasetReport['incorrect'] = [];
  const delivered: Record<string, unknown>[] = [];
  let correct = 0;

  for (const row of mapped.rows) {
    const data: Record<string, unknown> = { ...row.target };
    let failReason: string | null = null;
    for (const r of row.refs) {
      const code = String(data[r.field]);
      const column = maps.get(r.dataset)?.get(code);
      if (column === undefined) {
        failReason = `${r.field}=${code}: no ${r.dataset}.${r.column} row in scope`;
        break;
      }
      data[r.field] = column;
    }

    let created: Record<string, unknown> | undefined;
    if (failReason === null) {
      try {
        created = await (trial as unknown as {
          [model: string]: {
            create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
          };
        })[importer.model].create({ data });
      } catch (err) {
        failReason = `create failed: ${describeError(err)}`;
      }
    }

    if (failReason !== null || created === undefined) {
      persistRejected.push({ row: row.row, key: row.key, reason: failReason ?? 'no row returned' });
      continue;
    }

    delivered.push(created);
    // Seed the natural-key -> id map as each row lands so parents (within and
    // across datasets) are resolvable before their children are persisted.
    if (importer.naturalKey) {
      const keyField = importer.naturalKey.field;
      const key = created[keyField];
      const pk = created[importer.pkField];
      if (key !== undefined && pk !== undefined) {
        let map = maps.get(importer.name);
        if (map === undefined) {
          map = new Map();
          maps.set(importer.name, map);
        }
        if (!map.has(String(key))) map.set(String(key), String(pk));
      }
    }
    const diffs = [
      ...verifyRow(row.provenance, created),
      ...(importer.verify ? importer.verify(created) : []),
    ];
    if (diffs.length > 0) {
      incorrect.push({ row: row.row, key: row.key, diffs });
    } else {
      correct += 1;
    }
  }
  const persistMs = performance.now() - persistStart;

  const { columns, unmapped } = summarizeColumns(headers, mapped.rows);
  const mappedCount = mapped.rows.length;
  const accuracyPct = mappedCount === 0 ? null : (correct / mappedCount) * 100;

  return {
    name: mapped.name,
    model: mapped.model,
    total: rows.length,
    mapped: mappedCount,
    parseRejected: mapped.rejected,
    persistRejected,
    incorrect,
    correct,
    accuracyPct,
    parseMs,
    persistMs,
    columns,
    unmapped,
  };
}

async function run(): Promise<number> {
  const optIn = process.env.TRIAL_RUN_ALLOW_DB === '1';
  const dbUrl = envValue('DATABASE_URL');

  process.stdout.write('=== CMMS migration trial-run harness ===\n');
  if (!optIn) {
    process.stdout.write(
      'Refusing to run: the harness creates a throwaway schema, migrates it and imports\n' +
        'the sample into it. That is a write to your configured server, so it requires the\n' +
        'same informed opt-in the gate uses: re-run with TRIAL_RUN_ALLOW_DB=1.\n',
    );
    return 1;
  }
  if (dbUrl === undefined) {
    process.stdout.write('No DATABASE_URL in the environment or backend/.env.\n');
    return 1;
  }

  const { host, port } = safeHost(dbUrl);
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    process.stdout.write(`Refusing to create a trial schema on a non-local host (${host}).\n`);
    return 1;
  }

  const schema = `cmms_trial_${process.pid}_${Date.now()}`;
  const base = makeClient(dbUrl);
  const trial = makeClient(trialUrl(dbUrl, schema));

  try {
    await base.$connect();
    await createTrialSchema(base, schema);
    process.stdout.write(`status: created throwaway schema ${schema} on ${host}:${port}\n`);

    const migrated = migrateTrial(trialUrl(dbUrl, schema));
    if (!migrated.ok) {
      process.stdout.write(`status: migration failed (${migrated.detail})\n`);
      return 2;
    }
    process.stdout.write('status: migrate deploy applied\n');

    await trial.$connect();
    const maps = new Map<string, Map<string, string>>();
    const datasets: DatasetReport[] = [];

    for (const importer of DATASET_IMPORTERS) {
      const file = path.join(csvDir, `${importer.name}.filled.csv`);
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        process.stdout.write(`error: cannot read ${file}\n`);
        return 3;
      }
      const parsed = parseCsv(text);
      const report = await importDataset(trial, importer, parsed.rows, maps);
      datasets.push(report);
      process.stdout.write(
        `${importer.name}: ${report.total} total, ${report.mapped} mapped, ` +
          `${report.parseRejected.length + report.persistRejected.length} rejected, ` +
          `${report.correct} correct, ${report.accuracyPct === null ? 'n/a' : report.accuracyPct.toFixed(2) + '%'} ` +
          `(${ms(report.parseMs)} map, ${ms(report.persistMs)} persist)\n`,
      );
    }

    const totalRows = datasets.reduce((n, d) => n + d.total, 0);
    const totalMapped = datasets.reduce((n, d) => n + d.mapped, 0);
    const totalRejected = datasets.reduce(
      (n, d) => n + d.parseRejected.length + d.persistRejected.length,
      0,
    );
    const totalCorrect = datasets.reduce((n, d) => n + d.correct, 0);
    const overallAccuracy = totalMapped === 0 ? null : (totalCorrect / totalMapped) * 100;
    const persistMs = datasets.reduce((n, d) => n + d.persistMs, 0);

    const reportInput: ReportInput = {
      runAt: new Date().toISOString(),
      host,
      port,
      schema,
      sampleCommit: gitShortHead(),
      datasets,
      overall: {
        total: totalRows,
        mapped: totalMapped,
        rejected: totalRejected,
        correct: totalCorrect,
        accuracyPct: overallAccuracy,
        persistMs,
      },
    };

    const markdown = renderReport(reportInput);
    const outPath = reportPath;
    await writeFile(outPath, markdown, 'utf8');
    process.stdout.write(`report: wrote ${outPath}\n`);

    process.stdout.write(
      `overall: ${totalCorrect}/${totalMapped} correct ` +
        `(${overallAccuracy === null ? 'n/a' : overallAccuracy.toFixed(2) + '%'}), ` +
        `target ${ACCURACY_TARGET}% - ${overallAccuracy !== null && overallAccuracy >= ACCURACY_TARGET ? 'met' : 'not met'}\n`,
    );
    return 0;
  } finally {
    try {
      await trial.$disconnect();
    } finally {
      try {
        await dropTrialSchema(base, schema);
      } catch {
        // The schema is throwaway; leftover rows on it are harmless and are
        // reported by the next run's CREATE SCHEMA check only if named again.
      } finally {
        await base.$disconnect();
      }
    }
  }
}

function ms(millis: number): string {
  return `${millis < 10 ? millis.toFixed(1) : millis.toFixed(0)} ms`;
}

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`trial-run failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });