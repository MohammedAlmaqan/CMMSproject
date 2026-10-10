import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, authHeaders, ctx } from '../helpers.js';
import { prisma } from '../../src/utils/prisma.js';

let entityId = '';
let createdId = '';
let storagePath = '';

const fileBuffer = Buffer.from('attachment integration test', 'utf8');
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
      await prisma.attachment.deleteMany({ where: { attachmentId: createdId } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: createdId } });
    }
  });

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

  it('downloads refuse an attachment that does not exist (404)', async () => {
    const res = await api().get('/api/attachments/no-such-attachment/download').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Attachment not found');
  });

  it('deletes refuse an attachment that does not exist (404)', async () => {
    const res = await api().delete('/api/attachments/no-such-attachment').set(authHeaders(ctx.adminToken));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Attachment not found');
  });
})

describe('attachment missing-parent refusals (SOW 3.1.2, :85)', () => {
  const orphanProbe = async () => {
    // An upload to a nonexistent parent must not leave a row or a file for it
    // to grow into later: the row can never be listed, downloaded or deleted
    // from any screen once its parent is gone.
    expect(await prisma.attachment.count({ where: { entityType: 'Equipment', entityId: 'no-such-equipment' } })).toBe(0);
    expect(fs.existsSync(path.join(UPLOADS_ROOT, 'Equipment', 'no-such-equipment'))).toBe(false);
  };

  it('uploads refuse an equipment that does not exist (404)', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', 'no-such-equipment')
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Equipment not found');
    await orphanProbe();
  });

  it('uploads refuse a work order that does not exist (404)', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'WorkOrder')
      .field('entityId', 'no-such-work-order')
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('WorkOrder not found');
  });

  it('uploads refuse a notification that does not exist (404)', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Notification')
      .field('entityId', 'no-such-notification')
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Notification not found');
  });

  it('uploads refuse a parent type that is not one of the three (400 from the schema)', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Bogus')
      .field('entityId', 'no-such-thing')
      .attach('file', fileBuffer, 'note.txt');
    expect(res.status).toBe(400);
  });
})

describe('attachment type and size rules (SOW 3.3.8 / D-11, row 36)', () => {
  let dwgId = '';
  let dwgStoragePath = '';

  afterAll(async () => {
    if (dwgId) {
      if (dwgStoragePath) {
        try {
          fs.rmSync(path.join(UPLOADS_ROOT, dwgStoragePath), { force: true });
        } catch { /* ok */ }
      }
      await prisma.attachment.deleteMany({ where: { attachmentId: dwgId } });
      await prisma.auditLogEntry.deleteMany({ where: { recordId: dwgId } });
    }
  });

  it('accepts a widened document type (a CAD drawing)', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', fileBuffer, 'drawing.dwg');
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBeTruthy();
    dwgId = res.body.attachmentId;
    dwgStoragePath = res.body.storagePath;
  });

  it('refuses an executable by extension, with nothing written', async () => {
    const before = await prisma.attachment.count({ where: { entityType: 'Equipment', entityId, isDeleted: false } });
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', fileBuffer, 'payload.exe');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Executable and script files are not allowed/);
    expect(await prisma.attachment.count({ where: { entityType: 'Equipment', entityId, isDeleted: false } })).toBe(before);
  });

  it('refuses a script by extension', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', fileBuffer, 'deploy.ps1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Executable and script files are not allowed/);
  });

  it('refuses a file over the 10 MB cap', async () => {
    const res = await api()
      .post('/api/attachments')
      .set(authHeaders(ctx.operatorToken))
      .field('entityType', 'Equipment')
      .field('entityId', entityId)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'big.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });
})