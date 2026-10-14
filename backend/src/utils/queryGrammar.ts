/**
 * SOW 5.4: a bounded, OData-style query grammar for GET collections.
 *
 * Supported query parameters:
 *   $filter   e.g. $filter=priority eq 'High' and status ne 'Closed'
 *             comparisons: eq ne gt ge lt le contains, joined by `and`/`or`,
 *             grouped with parentheses. String values are single-quoted, with a
 *             doubled quote ('') for an embedded quote.
 *   $orderby  e.g. $orderby=createdDate desc,priority asc
 *   $select   e.g. $select=woNumber,status  (top-level fields only)
 *   $top      e.g. $top=25
 *   $skip     e.g. $skip=50
 *
 * Each resource declares the fields it exposes through a FieldMap; anything not
 * in the map is rejected rather than passed to Prisma, so a caller cannot reach
 * a relation or a column the endpoint does not publish.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'date';
export type FieldMap = Record<string, FieldType>;

export interface ParsedCollectionQuery {
  where: Record<string, unknown> | null;
  orderBy: Array<Record<string, 'asc' | 'desc'>> | null;
  skip: number | null;
  take: number | null;
  select: string[] | null;
}

export type CollectionQueryResult =
  | { ok: true; query: ParsedCollectionQuery }
  | { ok: false; errors: string[] };

export const MAX_TOP = 500;

const auditFields: FieldMap = {
  createdBy: 'string',
  createdDate: 'date',
  modifiedBy: 'string',
  modifiedDate: 'date',
  isDeleted: 'boolean',
};

export const QUERY_FIELDS = {
  workOrder: {
    workOrderId: 'string',
    woNumber: 'string',
    type: 'string',
    priority: 'string',
    status: 'string',
    functionalLocationId: 'string',
    equipmentId: 'string',
    description: 'string',
    workCenterId: 'string',
    supervisorUserId: 'string',
    reportedByUserId: 'string',
    plannedStart: 'date',
    plannedFinish: 'date',
    actualStart: 'date',
    actualFinish: 'date',
    costCenterCode: 'string',
    internalOrder: 'string',
    breakdownFlag: 'boolean',
    safetyCriticalFlag: 'boolean',
    causeCodeId: 'string',
    failureCodeId: 'string',
    safetyNotes: 'string',
    completionRemarks: 'string',
    calibrationResult: 'string',
    calibrationDueDate: 'date',
    plannedCost: 'number',
    actualCost: 'number',
    sourcePlanId: 'string',
    sourcePlanCycle: 'string',
    ...auditFields,
  },
  notification: {
    notificationId: 'string',
    notificationNumber: 'string',
    type: 'string',
    priority: 'string',
    status: 'string',
    functionalLocationId: 'string',
    equipmentId: 'string',
    reportedByUserId: 'string',
    description: 'string',
    damagesObservations: 'string',
    breakdownFlag: 'boolean',
    ...auditFields,
  },
  equipment: {
    equipmentId: 'string',
    equipmentCode: 'string',
    name: 'string',
    description: 'string',
    functionalLocationId: 'string',
    manufacturer: 'string',
    model: 'string',
    serialNumber: 'string',
    assetTag: 'string',
    equipmentClass: 'string',
    criticality: 'string',
    installationDate: 'date',
    warrantyExpiryDate: 'date',
    operationalStatus: 'string',
    ...auditFields,
  },
  functionalLocation: {
    functionalLocationId: 'string',
    locationCode: 'string',
    description: 'string',
    parentLocationId: 'string',
    locationType: 'string',
    operationalStatus: 'string',
    installationDate: 'date',
    gpsCoordinates: 'string',
    safetyCritical: 'boolean',
    ...auditFields,
  },
  material: {
    materialId: 'string',
    materialCode: 'string',
    description: 'string',
    unitOfMeasure: 'string',
    standardCost: 'number',
    currentStock: 'number',
    ...auditFields,
  },
  maintenancePlan: {
    planId: 'string',
    planCode: 'string',
    description: 'string',
    equipmentId: 'string',
    functionalLocationId: 'string',
    workCenterId: 'string',
    taskListId: 'string',
    strategyType: 'string',
    intervalValue: 'number',
    intervalUnit: 'string',
    callHorizonValue: 'number',
    callHorizonUnit: 'string',
    startDate: 'date',
    endDate: 'date',
    priority: 'string',
    generatedWorkOrderStatus: 'string',
    notificationId: 'string',
    activeFlag: 'boolean',
    ...auditFields,
  },
  taskList: {
    taskListId: 'string',
    code: 'string',
    description: 'string',
    equipmentClass: 'string',
    equipmentId: 'string',
    workCenterId: 'string',
    ...auditFields,
  },
  workCenter: {
    workCenterId: 'string',
    code: 'string',
    name: 'string',
    dailyCapacityHours: 'number',
    costRatePerHour: 'number',
    isActive: 'boolean',
    ...auditFields,
  },
  craft: {
    craftId: 'string',
    workCenterId: 'string',
    craftCode: 'string',
    description: 'string',
    hourlyRate: 'number',
    ...auditFields,
  },
  failureCode: {
    failureCodeId: 'string',
    parentCodeId: 'string',
    code: 'string',
    description: 'string',
    ...auditFields,
  },
  causeCode: {
    causeCodeId: 'string',
    code: 'string',
    description: 'string',
    ...auditFields,
  },
} satisfies Record<string, FieldMap>;

export type CollectionResource = keyof typeof QUERY_FIELDS;

type ComparisonOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains';

type Token =
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'and' }
  | { kind: 'or' }
  | { kind: 'cmp'; op: ComparisonOp }
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'bool'; value: boolean };

const COMPARISON_OPS: Record<string, ComparisonOp> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  ge: 'ge',
  lt: 'lt',
  le: 'le',
  contains: 'contains',
};

function single(query: Record<string, unknown>, key: string, errors: string[]): string | null {
  const value = query[key];
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    errors.push(`${key} was supplied ${value.length} times; pass it once`);
    return null;
  }
  if (typeof value !== 'string') {
    errors.push(`${key} must be a single value`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function nonNegativeInt(name: string, raw: string, max: number, errors: string[]): number | null {
  if (!/^\d+$/.test(raw)) {
    errors.push(`${name} must be a non-negative integer, got "${raw}"`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) {
    errors.push(`${name} must be an integer between 0 and ${max}, got "${raw}"`);
    return null;
  }
  return value;
}

function parseSelect(raw: string, fields: FieldMap, errors: string[]): string[] | null {
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (parts.length === 0) {
    errors.push('$select must name at least one field');
    return null;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!(part in fields)) {
      errors.push(`$select names an unknown field "${part}"`);
      continue;
    }
    if (!seen.has(part)) {
      seen.add(part);
      out.push(part);
    }
  }
  return out.length > 0 ? out : null;
}

function parseOrderBy(
  raw: string,
  fields: FieldMap,
  errors: string[]
): Array<Record<string, 'asc' | 'desc'>> | null {
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (parts.length === 0) {
    errors.push('$orderby must name at least one field');
    return null;
  }
  const out: Array<Record<string, 'asc' | 'desc'>> = [];
  for (const part of parts) {
    const bits = part.split(/\s+/);
    if (bits.length > 2) {
      errors.push(`$orderby entry "${part}" has too many parts`);
      continue;
    }
    const [field, dir] = bits;
    if (!(field in fields)) {
      errors.push(`$orderby names an unknown field "${field}"`);
      continue;
    }
    let direction: 'asc' | 'desc' = 'asc';
    if (dir !== undefined) {
      const lower = dir.toLowerCase();
      if (lower !== 'asc' && lower !== 'desc') {
        errors.push(`$orderby direction must be asc or desc, got "${dir}"`);
        continue;
      }
      direction = lower;
    }
    out.push({ [field]: direction });
  }
  return out.length > 0 ? out : null;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < input.length) {
        if (input[j] === "'") {
          if (input[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += input[j];
        j++;
      }
      if (!closed) throw new Error('unterminated string literal');
      tokens.push({ kind: 'string', value });
      i = j;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      if (input[j] === '-') j++;
      const digitStart = j;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      if (j === digitStart) throw new Error(`unexpected character "${ch}"`);
      if (input[j] === '.') {
        j++;
        const fracStart = j;
        while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
        if (j === fracStart) throw new Error('a decimal point must be followed by digits');
      }
      tokens.push({ kind: 'number', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const lower = word.toLowerCase();
      if (lower === 'and') tokens.push({ kind: 'and' });
      else if (lower === 'or') tokens.push({ kind: 'or' });
      else if (lower === 'true') tokens.push({ kind: 'bool', value: true });
      else if (lower === 'false') tokens.push({ kind: 'bool', value: false });
      else if (COMPARISON_OPS[lower]) tokens.push({ kind: 'cmp', op: COMPARISON_OPS[lower] });
      else tokens.push({ kind: 'ident', value: word });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${ch}"`);
  }
  return tokens;
}

function describe(token: Token | undefined): string {
  if (!token) return 'the end of the expression';
  switch (token.kind) {
    case 'ident':
      return `"${token.value}"`;
    case 'string':
      return `the text "${token.value}"`;
    case 'number':
      return `the number ${token.value}`;
    case 'bool':
      return `${token.value}`;
    case 'lparen':
      return '"("';
    case 'rparen':
      return '")"';
    case 'and':
      return '"and"';
    case 'or':
      return '"or"';
    case 'cmp':
      return `"${token.op}"`;
  }
}

class FilterParser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly fields: FieldMap,
    private readonly errors: string[]
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  parse(): Record<string, unknown> | null {
    const node = this.parseOr();
    const trailing = this.peek();
    if (trailing) {
      this.errors.push(`$filter has unexpected trailing input at ${describe(trailing)}`);
      return null;
    }
    return node;
  }

  private parseOr(): Record<string, unknown> | null {
    let left = this.parseAnd();
    while (this.peek()?.kind === 'or') {
      this.pos++;
      const right = this.parseAnd();
      left = left === null || right === null ? null : { OR: [left, right] };
    }
    return left;
  }

  private parseAnd(): Record<string, unknown> | null {
    let left = this.parsePrimary();
    while (this.peek()?.kind === 'and') {
      this.pos++;
      const right = this.parsePrimary();
      left = left === null || right === null ? null : { AND: [left, right] };
    }
    return left;
  }

  private parsePrimary(): Record<string, unknown> | null {
    const token = this.peek();
    if (!token) {
      this.errors.push('$filter ended unexpectedly');
      return null;
    }
    if (token.kind === 'lparen') {
      this.pos++;
      const inner = this.parseOr();
      const close = this.peek();
      if (!close || close.kind !== 'rparen') {
        this.errors.push('$filter is missing a closing parenthesis');
        return null;
      }
      this.pos++;
      return inner;
    }
    return this.parseComparison();
  }

  private parseComparison(): Record<string, unknown> | null {
    const fieldToken = this.peek();
    if (!fieldToken || fieldToken.kind !== 'ident') {
      this.errors.push(`$filter expected a field name but found ${describe(fieldToken)}`);
      return null;
    }
    this.pos++;
    const opToken = this.peek();
    if (!opToken || opToken.kind !== 'cmp') {
      this.errors.push(`$filter expected a comparison operator after "${fieldToken.value}"`);
      return null;
    }
    this.pos++;
    const valueToken = this.peek();
    if (
      !valueToken ||
      (valueToken.kind !== 'string' && valueToken.kind !== 'number' && valueToken.kind !== 'bool')
    ) {
      this.errors.push(`$filter expected a value after "${fieldToken.value} ${opToken.op}"`);
      return null;
    }
    this.pos++;
    const type = this.fields[fieldToken.value];
    if (!type) {
      this.errors.push(`$filter names an unknown field "${fieldToken.value}"`);
      return null;
    }
    return this.build(fieldToken.value, opToken.op, type, valueToken);
  }

  private build(
    field: string,
    op: ComparisonOp,
    type: FieldType,
    token: Token & ({ kind: 'string' } | { kind: 'number' } | { kind: 'bool' })
  ): Record<string, unknown> | null {
    const label = `$filter ${field} ${op}`;
    if (op === 'contains') {
      if (type !== 'string') {
        this.errors.push(`${label}: contains applies only to text fields`);
        return null;
      }
      if (token.kind !== 'string') {
        this.errors.push(`${label}: expected a quoted string value`);
        return null;
      }
      return { [field]: { contains: token.value, mode: 'insensitive' } };
    }
    if (type === 'number') {
      if (token.kind !== 'number') {
        this.errors.push(`${label}: expected a numeric value`);
        return null;
      }
      return scalar(field, op, token.value);
    }
    if (type === 'boolean') {
      if (op !== 'eq' && op !== 'ne') {
        this.errors.push(`${label}: only eq and ne apply to a yes/no field`);
        return null;
      }
      if (token.kind !== 'bool') {
        this.errors.push(`${label}: expected true or false`);
        return null;
      }
      return op === 'eq' ? { [field]: token.value } : { NOT: { [field]: token.value } };
    }
    if (type === 'date') {
      if (token.kind !== 'string') {
        this.errors.push(`${label}: expected an ISO date string such as '2026-01-31'`);
        return null;
      }
      const date = new Date(token.value);
      if (Number.isNaN(date.getTime())) {
        this.errors.push(`${label}: "${token.value}" is not a valid date`);
        return null;
      }
      return scalar(field, op, date);
    }
    if (token.kind !== 'string') {
      this.errors.push(`${label}: expected a quoted string value`);
      return null;
    }
    return scalar(field, op, token.value);
  }
}

function scalar(field: string, op: ComparisonOp, value: unknown): Record<string, unknown> {
  switch (op) {
    case 'eq':
      return { [field]: value };
    case 'ne':
      return { NOT: { [field]: value } };
    case 'gt':
      return { [field]: { gt: value } };
    case 'ge':
      return { [field]: { gte: value } };
    case 'lt':
      return { [field]: { lt: value } };
    case 'le':
      return { [field]: { lte: value } };
    default:
      return {};
  }
}

function parseFilter(input: string, fields: FieldMap, errors: string[]): Record<string, unknown> | null {
  let tokens: Token[];
  try {
    tokens = tokenize(input);
  } catch (error) {
    errors.push(`$filter could not be parsed: ${(error as Error).message}`);
    return null;
  }
  if (tokens.length === 0) {
    errors.push('$filter was supplied but is empty');
    return null;
  }
  const parser = new FilterParser(tokens, fields, errors);
  const node = parser.parse();
  return errors.length > 0 ? null : node;
}

export function parseCollectionQuery(
  query: Record<string, unknown>,
  fields: FieldMap
): CollectionQueryResult {
  const errors: string[] = [];
  const parsed: ParsedCollectionQuery = {
    where: null,
    orderBy: null,
    skip: null,
    take: null,
    select: null,
  };

  const top = single(query, '$top', errors);
  if (top !== null) parsed.take = nonNegativeInt('$top', top, MAX_TOP, errors);

  const skip = single(query, '$skip', errors);
  if (skip !== null) parsed.skip = nonNegativeInt('$skip', skip, Number.MAX_SAFE_INTEGER, errors);

  const select = single(query, '$select', errors);
  if (select !== null) parsed.select = parseSelect(select, fields, errors);

  const orderBy = single(query, '$orderby', errors);
  if (orderBy !== null) parsed.orderBy = parseOrderBy(orderBy, fields, errors);

  const filter = single(query, '$filter', errors);
  if (filter !== null) parsed.where = parseFilter(filter, fields, errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, query: parsed };
}

export function mergeWhere(
  base: Record<string, unknown>,
  extra: Record<string, unknown> | null
): Record<string, unknown> {
  if (!extra) return base;
  const existing = base.AND;
  const andList = Array.isArray(existing) ? existing : existing !== undefined ? [existing] : [];
  return { ...base, AND: [...andList, extra] };
}

export function selectRows(rows: unknown[], select: string[] | null): unknown[] {
  if (!select) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    if (row !== null && typeof row === 'object') {
      const source = row as Record<string, unknown>;
      for (const key of select) {
        if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
      }
    }
    return out;
  });
}
