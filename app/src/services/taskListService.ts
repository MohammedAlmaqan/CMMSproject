import { api } from '@/lib/api';
import type { TaskList } from '@/types';

export const taskListService = {
  getAll: () => api.get<TaskList[]>('/task-lists'),
};