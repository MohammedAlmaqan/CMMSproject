import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const code = `WC-T${stamp}`;
let createdId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'WorkCenter', recordId, action },
  });
}

describe('work centers routes', () => {
  it('returns the seeded work center list', async () => {
    const res = await api().get('/api/work-centers').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/work-centers');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/work-centers')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ code, name: 'Test', dailyCapacityHours: 8, costRatePerHour: 10 });
    expect(res.status).toBe(403);
  });

  it('creates a work center (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/work-centers')
      .set(authHeaders(ctx.operatorToken))
      .send({ code, name: 'Test WC', dailyCapacityHours: 8, costRatePerHour: 10 });
    expect(res.status).toBe(201);
    createdId = res.body.workCenterId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/work-centers')
      .set(authHeaders(ctx.operatorToken))
      .send({ code: '', name: 'x', dailyCapacityHours: -1, costRatePerHour: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('dailyCapacityHours');
  });

  it('updates a work center and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/work-centers/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ name: 'Updated WC' });
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/work-centers/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a work center (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/work-centers/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });
});