/** RFC 4180 CSV parsing for the *.filled.csv sample files. */

export interface TrialCsvRow {
  /** 1-based position of the row within the CSV data (the header is row 0). */
  number: number;
  cells: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  rows: TrialCsvRow[];
}

/**
 * Minimal RFC 4180 reader.
 *
 * - Fields are bare or double-quoted; a quote inside a quoted field is written
 *   as "" and is unescaped here.
 * - Commas and CR/LF are content inside a quoted field, so a description like
 *   "T-401-TANK, PROCESS" or a material note containing a double quote survives.
 * - Record terminators are CRLF, LF or CR.
 * - Blank lines between records are skipped.
 * - A data record with a field count different from the header is a hard error:
 *   the sample files are machine-generated, so a mismatch means malformed
 *   quoting (or a lost column) that must not be absorbed silently.
 */
export function parseCsv(text: string): ParsedCsv {
  const headers: string[] = [];
  const data: Array<{ cells: string[]; row: number }> = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let line = 1;

  const pushField = (): void => {
    record.push(field);
    field = '';
  };

  const endRecord = (): void => {
    pushField();
    const blankLine = record.length === 1 && record[0] === '';
    if (!blankLine) {
      if (headers.length === 0) {
        headers.push(...record);
      } else {
        data.push({ cells: record, row: data.length + 1 });
      }
    }
    record = [];
    line += 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      endRecord();
    } else if (ch === '\r') {
      endRecord();
      if (text[i + 1] === '\n') i += 1;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error(`unterminated quoted field (line ${line})`);
  if (field !== '' || record.length > 0) endRecord();

  const width = headers.length;
  const rows: TrialCsvRow[] = data.map(({ cells, row }) => {
    if (cells.length !== width) {
      throw new Error(
        `row ${row}: expected ${width} fields (${headers.join(', ')}), got ${cells.length}`,
      );
    }
    const cellsByHeader: Record<string, string> = {};
    for (let j = 0; j < width; j += 1) cellsByHeader[headers[j]] = cells[j] ?? '';
    return { number: row, cells: cellsByHeader };
  });

  return { headers, rows };
}