import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeaders, ctx, auditIdsMatching, purgeAudit, purgeNewAudit, purgeRefreshTokens } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let tempUserId = '';
// Users this file mints through the API (row 60's create endpoint). Each is
// hard-deleted in the teardown, because the product's own delete is a soft one.
const createdUserIds: string[] = [];
// Read before any request in this file, so the teardown can remove only the rows
// this file caused and leave the baseline's alone.
const seedUserAuditBaseline = await auditIdsMatching({ tableName: 'User', action: 'Blocked' });

interface RawResponse {
  status: number;
  headers: Record<string, unknown>;
  body: { token?: string; error?: string; message?: string; userId?: string };
}

function refreshCookieFrom(res: RawResponse): string {
  const setCookie = (res.headers['set-cookie'] as unknown as string[]) || [];
  const header = setCookie.find((c) => c.startsWith('cmms_refresh='));
  return header ? header.split(';')[0] : '';
}

async function loginAs(username: string, password: string) {
  const res = (await api()
    .post('/api/auth/login')
    .send({ username, password })) as unknown as RawResponse;
  return { res, token: res.body.token ?? '', cookie: refreshCookieFrom(res) };
}

/** A throwaway account this file owns, signed in through the real login route. */
async function createSessionUser() {
  const username = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'SessionPass123';
  const created = await api()
    .post('/api/users')
    .set(authHeaders(ctx.adminToken))
    .send({
      username,
      password,
      fullName: 'Session Test User',
      email: `${username}@example.com`,
      role: 'Technician',
    });
  expect(created.status).toBe(201);
  createdUserIds.push(created.body.userId);
  return { id: created.body.userId as string, username, password };
}

