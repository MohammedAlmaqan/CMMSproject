import { api } from '@/lib/api';
import type { EquipmentMeter } from '@/types';

export const equipmentMeterService = {
  getAll: (params?: { equipmentId?: string }) =>
    api.get<EquipmentMeter[]>('/equipment-meters', params),
};
