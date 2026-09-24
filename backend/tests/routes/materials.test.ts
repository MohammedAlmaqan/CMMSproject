import { describe, it, expect, beforeAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let createdId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'Material', recordId, action },
  });
}

describe('materials routes', () => {
  it('returns the seeded material list for an authenticated user', async () => {
    const res = await api().get('/api/materials').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/materials');
    expect(res.status).toBe(401);
  });

  it('rejects a below-minimum role with 403 on create', async () => {
    const res = await api()
      .post('/api/materials')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ materialCode: 'XX', description: 'x', unitOfMeasure: 'EA' });
    expect(res.status).toBe(403);
  });

  it('creates a material (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/materials')
      .set(authHeaders(ctx.operatorToken))
      .send({
        materialCode: `TESTM-${stamp}`,
        description: 'test material',
        unitOfMeasure: 'EA',
        standardCost: 12.5,
        currentStock: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body.materialCode).toBe(`TESTM-${stamp}`);
    createdId = res.body.materialId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/materials')
      .set(authHeaders(ctx.operatorToken))
      .send({ materialCode: '', unitOfMeasure: 'EA' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('materialCode');
  });

  it('updates a material (Requester+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/materials/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated material' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated material');
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/materials/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a material (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/materials/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    const list = await api().get('/api/materials').set(authHeaders(ctx.adminToken));
    expect((list.body as any[]).some((m) => m.materialId === createdId)).toBe(false);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });
});