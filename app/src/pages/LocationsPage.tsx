// ============================================================
// Locations Page — Functional Location Hierarchy Management
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  Factory,
  MapPin,
  Box,
  CircuitBoard,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { functionalLocationService } from '@/services/functionalLocationService';
import { equipmentService } from '@/services/equipmentService';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/lib/api';
import type { FunctionalLocation, Equipment, FunctionalLocationInput } from '@/types';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Plant: Factory,
  Area: MapPin,
  Unit: CircuitBoard,
  'Sub-unit': Box,
  System: CircuitBoard,
};

export default function LocationsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [locations, setLocations] = useState<FunctionalLocation[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  // SOW 3.1.1 counts, keyed by location id, taken from the tree endpoint rather
  // than recomputed here. The previous version fetched every work order and
  // every notification and filtered them per node, and its definitions were
  // also inconsistent: the work order count included closed work orders, and
  // the notification count ignored In Process and Converted.
  const [counts, setCounts] = useState<Record<string, { openWorkOrders: number; openNotifications: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);

  // Backend floors: POST/PUT need Technician, DELETE needs Maintenance
  // Supervisor. Controls the API would reject are hidden, not disabled.
  const canWrite = hasPermission(['Technician', 'Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);
  const canDelete = hasPermission(['Maintenance Supervisor', 'Maintenance Planner', 'Administrator']);

  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<FunctionalLocation['locationType']>('Plant');
  const [formParent, setFormParent] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [formSafetyCritical, setFormSafetyCritical] = useState(false);
  const [formInstalled, setFormInstalled] = useState('');
  const [formGps, setFormGps] = useState('');

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [locRes, eqRes, treeRes] = await Promise.all([
        functionalLocationService.getAll(),
        equipmentService.getAll(),
        functionalLocationService.getTree(),
      ]);
      setLocations(locRes);
      setEquipment(eqRes);

      // Flatten the tree once to build the lookup, so a node's counts are a map
      // hit rather than a walk of the whole tree on every render.
      const flat: Record<string, { openWorkOrders: number; openNotifications: number }> = {};
      const walk = (nodes: FunctionalLocation[]) => {
        for (const node of nodes) {
          flat[node.functionalLocationId] = {
            openWorkOrders: node.openWorkOrderCountTotal ?? 0,
            openNotifications: node.openNotificationCountTotal ?? 0,
          };
          if (node.children?.length) walk(node.children);
        }
      };
      walk(treeRes);
      setCounts(flat);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const inputCls =
    'px-2.5 py-1.5 rounded text-xs text-primary outline-none border border-subtle focus:border-highlight transition-colors w-full';
  const labelCls = 'block text-tertiary mb-1';

  const resetForm = () => {
    setEditingId(null);
    setFormCode('');
    setFormDescription('');
    setFormType('Plant');
    setFormParent('');
    setFormStatus('Active');
    setFormSafetyCritical(false);
    setFormInstalled('');
    setFormGps('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (loc: FunctionalLocation) => {
    setEditingId(loc.functionalLocationId);
    setFormCode(loc.locationCode);
    setFormDescription(loc.description);
    setFormType(loc.locationType);
    setFormParent(loc.parentLocationId ?? '');
    setFormStatus(loc.operationalStatus);
    setFormSafetyCritical(loc.safetyCritical);
    setFormInstalled(loc.installationDate ? loc.installationDate.slice(0, 10) : '');
    setFormGps(loc.gpsCoordinates ?? '');
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formDescription.trim()) {
      notify('Location code and description are required', true);
      return;
    }
    const body: FunctionalLocationInput = {
      locationCode: formCode.trim(),
      description: formDescription.trim(),
      locationType: formType,
      parentLocationId: formParent || null,
      operationalStatus: formStatus,
      safetyCritical: formSafetyCritical,
      installationDate: formInstalled || null,
      gpsCoordinates: formGps.trim() || null,
    };
    setBusy('save');
    try {
      if (editingId) {
        await functionalLocationService.update(editingId, body);
        notify(`Location ${body.locationCode} updated`);
      } else {
        await functionalLocationService.create(body);
        notify(`Location ${body.locationCode} created`);
      }
      setShowForm(false);
      resetForm();
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Save failed', true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (loc: FunctionalLocation) => {
    setBusy(`del:${loc.functionalLocationId}`);
    try {
      await functionalLocationService.delete(loc.functionalLocationId);
      notify(`Location ${loc.locationCode} deleted`);
      await reload();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed', true);
    } finally {
      setBusy(null);
    }
  };

  const rootLocations = locations.filter((l) => l.parentLocationId === null);

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getChildren = (parentId: string) => locations.filter((l) => l.parentLocationId === parentId);

  const getAllDescendants = (locId: string): string[] => {
    const ids = [locId];
    const children = getChildren(locId);
    children.forEach((c) => ids.push(...getAllDescendants(c.functionalLocationId)));
    return ids;
  };

  const getStats = (locId: string) => {
    const allIds = getAllDescendants(locId);
    const eqCount = equipment.filter((e) => allIds.includes(e.functionalLocationId)).length;
    // Counts come from the server, which is also where the definition of
    // "open" now lives. Equipment is still counted here because it is a small
    // list and there is no aggregate endpoint for it.
    const server = counts[locId];
    return {
      eqCount,
      woCount: server?.openWorkOrders ?? 0,
      notifCount: server?.openNotifications ?? 0,
    };
  };

  const filteredLocations = useMemo(() => {
    if (!searchQuery) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(
      (l) =>
        l.locationCode.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
    );
  }, [locations, searchQuery]);

  // Reparenting a node beneath itself or one of its descendants would create a
  // cycle the API rejects, so those are removed from the picker on edit.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of locations) {
      if (!l.parentLocationId) continue;
      map.set(l.parentLocationId, [...(map.get(l.parentLocationId) ?? []), l.functionalLocationId]);
    }
    return map;
  }, [locations]);

  const parentCandidates = useMemo(() => {
    if (!editingId) return locations;
    const excluded = new Set<string>([editingId]);
    const stack = [...(childrenByParent.get(editingId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (excluded.has(id)) continue;
      excluded.add(id);
      stack.push(...(childrenByParent.get(id) ?? []));
    }
    return locations.filter((l) => !excluded.has(l.functionalLocationId));
  }, [locations, editingId, childrenByParent]);

  const renderTree = (nodes: FunctionalLocation[], depth = 0) => {
    return nodes.map((node) => {
      const children = getChildren(node.functionalLocationId);
      const isExpanded = expandedNodes.has(node.functionalLocationId);
      const stats = getStats(node.functionalLocationId);
      const TypeIcon = typeIcons[node.locationType] || Folder;

      return (
        <div key={node.functionalLocationId}>
          <div
            className="flex items-center gap-2 px-3 py-2 text-xs border-b border-subtle hover:bg-surface-tertiary transition-colors"
            style={{ paddingLeft: `${12 + depth * 20}px`, backgroundColor: depth % 2 === 0 ? '#1E1E22' : '#111113' }}
          >
            {children.length > 0 ? (
              <button onClick={() => toggleNode(node.functionalLocationId)} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.locationCode}`} aria-expanded={isExpanded} className="flex-shrink-0">
                {isExpanded ? <ChevronDown className="w-3 h-3 text-tertiary" /> : <ChevronRight className="w-3 h-3 text-tertiary" />}
              </button>
            ) : <span className="w-3 flex-shrink-0" />}
            <TypeIcon className="w-4 h-4 text-tertiary flex-shrink-0" />
            <span className="font-mono text-primary flex-shrink-0">{node.locationCode}</span>
            <span className="text-secondary truncate flex-1">{node.description}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
              node.operationalStatus === 'Active' ? 'badge-completed' : 'badge-cancelled'
            }`}>
              {node.operationalStatus}
            </span>
            {node.safetyCritical && (
              <span className="text-xs px-1.5 py-0.5 rounded text-red-status border border-red-status/50 flex-shrink-0">
                Safety Critical
              </span>
            )}
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <span className="text-tertiary" style={{ fontSize: '10px' }} title="Equipment">EQ: {stats.eqCount}</span>
              {stats.woCount > 0 && (
                <span className="text-amber" style={{ fontSize: '10px' }} title="Open work orders, including child locations">Open WO: {stats.woCount}</span>
              )}
              {stats.notifCount > 0 && (
                <span className="text-red-status flex items-center gap-0.5" style={{ fontSize: '10px' }} title="Open Notifications">
                  <AlertTriangle className="w-3 h-3" />{stats.notifCount}
                </span>
              )}
            </div>
            {(canWrite || canDelete) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {canWrite && (
                  <button
                    onClick={() => openEdit(node)}
                    disabled={busy !== null}
                    className="p-1 text-tertiary hover:text-primary transition-colors disabled:opacity-40"
                    title="Edit location"
                    aria-label={`Edit ${node.locationCode}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => remove(node)}
                    disabled={busy !== null}
                    className="p-1 text-tertiary hover:text-red-status transition-colors disabled:opacity-40"
                    title="Delete location"
                    aria-label={`Delete ${node.locationCode}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          {isExpanded && children.length > 0 && renderTree(children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <>
      <Header title="FUNCTIONAL LOCATIONS" showActions={false} />
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded border px-4 py-2 ${
            toast.error ? 'border-red-500/50 bg-red-500/10' : 'border-emerald-500/50 bg-emerald-500/10'
          }`}
        >
          {toast.error ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <span className="text-xs text-primary">{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message" className="text-tertiary hover:text-primary"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations..."
              aria-label="Search locations"
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <span className="text-tertiary text-xs ml-auto">
            {loading ? 'Loading…' : `${locations.length} locations`}
          </span>
          {loadError && (
            <button
              onClick={reload}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber border border-amber/50 hover:bg-amber/10"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#D97706', color: '#111113' }}
            >
              <Plus className="w-3.5 h-3.5" /> New Location
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={save} className="industrial-card rounded p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary text-sm font-semibold">
                {editingId ? 'Edit Functional Location' : 'New Functional Location'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-tertiary hover:text-primary"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="fl-code">Location Code</label>
                <input
                  id="fl-code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder={editingId ? undefined : 'e.g. PL-A-001'}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="fl-desc">Description</label>
                <input id="fl-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="fl-type">Location Type</label>
                <select id="fl-type" value={formType} onChange={(e) => setFormType(e.target.value as FunctionalLocation['locationType'])} className={inputCls}>
                  <option value="Plant">Plant</option>
                  <option value="Area">Area</option>
                  <option value="Unit">Unit</option>
                  <option value="Sub-unit">Sub-unit</option>
                  <option value="System">System</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} htmlFor="fl-parent">Parent Location</label>
                <select id="fl-parent" value={formParent} onChange={(e) => setFormParent(e.target.value)} className={inputCls}>
                  <option value="">None (root)</option>
                  {parentCandidates.map((l) => (
                    <option key={l.functionalLocationId} value={l.functionalLocationId}>
                      {l.locationCode} — {l.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="fl-status">Operational Status</label>
                <select id="fl-status" value={formStatus} onChange={(e) => setFormStatus(e.target.value as 'Active' | 'Inactive')} className={inputCls}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="fl-installed">Installation Date</label>
                <input id="fl-installed" type="date" value={formInstalled} onChange={(e) => setFormInstalled(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 mt-5 text-tertiary text-xs" htmlFor="fl-safety">
                  <input id="fl-safety" type="checkbox" checked={formSafetyCritical} onChange={(e) => setFormSafetyCritical(e.target.checked)} />
                  Safety Critical
                </label>
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="fl-gps">GPS Coordinates (optional)</label>
              <input id="fl-gps" value={formGps} onChange={(e) => setFormGps(e.target.value)} placeholder="e.g. 24.7136, 46.6753" className={inputCls} />
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-3 py-1.5 rounded text-xs text-secondary border border-subtle hover:border-highlight"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === 'save'}
                className="px-3 py-1.5 rounded text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: '#D97706', color: '#111113' }}
              >
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? 'Save Changes' : 'Create Location'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
            <span className="ml-3 text-sm text-tertiary">Loading locations...</span>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">{loadError}</p>
              <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
            </div>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-tertiary mx-auto mb-3" />
              <p className="text-secondary text-sm">No locations found</p>
            </div>
          </div>
        ) : (
          <div className="industrial-card rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-3 py-2 border-b border-subtle" style={{ backgroundColor: '#27272A' }}>
              <span className="text-tertiary font-medium" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Location</span>
              <span className="text-tertiary font-medium text-center" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Status</span>
              <span className="text-tertiary font-medium text-center" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Equipment</span>
              <span className="text-tertiary font-medium text-center" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Work Orders</span>
              <span className="text-tertiary font-medium text-center" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open WOs</span>
              <span className="text-tertiary font-medium text-center" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Alerts</span>
            </div>
            {renderTree(rootLocations)}
          </div>
        )}
      </div>
    </>
  );
}