function meStatus(token: string) {
  return api()
    .get('/api/auth/me')
    .set(authHeaders(token))
    .then((res) => res.status);
}

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
      // Row 60's created account signs in, which opens a session row that would
      // otherwise restrict the hard delete below.
      await purgeRefreshTokens(ids);
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

  it('updates a user as Administrator and diffs the columns that moved', async () => {
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

    // Row 149 (SOW 3.3.8). A single-column edit records exactly that column with
    // both values, which is the difference between a trail entry and a diff.
    //
    // Filtered on the new value as well as the column name. A name-only
    // findFirst is only deterministic while a column is written once per file,
    // and that is an accident of test order rather than a property worth
    // relying on: workOrders.test.ts learned this the hard way when CI returned
    // an older description row from an earlier test.
    const diff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'User',
        recordId: tempUserId,
        action: 'Update',
        fieldName: 'fullName',
        newValue: 'Updated Temp User',
      },
    });
    expect(diff).not.toBeNull();
    expect(diff?.oldValue).toBe('Temp Test User');
    expect(diff?.userId).toBe(ctx.adminId);
  });

  it('diffs a role change so the privilege move is legible after the fact', async () => {
    const res = await api()
      .put(`/api/users/${tempUserId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ role: 'Requester' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Requester');

    const diff = await prisma.auditLogEntry.findFirst({
      where: {
        tableName: 'User',
        recordId: tempUserId,
        action: 'Update',
        fieldName: 'role',
        newValue: 'Requester',
      },
    });
    expect(diff).not.toBeNull();
    expect(diff?.oldValue).toBe('Technician');
    expect(diff?.newValue).toBe('Requester');
  });

  it('keeps passwordHash out of the audit trail while diffing other columns', async () => {
    // The before-row handed to logFieldChanges carries the hash, so this asserts
    // the exclusion is real and not just an intention in a comment. The temp
    // user is hard-deleted in teardown, so the rotated hash is this file's to
    // leave behind.
    await prisma.user.update({
      where: { userId: tempUserId },
      data: { passwordHash: 'rotated-not-a-real-hash' },
    });
    const res = await api()
      .put(`/api/users/${tempUserId}`)
      .set(authHeaders(ctx.adminToken))
      .send({ email: 'temp.updated@example.com' });
    expect(res.status).toBe(200);

    const rows = await prisma.auditLogEntry.findMany({
      where: { tableName: 'User', recordId: tempUserId, action: 'Update' },
    });
    expect(rows.every((r) => r.fieldName !== 'passwordHash')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('rotated-not-a-real-hash');

    const emailDiff = rows.find((r) => r.fieldName === 'email' && r.newValue === 'temp.updated@example.com');
    expect(emailDiff).toBeDefined();
    expect(emailDiff?.oldValue).toBe('temp@example.com');
    expect(emailDiff?.newValue).toBe('temp.updated@example.com');
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

  // A5: the installer has always refused a first-Administrator password shorter
  // than 12, while the API accepted 8. These two cases would both have passed
  // under the old floor, which is what makes them a regression test for the
  // alignment rather than a restatement of the existing min-length guard.
  it('rejects an 11-character password change that the old 8-character floor allowed', async () => {
    const res = await api()
      .put(`/api/users/${tempUserId}/password`)
      .set(authHeaders(ctx.adminToken))
      .send({ newPassword: 'elevenchars' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('12 characters');
  });

  it('rejects an 11-character password at creation', async () => {
    const res = await api()
      .post('/api/users')
      .set(authHeaders(ctx.adminToken))
      .send({
        username: `eleven-${Date.now()}`,
        password: 'elevenchars',
        fullName: 'Eleven Chars',
        email: `eleven-${Date.now()}@example.com`,
        role: 'Technician',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('12 characters');
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

  // Session revocation on the account lifecycle events. Before this, a password
  // reset, deactivation or soft delete took effect only at the next sign-in, so
  // an already-issued access token stayed valid until it expired.
  it('revokes every live session when an Administrator resets a password', async () => {
    const { id, username, password } = await createSessionUser();
    const first = await loginAs(username, password);
    const second = await loginAs(username, password);
    expect(first.res.status).toBe(200);
    expect(second.res.status).toBe(200);
    expect(await meStatus(first.token)).toBe(200);
    expect(await meStatus(second.token)).toBe(200);

    const reset = await api()
      .put(`/api/users/${id}/password`)
      .set(authHeaders(ctx.adminToken))
      .send({ newPassword: 'ResetPass456789' });
    expect(reset.status).toBe(200);

    expect(await meStatus(first.token)).toBe(401);
    expect(await meStatus(second.token)).toBe(401);
    expect((await api().post('/api/auth/refresh').set('Cookie', first.cookie)).status).toBe(401);

    const reLogin = await loginAs(username, 'ResetPass456789');
    expect(reLogin.res.status).toBe(200);
    expect(await meStatus(reLogin.token)).toBe(200);
  });

  it('keeps the current session and ends the others on a self password change', async () => {
    const { id, username, password } = await createSessionUser();
    const current = await loginAs(username, password);
    const other = await loginAs(username, password);

    const change = await api()
      .put(`/api/users/${id}/password`)
      .set(authHeaders(current.token))
      .send({ currentPassword: password, newPassword: 'SelfPass456789' });
    expect(change.status).toBe(200);

    expect(await meStatus(current.token)).toBe(200);
    expect(await meStatus(other.token)).toBe(401);
    // The kept session is still rotatable, so the device that made the change
    // does not have to sign in again.
    expect((await api().post('/api/auth/refresh').set('Cookie', current.cookie)).status).toBe(200);
  });

  it('revokes live sessions when a user is soft-deleted', async () => {
    const { id, username, password } = await createSessionUser();
    const live = await loginAs(username, password);
    expect(await meStatus(live.token)).toBe(200);

    const res = await api().delete(`/api/users/${id}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);

    expect(await meStatus(live.token)).toBe(401);
    expect((await loginAs(username, password)).res.status).toBe(401);
  });

  it('revokes live sessions when PUT sets isActive to false', async () => {
    const { id, username, password } = await createSessionUser();
    const live = await loginAs(username, password);
    expect(await meStatus(live.token)).toBe(200);

    const res = await api()
      .put(`/api/users/${id}`)
      .set(authHeaders(ctx.adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    expect(await meStatus(live.token)).toBe(401);
  });

  it('does not revoke sessions on a role change (O-3)', async () => {
    const { id, username, password } = await createSessionUser();
    const live = await loginAs(username, password);

    const res = await api()
      .put(`/api/users/${id}`)
      .set(authHeaders(ctx.adminToken))
      .send({ role: 'Requester' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Requester');

    // The decision accepts that the token keeps its old role until the next
    // sign-in; what must not happen is an unexpected sign-out mid-edit.
    expect(await meStatus(live.token)).toBe(200);
  });
});