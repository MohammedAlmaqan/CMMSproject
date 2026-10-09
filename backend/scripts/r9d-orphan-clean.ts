import { prisma } from '../src/utils/prisma.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * B4: orphan cleanup, authorised 2026-10-09.
 *
 * Two families, both debris from fixture scripts and gate runs, neither real
 * business history:
 *
 *   1. Orphan *task lists* - TaskList rows that no file in this repository
 *      writes as seed data and that no MaintenancePlan references. The R.9 D3
 *      classification found 61 of these; the purge that removed them is
 *      recorded in the tracker, so this script re-measures rather than assumes
 *      and expects to find none.
 *
 *   2. Orphan *audit rows* on WorkOrder / WorkOrderOperation / MaintenancePlan /
 *      TaskList - AuditLogEntry rows whose recordId is absent from the table it
 *      names (soft-deleted rows still count as present). R.9 D3-task-lists-audit
 *      cleaned the TaskList half (156 rows); the other three tables were held
 *      for this authorisation.
 *
 * The audit trail renders to an Administrator (GET /api/audit-log), so a row
 * that names a record the database no longer contains asserts something untrue.
 * That is the reason these go, not tidiness.
 *
 * Safe by construction, and it names what it leaves:
 *   - A row whose record still exists is never a candidate.
 *   - A candidate whose recordId is written down in a test, script or gate is
 *     LEFT and named: that id is evidence something still reads, and deleting it
 *     would erase the reference target.
 *   - The two seed task lists (PM-PUMP-001, PM-MOTOR-001) are protected by the
 *     existence test.
 *
 * Read-only unless --apply is passed.
 *
 *   tsx scripts/r9d-orphan-clean.ts            # report
 *   tsx scripts/r9d-orphan-clean.ts --apply    # delete
 */

const APPLY = process.argv.includes('--apply');

const AUDITED = ['WorkOrder', 'WorkOrderOperation', 'MaintenancePlan', 'TaskList'] as const;

/** Every code shape a file in this repository writes for a TaskList. */
const SEED_TASKLIST = /^PM-(PUMP|MOTOR)-001$/;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const SCAN_DIRS = [
  join(REPO_ROOT, 'backend', 'tests'),
  join(REPO_ROOT, 'backend', 'scripts'),
  join(REPO_ROOT, 'scripts'),
];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.py']);

function collectFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      collectFiles(p, out);
    } else if (SCAN_EXT.has(extname(p))) {
      out.push(p);
    }
  }
}

