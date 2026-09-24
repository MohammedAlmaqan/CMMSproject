// ============================================================
// Reports Page — 6 Standard Reports + Dashboards
// ============================================================

import { useState, useMemo, useEffect } from 'react';
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
import { reportService } from '@/services/reportService';
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
  const [activeReport, setActiveReport] = useState<ReportType>('backlog');
  interface ReportData {
    backlog: unknown;
    'pm-compliance': unknown;
    mtbf: unknown;
    mttr: unknown;
    'cost-summary': unknown;
    downtime: unknown;
    'material-consumption': unknown;
  }

  const [reportData, setReportData] = useState<Partial<ReportData>>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<Partial<Record<ReportType, string>>>({});

  useEffect(() => {
    if (reportData[activeReport] !== undefined) return;
    let cancelled = false;
    setReportLoading(true);
    const fetchers: Record<ReportType, () => Promise<unknown>> = {
      backlog: () => reportService.getBacklog(),
      'pm-compliance': () => reportService.getPMCompliance(),
      mtbf: () => reportService.getMTBF(),
      mttr: () => reportService.getMTTR(),
      'cost-summary': () => reportService.getCostSummary(),
      downtime: () => reportService.getDowntime(),
      'material-consumption': () => reportService.getMaterialConsumption(),
    };
    fetchers[activeReport]()
      .then((data) => {
        if (!cancelled) {
          setReportData((prev) => ({ ...prev, [activeReport]: data }));
          setReportLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReportError((prev) => ({ ...prev, [activeReport]: 'Failed to load report data. Please try again.' }));
          setReportLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeReport, reportData]);

  // Report 1: Work Order Backlog
  const backlogData = useMemo(() => {
    return Array.isArray(reportData.backlog)
      ? (reportData.backlog as Array<{ status: string; count: number; totalPlannedHours: number }>).map((r) => ({
          status: r.status,
          count: r.count,
          hours: r.totalPlannedHours,
        }))
      : [];
  }, [reportData]);

  const pmCompliance = (reportData['pm-compliance'] ?? {}) as {
    period?: string;
    totalPM?: number;
    completedPM?: number;
    complianceRate?: number;
  };

  // Report 3: MTBF
  const mtbfData = useMemo(() => {
    return Array.isArray(reportData.mtbf)
      ? (reportData.mtbf as Array<{ equipmentId: string; mtbfHours: number }>).map((r) => ({
          equipment: r.equipmentId,
          mtbf: r.mtbfHours,
        }))
      : [];
  }, [reportData]);

  // Report 4: MTTR
  const mttrData = useMemo(() => {
    return Array.isArray(reportData.mttr)
      ? (reportData.mttr as Array<{ equipmentId: string; mttrHours: number }>).map((r) => ({
          equipment: r.equipmentId,
          mttr: r.mttrHours,
        }))
      : [];
  }, [reportData]);

  // Report 5: Cost Summary
  const costData = useMemo(() => {
    return Array.isArray(reportData['cost-summary'])
      ? (reportData['cost-summary'] as Array<{ costCenterCode: string; plannedCost: number; actualCost: number; variance: number }>).map(
          (r) => ({
            costCenter: r.costCenterCode,
            planned: r.plannedCost,
            actual: r.actualCost,
            variance: r.variance,
          })
        )
      : [];
  }, [reportData]);

  // Report 6: Downtime
  const downtimeData = useMemo(() => {
    return Array.isArray(reportData.downtime)
      ? (reportData.downtime as Array<{ equipmentId: string; totalDowntimeHours: number }>).map((r) => ({
          equipment: r.equipmentId,
          hours: r.totalDowntimeHours,
        }))
      : [];
  }, [reportData]);

  // Report 7: Material Consumption
  const materialConsumption = useMemo(() => {
    return Array.isArray(reportData['material-consumption'])
      ? (reportData['material-consumption'] as Array<{ materialCode: string; description: string; totalQuantityUsed: number; totalCost: number }>).map(
          (r) => ({
            code: r.materialCode,
            description: r.description,
            totalQty: r.totalQuantityUsed,
            totalCost: r.totalCost,
          })
        )
      : [];
  }, [reportData]);

  const currentRows = useMemo(() => {
    switch (activeReport) {
      case 'backlog':
        return backlogData;
      case 'pm-compliance':
        return [
          {
            period: pmCompliance.period ?? '',
            totalPM: pmCompliance.totalPM ?? 0,
            completedPM: pmCompliance.completedPM ?? 0,
            complianceRate: pmCompliance.complianceRate ?? 0,
          },
        ];
      case 'mtbf':
        return mtbfData;
      case 'mttr':
        return mttrData;
      case 'cost-summary':
        return costData;
      case 'downtime':
        return downtimeData;
      case 'material-consumption':
        return materialConsumption;
    }
  }, [activeReport, backlogData, pmCompliance, mtbfData, mttrData, costData, downtimeData, materialConsumption]);

  const exportCSV = (rows: Array<Record<string, unknown>>, filename: string) => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replaceAll('"', '""')}"`).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isLoading = reportLoading;
  const hasError = reportError[activeReport] != null;
  const current = reportData[activeReport];
  const isEmpty =
    !reportLoading &&
    reportError[activeReport] == null &&
    (Array.isArray(current) ? current.length === 0 : current === undefined);

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
            <ReportContainer title="Work Order Backlog" icon={<ClipboardList className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'backlog-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-secondary text-xs font-medium mb-2">Count by Status</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={backlogData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis dataKey="status" stroke="#92929B" fontSize={11} />
                        <YAxis stroke="#92929B" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                        <Bar dataKey="count" fill="#D97706" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <h4 className="text-secondary text-xs font-medium mb-2">Planned Hours by Status</h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={backlogData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                        <XAxis dataKey="status" stroke="#92929B" fontSize={11} />
                        <YAxis stroke="#92929B" fontSize={11} />
                        <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                        <Bar dataKey="hours" fill="#2563EB" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              )}
            </ReportContainer>
          )}

          {activeReport === 'pm-compliance' && (
            <ReportContainer title="PM Compliance" icon={<ClipboardCheck className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'pm-compliance-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-4 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                    <div className="text-tertiary" style={{ fontSize: '10px' }}>Period</div>
                    <div className="text-primary text-lg font-semibold mt-1">{pmCompliance.period}</div>
                  </div>
                  <div className="p-4 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                    <div className="text-tertiary" style={{ fontSize: '10px' }}>PMs Created</div>
                    <div className="text-primary text-lg font-semibold mt-1">{pmCompliance.totalPM ?? 0}</div>
                  </div>
                  <div className="p-4 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                    <div className="text-tertiary" style={{ fontSize: '10px' }}>PMs Completed</div>
                    <div className="text-primary text-lg font-semibold mt-1">{pmCompliance.completedPM ?? 0}</div>
                  </div>
                </div>
                <div className="flex items-center justify-center h-48">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-amber">{pmCompliance.complianceRate ?? 0}%</div>
                    <div className="text-tertiary mt-2" style={{ fontSize: '11px' }}>Compliance rate ({pmCompliance.period})</div>
                  </div>
                </div>
              </>
              )}
            </ReportContainer>
          )}

          {activeReport === 'mtbf' && (
            <ReportContainer title="Mean Time Between Failures (MTBF)" icon={<Clock className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'mtbf-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mtbfData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#92929B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#92929B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="mtbf" fill="#2563EB" radius={[2, 2, 0, 0]} name="MTBF (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </ReportContainer>
          )}

          {activeReport === 'mttr' && (
            <ReportContainer title="Mean Time To Repair (MTTR)" icon={<Timer className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'mttr-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mttrData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#92929B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#92929B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="mttr" fill="#D97706" radius={[2, 2, 0, 0]} name="MTTR (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </ReportContainer>
          )}

          {activeReport === 'cost-summary' && (
            <ReportContainer title="Maintenance Cost Summary" icon={<DollarSign className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'cost-summary-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="costCenter" stroke="#92929B" fontSize={11} />
                    <YAxis stroke="#92929B" fontSize={11} />
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
              </>
              )}
            </ReportContainer>
          )}

          {activeReport === 'downtime' && (
            <ReportContainer title="Equipment Downtime Report" icon={<AlertTriangle className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'downtime-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={downtimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="equipment" stroke="#92929B" fontSize={10} angle={-30} textAnchor="end" height={60} />
                    <YAxis stroke="#92929B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '4px', fontSize: '12px' }} itemStyle={{ color: '#FAFAFA' }} />
                    <Bar dataKey="hours" fill="#DC2626" radius={[2, 2, 0, 0]} name="Downtime (hrs)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </ReportContainer>
          )}

          {activeReport === 'material-consumption' && (
            <ReportContainer title="Material Consumption Report" icon={<Package className="w-5 h-5" />} onExport={() => exportCSV(currentRows as Array<Record<string, unknown>>, 'material-consumption-report')}>
              {isLoading ? <LoadingState /> : hasError ? <ErrorState /> : isEmpty ? <EmptyState /> : (
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
              )}
            </ReportContainer>
          )}
        </div>
      </div>
    </>
  );
}

function ReportContainer({ title, icon, onExport, children }: { title: string; icon: React.ReactNode; onExport: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="text-amber">{icon}</div>
        <h2 className="text-primary text-lg font-semibold">{title}</h2>
        <button onClick={onExport} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight transition-all">
          <Download className="w-3 h-3" /> Export
        </button>
      </div>
      <div className="industrial-card rounded p-4">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-32 text-secondary text-sm">
      Loading report data...
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex items-center justify-center h-32 text-red-status text-sm">
      Failed to load report data. Please try again.
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32 text-secondary text-sm">
      No data yet for this report.
    </div>
  );
}
