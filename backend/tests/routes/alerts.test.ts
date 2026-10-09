import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, auditIdsMatching, purgeAlerts, purgeNewAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let alertId = '';
// Read before the first request in this file, so the teardown can drop only the
// bulk-alert audit row this run produced.
const bulkAuditBaseline = await auditIdsMatching({
  tableName: 'SystemAlert',
  recordId: ctx.operatorId,
  action: 'Update',
  fieldName: null,
});

describe('alerts routes', () => {
  afterAll(async () => {
    await purgeAlerts([alertId]);
    // "Mark every alert read" is a bulk event, so it audits under the acting
    // user rather than under an alert, and that row outlived this file. Deleting
    // every row of that shape is not the fix, though: earlier runs left rows of
    // exactly that shape, so they are in the baseline and a blanket delete
    // destroys them - which the invariance check reports as lost rows, just as
    // loudly. Only the row this run added goes.
    await purgeNewAudit(bulkAuditBaseline, { tableName: 'SystemAlert', recordId: ctx.operatorId, action: 'Update', fieldName: null });
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
    // Matched on table, record and action only. "Mark every alert read" is a
    // bulk event, not a change to one column, so the row carries no fieldName:
    // a field name with no old and new value behind it reads as a diff in the
    // trail without being one.
    const before = await prisma.auditLogEntry.count({
      where: { tableName: 'SystemAlert', recordId: ctx.operatorId, action: 'Update', fieldName: null },
    });
    const res = await api().put('/api/alerts/read-all').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({
        where: { tableName: 'SystemAlert', recordId: ctx.operatorId, action: 'Update', fieldName: null },
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

    // C6a: the single-alert read records a column diff, not a bare action row.
    const diff = await prisma.auditLogEntry.findFirst({
      where: { tableName: 'SystemAlert', recordId: alertId, action: 'Update', fieldName: 'isRead' },
    });
    expect(diff?.oldValue).toBe('false');
    expect(diff?.newValue).toBe('true');
  });
});