import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { AuditLogEntry } from '@/types';

export const auditLogService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<AuditLogEntry>>('/audit-log', params),
};
