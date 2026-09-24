import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { userUpdateSchema, validate } from '../utils/validation.js';

const router = Router();

router.use(authenticate);

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
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    await logAudit(
      { tableName: 'User', recordId: id, action: 'Update', fieldName: 'profile' },
      req.user!.userId,
      req.ip
    );

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    await logAudit(
      { tableName: 'User', recordId: id, action: 'Update', fieldName: 'password' },
      req.user!.userId,
      req.ip
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
