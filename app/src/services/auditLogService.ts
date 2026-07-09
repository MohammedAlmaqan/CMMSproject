import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { AuditLogEntry } from '@/types';

export const auditLogService = {
  getAll: (params?: { search?: string; tableName?: string; action?: string; skip?: number; take?: number }) =>
    api.get<PaginatedResponse<AuditLogEntry>>('/audit-log', params as any),
};
