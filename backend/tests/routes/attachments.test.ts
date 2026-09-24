import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let entityId = '';
let createdId = '';
let storagePath = '';

const UPLOADS_ROOT = path.join(path.dirname(fileURLToPath(new URL('../../', import.meta.url))), 'uploads');

describe('attachments routes', () => {
  beforeAll(async () => {
    entityId = (await prisma.equipment.findFirst({ where: { isDeleted: false } }))!.equipmentId;
  });

  afterAll(async () => {
    if (createdId) {
      if (storagePath) {
        try {
          fs.rmSync(path.join(UPLOADS_ROOT, storagePath), { force: true });
        } catch { /* ok */ }
      }
      await prisma.attachment.deleteMany({ where: { attachmentId: createdId } }).catch(() => {});
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } }).catch(() => {});
    }
  });

  const fileBuffer = Buffer.from('attachment integration test', 'utf8');

  it('rejects create by a below-Requester role with 403', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.viewOnlyToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(403);
  });

  it('uploads an attachment (Requester+) and writes an audit row', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(201);
    createdId = res.body.attachmentId;
    storagePath = res.body.storagePath;
    expect(res.body.originalName).toBe('note.txt');
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Attachment', recordId: createdId, action: 'Create' } })
    ).toBeGreaterThanOrEqual(1);
  });

  it('returns the attachment list for an entity', async () => {
    const res = await api()
      .get('/api/attachments')
      .set(authHeaders(ctx.adminToken))
      .query({ entityType: 'Equipment', entityId });
    expect(res.status).toBe(200);
    expect(res.body.some((a: { attachmentId: string }) => a.attachmentId === createdId)).toBe(true);
  });

  it('downloads the attachment', async () => {
    const res = await api().get(`/api/attachments/${createdId}/download`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('rejects delete by a below-Supervisor role with 403', async () => {
    const res = await api().delete(`/api/attachments/${createdId}`).set(authHeaders(ctx.operatorToken));
    expect(res.status).toBe(403);
  });

  it('soft-deletes an attachment (Supervisor+) and writes an audit row', async () => {
    const res = await api().delete(`/api/attachments/${createdId}`).set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(200);
    expect(
      await prisma.auditLogEntry.count({ where: { tableName: 'Attachment', recordId: createdId, action: 'Delete' } })
    ).toBeGreaterThanOrEqual(1);
  });
})