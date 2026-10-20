import { api } from '@/lib/api';
import type { EquipmentMeter, MeterReading } from '@/types';

export interface MeterReadingInput {
  readingValue: number;
  readingDate?: string;
  notes?: string | null;
}

export const equipmentMeterService = {
  getAll: (params?: { equipmentId?: string }) =>
    api.get<EquipmentMeter[]>('/equipment-meters', params),
  // POST /equipment-meters/:id/readings is Technician+ on the API.
  addReading: (meterId: string, data: MeterReadingInput) =>
    api.post<MeterReading>(`/equipment-meters/${meterId}/readings`, data),
};
