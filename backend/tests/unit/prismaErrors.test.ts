import { describe, it, expect } from 'vitest';
import { isPrismaError, prismaErrorTarget } from '../../src/utils/prismaErrors.js';

// The routes branch on Prisma's `code` to turn a unique-constraint collision
// into a 409 and a foreign-key miss into a 400. They used to do that by typing
// the catch clause `any`, which is what pushed the eslint count over the CI
// threshold. These cases pin the narrowing that replaced it: a guard that is
// too loose reintroduces the `any` problem in a new shape, and one that is too
// tight silently turns every P2002 into a 500.

describe('isPrismaError', () => {
  it('accepts the shape Prisma actually throws', () => {
    expect(isPrismaError({ code: 'P2002' })).toBe(true);
  });

  it('accepts a P2002 carrying a meta target, as a unique violation does', () => {
    expect(isPrismaError({ code: 'P2002', meta: { target: 'TaskListMaterial' } })).toBe(true);
  });

  it('rejects the things a bare `catch (error)` can actually receive', () => {
    // useUnknownInCatchVariables means these are all `unknown` at the call
    // site, so every one of them has to be handled without a property read.
    expect(isPrismaError(undefined)).toBe(false);
    expect(isPrismaError(null)).toBe(false);
    expect(isPrismaError('P2002')).toBe(false);
    expect(isPrismaError(42)).toBe(false);
  });

  it('rejects an object with no code, rather than reading undefined.code', () => {
    expect(isPrismaError({})).toBe(false);
    expect(isPrismaError(new Error('boom'))).toBe(false);
  });

  it('rejects a non-string code, so a stray object does not look like an error code', () => {
    expect(isPrismaError({ code: 2002 })).toBe(false);
    expect(isPrismaError({ code: null })).toBe(false);
    expect(isPrismaError({ code: {} })).toBe(false);
  });

  it('rejects an empty-string code, which would match no branch anyway', () => {
    expect(isPrismaError({ code: '' })).toBe(false);
  });
});

describe('prismaErrorTarget', () => {
  it('returns the constraint name when Prisma supplied a string', () => {
    expect(prismaErrorTarget({ code: 'P2002', meta: { target: 'TaskListMaterial_taskOperationId_materialId' } }))
      .toBe('TaskListMaterial_taskOperationId_materialId');
  });

  it('returns an empty string when there is no meta, so the caller can still .includes()', () => {
    // The routes do `target.includes('TaskListMaterial')`. Returning undefined
    // here would throw inside the error handler and turn a clean 409 into a 500.
    expect(prismaErrorTarget({ code: 'P2002' })).toBe('');
  });

  it('joins a column-array target so the route can .includes() the header column', () => {
    // Prisma hands back an array of column names in some versions, which used to
    // fall out empty and made the duplicate-material discriminator mis-read a
    // P2002 as a header-code collision. The columns are joined so the check
    // works the same no matter which shape the driving version reports.
    expect(prismaErrorTarget({ code: 'P2002', meta: { target: ['a', 'b'] } })).toBe('a b');
    expect(prismaErrorTarget({ code: 'P2002', meta: { target: ['code'] } })).toBe('code');
  });

  it('returns an empty string for anything that is not a Prisma error', () => {
    expect(prismaErrorTarget(undefined)).toBe('');
    expect(prismaErrorTarget('boom')).toBe('');
    expect(prismaErrorTarget(null)).toBe('');
  });

  it('keeps a numeric-looking string target intact rather than coercing it', () => {
    expect(prismaErrorTarget({ code: 'P2002', meta: { target: '2002' } })).toBe('2002');
  });
});
