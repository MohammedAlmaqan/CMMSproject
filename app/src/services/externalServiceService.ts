import { api } from '@/lib/api';
import type { ExternalServiceCost } from '@/types';

export const externalServiceService = {
  getByWorkOrder: (workOrderId: string) =>
    api.get<ExternalServiceCost[]>('/external-services', { workOrderId }),
  create: (data: Partial<ExternalServiceCost>) =>
    api.post<ExternalServiceCost>('/external-services', data),
  update: (id: string, data: Partial<ExternalServiceCost>) =>
    api.put<ExternalServiceCost>(`/external-services/${id}`, data),
  delete: (id: string) => api.delete(`/external-services/${id}`),
};