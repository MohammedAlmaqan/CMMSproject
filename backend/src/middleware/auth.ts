import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, SESSION_IDLE_MS, SESSION_TOUCH_MS } from '../utils/config.js';
import { prisma } from '../utils/prisma.js';
import { roleLevel } from '../utils/roles.js';

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
  // Id of the refresh-token (session) row this access token belongs to. Tokens
  // minted before server-side sessions existed, and those the test harness signs
  // directly, omit it and are accepted without a session check.
  sid?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- intentional module augmentation; Express augmentation must use a `declare namespace` block, and removing it would drop `req.user` typing across every route.
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // A token without a session id predates server-side sessions (or came from the
  // test harness). There is nothing to look up, so it is trusted exactly as it
  // was before sessions existed.
  if (!payload.sid) {
    req.user = payload;
    return next();
  }

  try {
    const now = Date.now();
    const session = await prisma.refreshToken.findUnique({
      where: { tokenId: payload.sid },
      select: { userId: true, revoked: true, expiresAt: true, lastUsedAt: true },
    });

    if (
      !session ||
      session.revoked ||
      session.userId !== payload.userId ||
      session.expiresAt.getTime() <= now
    ) {
      return res.status(401).json({ error: 'Session no longer valid' });
    }

    // SOW 4.2: idle expiry enforced on the server, independent of the browser.
    if (now - session.lastUsedAt.getTime() > SESSION_IDLE_MS) {
      await prisma.refreshToken.updateMany({
        where: { tokenId: payload.sid, revoked: false },
        data: { revoked: true },
      });
      return res.status(401).json({ error: 'Session expired' });
    }

    // Advance the idle clock, but not on every request: a write per call would
    // turn a burst of reads into a burst of updates for no extra fidelity.
    if (now - session.lastUsedAt.getTime() >= SESSION_TOUCH_MS) {
      await prisma.refreshToken.updateMany({
        where: { tokenId: payload.sid, revoked: false },
        data: { lastUsedAt: new Date(now) },
      });
    }

    req.user = payload;
    return next();
  } catch (error) {
    // A database failure is not an invalid credential. Hand it to the error
    // handler rather than answering 401, which would sign the caller out.
    return next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function authorizeMinRole(minRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userLevel = roleLevel(req.user.role);
    const minLevel = roleLevel(minRole);
    if (userLevel < minLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
