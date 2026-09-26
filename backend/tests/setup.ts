import './load-env.js';
import { beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma.js';
import { JWT_SECRET } from '../src/utils/config.js';
import { ctx } from './helpers.js';

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { username: 'admin', isDeleted: false } });
  const operator = await prisma.user.findFirst({ where: { username: 'operator', isDeleted: false } });
  const technician = await prisma.user.findFirst({ where: { username: 'tech1', isDeleted: false } });
  const supervisor = await prisma.user.findFirst({ where: { username: 'supervisor', isDeleted: false } });
  if (!admin || !operator || !technician || !supervisor) {
    throw new Error('seeded users admin/operator/tech1/supervisor not found — cannot run tests');
  }
  ctx.adminId = admin.userId;
  ctx.operatorId = operator.userId;
  const sign = (id: string, username: string, role: string) =>
    jwt.sign({ userId: id, username, role }, JWT_SECRET, { expiresIn: '8h' });
  ctx.adminToken = sign(admin.userId, admin.username, admin.role);
  ctx.operatorToken = sign(operator.userId, operator.username, operator.role);
  ctx.viewOnlyToken = sign(operator.userId, operator.username, 'View-Only');
  ctx.technicianToken = sign(technician.userId, technician.username, technician.role);
  ctx.supervisorToken = sign(supervisor.userId, supervisor.username, supervisor.role);
});

afterAll(async () => {
  await prisma.$disconnect();
});