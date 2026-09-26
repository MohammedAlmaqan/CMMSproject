import { api } from '@/lib/api';
import type { WorkCenter, CapacityBoard } from '@/types';

export const workCenterService = {
  getAll: () => api.get<WorkCenter[]>('/work-centers'),
  getById: (id: string) => api.get<WorkCenter>(`/work-centers/${id}`),
  /**
   * SOW 3.1.3 capacity board. The server defaults the range to the next 14 days
   * and caps it at 90, so omitting both bounds is a valid request.
   */
  getCapacity: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return api.get<CapacityBoard>(`/work-centers/capacity${qs ? `?${qs}` : ''}`);
  },
  create: (data: Partial<WorkCenter>) => api.post<WorkCenter>('/work-centers', data),
  update: (id: string, data: Partial<WorkCenter>) => api.put<WorkCenter>(`/work-centers/${id}`, data),
  delete: (id: string) => api.delete(`/work-centers/${id}`),
};
