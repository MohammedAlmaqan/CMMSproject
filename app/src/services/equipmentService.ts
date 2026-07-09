import { api } from '@/lib/api';
import type { Equipment } from '@/types';

export const equipmentService = {
  getAll: (params?: { search?: string; functionalLocationId?: string; criticality?: string; equipmentClass?: string }) =>
    api.get<Equipment[]>('/equipment', params as any),
  getById: (id: string) => api.get<Equipment>(`/equipment/${id}`),
  create: (data: Partial<Equipment>) => api.post<Equipment>('/equipment', data),
  update: (id: string, data: Partial<Equipment>) => api.put<Equipment>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete(`/equipment/${id}`),
};
