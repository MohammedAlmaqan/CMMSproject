import { api } from '@/lib/api';
import type { TaskList, TaskListInput } from '@/types';

export const taskListService = {
  getAll: () => api.get<TaskList[]>('/task-lists'),

  getById: (id: string) => api.get<TaskList>(`/task-lists/${id}`),

  /**
   * SOW 3.1.4. The operations array is replaced wholesale, so an edit submits
   * the complete step list rather than a diff. Each step may carry the materials
   * it requires; the API attaches them to that step, not to the list.
   */
  create: (body: TaskListInput) => api.post<TaskList>('/task-lists', body),

  update: (id: string, body: Partial<TaskListInput>) =>
    api.put<TaskList>(`/task-lists/${id}`, body),

  remove: (id: string) => api.delete(`/task-lists/${id}`),
};
