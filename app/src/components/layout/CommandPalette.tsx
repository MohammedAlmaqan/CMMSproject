// ============================================================
// Command Palette (Ctrl+K / ⌘K)
// ============================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  ClipboardList,
  Bell,
  Layers,
  Wrench,
  Package,
  BarChart3,
  Shield,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action: () => void;
  category: string;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      { id: 'nav-dash', label: 'Go to Dashboard', icon: LayoutDashboard, category: 'Navigation', action: () => { navigate('/dashboard'); onClose(); } },
      { id: 'nav-wo', label: 'Go to Work Orders', icon: ClipboardList, category: 'Navigation', action: () => { navigate('/work-orders'); onClose(); } },
      { id: 'nav-notif', label: 'Go to Notifications', icon: Bell, category: 'Navigation', action: () => { navigate('/notifications'); onClose(); } },
      { id: 'nav-loc', label: 'Go to Locations', icon: Layers, category: 'Navigation', action: () => { navigate('/locations'); onClose(); } },
      { id: 'nav-eq', label: 'Go to Equipment', icon: Wrench, category: 'Navigation', action: () => { navigate('/equipment'); onClose(); } },
      { id: 'nav-mat', label: 'Go to Materials', icon: Package, category: 'Navigation', action: () => { navigate('/materials'); onClose(); } },
      { id: 'nav-rep', label: 'Go to Reports', icon: BarChart3, category: 'Navigation', action: () => { navigate('/reports'); onClose(); } },
      { id: 'nav-admin', label: 'Go to Administration', icon: Shield, category: 'Navigation', action: () => { navigate('/administration'); onClose(); } },
      { id: 'act-cwo', label: 'Create Work Order', icon: Plus, category: 'Actions', action: () => { navigate('/work-orders'); onClose(); } },
      { id: 'act-cnot', label: 'Create Notification', icon: Plus, category: 'Actions', action: () => { navigate('/notifications'); onClose(); } },
      { id: 'act-ceq', label: 'Add Equipment', icon: Plus, category: 'Actions', action: () => { navigate('/equipment'); onClose(); } },
      { id: 'act-cmat', label: 'Add Material', icon: Plus, category: 'Actions', action: () => { navigate('/materials'); onClose(); } },
    ],
    [navigate, onClose]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg overflow-hidden"
        style={{
          background: 'rgba(24, 24, 27, 0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid #27272A',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <Search className="w-4 h-4 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search commands, navigate, or create..."
            className="flex-1 bg-transparent text-primary text-sm outline-none placeholder:text-tertiary"
          />
          <kbd
            className="px-1.5 py-0.5 rounded text-tertiary border border-subtle"
            style={{ fontSize: '10px' }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div
                className="px-4 py-1.5 text-tertiary font-medium"
                style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                {category}
              </div>
              {items.map((item) => {
                const isSelected = globalIndex === selectedIndex;
                const Icon = item.icon;
                const idx = globalIndex++;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all ${
                      isSelected
                        ? 'bg-surface-tertiary text-primary'
                        : 'text-secondary hover:text-primary hover:bg-surface-tertiary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isSelected && <ArrowRight className="w-3 h-3 text-tertiary" />}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-tertiary text-sm">
              No commands found for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-subtle">
          <div className="flex items-center gap-1">
            <ArrowRight className="w-3 h-3 text-tertiary" />
            <span className="text-tertiary" style={{ fontSize: '10px' }}>
              to select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-tertiary" style={{ fontSize: '10px' }}>
              ↑↓ to navigate
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
