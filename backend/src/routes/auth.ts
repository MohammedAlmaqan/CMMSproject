import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const router = Router();

const MAX_FAILED_LOGINS = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCK_MS = 30 * 60 * 1000;
const INVALID_CREDENTIALS = { error: 'Invalid credentials' };
const ACCOUNT_LOCKED = { error: 'Account temporarily locked. Try again later.' };

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Sign in and obtain a JWT
 *     description: >
 *       Public endpoint - no bearer token required. Verifies bcrypt credentials against an
 *       active, non-deleted user. Five failed attempts within a 15-minute window lock the
 *       account for 30 minutes (HTTP 423) and raise a SystemAlert. A successful login resets
 *       the failure counter, clears any lock, and records an AuditLogEntry for lastLogin.
 *       Rate limited per IP by express-rate-limit; the limit is raised by the k6 smoke run
 *       via K6_MODE.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       '200':
 *         description: Authenticated. Returns the signed JWT and the user profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT bearer token (expires per JWT_EXPIRES_IN, 8h by default)
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId: { type: string }
 *                     username: { type: string }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     role: { type: string }
 *                     workCenterId: { type: string, nullable: true }
 *                     isActive: { type: boolean }
 *                     lastLogin: { type: string, format: date-time }
 *       '400':
 *         description: Username or password missing
 *       '401':
 *         description: Invalid credentials
 *       '423':
 *         description: Account temporarily locked after five failed attempts
 *       '429':
 *         description: Rate limit exceeded for this IP
 *       '500':
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Return the current user's profile
 *     description: >
 *       Requires a valid bearer token. Returns the authenticated user's own record,
 *       including audit columns. Use this to populate the session after a page reload.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId: { type: string }
 *                 username: { type: string }
 *                 fullName: { type: string }
 *                 email: { type: string }
 *                 role: { type: string }
 *                 workCenterId: { type: string, nullable: true }
 *                 isActive: { type: boolean }
 *                 lastLogin: { type: string, format: date-time, nullable: true }
 *                 createdBy: { type: string }
 *                 createdDate: { type: string, format: date-time }
 *                 modifiedBy: { type: string }
 *                 modifiedDate: { type: string, format: date-time }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: User not found
 *       '500':
 *         description: Internal server error
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // F3: User.username is no longer @unique (partial unique index over active rows only);
    // findUnique requires a unique-product key, so login resolves by active username via findFirst.
    const user = await prisma.user.findFirst({ where: { username, isDeleted: false } });
    if (!user || !user.isActive) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const requestTime = new Date();
    if (user.lockedUntil && user.lockedUntil > requestTime) {
      return res.status(423).json(ACCOUNT_LOCKED);
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "userId" FROM "User" WHERE "userId" = ${user.userId} FOR UPDATE`;
      const currentUser = await tx.user.findUnique({ where: { userId: user.userId } });
      if (!currentUser || !currentUser.isActive || currentUser.isDeleted) {
        return { status: 401 as const };
      }
      const now = new Date();
      if (currentUser.lockedUntil && currentUser.lockedUntil > now) {
        return { status: 423 as const };
      }

      const valid = await bcrypt.compare(password, currentUser.passwordHash);
      const loginTime = now;
      if (valid) {
        await tx.user.update({
          where: { userId: currentUser.userId },
          data: {
            lastLogin: loginTime,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        await tx.auditLogEntry.create({
          data: {
            tableName: 'User',
            recordId: currentUser.userId,
            action: 'Update',
            fieldName: 'lastLogin',
            newValue: loginTime.toISOString(),
            userId: currentUser.userId,
            ipAddress: req.ip,
            timestamp: loginTime,
          },
        });
        return { status: 200 as const, user: currentUser, loginTime };
      }

      const latestSuccessfulLogin = await tx.auditLogEntry.findFirst({
        where: {
          tableName: 'User',
          recordId: currentUser.userId,
          action: 'Update',
          fieldName: 'lastLogin',
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      const recentFailureCount = await tx.auditLogEntry.count({
        where: {
          tableName: 'User',
          recordId: currentUser.userId,
          action: 'Run',
          fieldName: 'LoginFailure',
          timestamp: {
            gte: new Date(now.getTime() - FAILED_LOGIN_WINDOW_MS),
            ...(latestSuccessfulLogin ? { gt: latestSuccessfulLogin.timestamp } : {}),
          },
        },
      });
      const failedLoginCount = recentFailureCount + 1;
      const shouldLock = failedLoginCount >= MAX_FAILED_LOGINS;

      await tx.user.update({
        where: { userId: currentUser.userId },
        data: {
          failedLoginCount: shouldLock ? 0 : failedLoginCount,
          lockedUntil: shouldLock ? new Date(now.getTime() + ACCOUNT_LOCK_MS) : null,
        },
      });
      await tx.auditLogEntry.create({
        data: {
          tableName: 'User',
          recordId: currentUser.userId,
          action: 'Run',
          fieldName: 'LoginFailure',
          userId: currentUser.userId,
          ipAddress: req.ip,
          timestamp: now,
        },
      });
      if (shouldLock) {
        await tx.systemAlert.create({
          data: {
            alertType: 'Account_Lockout',
            userId: currentUser.userId,
            title: 'Account temporarily locked',
            message: 'The account was locked after five failed sign-in attempts within 15 minutes.',
            relatedEntityId: currentUser.userId,
            relatedEntityType: 'User',
          },
        });
      }
      return { status: shouldLock ? 423 as const : 401 as const };
    });

    if (outcome.status === 423) {
      return res.status(423).json(ACCOUNT_LOCKED);
    }
    if (outcome.status === 401) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }
    if (!outcome.user) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const token = jwt.sign(
      { userId: outcome.user.userId, username: outcome.user.username, role: outcome.user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: {
        userId: outcome.user.userId,
        username: outcome.user.username,
        fullName: outcome.user.fullName,
        email: outcome.user.email,
        role: outcome.user.role,
        workCenterId: outcome.user.workCenterId,
        isActive: outcome.user.isActive,
        lastLogin: outcome.loginTime,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.userId },
      select: {
        userId: true, username: true, fullName: true, email: true,
        role: true, workCenterId: true, isActive: true, lastLogin: true,
        createdBy: true, createdDate: true, modifiedBy: true, modifiedDate: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
