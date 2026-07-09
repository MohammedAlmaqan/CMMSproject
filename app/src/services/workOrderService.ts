import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { WorkOrder } from '@/types';

export const workOrderService = {
  getAll: (params?: {
    search?: string; status?: string; priority?: string; type?: string;
    equipmentId?: string; workCenterId?: string; skip?: number; take?: number;
  }) => api.get<PaginatedResponse<WorkOrder>>('/work-orders', params as any),
  getById: (id: string) => api.get<WorkOrder>(`/work-orders/${id}`),
  create: (data: Partial<WorkOrder>) => api.post<WorkOrder>('/work-orders', data),
  update: (id: string, data: Partial<WorkOrder>) => api.put<WorkOrder>(`/work-orders/${id}`, data),
  delete: (id: string) => api.delete(`/work-orders/${id}`),
  transitionStatus: (id: string, status: string) =>
    api.put<WorkOrder>(`/work-orders/${id}/status`, { status }),
};
