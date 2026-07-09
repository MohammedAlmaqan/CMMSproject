import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';

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

router.put('/:id', authorize('Administrator'), async (req: Request, res: Response) => {
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

    const isAdmin = req.user!.role === 'Administrator';
    const isSelf = req.user!.userId === id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Can only change own password' });
    }

    const existing = await prisma.user.findFirst({
      where: { userId: id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!isAdmin && currentPassword) {
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

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
