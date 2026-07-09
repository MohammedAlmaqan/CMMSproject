// ============================================================
// Equipment Detail Page
// ============================================================

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Wrench,
  ClipboardList,
  Activity,
  Settings,
  FileText,
  Calendar,
  AlertTriangle,
  Tag,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';

type EqTab = 'general' | 'parameters' | 'history' | 'meters';

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const equipment = useAppStore((s) => s.equipment);
  const locations = useAppStore((s) => s.locations);
  const workOrders = useAppStore((s) => s.workOrders);
  const meters = useAppStore((s) => s.meters);
  const meterReadings = useAppStore((s) => s.meterReadings);

  const [activeTab, setActiveTab] = useState<EqTab>('general');

  const eq = equipment.find((e) => e.equipmentId === id);
  if (!eq) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Wrench className="w-12 h-12 text-tertiary mx-auto mb-3" />
          <p className="text-secondary text-sm">Equipment not found</p>
          <button onClick={() => navigate('/equipment')} className="text-amber text-xs mt-2 hover:underline">Back to Equipment</button>
        </div>
      </div>
    );
  }

  const location = locations.find((l) => l.functionalLocationId === eq.functionalLocationId);
  const eqWorkOrders = workOrders.filter((w) => w.equipmentId === eq.equipmentId);
  const eqMeters = meters.filter((m) => m.equipmentId === eq.equipmentId);

  const tabs: { id: EqTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'parameters', label: 'Parameters', icon: FileText },
    { id: 'history', label: 'History', icon: ClipboardList },
    { id: 'meters', label: 'Meters', icon: Activity },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-subtle" style={{ backgroundColor: '#18181B' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/equipment')} className="p-1.5 text-secondary hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold text-primary">{eq.equipmentCode}</span>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-semibold ${
                eq.criticality === 'A' ? 'criticality-a' : eq.criticality === 'B' ? 'criticality-b' : 'criticality-c'
              }`}>
                {eq.criticality}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                eq.operationalStatus === 'Active' ? 'badge-completed' :
                eq.operationalStatus === 'Inactive' ? 'badge-open' : 'badge-cancelled'
              }`}>
                {eq.operationalStatus}
              </span>
            </div>
            <p className="text-secondary text-sm mt-1">{eq.name}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-subtle">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab.id ? 'text-primary border-amber' : 'text-secondary border-transparent hover:text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'general' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="industrial-card rounded p-4">
              <h3 className="text-primary text-sm font-semibold mb-3">General Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Description" value={eq.description} />
                <InfoItem label="Equipment Class" value={eq.equipmentClass} />
                <InfoItem label="Manufacturer" value={eq.manufacturer} />
                <InfoItem label="Model" value={eq.model} />
                <InfoItem label="Serial Number" value={eq.serialNumber} />
                <InfoItem label="Asset Tag" value={eq.assetTag} />
                <InfoItem label="Functional Location" value={location?.locationCode || '-'} />
                <InfoItem label="Location Description" value={location?.description || '-'} />
                <InfoItem label="Installation Date" value={eq.installationDate ? new Date(eq.installationDate).toLocaleDateString() : '-'} />
                <InfoItem label="Warranty Expiry" value={eq.warrantyExpiryDate ? new Date(eq.warrantyExpiryDate).toLocaleDateString() : '-'} />
                <InfoItem label="Criticality" value={`${eq.criticality} - ${eq.criticality === 'A' ? 'Critical' : eq.criticality === 'B' ? 'Important' : 'Normal'}`} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="industrial-card rounded p-4">
                <h3 className="text-primary text-sm font-semibold mb-3">Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total Work Orders" value={String(eqWorkOrders.length)} color="#D97706" />
                  <StatCard label="Open WOs" value={String(eqWorkOrders.filter((w) => !['Closed', 'Cancelled'].includes(w.status)).length)} color="#2563EB" />
                  <StatCard label="Completed" value={String(eqWorkOrders.filter((w) => w.status === 'Closed').length)} color="#059669" />
                  <StatCard label="Breakdowns" value={String(eqWorkOrders.filter((w) => w.breakdownFlag).length)} color="#DC2626" />
                </div>
              </div>
              <div className="industrial-card rounded p-4">
                <h3 className="text-primary text-sm font-semibold mb-3">Meters ({eqMeters.length})</h3>
                {eqMeters.map((m) => (
                  <div key={m.meterId} className="flex items-center justify-between py-1.5 border-t border-subtle">
                    <span className="text-xs text-secondary">{m.meterName}</span>
                    <span className="font-mono text-xs text-primary">{m.lastReading.toLocaleString()} {m.unitOfMeasure}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'parameters' && (
          <div className="industrial-card rounded p-4">
            <h3 className="text-primary text-sm font-semibold mb-3">Technical Parameters</h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(eq.technicalParameters).map(([key, value]) => (
                <div key={key} className="p-3 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                  <div className="text-tertiary mb-1" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{key}</div>
                  <div className="text-primary text-sm font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {eqWorkOrders.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()).map((wo) => (
              <div
                key={wo.workOrderId}
                onClick={() => navigate(`/work-orders/${wo.workOrderId}`)}
                className="industrial-card rounded p-3 cursor-pointer hover:bg-surface-tertiary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-amber">{wo.woNumber}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      color: wo.type === 'EM' ? '#DC2626' : wo.type === 'PM' ? '#2563EB' : '#A1A1AA',
                      backgroundColor: wo.type === 'EM' ? 'rgba(220,38,38,0.1)' : wo.type === 'PM' ? 'rgba(37,99,235,0.1)' : 'rgba(82,82,91,0.1)',
                    }}>
                      {wo.type}
                    </span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    wo.status === 'In Progress' ? 'badge-in-progress' :
                    wo.status === 'Closed' || wo.status === 'Completed' ? 'badge-completed' :
                    wo.status === 'Cancelled' ? 'badge-cancelled' : 'badge-open'
                  }`}>
                    {wo.status}
                  </span>
                </div>
                <p className="text-secondary text-xs mt-1">{wo.description}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-tertiary" style={{ fontSize: '10px' }}>
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {wo.plannedStart ? new Date(wo.plannedStart).toLocaleDateString() : '-'}
                  </span>
                  <span className="text-tertiary" style={{ fontSize: '10px' }}>
                    <Tag className="w-3 h-3 inline mr-1" />${wo.actualCost.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'meters' && (
          <div className="space-y-4">
            {eqMeters.map((meter) => {
              const readings = meterReadings.filter((r) => r.meterId === meter.meterId);
              return (
                <div key={meter.meterId} className="industrial-card rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-primary text-sm font-semibold">{meter.meterName}</h3>
                      <p className="text-tertiary text-xs">Unit: {meter.unitOfMeasure}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg text-primary">{meter.lastReading.toLocaleString()}</div>
                      <div className="text-tertiary text-xs">
                        Last reading: {meter.lastReadingDate ? new Date(meter.lastReadingDate).toLocaleDateString() : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-subtle pt-3">
                    <h4 className="text-secondary text-xs font-medium mb-2">Recent Readings</h4>
                    <div className="space-y-1">
                      {readings.sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime()).map((r) => (
                        <div key={r.readingId} className="flex items-center justify-between py-1">
                          <span className="font-mono text-xs text-primary">{r.readingValue.toLocaleString()}</span>
                          <span className="text-tertiary text-xs">{new Date(r.readingDate).toLocaleString()}</span>
                          <span className="text-tertiary text-xs">{r.notes}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-tertiary" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="text-primary text-xs">{value}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-tertiary" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}
