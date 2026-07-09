import { api } from '@/lib/api';
import type { SafetyChecklistTemplate, WorkOrderChecklist } from '@/types';

export const safetyChecklistService = {
  getTemplates: () =>
    api.get<SafetyChecklistTemplate[]>('/safety-checklists/templates'),
  createTemplate: (data: Partial<SafetyChecklistTemplate>) =>
    api.post<SafetyChecklistTemplate>('/safety-checklists/templates', data),
  getByWorkOrder: (woId: string) =>
    api.get<WorkOrderChecklist[]>(`/safety-checklists/work-order/${woId}`),
  attachToWorkOrder: (woId: string, templateId: string) =>
    api.post(`/safety-checklists/work-order/${woId}/attach`, { templateId }),
  updateChecklistStatus: (id: string, data: Partial<WorkOrderChecklist>) =>
    api.put(`/safety-checklists/work-order-checklist/${id}`, data),
  updateChecklistItem: (id: string, data: { response: string; comment?: string }) =>
    api.put(`/safety-checklists/work-order-checklist-item/${id}`, data),
};
