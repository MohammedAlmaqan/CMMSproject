import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeaders, ctx, auditIdsMatching, purgeAudit, purgeNewAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let tempUserId = '';
// Read before any request in this file, so the teardown can remove only the rows
// this file caused and leave the baseline's alone.
const seedUserAuditBaseline = await auditIdsMatching({ tableName: 'User', action: 'Blocked' });

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
      // By record id, not by actor: the routes audit the user being changed while
      // the administrator performs the change, so filtering on the actor column
      // matched the administrator's own history and left this user's rows behind.
      await purgeAudit([tempUserId]);
      // A refused password change audits the account it was aimed at, which is a
      // seeded user and therefore not this file's to delete - only the row the
      // refusal produced is.
      await purgeNewAudit(seedUserAuditBaseline, { tableName: 'User', recordId: ctx.adminId, action: 'Blocked' });
      await prisma.user.deleteMany({ where: { userId: tempUserId } });
    }
  });

  it('restricts user listing to Administrator', async () => {
    const op = await api().get('/api/users').set(authHeaders(ctx.operatorToken));
    expect(op.status).toBe(403);
    const res = await api().get('/api/users').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('serves narrow user options to Requester+ without exposing sensitive keys', async () => {
    const res = await api().get('/api/users/options').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const u of res.body) {
      expect(Object.keys(u).sort()).toEqual(['fullName', 'role', 'userId', 'username']);
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('email');
      expect(u).not.toHaveProperty('lastLogin');
    }
  });

  it('rejects user options without a token', async () => {
    const res = await api().get('/api/users/options');
    expect(res.status).toBe(401);
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
    // Deliberately no fieldName, and none could be: a password change must
    // never put the old or new secret in an audit row, so the fact that it
    // happened, by whom and from where, is the whole of the record.
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'User', recordId: tempUserId, action: 'Update', fieldName: null },
    });
    const res = await api()
      .put(`/api/users/${tempUserId}/password`)
      .set(authHeaders(ctx.adminToken))
      .send({ newPassword: 'NewTempPass456' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated successfully');
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'User', recordId: tempUserId, action: 'Update', fieldName: null },
      })
    ).toBe(before + 1);
  });
});