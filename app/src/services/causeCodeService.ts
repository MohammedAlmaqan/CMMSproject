import { api } from '@/lib/api';
import type { CauseCode } from '@/types';

export const causeCodeService = {
  getAll: () => api.get<CauseCode[]>('/cause-codes'),
  getById: (id: string) => api.get<CauseCode>(`/cause-codes/${id}`),
  create: (data: Partial<CauseCode>) => api.post<CauseCode>('/cause-codes', data),
  update: (id: string, data: Partial<CauseCode>) => api.put<CauseCode>(`/cause-codes/${id}`, data),
  delete: (id: string) => api.delete(`/cause-codes/${id}`),
};
