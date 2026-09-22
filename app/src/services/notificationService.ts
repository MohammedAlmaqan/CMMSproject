import { api, type PaginatedResponse } from '@/lib/api';
import type { Notification, WorkOrder } from '@/types';

export const notificationService = {
  getAll: (params?: { search?: string; type?: string; priority?: string; status?: string; skip?: number; take?: number }) =>
    api.get<PaginatedResponse<Notification>>('/notifications', params),
  getById: (id: string) => api.get<Notification>(`/notifications/${id}`),
  create: (data: Partial<Notification>) => api.post<Notification>('/notifications', data),
  update: (id: string, data: Partial<Notification>) => api.put<Notification>(`/notifications/${id}`, data),
  delete: (id: string) => api.delete(`/notifications/${id}`),
  convertToWorkOrder: (id: string, data?: { workCenterId?: string; supervisorUserId?: string }) =>
    api.post<WorkOrder>(`/notifications/${id}/convert-to-wo`, data),
};
