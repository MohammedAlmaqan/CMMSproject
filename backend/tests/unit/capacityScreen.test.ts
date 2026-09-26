import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { capacityQuerySchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const wcRoute = readFileSync(resolve(here, '../../src/routes/workCenters.ts'), 'utf8');
const panel = readFileSync(
  resolve(here, '../../../app/src/components/capacity/CapacityBoardPanel.tsx'), 'utf8');
const page = readFileSync(resolve(here, '../../../app/src/pages/WorkCentersPage.tsx'), 'utf8');
const service = readFileSync(
  resolve(here, '../../../app/src/services/workCenterService.ts'), 'utf8');

// SOW 3.1.3: "Work centers with capacity (hours/day)" was already Met, and
// "Work centers and crafts used for scheduling" was Partial because no view
// consumed the capacity column. The arithmetic behind the view is tested in
// capacity.test.ts; this file pins the contract around it.

describe('the capacity query is validated', () => {
  it('defaults to a usable window with no parameters at all', () => {
    const { from, to } = capacityQuerySchema.parse({});
    expect(to >= from).toBe(true);
  });

  it('accepts an explicit range', () => {
    expect(capacityQuerySchema.parse({ from: '2026-03-02', to: '2026-03-16' })).toEqual({
      from: '2026-03-02',
      to: '2026-03-16',
    });
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(capacityQuerySchema.safeParse({ from: '02/03/2026' }).success).toBe(false);
  });

  it('rejects a well-formed but nonexistent day', () => {
    // Regex alone would accept 31 February and the board would then start on
    // the 3rd, which is a confusing way to be wrong.
    expect(capacityQuerySchema.safeParse({ from: '2026-02-31' }).success).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(capacityQuerySchema.safeParse({ from: '2026-03-16', to: '2026-03-02' }).success).toBe(false);
  });

  it('rejects a range over 90 days', () => {
    // The board emits a row per centre per day with a per-craft breakdown, so
    // an unbounded range is a trivially available way to ask for a huge payload.
    expect(capacityQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false);
  });

  it('accepts exactly 90 days', () => {
    expect(capacityQuerySchema.safeParse({ from: '2026-01-01', to: '2026-03-31' }).success).toBe(true);
  });
});

describe('the endpoint is reachable and safe', () => {
  it('is registered before the :id route, or it would be read as an id', () => {
    const capacity = wcRoute.indexOf("router.get('/capacity'");
    const byId = wcRoute.indexOf("router.get('/:id'");
    expect(capacity).toBeGreaterThan(-1);
    expect(byId).toBeGreaterThan(-1);
    expect(capacity).toBeLessThan(byId);
  });

  it('inherits authentication from the router', () => {
    expect(wcRoute).toMatch(/router\.use\(authenticate\)/);
  });

  it('books nothing, so it needs no write role', () => {
    // Read-only: it reports what the plan asks for rather than reserving it.
    const start = wcRoute.indexOf("router.get('/capacity'");
    const block = wcRoute.slice(start, wcRoute.indexOf("router.get('/:id'"));
    expect(block).not.toMatch(/authorizeMinRole/);
  });

  it('excludes soft-deleted work centres and work orders', () => {
    const start = wcRoute.indexOf("router.get('/capacity'");
    const block = wcRoute.slice(start, wcRoute.indexOf("router.get('/:id'"));
    expect(block.match(/isDeleted: false/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('says in the docs that drafts are excluded, so the number is explainable', () => {
    expect(wcRoute).toMatch(/Draft work orders are excluded/);
  });

  it('documents the unscheduled hours rather than hiding them', () => {
    expect(wcRoute).toMatch(/unscheduledHours/);
  });
});

describe('the board is on the work centres page', () => {
  it('is rendered there', () => {
    expect(page).toMatch(/<CapacityBoardPanel crafts=\{crafts\} \/>/);
  });

  it('asks the server for the capacity endpoint', () => {
    expect(service).toMatch(/getCapacity/);
    expect(service).toMatch(/`\/work-centers\/capacity/);
  });

  it('omits the query string entirely when no bounds are given', () => {
    // The server defaults the range, so an empty "?from=&to=" would be noise.
    expect(service).toMatch(/`\/work-centers\/capacity\$\{qs \? `\?\$\{qs\}` : ''\}`/);
  });

  it('does not fetch until the planner opens it', () => {
    expect(panel).toMatch(/if \(open\) void load\(range\.from, range\.to\)/);
  });

  it('is collapsed by default, so it costs nothing on page load', () => {
    expect(panel).toMatch(/const \[open, setOpen\] = useState\(false\)/);
  });

  it('catches its own failure instead of taking the page down', () => {
    expect(panel).toMatch(/Could not load the capacity board\./);
  });
});

describe('the board tells the truth about overload', () => {
  it('marks an overloaded day rather than colouring it silently', () => {
    expect(panel).toMatch(/d\.overCapacity \? 'text-amber font-semibold'/);
  });

  it('shows a percentage only when there is a capacity to divide by', () => {
    expect(panel).toMatch(/d\.utilisation === null\s*\? 'n\/a'/);
  });

  it('warns about undated committed work, naming the count of centres', () => {
    // Silently ignoring undated work is how a capacity board ends up looking
    // fine during the week that actually falls over.
    expect(panel).toMatch(/committed hours with no/);
  });

  it('names the work orders behind that warning per centre', () => {
    expect(panel).toMatch(/entry\.unscheduledWorkOrders\.join\(', '\)/);
  });

  it('breaks the load down by craft, using the craft code where it knows it', () => {
    expect(panel).toMatch(/craftName\(c\.craftId\)/);
  });

  it('states the spreading rule, so a surprising number is not a mystery', () => {
    expect(panel).toMatch(/spread evenly across each work/);
  });

  it('says the board books nothing', () => {
    expect(panel).toMatch(/It books nothing/);
  });
});
