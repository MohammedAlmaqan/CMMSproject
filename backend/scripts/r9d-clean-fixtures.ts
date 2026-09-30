import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * R.9 D cleanup, authorised 2026-09-30: every maintenance plan in the live
 * database is a test fixture (G4A-TEST / G4B1-TEST / G4B2-TEST / PLAN-T* /
 * R9A-*), and every work order carrying a sourcePlanId descends from one.
 * There is no legitimate PM plan here to preserve.
 *
 * Left alone on purpose: work orders with no sourcePlanId - WO-000063,
 * WO-000064 and WO-T1790267575210. They were not cleared by this decision.
 *
 * Deletion is hard, not soft. These rows are debris from fixture scripts and
 * gate runs, and leaving them soft-deleted is what made the live database
 * unreadable as evidence in the first place.
 */
async function main(): Promise<void> {
  const plans = await prisma.maintenancePlan.findMany({ select: { planId: true, planCode: true } });
  const planIds = plans.map((p) => p.planId);

  const wos = await prisma.workOrder.findMany({
    where: { sourcePlanId: { in: planIds } },
    select: { workOrderId: true, woNumber: true },
  });
  const woIds = wos.map((w) => w.workOrderId);

  // Children first, so nothing trips a RESTRICT halfway through.
  const opIds = (
    await prisma.workOrderOperation.findMany({ where: { workOrderId: { in: woIds } }, select: { operationId: true } })
  ).map((o) => o.operationId);

  const notifIds = (
    await prisma.maintenancePlan.findMany({
      where: { planId: { in: planIds }, notificationId: { not: null } },
      select: { notificationId: true },
    })
  )
    .map((p) => p.notificationId)
    .filter((n): n is string => n !== null);

  const meterIds = (
    await prisma.maintenancePlanMeter.findMany({ where: { planId: { in: planIds } }, select: { meterId: true } })
  ).map((m) => m.meterId);

  console.log('about to remove');
  console.log(`  maintenance plans            ${planIds.length}`);
  console.log(`  work orders (sourcePlan set) ${woIds.length}: ${wos.map((w) => w.woNumber).join(', ')}`);
  console.log(`  of which operations          ${opIds.length}`);
  console.log(`  notifications                ${notifIds.length}`);
  console.log(`  plan meters                  ${meterIds.length}`);

  const counts = await prisma.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    c.workOrderSnapshot = (await tx.workOrderSnapshot.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.costSplit = (await tx.costSplit.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.workOrderChecklist = (await tx.workOrderChecklist.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.workOrderNotifLink = (await tx.workOrderNotifLink.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.externalServiceCost = (await tx.externalServiceCost.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.workOrderMaterial = (await tx.workOrderMaterial.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.laborEntry = (await tx.laborEntry.deleteMany({ where: { operationId: { in: opIds } } })).count;
    c.workOrderOperation = (await tx.workOrderOperation.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.workOrder = (await tx.workOrder.deleteMany({ where: { workOrderId: { in: woIds } } })).count;
    c.meterReading = (await tx.meterReading.deleteMany({ where: { meterId: { in: meterIds } } })).count;
    c.maintenancePlanTarget = (await tx.maintenancePlanTarget.deleteMany({ where: { planId: { in: planIds } } })).count;
    c.maintenancePlanMeter = (await tx.maintenancePlanMeter.deleteMany({ where: { planId: { in: planIds } } })).count;
    c.maintenancePlan = (await tx.maintenancePlan.deleteMany({ where: { planId: { in: planIds } } })).count;
    // Audit rows name the record they describe but hold no FK, so they outlive
    // their subject unless removed explicitly. Left behind they are rows that
    // describe something the database no longer contains.
    c.auditForWorkOrders = (await tx.auditLogEntry.deleteMany({ where: { recordId: { in: woIds } } })).count;
    c.auditForPlans = (await tx.auditLogEntry.deleteMany({ where: { recordId: { in: planIds } } })).count;
    if (notifIds.length) {
      c.notification = (await tx.notification.deleteMany({ where: { notificationId: { in: notifIds } } })).count;
    }
    return c;
  });

  console.log('\nremoved');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(24)} ${v}`);

  console.log('\nafter');
  console.log(`  maintenance plans            ${await prisma.maintenancePlan.count()}`);
  console.log(`  work orders (any)            ${await prisma.workOrder.count({ where: { isDeleted: false } })} open`);
  console.log(`  work orders w/ sourcePlanId  ${await prisma.workOrder.count({ where: { sourcePlanId: { not: null } } })}`);
  console.log(`  open work orders             ${(await prisma.workOrder.findMany({ where: { isDeleted: false }, select: { woNumber: true } })).map((w) => w.woNumber).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());