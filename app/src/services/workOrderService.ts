import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/api';
import type { WorkOrder, WorkOrderCreateInput, WorkOrderSnapshotEntry } from '@/types';

// The server caps $top at 500 (queryGrammar MAX_TOP), so a single request cannot
// return the whole estate.
const PAGE_LIMIT = 500;

export const workOrderService = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<WorkOrder>>('/work-orders', params),
  /**
   * Walk every page of the (already paginated) list endpoint and return the
   * complete matching set. Summary figures that must not depend on which page
   * happened to be loaded - the dashboard charts, the equipment row counts and
   * the board view - read from this. Callers that need only a few columns pass
   * `$select` so each page stays small.
   */
  getAllPages: async (params: Record<string, string | number | boolean | undefined> = {}) => {
    const first = await workOrderService.getAll({ ...params, $top: PAGE_LIMIT, $skip: 0 });
    let data = first.data;
    const total = first.total ?? data.length;
    // +1 so a row inserted mid-walk cannot spin the loop; the length check ends it.
    const maxPages = Math.ceil(total / PAGE_LIMIT) + 1;
    for (let i = 1; data.length < total && i <= maxPages; i++) {
      const next = await workOrderService.getAll({ ...params, $top: PAGE_LIMIT, $skip: data.length });
      if (!next.data || next.data.length === 0) break;
      data = data.concat(next.data);
    }
    return data;
  },
  getById: (id: string) => api.get<WorkOrder>(`/work-orders/${id}`),
  getHistory: (id: string) =>
    api.get<{ data: WorkOrderSnapshotEntry[]; total: number }>(`/work-orders/${id}/history`),
  create: (data: WorkOrderCreateInput) => api.post<WorkOrder>('/work-orders', data),
  update: (id: string, data: Partial<WorkOrder>) => api.put<WorkOrder>(`/work-orders/${id}`, data),
  delete: (id: string) => api.delete(`/work-orders/${id}`),
  transitionStatus: (id: string, status: string) =>
    api.put<WorkOrder>(`/work-orders/${id}/status`, { status }),
};
