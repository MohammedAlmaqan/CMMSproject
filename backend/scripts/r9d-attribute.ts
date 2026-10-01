import { readFileSync } from 'node:fs';
import { prisma } from '../src/utils/prisma.js';

/**
 * Attribution helper for r9d-db-invariance.ts. Given a baseline, reports which
 * residue rows came from where, so a leak is attributed to a test file by
 * evidence rather than by guesswork. Read-only.
 */
const base = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { keys: Record<string, string[]> };

async function residue(table: string, pk: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${pk}" FROM "${table}"`);
  const b = new Set(base.keys[table] ?? []);
  return rows.map((r) => String(r[pk])).filter((k) => !b.has(k));
}

async function main(): Promise<void> {
  const auditIds = await residue('AuditLogEntry', 'auditId');
  const byTableAction = new Map<string, number>();
  if (auditIds.length) {
    const rows = await prisma.auditLogEntry.findMany({
      where: { auditId: { in: auditIds } },
      select: { tableName: true, action: true, userId: true },
    });
    for (const r of rows) {
      const k = `${r.tableName} / ${r.action} / user=${r.userId.slice(0, 8)}`;
      byTableAction.set(k, (byTableAction.get(k) ?? 0) + 1);
    }
  }
  console.log(`AUDIT RESIDUE (${auditIds.length}) by table/action/user:`);
  for (const [k, n] of [...byTableAction.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`);
  }

  const woIds = await residue('WorkOrder', 'workOrderId');
  console.log(`\nWORK ORDER RESIDUE (${woIds.length}):`);
  if (woIds.length) {
    const rows = await prisma.workOrder.findMany({
      where: { workOrderId: { in: woIds } },
      select: { woNumber: true, isDeleted: true, createdBy: true, createdDate: true, sourcePlanId: true, sourcePlanCycle: true, description: true, _count: { select: { operations: true } } },
      orderBy: { createdDate: 'asc' },
    });
    for (const r of rows) {
      console.log(`  ${r.woNumber}  deleted=${String(r.isDeleted).padEnd(5)} ops=${r._count.operations}  by=${r.createdBy.slice(0, 8)}  ${r.createdDate.toISOString().slice(11, 19)}`);
      console.log(`      desc="${(r.description ?? '').slice(0, 70)}"  plan=${r.sourcePlanId ? 'yes' : 'no'}  cycle=${(r.sourcePlanCycle ?? '-').slice(0, 40)}`);
    }
  }

  const simple: [string, string, string][] = [
    ['TaskList', 'taskListId', 'code'],
    ['Craft', 'craftId', 'name'],
    ['Material', 'materialId', 'name'],
    ['WorkCenter', 'workCenterId', 'name'],
    ['FailureCode', 'failureCodeId', 'code'],
    ['MaintenancePlan', 'planId', 'planCode'],
    ['Notification', 'notificationId', 'notificationNumber'],
    ['SystemAlert', 'alertId', 'alertType'],
  ];
  console.log('\nOTHER RESIDUE:');
  for (const [table, pk, label] of simple) {
    const ids = await residue(table, pk);
    if (!ids.length) continue;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${table}" WHERE "${pk}"::text IN (${ids.map((i) => `'${i}'`).join(',')})`
    );
    console.log(`  ${table} (${ids.length}):`);
    for (const r of rows.slice(0, 10)) {
      const del = 'isDeleted' in r ? `deleted=${String(r.isDeleted)}` : '';
      console.log(`      ${String(r[label] ?? '').slice(0, 44).padEnd(46)} by=${String(r.createdBy ?? '-').slice(0, 8)} ${del} ${String(r.createdDate ?? '').slice(11, 19)}`);
    }
    if (rows.length > 10) console.log(`      ... and ${rows.length - 10} more`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
