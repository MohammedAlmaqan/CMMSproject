// ============================================================
// Dashboard Page — KPI Ribbon + Charts + Summary
// ============================================================

import { useNavigate } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Bell,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import type { WorkOrderStatus, WorkOrderType } from '@/types';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';

const TacticalDashboardGrid = lazy(
  () => import('@/components/dashboard/TacticalDashboardGrid')
);

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  Draft: '#52525B',
  Planned: '#D97706',
  Scheduled: '#2563EB',
  'In Progress': '#2563EB',
  Suspended: '#DC2626',
  Completed: '#059669',
  Closed: '#059669',
  Cancelled: '#52525B',
};

const TYPE_COLORS: Record<WorkOrderType, string> = {
  CM: '#D97706',
  PM: '#2563EB',
  PdM: '#7C3AED',
  EM: '#DC2626',
  CAL: '#059669',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const kpis = useAppStore((s) => s.dashboardKPIs);
  const workOrders = useAppStore((s) => s.workOrders);
  const alerts = useAppStore((s) => s.alerts);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((w) => {
      counts[w.status] = (counts[w.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name as WorkOrderStatus] || '#52525B',
    }));
  }, [workOrders]);

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((w) => {
      counts[w.type] = (counts[w.type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: TYPE_COLORS[name as WorkOrderType] || '#52525B',
    }));
  }, [workOrders]);

  const monthlyTrend = useMemo(() => {
    return [
      { month: 'Jan', planned: 12, actual: 10 },
      { month: 'Feb', planned: 14, actual: 13 },
      { month: 'Mar', planned: 10, actual: 9 },
      { month: 'Apr', planned: 16, actual: 14 },
      { month: 'May', planned: 18, actual: 17 },
      { month: 'Jun', planned: 15, actual: 13 },
      { month: 'Jul', planned: 8, actual: 6 },
    ];
  }, []);

  const backlogByCenter = useMemo(() => {
    const centerMap: Record<string, number> = {};
    workOrders
      .filter((w) => !['Closed', 'Cancelled', 'Completed'].includes(w.status))
      .forEach((w) => {
        const wc = w.workCenterId;
        centerMap[wc] = (centerMap[wc] || 0) + 1;
      });
    return Object.entries(centerMap).map(([id, count]) => {
      const wc = useAppStore.getState().workCenters.find((w) => w.workCenterId === id);
      return { name: wc?.code || id, count };
    });
  }, [workOrders]);

  const unreadAlerts = alerts.filter((a) => !a.isRead);

  return (
    <>
      <Header title="DASHBOARD" showActions={false} />

      <div className="flex-1 overflow-y-auto">
        {/* KPI Ribbon with 3D Grid */}
        <div className="kpi-canvas-container">
          <Suspense fallback={<div style={{ backgroundColor: '#1E1E22' }} />}>\n            <TacticalDashboardGrid />
          </Suspense>
          <div className="kpi-metrics-overlay">
            <KPICard
              icon={<ClipboardList className="w-5 h-5" />}
              label="Active WOs"
              value={String(kpis.activeWorkOrders)}
              color="#FAFAFA"
              onClick={() => navigate('/work-orders')}
            />
            <KPICard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Overdue"
              value={String(kpis.overdueWorkOrders)}
              color="#DC2626"
              onClick={() => navigate('/work-orders')}
            />
            <KPICard
              icon={<Calendar className="w-5 h-5" />}
              label="Scheduled Today"
              value={String(kpis.scheduledToday)}
              color="#2563EB"
              onClick={() => navigate('/work-orders')}
            />
            <KPICard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Completion Rate"
              value={`${kpis.completionRate}%`}
              color="#059669"
              onClick={() => navigate('/reports')}
            />
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="p-6 grid grid-cols-12 gap-4">
          {/* Work Orders by Status */}
          <div className="col-span-3 industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-4">Open Work Orders by Status</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181B',
                      border: '1px solid #27272A',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#FAFAFA' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {statusData.slice(0, 4).map((s) => (
                <div key={s.name} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-tertiary" style={{ fontSize: '10px' }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Trend */}
          <div className="col-span-5 industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-4">Maintenance Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend}>
                  <defs>
                    <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D97706" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="month" stroke="#52525B" fontSize={11} />
                  <YAxis stroke="#52525B" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181B',
                      border: '1px solid #27272A',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#FAFAFA' }}
                  />
                  <Area type="monotone" dataKey="planned" stroke="#D97706" fill="url(#plannedGrad)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="actual" stroke="#059669" fill="url(#actualGrad)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* WO Type Distribution */}
          <div className="col-span-4 industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-4">Work Orders by Type</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis type="number" stroke="#52525B" fontSize={11} />
                  <YAxis dataKey="name" type="category" stroke="#52525B" fontSize={11} width={30} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181B',
                      border: '1px solid #27272A',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#FAFAFA' }}
                  />
                  <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                    {typeData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Backlog by Work Center */}
          <div className="col-span-4 industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-4">Backlog by Work Center</h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={backlogByCenter}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="name" stroke="#52525B" fontSize={11} />
                  <YAxis stroke="#52525B" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181B',
                      border: '1px solid #27272A',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#FAFAFA' }}
                  />
                  <Bar dataKey="count" fill="#D97706" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="col-span-4 industrial-card rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-primary text-sm font-semibold">System Alerts</h3>
              <span className="text-tertiary" style={{ fontSize: '10px' }}>
                {unreadAlerts.length} unread
              </span>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {alerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.alertId}
                  className={`flex items-start gap-2 p-2 rounded ${
                    !alert.isRead ? 'bg-surface-tertiary/30' : ''
                  }`}
                >
                  <Bell className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                    !alert.isRead ? 'text-amber' : 'text-tertiary'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-primary text-xs font-medium truncate">
                      {alert.title}
                    </p>
                    <p className="text-secondary truncate" style={{ fontSize: '11px' }}>
                      {alert.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/notifications')}
              className="flex items-center gap-1 mt-3 text-amber text-xs hover:underline"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* PM Compliance */}
          <div className="col-span-4 industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-4">PM Compliance</h3>
            <div className="flex items-center justify-center h-44">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#27272A"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="8"
                    strokeDasharray={`${(kpis.pmCompliance / 100) * 264} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-primary text-2xl font-bold">{kpis.pmCompliance}%</span>
                  <span className="text-tertiary" style={{ fontSize: '10px' }}>Compliance</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <ClipboardCheck className="w-4 h-4 text-green-status" />
              <span className="text-secondary text-xs">
                {workOrders.filter((w) => w.type === 'PM' && w.status === 'Closed').length} PMs completed this month
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function KPICard({
  icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded transition-all hover:bg-surface-tertiary/30"
      style={{
        background: 'rgba(24, 24, 27, 0.4)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="text-tertiary">{icon}</div>
      <div className="text-left">
        <div className="font-bold" style={{ fontSize: '22px', letterSpacing: '-0.02em', color }}>
          {value}
        </div>
        <div className="text-secondary" style={{ fontSize: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </button>
  );
}
