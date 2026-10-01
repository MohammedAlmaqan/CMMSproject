import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../src/utils/prisma.js';

/**
 * R.9 D3. Proves a gate run leaves the live database as it found it.
 *
 *   node scripts/r9d-db-invariance.ts snapshot <file>
 *   node scripts/r9d-db-invariance.ts check    <file>
 *
 * The claim is made over primary keys, not over `isDeleted`. A soft-deleted
 * row is still a row: seed.ts only wipes when SEED_DEMO=1, so the suite is
 * running against a database nothing prunes, and residue from a soft-delete
 * accumulates exactly like residue from a forgotten row. Excluding isDeleted
 * rows from the comparison would make the check pass on the precise failure
 * mode it exists to catch.
 *
 * Both directions are reported. Rows that appeared are residue the suite left
 * behind; rows that vanished are rows the suite destroyed, which is worse and
 * just as invisible. Primary keys only - the suite is entitled to edit a row
 * that was already there, so this says nothing about content mutation.
 *
 * Table and primary-key discovery is done through information_schema rather
 * than a hardcoded list, so a new table is covered the day it is added instead
 * of the day someone remembers this file.
 */

type Keyed = Record<string, string[]>;

interface Baseline {
  takenAt: string;
  keys: Keyed;
}

async function primaryKeys(): Promise<Keyed> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    // The migration table is the gate's own bookkeeping, not product data.
    if (r.table_name === '_prisma_migrations') continue;
    byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), r.column_name]);
  }

  const out: Keyed = {};
  for (const [table, cols] of byTable) {
    const list = cols.map((c) => `"${c}"`).join(', ');
    const rowsOut = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${list} FROM "${table}"`);
    out[table] = rowsOut.map((r) => cols.map((c) => String(r[c])).join('|'));
  }
  return out;
}

function diff(before: Keyed, after: Keyed): { added: [string, string[]][]; removed: [string, string[]][] } {
  const added: [string, string[]][] = [];
  const removed: [string, string[]][] = [];
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = new Set(before[table] ?? []);
    const a = after[table] ?? [];
    const newRows = a.filter((k) => !b.has(k));
    const goneRows = [...b].filter((k) => !new Set(a).has(k));
    if (newRows.length) added.push([table, newRows]);
    if (goneRows.length) removed.push([table, goneRows]);
  }
  return { added, removed };
}

async function main(): Promise<void> {
  const [mode, file] = process.argv.slice(2);
  if (!mode || !file) {
    console.error('usage: r9d-db-invariance.ts <snapshot|check> <file>');
    process.exitCode = 2;
    return;
  }

  const keys = await primaryKeys();

  if (mode === 'snapshot') {
    const total = Object.values(keys).reduce((n, v) => n + v.length, 0);
    writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), keys } satisfies Baseline, null, 0), 'utf8');
    console.log(`snapshot written to ${file}`);
    console.log(`  ${Object.keys(keys).length} tables, ${total} rows`);
    return;
  }

  if (mode !== 'check') {
    console.error(`unknown mode: ${mode}`);
    process.exitCode = 2;
    return;
  }

  const base = JSON.parse(readFileSync(file, 'utf8')) as Baseline;
  const { added, removed } = diff(base.keys, keys);

  console.log(`baseline taken ${base.takenAt}`);
  console.log(`checked now   ${new Date().toISOString()}\n`);

  if (added.length === 0 && removed.length === 0) {
    console.log('PASS  the database holds exactly the same rows it did before the run');
    return;
  }

  if (added.length > 0) {
    console.log(`FAIL  ${added.reduce((n, [, v]) => n + v.length, 0)} row(s) the run left behind:\n`);
    for (const [table, rows] of added) {
      console.log(`  ${table}  +${rows.length}`);
      for (const r of rows.slice(0, 12)) console.log(`      ${r}`);
      if (rows.length > 12) console.log(`      ... and ${rows.length - 12} more`);
    }
  }

  if (removed.length > 0) {
    console.log(`\nFAIL  ${removed.reduce((n, [, v]) => n + v.length, 0)} pre-existing row(s) the run destroyed:\n`);
    for (const [table, rows] of removed) {
      console.log(`  ${table}  -${rows.length}`);
      for (const r of rows.slice(0, 12)) console.log(`      ${r}`);
      if (rows.length > 12) console.log(`      ... and ${rows.length - 12} more`);
    }
  }

  console.log('\nA soft-deleted row counts as left behind. The fix is to hard-delete the fixture, not to exclude it here.');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());