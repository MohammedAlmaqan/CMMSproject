import { api } from '@/lib/api';
import type { FailureCode } from '@/types';

export const failureCodeService = {
  getAll: (search?: string) =>
    api.get<FailureCode[]>(`/failure-codes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getById: (id: string) => api.get<FailureCode>(`/failure-codes/${id}`),
  getTree: () => api.get<FailureCode[]>('/failure-codes/tree'),
  create: (data: Partial<FailureCode>) => api.post<FailureCode>('/failure-codes', data),
  update: (id: string, data: Partial<FailureCode>) => api.put<FailureCode>(`/failure-codes/${id}`, data),
  delete: (id: string) => api.delete(`/failure-codes/${id}`),
};
