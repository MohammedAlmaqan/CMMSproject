import { api, getAuthToken, ApiError, notifyApiActivity, fetchAllPages } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { Material } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface CsvImportResult {
  created: number;
  updated: number;
  failed: unknown[];
}

export const materialService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<Material>>('/materials', params),
  getAllPages: (params?: Record<string, string | number | boolean | undefined>) =>
    fetchAllPages<Material>((p) => api.get<PaginatedResponse<Material>>('/materials', p), params),
  getById: (id: string) => api.get<Material>(`/materials/${id}`),
  create: (data: Partial<Material>) => api.post<Material>('/materials', data),
  update: (id: string, data: Partial<Material>) => api.put<Material>(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),

  exportCsv: async () => {
    const res = await fetch(`${API_BASE}/materials/export.csv`, {
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
    a.download = `materials-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API_BASE}/materials/import.csv`, {
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
