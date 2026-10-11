import { api } from '@/lib/api';
import type { MaintenancePlan, MaintenancePlanInput, SchedulerRunResult, WorkOrder } from '@/types';

export const maintenancePlanService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<MaintenancePlan[]>('/maintenance-plans', params),
  getById: (id: string) => api.get<MaintenancePlan>(`/maintenance-plans/${id}`),
  create: (data: MaintenancePlanInput) =>
    api.post<MaintenancePlan>('/maintenance-plans', data),
  update: (id: string, data: Partial<MaintenancePlanInput>) =>
    api.put<MaintenancePlan>(`/maintenance-plans/${id}`, data),
  delete: (id: string) => api.delete(`/maintenance-plans/${id}`),
  generateWorkOrder: (id: string, data?: { supervisorUserId?: string }) =>
    api.post<WorkOrder>(`/maintenance-plans/${id}/generate-wo`, data),
  runScheduler: () => api.post<SchedulerRunResult>('/maintenance-plans/run-scheduler', {}),
};
