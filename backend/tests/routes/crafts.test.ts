import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';

describe('crafts routes', () => {
  it('returns the craft list', async () => {
    const res = await api().get('/api/crafts').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/crafts');
    expect(res.status).toBe(401);
  });
})