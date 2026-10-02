import '../tests/load-env.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';
import { reportHandlers } from '../src/routes/reports.js';
import { createCaptureResponse } from '../src/utils/captureJsonResponse.js';
import { reportToWorkbook } from '../src/utils/reportWorkbook.js';
import { buildXlsx } from '../src/utils/xlsx.js';
import { prisma } from '../src/utils/prisma.js';

/**
 * R.5 verification. Row 59 of SOW 3.7.1, the Excel limb.
 *
 * Writes one workbook per report by running the *same handlers the API runs*,
 * then hands the directory to `scripts/verify/verify_r5.py`, which opens every
 * file with openpyxl - a parser this repository does not own. "It is a valid
 * xlsx" is therefore a claim made by an independent reader, not by the writer
 * checking its own homework.
 *
 * If the database is unreachable each report falls back to a representative
 * synthetic body, and the run says so per report; the format checks still hold,
 * only the data's provenance changes.
 *
 *   npx tsx scripts/r5-xlsx-verify.ts
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-xlsx-'));

const SYNTHETIC: Record<string, unknown> = {
  backlog: {
    byStatus: [{ status: 'Open', count: 1, totalPlannedHours: 2.5 }],
    byPriority: [{ priority: 'High', count: 1, totalPlannedHours: 2.5 }],
    byWorkCenter: [
      { workCenterId: 'W1', workCenterCode: 'WC1', workCenterName: 'Line', count: 1, totalPlannedHours: 2.5 },
    ],
  },
  'pm-compliance': {
    period: '2026-03',
    scheduledPM: 2,
    completedPM: 1,
    complianceRate: 50,
    excludedMeterPlans: 0,
    exclusionNote: 'no meter plans',
  },
  mtbf: [{ equipmentId: 'E1', mtbfHours: 100 }],
  mttr: {
    byEquipment: [{ equipmentId: 'E1', mttrHours: 1.5, breakdownCount: 2 }],
    byLocation: [
      { functionalLocationId: 'L1', locationCode: 'LOC1', description: 'Line', mttrHours: 1.5, breakdownCount: 2 },
    ],
    excludedIncomplete: 0,
  },
  'cost-summary': {
    period: '2026-03',
    budgetNote: 'budget waived under D-13',
    byCostCenter: [
      { costCenterCode: 'C1', plannedCost: 10, actualCost: 8, variance: 2, workOrderCount: 1 },
    ],
    byLocation: [
      {
        functionalLocationId: 'L1',
        locationCode: 'LOC1',
        description: 'Line',
        plannedCost: 10,
        actualCost: 8,
        variance: 2,
        workOrderCount: 1,
      },
    ],
  },
  downtime: [{ equipmentId: 'E1', totalDowntimeHours: 1.5 }],
  'material-consumption': {
    byMaterial: [
      {
        materialId: 'M1',
        materialCode: 'MAT1',
        description: 'Bolt',
        unitOfMeasure: 'ea',
        totalQuantityUsed: 5,
        totalCost: 7.5,
        usageCount: 2,
      },
    ],
    byWorkOrder: [{ workOrderId: 'W1', woNumber: 'WO-1', totalQuantityUsed: 5, totalCost: 7.5, lineCount: 2 }],
    byEquipment: [
      { equipmentId: 'E1', equipmentCode: 'EQ1', equipmentName: 'Pump', totalQuantityUsed: 5, totalCost: 7.5, lineCount: 2 },
    ],
  },
  'backlog-hours-by-work-center': [
    { workCenterId: 'W1', workCenterCode: 'WC1', workCenterName: 'Line', openWorkOrderCount: 3, backlogHours: 12.5 },
  ],
  'top-cost-equipment': [
    {
      equipmentId: 'E1',
      equipmentCode: 'EQ1',
      equipmentName: 'Pump',
      workOrderCount: 2,
      plannedCost: 10,
      actualCost: 8,
      totalCost: 10,
    },
  ],
  'notifications-awaiting-conversion': {
    total: 2,
    byPriority: [{ priority: 'High', count: 2 }],
    oldestAgeDays: 3,
  },
};

async function main(): Promise<number> {
  const keys = Object.keys(reportHandlers);
  console.log(`R.5 xlsx verification\nout: ${OUT_DIR}\nreports: ${keys.length}\n`);

  let live = 0;
  let synthetic = 0;
  for (const key of keys) {
    const capture = createCaptureResponse();
    let source = 'synthetic';
    let body: unknown = SYNTHETIC[key];
    try {
      const req = { query: {} } as unknown as Request;
      await reportHandlers[key](req, capture.res);
      const captured = capture.captured();
      if (captured.statusCode === 200) {
        body = captured.body;
        source = 'live';
      }
    } catch {
      // fall through to the synthetic body
    }
    if (source === 'live') live += 1;
    else synthetic += 1;

    const workbook = reportToWorkbook(key, body);
    const buffer = buildXlsx(workbook.sheets);
    fs.writeFileSync(path.join(OUT_DIR, workbook.filename), buffer);
    console.log(
      `${source.padEnd(9)} ${key.padEnd(34)} ${String(workbook.sheets.length).padStart(2)} sheet(s)  ${buffer.length} bytes`
    );
  }

  // A dedicated probe for the value rules the writer must never break: a
  // leading `=` stays text, a number stays a number, a boolean stays a boolean,
  // an XML metacharacter is escaped, and a forbidden control character is gone.
  const probe = buildXlsx([
    {
      name: 'Probe',
      header: ['text', 'number', 'boolean'],
      rows: [
        ['=1+1', 42, true],
        ['<b>x</b> & "y"', 3.5, false],
        ['a\u0007b', null, null],
      ],
    },
  ]);
  fs.writeFileSync(path.join(OUT_DIR, '_values.xlsx'), probe);

  console.log(`\nprovenance: ${live} live, ${synthetic} synthetic`);
  await prisma.$disconnect();

  const verifier = path.resolve(here, '..', '..', 'scripts', 'verify', 'verify_r5.py');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [verifier, OUT_DIR], { stdio: 'inherit' });
  if (result.error) {
    console.error(`could not run ${python}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
