import { api } from '@/lib/api';
import type { User } from '@/types';

export const userService = {
  getAll: () => api.get<User[]>('/users'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  update: (id: string, data: Partial<User>) => api.put<User>(`/users/${id}`, data),
  changePassword: (id: string, data: { currentPassword?: string; newPassword: string }) =>
    api.put(`/users/${id}/password`, data),
};
