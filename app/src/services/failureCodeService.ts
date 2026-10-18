import { api } from '@/lib/api';
import type { FailureCode, FailureCodeInput } from '@/types';

export const failureCodeService = {
  getAll: (search?: string) =>
    api.get<FailureCode[]>(`/failure-codes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getById: (id: string) => api.get<FailureCode>(`/failure-codes/${id}`),
  getTree: () => api.get<FailureCode[]>('/failure-codes/tree'),
  create: (data: FailureCodeInput) => api.post<FailureCode>('/failure-codes', data),
  update: (id: string, data: Partial<FailureCodeInput>) => api.put<FailureCode>(`/failure-codes/${id}`, data),
  delete: (id: string) => api.delete(`/failure-codes/${id}`),
};
