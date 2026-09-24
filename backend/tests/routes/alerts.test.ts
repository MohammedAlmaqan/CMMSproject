import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let alertId = '';

describe('alerts routes', () => {
  afterAll(async () => {
    if (alertId) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: alertId } }).catch(() => {});
      await prisma.systemAlert.deleteMany({ where: { alertId } }).catch(() => {});
    }
  });

  it('returns the current users alerts', async () => {
    const res = await api().get('/api/alerts').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns the unread count', async () => {
    const res = await api().get('/api/alerts/unread-count').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/alerts');
    expect(res.status).toBe(401);
  });

  it('rejects read-all by a below-Requester role with 403', async () => {
    const res = await api().put('/api/alerts/read-all').set(authHeaders(ctx.viewOnlyToken));
    expect(res.status).toBe(403);
  });

  it('marks all alerts read and writes an audit row', async () => {
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'SystemAlert', recordId: ctx.operatorId, action: 'Update', fieldName: 'read-all' },
    });
    const res = await api().put('/api/alerts/read-all').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'SystemAlert', recordId: ctx.operatorId, action: 'Update', fieldName: 'read-all' },
      })
    ).toBe(before + 1);
  });

  it('marks a single alert read and writes an audit row', async () => {
    const alert = await prisma.systemAlert.create({
      data: {
        alertType: 'WO_Overdue',
        userId: ctx.operatorId,
        title: 'Test alert',
        message: 'test message',
        isRead: false,
      },
    });
    alertId = alert.alertId;
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'SystemAlert', recordId: alertId, action: 'Update' },
    });
    const res = await api().put(`/api/alerts/${alertId}/read`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(true);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'SystemAlert', recordId: alertId, action: 'Update' },
      })
    ).toBe(before + 1);
  });
});