import { describe, it, expect } from 'vitest';
import {
  QUERY_FIELDS,
  mergeWhere,
  parseCollectionQuery,
  selectRows,
} from '../../src/utils/queryGrammar.js';
import type { ParsedCollectionQuery } from '../../src/utils/queryGrammar.js';

const ok = (query: Record<string, unknown>): ParsedCollectionQuery => {
  const result = parseCollectionQuery(query, QUERY_FIELDS.workOrder);
  if (!result.ok) throw new Error(`expected valid, got: ${result.errors.join('; ')}`);
  return result.query;
};

const errors = (query: Record<string, unknown>): string[] => {
  const result = parseCollectionQuery(query, QUERY_FIELDS.workOrder);
  if (result.ok) throw new Error('expected the query to be rejected');
  return result.errors;
};

const where = (filter: string): Record<string, unknown> => {
  const query = ok({ $filter: filter });
  if (query.where === null) throw new Error('expected a where fragment');
  return query.where;
};

describe('absent parameters', () => {
  it('returns no clause when nothing is supplied', () => {
    expect(ok({})).toEqual({ where: null, orderBy: null, skip: null, take: null, select: null });
  });

  it('treats an empty value as absent rather than as an empty filter', () => {
    expect(ok({ $filter: '', $select: '', $orderby: '', $top: '', $skip: '' }).where).toBeNull();
  });
});

describe('$top and $skip', () => {
  it('reads non-negative integers', () => {
    expect(ok({ $top: '25' }).take).toBe(25);
    expect(ok({ $skip: '10' }).skip).toBe(10);
    expect(ok({ $top: '0' }).take).toBe(0);
  });

  it('rejects a negative number', () => {
    expect(errors({ $top: '-1' }).join(' ')).toMatch(/\$top must be a non-negative integer/);
  });

  it('rejects a non-integer', () => {
    expect(errors({ $skip: '1.5' }).join(' ')).toMatch(/\$skip must be a non-negative integer/);
    expect(errors({ $top: 'abc' }).join(' ')).toMatch(/\$top must be a non-negative integer/);
  });

  it('caps $top so a caller cannot request an unbounded page', () => {
    expect(errors({ $top: '501' }).join(' ')).toMatch(/between 0 and 500/);
    expect(ok({ $top: '500' }).take).toBe(500);
  });

  it('allows a large $skip, which is an offset not a page size', () => {
    expect(ok({ $skip: '100000' }).skip).toBe(100000);
  });
});

describe('$select', () => {
  it('reads a comma-separated field list', () => {
    expect(ok({ $select: 'woNumber,status' }).select).toEqual(['woNumber', 'status']);
  });

  it('tolerates whitespace and ignores duplicates', () => {
    expect(ok({ $select: ' status , woNumber , status ' }).select).toEqual(['status', 'woNumber']);
  });

  it('rejects a field the resource does not expose', () => {
    expect(errors({ $select: 'woNumber,secret' }).join(' ')).toMatch(/unknown field "secret"/);
  });
});

describe('$orderby', () => {
  it('reads a multi-key ordering and defaults to ascending', () => {
    expect(ok({ $orderby: 'createdDate desc,priority' }).orderBy).toEqual([
      { createdDate: 'desc' },
      { priority: 'asc' },
    ]);
  });

  it('rejects an unknown field', () => {
    expect(errors({ $orderby: 'createdDate,nope' }).join(' ')).toMatch(/unknown field "nope"/);
  });

  it('rejects a direction that is neither asc nor desc', () => {
    expect(errors({ $orderby: 'createdDate sideways' }).join(' ')).toMatch(/asc or desc/);
  });
});

