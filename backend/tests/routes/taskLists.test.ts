import { describe, it, expect, beforeAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const code = `TL-T${stamp}`;
let createdId = '';
let workCenterId = '';

async function auditCount(recordId: string, action: string) {
  return prisma.auditLogEntry.count({
    where: { tableName: 'TaskList', recordId, action },
  });
}

describe('task lists routes', () => {
  beforeAll(async () => {
    const wcs = await api().get('/api/work-centers').set(authHeaders(ctx.adminToken));
    workCenterId = wcs.body[0].workCenterId;
  });

  it('returns the task list list', async () => {
    const res = await api().get('/api/task-lists').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/task-lists');
    expect(res.status).toBe(401);
  });

  it('rejects create by a below-minimum role with 403', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ code, description: 'x', workCenterId });
    expect(res.status).toBe(403);
  });

  it('creates a task list (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({ code, description: 'test task list', workCenterId });
    expect(res.status).toBe(201);
    createdId = res.body.taskListId;
    expect(await auditCount(createdId, 'Create')).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/task-lists')
      .set(authHeaders(ctx.operatorToken))
      .send({ code: '', description: 'x', workCenterId: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workCenterId');
  });

  it('updates a task list (soft-replace operations) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Update');
    const res = await api()
      .put(`/api/task-lists/${createdId}`)
      .set(authHeaders(ctx.operatorToken))
      .send({ description: 'updated task list' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated task list');
    expect(await auditCount(createdId, 'Update')).toBe(before + 1);
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/task-lists/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes a task list (Supervisor+) and writes an audit row', async () => {
    const before = await auditCount(createdId, 'Delete');
    const res = await api().delete(`/api/task-lists/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(await auditCount(createdId, 'Delete')).toBe(before + 1);
  });
});