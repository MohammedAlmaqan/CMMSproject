import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';

// SOW 5.4 asks for API versioning via URL path. The API is served under both
// `/api` and `/api/v1` from a single router, so the two prefixes cannot drift.
// These cases prove the versioned prefix reaches health, an authenticated
// resource and the auth route, and that the unversioned prefix still answers.
//
// The login rate limiter is registered for both prefixes in `index.ts`; it is
// not exercised here because a burst would exhaust the shared per-process
// window and destabilise the rest of the suite.
describe('API versioning (SOW 5.4, row 294)', () => {
  it('answers the health check under both prefixes', async () => {
    const unversioned = await api().get('/api/health');
    const versioned = await api().get('/api/v1/health');
    expect(unversioned.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(unversioned.body.status).toBe('ok');
    expect(versioned.body.status).toBe('ok');
  });

  it('serves an authenticated resource identically under both prefixes', async () => {
    const unversioned = await api().get('/api/work-orders').set(authHeaders(ctx.adminToken));
    const versioned = await api().get('/api/v1/work-orders').set(authHeaders(ctx.adminToken));
    expect(unversioned.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(versioned.body).toEqual(unversioned.body);
  });

  it('serves the users resource under the versioned prefix for an administrator', async () => {
    const versioned = await api().get('/api/v1/users').set(authHeaders(ctx.adminToken));
    expect(versioned.status).toBe(200);
  });

  it('reaches the auth route under the versioned prefix', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'no-such-user-for-versioning', password: 'irrelevant' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});
