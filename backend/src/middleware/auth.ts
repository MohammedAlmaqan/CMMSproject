import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cmms-jwt-secret';

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
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

const roleHierarchy: Record<string, number> = {
  'View-Only': 1,
  'Requester': 2,
  'Technician': 3,
  'Maintenance Supervisor': 4,
  'Maintenance Planner': 5,
  'Administrator': 6,
};

export function authorizeMinRole(minRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userLevel = roleHierarchy[req.user.role] || 0;
    const minLevel = roleHierarchy[minRole] || 0;
    if (userLevel < minLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
