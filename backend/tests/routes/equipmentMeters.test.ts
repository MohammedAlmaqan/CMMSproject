import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let equipmentId = '';
let meterId = '';
let readingId = '';

describe('equipment meters routes', () => {
  beforeAll(async () => {
    const e = await prisma.equipment.findFirst({ where: { isDeleted: false } });
    equipmentId = e!.equipmentId;
  });

  afterAll(async () => {
    if (readingId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: readingId } }).catch(() => {});
    }
    if (meterId) {
      await prisma.meterReading.deleteMany({ where: { meterId } }).catch(() => {});
      await prisma.maintenancePlanMeter.deleteMany({ where: { meterId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: meterId } }).catch(() => {});
      await prisma.equipmentMeter.deleteMany({ where: { meterId } }).catch(() => {});
    }
  });

  it('returns the meter list filtered by equipment', async () => {
    const res = await api().get(`/api/equipment-meters?equipmentId=${equipmentId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/equipment-meters');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-Technician role with 403', async () => {
    const res = await api()
      .post('/api/equipment-meters')
      .set(authHeaders(ctx.operatorToken))
      .send({ equipmentId, meterName: 'Test Meter', unitOfMeasure: 'H' });
    expect(res.status).toBe(403);
  });

  it('creates a meter (Technician+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/equipment-meters')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentId, meterName: 'Test Meter', unitOfMeasure: 'H' });
    expect(res.status).toBe(201);
    meterId = res.body.meterId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'EquipmentMeter', recordId: meterId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/equipment-meters')
      .set(authHeaders(ctx.adminToken))
      .send({ equipmentId: '', meterName: '' });
    expect(res.status).toBe(400);
  });

  it('records a meter reading and writes an audit row', async () => {
    const res = await api()
      .post(`/api/equipment-meters/${meterId}/readings`)
      .set(authHeaders(ctx.adminToken))
      .send({ readingValue: 1234.5, notes: 'test reading' });
    expect(res.status).toBe(201);
    readingId = res.body.readingId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'MeterReading', recordId: readingId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/equipment-meters/${meterId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a meter (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/equipment-meters/${meterId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'EquipmentMeter', recordId: meterId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
});