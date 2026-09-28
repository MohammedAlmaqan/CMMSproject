import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkLocationMove } from '../../src/utils/locationRules.js';

const here = dirname(fileURLToPath(import.meta.url));
const locationRoute = readFileSync(
  resolve(here, '../../src/routes/functionalLocations.ts'), 'utf8');
const craftRoute = readFileSync(resolve(here, '../../src/routes/crafts.ts'), 'utf8');
const taskListRoute = readFileSync(
  resolve(here, '../../src/routes/taskLists.ts'), 'utf8');

// Three holes found re-reading C.3, C.9 and C.13 after they shipped.
//
// Each is a case where the rule exists, is enforced on one path, and the other
// path reopens it. A rule that only guards creation is not a rule, because the
// edit is always available and always cheaper.

describe('a re-parent cannot reopen the lowest-level rule', () => {
  it('refuses to move a location under a parent that holds equipment', () => {
    // The parent becomes a non-leaf while still holding equipment, which is
    // exactly what adding a child beneath it is refused for.
    const r = checkLocationMove({
      newParentHasEquipment: true,
      wouldCreateCycle: false,
      movedHasEquipment: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/holds equipment/);
  });

  it('allows the move when the new parent is empty', () => {
    expect(checkLocationMove({
      newParentHasEquipment: false,
      wouldCreateCycle: false,
      movedHasEquipment: true,
    }).ok).toBe(true);
  });

  it('refuses a cycle, which would make the tree endpoint spin', () => {
    const r = checkLocationMove({
      newParentHasEquipment: false,
      wouldCreateCycle: true,
      movedHasEquipment: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/descendant/);
  });

  it('checks the cycle before the equipment rule, so the clearer error wins', () => {
    // A self-parented location that also holds equipment is a cycle first; the
    // equipment message would send the user looking in the wrong place.
    const r = checkLocationMove({
      newParentHasEquipment: true,
      wouldCreateCycle: true,
      movedHasEquipment: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/descendant/);
  });

  it('is actually called from the update route, not just defined', () => {
    expect(locationRoute).toMatch(/checkLocationMove\(/);
  });

  it('only pays for the walk when the parent actually changes', () => {
    // Otherwise every rename of a location would walk the whole tree.
    expect(locationRoute).toMatch(
      /parentLocationId !== undefined && \(parentLocationId \|\| null\) !== existing\.parentLocationId/);
  });

  it('rejects self-parenting before consulting the database', () => {
    expect(locationRoute).toMatch(
      /if \(newParentId === selfId\) \{[\s\S]{0,200}own parent/);
  });

  it('walks up from the proposed parent to detect the cycle', () => {
    // Checking only direct self-reference would let A move under A's own child.
    expect(locationRoute).toMatch(/while \(cursor\) \{[\s\S]{0,400}cursor === selfId/);
  });

  it('refuses a parent that does not exist rather than orphaning the row', () => {
    expect(locationRoute).toMatch(/Parent functional location not found/);
  });
});

describe('a craft used only by a task list cannot be retired', () => {
  it('counts task list steps as well as work order operations', () => {
    expect(craftRoute).toMatch(/prisma\.taskListOperation\.count\(\{ where: \{ craftId, isDeleted: false \} \}\)/);
  });

  it('counts historical work order operations, because they keep the cost basis', () => {
    // A closed work order must stay costable, so its operations must keep
    // pointing at a live craft forever. Filtering these by a date or status
    // would let a craft be retired out from under settled history.
    expect(craftRoute).toMatch(/prisma\.workOrderOperation\.count\(\{ where: \{ craftId \} \}\)/);
  });

  it('names which source still holds the craft', () => {
    // "Still referenced by an operation" sent the user to work orders when the
    // real reference was a template.
    expect(craftRoute).toMatch(/a task list step/);
  });
});

describe('deleting a task list retires its steps', () => {
  it('soft-deletes the steps rather than leaving them live under a dead list', () => {
    // A live step under a soft-deleted list keeps its craft reference forever,
    // so that craft could never be retired.
    expect(taskListRoute).toMatch(
      /taskListOperation\.updateMany\(\{[\s\S]{0,200}isDeleted: true/);
  });

  it('soft-deletes the requirements with the steps, so nothing outlives them', () => {
    // The sweep added isDeleted to TaskListMaterial, so the requirements now
    // retire alongside the step they describe instead of being hard-deleted.
    // A live requirement under a dead step would leak material rows forever.
    expect(taskListRoute).toMatch(
      /taskListMaterial\.updateMany\(\{[\s\S]{0,200}taskOperationId: \{ in: superseded[\s\S]{0,200}isDeleted: true/);
  });

  it('does the three writes in one transaction', () => {
    // A partial failure that soft-deleted the list but left steps live would
    // reproduce the very bug this fixes.
    const start = taskListRoute.indexOf('router.delete');
    const body = taskListRoute.slice(start);
    expect(body).toMatch(/prisma\.\$transaction\(async \(tx\) => \{/);
  });
});
