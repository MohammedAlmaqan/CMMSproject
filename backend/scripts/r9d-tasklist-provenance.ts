import { prisma } from '../src/utils/prisma.js';

/**
 * Provenance dump for the task-list reconciliation and classification.
 * Read-only: prints evidence per row and decides nothing.
 *
 * Note on references: WorkOrder carries no taskListId FK; the task list is
 * copied into WorkOrderOperation / snapshot payloads. So the only real FK
 * reach into TaskList is MaintenancePlan.taskListId.
 */

/** Every code shape a file in this repository actually writes. */
const PRODUCERS: Array<{ re: RegExp; source: string; kind: 'seed' | 'fixture' }> = [
  { re: /^PM-PUMP-001$/, source: 'backend/prisma/seed.ts:134', kind: 'seed' },
  { re: /^PM-MOTOR-001$/, source: 'backend/prisma/seed.ts:135', kind: 'seed' },
  { re: /^TL-T\d{10,}$/, source: 'backend/tests/routes/taskLists.test.ts:6', kind: 'fixture' },
  { re: /^TL-CRF-\d+$/, source: 'backend/tests/routes/crafts.test.ts:147', kind: 'fixture' },
  { re: /^R9A-\d+$/, source: 'backend/scripts/r9a-differential.ts:127', kind: 'fixture' },
  { re: /^TL-G34-\d+$/, source: 'scripts/verify/verify_g3_4.py:290', kind: 'fixture' },
];

async function main(): Promise<void> {
  const rows = await prisma.taskList.findMany({
    select: {
      taskListId: true, code: true, description: true, equipmentId: true,
      createdBy: true, modifiedBy: true, createdDate: true, isDeleted: true,
      workCenter: { select: { code: true } },
      _count: { select: { operations: true, maintenancePlans: true } },
    },
    orderBy: { createdDate: 'asc' },
  });

  const planRefs = await prisma.maintenancePlan.groupBy({ by: ['taskListId'], _count: { _all: true } });
  const planMap = new Map(planRefs.map((p) => [p.taskListId, p._count._all]));
  const ids = rows.map((r) => r.taskListId);
  const auditRefs = await prisma.auditLogEntry.groupBy({ by: ['recordId'], where: { recordId: { in: ids } }, _count: { _all: true } });
  const auditMap = new Map(auditRefs.map((a) => [a.recordId, a._count._all]));

  const verdict = new Map<string, { kind: string; source: string }>();
  for (const r of rows) {
    const hit = PRODUCERS.find((p) => p.re.test(r.code));
    verdict.set(r.taskListId, hit ? { kind: hit.kind, source: hit.source } : { kind: 'UNMATCHED', source: '-' });
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = verdict.get(r.taskListId)!;
    const key = `${v.kind.padEnd(8)} ${v.source}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  console.log(`TOTAL TASK LISTS: ${rows.length}\n`);
  console.log('=== ROLLUP BY PRODUCER (code shape -> the one file that writes it) ===');
  for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${k}`);
  }

  const unmatched = rows.filter((r) => verdict.get(r.taskListId)!.kind === 'UNMATCHED');
  console.log(`\n=== UNMATCHED / AMBIGUOUS: ${unmatched.length} (no file in this repo writes this code shape) ===`);
  for (const r of unmatched) {
    console.log(
      `  code="${r.code}"  desc="${r.description}"\n` +
      `     createdBy=${r.createdBy} modifiedBy=${r.modifiedBy} created=${r.createdDate.toISOString()} deleted=${r.isDeleted}\n` +
      `     wc=${r.workCenter.code} eq=${r.equipmentId ?? 'null'} ops=${r._count.operations} plans=${r._count.maintenancePlans} audits=${auditMap.get(r.taskListId) ?? 0}`
    );
  }

  console.log('\n=== SEED ROWS ===');
  for (const r of rows.filter((r) => verdict.get(r.taskListId)!.kind === 'seed')) {
    console.log(
      `  ${r.code}  desc="${r.description}"  wc=${r.workCenter.code}  eq=${r.equipmentId ?? 'null'}  ops=${r._count.operations}  plans=${r._count.maintenancePlans}  wos=0 (no FK)  audits=${auditMap.get(r.taskListId) ?? 0}`
    );
  }

  console.log('\n=== FIXTURES: reach and spread (a referenced fixture is still a fixture) ===');
  const bySource = new Map<string, typeof rows>();
  for (const r of rows.filter((r) => verdict.get(r.taskListId)!.kind === 'fixture')) {
    const v = verdict.get(r.taskListId)!;
    bySource.set(v.source, [...(bySource.get(v.source) ?? []), r]);
  }
  for (const [src, list] of [...bySource.entries()].sort()) {
    const oldest = list.reduce((m, r) => (r.createdDate < m ? r.createdDate : m), list[0].createdDate);
    const newest = list.reduce((m, r) => (r.createdDate > m ? r.createdDate : m), list[0].createdDate);
    console.log(`  ${src}`);
    console.log(`     rows=${list.length}  referenced-by-plan=${list.filter((r) => (planMap.get(r.taskListId) ?? 0) > 0).length}  total-plan-rows=${list.reduce((n, r) => n + (planMap.get(r.taskListId) ?? 0), 0)}  audit-rows=${list.reduce((n, r) => n + (auditMap.get(r.taskListId) ?? 0), 0)}`);
    console.log(`     created ${oldest.toISOString()} .. ${newest.toISOString()}`);
    console.log(`     createdBy values: ${[...new Set(list.map((r) => r.createdBy))].join(', ')}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
