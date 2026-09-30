import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * R.9 D, follow-up. The Client asked whether the 52 orphaned task lists are
 * seed master data like PM-PUMP-001, or fixtures. Answer with provenance
 * rather than by code prefix: who created each row, when, and with what
 * description. Nothing is deleted by this script.
 */
async function main(): Promise<void> {
  const lists = await prisma.taskList.findMany({
    orderBy: [{ createdBy: 'asc' }, { createdDate: 'asc' }],
    select: {
      code: true,
      description: true,
      createdBy: true,
      createdDate: true,
      isDeleted: true,
      workCenterId: true,
      _count: { select: { operations: true, maintenancePlans: true } },
    },
  });

  const seedCodes = new Set(['PM-PUMP-001', 'PM-MOTOR-001']);

  const groups = new Map<string, typeof lists>();
  for (const l of lists) {
    const key = `${l.createdBy}|${l.description}|${l.isDeleted ? 'deleted' : 'active'}|${seedCodes.has(l.code) ? 'seed' : 'fixture'}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  console.log(`TOTAL TASK LISTS: ${lists.length}\n`);

  const seed = lists.filter((l) => seedCodes.has(l.code));
  const fixtures = lists.filter((l) => !seedCodes.has(l.code));

  console.log(`=== SEED (2) - created by prisma/seed.ts:134-135 ===`);
  for (const l of seed) {
    console.log(`  ${l.code.padEnd(24)} createdBy=${l.createdBy.padEnd(8)} ${l.createdDate.toISOString()}  deleted=${l.isDeleted}  ops=${l._count.operations}  "${l.description}"`);
  }

  console.log(`\n=== FIXTURE CANDIDATES (${fixtures.length}) - grouped by creator + description ===\n`);
  const sorted = [...groups.entries()]
    .filter(([, rows]) => !seedCodes.has(rows[0].code))
    .sort((a, b) => b[1].length - a[1].length);

  for (const [key, rows] of sorted) {
    const [createdBy, description, delState, kind] = key.split('|');
    const first = rows[0].createdDate.toISOString();
    const last = rows[rows.length - 1].createdDate.toISOString();
    console.log(`  ${rows.length} row(s)  createdBy=${createdBy}  ${delState}  kind=${kind}`);
    console.log(`      description: "${description}"`);
    console.log(`      createdDate: ${first} .. ${last}`);
    console.log(`      ops total:   ${rows.reduce((n, r) => n + r._count.operations, 0)}`);
    console.log(`      codes:       ${rows.map((r) => r.code).join(', ')}`);
    console.log('');
  }

  console.log('=== SUMMARY ===');
  console.log(`  seed master data       ${seed.length}   (PM-PUMP-001, PM-MOTOR-001)`);
  console.log(`  fixture candidates     ${fixtures.length}`);
  console.log(`  of those, hard-coded fixture descriptions: ${fixtures.filter((l) => /task list|test|probe/i.test(l.description)).length}`);
  console.log(`  of those, createdBy a real user id (not 'system'): ${fixtures.filter((l) => l.createdBy !== 'system').length}`);
  console.log(`  of those, still active (isDeleted=false): ${fixtures.filter((l) => !l.isDeleted).length}`);
  console.log(`  referenced by any remaining plan: ${lists.reduce((n, l) => n + l._count.maintenancePlans, 0)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());