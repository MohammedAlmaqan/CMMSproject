import { api } from '@/lib/api';
import type { FunctionalLocation } from '@/types';

export const functionalLocationService = {
  getAll: (params?: { search?: string }) =>
    api.get<FunctionalLocation[]>('/functional-locations', params),
  getTree: () => api.get<FunctionalLocation[]>('/functional-locations/tree'),
  getById: (id: string) => api.get<FunctionalLocation>(`/functional-locations/${id}`),
  create: (data: Partial<FunctionalLocation>) =>
    api.post<FunctionalLocation>('/functional-locations', data),
  update: (id: string, data: Partial<FunctionalLocation>) =>
    api.put<FunctionalLocation>(`/functional-locations/${id}`, data),
  delete: (id: string) => api.delete(`/functional-locations/${id}`),
};
