import './load-env.js';
import { beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma.js';
import { JWT_SECRET } from '../src/utils/config.js';
import { ctx } from './helpers.js';

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { username: 'admin', isDeleted: false } });
  const operator = await prisma.user.findFirst({ where: { username: 'operator', isDeleted: false } });
  if (!admin || !operator) {
    throw new Error('seeded users admin/operator not found — cannot run tests');
  }
  ctx.adminId = admin.userId;
  ctx.operatorId = operator.userId;
  const sign = (id: string, username: string, role: string) =>
    jwt.sign({ userId: id, username, role }, JWT_SECRET, { expiresIn: '8h' });
  ctx.adminToken = sign(admin.userId, admin.username, admin.role);
  ctx.operatorToken = sign(operator.userId, operator.username, operator.role);
  ctx.viewOnlyToken = sign(operator.userId, operator.username, 'View-Only');
});

afterAll(async () => {
  await prisma.$disconnect();
});