import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let tempUserId = '';

describe('users routes', () => {
  beforeAll(async () => {
    const hash = await bcrypt.hash('TempPass123', 10);
    const u = await prisma.user.create({
      data: {
        username: `tempuser-${Date.now()}`,
        fullName: 'Temp Test User',
        email: 'temp@example.com',
        passwordHash: hash,
        role: 'Technician',
        isActive: true,
      },
    });
    tempUserId = u.userId;
  });

  afterAll(async () => {
    if (tempUserId) {
      await prisma.auditLogEntry.deleteMany({ where: { userId: tempUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { userId: tempUserId } }).catch(() => {});
    }
  });

  it('restricts user listing to Administrator', async () => {
    const op = await api().get('/api/users').set(authHeaders(ctx.operatorToken));
    expect(op.status).toBe(403);
    const res = await api().get('/api/users').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('allows any authenticated user to view a user by id', async () => {
    const res = await api().get(`/api/users/${tempUserId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(tempUserId);
  });

  it('rejects profile update by a non-admin with 403', async () => {
    const res = await api()
      .put(`/api/users/${tempUserId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ fullName: 'Hacker' });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed update body with a zod-derived 400', async () => {
    const res = await api()
      .put(`/api/users/${tempUserId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('updates a user as Administrator and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'User', recordId: tempUserId, action: 'Update' },
    });
    const res = await api()
      .put(`/api/users/${tempUserId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ fullName: 'Updated Temp User' });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Updated Temp User');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'User', recordId: tempUserId, action: 'Update' },
      })
    ).toBe(before + 1);
  });

  it('blocks a non-admin from changing another users password', async () => {
    const res = await api()
      .put(`/api/users/${ctx.adminId}/password`)
      .set(authHeaders(ctx.operatorToken))
      .send({ newPassword: 'ShouldNotWork123' });
    expect(res.status).toBe(403);
  });

  it('changes a users password as Administrator and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'User', recordId: tempUserId, action: 'Update', fieldName: 'password' },
    });
    const res = await api()
      .put(`/api/users/${tempUserId}/password`)
      .set(authHeaders(ctx.adminToken))
      .send({ newPassword: 'NewTempPass456' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated successfully');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'User', recordId: tempUserId, action: 'Update', fieldName: 'password' },
      })
    ).toBe(before + 1);
  });
});