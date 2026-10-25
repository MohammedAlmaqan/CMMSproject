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
  Plus,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import CsvToolbar from '@/components/CsvToolbar';
import EquipmentForm from '@/components/EquipmentForm';
import { equipmentService } from '@/services/equipmentService';
import { functionalLocationService } from '@/services/functionalLocationService';
import { workOrderService } from '@/services/workOrderService';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasMinRole } from '@/lib/rbac';
import type { Equipment, FunctionalLocation } from '@/types';

const PAGE_SIZE = 12;

// The tree sidebar needs every asset's id and location to count equipment per
// node, and the class dropdown needs the estate-wide class list - so the page
// keeps one lightweight index (ids only) and pages the table itself through the
// API rather than holding every full row in memory.
type EquipmentIndexEntry = Pick<Equipment, 'equipmentId' | 'functionalLocationId' | 'equipmentClass'>;

export default function EquipmentPage() {
  const navigate = useNavigate();

  const [equipIndex, setEquipIndex] = useState<EquipmentIndexEntry[]>([]);
  const [rows, setRows] = useState<Equipment[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<FunctionalLocation[]>([]);
  // The per-asset work-order count is a property of the whole estate, so it is
  // computed from every work order (ids only) rather than the first 200 rows the
  // page used to fetch - which understated the count for every asset.
  const [woCounts, setWoCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [criticalityFilter, setCriticalityFilter] = useState('All');
  const [page, setPage] = useState(0);
  // POST /equipment/import.csv is Maintenance Planner+ on the API.
  const role = useAuthStore((s) => s.user?.role);
  const canImport = hasMinRole(role, 'Maintenance Planner');
  // POST /equipment is Technician+ on the API (G4).
  const canCreate = hasMinRole(role, 'Technician');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [idxRes, locRes, woRows] = await Promise.all([
        equipmentService.getAllPages({ $select: 'equipmentId,functionalLocationId,equipmentClass' }),
        functionalLocationService.getAllPages(),
        workOrderService.getAllPages({ $select: 'equipmentId' }),
      ]);
      setEquipIndex(idxRes as EquipmentIndexEntry[]);
      setLocations(locRes);
      const counts: Record<string, number> = {};
      for (const wo of woRows as Array<{ equipmentId: string | null }>) {
        if (wo.equipmentId) counts[wo.equipmentId] = (counts[wo.equipmentId] || 0) + 1;
      }
      setWoCounts(counts);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

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
      return equipIndex.filter((e) => allIds.has(e.functionalLocationId));
    },
    [getChildren, equipIndex]
  );

  // The class, criticality and search filters are honoured by the API; the
  // location tree is not, because a node stands for its whole subtree and the
  // collection grammar cannot express "id in this set". When a node is
  // selected the matching rows are therefore narrowed client-side over the
  // complete filtered set, which keeps the descendant semantics and still
  // reports the true total for the selection.
  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {};
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (classFilter !== 'All') params.equipmentClass = classFilter;
    if (criticalityFilter !== 'All') params.criticality = criticalityFilter;
    return params;
  }, [searchQuery, classFilter, criticalityFilter]);

  const subtreeIds = useMemo(() => {
    if (!selectedLocationId) return null;
    const ids = new Set<string>();
    const collect = (id: string) => {
      ids.add(id);
      getChildren(id).forEach((c) => collect(c.functionalLocationId));
    };
    collect(selectedLocationId);
    return ids;
  }, [selectedLocationId, getChildren]);

  const fetchRows = useCallback(async () => {
    setRowsLoading(true);
    setLoadError(null);
    try {
      if (!subtreeIds) {
        const res = await equipmentService.getAll({
          ...queryParams,
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
        });
        setRows(res.data || []);
        setTotal(res.total ?? 0);
      } else {
        const all = await equipmentService.getAllPages(queryParams);
        const filtered = all.filter((e) => subtreeIds.has(e.functionalLocationId));
        setRows(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
        setTotal(filtered.length);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load equipment');
      setRows([]);
      setTotal(0);
    } finally {
      setRowsLoading(false);
    }
  }, [queryParams, page, subtreeIds]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const paged = rows;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const equipmentClasses = useMemo(
    () => [...new Set(equipIndex.map((e) => e.equipmentClass))],
    [equipIndex]
  );

  const renderTree = (nodes: FunctionalLocation[], depth = 0) => {
    return nodes.map((node) => {
      const children = getChildren(node.functionalLocationId);
      const isExpanded = expandedNodes.has(node.functionalLocationId);
      const isSelected = selectedLocationId === node.functionalLocationId;
      const equipCount = getEquipmentForNode(node.functionalLocationId).length;

      return (
        <div key={node.functionalLocationId}>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-all ${
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
              <button
                onClick={() => toggleNode(node.functionalLocationId)}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.locationCode}`}
                aria-expanded={isExpanded}
                className="flex-shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-tertiary" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-tertiary" />
                )}
              </button>
            ) : (
              <span className="w-3" />
            )}
            <button
              onClick={() => {
                setSelectedLocationId(node.functionalLocationId);
                setPage(0);
              }}
              className="flex items-center gap-2 flex-1 text-left min-w-0"
            >
              {children.length > 0 ? (
                <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? '#D97706' : '#A1A1AA' }} />
              ) : (
                <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isSelected ? '#D97706' : '#92929B' }} />
              )}
              <span className="truncate font-mono">{node.locationCode}</span>
              <span className="text-tertiary truncate">- {node.description}</span>
              {equipCount > 0 && (
                <span className="ml-auto text-tertiary flex-shrink-0" style={{ fontSize: '10px' }}>
                  {equipCount}
                </span>
              )}
            </button>
          </div>
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
                aria-label="Search equipment"
                className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
                style={{ backgroundColor: '#27272A' }}
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setPage(0); }}
              aria-label="Filter by equipment class"
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
              aria-label="Filter by criticality"
              className="px-3 py-1.5 rounded text-xs text-primary outline-none border border-subtle"
              style={{ backgroundColor: '#27272A' }}
            >
              <option value="All">All Criticality</option>
              <option value="S">S - Safety Critical</option>
              <option value="A">A - Critical</option>
              <option value="B">B - Important</option>
              <option value="C">C - Normal</option>
            </select>
            <div className="flex items-center gap-2 ml-auto">
              {canCreate && (
                <button
                  onClick={() => setShowCreateForm((v) => !v)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-primary border border-subtle hover:border-highlight hover:text-amber"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Equipment
                </button>
              )}
              <CsvToolbar
                noun="equipment"
                importPath="/equipment/import.csv"
                exportPath="/equipment/export.csv"
                canImport={canImport}
                onImported={() => { loadIndex(); fetchRows(); }}
              />
              <span className="text-tertiary text-xs">
                {loading || rowsLoading ? 'Loading…' : `${total} equipment`}
              </span>
            </div>
            {loadError && (
              <button
                onClick={() => { loadIndex(); fetchRows(); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber border border-amber/50 hover:bg-amber/10"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>

          {showCreateForm && (
            <EquipmentForm
              locations={locations}
              onCancel={() => setShowCreateForm(false)}
              onSaved={() => {
                setShowCreateForm(false);
                // The tree index counts equipment per node and the class
                // dropdown reads it too, so a full reload keeps both honest.
                loadIndex();
                fetchRows();
              }}
            />
          )}

          {loading || (rowsLoading && rows.length === 0) ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin text-tertiary" />
              <span className="ml-3 text-sm text-tertiary">Loading equipment...</span>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <div className="text-center">
                <Box className="w-12 h-12 text-tertiary mx-auto mb-3" />
                <p className="text-secondary text-sm">{loadError}</p>
                <button onClick={() => { loadIndex(); fetchRows(); }} className="text-amber text-xs mt-2 hover:underline">Retry</button>
              </div>
            </div>
          ) : total === 0 ? (
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
                      const woCount = woCounts[eq.equipmentId] || 0;
                      return (
                        <tr
                          key={eq.equipmentId}
                          className="border-t border-subtle cursor-pointer table-row-hover transition-colors"
                          style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#151517' }}
                          onClick={() => navigate(`/equipment/${eq.equipmentId}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              navigate(`/equipment/${eq.equipmentId}`);
                            }
                          }}
                          tabIndex={0}
                          role="link"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-primary">{eq.equipmentCode}</td>
                          <td className="px-4 py-2.5 text-xs text-primary">{eq.name}</td>
                          <td className="px-4 py-2.5 text-xs text-secondary">{eq.equipmentClass}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-semibold ${
                              eq.criticality === 'S' ? 'criticality-s' :
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
                <span className="text-tertiary text-xs">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><CPLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page" className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><CPRight className="w-4 h-4" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}