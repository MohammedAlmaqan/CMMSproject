import type { XlsxCell, XlsxSheet } from './xlsx.js';

/**
 * Row 59's second half: turn a report's own JSON into a workbook.
 *
 * The mapper is deliberately generic. Every report handler already returns
 * either an array of rows or an object of named breakdowns plus scalars, so the
 * export reads that shape rather than carrying ten hand-written column lists
 * that would drift the moment a handler changed. A breakdown array becomes a
 * sheet; a scalar (a period, a rate, an exclusion note) becomes a row on a
 * `Summary` sheet, so nothing the JSON report states is silently dropped from
 * the file. This is why the export route can be a thin wrapper over the same
 * handler that serves the screen.
 */

export interface ReportWorkbook {
  filename: string;
  sheets: XlsxSheet[];
}

const REPORT_TITLES: Record<string, string> = {
  backlog: 'Work Order Backlog',
  'pm-compliance': 'PM Compliance',
  mtbf: 'MTBF',
  mttr: 'MTTR',
  'cost-summary': 'Cost Summary',
  downtime: 'Equipment Downtime',
  'material-consumption': 'Material Consumption',
  'backlog-hours-by-work-center': 'Backlog Hours by Work Center',
  'top-cost-equipment': 'Top Cost Equipment',
  'notifications-awaiting-conversion': 'Notifications Awaiting Conversion',
};

function reportTitle(reportKey: string): string {
  return REPORT_TITLES[reportKey] ?? reportKey;
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (ch) => ch.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarCell(value: unknown): XlsxCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function rowsToSheet(name: string, rows: Array<Record<string, unknown>>): XlsxSheet {
  const header: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!header.includes(key)) header.push(key);
    }
  }
  return {
    name,
    header,
    rows: rows.map((row) => header.map((key) => scalarCell(row[key]))),
  };
}

export function reportToWorkbook(reportKey: string, body: unknown): ReportWorkbook {
  const sheets: XlsxSheet[] = [];

  if (Array.isArray(body)) {
    sheets.push(rowsToSheet(reportTitle(reportKey), body.filter(isPlainObject)));
  } else if (isPlainObject(body)) {
    const summary: XlsxCell[][] = [];
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) {
        if (value.length > 0 && !isPlainObject(value[0])) {
          sheets.push({ name: humanize(key), header: [humanize(key)], rows: value.map((v) => [scalarCell(v)]) });
        } else {
          sheets.push(rowsToSheet(humanize(key), value.filter(isPlainObject)));
        }
      } else {
        summary.push([humanize(key), scalarCell(value)]);
      }
    }
    if (summary.length > 0) {
      sheets.unshift({ name: 'Summary', header: ['Field', 'Value'], rows: summary });
    }
  } else if (body !== undefined) {
    sheets.push({ name: reportTitle(reportKey), header: ['Value'], rows: [[scalarCell(body)]] });
  }

  if (sheets.length === 0) {
    sheets.push({ name: reportTitle(reportKey), header: [], rows: [] });
  }

  return { filename: `${reportKey}-report.xlsx`, sheets };
}
