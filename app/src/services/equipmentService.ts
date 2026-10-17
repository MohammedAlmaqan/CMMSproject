import { api, getAuthToken, ApiError, notifyApiActivity, fetchAllPages } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { Equipment, EquipmentHistoryEntry, EquipmentBOM, EquipmentMeter } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface CsvImportResult {
  created: number;
  updated: number;
  failed: unknown[];
}

export const equipmentService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<Equipment>>('/equipment', params),
  getAllPages: (params?: Record<string, string | number | boolean | undefined>) =>
    fetchAllPages<Equipment>((p) => api.get<PaginatedResponse<Equipment>>('/equipment', p), params),
  getById: (id: string) => api.get<Equipment>(`/equipment/${id}`),
  getHistory: (id: string, params?: { skip?: number; take?: number }) =>
    api.get<{ data: EquipmentHistoryEntry[]; total: number; skip: number; take: number }>(
      `/equipment/${id}/history`,
      params
    ),
  create: (data: Partial<Equipment>) => api.post<Equipment>('/equipment', data),
  update: (id: string, data: Partial<Equipment>) => api.put<Equipment>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete(`/equipment/${id}`),

  // ── BOM (SOW 3.1.2) ──
  createBom: (equipmentId: string, data: { materialId: string; quantity: number }) =>
    api.post<EquipmentBOM>(`/equipment/${equipmentId}/bom`, data),
  updateBom: (equipmentId: string, bomId: string, data: { quantity: number }) =>
    api.put<EquipmentBOM>(`/equipment/${equipmentId}/bom/${bomId}`, data),
  deleteBom: (equipmentId: string, bomId: string) =>
    api.delete(`/equipment/${equipmentId}/bom/${bomId}`),

  // ── Meters (SOW 3.1.2) ──
  createMeter: (data: { equipmentId: string; meterName: string; unitOfMeasure: string; lastReading?: number; lastReadingDate?: string | null }) =>
    api.post<EquipmentMeter>('/equipment-meters', data),
  updateMeter: (meterId: string, data: Partial<Pick<EquipmentMeter, 'meterName' | 'unitOfMeasure' | 'lastReading' | 'lastReadingDate'>>) =>
    api.put<EquipmentMeter>(`/equipment-meters/${meterId}`, data),
  deleteMeter: (meterId: string) => api.delete(`/equipment-meters/${meterId}`),

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
