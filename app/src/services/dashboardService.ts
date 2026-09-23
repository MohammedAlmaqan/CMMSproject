import { api } from '@/lib/api';
import type { DashboardKPIs, SystemAlert } from '@/types';

export const dashboardService = {
  getKPIs: () => api.get<DashboardKPIs>('/dashboard/kpis'),
  getAlerts: () => api.get<SystemAlert[]>('/dashboard/alerts'),
  getCostSummary: () => api.get<Array<{ month: string; plannedCost: number; actualCost: number }>>('/dashboard/cost-summary'),
};
