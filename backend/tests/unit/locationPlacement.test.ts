import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkEquipmentPlacement, checkChildAddition } from '../../src/utils/locationRules.js';

const here = dirname(fileURLToPath(import.meta.url));
const equipmentRoute = readFileSync(resolve(here, '../../src/routes/equipment.ts'), 'utf8');
const locationRoute = readFileSync(resolve(here, '../../src/routes/functionalLocations.ts'), 'utf8');

// SOW 3.1.2: each equipment record is assigned to exactly one functional
// location, and it is the LOWEST level. The matrix recorded the "exactly one"
// half as enforced by the non-nullable foreign key, and the "lowest level" half
// as not validated at all.
//
// The definition matters. There is no level column, and a location's depth is a
// property of the surrounding tree rather than of the row, so lowest level is
// defined structurally: a location with no non-deleted children. Deriving it
// from the locationType label instead would be wrong in both directions.

describe('lowest level is decided by structure, not by the type label', () => {
  it('accepts a location with no children', () => {
    expect(checkEquipmentPlacement({ hasChildren: false }).ok).toBe(true);
  });

  it('refuses a location that has children', () => {
    const r = checkEquipmentPlacement({ hasChildren: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lowest-level/i);
  });

  it('says which way round the problem is, so the message is actionable', () => {
    const r = checkEquipmentPlacement({ hasChildren: true });
    if (!r.ok) expect(r.error).toMatch(/child locations/);
  });
});

describe('the invariant is also protected from the other direction', () => {
  it('refuses a child under a location that already holds equipment', () => {
    // The decay nobody checks: equipment is placed at a leaf, then somebody
    // adds a child beneath it, and the equipment is now at a location that is no
    // longer lowest level. Nothing about the equipment row changes.
    const r = checkChildAddition({ hasEquipment: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Move the equipment down/i);
  });

  it('allows a child under a location holding no equipment', () => {
    expect(checkChildAddition({ hasEquipment: false }).ok).toBe(true);
  });
});

describe('equipment placement is enforced on both write paths', () => {
  it('checks the location on create', () => {
    expect(equipmentRoute).toMatch(/const placement = await checkEquipmentIsAtLeaf\(functionalLocationId\);/);
  });

  it('re-checks only when the location is actually moving', () => {
    // An unrelated edit, such as correcting a serial number, must not be blocked
    // by a hierarchy rule it does not touch.
    expect(equipmentRoute).toMatch(
      /functionalLocationId !== undefined && functionalLocationId !== existing\.functionalLocationId/
    );
  });

  it('confirms the location exists and is not retired', () => {
    expect(equipmentRoute).toMatch(/where: \{ functionalLocationId, isDeleted: false \}/);
    expect(equipmentRoute).toMatch(/Functional location not found/);
  });

  it('counts only non-deleted children', () => {
    // Soft-deleted children leave the location a leaf again, so counting them
    // would wrongly block placement.
    expect(equipmentRoute).toMatch(
      /children: \{ where: \{ isDeleted: false \} \}/
    );
  });
});

describe('the functional location route guards the reverse direction', () => {
  it('checks the parent before creating a child', () => {
    expect(locationRoute).toMatch(/const childCheck = checkChildAddition\(\{ hasEquipment: parent\._count\.equipment > 0 \}\);/);
  });

  it('only applies when a parent was named', () => {
    // A root location has no parent to contradict.
    expect(locationRoute).toMatch(/if \(parentLocationId\) \{/);
  });

  it('refuses an unknown parent rather than creating an orphan', () => {
    expect(locationRoute).toMatch(/Parent functional location not found/);
  });

  it('counts only non-deleted equipment', () => {
    expect(locationRoute).toMatch(/equipment: \{ where: \{ isDeleted: false \} \}/);
  });
});
