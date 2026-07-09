// ============================================================
// Materials Page — Spare Parts Catalog
// ============================================================

import { useState, useMemo } from 'react';
import {
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAppStore } from '@/store/appStore';

const PAGE_SIZE = 10;

export default function MaterialsPage() {
  const materials = useAppStore((s) => s.materials);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<string>('materialCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let data = [...materials];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (m) =>
          m.materialCode.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField] as string;
      const bVal = (b as unknown as Record<string, unknown>)[sortField] as string;
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return data;
  }, [materials, searchQuery, sortField, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  return (
    <>
      <Header title="MATERIALS" showActions={false} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search materials..."
              className="w-full pl-9 pr-3 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight"
              style={{ backgroundColor: '#27272A' }}
            />
          </div>
          <span className="text-tertiary text-xs ml-auto">{filtered.length} materials</span>
        </div>

        <div className="industrial-card rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: '#27272A' }}>
                {[
                  { key: 'materialCode', label: 'Material Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'unitOfMeasure', label: 'UOM' },
                  { key: 'standardCost', label: 'Std Cost' },
                  { key: 'currentStock', label: 'Stock' },
                  { key: 'value', label: 'Value' },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-2.5 font-medium text-tertiary cursor-pointer select-none"
                    style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    onClick={() => col.key !== 'value' && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.key !== 'value' && <ArrowUpDown className="w-3 h-3" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((mat, idx) => (
                <tr
                  key={mat.materialId}
                  className="border-t border-subtle"
                  style={{ backgroundColor: idx % 2 === 0 ? '#1E1E22' : '#111113' }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-primary">{mat.materialCode}</td>
                  <td className="px-4 py-2.5 text-xs text-primary">{mat.description}</td>
                  <td className="px-4 py-2.5 text-xs text-secondary">{mat.unitOfMeasure}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-secondary">${mat.standardCost.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-xs ${
                      mat.currentStock < 5 ? 'text-red-status' : mat.currentStock < 10 ? 'text-amber' : 'text-green-status'
                    }`}>
                      {mat.currentStock}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-primary">
                    ${(mat.currentStock * mat.standardCost).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-tertiary text-xs">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-secondary px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 text-secondary hover:text-primary disabled:text-tertiary"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </>
  );
}
