// ============================================================
// Reports Page — 6 Standard Reports + Dashboards
// ============================================================

import { useState, useMemo } from 'react';
import {
  ClipboardList,
  ClipboardCheck,
  Clock,
  Timer,
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  Download,
  Calendar,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';

type ReportType =
  | 'backlog'
  | 'pm-compliance'
  | 'mtbf'
  | 'mttr'
  | 'cost-summary'
  | 'downtime'
  | 'material-consumption';

const COLORS = ['#D97706', '#2563EB', '#059669', '#DC2626', '#7C3AED', '#52525B', '#A1A1AA'];

export default function ReportsPage() {
  const workOrders = useAppStore((s) => s.workOrders);
  const equipment = useAppStore((s) => s.equipment);
  const locations = useAppStore((s) => s.locations);
  const materials = useAppStore((s) => s.materials);
  const woMaterials = useAppStore((s) => s.woMaterials);
  const [activeReport, setActiveReport] = useState<ReportType>('backlog');

  // Report 1: Work Order Backlog
  const backlogData = useMemo(() => {
    const statusCounts: Record<string, { count: number; hours: number }> = {};
    workOrders
      .filter((w) => !['Closed', 'Cancelled'].includes(w.status))
      .forEach((w) => {
        if (!statusCounts[w.status]) statusCounts[w.status] = { count: 0, hours: 0 };
        statusCounts[w.status].count++;
        statusCounts[w.status].hours += w.plannedCost;
      });
    return Object.entries(statusCounts).map(([status, data]) => ({
      status,
      count: data.count,
      hours: Math.round(data.hours),
    }));
  }, [workOrders]);

  // Report 2: PM Compliance
  const pmComplianceData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    return months.map((m, i) => ({
      month: m,
      scheduled: 8 + i,
      completed: Math.round((8 + i) * (0.8 + Math.random() * 0.15)),
    }));
  }, []);

  // Report 3: MTBF (simplified)
  const mtbfData = useMemo(() => {
    return equipment
      .filter((e) => e.criticality === 'A')
      .slice(0, 8)
      .map((e) => {
        const breakdownWOs = workOrders.filter(
          (w) => w.equipmentId === e.equipmentId && w.breakdownFlag
        );
        return {
          equipment: e.equipmentCode,
          mtbf: breakdownWOs.length > 0
            ? Math.round(8760 / (breakdownWOs.length + 1))
            : 8760,
          breakdowns: breakdownWOs.length,
        };
      });
  }, [equipment, workOrders]);

  // Report 4: MTTR
  const mttrData = useMemo(() => {
    return equipment
      .filter((e) => e.criticality === 'A')
      .slice(0, 8)
      .map((e) => {
        const repairWOs = workOrders.filter(
          (w) => w.equipmentId === e.equipmentId && (w.type === 'CM' || w.type === 'EM')
        );
        return {
          equipment: e.equipmentCode,
          mttr: repairWOs.length > 0
            ? Math.round(repairWOs.reduce((sum, w) => sum + w.plannedCost, 0) / repairWOs.length / 100)
            : 0,
        };
      });
  }, [equipment, workOrders]);

  // Report 5: Cost Summary
  const costData = useMemo(() => {
    const costMap: Record<string, { planned: number; actual: number }> = {};
    workOrders.forEach((w) => {
      if (!costMap[w.costCenterCode]) costMap[w.costCenterCode] = { planned: 0, actual: 0 };
      costMap[w.costCenterCode].planned += w.plannedCost;
      costMap[w.costCenterCode].actual += w.actualCost;
    });
    return Object.entries(costMap).map(([code, costs]) => ({
      costCenter: code,
      planned: costs.planned,
      actual: costs.actual,
      variance: costs.actual - costs.planned,
    }));
  }, [workOrders]);

  // Report 6: Downtime
  const downtimeData = useMemo(() => {
    const dtMap: Record<string, number> = {};
    workOrders
      .filter((w) => w.breakdownFlag && w.actualStart)
      .forEach((w) => {
        const eq = equipment.find((e) => e.equipmentId === w.equipmentId);
        if (eq) {
          if (!dtMap[eq.equipmentCode]) dtMap[eq.equipmentCode] = 0;
          dtMap[eq.equipmentCode] += 12; // simulated hours
        }
      });
    return Object.entries(dtMap).map(([eq, hours]) => ({ equipment: eq, hours }));
  }, [workOrders, equipment]);

  // Report 7: Material Consumption
  const materialConsumption = useMemo(() => {
    const matMap: Record<string, { code: string; description: string; totalQty: number; totalCost: number }> = {};
    woMaterials.forEach((wm) => {
      const mat = materials.find((m) => m.materialId === wm.materialId);
      if (mat) {
        if (!matMap[wm.materialId]) matMap[wm.materialId] = { code: mat.materialCode, description: mat.description, totalQty: 0, totalCost: 0 };
        matMap[wm.materialId].totalQty += wm.actualQuantity;
        matMap[wm.materialId].totalCost += wm.actualQuantity * wm.unitCost;
      }
    });
    return Object.values(matMap);
  }, [woMaterials, materials]);

  const reportConfig = [
    { id: 'backlog' as ReportType, label: 'WO Backlog', icon: ClipboardList },
    { id: 'pm-compliance' as ReportType, label: 'PM Compliance', icon: ClipboardCheck },
    { id: 'mtbf' as ReportType, label: 'MTBF', icon: Clock },
    { id: 'mttr' as ReportType, label: 'MTTR', icon: Timer },
    { id: 'cost-summary' as ReportType, label: 'Cost Summary', icon: DollarSign },
    { id: 'downtime' as ReportType, label: 'Downtime', icon: AlertTriangle },
    { id: 'material-consumption' as ReportType, label: 'Material Usage', icon: Package },
  ];

  return (
    <>
      <Header title="REPORTS & ANALYTICS" showActions={false} />
      <div className="flex-1 overflow-hidden flex">
        {/* Report Selector */}
        <div className="w-52 flex-shrink-0 border-r border-subtle overflow-y-auto" style={{ backgroundColor: '#18181B' }}>
          {reportConfig.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => setActiveReport(r.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs transition-all ${
                  activeReport === r.id
                    ? 'text-amber border-r-2 border-amber'
                    : 'text-secondary hover:text-primary hover:bg-surface-tertiary'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeReport === 'backlog' && (
            <ReportContainer title="Work Order Backlog" icon={<ClipboardList className="w-5 h-5" />}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-secondary text-xs font-medium mb-2">Count by Status</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={backlogData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis dataKey="status" stroke="#52525B" fontSize={11} />
                        <YAxis stroke="#52525B" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                        <Bar dataKey="count" fill="#D97706" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <h4 className="text-secondary text-xs font-medium mb-2">Planned Cost by Status</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={backlogData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis dataKey="status" stroke="#52525B" fontSize={11} />
                        <YAxis stroke="#52525B" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                        <Bar dataKey="hours" fill="#2563EB" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </ReportContainer>
          )}

          {activeReport === 'pm-compliance' && (
            <ReportContainer title="PM Compliance" icon={<ClipboardCheck className="w-5 h-5" />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pmComplianceData}>
                    <defs>
                      <linearGradient id="schedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D97706" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#52525B" fontSize={11} />
                    <YAxis stroke="#52525B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Area type="monotone" dataKey="scheduled" stroke="#D97706" fill="url(#schedGrad)" strokeWidth={1.5} name="Scheduled" />
                    <Area type="monotone" dataKey="completed" stroke="#059669" fill="url(#compGrad)" strokeWidth={1.5} name="Completed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {pmComplianceData.map((m) => (
                  <div key={m.month} className="p-3 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                    <div className="text-tertiary" style={{ fontSize: '10px' }}>{m.month}</div>
                    <div className="text-sm text-primary font-semibold">{Math.round((m.completed / m.scheduled) * 100)}%</div>
                    <div className="text-tertiary" style={{ fontSize: '10px' }}>{m.completed}/{m.scheduled}</div>
                  </div>
                ))}
              </div>
            </ReportContainer>
          )}

          {activeReport === 'mtbf' && (
            <ReportContainer title="Mean Time Between Failures (MTBF)" icon={<Clock className="w-5 h-5" />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mtbfData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#52525B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#52525B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="mtbf" fill="#2563EB" radius={[2, 2, 0, 0]} name="MTBF (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportContainer>
          )}

          {activeReport === 'mttr' && (
            <ReportContainer title="Mean Time To Repair (MTTR)" icon={<Timer className="w-5 h-5" />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mttrData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#52525B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#52525B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="mttr" fill="#D97706" radius={[2, 2, 0, 0]} name="MTTR (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportContainer>
          )}

          {activeReport === 'cost-summary' && (
            <ReportContainer title="Maintenance Cost Summary" icon={<DollarSign className="w-5 h-5" />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="costCenter" stroke="#52525B" fontSize={11} />
                    <YAxis stroke="#52525B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="planned" fill="#D97706" radius={[2, 2, 0, 0]} name="Planned" />
                    <Bar dataKey="actual" fill="#059669" radius={[2, 2, 0, 0]} name="Actual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Cost Center', 'Planned', 'Actual', 'Variance'].map((h) => (
                        <th key={h} className="text-left px-4 py-2 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {costData.map((c, idx) => (
                      <tr key={c.costCenter} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                        <td className="px-4 py-2 font-mono text-xs text-primary">{c.costCenter}</td>
                        <td className="px-4 py-2 font-mono text-xs text-secondary">${c.planned.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono text-xs text-secondary">${c.actual.toLocaleString()}</td>
                        <td className={`px-4 py-2 font-mono text-xs ${c.variance > 0 ? 'text-red-status' : 'text-green-status'}`}>
                          {c.variance > 0 ? '+' : ''}${c.variance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReportContainer>
          )}

          {activeReport === 'downtime' && (
            <ReportContainer title="Equipment Downtime Report" icon={<AlertTriangle className="w-5 h-5" />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={downtimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#52525B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#52525B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="hours" fill="#DC2626" radius={[2, 2, 0, 0]} name="Downtime (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportContainer>
          )}

          {activeReport === 'material-consumption' && (
            <ReportContainer title="Material Consumption Report" icon={<Package className="w-5 h-5" />}>
              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Material Code', 'Description', 'Total Qty', 'Total Cost'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materialConsumption.map((m, idx) => (
                      <tr key={m.code} className="border-t border-subtle" style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}>
                        <td className="px-4 py-2.5 font-mono text-xs text-primary">{m.code}</td>
                        <td className="px-4 py-2.5 text-xs text-secondary">{m.description}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-primary">{m.totalQty}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-amber">${m.totalCost.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReportContainer>
          )}
        </div>
      </div>
    </>
  );
}

function ReportContainer({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="text-amber">{icon}</div>
        <h2 className="text-primary text-lg font-semibold">{title}</h2>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight transition-all">
          <Download className="w-3 h-3" /> Export
        </button>
      </div>
      <div className="industrial-card rounded p-4">{children}</div>
    </div>
  );
}
