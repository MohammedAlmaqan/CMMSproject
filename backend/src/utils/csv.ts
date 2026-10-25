// CSV serialisation, plus the row-shaped error the import routes share (3.3).
// Parsing lives in migration-trial/importers/csv.ts: the accuracy trial and the
// live import routes must read a file the same way, so there is one parser.

export class CsvRowError extends Error {
  row: number;
  reason: string;
  constructor(row: number, reason: string) {
    super(`Row ${row}: ${reason}`);
    this.name = 'CsvRowError';
    this.row = row;
    this.reason = reason;
  }
}

export function escapeCsvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
}