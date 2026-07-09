import { api } from '@/lib/api';
import type { Comment } from '@/types';

export const commentService = {
  getByEntity: (entityType: string, entityId: string) =>
    api.get<Comment[]>('/comments', { entityType, entityId }),
  create: (data: Partial<Comment>) => api.post<Comment>('/comments', data),
  delete: (id: string) => api.delete(`/comments/${id}`),
};
