import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const equipmentCode = `EQ-T${stamp}`;
let createdId = '';
let flat = '';

describe('equipment routes', () => {
  beforeAll(async () => {
    flat = (await prisma.functionalLocation.findFirst({ where: { isDeleted: false } }))?.functionalLocationId || '';
  });

  afterAll(async () => {
    if (createdId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } }).catch(() => {});
      await prisma.equipment.deleteMany({ where: { equipmentId: createdId } }).catch(() => {});
    }
  });

  it('returns the seeded equipment list', async () => {
    const res = await api().get('/api/equipment').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/equipment');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.operatorToken))
      .send({ equipmentCode, name: 'Test Pump', functionalLocationId: flat, criticality: 'B' });
    expect(res.status).toBe(403);
  });

  it('creates equipment (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode, name: 'Test Pump', functionalLocationId: flat, criticality: 'B', operationalStatus: 'Active' });
    expect(res.status).toBe(201);
    createdId = res.body.equipmentId;
    expect(res.body.equipmentCode).toBe(equipmentCode);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Equipment', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentCode: '', name: '', functionalLocationId: '', criticality: 'Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('criticality');
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/equipment/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes equipment (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/equipment/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Equipment', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});