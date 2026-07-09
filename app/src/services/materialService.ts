import { api } from '@/lib/api';
import type { Material } from '@/types';

export const materialService = {
  getAll: (params?: { search?: string }) =>
    api.get<Material[]>('/materials', params),
  getById: (id: string) => api.get<Material>(`/materials/${id}`),
  create: (data: Partial<Material>) => api.post<Material>('/materials', data),
  update: (id: string, data: Partial<Material>) => api.put<Material>(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),
};
