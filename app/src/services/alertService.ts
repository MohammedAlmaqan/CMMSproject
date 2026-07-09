import { api } from '@/lib/api';
import type { SystemAlert } from '@/types';

export const alertService = {
  getAll: () => api.get<SystemAlert[]>('/alerts'),
  getUnreadCount: () => api.get<{ count: number }>('/alerts/unread-count'),
  markRead: (id: string) => api.put(`/alerts/${id}/read`),
  markAllRead: () => api.put('/alerts/read-all'),
};
