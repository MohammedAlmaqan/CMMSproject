// ============================================================
// Equipment Detail Page — Live API
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Wrench,
  Settings,
  FileText,
  ClipboardList,
  Activity,
  Calendar,
  Tag,
  Loader2,
  RefreshCw,
  Gauge,
  Paperclip,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { equipmentService } from '@/services/equipmentService';
import { workOrderService } from '@/services/workOrderService';
import { attachmentService } from '@/services/attachmentService';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Equipment, FunctionalLocation, WorkOrder, EquipmentMeter, Attachment } from '@/types';

type EqTab = 'general' | 'parameters' | 'history' | 'meters' | 'documents';

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [eq, setEq] = useState<Equipment | null>(null);
  const [eqLocation, setEqLocation] = useState<FunctionalLocation | null>(null);
  const [eqWorkOrders, setEqWorkOrders] = useState<WorkOrder[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attBusy, setAttBusy] = useState<string | null>(null);
  const [attError, setAttError] = useState<string | null>(null);
  const [attSuccess, setAttSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirrors the work order screen. The API independently enforces the same rule,
  // so this only avoids showing a control that would always fail.
  const canDeleteAttachments = hasPermission(['Maintenance Supervisor', 'Administrator']);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EqTab>('general');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [eqRes, woRes, attRes] = await Promise.all([
        equipmentService.getById(id!),
        workOrderService.getAll({ equipmentId: id!, take: 200 }),
        attachmentService.getByEntity('Equipment', id!),
      ]);
      setEq(eqRes);
      setEqLocation(eqRes.functionalLocation || null);
      setEqWorkOrders(woRes.data);
      setAttachments(attRes);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAttachmentUpload = async (file: File | undefined) => {
    if (!file) return;
    setAttBusy('upload');
    setAttError(null);
    setAttSuccess(null);
    try {
      const created = await attachmentService.upload('Equipment', id!, file);
      setAttachments((prev) => [created, ...prev]);
      setAttSuccess(`Uploaded ${created.originalName}`);
    } catch (err) {
      setAttError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setAttBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAttachmentDownload = (att: Attachment) => {
    setAttError(null);
    setAttSuccess(null);
    attachmentService.download(att).catch((err) => {
      setAttError(err instanceof ApiError ? err.message : 'Download failed');
    });
  };

  const handleAttachmentDelete = async (att: Attachment) => {
    setAttBusy(`del:${att.attachmentId}`);
    setAttError(null);
    setAttSuccess(null);
    try {
      await attachmentService.remove(att.attachmentId);
      setAttachments((prev) => prev.filter((a) => a.attachmentId !== att.attachmentId));
      setAttSuccess(`Deleted ${att.originalName}`);
    } catch (err) {
      setAttError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setAttBusy(null);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="EQUIPMENT DETAIL" showActions={false} />
        <div className="flex-1 flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
          <span className="ml-3 text-sm text-tertiary">Loading equipment...</span>
        </div>
      </>
    );
  }

  if (loadError || !eq) {
    return (
      <>
        <Header title="EQUIPMENT DETAIL" showActions={false} />
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center">
            <Wrench className="w-12 h-12 text-tertiary mx-auto mb-3" />
            <p className="text-secondary text-sm mb-2">{loadError || 'Equipment not found'}</p>
            <button onClick={reload} className="flex items-center gap-1 text-amber text-xs hover:underline">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  const eqMeters: EquipmentMeter[] = eq.meters || [];
  const eqBom = eq.bomItems || [];

  const tabs: { id: EqTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'parameters', label: 'Parameters', icon: FileText },
    { id: 'history', label: 'History', icon: ClipboardList },
    { id: 'meters', label: 'Meters', icon: Activity },
    { id: 'documents', label: 'Documents', icon: Paperclip },
  ];

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle" style={{ backgroundColor: '#18181B' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/equipment')} aria-label="Back to equipment" className="p-1.5 text-secondary hover:text-primary transition-colors">
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
                <h3 className="text-primary text-sm font-semibold mb-4">General Information</h3>
                <div className="space-y-2.5">
                  <InfoItem label="Description" value={eq.description} />
                  <InfoItem label="Equipment Class" value={eq.equipmentClass} />
                  <InfoItem label="Manufacturer" value={eq.manufacturer} />
                  <InfoItem label="Model" value={eq.model} />
                  <InfoItem label="Serial Number" value={eq.serialNumber} />
                  <InfoItem label="Asset Tag" value={eq.assetTag} />
                  <InfoItem label="Functional Location" value={eqLocation?.locationCode || '-'} />
                  <InfoItem label="Location Description" value={eqLocation?.description || '-'} />
                  <InfoItem label="Installation Date" value={eq.installationDate ? new Date(eq.installationDate).toLocaleDateString() : '-'} />
                  <InfoItem label="Warranty Expiry" value={eq.warrantyExpiryDate ? new Date(eq.warrantyExpiryDate).toLocaleDateString() : '-'} />
                  <InfoItem label="Criticality" value={String(eq.criticality)} />
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
                  <h3 className="text-primary text-sm font-semibold mb-3">BOM Items ({eqBom.length})</h3>
                  {eqBom.length === 0 ? (
                    <p className="text-tertiary text-xs">No BOM items</p>
                  ) : (
                    eqBom.map((item) => (
                      <div key={item.bomId} className="flex items-center justify-between py-1.5 border-t border-subtle">
                        <span className="text-xs text-secondary">{item.material?.materialCode || item.materialId}</span>
                        <span className="font-mono text-xs text-primary">{item.quantity}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'parameters' && (
            <div className="industrial-card rounded p-4">
              <h3 className="text-primary text-sm font-semibold mb-3">Technical Parameters</h3>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(eq.technicalParameters || {}).map(([key, value]) => (
                  <div key={key} className="p-3 rounded border border-subtle" style={{ backgroundColor: '#111113' }}>
                    <div className="text-tertiary mb-1" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{key}</div>
                    <div className="text-primary text-sm font-medium">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {eqWorkOrders.length === 0 ? (
                <div className="industrial-card rounded p-8 text-center">
                  <ClipboardList className="w-10 h-10 text-tertiary mx-auto mb-3" />
                  <p className="text-secondary text-sm">No work orders for this equipment</p>
                </div>
              ) : (
                eqWorkOrders
                  .slice()
                  .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
                  .map((wo) => (
                    <div key={wo.workOrderId} className="industrial-card rounded p-3 cursor-pointer hover:bg-surface-tertiary transition-colors" onClick={() => navigate(`/work-orders/${wo.workOrderId}`)} role="button" tabIndex={0} onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/work-orders/${wo.workOrderId}`); }
                    }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-amber">{wo.woNumber}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            wo.type === 'EM' ? 'text-red-status bg-red-status/10' : wo.type === 'PM' ? 'text-blue-status bg-blue-status/10' : 'text-secondary bg-secondary/10'
                          }`}>
                            {wo.type}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            wo.status === 'In Progress' ? 'badge-in-progress' :
                            wo.status === 'Closed' || wo.status === 'Completed' ? 'badge-completed' :
                            wo.status === 'Cancelled' ? 'badge-cancelled' : 'badge-open'
                          }`}>
                            {wo.status}
                          </span>
                        </div>
                        <span className="text-tertiary text-xs">{wo.actualCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                      <p className="text-secondary text-xs mt-1">{wo.description}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-tertiary text-xs"><Calendar className="w-3 h-3 inline mr-1" />{wo.plannedStart ? new Date(wo.plannedStart).toLocaleDateString() : '-'}</span>
                        <span className="text-tertiary text-xs"><Tag className="w-3 h-3 inline mr-1" />{wo.breakdownFlag ? 'Breakdown' : 'Normal'}</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {activeTab === 'meters' && (
            <div className="space-y-4">
              {eqMeters.length === 0 ? (
                <div className="industrial-card rounded p-8 text-center">
                  <Gauge className="w-10 h-10 text-tertiary mx-auto mb-3" />
                  <p className="text-secondary text-sm">No meters installed on this equipment</p>
                </div>
              ) : (
                eqMeters.map((meter) => {
                  const readings = [...(meter.readings || [])].sort(
                    (a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime()
                  );
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
                        {readings.length === 0 ? (
                          <p className="text-tertiary text-xs">No readings recorded</p>
                        ) : (
                          <div className="space-y-1">
                            {readings.slice(0, 20).map((r) => (
                              <div key={r.readingId} className="flex items-center justify-between py-1 border-t border-subtle">
                                <span className="font-mono text-xs text-primary">{r.readingValue.toLocaleString()}</span>
                                <span className="text-tertiary text-xs">{new Date(r.readingDate).toLocaleString()}</span>
                                <span className="text-tertiary text-xs">{r.notes}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleAttachmentUpload(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attBusy === 'upload'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-amber border border-amber/50 hover:bg-amber/10 transition-all disabled:opacity-50"
                >
                  {attBusy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </button>
                <span className="text-xs text-tertiary">Manuals, drawings, certificates. Up to 10 MB.</span>
              </div>
              {attError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-red-status border border-red-status/30"
                  style={{ backgroundColor: 'rgba(220,38,38,0.08)' }}>
                  <AlertTriangle className="w-4 h-4" />
                  {attError}
                </div>
              )}
              {attSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-green-status border border-green-status/30"
                  style={{ backgroundColor: 'rgba(5,150,105,0.08)' }}>
                  <CheckCircle className="w-4 h-4" />
                  {attSuccess}
                </div>
              )}
              {attachments.length === 0 ? (
                <div className="industrial-card rounded p-8 text-center">
                  <Paperclip className="w-10 h-10 text-tertiary mx-auto mb-3" />
                  <p className="text-secondary text-sm">No documents on this equipment</p>
                </div>
              ) : (
                attachments.map((att) => (
                  <div key={att.attachmentId} className="industrial-card rounded p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-amber flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-primary text-xs font-mono truncate">{att.originalName}</p>
                          <p className="text-tertiary text-xs mt-0.5">
                            {formatBytes(att.sizeBytes)} · {att.createdBy} · {new Date(att.createdDate).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleAttachmentDownload(att)}
                          className="p-1 text-tertiary hover:text-primary transition-colors"
                          title="Download"
                          aria-label={`Download ${att.originalName}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {canDeleteAttachments && (
                          <button
                            onClick={() => handleAttachmentDelete(att)}
                            className="p-1 text-tertiary hover:text-red-status transition-colors"
                            title="Delete document"
                            aria-label={`Delete ${att.originalName}`}
                          >
                            {attBusy === `del:${att.attachmentId}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
