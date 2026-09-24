import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';

describe('dashboard routes', () => {
  const endpoints = ['/kpis', '/alerts', '/cost-summary'];

  it('returns 200 for every dashboard endpoint', async () => {
    for (const ep of endpoints) {
      const res = await api().get(`/api/dashboard${ep}`).set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/dashboard${ep}`).toBe(200);
    }
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/dashboard/kpis');
    expect(res.status).toBe(401);
  });
})