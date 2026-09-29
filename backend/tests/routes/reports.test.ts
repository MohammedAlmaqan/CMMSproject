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
});

describe('report filters', () => {
  const endpoints = ['/backlog', '/pm-compliance', '/mtbf', '/mttr', '/cost-summary', '/downtime', '/material-consumption'];

  it('accepts every shared filter on every report', async () => {
    for (const ep of endpoints) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ from: '2020-01-01', to: '2030-12-31', equipmentId: 'EQ-ANY', workCenterId: 'WC-ANY' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with filters`).toBe(200);
    }
  });

  it('accepts a location filter on every report', async () => {
    for (const ep of endpoints) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ functionalLocationId: 'LOC-ANY' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with location`).toBe(200);
    }
  });

  it('accepts the descendant-location flag on every report', async () => {
    for (const ep of endpoints) {
      const res = await api()
        .get(`/api/reports${ep}`)
        .query({ functionalLocationId: 'LOC-ANY', includeDescendantLocations: 'true' })
        .set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/reports${ep} with descendants`).toBe(200);
    }
  });

  it('rejects an unparseable date with 400 rather than returning an empty report', async () => {
    const res = await api().get('/api/reports/backlog').query({ from: 'yesterday' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a reversed range with 400', async () => {
    const res = await api().get('/api/reports/mttr').query({ from: '2026-03-15', to: '2026-03-01' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean descendant flag with 400', async () => {
    const res = await api().get('/api/reports/downtime')
      .query({ functionalLocationId: 'LOC-ANY', includeDescendantLocations: 'yes' })
      .set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects a repeated filter parameter with 400', async () => {
    const res = await api().get('/api/reports/backlog?equipmentId=A&equipmentId=B').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(400);
  });

  it('treats an empty filter parameter as absent', async () => {
    const res = await api().get('/api/reports/backlog').query({ from: '', to: '', equipmentId: '' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
  });

  it('narrows a date filter instead of ignoring it', async () => {
    const wide = await api().get('/api/reports/backlog').query({ from: '2000-01-01', to: '2099-12-31' }).set(authHeaders(ctx.adminToken));
    const narrow = await api().get('/api/reports/backlog').query({ from: '2000-01-01', to: '2000-01-02' }).set(authHeaders(ctx.adminToken));
    expect(wide.status).toBe(200);
    expect(narrow.status).toBe(200);
    const wideCount = wide.body.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
    const narrowCount = narrow.body.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
    expect(narrowCount).toBeLessThanOrEqual(wideCount);
  });

  it('still answers pm-compliance when only the shared filters are given, without a year or month', async () => {
    const res = await api().get('/api/reports/pm-compliance').query({ equipmentId: 'EQ-ANY' }).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('complianceRate');
  });
});
