/**
 * OpenAPI snapshot exporter and drift check.
 *
 * `docs/openapi.json` is a checked-in snapshot of the live `/api-docs.json`.
 * It rots silently: every route added without a refresh leaves the snapshot
 * blaming an older API, and nothing fails. This script closes that loop.
 *
 *   npx tsx scripts/openapi.ts --write    # re-export docs/openapi.json
 *   npx tsx scripts/openapi.ts            # check the snapshot against source
 *
 * Both modes build the spec from the SAME module the server serves it from
 * (src/openapi.ts), so the snapshot cannot describe a different document than
 * the API. `scripts/verify/verify_openapi.py` is the gate wrapper.
 *
 * Run with `backend/` as the working directory (the spec's route glob is
 * cwd-relative, exactly as it is for the server).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const snapshotPath = path.join(repoRoot, 'docs', 'openapi.json');

// The checked-in snapshot is always the document served on the documented
// local port. Pinning it here keeps the check deterministic when the ambient
// environment sets PORT for something else.
process.env.PORT = '4000';

const { swaggerSpec } = await import('../src/openapi.js');

type Json = Record<string, unknown>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function operations(spec: Json): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const paths = (spec.paths ?? {}) as Record<string, Json>;
  for (const [p, item] of Object.entries(paths)) {
    for (const m of Object.keys(item)) {
      if (METHODS.includes(m)) out.set(`${m.toUpperCase()} ${p}`, item[m]);
    }
  }
  return out;
}

function pathCount(spec: Json): number {
  return Object.keys((spec.paths ?? {}) as Json).length;
}

// Order-insensitive deep comparison: objects compare by key set, arrays by
// index. Returns a list of human-readable differences (empty == equal).
function diff(live: unknown, snap: unknown, at = '$'): string[] {
  if (live === snap) return [];
  if (live === null || snap === null || typeof live !== 'object' || typeof snap !== 'object') {
    return [`${at}: ${JSON.stringify(live)} != ${JSON.stringify(snap)}`];
  }
  if (Array.isArray(live) || Array.isArray(snap)) {
    if (!Array.isArray(live) || !Array.isArray(snap)) return [`${at}: array/object mismatch`];
    if (live.length !== snap.length) at = `${at} (length ${live.length} != ${snap.length})`;
    const out: string[] = [];
    for (let i = 0; i < Math.max(live.length, snap.length); i++) out.push(...diff(live[i], snap[i], `${at}[${i}]`));
    return out;
  }
  const a = live as Json;
  const b = snap as Json;
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a)) out.push(`${at}.${k}: only in snapshot`);
    else if (!(k in b)) out.push(`${at}.${k}: only in source`);
    else out.push(...diff(a[k], b[k], `${at}.${k}`));
  }
  return out;
}

const write = process.argv.includes('--write');

if (write) {
  fs.writeFileSync(snapshotPath, JSON.stringify(swaggerSpec, null, 2) + '\n');
  const ops = operations(swaggerSpec as Json);
  console.log(`OPENAPI_WRITE OK | wrote ${snapshotPath}`);
  console.log(`  ${ops.size} operations across ${pathCount(swaggerSpec as Json)} paths`);
  process.exit(0);
}

let snapshot: Json;
try {
  snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Json;
} catch (err) {
  console.log(`OPENAPI_CHECK FAIL | cannot read ${snapshotPath}: ${(err as Error).message}`);
  process.exit(1);
}

const live = operations(swaggerSpec as Json);
const snap = operations(snapshot);
const differences = diff(swaggerSpec, snapshot);
const added = [...live.keys()].filter((k) => !snap.has(k));
const removed = [...snap.keys()].filter((k) => !live.has(k));

if (added.length === 0 && removed.length === 0 && differences.length === 0) {
  console.log(`OPENAPI_CHECK PASS | ${live.size} operations across ${pathCount(swaggerSpec as Json)} paths match docs/openapi.json`);
  process.exit(0);
}

console.log(
  `OPENAPI_CHECK FAIL | source ${live.size} ops / ${pathCount(swaggerSpec as Json)} paths` +
    ` vs snapshot ${snap.size} ops / ${pathCount(snapshot)} paths`,
);
for (const k of added) console.log(`  + ${k}`);
for (const k of removed) console.log(`  - ${k}`);
for (const d of differences.slice(0, 40)) console.log(`  ~ ${d}`);
if (differences.length > 40) console.log(`  ... ${differences.length - 40} more differences`);
console.log('  re-export with: npx tsx scripts/openapi.ts --write');
process.exit(1);
