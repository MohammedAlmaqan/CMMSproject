import { api } from '@/lib/api';
import type { ChecklistTemplateInput, SafetyChecklistTemplate, WorkOrderChecklist } from '@/types';

export const safetyChecklistService = {
  getTemplates: () =>
    api.get<SafetyChecklistTemplate[]>('/safety-checklists/templates'),
  createTemplate: (data: ChecklistTemplateInput) =>
    api.post<SafetyChecklistTemplate>('/safety-checklists/templates', data),
  updateTemplate: (id: string, data: ChecklistTemplateInput) =>
    api.put<SafetyChecklistTemplate>(`/safety-checklists/templates/${id}`, data),
  deleteTemplate: (id: string) =>
    api.delete(`/safety-checklists/templates/${id}`),
  getByWorkOrder: (woId: string) =>
    api.get<WorkOrderChecklist[]>(`/safety-checklists/work-order/${woId}`),
  attachToWorkOrder: (woId: string, templateId: string) =>
    api.post(`/safety-checklists/work-order/${woId}/attach`, { checklistTemplateId: templateId }),
  updateChecklistStatus: (id: string, data: Partial<WorkOrderChecklist>) =>
    api.put(`/safety-checklists/work-order-checklist/${id}`, data),
  updateChecklistItem: (id: string, data: { response: string; comment?: string }) =>
    api.put(`/safety-checklists/work-order-checklist-item/${id}`, data),
  deleteChecklist: (id: string) =>
    api.delete(`/safety-checklists/work-order-checklist/${id}`),
};
