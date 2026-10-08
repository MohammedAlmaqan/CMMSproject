/** Environment access for the trial runner. Never prints a connection string. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read one key out of backend/.env (or the process env) without printing it. */
export function envValue(key: string): string | undefined {
  if (process.env[key] !== undefined) return process.env[key];
  const p = path.join(backendDir, '.env');
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

/** Safe description of a connection: protocol + host + port + database name,
 * never the credentials. */
export function safeHost(dbUrl: string): { host: string; port: number } {
  const parsed = new URL(dbUrl);
  return { host: parsed.hostname || 'localhost', port: Number(parsed.port || 5432) };
}