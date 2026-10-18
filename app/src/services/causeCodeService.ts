import { api } from '@/lib/api';
import type { CauseCode, CauseCodeInput } from '@/types';

export const causeCodeService = {
  getAll: () => api.get<CauseCode[]>('/cause-codes'),
  getById: (id: string) => api.get<CauseCode>(`/cause-codes/${id}`),
  create: (data: CauseCodeInput) => api.post<CauseCode>('/cause-codes', data),
  update: (id: string, data: Partial<CauseCodeInput>) => api.put<CauseCode>(`/cause-codes/${id}`, data),
  delete: (id: string) => api.delete(`/cause-codes/${id}`),
};
