import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx, purgeWorkOrders } from '../helpers.js';

// SOW 5.4: the bounded OData-style grammar. The unit suite pins the parser; this
// suite pins the wiring — that the parameters reach the collection handlers, that
// a malformed query is refused rather than silently ignored, and that the grammar
// is served on both the unversioned and versioned prefixes.
//
// The seed leaves no work orders (SEED_DEMO=1 seeds master data only), and the
// suite runs against a fresh database in CI, so this file creates the work orders
// it needs and purges them afterwards rather than borrowing rows that may not be
// there. The bare-array checks use seeded equipment and materials, which the seed
// does provide.

interface WorkOrderRow {
  workOrderId: string;
  woNumber: string;
  status: string;
  priority: string;
}

const createdIds: string[] = [];
let sample: WorkOrderRow | undefined;

async function listWorkOrders(query: Record<string, string>) {
  return api().get('/api/work-orders').set(authHeaders(ctx.adminToken)).query(query);
}

describe('OData-style query grammar on GET collections (SOW 5.4)', () => {
  beforeAll(async () => {
    const [fls, wcs] = await Promise.all([
      api().get('/api/functional-locations').set(authHeaders(ctx.adminToken)),
      api().get('/api/work-centers').set(authHeaders(ctx.adminToken)),
    ]);
    const flat = fls.body[0]?.functionalLocationId;
    const wc = wcs.body[0]?.workCenterId;
    const body = (overrides: Record<string, unknown> = {}) => ({
      type: 'CM',
      priority: 'Medium',
      description: 'query grammar fixture',
      functionalLocationId: flat,
      workCenterId: wc,
      supervisorUserId: ctx.adminId,
      ...overrides,
    });
    for (let i = 0; i < 3; i++) {
      const res = await api()
        .post('/api/work-orders')
        .set(authHeaders(ctx.adminToken))
        .send(body({ description: `query grammar fixture ${i}` }));
      expect(res.status).toBe(201);
      createdIds.push(res.body.workOrderId);
    }

    const res = await listWorkOrders({ $orderby: 'woNumber asc', $top: '1' });
    sample = Array.isArray(res.body?.data) ? res.body.data[0] : undefined;
  });

  afterAll(async () => {
    await purgeWorkOrders(createdIds);
  });

  it('rejects a malformed $filter with 400 and names the problem', async () => {
    const res = await listWorkOrders({ $filter: 'priority eq' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.join(' ')).toMatch(/expected a value/);
  });

  it('rejects a $filter that names a field the resource does not expose', async () => {
    const res = await listWorkOrders({ $filter: "doesNotExist eq 'x'" });
    expect(res.status).toBe(400);
    expect(res.body.details.join(' ')).toMatch(/unknown field "doesNotExist"/);
  });

  it('rejects an out-of-range $top', async () => {
    const res = await listWorkOrders({ $top: '100000' });
    expect(res.status).toBe(400);
    expect(res.body.details.join(' ')).toMatch(/between 0 and 500/);
  });

  it('rejects an unknown field in $orderby', async () => {
    const res = await listWorkOrders({ $orderby: 'woNumber sideways' });
    expect(res.status).toBe(400);
    expect(res.body.details.join(' ')).toMatch(/asc or desc/);
  });

  it('limits the page with $top', async () => {
    const res = await listWorkOrders({ $top: '1' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.take).toBe(1);
  });

  it('projects the response to the selected fields with $select', async () => {
    const res = await listWorkOrders({ $select: 'woNumber,status', $top: '3' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(Object.keys(row).sort()).toEqual(['status', 'woNumber']);
    }
  });

  it('filters an exact match with $filter', async () => {
    if (!sample) return;
    const res = await listWorkOrders({ $filter: `woNumber eq '${sample.woNumber}'` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].woNumber).toBe(sample.woNumber);
  });

  it('filters a text field case-insensitively with contains', async () => {
    if (!sample) return;
    const fragment = sample.woNumber.slice(0, 4);
    const res = await listWorkOrders({ $filter: `woNumber contains '${fragment.toLowerCase()}'` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.woNumber.toLowerCase()).toContain(fragment.toLowerCase());
    }
  });

  it('combines conditions with and', async () => {
    if (!sample) return;
    const res = await listWorkOrders({
      $filter: `woNumber eq '${sample.woNumber}' and status ne 'DefinitelyNotAStatus'`,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('advances with $skip', async () => {
    const first = await listWorkOrders({ $orderby: 'woNumber asc', $top: '1', $skip: '0' });
    const second = await listWorkOrders({ $orderby: 'woNumber asc', $top: '1', $skip: '1' });
    if (first.body.data.length === 0 || second.body.data.length === 0) return;
    expect(second.body.skip).toBe(1);
    expect(second.body.data[0].woNumber).not.toBe(first.body.data[0].woNumber);
  });

  it('orders with $orderby in both directions', async () => {
    const asc = await listWorkOrders({ $orderby: 'woNumber asc', $top: '2' });
    const desc = await listWorkOrders({ $orderby: 'woNumber desc', $top: '2' });
    if (asc.body.data.length < 2 || desc.body.data.length < 2) return;
    expect(asc.body.data[0].woNumber <= asc.body.data[1].woNumber).toBe(true);
    expect(desc.body.data[0].woNumber >= desc.body.data[1].woNumber).toBe(true);
  });

  it('serves the same grammar on the versioned prefix', async () => {
    const res = await api()
      .get('/api/v1/work-orders')
      .set(authHeaders(ctx.adminToken))
      .query({ $select: 'woNumber', $top: '1' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(Object.keys(res.body.data[0])).toEqual(['woNumber']);
  });

  it('applies the grammar to a bare-array collection', async () => {
    const res = await api()
      .get('/api/equipment')
      .set(authHeaders(ctx.adminToken))
      .query({ $select: 'equipmentCode,criticality', $top: '2', $orderby: 'equipmentCode asc' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(2);
    for (const row of res.body) {
      expect(Object.keys(row).sort()).toEqual(['criticality', 'equipmentCode']);
    }
  });

  it('rejects a malformed query on a bare-array collection too', async () => {
    const res = await api()
      .get('/api/materials')
      .set(authHeaders(ctx.adminToken))
      .query({ $filter: 'currentStock gt' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
  });
});
