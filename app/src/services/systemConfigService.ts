import { api } from '@/lib/api';

export interface SystemSetting {
  key: string;
  label: string;
  description: string;
  value: string;
  isDefault: boolean;
  maxLength: number;
}

export const systemConfigService = {
  getAll: () => api.get<SystemSetting[]>('/system-config'),
  update: (key: string, value: string) =>
    api.put<{ key: string; value: string }>('/system-config', { key, value }),
};
