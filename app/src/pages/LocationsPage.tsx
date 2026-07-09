// ============================================================
// Locations Page — Functional Location Hierarchy Management
// ============================================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  Factory,
  MapPin,
  Box,
  CircuitBoard,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';
import type { FunctionalLocation } from '@/types';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Plant: Factory,
  Area: MapPin,
  Unit: CircuitBoard,
  'Sub-unit': Box,
  System: CircuitBoard,
};

export default function LocationsPage() {
  const navigate = useNavigate();
  const locations = useAppStore((s) => s.locations);
  const equipment = useAppStore((s) => s.equipment);
  const workOrders = useAppStore((s) => s.workOrders);
  const notifications = useAppStore((s) => s.notifications);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['FL-001']));

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
    const woCount = workOrders.filter((w) => allIds.includes(w.functionalLocationId)).length;
    const openWOs = workOrders.filter((w) => allIds.includes(w.functionalLocationId) && !['Closed', 'Cancelled'].includes(w.status)).length;
    const notifCount = notifications.filter((n) => allIds.includes(n.functionalLocationId) && n.status === 'Open').length;
    return { eqCount, woCount, openWOs, notifCount };
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
              <button onClick={() => toggleNode(node.functionalLocationId)} className="flex-shrink-0">
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
              <span className="text-tertiary" style={{ fontSize: '10px' }} title="Work Orders">WO: {stats.woCount}</span>
              {stats.openWOs > 0 && (
                <span className="text-amber" style={{ fontSize: '10px' }} title="Open WOs">Open: {stats.openWOs}</span>
              )}
              {stats.notifCount > 0 && (
                <span className="text-red-status flex items-center gap-0.5" style={{ fontSize: '10px' }} title="Open Notifications">
                  <AlertTriangle className="w-3 h-3" />{stats.notifCount}
                </span>
              )}
            </div>
          </div>
          {isExpanded && children.length > 0 && renderTree(children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <>
      <Header title="FUNCTIONAL LOCATIONS" showActions={false} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations..."
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <span className="text-tertiary text-xs ml-auto">{locations.length} locations</span>
        </div>

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
      </div>
    </>
  );
}
