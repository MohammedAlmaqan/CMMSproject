// ============================================================
// Schedule Work Order Dialog — collect the plan with the transition (F5)
//
// "Schedule" used to be a status-only call, so a work order reached Scheduled
// with no dates and nothing in the product asked for them. This dialog owns the
// two date inputs and hands the caller a validated ISO pair; the caller sends it
// as part of the same PUT /api/work-orders/{id}/status request, so the status
// and the schedule are written by one update.
//
// The API still accepts Scheduled without dates (owner decision 2026-10-25:
// option C not adopted). The dialog asks for them anyway because that is the
// finding: an operator scheduling from the UI should state the plan.
// ============================================================

import { useState } from 'react';
import { CalendarCheck, Loader2, XCircle } from 'lucide-react';
import { toDateTimeLocal } from '@/lib/datetime';

export interface ScheduleDates {
  plannedStart: string;
  plannedFinish: string;
}

interface ScheduleWorkOrderDialogProps {
  woNumber: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  busy: boolean;
  /** An error the API returned for the previous submit. */
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (dates: ScheduleDates) => void;
}

const inputCls =
  'px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight w-full';
const labelCls = 'flex flex-col gap-1 text-xs text-secondary';

export default function ScheduleWorkOrderDialog({
  woNumber,
  plannedStart,
  plannedFinish,
  busy,
  serverError,
  onCancel,
  onSubmit,
}: ScheduleWorkOrderDialogProps) {
  const [start, setStart] = useState(toDateTimeLocal(plannedStart));
  const [finish, setFinish] = useState(toDateTimeLocal(plannedFinish));
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!start || !finish) {
      setError('Enter a planned start and a planned finish');
      return;
    }
    const startDate = new Date(start);
    const finishDate = new Date(finish);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(finishDate.getTime())) {
      setError('Enter a valid planned start and finish');
      return;
    }
    if (finishDate.getTime() < startDate.getTime()) {
      setError('Planned finish must be on or after planned start');
      return;
    }
    onSubmit({
      plannedStart: startDate.toISOString(),
      plannedFinish: finishDate.toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Schedule ${woNumber}`}
    >
      <form
        onSubmit={submit}
        className="industrial-card rounded-lg p-5 w-full max-w-sm space-y-3"
        style={{ backgroundColor: '#1E1E22' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-primary text-sm font-semibold flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-amber" />
            Schedule {woNumber}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close schedule"
            className="text-tertiary hover:text-primary"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        {(error || serverError) && (
          <p className="text-xs text-red-400" role="alert">
            {error || serverError}
          </p>
        )}
        <label className={labelCls}>
          Planned Start
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            aria-label="Planned start"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Planned Finish
          <input
            type="datetime-local"
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            required
            aria-label="Planned finish"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-amber font-medium disabled:opacity-50"
            style={{ color: '#111113' }}
          >
            {busy ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Scheduling...
              </span>
            ) : (
              'Schedule'
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded border border-subtle text-secondary hover:text-primary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
