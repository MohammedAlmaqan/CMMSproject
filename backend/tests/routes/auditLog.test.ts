import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';

describe('audit log routes', () => {
  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/audit-log');
    expect(res.status).toBe(401);
  });

  it('returns paged audit entries for an authenticated user', async () => {
    const res = await api().get('/api/audit-log').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('supports tableName filtering', async () => {
    const res = await api().get('/api/audit-log').set(authHeaders(ctx.adminToken)).query({ tableName: 'WorkOrder' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
})