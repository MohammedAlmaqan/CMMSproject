import { describe, it, expect, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeAudit } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';
import { AUDIT_RETENTION_KEY } from '../../src/utils/auditRetentionRules.js';

describe('audit log routes', () => {
  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/audit-log');
    expect(res.status).toBe(401);
  });

  it('rejects access by a non-administrator with 403 (Requester)', async () => {
    const res = await api().get('/api/audit-log').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('returns paged audit entries for an Administrator', async () => {
    const res = await api().get('/api/audit-log').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('supports tableName filtering', async () => {
    const res = await api().get('/api/audit-log').set(authHeaders(ctx.adminToken)).query({ tableName: 'WorkOrder' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
})

// SOW 4.3: an Administrator can purge entries older than the configurable
// retention window. The decision of what falls outside the window is pinned by
// the unit tests; this exercises the wired route against the real table.
describe('audit log purge (SOW 4.3)', () => {
  const cleanupIds: string[] = [AUDIT_RETENTION_KEY];

  afterAll(async () => {
    await purgeAudit(cleanupIds);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().post('/api/audit-log/purge');
    expect(res.status).toBe(401);
  });

  it('rejects a non-administrator with 403 (Requester)', async () => {
    const res = await api().post('/api/audit-log/purge').set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('deletes only entries older than the window and records the run', async () => {
    const oldRecordId = crypto.randomUUID();
    const recentRecordId = crypto.randomUUID();
    cleanupIds.push(oldRecordId, recentRecordId);

    const old = await prisma.auditLogEntry.create({
      data: {
        tableName: 'Fixture',
        recordId: oldRecordId,
        action: 'Update',
        userId: ctx.adminId,
        timestamp: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    const recent = await prisma.auditLogEntry.create({
      data: {
        tableName: 'Fixture',
        recordId: recentRecordId,
        action: 'Update',
        userId: ctx.adminId,
        timestamp: new Date(),
      },
    });

    const res = await api().post('/api/audit-log/purge').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.retentionYears).toBe(7);
    expect(res.body.deleted).toBeGreaterThanOrEqual(1);

    expect(await prisma.auditLogEntry.findUnique({ where: { auditId: old.auditId } })).toBeNull();
    expect(await prisma.auditLogEntry.findUnique({ where: { auditId: recent.auditId } })).not.toBeNull();

    // The run is itself audited under the retention key, naming the actor.
    const run = await prisma.auditLogEntry.findFirst({
      where: { tableName: 'AuditLogEntry', action: 'Run', recordId: AUDIT_RETENTION_KEY },
      orderBy: { timestamp: 'desc' },
    });
    expect(run?.userId).toBe(ctx.adminId);
  });
});
