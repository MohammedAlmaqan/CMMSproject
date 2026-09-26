import { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export interface AuditEntry {
  tableName: string;
  recordId: string;
  action: 'Create' | 'Update' | 'Delete' | 'Run' | 'Blocked';
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

// `db` lets callers route the audit row through a transaction client so bulk
// operations (3.3 CSV import) keep audit rows atomic with the data write.
export async function logAudit(
  entry: AuditEntry,
  userId: string,
  ipAddress?: string,
  db: Pick<PrismaClient, 'auditLogEntry'> = prisma
) {
  try {
    await db.auditLogEntry.create({
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
    logger.error({ err: error }, 'Audit log error');
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
