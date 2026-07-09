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
        <div className="grid grid-cols-2 gap-4">
          {workCenters.map((wc) => {
            const wcCrafts = crafts.filter((c) => c.workCenterId === wc.workCenterId);
            const isExpanded = expandedWC.has(wc.workCenterId);
            return (
              <div key={wc.workCenterId} className="industrial-card rounded overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 border-b border-subtle cursor-pointer hover:bg-surface-tertiary transition-colors"
                  style={{ backgroundColor: '#27272A' }}
                  onClick={() => toggleWC(wc.workCenterId)}
                >
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.stopPropagation(); toggleWC(wc.workCenterId); }}>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-tertiary" /> : <ChevronRight className="w-4 h-4 text-tertiary" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-primary font-semibold">{wc.code}</span>
                        <span className="text-xs text-secondary">{wc.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-tertiary text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{wc.dailyCapacityHours}h/day</span>
                    <span className="text-tertiary text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" />${wc.costRatePerHour}/hr</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${wc.isActive ? 'badge-completed' : 'badge-cancelled'}`}>
                      {wc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
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
