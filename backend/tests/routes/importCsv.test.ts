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
const EQUIPMENT_HEADER = [
  'equipmentCode',
  'name',
  'description',
  'functionalLocationCode',
  'manufacturer',
  'model',
  'serialNumber',
  'assetTag',
  'equipmentClass',
  'criticality',
  'operationalStatus',
];
const MATERIAL_HEADER = ['materialCode', 'description', 'unitOfMeasure', 'standardCost', 'currentStock'];

describe('CSV import routes', () => {
  afterAll(async () => {
    if (woId) await purgeWorkOrders([woId]);
    const locs = await prisma.functionalLocation.findMany({
      where: { locationCode: { startsWith: parentCode } },
      select: { functionalLocationId: true },
    });
    const ids = locs.map((l) => l.functionalLocationId);
    if (ids.length > 0) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: ids } } });
      await prisma.functionalLocation.deleteMany({ where: { functionalLocationId: { in: ids } } });
    }

    const equipment = await prisma.equipment.findMany({
      where: { equipmentCode: { startsWith: `IMP-EQ-${stamp}` } },
      select: { equipmentId: true },
    });
    const equipmentIds = equipment.map((e) => e.equipmentId);
    if (equipmentIds.length > 0) {
      await prisma.auditLogEntry.deleteMany({ where: { recordId: { in: equipmentIds } } });
      await prisma.equipment.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
    }

    await prisma.material.deleteMany({ where: { materialCode: { startsWith: `IMP-MAT-${stamp}` } } });
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

    it('keeps an accepted row when another row in the same file is rejected', async () => {
      const kept = `${parentCode}-KEEP`;
      const res = await api()
        .post('/api/functional-locations/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(FL_HEADER, [
            [kept, 'Kept Row', '', 'Area', 'Active'],
            [`${childCode}-Y`, 'Orphan', 'NO-SUCH-PARENT', 'Area', 'Active'],
          ]),
          'locations.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      expect(res.body.rejected).toHaveLength(1);
      expect(await prisma.functionalLocation.count({ where: { locationCode: kept, isDeleted: false } })).toBe(1);
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

    it('reports what it would do without writing on a dry run', async () => {
      const dryNumber = `IMPWO-DRY-${stamp}`;
      const res = await api()
        .post('/api/work-orders/import.csv?dryRun=1')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(WO_HEADER, [[dryNumber, 'CM', 'Medium', 'Draft', 'PL-01', '', 'Dry run WO', 'MECH', 'tech1', 'tech1', '2025-10-15']]),
          'work-orders.csv',
        );
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      expect(res.body.rejected).toEqual([]);
      // The whole transaction was rolled back, so the row is not there.
      expect(await prisma.workOrder.count({ where: { woNumber: dryNumber } })).toBe(0);
    });
  });

  describe('POST /api/equipment/import.csv', () => {
    const code = `IMP-EQ-${stamp}`;
    const row = (equipmentCode: string, name: string, criticality: string) => [
      equipmentCode,
      name,
      'imported by test',
      'PL-01',
      'Acme',
      'M1',
      `SN-${equipmentCode}`,
      '',
      'Pump',
      criticality,
      'Active',
    ];

    it('imports a row and updates it on re-import instead of duplicating it', async () => {
      const first = await api()
        .post('/api/equipment/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(EQUIPMENT_HEADER, [row(code, 'Imported Pump', 'B')]), 'equipment.csv');
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const second = await api()
        .post('/api/equipment/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(EQUIPMENT_HEADER, [row(code, 'Imported Pump v2', 'A')]), 'equipment.csv');
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const stored = await prisma.equipment.findMany({ where: { equipmentCode: code, isDeleted: false } });
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Imported Pump v2');
      expect(stored[0].criticality).toBe('A');
    });

    it('matches columns by name rather than by position', async () => {
      // The same data, with the header in the opposite order. A positional
      // reader would put "Active" in equipmentCode and fail every row.
      const reversedCode = `IMP-EQ-${stamp}-REV`;
      const reversedHeader = [...EQUIPMENT_HEADER].reverse();
      const values = ['Active', 'C', 'Pump', '', '', '', '', 'PL-01', 'imported by test', 'Reversed Pump', reversedCode];
      const res = await api()
        .post('/api/equipment/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(reversedHeader, [values]), 'equipment.csv');
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);

      const stored = await prisma.equipment.findFirst({ where: { equipmentCode: reversedCode } });
      expect(stored?.name).toBe('Reversed Pump');
      expect(stored?.criticality).toBe('C');
    });

    it('rolls the whole file back when one row fails validation', async () => {
      const good = `IMP-EQ-${stamp}-STRICT-OK`;
      const bad = `IMP-EQ-${stamp}-STRICT-BAD`;
      const res = await api()
        .post('/api/equipment/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach(
          'file',
          csvBuffer(EQUIPMENT_HEADER, [row(good, 'Good Row', 'B'), row(bad, 'Bad Row', 'not-a-criticality')]),
          'equipment.csv',
        );
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('criticality');
      expect(
        await prisma.equipment.count({ where: { equipmentCode: { in: [good, bad] } } })
      ).toBe(0);
    });

    it('reports what it would do without writing on a dry run', async () => {
      const dryCode = `IMP-EQ-${stamp}-DRY`;
      const res = await api()
        .post('/api/equipment/import.csv?dryRun=1')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(EQUIPMENT_HEADER, [row(dryCode, 'Dry Pump', 'C')]), 'equipment.csv');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 1, updated: 0, rejected: [] });
      expect(await prisma.equipment.count({ where: { equipmentCode: dryCode } })).toBe(0);
    });
  });

  describe('POST /api/materials/import.csv', () => {
    const code = `IMP-MAT-${stamp}`;

    it('keeps the stored cost and stock when a re-import leaves them blank', async () => {
      const first = await api()
        .post('/api/materials/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(MATERIAL_HEADER, [[code, 'Imported material', 'EA', '12.50', '4']]), 'materials.csv');
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ created: 1, updated: 0, rejected: [] });

      const second = await api()
        .post('/api/materials/import.csv')
        .set(authHeaders(ctx.plannerToken))
        .attach('file', csvBuffer(MATERIAL_HEADER, [[code, 'Imported material v2', 'EA', '', '']]), 'materials.csv');
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ created: 0, updated: 1, rejected: [] });

      const stored = await prisma.material.findFirstOrThrow({ where: { materialCode: code } });
      expect(stored.description).toBe('Imported material v2');
      // A blank cell means "not supplied", not zero.
      expect(Number(stored.standardCost)).toBe(12.5);
      expect(stored.currentStock).toBe(4);
    });
  });

  describe('GET export.csv', () => {
    it('writes the declared header, in the declared order', async () => {
      const equipment = await api().get('/api/equipment/export.csv').set(authHeaders(ctx.plannerToken));
      expect(equipment.status).toBe(200);
      expect(equipment.headers['content-type']).toContain('text/csv');
      expect(equipment.text.split(/\r?\n/)[0]).toBe(EQUIPMENT_HEADER.join(','));

      const materials = await api().get('/api/materials/export.csv').set(authHeaders(ctx.plannerToken));
      expect(materials.status).toBe(200);
      expect(materials.text.split(/\r?\n/)[0]).toBe(MATERIAL_HEADER.join(','));
    });
  });
});