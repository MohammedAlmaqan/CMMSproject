import { api } from '@/lib/api';
import type { WorkOrderOperation } from '@/types';

export const workOrderOperationService = {
  getByWorkOrder: (workOrderId: string) =>
    api.get<WorkOrderOperation[]>('/work-order-operations', { workOrderId }),
  create: (data: Partial<WorkOrderOperation>) =>
    api.post<WorkOrderOperation>('/work-order-operations', data),
  update: (id: string, data: Partial<WorkOrderOperation>) =>
    api.put<WorkOrderOperation>(`/work-order-operations/${id}`, data),
  delete: (id: string) => api.delete(`/work-order-operations/${id}`),
};
