import { api } from '@/lib/api';
import type { CostSplit, CostSplitAllocation } from '@/types';

export interface CostSplitInput {
  costCenterCode: string;
  percentage: number;
}

export const costSplitService = {
  getAllocation: (workOrderId: string) =>
    api.get<CostSplitAllocation>('/work-order-cost-splits', { workOrderId }),
  // SOW 3.5.2: the allocation is written as a WHOLE SET - "these percentages
  // total 100%" is a property of the set, not of any one line - so the screen
  // only ever calls this replace endpoint. An empty set clears the allocation.
  replace: (workOrderId: string, splits: CostSplitInput[]) =>
    api.put<{ workOrderId: string; splits: CostSplit[]; replacedCount: number; totalPercentage: number }>(
      '/work-order-cost-splits',
      { workOrderId, splits },
    ),
};
