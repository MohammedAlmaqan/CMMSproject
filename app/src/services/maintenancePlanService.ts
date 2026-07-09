import { api } from '@/lib/api';
import type { MaintenancePlan, WorkOrder } from '@/types';

export const maintenancePlanService = {
  getAll: (params?: { strategy?: string; active?: boolean }) =>
    api.get<MaintenancePlan[]>('/maintenance-plans', params as any),
  getById: (id: string) => api.get<MaintenancePlan>(`/maintenance-plans/${id}`),
  create: (data: Partial<MaintenancePlan>) =>
    api.post<MaintenancePlan>('/maintenance-plans', data),
  update: (id: string, data: Partial<MaintenancePlan>) =>
    api.put<MaintenancePlan>(`/maintenance-plans/${id}`, data),
  delete: (id: string) => api.delete(`/maintenance-plans/${id}`),
  generateWorkOrder: (id: string, data?: { supervisorUserId?: string }) =>
    api.post<WorkOrder>(`/maintenance-plans/${id}/generate-wo`, data),
};
