// Companion fixture for scripts/verify/verify_r5.py.
//
// verify_r5.py opens every workbook in its target folder with openpyxl, an
// independent parser, and additionally checks a purpose-built `_values.xlsx`
// probe so the writer's value rules are proven rather than assumed. This file
// is that probe's generator: it writes the workbook through the app's own
// writer (backend/src/utils/xlsx.ts), so the probe exercises the same code path
// reports use.
//
// Usage: npx tsx scripts/verify/make_r5_probe.ts <folder>
// The probe cells are the addresses verify_r5.py reads: A2 "=1+1",
// A3 XML metacharacters, A4 a stripped control character, B2 42, B3 3.5,
// C2 true.

import { buildXlsx } from '../../backend/src/utils/xlsx.ts';
import { writeFileSync } from 'fs';
import { join } from 'path';

const folder = process.argv[2];
if (!folder) {
  console.error('usage: make_r5_probe.ts <folder>');
  process.exit(2);
}

const buf = buildXlsx([
  {
    name: 'Probe',
    header: ['A', 'B', 'C'],
    rows: [
      ['=1+1', 42, true],
      ['<b>x</b> & "y"', 3.5],
      ['a\u0001b'],
    ],
  },
]);

writeFileSync(join(folder, '_values.xlsx'), buf);
console.log(`wrote ${join(folder, '_values.xlsx')}`);
