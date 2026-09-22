import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import { workOrderService } from '@/services/workOrderService';
import { ApiError } from '@/lib/api';
import type { Priority, WorkOrderType } from '@/types';

const inputClass =
  'w-full px-3 py-2 rounded text-primary text-sm outline-none border border-subtle focus:border-highlight transition-colors';
const labelClass = 'block text-secondary text-xs font-medium mb-1.5';

export default function WorkOrderCreatePage() {
  const navigate = useNavigate();
  const locations = useAppStore((s) => s.locations);
  const equipment = useAppStore((s) => s.equipment);
  const workCenters = useAppStore((s) => s.workCenters);
  const users = useAppStore((s) => s.users);
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);

  const [type, setType] = useState<WorkOrderType>('CM');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [description, setDescription] = useState('');
  const [functionalLocationId, setFunctionalLocationId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [workCenterId, setWorkCenterId] = useState('');
  const [supervisorUserId, setSupervisorUserId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedFinish, setPlannedFinish] = useState('');
  const [costCenterCode, setCostCenterCode] = useState('');
  const [internalOrder, setInternalOrder] = useState('');
  const [breakdownFlag, setBreakdownFlag] = useState(false);
  const [safetyCriticalFlag, setSafetyCriticalFlag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locationEquipment = useMemo(
    () => equipment.filter((e) => e.functionalLocationId === functionalLocationId),
    [equipment, functionalLocationId]
  );

  const handleEquipmentChange = (value: string) => {
    setEquipmentId(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await workOrderService.create({
        type,
        priority,
        description,
        functionalLocationId,
        equipmentId: equipmentId || null,
        workCenterId,
        supervisorUserId,
        plannedStart: plannedStart ? new Date(plannedStart).toISOString() : null,
        plannedFinish: plannedFinish ? new Date(plannedFinish).toISOString() : null,
        costCenterCode: costCenterCode || '',
        internalOrder: internalOrder || '',
        breakdownFlag,
        safetyCriticalFlag,
      });
      addWorkOrder(created);
      navigate(`/work-orders/${created.workOrderId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create work order');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header title="CREATE WORK ORDER" />

      <div className="flex-1 overflow-y-auto p-6">
        <button
          onClick={() => navigate('/work-orders')}
          className="flex items-center gap-2 text-tertiary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Back to Work Orders</span>
        </button>

        <form onSubmit={handleSubmit} className="industrial-card rounded-lg p-6 max-w-3xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as WorkOrderType)} className={inputClass} style={{ backgroundColor: '#27272A' }} required>
                <option value="CM">Corrective Maintenance</option>
                <option value="PM">Preventive Maintenance</option>
                <option value="PdM">Predictive Maintenance</option>
                <option value="EM">Emergency</option>
                <option value="CAL">Calibration</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass} style={{ backgroundColor: '#27272A' }} required>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                style={{ backgroundColor: '#27272A' }}
                rows={3}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Functional Location</label>
              <select
                value={functionalLocationId}
                onChange={(e) => { setFunctionalLocationId(e.target.value); setEquipmentId(''); }}
                className={inputClass}
                style={{ backgroundColor: '#27272A' }}
                required
              >
                <option value="">Select location</option>
                {locations.map((loc) => (
                  <option key={loc.functionalLocationId} value={loc.functionalLocationId}>
                    {loc.locationCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Equipment</label>
              <select
                value={equipmentId}
                onChange={(e) => handleEquipmentChange(e.target.value)}
                className={inputClass}
                style={{ backgroundColor: '#27272A' }}
                disabled={!functionalLocationId}
              >
                <option value="">None</option>
                {locationEquipment.map((eq) => (
                  <option key={eq.equipmentId} value={eq.equipmentId}>
                    {eq.equipmentCode} - {eq.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Work Center</label>
              <select value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} required>
                <option value="">Select work center</option>
                {workCenters.map((wc) => (
                  <option key={wc.workCenterId} value={wc.workCenterId}>
                    {wc.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Supervisor</label>
              <select value={supervisorUserId} onChange={(e) => setSupervisorUserId(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} required>
                <option value="">Select supervisor</option>
                {users
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.fullName}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Planned Start</label>
              <input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} />
            </div>

            <div>
              <label className={labelClass}>Planned Finish</label>
              <input type="datetime-local" value={plannedFinish} onChange={(e) => setPlannedFinish(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} />
            </div>

            <div>
              <label className={labelClass}>Cost Center Code</label>
              <input type="text" value={costCenterCode} onChange={(e) => setCostCenterCode(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} />
            </div>

            <div>
              <label className={labelClass}>Internal Order</label>
              <input type="text" value={internalOrder} onChange={(e) => setInternalOrder(e.target.value)} className={inputClass} style={{ backgroundColor: '#27272A' }} />
            </div>

            <div className="col-span-2 flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-secondary text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={breakdownFlag}
                  onChange={(e) => setBreakdownFlag(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                Breakdown
              </label>
              <label className="flex items-center gap-2 text-secondary text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={safetyCriticalFlag}
                  onChange={(e) => setSafetyCriticalFlag(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                Safety Critical
              </label>
            </div>
          </div>

          {error && <div className="mt-4 text-red-status text-xs">{error}</div>}

          <div className="flex items-center gap-3 mt-6">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Creating...' : 'Create Work Order'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/work-orders')}
              className="px-4 py-2 rounded text-xs text-secondary border border-subtle hover:border-highlight hover:text-primary transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}