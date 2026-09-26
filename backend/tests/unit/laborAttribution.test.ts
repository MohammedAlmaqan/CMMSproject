import { describe, it, expect } from 'vitest';
import {
  resolveAttributedUser,
  ATTRIBUTION_OVERRIDE_FLOOR,
} from '../../src/utils/attribution.js';
import { roleLevel } from '../../src/utils/roles.js';

// SOW 3.3.5: "Technician identification via login; entries stamped with user and
// timestamp".
//
// The defect: POST /api/labor and PUT /api/labor/:id took `userId` from the
// request body and stored it verbatim, so any Technician could book hours
// against any other user and move labour cost between technicians.
//
// These cases pin the replacement policy. The pre-fix behaviour is asserted
// first in each group so the test documents what changed.

const TECH = { userId: 'tech-1', role: 'Technician' };
const OTHER_TECH = { userId: 'tech-2', role: 'Technician' };
const SUPERVISOR = { userId: 'sup-1', role: ATTRIBUTION_OVERRIDE_FLOOR };
const PLANNER = { userId: 'plan-1', role: 'Maintenance Planner' };
const ADMIN = { userId: 'adm-1', role: 'Administrator' };
const VIEW_ONLY = { userId: 'view-1', role: 'View-Only' };

describe('labour attribution, SOW 3.3.5', () => {
  it('attributes labour to the caller when no userId is supplied', () => {
    const d = resolveAttributedUser(TECH, undefined);
    expect(d.userId).toBe('tech-1');
    expect(d.outcome).toBe('none');
    expect(d.rejected).toBe(false);
  });

  it('attributes labour to the caller when the userId is their own', () => {
    const d = resolveAttributedUser(TECH, 'tech-1');
    expect(d.userId).toBe('tech-1');
    expect(d.outcome).toBe('none');
    expect(d.rejected).toBe(false);
  });

  it('rejects a Technician booking labour for another technician', () => {
    const d = resolveAttributedUser(TECH, 'tech-2');
    // must not silently book it to tech-2, and must not silently book tech-1
    // either: the route rejects so a misconfigured client surfaces.
    expect(d.rejected).toBe(true);
    expect(d.userId).toBe('tech-1');
    expect(d.requestedUserId).toBe('tech-2');
  });

  it.each([
    ['Requester', { userId: 'req-1', role: 'Requester' }],
    ['View-Only', VIEW_ONLY],
    ['Technician', TECH],
  ])('refuses an override attempt from %s', (_label, caller) => {
    expect(resolveAttributedUser(caller, 'someone-else').rejected).toBe(true);
  });

  it.each([
    ['Maintenance Supervisor', SUPERVISOR],
    ['Maintenance Planner', PLANNER],
    ['Administrator', ADMIN],
  ])('allows an audited override from %s', (_label, caller) => {
    const d = resolveAttributedUser(caller, 'tech-2');
    expect(d.rejected).toBe(false);
    expect(d.outcome).toBe('override');
    expect(d.userId).toBe('tech-2');
  });

  it('does not treat a supervisor naming themselves as an override', () => {
    const d = resolveAttributedUser(SUPERVISOR, 'sup-1');
    expect(d.outcome).toBe('none');
    expect(d.rejected).toBe(false);
  });

  it('ignores an empty or non-string userId rather than booking it', () => {
    for (const bad of ['', '   '.trim(), null, undefined, 42, {}, []]) {
      const d = resolveAttributedUser(TECH, bad);
      expect(d.userId).toBe('tech-1');
      expect(d.rejected).toBe(false);
    }
  });

  it('places the override floor above Technician and below Planner', () => {
    const floor = roleLevel(ATTRIBUTION_OVERRIDE_FLOOR);
    expect(floor).toBeGreaterThan(roleLevel('Technician'));
    expect(floor).toBeLessThan(roleLevel('Maintenance Planner'));
  });

  it('treats an unknown role as level 0, so no override is possible', () => {
    expect(roleLevel('Nonexistent')).toBe(0);
    expect(roleLevel(undefined)).toBe(0);
    expect(resolveAttributedUser({ userId: 'x', role: 'Nonexistent' }, 'y').rejected).toBe(true);
  });

  it('would have allowed the pre-fix misattribution, which is the defect being closed', () => {
    // Documents the old behaviour: the body was trusted verbatim.
    const oldBehaviour = (caller: { userId: string }, requested: string) => requested;
    expect(oldBehaviour(TECH, OTHER_TECH.userId)).toBe('tech-2');
    // and the new policy does not
    expect(resolveAttributedUser(TECH, OTHER_TECH.userId).rejected).toBe(true);
  });
});
