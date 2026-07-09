import { api } from '@/lib/api';
import type { WorkOrderMaterial } from '@/types';

export const workOrderMaterialService = {
  getByWorkOrder: (workOrderId: string) =>
    api.get<WorkOrderMaterial[]>('/work-order-materials', { workOrderId }),
  create: (data: Partial<WorkOrderMaterial>) =>
    api.post<WorkOrderMaterial>('/work-order-materials', data),
  update: (id: string, data: Partial<WorkOrderMaterial>) =>
    api.put<WorkOrderMaterial>(`/work-order-materials/${id}`, data),
  delete: (id: string) => api.delete(`/work-order-materials/${id}`),
};
