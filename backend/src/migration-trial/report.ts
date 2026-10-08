/** Markdown emitter for the trial-run report (docs/migration-templates/
 * TRIAL_RUN_REPORT.md). Pure formatting; all numbers come from the harness. */
import type { RejectedRow } from './importers/index.js';

export interface ColumnRule {
  name: string;
  rule: string;
}

export interface DatasetReport {
  name: string;
  model: string;
  total: number;
  mapped: number;
  parseRejected: RejectedRow[];
  persistRejected: RejectedRow[];
  incorrect: { row: number; key: string; diffs: string[] }[];
  correct: number;
  /** correct / mapped * 100, or null when there is nothing to measure. */
  accuracyPct: number | null;
  parseMs: number;
  persistMs: number;
  columns: ColumnRule[];
  unmapped: string[];
}

export interface ReportInput {
  runAt: string;
  host: string;
  port: number;
  schema: string;
  sampleCommit: string;
  datasets: DatasetReport[];
  overall: {
    total: number;
    mapped: number;
    rejected: number;
    correct: number;
    accuracyPct: number | null;
    persistMs: number;
  };
}

/** The workbook-level WO&Notf fields with no delivered counterpart, from
 * FILL_REPORT 'Unmapped / excluded source fields' (applies to WorkOrder and
 * Notification). Labels kept short; the full rationale lives in FILL_REPORT. */
const WORKBOOK_UNMAPPED: { source: string; label: string }[] = [
  { source: 'Equip Discrp', label: 'duplicate of canonical source field - filled elsewhere' },
  { source: 'F.L Discrp', label: 'duplicate of canonical source field - filled elsewhere' },
  { source: 'reference1', label: 'no template target' },
  { source: 'Number of Employee:', label: 'excluded by decision - required source absent (work-order operations)' },
  { source: 'Duration / Employee', label: 'excluded by decision - required source absent (work-order operations)' },
  { source: 'Total Duration', label: 'excluded by decision - required source absent (work-order operations)' },
  { source: 'E3 / MCP rows', label: 'excluded by decision - requires application change' },
];

function pct(value: number | null, numerator: number, denominator: number): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(2)}% (${numerator} / ${denominator})`;
}

function ms(millis: number): string {
  return `${millis < 10 ? millis.toFixed(1) : millis.toFixed(0)} ms`;
}

function rejectedTable(rejected: RejectedRow[], stage: string): string {
  if (rejected.length === 0) return '';
  const lines = ['| Data row | Key | Stage | Reason |', '|---|---|---|---|'];
  for (const r of rejected) {
    lines.push(`| ${r.row} | \`${r.key}\` | ${stage} | ${r.reason} |`);
  }
  return lines.join('\n');
}

function incorrectTable(incorrect: DatasetReport['incorrect']): string {
  if (incorrect.length === 0) return '';
  const lines = ['| Data row | Key | Difference |', '|---|---|---|'];
  for (const r of incorrect) {
    lines.push(`| ${r.row} | \`${r.key}\` | ${r.diffs.join('; ')} |`);
  }
  return lines.join('\n');
}

function columnTable(columns: ColumnRule[]): string {
  const lines = ['| Column | Delivery on import |', '|---|---|'];
  for (const c of columns) lines.push(`| \`${c.name}\` | ${c.rule} |`);
  return lines.join('\n');
}

