import { getAuthToken, ApiError } from '@/lib/api';
import type { Attachment } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const attachmentService = {
  getByEntity: (entityType: string, entityId: string) =>
    fetch(`${API_BASE}/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      return res.json() as Promise<Attachment[]>;
    }),

  upload: (entityType: string, entityId: string, file: File) => {
    const fd = new FormData();
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    fd.append('file', file);
    return fetch(`${API_BASE}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: fd,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      return res.json() as Promise<Attachment>;
    });
  },

  download: async (attachment: Attachment) => {
    const res = await fetch(`${API_BASE}/attachments/${attachment.attachmentId}/download`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.originalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  remove: (id: string) =>
    fetch(`${API_BASE}/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || res.statusText);
      }
      return res.json();
    }),
};