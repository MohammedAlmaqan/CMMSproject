import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

describe('auth routes', () => {
  const validPassword = 'LockoutTest123!';
  let tempUserId = '';
  let tempUsername = '';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(validPassword, 10);
    const user = await prisma.user.create({
      data: {
        username: `lockout-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fullName: 'Lockout Test User',
        email: 'lockout@example.com',
        passwordHash,
        role: 'Technician',
        isActive: true,
      },
    });
    tempUserId = user.userId;
    tempUsername = user.username;
  });

  beforeEach(async () => {
    await prisma.systemAlert.deleteMany({ where: { userId: tempUserId } });
    await prisma.auditLogEntry.deleteMany({ where: { userId: tempUserId } });
    await prisma.user.update({
      where: { userId: tempUserId },
      data: { lastLogin: null, failedLoginCount: 0, lockedUntil: null },
    });
  });

  afterAll(async () => {
    await prisma.systemAlert.deleteMany({ where: { userId: tempUserId } });
    await prisma.auditLogEntry.deleteMany({ where: { userId: tempUserId } });
    await prisma.user.deleteMany({ where: { userId: tempUserId } });
  });

  it('logs in with valid credentials and returns a token', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'admin', password: 'password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('Administrator');
  });

  it('rejects bad password with the same generic response as an unknown username', async () => {
    const badPassword = await api().post('/api/auth/login').send({ username: tempUsername, password: 'wrongpass' });
    const unknownUser = await api().post('/api/auth/login').send({ username: 'missing-user', password: 'wrongpass' });
    expect(badPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(badPassword.body).toEqual({ error: 'Invalid credentials' });
    expect(unknownUser.body).toEqual(badPassword.body);
  });

  it('rejects missing fields with 400', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });

  it('requires a token for /me', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the profile for a valid token', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${ctx.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(ctx.adminId);
  });

  it('locks an account after five failed logins within fifteen minutes', async () => {
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await api().post('/api/auth/login').send({ username: tempUsername, password: 'wrongpass' });
      expect(response.status).toBe(401);
    }

    const lockStartedAt = Date.now();
    const response = await api().post('/api/auth/login').send({ username: tempUsername, password: 'wrongpass' });
    const lockCheckedAt = Date.now();
    expect(response.status).toBe(423);
    expect(response.body).toEqual({ error: 'Account temporarily locked. Try again later.' });

    const user = await prisma.user.findUniqueOrThrow({ where: { userId: tempUserId } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).not.toBeNull();
    expect(user.lockedUntil?.getTime()).toBeGreaterThanOrEqual(lockStartedAt + 30 * 60 * 1000 - 1000);
    expect(user.lockedUntil?.getTime()).toBeLessThanOrEqual(lockCheckedAt + 30 * 60 * 1000 + 1000);

    const alerts = await prisma.systemAlert.findMany({
      where: { userId: tempUserId, alertType: 'Account_Lockout' },
    });
    expect(alerts).toHaveLength(1);
  });

  it('returns the same locked response for the correct password', async () => {
    await prisma.user.update({
      where: { userId: tempUserId },
      data: { lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const response = await api().post('/api/auth/login').send({ username: tempUsername, password: validPassword });
    expect(response.status).toBe(423);
    expect(response.body).toEqual({ error: 'Account temporarily locked. Try again later.' });
  });

  it('allows login after lockedUntil is in the past and resets lockout state', async () => {
    await prisma.user.update({
      where: { userId: tempUserId },
      data: {
        failedLoginCount: 4,
        lockedUntil: new Date(Date.now() - 1000),
      },
    });

    const response = await api().post('/api/auth/login').send({ username: tempUsername, password: validPassword });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { userId: tempUserId } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.lastLogin).not.toBeNull();
  });
});