describe('$filter comparisons', () => {
  it('matches text exactly with eq and negates with ne', () => {
    expect(where("priority eq 'High'")).toEqual({ priority: 'High' });
    expect(where("priority ne 'High'")).toEqual({ NOT: { priority: 'High' } });
  });

  it('reads a single-quoted string and unescapes a doubled quote', () => {
    expect(where("description eq 'O''Brien pump'")).toEqual({ description: "O'Brien pump" });
  });

  it('does a case-insensitive contains on a text field', () => {
    expect(where("status contains 'progress'")).toEqual({
      status: { contains: 'progress', mode: 'insensitive' },
    });
  });

  it('compares numbers with the full operator set', () => {
    expect(where('plannedCost eq 100')).toEqual({ plannedCost: 100 });
    expect(where('plannedCost gt 100')).toEqual({ plannedCost: { gt: 100 } });
    expect(where('plannedCost ge 100')).toEqual({ plannedCost: { gte: 100 } });
    expect(where('plannedCost lt 100')).toEqual({ plannedCost: { lt: 100 } });
    expect(where('plannedCost le 100')).toEqual({ plannedCost: { lte: 100 } });
  });

  it('compares dates by parsing an ISO string', () => {
    expect(where("createdDate ge '2026-01-31'")).toEqual({
      createdDate: { gte: new Date('2026-01-31') },
    });
  });

  it('accepts a boolean literal for a yes/no field', () => {
    expect(where('breakdownFlag eq true')).toEqual({ breakdownFlag: true });
    expect(where('breakdownFlag ne false')).toEqual({ NOT: { breakdownFlag: false } });
  });

  it('rejects a quoted number where a numeric field is named', () => {
    expect(errors({ $filter: "plannedCost eq '100'" }).join(' ')).toMatch(/expected a numeric value/);
  });

  it('rejects contains on a non-text field', () => {
    expect(errors({ $filter: 'plannedCost contains 100' }).join(' ')).toMatch(
      /contains applies only to text fields/
    );
  });

  it('rejects an ordering comparison on a yes/no field', () => {
    expect(errors({ $filter: 'breakdownFlag gt true' }).join(' ')).toMatch(
      /only eq and ne apply/
    );
  });

  it('rejects an unparseable date', () => {
    expect(errors({ $filter: "createdDate eq 'soon'" }).join(' ')).toMatch(/not a valid date/);
  });

  it('rejects a field the resource does not expose', () => {
    expect(errors({ $filter: "secret eq 'x'" }).join(' ')).toMatch(/unknown field "secret"/);
  });
});

describe('$filter boolean structure', () => {
  it('binds and tighter than or', () => {
    expect(where("priority eq 'High' or status eq 'Closed' and type eq 'CM'")).toEqual({
      OR: [
        { priority: 'High' },
        { AND: [{ status: 'Closed' }, { type: 'CM' }] },
      ],
    });
  });

  it('groups with parentheses', () => {
    expect(where("(priority eq 'High' or status eq 'Closed') and type eq 'CM'")).toEqual({
      AND: [
        { OR: [{ priority: 'High' }, { status: 'Closed' }] },
        { type: 'CM' },
      ],
    });
  });

  it('reports a missing closing parenthesis', () => {
    expect(errors({ $filter: "(priority eq 'High'" }).join(' ')).toMatch(/closing parenthesis/);
  });

  it('reports trailing input after a complete expression', () => {
    expect(errors({ $filter: "priority eq 'High' leftover" }).join(' ')).toMatch(/trailing input/);
  });

  it('reports an unterminated string', () => {
    expect(errors({ $filter: "priority eq 'High" }).join(' ')).toMatch(/unterminated string/);
  });

  it('reports a missing comparison operator', () => {
    expect(errors({ $filter: "priority 'High'" }).join(' ')).toMatch(/comparison operator/);
  });
});

describe('repeated parameters', () => {
  it('rejects a parameter supplied more than once', () => {
    expect(errors({ $top: ['1', '2'] }).join(' ')).toMatch(/\$top was supplied 2 times/);
  });
});

describe('mergeWhere', () => {
  it('returns the base untouched when there is no filter', () => {
    const base = { isDeleted: false };
    expect(mergeWhere(base, null)).toBe(base);
  });

  it('adds a filter as an and-clause', () => {
    expect(mergeWhere({ isDeleted: false }, { priority: 'High' })).toEqual({
      isDeleted: false,
      AND: [{ priority: 'High' }],
    });
  });

  it("appends to an existing and-clause rather than replacing it", () => {
    const base = { isDeleted: false, AND: [{ workCenterId: 'wc-1' }] };
    expect(mergeWhere(base, { priority: 'High' })).toEqual({
      isDeleted: false,
      AND: [{ workCenterId: 'wc-1' }, { priority: 'High' }],
    });
  });
});

describe('selectRows', () => {
  const rows = [
    { woNumber: 'WO-1', status: 'Draft', priority: 'High' },
    { woNumber: 'WO-2', status: 'Closed', priority: 'Low' },
  ];

  it('returns the rows unchanged when nothing was selected', () => {
    expect(selectRows(rows, null)).toBe(rows);
  });

  it('projects only the named fields', () => {
    expect(selectRows(rows, ['woNumber', 'status'])).toEqual([
      { woNumber: 'WO-1', status: 'Draft' },
      { woNumber: 'WO-2', status: 'Closed' },
    ]);
  });

  it('omits a selected field the row does not carry', () => {
    expect(selectRows(rows, ['woNumber', 'equipmentId'])).toEqual([
      { woNumber: 'WO-1' },
      { woNumber: 'WO-2' },
    ]);
  });
});
