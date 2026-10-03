import { api } from '@/lib/api';
import type { User, UserOption, UserRole } from '@/types';

export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  email: string;
  role: UserRole;
  workCenterId?: string | null;
  isActive?: boolean;
}

export const userService = {
  getAll: () => api.get<User[]>('/users'),
  getOptions: () => api.get<UserOption[]>('/users/options'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  create: (data: CreateUserInput) => api.post<User>('/users', data),
  update: (id: string, data: Partial<User>) => api.put<User>(`/users/${id}`, data),
  remove: (id: string) => api.delete<{ message: string }>(`/users/${id}`),
  changePassword: (id: string, data: { currentPassword?: string; newPassword: string }) =>
    api.put(`/users/${id}/password`, data),
};
