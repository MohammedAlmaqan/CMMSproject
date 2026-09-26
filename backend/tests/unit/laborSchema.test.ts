import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { laborCreateSchema, laborUpdateSchema } from '../../src/utils/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const laborRoute = readFileSync(
  resolve(here, '../../src/routes/labor.ts'), 'utf8');

// SOW 3.3.5 says labour is identified by the technician's login. That only
// works if the request schema actually permits the client to omit the id, and
// these cases hold the schema, the route and the OpenAPI block to that one
// contract. The pre-fix schema had userId required, so a client that correctly
// trusted the server's attribution was rejected with 400.

describe('labour request schema, SOW 3.3.5', () => {
  it('accepts an entry with no userId at all', () => {
    const r = laborCreateSchema.safeParse({
      operationId: 'op-1',
      hoursWorked: 2,
    });
    expect(r.success).toBe(true);
    expect(r.data!.userId).toBeUndefined();
  });

  it('still accepts an explicit userId, for a supervisor override', () => {
    const r = laborCreateSchema.safeParse({
      operationId: 'op-1',
      userId: 'tech-2',
      hoursWorked: 2,
    });
    expect(r.success).toBe(true);
    expect(r.data!.userId).toBe('tech-2');
  });

  it('still requires operationId and a positive hoursWorked', () => {
    expect(laborCreateSchema.safeParse({ hoursWorked: 2 }).success).toBe(false);
    expect(laborCreateSchema.safeParse({ operationId: 'op-1' }).success).toBe(false);
    expect(
      laborCreateSchema.safeParse({ operationId: 'op-1', hoursWorked: 0 }).success
    ).toBe(false);
    expect(
      laborCreateSchema.safeParse({ operationId: 'op-1', hoursWorked: -1 }).success
    ).toBe(false);
  });

  it('rejects an empty userId rather than storing a blank technician', () => {
    expect(
      laborCreateSchema.safeParse({ operationId: 'op-1', userId: '', hoursWorked: 1 })
        .success
    ).toBe(false);
  });

  it('allows userId to be omitted on update, but not nulled', () => {
    // Omitting leaves the existing technician alone. Nulling is refused on
    // purpose: every labour entry has to be attributed to somebody, so
    // clearing the technician is not a state the schema should accept.
    const omitted = laborUpdateSchema.safeParse({ hoursWorked: 3 });
    expect(omitted.success).toBe(true);
    expect(omitted.data!.userId).toBeUndefined();

    const nulled = laborUpdateSchema.safeParse({ userId: null });
    expect(nulled.success).toBe(false);
  });

  it('allows entryDateTime to be cleared, unlike userId', () => {
    expect(laborUpdateSchema.safeParse({ entryDateTime: null }).success).toBe(true);
  });
});

describe('labour OpenAPI agrees with the schema', () => {
  it('does not list userId as required on POST', () => {
    const required = laborRoute.match(/required:\s*\[([^\]]*userId[^\]]*)\]/);
    expect(required).toBeNull();
  });

  it('documents userId as defaulting to the authenticated caller', () => {
    expect(laborRoute).toContain('defaults to the authenticated caller');
  });
});
