import { describe, it, expect } from 'vitest';
import {
  isChecklistAcknowledged,
  findBlockingChecklist,
  describeBlockedChecklist,
  countUnansweredItems,
  MandatoryChecklistState,
} from '../../src/utils/checklistRules.js';

const checklist = (over: Partial<MandatoryChecklistState> = {}): MandatoryChecklistState => ({
  templateName: 'LOTO',
  status: 'Completed',
  items: ['Yes', 'No', 'NA'],
  ...over,
});

describe('SOW 3.3.7 mandatory checklist acknowledgement', () => {
  it('accepts a signed-off checklist with every item answered', () => {
    expect(isChecklistAcknowledged(checklist())).toBe(true);
  });

  it('rejects a checklist that is not Completed even with every item answered', () => {
    // Sign-off is required in its own right; answering the questions is not a
    // substitute for it.
    for (const status of ['Pending', 'In Progress']) {
      expect(isChecklistAcknowledged(checklist({ status }))).toBe(false);
    }
  });

  it('rejects a Completed checklist with an unanswered item', () => {
    // This is the case the old gate could not see, because attach pre-filled
    // every item with 'NA' and the blank-response test never matched.
    expect(isChecklistAcknowledged(checklist({ items: ['Yes', null, 'NA'] }))).toBe(false);
  });

  it('rejects a Completed checklist where every item is unanswered', () => {
    expect(isChecklistAcknowledged(checklist({ items: [null, null] }))).toBe(false);
  });

  it('treats NA as a deliberate answer, not as unanswered', () => {
    expect(isChecklistAcknowledged(checklist({ items: ['NA', 'NA'] }))).toBe(true);
  });

  it('treats a whitespace-only response as unanswered', () => {
    expect(isChecklistAcknowledged(checklist({ items: ['Yes', '   '] }))).toBe(false);
  });

  it('accepts a checklist with no items at all', () => {
    // A template with no questions is trivially fully answered. Refusing it
    // would make an empty mandatory template permanently unstartable.
    expect(isChecklistAcknowledged(checklist({ items: [] }))).toBe(true);
  });

  it('counts unanswered items', () => {
    expect(countUnansweredItems(['Yes', null, '', ' ', 'NA'])).toBe(3);
  });
});

describe('findBlockingChecklist', () => {
  it('returns null when every mandatory checklist is acknowledged', () => {
    expect(findBlockingChecklist([checklist(), checklist({ templateName: 'Height' })])).toBeNull();
  });

  it('returns the first blocking checklist', () => {
    const blocking = findBlockingChecklist([
      checklist({ templateName: 'LOTO' }),
      checklist({ templateName: 'Height', status: 'Pending' }),
      checklist({ templateName: 'Confined', items: [null] }),
    ]);
    expect(blocking?.templateName).toBe('Height');
  });

  it('returns null for an empty list', () => {
    expect(findBlockingChecklist([])).toBeNull();
  });
});

describe('describeBlockedChecklist', () => {
  it('reports the sign-off failure when the status is not Completed', () => {
    const r = describeBlockedChecklist(checklist({ status: 'Pending' }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a block');
    expect(r.error).toContain("'LOTO'");
    expect(r.error).toContain('must be completed');
    expect(r.checklistStatus).toBe('Pending');
  });

  it('reports the unanswered count when the status is Completed but items are blank', () => {
    const r = describeBlockedChecklist(checklist({ items: ['Yes', null, null] }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a block');
    expect(r.error).toContain('2 unanswered items');
  });

  it('uses the singular for a single unanswered item', () => {
    const r = describeBlockedChecklist(checklist({ items: [null] }));
    if (r.ok) throw new Error('expected a block');
    expect(r.error).toContain('1 unanswered item');
    expect(r.error).not.toContain('1 unanswered items');
  });
});
