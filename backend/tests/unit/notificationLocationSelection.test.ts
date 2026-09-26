import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { notificationCreateSchema, notificationUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../src/routes/notifications.ts'), 'utf8');

// SOW 3.2.2: "Functional Location / Equipment (mandatory selection)". The matrix
// read the pair as both-required and recorded Partial because equipment was
// optional. The wording is genuinely ambiguous, so this fix is chosen to be
// correct under either reading rather than to bet on one:
//
//   - the selection stays MANDATORY (at least one of the two), and
//   - the location is DERIVED from the equipment when only equipment is given.
//
// The old behaviour forced the reporter to hand-pick a location even when they
// had named a specific machine, and nothing checked the two agreed. That is how
// a notification ends up filed under a location that contradicts its own
// equipment, misreporting under both the location tree and the asset.

const base = {
  type: 'M1',
  priority: 'Medium',
  description: 'Bearing running hot',
  reportedByUserId: 'u-1',
};

describe('the location/equipment selection stays mandatory, SOW 3.2.2', () => {
  it('accepts a location on its own', () => {
    const r = notificationCreateSchema.safeParse({ ...base, functionalLocationId: 'fl-1' });
    expect(r.success).toBe(true);
  });

  it('accepts equipment on its own, and the route fills in the location', () => {
    const r = notificationCreateSchema.safeParse({ ...base, equipmentId: 'eq-1' });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('functionalLocationId');
  });

  it('accepts both together', () => {
    const r = notificationCreateSchema.safeParse({
      ...base, functionalLocationId: 'fl-1', equipmentId: 'eq-1',
    });
    expect(r.success).toBe(true);
  });

  it('refuses a notification attached to neither', () => {
    // This is the actual SOW requirement. Before the fix a location was
    // mandatory and equipment optional, so "neither" was unreachable; now that
    // either is acceptable, the at-least-one rule has to be stated explicitly or
    // an unlocated notification becomes creatable.
    const r = notificationCreateSchema.safeParse({ ...base });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/mandatory/i);
    }
  });

  it('treats an explicit null on both as selecting neither', () => {
    const r = notificationCreateSchema.safeParse({
      ...base, functionalLocationId: null, equipmentId: null,
    });
    expect(r.success).toBe(false);
  });
});

describe('a notification cannot contradict its own equipment', () => {
  it('derives the location from the equipment when only equipment is given', () => {
    expect(route).toMatch(/if \(!resolvedLocationId\) \{\s*\n\s*resolvedLocationId = equipment\.functionalLocationId;/);
  });

  it('refuses a location that contradicts the equipment location', () => {
    // Storing both when they disagree produces a notification whose equipment
    // is not where it says it is, which then misreports twice over.
    expect(route).toMatch(/Equipment is not located at the selected functional location/);
  });

  it('refuses equipment that does not exist or is retired', () => {
    expect(route).toMatch(/where: \{ equipmentId: resolvedEquipmentId, isDeleted: false \}/);
  });

  it('applies the same check when editing, not only when creating', () => {
    // Otherwise the invariant is bypassable by creating a valid notification
    // and then editing one side of the pair.
    const updateChecks = route.match(/Equipment is not located at the selected functional location/g) ?? [];
    expect(updateChecks.length).toBe(2);
  });

  it('resolves the update against the values that will actually be stored', () => {
    // Comparing only the request body would miss an edit that moves only the
    // equipment, leaving the stored location to disagree.
    expect(route).toMatch(/const nextEquipmentId = equipmentId !== undefined \? equipmentId \|\| null : existing\.equipmentId;/);
    expect(route).toMatch(/functionalLocationId !== undefined \? functionalLocationId : existing\.functionalLocationId/);
  });

  it('still allows a location-only notification to be updated freely', () => {
    // No equipment means there is nothing to contradict.
    const r = notificationUpdateSchema.safeParse({ functionalLocationId: 'fl-2' });
    expect(r.success).toBe(true);
  });
});
