import { describe, it, expect } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const code = `FC-T${stamp}`;
let createdId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'FailureCode', recordId, action },
  });
}

describe('failure codes routes', () => {
  it('returns the failure code list', async () => {
    const res = await api().get('/api/failure-codes').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns the failure code tree', async () => {
    const res = await api().get('/api/failure-codes/tree').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/failure-codes');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/failure-codes')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ code, description: 'x' });
    expect(res.status).toBe(403);
  });

  it('creates a failure code (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/failure-codes')
      .set(authHeaders(ctx.operatorToken))
      .send({ code, description: 'test failure code' });
    expect(res.status).toBe(201);
    createdId = res.body.failureCodeId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/failure-codes')
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('code');
  });

  it('updates a failure code and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/failure-codes/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated failure code' });
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/failure-codes/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a failure code (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/failure-codes/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });
});