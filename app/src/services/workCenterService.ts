import { api } from '@/lib/api';
import type { WorkCenter } from '@/types';

export const workCenterService = {
  getAll: () => api.get<WorkCenter[]>('/work-centers'),
  getById: (id: string) => api.get<WorkCenter>(`/work-centers/${id}`),
  create: (data: Partial<WorkCenter>) => api.post<WorkCenter>('/work-centers', data),
  update: (id: string, data: Partial<WorkCenter>) => api.put<WorkCenter>(`/work-centers/${id}`, data),
  delete: (id: string) => api.delete(`/work-centers/${id}`),
};
