import { api, fetchAllPages } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { FunctionalLocation, FunctionalLocationInput } from '@/types';

export const functionalLocationService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<FunctionalLocation>>('/functional-locations', params),
  getAllPages: (params?: Record<string, string | number | boolean | undefined>) =>
    fetchAllPages<FunctionalLocation>((p) => api.get<PaginatedResponse<FunctionalLocation>>('/functional-locations', p), params),
  getTree: () => api.get<FunctionalLocation[]>('/functional-locations/tree'),
  getById: (id: string) => api.get<FunctionalLocation>(`/functional-locations/${id}`),
  create: (data: FunctionalLocationInput) =>
    api.post<FunctionalLocation>('/functional-locations', data),
  update: (id: string, data: Partial<FunctionalLocationInput>) =>
    api.put<FunctionalLocation>(`/functional-locations/${id}`, data),
  delete: (id: string) => api.delete(`/functional-locations/${id}`),
};
