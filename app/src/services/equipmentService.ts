import { api, getAuthToken, ApiError, notifyApiActivity } from '@/lib/api';
import type { Equipment } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface CsvImportResult {
  created: number;
  updated: number;
  failed: unknown[];
}

export const equipmentService = {
  getAll: (params?: { search?: string; functionalLocationId?: string; criticality?: string; equipmentClass?: string }) =>
    api.get<Equipment[]>('/equipment', params as any),
  getById: (id: string) => api.get<Equipment>(`/equipment/${id}`),
  create: (data: Partial<Equipment>) => api.post<Equipment>('/equipment', data),
  update: (id: string, data: Partial<Equipment>) => api.put<Equipment>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete(`/equipment/${id}`),

  exportCsv: async () => {
    const res = await fetch(`${API_BASE}/equipment/export.csv`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    notifyApiActivity();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API_BASE}/equipment/import.csv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: fd,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      notifyApiActivity();
      return res.json() as Promise<CsvImportResult>;
    });
  },
};
