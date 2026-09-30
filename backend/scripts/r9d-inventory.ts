import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** "scheduler" is a label on a plain column, not a user. A uuid resolves to a
 *  real account, which is the first cheap way to tell seed data from a fixture:
 *  nothing a person did carries the scheduler label unless PM generation did it. */
async function actorLabel(raw: string): Promise<string> {
  if (raw === 'scheduler' || raw === 'system') return `${raw} (label, not a user)`;
  const u = await prisma.user.findUnique({ where: { userId: raw }, select: { fullName: true, username: true, role: true } });
  return u ? `${raw.slice(0, 8)} ${u.fullName} /${u.username} (${u.role})` : `${raw.slice(0, 8)} *** NOT A USER ***`;
}

async function main(): Promise<void> {
  const users = new Map<string, string>();
  const resolve = async (raw: string): Promise<string> => {
    const hit = users.get(raw);
    if (hit !== undefined) return hit;
    const v = await actorLabel(raw);
    users.set(raw, v);
    return v;
  };

  const plans = await prisma.maintenancePlan.findMany({
    orderBy: [{ isDeleted: 'asc' }, { createdDate: 'asc' }],
    select: {
      planId: true,
      planCode: true,
      description: true,
      strategyType: true,
      intervalValue: true,
      intervalUnit: true,
      startDate: true,
      endDate: true,
      isDeleted: true,
      activeFlag: true,
      createdBy: true,
      modifiedBy: true,
      createdDate: true,
      modifiedDate: true,
      taskList: { select: { code: true, _count: { select: { operations: true } } } },
      _count: { select: { targets: true } },
    },
  });

  const wos = await prisma.workOrder.findMany({
    where: { sourcePlanId: { not: null } },
    orderBy: [{ isDeleted: 'asc' }, { createdDate: 'asc' }],
    select: {
      workOrderId: true,
      woNumber: true,
      description: true,
      status: true,
      isDeleted: true,
      createdBy: true,
      sourcePlanId: true,
      sourcePlanCycle: true,
      createdDate: true,
      modifiedDate: true,
      plannedCost: true,
      actualCost: true,
      _count: { select: { operations: true } },
    },
  });

  const planById = new Map(plans.map((p) => [p.planId, p]));

  // `WorkOrder.sourcePlanId` is a plain column, not a Prisma relation, so the
  // plan -> work order count has to be derived here rather than read off a
  // nested _count.
  const woCountByPlan = new Map<string, number>();
  for (const w of wos) {
    woCountByPlan.set(w.sourcePlanId!, (woCountByPlan.get(w.sourcePlanId!) ?? 0) + 1);
  }

  console.log('='.repeat(120));
  console.log(`MAINTENANCE PLANS: ${plans.length}`);
  console.log('='.repeat(120));
  for (const [i, p] of plans.entries()) {
    const flag = p.isDeleted ? 'DELETED' : 'LIVE   ';
    console.log(
      `\n[${String(i + 1).padStart(2)}] ${flag}  ${p.planCode}`,
    );
    console.log(`     planId        ${p.planId}`);
    console.log(`     description   ${p.description}`);
    console.log(
      `     schedule      ${p.strategyType} every ${p.intervalValue} ${p.intervalUnit}  from ${p.startDate.toISOString().slice(0, 10)}${p.endDate ? ` to ${p.endDate.toISOString().slice(0, 10)}` : ' (no end)'}`,
    );
    console.log(`     activeFlag    ${p.activeFlag}`);
    console.log(`     taskList      ${p.taskList?.code ?? 'none'} (${p.taskList?._count.operations ?? 0} operations)`);
    console.log(`     work orders   ${woCountByPlan.get(p.planId) ?? 0} referencing this plan`);
    console.log(`     createdBy     ${await resolve(p.createdBy)}`);
    console.log(`     modifiedBy    ${await resolve(p.modifiedBy)}`);
    console.log(`     createdDate   ${p.createdDate.toISOString()}`);
    console.log(`     modifiedDate  ${p.modifiedDate.toISOString()}`);
  }

  console.log('\n');
  console.log('='.repeat(120));
  console.log(`WORK ORDERS WITH A sourcePlanId: ${wos.length}  (open: ${wos.filter((w) => !w.isDeleted).length})`);
  console.log('='.repeat(120));
  for (const [i, w] of wos.entries()) {
    const plan = planById.get(w.sourcePlanId!);
    const flag = w.isDeleted ? 'DELETED' : 'LIVE   ';
    console.log(
      `\n[${String(i + 1).padStart(2)}] ${flag}  ${w.woNumber}  status=${w.status}  ops=${w._count.operations}  planned=${Number(w.plannedCost).toFixed(2)} actual=${Number(w.actualCost).toFixed(2)}`,
    );
    console.log(`     workOrderId   ${w.workOrderId}`);
    console.log(`     description   ${w.description}`);
    console.log(`     sourcePlanId  ${w.sourcePlanId}`);
    console.log(`     cycle         ${w.sourcePlanCycle}`);
    console.log(
      `     owning plan   ${plan ? `${plan.planCode} (${plan.isDeleted ? 'deleted' : 'live'})` : '*** PLAN GONE - orphan ***'}`,
    );
    console.log(`     createdBy     ${await resolve(w.createdBy)}`);
    console.log(`     createdDate   ${w.createdDate.toISOString()}`);
    console.log(`     modifiedDate  ${w.modifiedDate.toISOString()}`);
  }

  console.log('\n');
  console.log('='.repeat(120));
  console.log('TOTALS');
  console.log('='.repeat(120));
  const live = plans.filter((p) => !p.isDeleted);
  const orphanWos = wos.filter((w) => !planById.has(w.sourcePlanId!));
  const softPlan = wos.filter((w) => planById.get(w.sourcePlanId!)?.isDeleted);
  console.log(`  plans total                ${plans.length}`);
  console.log(`  plans live                 ${live.length}`);
  console.log(`  plans soft-deleted         ${plans.length - live.length}`);
  console.log(`  work orders w/ sourcePlan  ${wos.length}`);
  console.log(`    open                     ${wos.filter((w) => !w.isDeleted).length}`);
  console.log(`    owning plan is DELETED   ${softPlan.length}`);
  console.log(`    owning plan is GONE      ${orphanWos.length}`);
  console.log(`\n  by planCode prefix (test fixtures use a code prefix; seed data does not):`);
  const byPrefix = new Map<string, number>();
  for (const p of plans) {
    const m = /^([A-Za-z]+)-?T?\d/.exec(p.planCode ?? '');
    const key = (p.planCode ?? '?').replace(/[-_]?\d[\d-]*$/, '');
    byPrefix.set(key, (byPrefix.get(key) ?? 0) + 1);
    void m;
  }
  for (const [k, v] of [...byPrefix.entries()].sort()) console.log(`    ${k.padEnd(28)} ${v}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());