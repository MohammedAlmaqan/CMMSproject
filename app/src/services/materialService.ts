import { api, fetchAllPages } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { Material } from '@/types';

export const materialService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<Material>>('/materials', params),
  getAllPages: (params?: Record<string, string | number | boolean | undefined>) =>
    fetchAllPages<Material>((p) => api.get<PaginatedResponse<Material>>('/materials', p), params),
  getById: (id: string) => api.get<Material>(`/materials/${id}`),
  create: (data: Partial<Material>) => api.post<Material>('/materials', data),
  update: (id: string, data: Partial<Material>) => api.put<Material>(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),
};
