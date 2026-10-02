import { describe, it, expect, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeCauseCodes } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const code = `CC-T${stamp}`;
let createdId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'CauseCode', recordId, action },
  });
}

describe('cause code routes (SOW 3.1.4, D5)', () => {
  it('returns the cause code list', async () => {
    const res = await api().get('/api/cause-codes').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/cause-codes');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/cause-codes')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ code, description: 'x' });
    expect(res.status).toBe(403);
  });

  it('creates a cause code (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/cause-codes')
      .set(authHeaders(ctx.operatorToken))
      .send({ code, description: 'test cause code' });
    expect(res.status).toBe(201);
    createdId = res.body.causeCodeId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/cause-codes')
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('code');
  });

  it('returns a single cause code by id', async () => {
    const res = await api().get(`/api/cause-codes/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.causeCodeId).toBe(createdId);
  });

  it('updates a cause code and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/cause-codes/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated cause code' });
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/cause-codes/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a cause code (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/cause-codes/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });

  it('no longer lists a soft-deleted cause code by id', async () => {
    const res = await api().get(`/api/cause-codes/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    // The delete case marks the row rather than removing it, so hard-delete it
    // here along with the audit rows describing it.
    await purgeCauseCodes([createdId]);
  });
});
