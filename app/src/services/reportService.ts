import { api } from '@/lib/api';

export const reportService = {
  getBacklog: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/backlog', params),
  getPMCompliance: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/pm-compliance', params),
  getMTBF: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/mtbf', params),
  getMTTR: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/mttr', params),
  getCostSummary: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/cost-summary', params),
  getDowntime: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/downtime', params),
  getMaterialConsumption: (params?: Record<string, string>) =>
    api.get<any[]>('/reports/material-consumption', params),
};
