import { prisma } from '../src/utils/prisma.js';

/**
 * R.9 D3-task-lists, second half. Authorised 2026-10-01.
 *
 * The purge of the 61 task-list fixtures removed the rows. It left behind the
 * audit half of the same leak: 156 AuditLogEntry rows naming tableName
 * 'TaskList', every one of them orphaned because the record they describe is
 * gone. `purgeTaskLists` has called `purgeAudit` since 713bf16, so nothing
 * regenerates them - the newest is 2026-10-01T11:14:20Z, the same fixture run
 * as the last leaked row TL-T20261001111418.
 *
 * Why they have to go rather than be left as harmless debris. This is not an
 * append-only ledger of real business events; `GET /api/audit-log` renders it
 * to an Administrator, and 156 rows in it claim that `admin` and `operator`
 * created, edited and deleted 52 task lists that do not exist. That is the
 * audit trail asserting something untrue, which is the one thing an audit
 * trail must not do. R.9 B declined to *write* 78 audit rows for the same
 * reason - permanent trail noise attributed to `admin` - so leaving 156 behind
 * would reintroduce by hand exactly what that entry refused to create.
 *
 * Scope is deliberately narrow and is asserted, not assumed:
 *   - tableName === 'TaskList' only.
 *   - orphaned only: recordId not present in TaskList. A row whose record still
 *     exists is real history and is never a candidate.
 * The two seed task lists (PM-PUMP-001, PM-MOTOR-001) are therefore protected
 * twice over: they exist, so their audit rows are excluded by the orphan test,
 * and they hold 0 audit rows between them today.
 *
 * Read-only unless --apply is passed.
 *
 *   node scripts/r9d-tasklist-audit-clean.ts            # report
 *   node scripts/r9d-tasklist-audit-clean.ts --apply    # delete
 */

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const liveIds = new Set((await prisma.taskList.findMany({ select: { taskListId: true } })).map((r) => r.taskListId));

  const taskListAudits = await prisma.auditLogEntry.findMany({
    where: { tableName: 'TaskList' },
    select: {
      auditId: true, recordId: true, action: true, fieldName: true,
      oldValue: true, newValue: true, userId: true, timestamp: true,
    },
    orderBy: { timestamp: 'asc' },
  });

  const candidates = taskListAudits.filter((a) => !liveIds.has(a.recordId));
  const retained = taskListAudits.filter((a) => liveIds.has(a.recordId));

  console.log('=== TaskList audit rows ===');
  console.log(`  total naming tableName 'TaskList' : ${taskListAudits.length}`);
  console.log(`  RETAINED (record still exists)    : ${retained.length}`);
  console.log(`  orphaned (candidates)             : ${candidates.length}`);
  console.log(`  distinct orphaned recordIds       : ${new Set(candidates.map((a) => a.recordId)).size}`);

  if (retained.length > 0) {
    console.log('\n  retained rows, and the live record each one belongs to:');
    for (const a of retained) {
      const tl = await prisma.taskList.findUnique({ where: { taskListId: a.recordId }, select: { code: true } });
      console.log(`    ${a.timestamp.toISOString()} ${a.action.padEnd(6)} ${tl?.code ?? '??'} (${a.recordId})`);
    }
  }

  const byAction = new Map<string, number>();
  const byField = new Map<string, number>();
  const byUser = new Map<string, number>();
  for (const a of candidates) {
    byAction.set(a.action, (byAction.get(a.action) ?? 0) + 1);
    byField.set(a.fieldName ?? '(null)', (byField.get(a.fieldName ?? '(null)') ?? 0) + 1);
    byUser.set(a.userId, (byUser.get(a.userId) ?? 0) + 1);
  }
  const roll = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join('  ');

  console.log('\n=== composition of the candidates ===');
  console.log(`  by action : ${roll(byAction)}`);
  console.log(`  by field  : ${roll(byField)}`);

  const users = await prisma.user.findMany({
    where: { userId: { in: [...byUser.keys()] } },
    select: { userId: true, username: true, email: true, role: true },
  });
  console.log('  by author :');
  for (const u of users) {
    console.log(`    ${String(byUser.get(u.userId) ?? 0).padStart(4)}  ${u.username} <${u.email}> (${u.role})`);
  }

  const fixtureText = candidates.filter((a) => `${a.oldValue ?? ''}${a.newValue ?? ''}`.includes('test task list'));
  console.log(`\n  rows whose values carry the literal fixture text 'test task list': ${fixtureText.length}`);
  console.log(`  span: ${candidates[0]?.timestamp.toISOString()} .. ${candidates[candidates.length - 1]?.timestamp.toISOString()}`);

  if (!APPLY) {
    console.log(`\nDRY RUN. ${candidates.length} rows would be deleted. Re-run with --apply to delete them.`);
    return;
  }

  const before = await prisma.auditLogEntry.count();
  const { count } = await prisma.auditLogEntry.deleteMany({
    where: { tableName: 'TaskList', recordId: { notIn: [...liveIds] } },
  });
  const after = await prisma.auditLogEntry.count();

  const left = await prisma.auditLogEntry.count({ where: { tableName: 'TaskList' } });
  const lists = await prisma.taskList.count();

  console.log(`\nAPPLIED. deleted=${count}  auditLogEntry ${before} -> ${after}`);
  console.log(`  TaskList audit rows remaining : ${left}`);
  console.log(`  task lists remaining          : ${lists}`);
  if (count !== candidates.length) {
    console.log(`  WARNING: deleteMany touched ${count} but the orphan scan found ${candidates.length}.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
