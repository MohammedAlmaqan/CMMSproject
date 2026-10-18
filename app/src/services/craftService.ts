import { api } from '@/lib/api';
import type { Craft, CraftInput } from '@/types';

export const craftService = {
  getAll: () => api.get<Craft[]>('/crafts'),
  create: (data: CraftInput) => api.post<Craft>('/crafts', data),
  update: (id: string, data: Partial<CraftInput>) => api.put<Craft>(`/crafts/${id}`, data),
  delete: (id: string) => api.delete(`/crafts/${id}`),
};
