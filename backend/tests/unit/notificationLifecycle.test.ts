import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TRANSITIONS,
  canTransition,
  transitionTargets,
  invalidTransitionMessage,
} from '../../src/utils/transitions.js';

// SOW 3.2.1: "Transition validity enforced (illegal transitions rejected)" and
// SOW 3.2.3: "After work order completion, notification status can be set to
// Completed manually or automatically".
//
// Before this map existed, PUT /api/notifications/:id wrote `status` straight
// from the request body, so every one of these illegal cases was accepted.

describe('notification lifecycle map', () => {
  it('declares a transition set for every known status', () => {
    for (const status of NOTIFICATION_STATUSES) {
      expect(Array.isArray(NOTIFICATION_TRANSITIONS[status])).toBe(true);
    }
  });

  it('has no transition target outside the known status set', () => {
    for (const status of NOTIFICATION_STATUSES) {
      for (const target of transitionTargets(status)) {
        expect(NOTIFICATION_STATUSES).toContain(target);
      }
    }
  });

  it('treats Completed as terminal', () => {
    expect(transitionTargets('Completed')).toEqual([]);
    for (const target of NOTIFICATION_STATUSES) {
      expect(canTransition('Completed', target)).toBe(false);
    }
  });

  it('allows the convert-to-work-order path only from Open or In Process', () => {
    expect(canTransition('Open', 'Converted')).toBe(true);
    expect(canTransition('In Process', 'Converted')).toBe(true);
    expect(canTransition('Completed', 'Converted')).toBe(false);
  });

  it('allows Converted to reach Completed so the conversion queue can clear', () => {
    // SOW 3.2.3, the automatic path. The work order status route relies on this.
    expect(canTransition('Converted', 'Completed')).toBe(true);
  });

  it('rejects reviving a Converted notification back to Open', () => {
    expect(canTransition('Converted', 'Open')).toBe(false);
    expect(canTransition('Converted', 'In Process')).toBe(false);
  });

  it('rejects skipping backwards through the lifecycle', () => {
    expect(canTransition('Open', 'In Process')).toBe(true);
    expect(canTransition('In Process', 'Open')).toBe(false);
  });

  it('allows Open straight to Completed for work that needs no work order', () => {
    expect(canTransition('Open', 'Completed')).toBe(true);
  });

  it('rejects an unknown origin status rather than defaulting to allow', () => {
    expect(canTransition('Deleted', 'Open')).toBe(false);
    expect(canTransition('', 'Open')).toBe(false);
    expect(transitionTargets('Deleted')).toEqual([]);
  });

  it('rejects any transition out of a status that is not in the map', () => {
    expect(canTransition('Converted', 'Converted')).toBe(false);
  });

  it('reports the illegal transition in the same shape as the work order route', () => {
    expect(invalidTransitionMessage('Completed', 'Open')).toBe(
      "Invalid transition from 'Completed' to 'Open'"
    );
  });
});
