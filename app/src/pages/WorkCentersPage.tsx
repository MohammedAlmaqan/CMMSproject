// ============================================================
// Work Centers Page — Team & Craft Management
// ============================================================

import { useState } from 'react';
import { Users, Clock, DollarSign, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';

export default function WorkCentersPage() {
  const workCenters = useAppStore((s) => s.workCenters);
  const crafts = useAppStore((s) => s.crafts);
  const loading = useAppStore((s) => s.loading);
  const storeError = useAppStore((s) => s.error);
  const [expandedWC, setExpandedWC] = useState<Set<string>>(new Set());

  const toggleWC = (id: string) => {
    setExpandedWC((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Header title="WORK CENTERS & CRAFTS" showActions={false} />
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="mb-4 flex items-center gap-3 text-tertiary text-xs">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-tertiary border-t-transparent animate-spin" />
            Loading work centers...
          </div>
        )}
        {storeError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{storeError}</span>
            <button onClick={() => useAppStore.getState().loadFromApi()} className="ml-2 underline hover:text-red-100">Retry</button>
          </div>
        )}
        {!loading && !storeError && workCenters.length === 0 && (
          <div className="mb-4 rounded-md border border-subtle px-3 py-6 text-center text-tertiary text-xs">No work centers found in the system.</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {workCenters.map((wc) => {
            const wcCrafts = crafts.filter((c) => c.workCenterId === wc.workCenterId);
            const isExpanded = expandedWC.has(wc.workCenterId);
            return (
              <div key={wc.workCenterId} className="industrial-card rounded overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 border-b border-subtle"
                  style={{ backgroundColor: '#27272A' }}
                >
                  <button
                    onClick={() => toggleWC(wc.workCenterId)}
                    aria-expanded={isExpanded}
                    className="flex items-center gap-3 text-left flex-1 cursor-pointer hover:bg-surface-tertiary transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-tertiary" /> : <ChevronRight className="w-4 h-4 text-tertiary" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary font-semibold">{wc.code}</span>
                        <span className="text-xs text-secondary">{wc.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                      <span className="text-tertiary text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{wc.dailyCapacityHours}h/day</span>
                      <span className="text-tertiary text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" />${wc.costRatePerHour}/hr</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${wc.isActive ? 'badge-completed' : 'badge-cancelled'}`}>
                        {wc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </button>
                </div>
                {isExpanded && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle" style={{ backgroundColor: '#1E1E22' }}>
                      <span className="text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Craft Code</span>
                      <span className="text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</span>
                      <span className="text-tertiary text-right" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hourly Rate</span>
                    </div>
                    {wcCrafts.map((craft) => (
                      <div key={craft.craftId} className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-subtle" style={{ backgroundColor: '#111113' }}>
                        <span className="font-mono text-xs text-primary">{craft.craftCode}</span>
                        <span className="text-xs text-secondary">{craft.description}</span>
                        <span className="font-mono text-xs text-amber text-right">${craft.hourlyRate}/hr</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
