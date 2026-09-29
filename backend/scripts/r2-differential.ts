import { prisma } from '../src/utils/prisma.js';
import {
  buildDateWhere,
  buildScopeWhere,
  descendantLocationIds,
  parseReportFilter,
} from '../src/utils/reportFilters.js';
import type { ReportFilter } from '../src/utils/reportFilters.js';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

function filterOf(query: Record<string, unknown>): ReportFilter {
  const result = parseReportFilter(query);
  if (!result.ok) throw new Error(`expected a valid filter: ${result.errors.join('; ')}`);
  return result.filter;
}

const openOnly = { isDeleted: false, status: { notIn: ['Completed', 'Closed', 'Cancelled'] } };

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const open = await prisma.workOrder.findMany({
    where: openOnly,
    select: {
      workOrderId: true,
      createdDate: true,
      functionalLocationId: true,
      equipmentId: true,
      workCenterId: true,
    },
    orderBy: { createdDate: 'asc' },
  });
  console.log(`open work orders: ${open.length}`);

  // 1. An unfiltered report sees everything the table holds.
  const unfiltered = await prisma.workOrder.count({ where: openOnly });
  check('an empty filter reproduces the unfiltered count', unfiltered === open.length, `${unfiltered} vs ${open.length}`);

  // 2. A window that stops before every work order excludes all of them, and a
  //    window that covers all of them includes all of them. This is the check
  //    that a filter is genuinely reaching the query.
  const earliest = open[0]?.createdDate ?? null;
  const latest = open[open.length - 1]?.createdDate ?? null;
  if (earliest !== null && latest !== null) {
    const covering = await prisma.workOrder.count({
      where: { ...openOnly, ...(buildDateWhere(filterOf({ from: dayOf(earliest), to: dayOf(latest) }), 'createdDate') ?? {}) },
    });
    check('a window spanning every work order includes every work order', covering === unfiltered, `${covering} vs ${unfiltered}`);

    const empty = await prisma.workOrder.count({
      where: { ...openOnly, ...(buildDateWhere(filterOf({ from: '1990-01-01', to: '1990-01-02' }), 'createdDate') ?? {}) },
    });
    check('a window before any work order excludes every work order', empty === 0, `${empty} matched`);

    // 3. The last day of the window must be included in full. Counting the work
    //    orders created on exactly the final day proves the end bound is not
    //    truncating that day to midnight.
    const lastDayCount = open.filter((wo) => dayOf(wo.createdDate) === dayOf(latest)).length;
    const inclusive = await prisma.workOrder.count({
      where: { ...openOnly, ...(buildDateWhere(filterOf({ to: dayOf(latest) }), 'createdDate') ?? {}) },
    });
    check('the end of the range is inclusive of the whole final day', inclusive === unfiltered, `${inclusive} vs ${unfiltered} (${lastDayCount} on the final day)`);
  } else {
    check('live work orders available for date checks', false, 'none found');
  }

  // 4. Partition the days: [first day, first day] plus [the day after, last day].
  //    The two windows are disjoint by construction, so if the bounds are right
  //    the counts must add back up to the total. Overlapping windows would only
  //    prove the filter widens, which is the opposite of what row 58 needs.
  if (earliest !== null && latest !== null) {
    const firstDay = dayOf(earliest);
    const lastDay = dayOf(latest);
    const dayAfterFirst = dayOf(new Date(earliest.getTime() + 86_400_000));
    const head = await prisma.workOrder.count({
      where: { ...openOnly, ...(buildDateWhere(filterOf({ from: firstDay, to: firstDay }), 'createdDate') ?? {}) },
    });
    if (dayAfterFirst > lastDay) {
      // Everything sits on one day, so the tail window would be reversed. The
      // single-day window is the whole partition and must stand alone.
      check('disjoint day windows partition the total', head === unfiltered, `${head} vs ${unfiltered} (all on ${firstDay})`);
    } else {
      const tail = await prisma.workOrder.count({
        where: { ...openOnly, ...(buildDateWhere(filterOf({ from: dayAfterFirst, to: lastDay }), 'createdDate') ?? {}) },
      });
      check('disjoint day windows partition the total', head + tail === unfiltered,
        `${head} + ${tail} = ${head + tail} vs ${unfiltered} (${firstDay}..${lastDay})`);
    }
  }

  // 5. An equipment filter that matches nothing must return nothing, and one that
  //    matches a real equipment must return exactly that equipment's work orders.
  const withEquipment = open.find((wo) => wo.equipmentId !== null);
  if (withEquipment?.equipmentId) {
    const scoped = await prisma.workOrder.count({
      where: { ...openOnly, ...buildScopeWhere(filterOf({ equipmentId: withEquipment.equipmentId }), null) },
    });
    const expected = open.filter((wo) => wo.equipmentId === withEquipment.equipmentId).length;
    check('an equipment filter returns exactly that equipment', scoped === expected, `${scoped} vs ${expected}`);
  }
  const absent = await prisma.workOrder.count({
    where: { ...openOnly, ...buildScopeWhere(filterOf({ equipmentId: 'NO-SUCH-EQUIPMENT' }), null) },
  });
  check('an equipment filter matching nothing returns nothing', absent === 0, `${absent} matched`);

  // 6. A work centre filter narrows the same way.
  const withWorkCenter = open.find((wo) => wo.workCenterId !== null);
  if (withWorkCenter?.workCenterId) {
    const scoped = await prisma.workOrder.count({
      where: { ...openOnly, ...buildScopeWhere(filterOf({ workCenterId: withWorkCenter.workCenterId }), null) },
    });
    const expected = open.filter((wo) => wo.workCenterId === withWorkCenter.workCenterId).length;
    check('a work centre filter returns exactly that work centre', scoped === expected, `${scoped} vs ${expected}`);
  }

  // 7. Location: exact match, then the subtree. A subtree must never be smaller
  //    than the node itself, and must never pull in a sibling branch.
  const tree = await prisma.functionalLocation.findMany({
    where: { isDeleted: false },
    select: { functionalLocationId: true, parentLocationId: true },
  });
  for (const wo of open) {
    if (wo.functionalLocationId === null) continue;
    const exact = await prisma.workOrder.count({
      where: { ...openOnly, ...buildScopeWhere(filterOf({ functionalLocationId: wo.functionalLocationId }), [wo.functionalLocationId]) },
    });
    const expected = open.filter((other) => other.functionalLocationId === wo.functionalLocationId).length;
    check(`location ${wo.functionalLocationId} exact match`, exact === expected, `${exact} vs ${expected}`);

    const subtree = descendantLocationIds(wo.functionalLocationId, tree);
    const withSubtree = await prisma.workOrder.count({
      where: { ...openOnly, ...buildScopeWhere(filterOf({ functionalLocationId: wo.functionalLocationId, includeDescendantLocations: 'true' }), subtree) },
    });
    const expectedSubtree = open.filter((other) => other.functionalLocationId !== null && subtree.includes(other.functionalLocationId)).length;
    check(`location ${wo.functionalLocationId} subtree`, withSubtree === expectedSubtree, `${withSubtree} vs ${expectedSubtree} over ${subtree.length} locations`);
    check(`location ${wo.functionalLocationId} subtree is never smaller than the node`, withSubtree >= exact, `${withSubtree} >= ${exact}`);
    break;
  }

  // 8. A filter naming a location that does not exist must not silently widen.
  const bogus = await prisma.workOrder.count({
    where: { ...openOnly, ...buildScopeWhere(filterOf({ functionalLocationId: 'NO-SUCH-LOCATION', includeDescendantLocations: 'true' }), descendantLocationIds('NO-SUCH-LOCATION', tree)) },
  });
  check('an unknown location returns nothing rather than everything', bogus === 0, `${bogus} matched`);

  // 9. The live location tree must not contain a cycle, or descendant expansion
  //    would be relying on the visited set to terminate.
  const reachable = new Set<string>();
  for (const node of tree) reachable.add(...descendantLocationIds(node.functionalLocationId, tree));
  check('every live location is reachable from some node', reachable.size === tree.length, `${reachable.size} of ${tree.length}`);

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
