import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cmms-jwt-secret';
const JWT_EXPIRES_IN = 8 * 60 * 60; // 8 hours in seconds

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await prisma.user.findUnique({ where: { username, isDeleted: false } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({
      where: { userId: user.userId },
      data: { lastLogin: new Date() },
    });

    const token = jwt.sign(
      { userId: user.userId, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await logAudit(
      { tableName: 'User', recordId: user.userId, action: 'Update', fieldName: 'lastLogin', newValue: new Date().toISOString() },
      user.userId,
      req.ip
    );

    res.json({
      token,
      user: {
        userId: user.userId,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        workCenterId: user.workCenterId,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
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
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