/** Concatenate every test/script/gate source file once, for id membership. */
function referenceBlob(): string {
  const files: string[] = [];
  for (const d of SCAN_DIRS) collectFiles(d, files);
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

async function main(): Promise<void> {
  const blob = referenceBlob();
  const referenced = (id: string): boolean => blob.includes(id);

  console.log('='.repeat(78));
  console.log('B4 ORPHAN CLEANUP');
  console.log('='.repeat(78));

  // ---- family 1: orphan task lists --------------------------------------
  const taskLists = await prisma.taskList.findMany({
    select: { taskListId: true, code: true, isDeleted: true, _count: { select: { maintenancePlans: true } } },
  });
  const planRefs = new Set(
    (
      await prisma.maintenancePlan.groupBy({ by: ['taskListId'], _count: { _all: true } })
    ).map((p) => p.taskListId),
  );
  const orphanTaskLists = taskLists.filter(
    (t) => !SEED_TASKLIST.test(t.code) && !planRefs.has(t.taskListId),
  );
  const orphanTaskListIds = orphanTaskLists.map((t) => t.taskListId);

  console.log('\n--- orphan task lists ---');
  console.log(`  task lists total          : ${taskLists.length}`);
  console.log(`  seed (protected)          : ${taskLists.filter((t) => SEED_TASKLIST.test(t.code)).length}`);
  console.log(`  referenced by a plan      : ${taskLists.filter((t) => planRefs.has(t.taskListId)).length}`);
  console.log(`  ORPHAN candidates         : ${orphanTaskLists.length}`);
  for (const t of orphanTaskLists) console.log(`    ${t.code}  (${t.taskListId})  deleted=${t.isDeleted}`);
  if (orphanTaskLists.length) {
    const auditForLists = await prisma.auditLogEntry.count({ where: { tableName: 'TaskList', recordId: { in: orphanTaskListIds } } });
    const ops = await prisma.taskListOperation.count({ where: { taskListId: { in: orphanTaskListIds } } });
    console.log(`  audit rows naming them    : ${auditForLists}  (removed with the lists, R.9 D3-task-lists-audit rationale)`);
    console.log(`  child operations          : ${ops}`);
  }

  if (APPLY && orphanTaskLists.length) {
    const opIds = (
      await prisma.taskListOperation.findMany({ where: { taskListId: { in: orphanTaskListIds } }, select: { taskOperationId: true } })
    ).map((o) => o.taskOperationId);
    await prisma.taskListMaterial.deleteMany({ where: { taskOperationId: { in: opIds } } });
    await prisma.taskListOperation.deleteMany({ where: { taskListId: { in: orphanTaskListIds } } });
    const { count } = await prisma.taskList.deleteMany({ where: { taskListId: { in: orphanTaskListIds } } });
    const auditCleaned = await prisma.auditLogEntry.deleteMany({ where: { tableName: 'TaskList', recordId: { in: orphanTaskListIds } } });
    console.log(`  APPLIED. task lists deleted=${count}, their audit rows removed=${auditCleaned.count}`);
    if (count !== orphanTaskLists.length) {
      console.log(`  WARNING: deleted ${count} but the scan found ${orphanTaskLists.length}.`);
      process.exitCode = 1;
    }
  }

  // ---- family 2: orphan audit rows --------------------------------------
  const idSets: Record<string, Set<string>> = {
    WorkOrder: new Set((await prisma.workOrder.findMany({ select: { workOrderId: true } })).map((r) => r.workOrderId)),
    WorkOrderOperation: new Set(
      (await prisma.workOrderOperation.findMany({ select: { operationId: true } })).map((r) => r.operationId),
    ),
    MaintenancePlan: new Set((await prisma.maintenancePlan.findMany({ select: { planId: true } })).map((r) => r.planId)),
    TaskList: new Set((await prisma.taskList.findMany({ select: { taskListId: true } })).map((r) => r.taskListId)),
  };

  const perTable: Array<{ table: string; retained: number; candidates: number; protected: Set<string> }> = [];

  for (const table of AUDITED) {
    const ids = idSets[table];

    const audits = await prisma.auditLogEntry.findMany({
      where: { tableName: table },
      select: { auditId: true, recordId: true, action: true, fieldName: true, userId: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const retained = audits.filter((a) => ids.has(a.recordId));
    const candidates = audits.filter((a) => !ids.has(a.recordId));
    const protectedIds = new Set(candidates.filter((a) => referenced(a.recordId)).map((a) => a.recordId));
    const deletable = candidates.filter((a) => !protectedIds.has(a.recordId));

    perTable.push({ table, retained: retained.length, candidates: candidates.length, protected: protectedIds });

    console.log(`\n--- audit rows naming ${table} ---`);
    console.log(`  retained (record exists)  : ${retained.length}`);
    console.log(`  orphaned (candidates)     : ${candidates.length}  distinct recordIds=${new Set(candidates.map((a) => a.recordId)).size}`);
    console.log(`  protected (id in a test/script/gate) : ${protectedIds.size}`);
    for (const id of protectedIds) console.log(`    LEFT: ${id}`);
    console.log(`  DELETABLE                 : ${deletable.length}`);

    if (deletable.length) {
      const byAction = new Map<string, number>();
      const byUser = new Map<string, number>();
      for (const a of deletable) {
        byAction.set(a.action, (byAction.get(a.action) ?? 0) + 1);
        byUser.set(a.userId, (byUser.get(a.userId) ?? 0) + 1);
      }
      const roll = (m: Map<string, number>) =>
        [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join('  ');
      console.log(`    by action : ${roll(byAction)}`);
      console.log(`    span      : ${deletable[0]?.timestamp.toISOString()} .. ${deletable[deletable.length - 1]?.timestamp.toISOString()}`);
      const users = await prisma.user.findMany({
        where: { userId: { in: [...byUser.keys()] } },
        select: { userId: true, username: true, role: true },
      });
      const name = new Map(users.map((u) => [u.userId, `${u.username} (${u.role})`]));
      for (const [uid, n] of [...byUser.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    by author : ${String(n).padStart(4)}  ${name.get(uid) ?? uid}`);
      }
    }

    if (!APPLY) continue;

    const before = await prisma.auditLogEntry.count();
    const { count } = await prisma.auditLogEntry.deleteMany({
      where: { tableName: table, recordId: { notIn: [...ids] } },
    });
    const after = await prisma.auditLogEntry.count();
    console.log(`  APPLIED. deleted=${count}  auditLogEntry ${before} -> ${after}`);
    if (count !== deletable.length) {
      console.log(`  WARNING: deleteMany touched ${count} but the candidate scan found ${deletable.length} deletable.`);
      process.exitCode = 1;
    }
  }

  if (!APPLY) {
    const auditForLists = orphanTaskLists.length
      ? await prisma.auditLogEntry.count({ where: { tableName: 'TaskList', recordId: { in: orphanTaskListIds } } })
      : 0;
    const total = perTable.reduce((n, t) => n + t.candidates, 0) + auditForLists;
    console.log(`\nDRY RUN. ${orphanTaskLists.length} task list(s) + ${total} audit row(s) are candidates.`);
    console.log('Anything listed as LEFT above is referenced by a test/script/gate and is not deleted.');
    console.log('Re-run with --apply to delete the candidates.');
    return;
  }

  console.log('\n=== after ===');
  console.log(`  task lists                : ${await prisma.taskList.count()}`);
  console.log(`  auditLogEntry             : ${await prisma.auditLogEntry.count()}`);
  for (const table of AUDITED) {
    console.log(`    ${table.padEnd(20)} audit rows : ${await prisma.auditLogEntry.count({ where: { tableName: table } })}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
