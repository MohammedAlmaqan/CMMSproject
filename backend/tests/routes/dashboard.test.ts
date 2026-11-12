import { describe, it, expect, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeNotifications } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

describe('dashboard routes', () => {
  const endpoints = ['/kpis', '/alerts', '/cost-summary'];
  const notifIds: string[] = [];

  afterAll(async () => {
    await purgeNotifications(notifIds);
  });

  it('returns 200 for every dashboard endpoint', async () => {
    for (const ep of endpoints) {
      const res = await api().get(`/api/dashboard${ep}`).set(authHeaders(ctx.adminToken));
      expect(res.status, `GET /api/dashboard${ep}`).toBe(200);
    }
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/dashboard/kpis');
    expect(res.status).toBe(401);
  });

  it('does not count a legacy M3 completion confirmation (D-22)', async () => {
    const kpis = () => api().get('/api/dashboard/kpis').set(authHeaders(ctx.adminToken));

    const before = await kpis();
    expect(before.status).toBe(200);

    // Created through the API on purpose: M3 stays an accepted type for the
    // importer and for the legacy rows, so the exclusion has to happen at the
    // count, not at the door.
    const location = await prisma.functionalLocation.findFirstOrThrow({
      where: { isDeleted: false },
      select: { functionalLocationId: true },
    });
    const m3 = await api()
      .post('/api/notifications')
      .set(authHeaders(ctx.operatorToken))
      .send({
        type: 'M3',
        priority: 'Medium',
        description: 'dashboard M3 exclusion fixture',
        functionalLocationId: location.functionalLocationId,
        reportedByUserId: ctx.operatorId,
      });
    expect(m3.status).toBe(201);
    notifIds.push(m3.body.notificationId);

    const after = await kpis();
    expect(after.status).toBe(200);
    expect(after.body.openNotifications).toBe(before.body.openNotifications);
  });
});