function datasetSection(d: DatasetReport): string {
  const rejectedTotal = d.parseRejected.length + d.persistRejected.length;
  const parts = [
    `### ${d.name} (\`${d.model}\` model)`,
    '',
    `- total rows: ${d.total}`,
    `- mapped rows: ${d.mapped}`,
    `- rejected rows: ${rejectedTotal} (${d.parseRejected.length} at mapping, ${d.persistRejected.length} at persist)`,
    `- correct rows: ${d.correct}`,
    `- accuracy: ${pct(d.accuracyPct, d.correct, d.mapped)} (target 99.9%)`,
    `- elapsed to import the sample: ${ms(d.parseMs)} mapping + ${ms(d.persistMs)} persist`,
    '',
    'Mapped columns and what happened to each cell:',
    '',
    columnTable(d.columns),
    '',
    'Unmapped source fields:',
    '',
  ];

  const unmappedLines: string[] = [];
  if (d.unmapped.length > 0) {
    unmappedLines.push(`- CSV columns not carried: ${d.unmapped.map((u) => `\`${u}\``).join(', ')}`);
  }
  if (d.name === 'WorkOrder' || d.name === 'Notification') {
    unmappedLines.push("- workbook columns with no delivered counterpart (from FILL_REPORT 'Unmapped / excluded source fields'):");
    for (const w of WORKBOOK_UNMAPPED) unmappedLines.push(`  - \`${w.source}\` - ${w.label}`);
  }
  if (unmappedLines.length === 0) unmappedLines.push('- (none)');
  parts.push(...unmappedLines, '');

  const rejectedRows = rejectedTable(d.parseRejected, 'mapping') + rejectedTable(d.persistRejected, 'persist');
  if (rejectedRows) parts.push('Rejected rows:', '', rejectedRows, '');

  const wrong = incorrectTable(d.incorrect);
  if (wrong) parts.push('Incorrect rows (read-back mismatch):', '', wrong, '');

  return parts.join('\n');
}

export function renderReport(input: ReportInput): string {
  const parts: string[] = [
    '# Trial-run report - migration sample',
    '',
    `Run ${input.runAt} (UTC) against the sample in \`docs/migration-templates/*.filled.csv\` at commit ` +
      `\`${input.sampleCommit}\`, in the throwaway schema \`${input.schema}\` on ${input.host}:${input.port}. ` +
      'The schema was created, migrated with `prisma migrate deploy` and dropped by this run; nothing in the ' +
      'app\'s `public` schema was touched.',
    '',
    'Mapping rules in force are the current state of `docs/migration-templates/FILL_REPORT.md`; the SCE widening ' +
      '(commit `5aa0094`) is in force, so `Equipment.criticality` accepts `S > A > B > C` and the sampled SCE rows ' +
      'carry the literal `S`. Accuracy is defined in `docs/DATA_ASSESSMENT_REQUEST.md`: a row is correct when it is ' +
      'not rejected and every mapped field arrives value-unchanged; unmapped source fields are listed, never hidden. ' +
      'Blank cells land as documented per column (null, schema default, or the as-received empty string) and are ' +
      'reported below, not counted as wrong rows.',
    '',
    '## Summary',
    '',
    '| Dataset | Total | Mapped | Rejected | Correct | Accuracy | Import time |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const d of input.datasets) {
    const rejected = d.parseRejected.length + d.persistRejected.length;
    parts.push(
      `| ${d.name} | ${d.total} | ${d.mapped} | ${rejected} | ${d.correct} | ` +
        `${d.accuracyPct === null ? 'n/a' : d.accuracyPct.toFixed(2) + '%'} | ${ms(d.parseMs + d.persistMs)} |`,
    );
  }

  const o = input.overall;
  parts.push(
    `| **Overall** | ${o.total} | ${o.mapped} | ${o.rejected} | ${o.correct} | ` +
      `${o.accuracyPct === null ? 'n/a' : o.accuracyPct.toFixed(2) + '%'} | ${ms(o.persistMs)} |`,
    '',
    `Overall accuracy: ${pct(o.accuracyPct, o.correct, o.mapped)}. Target 99.9%. ` +
      (o.accuracyPct !== null && o.accuracyPct >= 99.9 ? 'Target met.' : 'Target not met.'),
    '',
    '## Per-dataset detail',
    '',
  );

  for (const d of input.datasets) parts.push(datasetSection(d), '');

  return parts.join('\n').trimEnd() + '\n';
}