// ============================================================
// App Layout — Sidebar + Main Content Area
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: '#111113' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar onOpenCommandPalette={handleOpenCommandPalette} />
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden outline-none">
        {children}
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
