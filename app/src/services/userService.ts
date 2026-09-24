import { api } from '@/lib/api';
import type { User, UserOption } from '@/types';

export const userService = {
  getAll: () => api.get<User[]>('/users'),
  getOptions: () => api.get<UserOption[]>('/users/options'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  update: (id: string, data: Partial<User>) => api.put<User>(`/users/${id}`, data),
  changePassword: (id: string, data: { currentPassword?: string; newPassword: string }) =>
    api.put(`/users/${id}/password`, data),
};
