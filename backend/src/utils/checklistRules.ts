/**
 * SOW 3.3.7: a work order cannot be set to In Progress unless all mandatory
 * safety checklists are acknowledged.
 *
 * "Acknowledged" is the operative word, and it is an item-level property. The
 * gate used to test only `WorkOrderChecklist.status`, which is the template
 * instance's sign-off state and therefore says nothing about whether anyone
 * actually looked at the individual questions. It tried to compensate with a
 * second test for blank item responses, but that test could never fire: the
 * attach route pre-filled every item with the string 'NA', so a freshly
 * attached mandatory checklist was indistinguishable from a fully answered
 * one. A technician could set a mandatory checklist to Completed without
 * reading a word of it, and the gate passed.
 *
 * Two changes close that, and both are needed:
 *   - `WorkOrderChecklistItem.response` is nullable, and attach no longer
 *     pre-fills it. `null` now genuinely means "not yet answered" and is
 *     distinguishable from a deliberate 'NA'.
 *   - the gate treats an unanswered item (`response === null`) as blocking,
 *     whatever the checklist's status says.
 *
 * 'NA' remains a valid, deliberate answer: some checklist questions genuinely
 * do not apply to a given job, and a technician must be able to record that
 * without lying. It is the *absence* of an answer that blocks, not the answer.
 */

export type ChecklistItemAnswer = string | null;

export interface MandatoryChecklistState {
  /** Template name, for the operator-facing message. */
  templateName: string;
  /** WorkOrderChecklist.status: Pending, In Progress or Completed. */
  status: string;
  /** Every item on this checklist instance, with its answer if answered. */
  items: ChecklistItemAnswer[];
}

export type ChecklistGateResult =
  | { ok: true }
  | { ok: false; error: string; checklist: string; checklistStatus: string };

export const CHECKLIST_STATUS_COMPLETED = 'Completed';

export function countUnansweredItems(items: ChecklistItemAnswer[]): number {
  return items.filter((r) => r === null || r.trim() === '').length;
}

/**
 * Whether one mandatory checklist is sufficiently acknowledged to let work
 * start. Both conditions are required: the checklist must be signed off, and
 * every item must carry an answer.
 */
export function isChecklistAcknowledged(checklist: MandatoryChecklistState): boolean {
  if (checklist.status !== CHECKLIST_STATUS_COMPLETED) return false;
  return countUnansweredItems(checklist.items) === 0;
}

/**
 * Finds the first mandatory checklist that blocks starting work, or null when
 * every mandatory checklist is acknowledged. `checklists` must contain only
 * checklists whose template is marked mandatory.
 */
export function findBlockingChecklist(
  checklists: MandatoryChecklistState[]
): MandatoryChecklistState | null {
  return checklists.find((c) => !isChecklistAcknowledged(c)) ?? null;
}

export function describeBlockedChecklist(checklist: MandatoryChecklistState): ChecklistGateResult {
  const unanswered = countUnansweredItems(checklist.items);
  if (checklist.status !== CHECKLIST_STATUS_COMPLETED) {
    return {
      ok: false,
      error: `Mandatory safety checklist '${checklist.templateName}' must be completed before starting work`,
      checklist: checklist.templateName,
      checklistStatus: checklist.status,
    };
  }
  return {
    ok: false,
    error:
      `Mandatory safety checklist '${checklist.templateName}' has ${unanswered} unanswered ` +
      `${unanswered === 1 ? 'item' : 'items'}; every item must be answered before starting work`,
    checklist: checklist.templateName,
    checklistStatus: checklist.status,
  };
}
