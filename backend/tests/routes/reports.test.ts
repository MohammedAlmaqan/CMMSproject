import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';

describe('reports routes', () => {
  const endpoints = ['/backlog', '/pm-compliance', '/mtbf', '/mttr', '/cost-summary', '/downtime', '/material-consumption'];

  it('returns 200 for every report endpoint', async () => {
    for (const ep of endpoints) {
      const res = await api().get(`/api/reports${ep}`).set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep}`).toBe(200);
    }
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/reports/backlog');
    expect(res.status).toBe(401);
  });

  it('returns report data as an array', async () => {
    const res = await api().get('/api/reports/backlog').set(authHeaders(ctx.adminToken));
    expect(Array.isArray(res.body)).toBe(true);
  });
})