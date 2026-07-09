import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';

export interface AuditEntry {
  tableName: string;
  recordId: string;
  action: 'Create' | 'Update' | 'Delete';
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export async function logAudit(entry: AuditEntry, userId: string, ipAddress?: string) {
  try {
    await prisma.auditLogEntry.create({
      data: {
        tableName: entry.tableName,
        recordId: entry.recordId,
        action: entry.action,
        fieldName: entry.fieldName || null,
        oldValue: entry.oldValue || null,
        newValue: entry.newValue || null,
        userId,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export function auditMiddleware(tableName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode < 400 && req.user) {
        const recordId = req.params.id || body?.id || body?.recordId;
        const action = req.method === 'POST' ? 'Create' : req.method === 'PUT' || req.method === 'PATCH' ? 'Update' : 'Delete';
        if (recordId) {
          logAudit(
            { tableName, recordId, action },
            req.user.userId,
            req.ip
          );
        }
      }
      return originalJson(body);
    };
    next();
  };
}
