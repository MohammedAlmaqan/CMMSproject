import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { api, authHeaders, ctx } from '../helpers.js';

/**
 * Row 59, the export route. These exercise the real handler through the real
 * route (authentication, filter parsing, xlsx serialisation) rather than
 * calling a builder directly, because the promise is that the *endpoint*
 * exports every report.
 */

const reportKeys = [
  'backlog', 'pm-compliance', 'mtbf', 'mttr', 'cost-summary', 'downtime', 'material-consumption',
  'backlog-hours-by-work-center', 'top-cost-equipment', 'notifications-awaiting-conversion',
];

function binaryParser(res: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

function download(path: string, token: string) {
  return api()
    .get(path)
    .set(authHeaders(token))
    .buffer(true)
    .parse(binaryParser as never);
}

function readZip(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, Buffer.from(method === 8 ? inflateRawSync(raw) : raw));
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe('report export route (row 59)', () => {
  it('rejects a request without a token with 401', async () => {
    const res = await api().get('/api/reports/backlog/export.xlsx');
    expect(res.status).toBe(401);
  });

  it('returns 404 and the available keys for an unknown report', async () => {
    const res = await api().get('/api/reports/not-a-report/export.xlsx').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(404);
    expect(res.body.available).toEqual(expect.arrayContaining(reportKeys));
  });

  it('serves an .xlsx for every report', async () => {
    for (const key of reportKeys) {
      const res = await download(`/api/reports/${key}/export.xlsx`, ctx.adminToken);
      expect(res.status, `export ${key}`).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(res.headers['content-disposition']).toBe(`attachment; filename="${key}-report.xlsx"`);
      expect(Buffer.isBuffer(res.body), `${key} body is binary`).toBe(true);
      expect(res.body.subarray(0, 4).toString('latin1'), `${key} is a zip`).toBe('PK\u0003\u0004');
    }
  });

  it('applies the same filters as the JSON route, and rejects a bad one the same way', async () => {
    const ok = await download('/api/reports/pm-compliance/export.xlsx?year=2026&month=3', ctx.adminToken);
    expect(ok.status).toBe(200);

    const bad = await api()
      .get('/api/reports/pm-compliance/export.xlsx?month=13')
      .set(authHeaders(ctx.adminToken));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid report filter');
  });

  it('writes the report breakdowns as named worksheets', async () => {
    const res = await download('/api/reports/backlog/export.xlsx', ctx.adminToken);
    const entries = readZip(res.body as Buffer);
    const workbook = entries.get('xl/workbook.xml')!.toString('utf8');
    expect(workbook).toContain('name="By Status"');
    expect(workbook).toContain('name="By Priority"');
    expect(workbook).toContain('name="By Work Center"');
  });

  it('writes a Summary sheet for a report with scalar figures', async () => {
    const res = await download('/api/reports/pm-compliance/export.xlsx', ctx.adminToken);
    const workbook = readZip(res.body as Buffer).get('xl/workbook.xml')!.toString('utf8');
    expect(workbook).toContain('name="Summary"');
  });
});
