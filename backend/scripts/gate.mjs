#!/usr/bin/env node
/**
 * The gate CI runs, runnable locally.
 *
 * Why this exists. `npm run test:unit` runs only tests/unit, which needs no
 * database, no JWT secret and no .env. It is fast and it is genuinely useful,
 * and for several phases it was the *only* thing run locally. That is how
 * sixteen consecutive red CI runs went unnoticed: the local subset was green
 * the whole time, and the DB-backed suite that CI actually exercises was never
 * executed on a developer machine.
 *
 * A gate you can silently run a subset of is not a gate. This script runs every
 * step CI runs, and the database step is not optional by accident: if no
 * database is reachable it exits non-zero and says so, rather than reporting a
 * green that covered less than CI does.
 *
 * Override: SKIP_DB_TESTS=1 runs the database-free steps only and labels the
 * result as partial. That is for the case where you knowingly cannot get a
 * database; the point is that the output then cannot be mistaken for full.
 *
 * This script never prints DATABASE_URL or any part of a connection string.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => path.join(backend, 'node_modules', '.bin', name + (process.platform === 'win32' ? '.cmd' : ''));

let failed = 0;
const run = (label, cmd, args) => {
  process.stdout.write(`\n=== ${label} ===\n`);
  // On Windows these are .cmd shims, which Node can only start through a shell,
  // and the project path contains a space, so the executable must be quoted or
  // the shell splits it. Quoting an already-quoted string is harmless here.
  const line = process.platform === 'win32' ? `"${cmd}" ${args.join(' ')}` : [cmd, ...args].join(' ');
  const r = spawnSync(line, { cwd: backend, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    failed += 1;
    process.stdout.write(`--- ${label}: FAILED (exit ${r.status})\n`);
  }
  return r.status === 0;
};

/** Read one key out of backend/.env without ever printing the file. */
function envValue(key) {
  if (process.env[key] !== undefined) return process.env[key];
  const p = path.join(backend, '.env');
  if (!existsSync(p)) return undefined;
  const text = readFileSync(p, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === key) {
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return undefined;
}

/** TCP reachability only. Reports host and port, never credentials. */
function probeDatabase() {
  const url = envValue('DATABASE_URL');
  if (!url) return { ok: false, reason: 'DATABASE_URL is not set and backend/.env does not provide one' };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a parseable URL' };
  }
  const host = parsed.hostname || 'localhost';
  const port = Number(parsed.port || 5432);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok, reason) => {
      socket.destroy();
      resolve({ ok, host, port, reason });
    };
    socket.setTimeout(3000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, `no TCP response on ${host}:${port}`));
    socket.once('error', (e) => done(false, `${host}:${port} refused (${e.code || e.message})`));
    socket.connect(port, host);
  });
}

const skipDb = process.env.SKIP_DB_TESTS === '1';

run('Backend typecheck', bin('tsc'), ['-b']);

process.stdout.write('\n=== Lint baseline (CI threshold: 50) ===\n');
{
  // Quoted for the same reason as run(): the shim sits under a path with a space.
  const lintLine = process.platform === 'win32'
    ? `"${bin('eslint')}" src tests --format json`
    : [bin('eslint'), 'src', 'tests', '--format', 'json'].join(' ');
  const r = spawnSync(lintLine, {
    cwd: backend,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const start = (r.stdout ?? '').indexOf('[');
  if (start === -1) {
    process.stdout.write('could not read an eslint JSON report; treating as failure\n');
    failed += 1;
  } else {
    const report = JSON.parse(r.stdout.slice(start));
    const count = report.reduce((n, f) => n + f.errorCount, 0);
    process.stdout.write(`ESLINT_ERRORS=${count}\n`);
    if (count > 50) {
      process.stdout.write('over the 50 baseline that CI enforces. Fix the errors; do not raise the baseline.\n');
      failed += 1;
    }
  }
}

run('Database-free unit suite', bin('vitest'), ['run', '--config', 'vitest.unit.config.ts']);

if (skipDb) {
  // Checked before probing, so that opting out never contacts a database at all.
  process.stdout.write(`\n=== DB-backed integration suite: SKIPPED BY REQUEST ===\n`);
  process.stdout.write('SKIP_DB_TESTS=1 was set, so no database was contacted and nothing was modified.\n');
  process.stdout.write('PARTIAL GATE. This is NOT equivalent to CI and must not be reported as green.\n');
} else {
  const probe = await probeDatabase();
  if (!probe.ok) {
    process.stdout.write(`\n=== DB-backed integration suite: CANNOT RUN ===\n`);
    process.stdout.write(`No reachable database: ${probe.reason}\n\n`);
    process.stdout.write('CI runs the DB-backed suite and will. A green result from this script\n');
    process.stdout.write('without it does not mean CI will be green -- that gap is exactly how 16\n');
    process.stdout.write('consecutive red runs were missed. To get a full local gate, point\n');
    process.stdout.write('DATABASE_URL at a migrated, seeded PostgreSQL you are authorised to use.\n');
    process.stdout.write('To proceed knowingly without one, re-run with SKIP_DB_TESTS=1.\n');
    failed += 1;
  } else if (process.env.GATE_ALLOW_DB === '1') {
    // Explicit, informed opt-in. Only then does anything get written.
    process.stdout.write(`\n=== database reachable on ${probe.host}:${probe.port} (GATE_ALLOW_DB=1) ===\n`);
    const migrated = run('Apply migrations', bin('prisma'), ['migrate', 'deploy']);
    if (migrated) {
      run('Seed test data', bin('tsx'), ['prisma/seed.ts']);
      run('DB-backed integration suite', bin('vitest'), ['run']);
    } else {
      process.stdout.write('migrations did not apply; skipping the seed and the suite\n');
      failed += 1;
    }
  } else if (probe.host === 'localhost' || probe.host === '127.0.0.1') {
    // A reachable local database is not automatically a database this gate may
    // modify. `prisma/seed.ts` deletes most of the schema before inserting, and
    // the integration suite writes and deletes rows, so running either against a
    // developer's real instance destroys their data. Nothing destructive happens
    // here without an explicit opt-in naming that you accept the destruction.
    process.stdout.write(`\n=== database reachable on ${probe.host}:${probe.port} ===\n`);
    process.stdout.write('This is a local database. Refusing to touch it without GATE_ALLOW_DB=1,\n');
    process.stdout.write('because prisma/seed.ts deleteMany()s most of the schema and the\n');
    process.stdout.write('integration suite writes to it. Either:\n');
    process.stdout.write('  - point DATABASE_URL at a throwaway database you are happy to lose, and\n');
    process.stdout.write('    re-run with GATE_ALLOW_DB=1; or\n');
    process.stdout.write('  - re-run with SKIP_DB_TESTS=1 and treat the result as PARTIAL.\n');
    failed += 1;
  } else {
    process.stdout.write(`\n=== database reachable on ${probe.host}:${probe.port} (remote) ===\n`);
    process.stdout.write('Refusing to migrate or seed a remote host automatically. Provision and seed it\n');
    process.stdout.write('yourself, then re-run with GATE_ALLOW_DB=1 to execute the suite against it.\n');
    failed += 1;
  }
}

process.stdout.write('\n========================================\n');
if (failed > 0) {
  process.stdout.write(`GATE FAILED (${failed} step(s))\n`);
  process.exit(1);
}
process.stdout.write(skipDb
  ? 'GATE PASSED (database-free steps only -- PARTIAL, not equivalent to CI)\n'
  : 'GATE PASSED (all steps, equivalent to CI)\n');
