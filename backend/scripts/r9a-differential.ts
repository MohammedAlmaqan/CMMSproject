import { prisma } from '../src/utils/prisma.js';
import { computeWorkOrderCosts, roundMoney } from '../src/utils/costRules.js';
import { generatePmWorkOrder } from '../src/services/pmGeneration.js';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

/** What the base relations say a work order is worth, computed independently of
 *  the cache and of the code path under test. */
async function derive(workOrderId: string): Promise<number> {
  const [operations, woMaterials, externalServices, laborEntries] = await Promise.all([
    prisma.workOrderOperation.findMany({ where: { workOrderId, isDeleted: false }, include: { craft: true } }),
    prisma.workOrderMaterial.findMany({ where: { workOrderId, isDeleted: false } }),
    prisma.externalServiceCost.findMany({ where: { workOrderId, isDeleted: false } }),
    prisma.laborEntry.findMany({ where: { isDeleted: false, operation: { workOrderId, isDeleted: false } }, include: { operation: { include: { craft: true } } } }),
  ]);
  return roundMoney(computeWorkOrderCosts({ operations, woMaterials, externalServices, laborEntries } as never).plannedCost);
}

async function main(): Promise<void> {
  // The live database has no maintenance plans: the gate's route tests delete
  // them at teardown. This script builds the plan it needs and removes it, so
  // the check does not depend on leftover state. What it proves is the part
  // that only a real transaction can prove - that the recompute sees the
  // operations the same transaction created, and that its audit row satisfies a
  // real foreign key.
  const [supervisor, location, equipment, workCenter, craft] = await Promise.all([
    prisma.user.findFirst({ where: { isDeleted: false }, select: { userId: true } }),
    prisma.functionalLocation.findFirst({ where: { isDeleted: false }, select: { functionalLocationId: true } }),
    prisma.equipment.findFirst({ where: { isDeleted: false }, select: { equipmentId: true } }),
    prisma.workCenter.findFirst({ where: { isDeleted: false }, select: { workCenterId: true } }),
    prisma.craft.findFirst({ where: { isDeleted: false }, select: { craftId: true, hourlyRate: true }, orderBy: { hourlyRate: 'desc' } }),
  ]);

  if (!supervisor || !location || !equipment || !workCenter || !craft) {
    check('master data available (user, location, equipment, work centre, craft)', false, 'seed data missing');
    process.exitCode = 1;
    return;
  }

  const rate = Number(craft.hourlyRate);
  const taskList = await prisma.taskList.create({
    data: {
      code: `R9A-${Date.now()}`,
      description: 'R.9 A probe',
      workCenterId: workCenter.workCenterId,
      operations: {
        create: [
          { sequenceNumber: 10, description: 'probe a', craftId: craft.craftId, plannedHours: 1.5, numberOfTechnicians: 1, createdBy: supervisor.userId, modifiedBy: supervisor.userId },
          { sequenceNumber: 20, description: 'probe b', craftId: craft.craftId, plannedHours: 0.5, numberOfTechnicians: 1, createdBy: supervisor.userId, modifiedBy: supervisor.userId },
        ],
      },
    },
  });

  const plan = await prisma.maintenancePlan.create({
    data: {
      planCode: `R9A-${Date.now()}`,
      description: 'R.9 A probe plan',
      workCenterId: workCenter.workCenterId,
      equipmentId: equipment.equipmentId,
      functionalLocationId: location.functionalLocationId,
      taskListId: taskList.taskListId,
      strategyType: 'Time',
      intervalValue: 30,
      intervalUnit: 'Days',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      priority: 'Medium',
      generatedWorkOrderStatus: 'Draft',
      createdBy: supervisor.userId,
      modifiedBy: supervisor.userId,
      targets: {
        create: [{ equipmentId: equipment.equipmentId, createdBy: supervisor.userId, modifiedBy: supervisor.userId }],
      },
    },
  });

  const expected = roundMoney(2 * rate);
  console.log(`plan ${plan.planCode}: 2 operations at ${rate}/h -> expected planned ${expected}`);

  const result = await generatePmWorkOrder(prisma, {
    planId: plan.planId,
    cycleKey: '2026-09-30#R9A',
    basis: 'Time',
    actorUserId: 'scheduler',
  });

  check('a work order was generated, not skipped', result.created === true, result.skipReason ?? '');

  const generated = await prisma.workOrder.findUnique({ where: { workOrderId: result.workOrderId } });
  if (!generated) {
    check('the generated work order exists', false);
    return;
  }

  const stored = roundMoney(Number(generated.plannedCost));
  const derived = await derive(result.workOrderId);

  check('stored plannedCost equals the figure derived from its own operations', stored === derived, `stored=${stored} derived=${derived}`);
  check('stored plannedCost equals the hand-computed 2 x rate', stored === expected, `stored=${stored} expected=${expected}`);
  check('the stored figure is not the default zero', stored > 0, `stored=${stored}`);
  check('createdBy keeps the scheduler label', generated.createdBy === 'scheduler', generated.createdBy);
  check('the supervisor is what the foreign keys carry', generated.supervisorUserId === supervisor.userId, generated.supervisorUserId ?? 'null');

  const audit = await prisma.auditLogEntry.findMany({
    where: { recordId: result.workOrderId, fieldName: 'plannedCost' },
  });
  check('the cost change wrote an audit row naming the field', audit.length === 1, `${audit.length} row(s)`);
  check('the audit row names a real user, not the scheduler label', audit[0]?.userId === supervisor.userId, audit[0]?.userId ?? 'none');
  check('the audit row records the move from zero', audit[0]?.oldValue === '0' && audit[0]?.newValue === String(stored), `${audit[0]?.oldValue} -> ${audit[0]?.newValue}`);

  // A second generation for the same cycle is a skip, and must not write a cost
  // or an audit row: the idempotency guard has to come first.
  const again = await generatePmWorkOrder(prisma, { planId: plan.planId, cycleKey: '2026-09-30#R9A', basis: 'Time', actorUserId: 'scheduler' });
  check('the same cycle is skipped, not regenerated', again.created === false, again.skipReason ?? '');
  const auditAfter = await prisma.auditLogEntry.count({ where: { recordId: result.workOrderId, fieldName: 'plannedCost' } });
  check('a skipped generation writes no second audit row', auditAfter === 1, `${auditAfter} row(s)`);

  console.log(`\ngenerated ${generated.woNumber}: stored planned=${stored} derived=${derived}`);

  // Dependency order: operations restrict the work order, targets cascade from
  // the plan, operations restrict the task list.
  await prisma.$transaction(async (tx) => {
    await tx.workOrderOperation.deleteMany({ where: { workOrderId: result.workOrderId } });
    await tx.auditLogEntry.deleteMany({ where: { recordId: result.workOrderId } });
    await tx.workOrder.delete({ where: { workOrderId: result.workOrderId } });
    await tx.maintenancePlan.delete({ where: { planId: plan.planId } });
    await tx.taskListOperation.deleteMany({ where: { taskListId: taskList.taskListId } });
    await tx.taskList.delete({ where: { taskListId: taskList.taskListId } });
  });
  console.log('probe rows removed');

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
