import { describe, it, expect, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const parentCode = `IMP-LOC-${stamp}`;
const childCode = `IMP-LOC-${stamp}-01`;
const woNumber = `IMPWO-${stamp}`;

let woId = '';

function csvBuffer(header: string[], rows: string[][]): Buffer {
  return Buffer.from([header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n', 'utf8');
}

const FL_HEADER = ['locationCode', 'description', 'parentLocationId', 'locationType', 'operationalStatus'];
const WO_HEADER = [
  'woNumber',
  'type',
  'priority',
  'status',
  'functionalLocationId',
  'equipmentId',
  'description',
  'workCenterId',
  'reportedByUserId',
  'createdBy',
  'createdDate',
];

describe('CSV import routes', () => {
  afterAll(async () => {
    if (woId) await purgeWorkOrders([woId]);
    const locs = await prisma.functionalLocation.findMany({
      where: { locationCode: { in: [parentCode, childCode, `${childCode}-X`] } },
      select: { functionalLocationId: true },
    });
    const ids = locs.map((l) => l.functionalLocationId);
    if (ids.length > 0) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: ids } } });
      await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: { in: ids } } });
    }
  });

  describe('POST /api/functional-locations/import.csv', () => {
    it('rejects requests without a token with 401', async () => {
      const res = await api().post('/api/functional-locations/import.csv');
      expect(res.status).toBe(401);
    });

    it('rejects a below-Planner role with 403', async () => {
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.technicianToken))
        .attach('file', csvBuffer(FL_HEADER, [[parentCode, 'x', '', 'Plant', 'Active']]), 'locations.csv');
      expect(res.status).toBe(403);
    });

    it('rejects a header missing required columns with 400', async () => {
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(['locationCode', 'description'], [[parentCode, 'x']]), 'locations.csv');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('locationType');
    });

    it('imports a parent and a child, resolving the parent by code', async () => {
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(FL_HEADER, [
            [parentCode, 'Imported Parent', '', 'Plant', 'Active'],
            [childCode, 'Imported Child', parentCode, 'Area', 'Active'],
          ]),
          'locations.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.rejected).toEqual([]);

      const parent = await prisma.functionalLocation.findFirst({ where: { locationCode: parentCode, isDeleted: false } });
      const child = await prisma.functionalLocation.findFirst({ where: { locationCode: childCode, isDeleted: false } });
      expect(parent).not.toBeNull();
      expect(child).not.toBeNull();
      expect(child!.parentLocationId).toBe(parent!.functionalLocationId);
    });

    it('updates existing rows on a re-import instead of duplicating them', async () => {
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(FL_HEADER, [
            [parentCode, 'Imported Parent v2', '', 'Plant', 'Active'],
            [childCode, 'Imported Child v2', parentCode, 'Area', 'Active'],
          ]),
          'locations.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(0);
      expect(res.body.updated).toBe(2);
      const count = await prisma.functionalLocation.count({ where: { locationCode: parentCode, isDeleted: false } });
      expect(count).toBe(1);
    });

    it('rejects a row whose parent code does not exist, without failing the run', async () => {
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(FL_HEADER, [[`${childCode}-X`, 'Orphan', 'NO-SUCH-PARENT', 'Area', 'Active']]), 'locations.csv');
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(0);
      expect(res.body.rejected).toHaveLength(1);
      expect(res.body.rejected[0].reason).toContain('parentLocationId=NO-SUCH-PARENT');
    });
  });

  describe('POST /api/work-orders/import.csv', () => {
    it('rejects a header missing required columns with 400', async () => {
      const res = await api()
        .post('/api/work-orders/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(['woNumber', 'description'], [[woNumber, 'x']]), 'work-orders.csv');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('functionalLocationId');
    });

    it('imports a work order, resolving location, work centre and reporter by natural key', async () => {
      const res = await api()
        .post('/api/work-orders/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(WO_HEADER, [[woNumber, 'CM', 'Medium', 'Draft', 'PL-01', '', 'Imported WO', 'MECH', 'tech1', 'tech1', '2025-10-15']]),
          'work-orders.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      expect(res.body.rejected).toEqual([]);

      const wo = await prisma.workOrder.findFirst({
        where: { woNumber, isDeleted: false },
        include: { functionalLocation: true, workCenter: true, reportedBy: true, supervisor: true },
      });
      expect(wo).not.toBeNull();
      expect(wo!.functionalLocation.locationCode).toBe('PL-01');
      expect(wo!.workCenter.code).toBe('MECH');
      expect(wo!.reportedBy.username).toBe('tech1');
      // Blank supervisor is backfilled to the reporter (app conversion convention).
      expect(wo!.supervisor.username).toBe('tech1');
      woId = wo!.workOrderId;
    });

    it('rejects a work order naming an unknown functional location', async () => {
      const res = await api()
        .post('/api/work-orders/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(WO_HEADER, [[`${woNumber}-X`, 'CM', 'Medium', 'Draft', 'NO-SUCH-LOC', '', 'Orphan WO', 'MECH', 'tech1', 'tech1', '2025-10-15']]),
          'work-orders.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(0);
      expect(res.body.rejected).toHaveLength(1);
      expect(res.body.rejected[0].reason).toContain('functionalLocationId=NO-SUCH-LOC');
    });
  });
});