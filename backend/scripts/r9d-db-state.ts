import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const plans = await prisma.maintenancePlan.count();
  const wosWithPlan = await prisma.workOrder.count({ where: { sourcePlanId: { not: null } } });
  const openWos = await prisma.workOrder.count({ where: { isDeleted: false } });
  const open = await prisma.workOrder.findMany({ where: { isDeleted: false }, select: { woNumber: true }, orderBy: { woNumber: 'asc' } });
  const orphans = await prisma.maintenancePlan.count({ where: { isDeleted: false, activeFlag: true } });

  console.log(`maintenance plans              ${plans}   (expected 0)`);
  console.log(`work orders w/ sourcePlanId    ${wosWithPlan}   (expected 0)`);
  console.log(`active plans                   ${orphans}   (expected 0)`);
  console.log(`open work orders               ${openWos}   (expected 3)`);
  console.log(`  ${open.map((w) => w.woNumber).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());