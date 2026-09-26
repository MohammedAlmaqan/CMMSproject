// ============================================================
// Capacity Board - SOW 3.1.3 work centre capacity (hours/day)
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, ChevronDown, ChevronRight, Gauge, Loader2 } from 'lucide-react';
import { workCenterService } from '@/services/workCenterService';
import type { CapacityBoard, Craft } from '@/types';

const inputCls =
  'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function defaultRange(): { from: string; to: string } {
  // Matches the server default of "the next 14 days" so the inputs describe
  // what was actually fetched rather than a different window.
  const from = new Date();
  const to = new Date(from.getTime() + 13 * 86_400_000);
  return { from: dayKey(from), to: dayKey(to) };
}

function fmtDay(iso: string): { dow: string; dm: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    dm: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', timeZone: 'UTC' }),
  };
}

interface Props {
  crafts: Craft[];
}

/**
 * SOW 3.1.3: WorkCenter.dailyCapacityHours has always been writable and nothing
 * read it, so a centre could be booked well past its daily capacity and the only
 * symptom was an overloaded week.
 *
 * The board is read-only. It books nothing: it shows what the current plan asks
 * for, so a planner can see the overload before committing to it rather than
 * after. Enforcement, if the SOW ever asks for it, is a different decision.
 */
export default function CapacityBoardPanel({ crafts }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [board, setBoard] = useState<CapacityBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const craftName = useCallback(
    (craftId: string) => {
      const c = crafts.find((x) => x.craftId === craftId);
      return c ? c.craftCode : craftId.slice(0, 8);
    },
    [crafts]
  );

  const load = useCallback(
    async (from: string, to: string) => {
      setBusy(true);
      setError(null);
      try {
        setBoard(await workCenterService.getCapacity(from, to));
      } catch {
        // The panel is supplementary: a failure here must not take the work
        // centre list down with it, so it reports and leaves the list alone.
        setError('Could not load the capacity board.');
        setBoard(null);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) void load(range.from, range.to);
  }, [open, range.from, range.to, load]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyRange = (from: string, to: string) => setRange({ from, to });

  const resetRange = () => setRange(defaultRange());

  const overloaded = (board?.entries ?? []).reduce(
    (n, e) => n + e.days.filter((d) => d.overCapacity).length,
    0
  );
  const undated = (board?.entries ?? []).reduce(
    (n, e) => n + (e.unscheduledHours > 0 ? 1 : 0),
    0
  );

  return (
    <div className="industrial-card rounded mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-tertiary transition-colors"
        style={{ backgroundColor: '#27272A' }}
      >
        {open ? <ChevronDown className="w-4 h-4 text-tertiary" /> : <ChevronRight className="w-4 h-4 text-tertiary" />}
        <Gauge className="w-4 h-4 text-amber" />
        <span className="text-sm font-semibold text-primary">Capacity Board</span>
        <span className="text-xs text-tertiary">planned hours against each centre's daily capacity</span>
        {overloaded > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overloaded} overloaded {overloaded === 1 ? 'day' : 'days'}
          </span>
        )}
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="cap-from" className="block text-tertiary mb-1" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>From</label>
              <input
                id="cap-from"
                type="date"
                className={inputCls}
                value={range.from}
                onChange={(e) => applyRange(e.target.value, range.to)}
              />
            </div>
            <div>
              <label htmlFor="cap-to" className="block text-tertiary mb-1" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>To</label>
              <input
                id="cap-to"
                type="date"
                className={inputCls}
                value={range.to}
                onChange={(e) => applyRange(range.from, e.target.value)}
              />
            </div>
            <button
              onClick={resetRange}
              className="px-2.5 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight transition-colors"
            >
              Next 14 days
            </button>
            {busy && <Loader2 className="w-4 h-4 text-tertiary animate-spin" />}
          </div>

          {error && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => void load(range.from, range.to)} className="underline hover:text-red-100">Retry</button>
            </div>
          )}

          {!error && board && board.entries.length === 0 && (
            <div className="rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">
              No work centres to show a capacity board for.
            </div>
          )}

          {!error && board && board.entries.length > 0 && (
            <>
              <p className="text-xs text-tertiary">
                Counts work orders in Planned, Scheduled, In Progress and Suspended. Drafts are
                excluded because a draft is a proposal. Hours are spread evenly across each work
                order's planned window.
              </p>

              {undated > 0 && (
                <div className="rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-amber flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {undated} {undated === 1 ? 'centre has' : 'centres have'} committed hours with no
                    planned start, so they are not shown against any day below. Date them to see
                    them here.
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {board.entries.map((entry) => {
                  const isOpen = expanded.has(entry.workCenterId);
                  const peak = entry.days.reduce((m, d) => Math.max(m, d.plannedHours), 0);
                  return (
                    <div key={entry.workCenterId} className="rounded border border-subtle overflow-hidden">
                      <button
                        onClick={() => toggle(entry.workCenterId)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-tertiary transition-colors"
                        style={{ backgroundColor: '#1E1E22' }}
                      >
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-tertiary" /> : <ChevronRight className="w-3.5 h-3.5 text-tertiary" />}
                        <span className="font-mono text-xs text-primary font-semibold">{entry.workCenterCode}</span>
                        <span className="text-xs text-secondary">{entry.name}</span>
                        <span className="ml-auto text-xs text-tertiary">
                          peak {peak}h/day of {entry.capacityHours}h
                        </span>
                        {entry.days.some((d) => d.overCapacity) && (
                          <span className="text-xs text-amber flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> over
                          </span>
                        )}
                      </button>

                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr style={{ backgroundColor: '#111113' }}>
                                <th className="text-left px-3 py-2 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Day</th>
                                {entry.days.map((d) => {
                                  const { dow, dm } = fmtDay(d.date);
                                  return (
                                    <th
                                      key={d.date}
                                      className="px-2 py-2 font-medium text-tertiary text-center whitespace-nowrap"
                                      style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                                    >
                                      <span className="block">{dow}</span>
                                      <span className="block text-primary font-mono normal-case">{dm}</span>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ backgroundColor: '#1E1E22' }}>
                                <td className="px-3 py-2 text-xs text-tertiary whitespace-nowrap">Planned h</td>
                                {entry.days.map((d) => (
                                  <td
                                    key={d.date}
                                    className={`px-2 py-2 text-center font-mono text-xs ${
                                      d.overCapacity ? 'text-amber font-semibold' : d.plannedHours > 0 ? 'text-primary' : 'text-tertiary'
                                    }`}
                                  >
                                    {d.plannedHours > 0 ? d.plannedHours : '-'}
                                  </td>
                                ))}
                              </tr>
                              <tr style={{ backgroundColor: '#111113' }}>
                                <td className="px-3 py-2 text-xs text-tertiary whitespace-nowrap">Utilisation</td>
                                {entry.days.map((d) => (
                                  <td
                                    key={d.date}
                                    className={`px-2 py-2 text-center font-mono text-xs ${
                                      d.overCapacity ? 'text-amber' : 'text-secondary'
                                    }`}
                                  >
                                    {d.utilisation === null
                                      ? 'n/a'
                                      : d.plannedHours > 0
                                        ? `${Math.round(d.utilisation * 100)}%`
                                        : '-'}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>

                          {entry.days.some((d) => d.crafts.length > 0) && (
                            <div className="px-3 py-2 border-t border-subtle">
                              <div className="text-tertiary mb-1" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>By craft</div>
                              <div className="flex flex-wrap gap-2">
                                {entry.days
                                  .flatMap((d) => d.crafts.map((c) => ({ date: d.date, ...c })))
                                  .map((c, i) => (
                                    <span
                                      key={`${c.date}-${c.craftId}-${i}`}
                                      className="text-xs text-secondary px-2 py-0.5 rounded border border-subtle"
                                    >
                                      <span className="font-mono text-primary">{craftName(c.craftId)}</span>{' '}
                                      {fmtDay(c.date).dm}: {c.plannedHours}h
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}

                          {entry.unscheduledHours > 0 && (
                            <div className="px-3 py-2 border-t border-subtle flex items-start gap-2 text-xs text-amber">
                              <CalendarRange className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>
                                {entry.unscheduledHours}h not on the board:{' '}
                                {entry.unscheduledWorkOrders.join(', ')} {entry.unscheduledWorkOrders.length === 1 ? 'has' : 'have'} no planned start.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
