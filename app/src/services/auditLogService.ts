import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { AuditLogEntry } from '@/types';

export interface AuditPurgeResult {
  ranAt: string;
  retentionYears: number;
  cutoff: string;
  deleted: number;
}

export const auditLogService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<AuditLogEntry>>('/audit-log', params),
  // v1.1-23 residual: the route existed (Administrator-only, retention window
  // from SystemConfig) but nothing in the app could call it.
  purge: () => api.post<AuditPurgeResult>('/audit-log/purge'),
};
