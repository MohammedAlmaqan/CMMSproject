import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize, authorizeMinRole } from '../middleware/auth.js';
import { logAuditAction } from '../middleware/audit.js';
import { userCreateSchema, userUpdateSchema, validate } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(authenticate);


/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List all users
 *     description: >
 *       Administrator-only. Returns every non-deleted user with profile, role, work centre
 *       and last login. Password hashes are never selected or returned. For picker fields
 *       use /api/users/options instead, which is available to a wider audience.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId: { type: string }
 *                   username: { type: string }
 *                   fullName: { type: string }
 *                   email: { type: string }
 *                   role: { type: string, enum: [View-Only, Requester, Technician, "Maintenance Supervisor", "Maintenance Planner", Administrator] }
 *                   workCenterId: { type: string, nullable: true }
 *                   isActive: { type: boolean }
 *                   lastLogin: { type: string, format: date-time, nullable: true }
 *                   createdBy: { type: string }
 *                   createdDate: { type: string, format: date-time }
 *                   modifiedBy: { type: string }
 *                   modifiedDate: { type: string, format: date-time }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is not an Administrator
 *       '500':
 *         description: Internal server error
 */
router.get('/', authorize('Administrator'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        userId: true, username: true, fullName: true, email: true,
        role: true, workCenterId: true, isActive: true, lastLogin: true,
        createdBy: true, createdDate: true, modifiedBy: true, modifiedDate: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json(users);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create a user
 *     description: >
 *       Administrator-only. Creates an active user from username, password, full name,
 *       email and role. The username must be unique among non-deleted users (the partial
 *       unique index ignores soft-deleted rows). The password is hashed with bcrypt at
 *       cost 10 and is never returned. Validated by the zod schema `userCreateSchema`.
 *       Writes an AuditLogEntry.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `userCreateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, fullName, email, role]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, minLength: 8 }
 *               fullName: { type: string }
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [View-Only, Requester, Technician, "Maintenance Supervisor", "Maintenance Planner", Administrator] }
 *               workCenterId: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       '201':
 *         description: User created
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is not an Administrator
 *       '409':
 *         description: Username already exists
 *       '500':
 *         description: Internal server error
 */
router.post('/', authorize('Administrator'), validate(userCreateSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, fullName, email, role, workCenterId, isActive } = req.body;

    // User.username is a partial unique index over active rows, so a soft-deleted
    // account frees its name. Checking here turns the common case into a clear 409
    // rather than relying on the P2002 handler below.
    const existing = await prisma.user.findFirst({ where: { username, isDeleted: false } });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        email,
        role,
        workCenterId: workCenterId || null,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user!.userId,
        modifiedBy: req.user!.userId,
      },
      select: {
        userId: true, username: true, fullName: true, email: true,
        role: true, workCenterId: true, isActive: true, lastLogin: true,
        createdBy: true, createdDate: true, modifiedBy: true, modifiedDate: true,
      },
    });

    await logAuditAction({ table: 'User', recordId: user.userId, action: 'Create', userId: req.user!.userId, ipAddress: req.ip });

    res.status(201).json(user);
  } catch (error) {
    // A concurrent create can still race the findFirst above; the partial unique
    // index is the authority, and P2002 is the honest answer to that race.
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    logger.error({ err: error }, 'Error creating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users/options:
 *   get:
 *     summary: List active users for pickers
 *     description: >
 *       Returns the minimal projection of active, non-deleted users for dropdown and
 *       assignee fields. Available from the Requester role upwards. Declared before /:id so
 *       the literal segment is not captured by the parameterised route.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of user options
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId: { type: string }
 *                   username: { type: string }
 *                   fullName: { type: string }
 *                   role: { type: string }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller role is below Requester
 *       '500':
 *         description: Internal server error
 */
router.get('/options', authorizeMinRole('Requester'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, isDeleted: false },
      select: {
        userId: true, username: true, fullName: true, role: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json(users);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user options');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Get one user
 *     description: >
 *       Returns a single non-deleted user with profile, role and work centre. Available to
 *       any authenticated user; no administrator restriction is applied on this read.
 *       Password hashes are never selected or returned.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User userId
 *     responses:
 *       '200':
 *         description: User detail
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '401':
 *         description: Missing or invalid bearer token
 *       '404':
 *         description: User not found
 *       '500':
 *         description: Internal server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findFirst({
      where: { userId: id, isDeleted: false },
      select: {
        userId: true, username: true, fullName: true, email: true,
        role: true, workCenterId: true, isActive: true, lastLogin: true,
        createdBy: true, createdDate: true, modifiedBy: true, modifiedDate: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     summary: Update a user
 *     description: >
 *       Administrator-only. Partial update of the profile, role, work centre and active
 *       flag. Validated by the zod schema `userUpdateSchema` (see utils/validation.ts),
 *       which requires at least one field. The username is immutable. Writes an
 *       AuditLogEntry.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User userId
 *     requestBody:
 *       required: true
 *       description: "Validated by zod `userUpdateSchema`"
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [View-Only, Requester, Technician, "Maintenance Supervisor", "Maintenance Planner", Administrator] }
 *               workCenterId: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       '200':
 *         description: User updated
 *         content:
 *           application/json:
 *             schema: { type: object, additionalProperties: true }
 *       '400':
 *         description: zod validation failed, including an empty body
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is not an Administrator
 *       '404':
 *         description: User not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id', authorize('Administrator'), validate(userUpdateSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.user.findFirst({
      where: { userId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { fullName, email, role, workCenterId, isActive } = req.body;

    const user = await prisma.user.update({
      where: { userId: id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
        ...(workCenterId !== undefined && { workCenterId: workCenterId || null }),
        ...(isActive !== undefined && { isActive }),
        modifiedBy: req.user!.userId,
      },
      select: {
        userId: true, username: true, fullName: true, email: true,
        role: true, workCenterId: true, isActive: true, lastLogin: true,
        createdBy: true, createdDate: true, modifiedBy: true, modifiedDate: true,
      },
    });

    // A profile edit touches several columns at once. Recording one label with
    // no values behind it used to look like a field diff in the trail without
    // being one, so it is filed as an action. Per-field diffs for profile edits
    // are the open part of row 38.
    await logAuditAction({ table: 'User', recordId: id, action: 'Update', userId: req.user!.userId, ipAddress: req.ip });

    res.json(user);
  } catch (error) {
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Deactivate a user (soft delete)
 *     description: >
 *       Administrator-only. Marks the user `isDeleted = true` and `isActive = false` rather
 *       than removing the row, so the account keeps its audit trail but can no longer sign
 *       in or appear in listings. An Administrator cannot deactivate their own account.
 *       Writes an AuditLogEntry.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User userId
 *     responses:
 *       '200':
 *         description: User deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '400':
 *         description: Caller attempted to deactivate their own account
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is not an Administrator
 *       '404':
 *         description: User not found
 *       '500':
 *         description: Internal server error
 */
router.delete('/:id', authorize('Administrator'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (id === req.user!.userId) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const existing = await prisma.user.findFirst({ where: { userId: id, isDeleted: false } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.user.update({
      where: { userId: id },
      data: { isDeleted: true, isActive: false, modifiedBy: req.user!.userId },
    });

    await logAuditAction({ table: 'User', recordId: id, action: 'Delete', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deactivating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @openapi
 * /api/users/{id}/password:
 *   put:
 *     summary: Change a password
 *     description: >
 *       A user may change their own password by supplying currentPassword, or an
 *       Administrator may set any user's password without it. newPassword must be at least
 *       8 characters. The new hash is generated with bcrypt at cost 10. This route is not
 *       covered by userUpdateSchema, so its inputs are validated inline. Writes an
 *       AuditLogEntry with fieldName password.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User userId
 *     requestBody:
 *       required: true
 *       description: Validated inline; not covered by a zod schema on this route
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string, minLength: 8 }
 *               currentPassword: { type: string, description: "Required when changing your own password" }
 *     responses:
 *       '200':
 *         description: Password updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       '400':
 *         description: New password too short, current password missing, or current password incorrect
 *       '401':
 *         description: Missing or invalid bearer token
 *       '403':
 *         description: Caller is neither the target user nor an Administrator
 *       '404':
 *         description: User not found
 *       '500':
 *         description: Internal server error
 */
router.put('/:id/password', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const isAdmin = req.user!.role === 'Administrator';
    const isSelf = req.user!.userId === id;

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Can only change own password' });
    }

    const existing = await prisma.user.findFirst({
      where: { userId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (isSelf) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const valid = await bcrypt.compare(currentPassword, existing.passwordHash);
      if (!valid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { userId: id },
      data: {
        passwordHash,
        modifiedBy: req.user!.userId,
      },
    });

    // Deliberately action-only. A password change must never put the old or new
    // secret in an audit row; the fact that it happened, by whom and from where,
    // is the whole of what an auditor is entitled to here.
    await logAuditAction({ table: 'User', recordId: id, action: 'Update', userId: req.user!.userId, ipAddress: req.ip });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error changing password');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
