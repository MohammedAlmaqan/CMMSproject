import { prisma } from '../utils/prisma.js';

/**
 * Server-side session revocation for account lifecycle changes.
 *
 * Logout, refresh-token reuse and the idle window already revoke a session
 * (C1, `routes/auth.ts`). What was missing is the same effect for the events
 * that make a session illegitimate: a password reset, deactivation or soft
 * delete. Those used to take effect only at the next sign-in, so a stolen
 * laptop or a dismissed employee kept a working access token for up to its
 * remaining lifetime.
 *
 * Revocation is immediate because `authenticate` reads the session row on every
 * request and rejects a revoked one, so no token denylist or shorter TTL is
 * needed.
 */

/**
 * The part of the Prisma client this module needs. A transaction client
 * satisfies it too, which is how a password change keeps the user row and the
 * revoked sessions in one unit of work.
 */
type RevocationDb = Pick<typeof prisma, 'refreshToken'>;

export interface SessionRevocationOptions {
  /**
   * Session to keep alive. A user changing their own password stays signed in on
   * the device they are using; every other session for the account ends. An
   * Administrator resetting someone else's password passes nothing, so every
   * session ends.
   */
  exceptSessionId?: string;
  /** Transaction client, when the caller needs the revocation to be atomic. */
  db?: RevocationDb;
}

/**
 * Revoke every live session for a user.
 *
 * Returns the number of rows that were still unrevoked and have now been marked
 * revoked. A repeat call therefore returns 0 rather than a misleading count.
 * Expiry and the idle window are still enforced separately by `authenticate`.
 */
export async function revokeUserSessions(
  userId: string,
  options: SessionRevocationOptions = {}
): Promise<number> {
  const db = options.db ?? prisma;
  const { count } = await db.refreshToken.updateMany({
    where: {
      userId,
      revoked: false,
      ...(options.exceptSessionId ? { tokenId: { not: options.exceptSessionId } } : {}),
    },
    data: { revoked: true },
  });
  return count;
}
