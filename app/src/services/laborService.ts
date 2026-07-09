import { api } from '@/lib/api';
import type { LaborEntry } from '@/types';

export const laborService = {
  getByWorkOrder: (workOrderId: string) =>
    api.get<LaborEntry[]>('/labor', { workOrderId }),
  create: (data: Partial<LaborEntry>) =>
    api.post<LaborEntry>('/labor', data),
  delete: (id: string) => api.delete(`/labor/${id}`),
};
