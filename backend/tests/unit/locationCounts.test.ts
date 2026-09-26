import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  OPEN_WORK_ORDER_STATUSES,
  OPEN_NOTIFICATION_STATUSES,
  toCountMap,
  attachCounts,
  type CountableNode,
} from '../../src/utils/locationCounts.js';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../src/routes/functionalLocations.ts'), 'utf8');
const page = readFileSync(
  resolve(here, '../../../app/src/pages/LocationsPage.tsx'), 'utf8');

// SOW 3.1.1: the tree shows the open work order count and the notification count
// for each node. Neither existed server-side; the screen assembled them by
// issuing one request per node, which on a real plant is hundreds of round trips
// to render one tree.

describe('what counts as open, SOW 3.1.1', () => {
  it('excludes finished and abandoned work orders', () => {
    // Completed and Closed are done. Cancelled is a decision NOT to do the
    // work, which is not outstanding work, and counting it would inflate every
    // location with work nobody is going to do.
    expect(OPEN_WORK_ORDER_STATUSES).not.toContain('Completed');
    expect(OPEN_WORK_ORDER_STATUSES).not.toContain('Closed');
    expect(OPEN_WORK_ORDER_STATUSES).not.toContain('Cancelled');
  });

  it('includes a draft, because it is still live work in the system', () => {
    expect(OPEN_WORK_ORDER_STATUSES).toContain('Draft');
  });

  it('includes every status the work order route can actually produce', () => {
    const all = [
      'Draft', 'Planned', 'Scheduled', 'In Progress',
      'Suspended', 'Completed', 'Closed', 'Cancelled',
    ];
    const covered = new Set([...OPEN_WORK_ORDER_STATUSES, 'Completed', 'Closed', 'Cancelled']);
    expect(all.every((s) => covered.has(s))).toBe(true);
  });

  it('treats a converted notification as still open', () => {
    // Conversion moves the work, it does not finish the issue. The converted
    // notification is what makes the work order it became reach Completed, so
    // counting only Open would hide every converted issue awaiting its work.
    expect(OPEN_NOTIFICATION_STATUSES).toContain('Converted');
    expect(OPEN_NOTIFICATION_STATUSES).toContain('In Process');
    expect(OPEN_NOTIFICATION_STATUSES).not.toContain('Completed');
  });
});

describe('counts roll up the tree', () => {
  const tree = (): CountableNode[] => [
    {
      functionalLocationId: 'plant',
      children: [
        {
          functionalLocationId: 'area-1',
          children: [
            { functionalLocationId: 'unit-1', children: [] },
            { functionalLocationId: 'unit-2', children: [] },
          ],
        },
        { functionalLocationId: 'area-2', children: [] },
      ],
    },
  ];

  it('reports a leaf own count', () => {
    const nodes = attachCounts(tree(), new Map([['unit-1', 3]]), new Map());
    const unit1 = nodes[0].children[0].children[0];
    expect(unit1.openWorkOrderCount).toBe(3);
    expect(unit1.openWorkOrderCountTotal).toBe(3);
  });

  it('sums descendants into an ancestor total', () => {
    const nodes = attachCounts(
      tree(),
      new Map([['unit-1', 3], ['unit-2', 2], ['area-2', 7]]),
      new Map()
    );
    const plant = nodes[0];
    expect(plant.openWorkOrderCountTotal).toBe(12);
    const area1 = plant.children[0];
    expect(area1.openWorkOrderCountTotal).toBe(5);
  });

  it('keeps own count separate from the total, because they answer different questions', () => {
    // A parent's OWN count is only what was raised directly against the parent,
    // which for a Plant is nearly always zero. Showing only that would make the
    // upper tree look idle while the real backlog sits in the leaves.
    const nodes = attachCounts(tree(), new Map([['unit-1', 4]]), new Map());
    expect(nodes[0].openWorkOrderCount).toBe(0);
    expect(nodes[0].openWorkOrderCountTotal).toBe(4);
  });

  it('handles several roots without mixing their totals', () => {
    const nodes = attachCounts(
      [
        { functionalLocationId: 'r1', children: [{ functionalLocationId: 'r1a', children: [] }] },
        { functionalLocationId: 'r2', children: [{ functionalLocationId: 'r2a', children: [] }] },
      ],
      new Map([['r1a', 2], ['r2a', 9]]),
      new Map()
    );
    expect(nodes[0].openWorkOrderCountTotal).toBe(2);
    expect(nodes[1].openWorkOrderCountTotal).toBe(9);
  });

  it('reports zero rather than undefined for a node with no work', () => {
    const nodes = attachCounts(tree(), new Map(), new Map());
    expect(nodes[0].openWorkOrderCount).toBe(0);
    expect(nodes[0].openNotificationCountTotal).toBe(0);
  });

  it('counts notifications independently of work orders', () => {
    const nodes = attachCounts(
      tree(),
      new Map([['unit-1', 1]]),
      new Map([['unit-1', 5], ['area-2', 2]])
    );
    const plant = nodes[0];
    expect(plant.openNotificationCountTotal).toBe(7);
    expect(plant.openWorkOrderCountTotal).toBe(1);
  });

  it('builds a lookup and skips rows with no location', () => {
    const map = toCountMap([
      { functionalLocationId: 'a', _count: { _all: 2 } },
      { functionalLocationId: null, _count: { _all: 9 } },
    ]);
    expect(map.get('a')).toBe(2);
    expect(map.has(null as unknown as string)).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe('the counts are fetched, not recomputed per node', () => {
  it('uses one grouped query per entity', () => {
    expect(route).toMatch(/prisma\.workOrder\.groupBy\(/);
    expect(route).toMatch(/prisma\.notification\.groupBy\(/);
  });

  it('filters both queries to open statuses only', () => {
    expect(route).toMatch(/status: \{ in: \[\.\.\.OPEN_WORK_ORDER_STATUSES\] \}/);
    expect(route).toMatch(/status: \{ in: \[\.\.\.OPEN_NOTIFICATION_STATUSES\] \}/);
  });

  it('ignores soft-deleted rows', () => {
    const tree = route.slice(route.indexOf("router.get('/tree'"));
    expect(tree).toMatch(/isDeleted: false/);
  });

  it('runs the three reads together rather than in sequence', () => {
    expect(route).toMatch(/await Promise\.all\(\[([\s\S]*?)attachCounts/);
  });

  it('the screen no longer downloads every work order and notification', () => {
    // The original defect: one request per node, by filtering full lists here.
    expect(page).not.toMatch(/workOrderService\.getAll\(/);
    expect(page).not.toMatch(/notificationService\.getAll\(/);
  });

  it('the screen reads the rolled-up figures the server computed', () => {
    expect(page).toMatch(/openWorkOrderCountTotal \?\? 0/);
    expect(page).toMatch(/openNotificationCountTotal \?\? 0/);
  });
});
