import { deflateRawSync } from 'node:zlib';

/**
 * A minimal, dependency-free `.xlsx` writer.
 *
 * Row 59 asks for reports exportable to Excel. The repository holds no xlsx
 * library and this module exists rather than adding one: the format needed is a
 * single read-only sheet set, and the whole of it is the OOXML package below,
 * which is small enough to read in one sitting and to test with an independent
 * parser (`scripts/verify/verify_r5.py` opens the output with openpyxl).
 *
 * An `.xlsx` is a ZIP of XML parts. This writes the parts, then the ZIP, with
 * no compression library beyond `node:zlib`. Strings are inline (`t="inlineStr"`)
 * rather than shared, which removes the shared-string table entirely. Because a
 * value is only a formula if a cell is `<f>`, and this writer never emits one,
 * a value of `=SUM(A1)` is stored as literal text and cannot be evaluated on
 * open - the xlsx equivalent of the CSV injection guard.
 */

export type XlsxCell = string | number | boolean | null | undefined;

export interface XlsxSheet {
  name: string;
  header?: string[];
  rows: XlsxCell[][];
  /** Optional per-column width in characters; defaults to 18. */
  columnWidths?: number[];
}

/** Excel's hard limit on characters in one cell. */
const MAX_CELL_CHARS = 32767;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch] as string)
  );
}

/**
 * XML 1.0 forbids most C0 control characters outright, so a value carrying one
 * produces a file Excel refuses to open. They are stripped rather than escaped,
 * because there is no escape for a character the grammar does not admit.
 */
function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, MAX_CELL_CHARS);
}

/** 0-based column index to spreadsheet letters: 0 -> A, 26 -> AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellXml(ref: string, value: XlsxCell, style: number | null): string {
  if (value === null || value === undefined) return '';
  const styleAttr = style === null ? '' : ` s="${style}"`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = sanitizeText(String(value));
  if (text === '') return `<c r="${ref}"${styleAttr}/>`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function worksheetXml(sheet: XlsxSheet): string {
  const header = sheet.header ?? [];
  const widths = sheet.columnWidths ?? [];
  const columnCount = Math.max(
    header.length,
    widths.length,
    ...sheet.rows.map((row) => row.length),
    0
  );

  const cols =
    columnCount > 0
      ? `<cols>${Array.from(
          { length: columnCount },
          (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 18}" customWidth="1"/>`
        ).join('')}</cols>`
      : '';

  const rows: string[] = [];
  let rowNumber = 1;
  if (header.length > 0) {
    const cells = header
      .map((value, i) => cellXml(`${columnName(i)}${rowNumber}`, value, 1))
      .join('');
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
    rowNumber += 1;
  }
  for (const row of sheet.rows) {
    const cells = row.map((value, i) => cellXml(`${columnName(i)}${rowNumber}`, value, null)).join('');
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
    rowNumber += 1;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

function contentTypes(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

const CREATED_ISO = '2020-01-01T00:00:00Z';

function coreProps(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>CMMS</dc:creator><cp:lastModifiedBy>CMMS</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${CREATED_ISO}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${CREATED_ISO}</dcterms:modified></cp:coreProperties>`;
}

function appProps(sheetNames: string[]): string {
  const titles = sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>CMMS</Application><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts></Properties>`;
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(sheetCount: number): string {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

/** Two fonts (regular, bold) so the header row is distinguishable; otherwise bare. */
function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

const INVALID_SHEET_CHARS = /[\[\]:*?/\\]/g;

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(INVALID_SHEET_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function zip(entries: ZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const dosTime = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, end]);
}

export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  if (sheets.length === 0) {
    throw new Error('buildXlsx requires at least one sheet');
  }
  const used = new Set<string>();
  const named = sheets.map((sheet) => ({ sheet, safeName: sanitizeSheetName(sheet.name, used) }));

  const parts: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes(named.length), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels(), 'utf8') },
    { name: 'docProps/core.xml', data: Buffer.from(coreProps(), 'utf8') },
    { name: 'docProps/app.xml', data: Buffer.from(appProps(named.map((n) => n.safeName)), 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(named.map((n) => n.safeName)), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(named.length), 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml(), 'utf8') },
  ];
  named.forEach((n, i) => {
    parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(worksheetXml(n.sheet), 'utf8') });
  });

  return zip(parts);
}

export { XLSX_MIME };
