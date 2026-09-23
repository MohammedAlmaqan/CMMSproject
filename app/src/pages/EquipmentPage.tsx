// ============================================================
// Equipment Page — Master Data with Location Tree
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  Tag,
  ChevronLeft as CPLeft,
  ChevronRight as CPRight,
  Loader2,
  RefreshCw,
  Box,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { equipmentService } from '@/services/equipmentService';
import { functionalLocationService } from '@/services/functionalLocationService';
import { workOrderService } from '@/services/workOrderService';
import { ApiError } from '@/lib/api';
import type { Equipment, FunctionalLocation, WorkOrder } from '@/types';

const PAGE_SIZE = 12;

export default function EquipmentPage() {
  const navigate = useNavigate();

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [locations, setLocations] = useState<FunctionalLocation[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [criticalityFilter, setCriticalityFilter] = useState('All');
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [eqRes, locRes, woRes] = await Promise.all([
        equipmentService.getAll(),
        functionalLocationService.getAll(),
        workOrderService.getAll({ take: 200 }),
      ]);
      setEquipment(eqRes);
      setLocations(locRes);
      setWorkOrders(woRes.data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Build tree
  const rootLocations = locations.filter((l) => l.parentLocationId === null);

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getChildren = useCallback(
    (parentId: string) => locations.filter((l) => l.parentLocationId === parentId),
    [locations]
  );

  const getEquipmentForNode = useCallback(
    (locId: string) => {
      const allIds = new Set<string>();
      const collect = (id: string) => {
        allIds.add(id);
        getChildren(id).forEach((c) => collect(c.functionalLocationId));
      };
      collect(locId);
      return equipment.filter((e) => allIds.has(e.functionalLocationId));
    },
    [getChildren, equipment]
  );

  const filteredEquipment = useMemo(() => {
    let data = selectedLocationId
      ? getEquipmentForNode(selectedLocationId)
      : equipment;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (e) =>
          e.equipmentCode.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    if (classFilter !== 'All') data = data.filter((e) => e.equipmentClass === classFilter);
    if (criticalityFilter !== 'All') data = data.filter((e) => e.criticality === criticalityFilter);
    return data;
  }, [equipment, selectedLocationId, searchQuery, classFilter, criticalityFilter, getEquipmentForNode]);

  const paged = filteredEquipment.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredEquipment.length / PAGE_SIZE);

  const equipmentClasses = useMemo(() => [...new Set(equipment.map((e) => e.equipmentClass))], [equipment]);

  const renderTree = (nodes: FunctionalLocation[], depth = 0) => {
    return nodes.map((node) => {
      const children = getChildren(node.functionalLocationId);
      const isExpanded = expandedNodes.has(node.functionalLocationId);
      const isSelected = selectedLocationId === node.functionalLocationId;
      const equipCount = getEquipmentForNode(node.functionalLocationId).length;

      return (
        <div key={node.functionalLocationId}>
          <button
            onClick={() => {
              setSelectedLocationId(node.functionalLocationId);
              setPage(0);
            }}
            onDoubleClick={() => toggleNode(node.functionalLocationId)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all ${
              isSelected
                ? 'text-amber'
                : 'text-secondary hover:text-primary'
            }`}
            style={{
              paddingLeft: `${12 + depth * 16}px`,
              backgroundColor: isSelected ? 'rgba(217, 119, 6, 0.1)' : 'transparent',
            }}
          >
            {children.length > 0 ? (
              <span
                onClick={(e) => { e.stopPropagation(); toggleNode(node.functionalLocationId); }}
                onDoubleClick={(e) => { e.stopPropagation(); toggleNode(node.functionalLocationId); }}
                className="flex-shrink-0 cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-tertiary" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-tertiary" />
                )}
              </span>
            ) : (
              <span className="w-3" />
            )}
            {children.length > 0 ? (
              <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? '#D97706' : '#A1A1AA' }} />
            ) : (
              <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? '#D97706' : '#52525B' }} />
            )}
            <span className="truncate font-mono">{node.locationCode}</span>
            <span className="text-tertiary truncate">- {node.description}</span>
            {equipCount > 0 && (
              <span className="ml-auto text-tertiary flex-shrink-0" style={{ fontSize: '10px' }}>
                {equipCount}
              </span>
            )}
          </button>
          {isExpanded && children.length > 0 && (
            <div>{renderTree(children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <>
      <Header title="EQUIPMENT" showActions={false} />

      <div className="flex-1 overflow-hidden flex">
        {/* Left: Location Tree */}
        <div className="w-64 flex-shrink-0 border-r border-subtle overflow-y-auto" style={{ backgroundColor: '#18181B' }}>
          <div className="p-3 border-b border-subtle">
            <h3 className="text-primary text-xs font-semibold">Plant Hierarchy</h3>
          </div>
          {renderTree(rootLocations)}
        </div>

        {/* Right: Equipment Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                placeholder="Search equipment..."
                className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                style={{ backgroundColor: '#27272A' }}
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setPage(0); }}
              className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
              style={{ backgroundColor: '#27272A' }}
            >
              <option value="All">All Classes</option>
              {equipmentClasses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={criticalityFilter}
              onChange={(e) => { setCriticalityFilter(e.target.value); setPage(0); }}
              className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
              style={{ backgroundColor: '#27272A' }}
            >
              <option value="All">All Criticality</option>
              <option value="A">A - Critical</option>
              <option value="B">B - Important</option>
              <option value="C">C - Normal</option>
            </select>
            <span className="text-tertiary text-xs ml-auto">
              {loading ? 'Loading…' : `${filteredEquipment.length} equipment`}
            </span>
            {loadError && (
              <button
                onClick={reload}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber border border-amber/50 hover:bg-amber/10"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
              <span className="ml-3 text-sm text-tertiary">Loading equipment...</span>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <div className="text-center">
                <Box className="w-12 h-12 text-tertiary mx-auto mb-3" />
                <p className="text-secondary text-sm">{loadError}</p>
                <button onClick={reload} className="text-amber text-xs mt-2 hover:underline">Retry</button>
              </div>
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <div className="text-center">
                <Box className="w-12 h-12 text-tertiary mx-auto mb-3" />
                <p className="text-secondary text-sm">No equipment found</p>
              </div>
            </div>
          ) : (
            <>
              {/* Grid */}
              <div className="industrial-card rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: '#27272A' }}>
                      {['Code', 'Name', 'Class', 'Criticality', 'Manufacturer', 'Location', 'Status', 'WO Count'].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 font-medium text-tertiary" style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((eq, idx) => {
                      const loc = locations.find((l) => l.functionalLocationId === eq.functionalLocationId);
                      const woCount = workOrders.filter((w) => w.equipmentId === eq.equipmentId).length;
                      return (
                        <tr
                          key={eq.equipmentId}
                          className="border-t border-subtle cursor-pointer table-row-hover transition-colors"
                          style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                          onClick={() => navigate(`/equipment/${eq.equipmentId}`)}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-primary">{eq.equipmentCode}</td>
                          <td className="px-4 py-2.5 text-xs text-primary">{eq.name}</td>
                          <td className="px-4 py-2.5 text-xs text-secondary">{eq.equipmentClass}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-semibold ${
                              eq.criticality === 'A' ? 'criticality-a' :
                              eq.criticality === 'B' ? 'criticality-b' : 'criticality-c'
                            }`}>
                              {eq.criticality}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-secondary">{eq.manufacturer}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-secondary">{loc?.locationCode || '-'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              eq.operationalStatus === 'Active' ? 'badge-completed' :
                              eq.operationalStatus === 'Inactive' ? 'badge-open' : 'badge-cancelled'
                            }`}>
                              {eq.operationalStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs text-amber">{woCount}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <span className="text-tertiary text-xs">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredEquipment.length)} of {filteredEquipment.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><CPLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><CPRight className="w-4 h-4" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}