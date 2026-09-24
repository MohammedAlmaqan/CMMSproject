import { describe, it, expect } from 'vitest';
import { api } from '../helpers.js';
import { ctx } from '../helpers.js';

describe('auth routes', () => {
  it('logs in with valid credentials and returns a token', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'admin', password: 'password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('Administrator');
  });

  it('rejects bad password with 401', async () => {
    const res = await api().post('/api/auth/login').send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
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
});