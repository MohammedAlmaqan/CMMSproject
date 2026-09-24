import { describe, it, expect, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const locationCode = `LOC-T${stamp}`;
let createdId = '';

describe('functional locations routes', () => {
  afterAll(async () => {
    if (createdId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } }).catch(() => {});
      await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: createdId } }).catch(() => {});
    }
  });

  it('returns the functional location list (plant tree source)', async () => {
    const res = await api().get('/api/functional-locations').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });

  it('returns the tree shape', async () => {
    const res = await api().get('/api/functional-locations/tree').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/functional-locations');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/functional-locations')
      .set(authHeaders(ctx.operatorToken))
      .send({ locationCode, description: 'test location', locationType: 'Area' });
    expect(res.status).toBe(403);
  });

  it('creates a functional location (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/functional-locations')
      .set(authHeaders(ctx.adminToken))
      .send({ locationCode, description: 'test location', locationType: 'Area' });
    expect(res.status).toBe(201);
    createdId = res.body.functionalLocationId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'FunctionalLocation', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/functional-locations')
      .set(authHeaders(ctx.adminToken))
      .send({ description: 'no code or type' });
    expect(res.status).toBe(400);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/functional-locations/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a functional location (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/functional-locations/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'FunctionalLocation', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});