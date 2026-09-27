/**
 * Prisma surfaces its own failures as exceptions carrying a `code` such as
 * `P2002` (unique constraint) or `P2003` (foreign key). Route handlers have
 * always branched on that code, but they did it by typing the catch clause
 * `any`, which disabled checking for the whole block and is what
 * `@typescript-eslint/no-explicit-any` flags.
 *
 * `strict: true` implies `useUnknownInCatchVariables`, so a bare
 * `catch (error)` gives `unknown` and the property reads no longer compile.
 * These guards narrow it back to exactly the two properties the handlers use,
 * and nothing more: `code` and the optional `meta.target` that Prisma puts the
 * offending column name in.
 *
 * The check is deliberately structural rather than `instanceof`
 * `PrismaClientKnownRequestError`. A structural test keeps this module free of
 * a Prisma import, so it can be unit-tested with no client and no database,
 * and it still narrows correctly for the plain objects the mocked and
 * integration paths throw.
 */

export interface PrismaLikeError {
  code: string;
  meta?: { target?: unknown };
}

/** True when `error` looks like a Prisma exception: a non-empty string `code`. */
export function isPrismaError(error: unknown): error is PrismaLikeError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0;
}

/**
 * The constraint name Prisma reports, when it reports one. Returns `undefined`
 * for anything that is not a usable string, so callers can safely do
 * `String(target ?? '')` and get `''` rather than `'[object Object]'`.
 */
export function prismaErrorTarget(error: unknown): string {
  if (!isPrismaError(error)) {
    return '';
  }
  const target = error.meta?.target;
  return typeof target === 'string' ? target : '';
}
