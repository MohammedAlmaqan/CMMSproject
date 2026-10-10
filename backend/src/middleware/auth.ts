import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/config.js';
import { roleLevel } from '../utils/roles.js';

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- intentional module augmentation; Express augmentation must use a `declare namespace` block, and removing it would drop `req.user` typing across every route.
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
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
