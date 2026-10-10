import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { WorkOrder, WorkOrderCreateInput, WorkOrderSnapshotEntry } from '@/types';

export const workOrderService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<WorkOrder>>('/work-orders', params),
  getById: (id: string) => api.get<WorkOrder>(`/work-orders/${id}`),
  getHistory: (id: string) =>
    api.get<{ data: WorkOrderSnapshotEntry[]; total: number }>(`/work-orders/${id}/history`),
  create: (data: WorkOrderCreateInput) => api.post<WorkOrder>('/work-orders', data),
  update: (id: string, data: Partial<WorkOrder>) => api.put<WorkOrder>(`/work-orders/${id}`, data),
  delete: (id: string) => api.delete(`/work-orders/${id}`),
  transitionStatus: (id: string, status: string) =>
    api.put<WorkOrder>(`/work-orders/${id}/status`, { status }),
};
