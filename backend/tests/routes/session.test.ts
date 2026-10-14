import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';
import { hashRefreshToken } from '../../src/utils/session.js';
import { SESSION_IDLE_MS } from '../../src/utils/config.js';

// SOW 4.2 (server-side idle expiry) and 5.5 (refresh token rotation), register
// item C1. These cases exercise the session end to end: a login opens it, a
// refresh rotates it, logout revokes it, and an idle or reused token is refused.

interface RawResponse {
  status: number;
  headers: Record<string, unknown>;
  body: { token?: string; error?: string };
}

function cookieHeaderFrom(res: RawResponse): string {
  const setCookie = (res.headers['set-cookie'] as unknown as string[]) || [];
  const header = setCookie.find((c) => c.startsWith('cmms_refresh='));
  return header ? header.split(';')[0] : '';
}

function fullSetCookieHeaders(res: RawResponse): string[] {
  return (res.headers['set-cookie'] as unknown as string[]) || [];
}

async function login(): Promise<{ res: RawResponse; cookie: string; token: string }> {
  const res = (await api()
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'password' })) as unknown as RawResponse;
  return { res, cookie: cookieHeaderFrom(res), token: res.body.token ?? '' };
}

async function sessionFor(cookie: string) {
  const raw = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  return prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(raw) } });
}

describe('session security (SOW 4.2, 5.5 / register C1)', () => {
  // A successful login opens a refresh-token row for admin. The seed and the
  // harness never create one, so everything this file leaves is its own.
  let adminSessionBaseline: string[] = [];

  beforeAll(async () => {
    adminSessionBaseline = (
      await prisma.refreshToken.findMany({ where: { userId: ctx.adminId }, select: { tokenId: true } })
    ).map((r) => r.tokenId);
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { userId: ctx.adminId, tokenId: { notIn: adminSessionBaseline } },
    });
  });

  it('sets an httpOnly refresh cookie scoped to /api on login', async () => {
    const { res, cookie } = await login();
    expect(res.status).toBe(200);
    const header = fullSetCookieHeaders(res).find((c) => c.startsWith('cmms_refresh='))!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\/api/i);
    expect(cookie).toMatch(/^cmms_refresh=.+/);
  });

  it('authorises a session-backed request with the access token it returns', async () => {
    const { token } = await login();
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.userId).toBe(ctx.adminId);
  });

  it('still accepts a token with no session id (harness / pre-session token)', async () => {
    const me = await api().get('/api/auth/me').set(authHeaders(ctx.adminToken));
    expect(me.status).toBe(200);
  });

  it('rotates the refresh token and retires the one it replaced', async () => {
    const { cookie, token: firstToken } = await login();
    const before = await sessionFor(cookie);
    expect(before?.revoked).toBe(false);

    const refreshed = (await api()
      .post('/api/auth/refresh')
      .set('Cookie', cookie)) as unknown as RawResponse;
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();

    const newCookie = cookieHeaderFrom(refreshed);
    expect(newCookie).not.toBe(cookie);
    expect(newCookie).toMatch(/^cmms_refresh=.+/);

    const old = await prisma.refreshToken.findUnique({ where: { tokenId: before!.tokenId } });
    expect(old?.revoked).toBe(true);

    // The rotated access token works; the previous one no longer resolves.
    const fresh = await api().get('/api/auth/me').set('Authorization', `Bearer ${refreshed.body.token}`);
    expect(fresh.status).toBe(200);
    const stale = await api().get('/api/auth/me').set('Authorization', `Bearer ${firstToken}`);
    expect(stale.status).toBe(401);
  });

  it('treats a replayed rotated token as compromise and revokes the account sessions', async () => {
    const { cookie } = await login();
    const rotated = (await api()
      .post('/api/auth/refresh')
      .set('Cookie', cookie)) as unknown as RawResponse;
    const newCookie = cookieHeaderFrom(rotated);

    // Presenting the already-rotated cookie again is refused...
    const replay = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);

    // ...and every live session for the account is dropped with it, so the token
    // minted by the legitimate rotation is dead too.
    const after = await api().post('/api/auth/refresh').set('Cookie', newCookie);
    expect(after.status).toBe(401);
  });

  it('logout revokes the presented session so its access token stops working', async () => {
    const { cookie, token } = await login();
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    const out = await api().post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects a refresh with no cookie', async () => {
    const res = await api().post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('logout without a cookie is idempotent', async () => {
    const res = await api().post('/api/auth/logout');
    expect(res.status).toBe(204);
  });

  it('enforces the idle window on a session-backed request', async () => {
    const { cookie, token } = await login();
    const session = await sessionFor(cookie);
    await prisma.refreshToken.update({
      where: { tokenId: session!.tokenId },
      data: { lastUsedAt: new Date(Date.now() - SESSION_IDLE_MS - 5000) },
    });

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
    expect(me.body.error).toBe('Session expired');

    const revoked = await prisma.refreshToken.findUnique({ where: { tokenId: session!.tokenId } });
    expect(revoked?.revoked).toBe(true);
  });

  it('refuses to refresh an idle session', async () => {
    const { cookie } = await login();
    const session = await sessionFor(cookie);
    await prisma.refreshToken.update({
      where: { tokenId: session!.tokenId },
      data: { lastUsedAt: new Date(Date.now() - SESSION_IDLE_MS - 5000) },
    });

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});
