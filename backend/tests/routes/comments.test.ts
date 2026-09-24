import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let entityId = '';
let commentId = '';

describe('comments routes', () => {
  beforeAll(async () => {
    entityId = (await prisma.equipment.findFirst({ where: { isDeleted: false } }))!.equipmentId;
  });

  afterAll(async () => {
    if (commentId) {
      await prisma.comment.deleteMany({ where: { commentId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: commentId } }).catch(() => {});
    }
  });

  it('returns the comment list for an entity', async () => {
    const res = await api()
      .get('/api/comments')
      .set(authHeaders(ctx.adminToken))
      .query({ entityType: 'Equipment', entityId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects create by a below-Requester role with 403', async () => {
    const res = await api()
      .post('/api/comments')
      .set(authHeaders(ctx.viewOnlyToken))
      .send({ entityType: 'Equipment', entityId, content: 'test comment' });
    expect(res.status).toBe(403);
  });

  it('creates a comment (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/comments')
      .set(authHeaders(ctx.operatorToken))
      .send({ entityType: 'Equipment', entityId, content: 'test comment' });
    expect(res.status).toBe(201);
    commentId = res.body.commentId;
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Comment', recordId: commentId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('rejects a malformed body with a zod-derived 400', async () => {
    const res = await api()
      .post('/api/comments')
      .set(authHeaders(ctx.operatorToken))
      .send({ entityType: 'Equipment', entityId, content: '' });
    expect(res.status).toBe(400);
  });
})