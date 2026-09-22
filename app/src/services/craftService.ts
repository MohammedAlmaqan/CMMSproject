import { api } from '@/lib/api';
import type { Craft } from '@/types';

export const craftService = {
  getAll: () => api.get<Craft[]>('/crafts'),
};