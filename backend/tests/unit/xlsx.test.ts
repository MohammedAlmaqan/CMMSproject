import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { buildXlsx, columnName } from '../../src/utils/xlsx.js';
import { reportToWorkbook } from '../../src/utils/reportWorkbook.js';

/** Minimal reader for the ZIPs this writer produces (stored local headers, deflate). */
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

function sheetXml(buffer: Buffer, index = 1): string {
  return readZip(buffer).get(`xl/worksheets/sheet${index}.xml`)!.toString('utf8');
}

describe('xlsx writer', () => {
  it('produces a ZIP whose first bytes are the local file header magic', () => {
    const buffer = buildXlsx([{ name: 'Sheet', header: ['a'], rows: [[1]] }]);
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
  });

  it('writes the parts Excel requires', () => {
    const buffer = buildXlsx([{ name: 'Sheet', header: ['a'], rows: [[1]] }]);
    const names = [...readZip(buffer).keys()];
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      expect(names, `missing ${part}`).toContain(part);
    }
  });

  it('stores numbers as numeric cells and text as inline strings', () => {
    const buffer = buildXlsx([{ name: 'Sheet', rows: [['hello', 42, 3.5, true, null]] }]);
    const xml = sheetXml(buffer);
    expect(xml).toContain('t="inlineStr"><is><t xml:space="preserve">hello</t></is></c>');
    expect(xml).toMatch(/<c r="B1"><v>42<\/v><\/c>/);
    expect(xml).toMatch(/<c r="C1"><v>3.5<\/v><\/c>/);
    expect(xml).toMatch(/<c r="D1" t="b"><v>1<\/v><\/c>/);
    expect(xml).not.toContain('<c r="E1"');
  });

  it('escapes XML metacharacters in text', () => {
    const buffer = buildXlsx([{ name: 'Sheet', rows: [['<a & b> "q"']] }]);
    const xml = sheetXml(buffer);
    expect(xml).toContain('&lt;a &amp; b&gt; &quot;q&quot;');
    expect(xml).not.toContain('<a & b>');
  });

  it('stores a formula-looking string as literal text, never as a formula', () => {
    const buffer = buildXlsx([{ name: 'Sheet', rows: [['=SUM(A1:A9)'], ['+1'], ['@cmd']] }]);
    const xml = sheetXml(buffer);
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('t="inlineStr"');
    expect(xml).toContain('=SUM(A1:A9)');
  });

  it('strips control characters XML forbids', () => {
    const buffer = buildXlsx([{ name: 'Sheet', rows: [['a\u0007b']] }]);
    expect(sheetXml(buffer)).toContain('ab');
  });

  it('writes one worksheet per sheet and lists them in the workbook', () => {
    const buffer = buildXlsx([
      { name: 'First', rows: [[1]] },
      { name: 'Second', rows: [[2]] },
    ]);
    const parts = [...readZip(buffer).keys()];
    expect(parts).toContain('xl/worksheets/sheet1.xml');
    expect(parts).toContain('xl/worksheets/sheet2.xml');
    const workbook = readZip(buffer).get('xl/workbook.xml')!.toString('utf8');
    expect(workbook).toContain('name="First"');
    expect(workbook).toContain('name="Second"');
  });

  it('sanitizes invalid and duplicate sheet names', () => {
    const buffer = buildXlsx([
      { name: 'a/b:c', rows: [[1]] },
      { name: 'a/b:c', rows: [[2]] },
    ]);
    const workbook = readZip(buffer).get('xl/workbook.xml')!.toString('utf8');
    expect(workbook).not.toContain('a/b:c');
    expect(workbook).toContain('name="a b c"');
    expect(workbook).toContain('name="a b c (2)"');
  });

  it('numbers columns correctly past Z', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(51)).toBe('AZ');
    expect(columnName(52)).toBe('BA');
  });

  it('refuses an empty workbook', () => {
    expect(() => buildXlsx([])).toThrow();
  });
});

describe('reportToWorkbook', () => {
  it('puts scalar fields on a Summary sheet and each breakdown on its own sheet', () => {
    const workbook = reportToWorkbook('cost-summary', {
      period: '2026-03',
      budgetNote: 'budget waived',
      byCostCenter: [{ costCenterCode: 'C1', plannedCost: 10, actualCost: 8 }],
      byLocation: [{ locationCode: 'L1', plannedCost: 10, actualCost: 8 }],
    });
    expect(workbook.filename).toBe('cost-summary-report.xlsx');
    expect(workbook.sheets.map((s) => s.name)).toEqual(['Summary', 'By Cost Center', 'By Location']);
    expect(workbook.sheets[0].rows).toEqual([
      ['Period', '2026-03'],
      ['Budget Note', 'budget waived'],
    ]);
    expect(workbook.sheets[1].header).toEqual(['costCenterCode', 'plannedCost', 'actualCost']);
    expect(workbook.sheets[1].rows).toEqual([['C1', 10, 8]]);
  });

  it('uses the report title for a top-level array', () => {
    const workbook = reportToWorkbook('mtbf', [{ equipmentId: 'E1', mtbfHours: 12 }]);
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0].name).toBe('MTBF');
    expect(workbook.sheets[0].header).toEqual(['equipmentId', 'mtbfHours']);
  });

  it('unions columns across rows with differing keys', () => {
    const workbook = reportToWorkbook('backlog', {
      byStatus: [{ status: 'Open', count: 1 }],
    });
    expect(workbook.sheets[0].name).toBe('By Status');
    expect(workbook.sheets[0].header).toEqual(['status', 'count']);
  });

  it('still returns one sheet when the body is empty or scalar', () => {
    expect(reportToWorkbook('backlog', {}).sheets).toHaveLength(1);
    expect(reportToWorkbook('backlog', 5).sheets).toHaveLength(1);
  });
});
