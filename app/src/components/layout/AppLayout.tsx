// ============================================================
// App Layout — Sidebar + Main Content Area
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { registerApiActivityHandler } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const IDLE_TIMEOUT_TOAST_ID = 'idle-timeout-warning';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleTimeout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { showWarning, bump } = useIdleTimeout({ onTimeout: handleTimeout });

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

  useEffect(() => registerApiActivityHandler(bump), [bump]);

  useEffect(() => {
    if (!showWarning) {
      toast.dismiss(IDLE_TIMEOUT_TOAST_ID);
      return;
    }

    toast.warning('Your session will expire in 1 minute due to inactivity.', {
      id: IDLE_TIMEOUT_TOAST_ID,
      duration: Infinity,
      action: {
        label: 'Stay signed in',
        onClick: () => bump(),
      },
    });

    return () => {
      toast.dismiss(IDLE_TIMEOUT_TOAST_ID);
    };
  }, [bump, showWarning]);

  return (
    <>
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
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
