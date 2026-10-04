import { describe, it, expect } from 'vitest';
import { changedFields } from '../../src/middleware/audit.js';
import { AUDITED_FIELDS } from '../../src/middleware/auditFields.js';

// SOW 3.6 asks for a change log carrying old and new values. The failure that
// matters is a comparison that silently matches nothing: the trail stays empty,
// the route returns 200, and nothing anywhere reports a problem. These cases pin
// the behaviour that would let that happen, and the decision is pure, so no
// database is needed to check it.

describe('changedFields', () => {
  it('reports only the columns that actually moved', () => {
    const changes = changedFields(
      { craftCode: 'ELEC', description: 'Old', hourlyRate: 50 },
      { craftCode: 'ELEC', description: 'New', hourlyRate: 60 },
      AUDITED_FIELDS.Craft
    );

    expect(changes.map((c) => c.field).sort()).toEqual(['description', 'hourlyRate']);
    expect(changes.find((c) => c.field === 'hourlyRate')).toEqual({
      field: 'hourlyRate', oldValue: '50', newValue: '60',
    });
    expect(changes.find((c) => c.field === 'description')).toEqual({
      field: 'description', oldValue: 'Old', newValue: 'New',
    });
  });

  it('reports nothing when the row is unchanged', () => {
    const row = { code: 'MECH', name: 'Mechanical', dailyCapacityHours: 8, isActive: true };
    expect(changedFields(row, { ...row }, AUDITED_FIELDS.WorkCenter)).toEqual([]);
  });

  it('treats a move to or from empty as a change, not as no change', () => {
    const changes = changedFields(
      { description: 'Bolt', currentStock: 5 },
      { description: '', currentStock: null },
      AUDITED_FIELDS.Material
    );
    expect(changes).toEqual([
      { field: 'description', oldValue: 'Bolt', newValue: '' },
      { field: 'currentStock', oldValue: '5', newValue: null },
    ]);
  });

  it('does not call a JSON column changed just because key order moved', () => {
    const changes = changedFields(
      { technicalParameters: { voltage: 400, phase: 3, note: 'x' } },
      { technicalParameters: { note: 'x', phase: 3, voltage: 400 } },
      AUDITED_FIELDS.Equipment
    );
    expect(changes).toEqual([]);
  });

  it('does call a JSON column changed when its contents differ', () => {
    const changes = changedFields(
      { technicalParameters: { voltage: 400 } },
      { technicalParameters: { voltage: 415 } },
      AUDITED_FIELDS.Equipment
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].oldValue).toContain('400');
    expect(changes[0].newValue).toContain('415');
  });

  it('compares dates by instant rather than by object identity', () => {
    const when = new Date('2026-03-04T05:06:07.000Z');
    expect(changedFields(
      { installationDate: new Date(when.getTime()) },
      { installationDate: new Date(when.getTime()) },
      AUDITED_FIELDS.Equipment
    )).toEqual([]);

    expect(changedFields(
      { installationDate: null },
      { installationDate: when },
      AUDITED_FIELDS.Equipment
    )).toEqual([{ field: 'installationDate', oldValue: null, newValue: '2026-03-04T05:06:07.000Z' }]);
  });

  it('distinguishes a value that did not change from a column that is simply absent', () => {
    // A misspelled column name is absent from both rows, so it compares equal
    // and produces nothing. This is the silent no-op the registry's compile-time
    // check exists to prevent, and it is why that check is not optional.
    expect(changedFields(
      { descrption: 'typo in both rows' },
      { descrption: 'typo in both rows' },
      ['descrption']
    )).toEqual([]);

    expect(changedFields(
      { description: 'a' },
      { description: 'b' },
      ['description']
    )).toHaveLength(1);
  });

  it('ignores columns outside the supplied list, so system columns never appear', () => {
    const changes = changedFields(
      { craftCode: 'ELEC', modifiedBy: 'alice', modifiedDate: new Date(0), isDeleted: false },
      { craftCode: 'ELEC', modifiedBy: 'bob', modifiedDate: new Date(1), isDeleted: false },
      AUDITED_FIELDS.Craft
    );
    expect(changes).toEqual([]);
  });
});

describe('AUDITED_FIELDS', () => {
  it('lists only columns that exist on the model, checked against Prisma types', () => {
    // The compile-time `satisfies AuditedColumns<T>` check is what makes this
    // table trustworthy; a name that does not exist would compile to nothing to
    // compare and the registry would audit nothing while looking correct.
    for (const [table, fields] of Object.entries(AUDITED_FIELDS)) {
      expect(fields.length, table).toBeGreaterThan(0);
      expect(new Set(fields).size, `${table} has a repeated column`).toBe(fields.length);
    }
  });

  it('never lists a system column', () => {
    const banned = ['createdBy', 'createdDate', 'modifiedBy', 'modifiedDate', 'isDeleted'];
    for (const [table, fields] of Object.entries(AUDITED_FIELDS)) {
      for (const f of fields) expect(banned, `${table}.${f}`).not.toContain(f);
    }
  });

  it("never lists a table's own primary key", () => {
    // Foreign keys ending in Id are deliberately included: reassigning an
    // equipment to a different functional location, or a craft to a different
    // work center, is exactly the kind of edit an auditor wants to see. Only
    // the row's own key is excluded, because it cannot change.
    const ownKey: Record<string, string> = {
      Equipment: 'equipmentId',
      FunctionalLocation: 'functionalLocationId',
      Material: 'materialId',
      WorkCenter: 'workCenterId',
      Craft: 'craftId',
      FailureCode: 'failureCodeId',
      CauseCode: 'causeCodeId',
      TaskList: 'taskListId',
      EquipmentMeter: 'meterId',
      MaintenancePlan: 'planId',
      SafetyChecklistTemplate: 'checklistTemplateId',
      User: 'userId',
      WorkOrder: 'workOrderId',
      WorkOrderOperation: 'operationId',
    };
    expect(Object.keys(ownKey).sort()).toEqual(Object.keys(AUDITED_FIELDS).sort());
    for (const [table, fields] of Object.entries(AUDITED_FIELDS)) {
      expect(fields, `${table} lists its own key`).not.toContain(ownKey[table]);
    }
  });

  it('audits the foreign keys that decide where a row belongs', () => {
    expect(AUDITED_FIELDS.Equipment).toContain('functionalLocationId');
    expect(AUDITED_FIELDS.Craft).toContain('workCenterId');
    expect(AUDITED_FIELDS.MaintenancePlan).toContain('taskListId');
    expect(AUDITED_FIELDS.FailureCode).toContain('parentCodeId');
  });

  it('never lists a column whose diff would leak a secret or duplicate another writer', () => {
    // A diff records the old and new value verbatim, so a hash on this list
    // would put the password itself in the audit trail. The password endpoint
    // stays action-only precisely because of this.
    expect(AUDITED_FIELDS.User).not.toContain('passwordHash');
    // Lockout counters are written by the login path, not by an administrator
    // editing a profile.
    for (const f of ['failedLoginCount', 'lockedUntil', 'lastLogin']) {
      expect(AUDITED_FIELDS.User, `User.${f}`).not.toContain(f);
    }
    // recomputeWorkOrderCosts already diffs the two cost columns on every
    // recompute; listing them here would record the same change twice.
    expect(AUDITED_FIELDS.WorkOrder).not.toContain('plannedCost');
    expect(AUDITED_FIELDS.WorkOrder).not.toContain('actualCost');
    // Generated once at creation and never edited, so a diff could never fire.
    expect(AUDITED_FIELDS.WorkOrder).not.toContain('woNumber');
  });
});
