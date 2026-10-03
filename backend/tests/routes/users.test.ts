import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeaders, ctx, auditIdsMatching, purgeAudit, purgeNewAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let tempUserId = '';
// Users this file mints through the API (row 60's create endpoint). Each is
// hard-deleted in the teardown, because the product's own delete is a soft one.
const createdUserIds: string[] = [];
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
    const ids = [tempUserId, ...createdUserIds].filter((id): id is string => id.length > 0);
    if (ids.length > 0) {
      // By record id, not by actor: the routes audit the user being changed while
      // the administrator performs the change, so filtering on the actor column
      // matched the administrator's own history and left this user's rows behind.
      await purgeAudit(ids);
      // A refused password change audits the account it was aimed at, which is a
      // seeded user and therefore not this file's to delete - only the row the
      // refusal produced is.
      await purgeNewAudit(seedUserAuditBaseline, { tableName: 'User', recordId: ctx.adminId, action: 'Blocked' });
      await prisma.user.deleteMany({ where: { userId: { in: ids } } });
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

  // Row 60 - Administrator user lifecycle (create + deactivate).

  it('rejects user creation by a non-admin with 403', async () => {
    const res = await api()
      .post('/api/users')
      .set(authHeaders(ctx.operatorToken))
      .send({ username: 'notallowed', password: 'NotAllowed123', fullName: 'Nope', email: 'nope@example.com', role: 'Technician' });
    expect(res.status).toBe(403);
  });

  it('rejects a malformed create body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/users')
      .set(authHeaders(ctx.adminToken))
      .send({ username: 'shortpass', password: 'short', fullName: 'Short', email: 'short@example.com', role: 'Technician' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  it('creates a user as Administrator, hashes the password, and lets them sign in', async () => {
    const username = `created-${Date.now()}`;
    const before = await prisma.auditLogEntry.count({ where: { tableName: 'User', action: 'Create' } });

    const res = await api()
      .post('/api/users')
      .set(authHeaders(ctx.adminToken))
      .send({ username, password: 'CreatedPass123', fullName: 'Created User', email: 'created@example.com', role: 'Requester' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBeTruthy();
    expect(res.body.username).toBe(username);
    expect(res.body.role).toBe('Requester');
    // The hash is never selected back, and what is stored is a bcrypt digest of
    // the password rather than the password itself.
    expect(res.body).not.toHaveProperty('passwordHash');
    createdUserIds.push(res.body.userId);
    const row = await prisma.user.findUnique({ where: { userId: res.body.userId } });
    expect(row?.passwordHash).not.toBe('CreatedPass123');
    expect(await bcrypt.compare('CreatedPass123', row!.passwordHash)).toBe(true);

    expect(await prisma.auditLogEntry.count({ where: { tableName: 'User', action: 'Create' } })).toBe(before + 1);

    // The operational point of row 60: the new account can sign in without a DBA.
    const login = await api().post('/api/auth/login').send({ username, password: 'CreatedPass123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  it('rejects a duplicate active username with 409', async () => {
    const temp = await prisma.user.findUnique({ where: { userId: tempUserId } });
    const res = await api()
      .post('/api/users')
      .set(authHeaders(ctx.adminToken))
      .send({ username: temp!.username, password: 'DuplicatePass123', fullName: 'Duplicate', email: 'duplicate@example.com', role: 'Technician' });
    expect(res.status).toBe(409);
  });

  it('rejects user deactivation by a non-admin with 403', async () => {
    const res = await api().delete(`/api/users/${tempUserId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('refuses to let an Administrator deactivate their own account', async () => {
    const res = await api().delete(`/api/users/${ctx.adminId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('returns 404 when deactivating an unknown user', async () => {
    const res = await api().delete('/api/users/does-not-exist').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(404);
  });

  it('soft-deletes a user as Administrator, audits it, and blocks sign-in', async () => {
    const username = `deactivate-${Date.now()}`;
    const created = await api()
      .post('/api/users')
      .set(authHeaders(ctx.adminToken))
      .send({ username, password: 'DeactivatePass123', fullName: 'Deactivate Me', email: 'deactivate@example.com', role: 'Technician' });
    expect(created.status).toBe(201);
    const id = created.body.userId;
    createdUserIds.push(id);

    const before = await prisma.auditLogEntry.count({ where: { tableName: 'User', recordId: id, action: 'Delete' } });
    const res = await api().delete(`/api/users/${id}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User deactivated successfully');

    // A soft delete, not a row removal: the account is still there for its
    // audit trail but is inactive and gone from the active-user projection.
    const row = await prisma.user.findUnique({ where: { userId: id } });
    expect(row).not.toBeNull();
    expect(row!.isDeleted).toBe(true);
    expect(row!.isActive).toBe(false);
    expect(await prisma.auditLogEntry.count({ where: { tableName: 'User', recordId: id, action: 'Delete' } })).toBe(before + 1);

    const options = await api().get('/api/users/options').set(authHeaders(ctx.adminToken));
    expect(options.status).toBe(200);
    expect(options.body.some((u: { userId: string }) => u.userId === id)).toBe(false);

    const login = await api().post('/api/auth/login').send({ username, password: 'DeactivatePass123' });
    expect(login.status).toBe(401);
  });
});