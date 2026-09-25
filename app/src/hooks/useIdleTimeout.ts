import { useEffect, useRef, useState, useCallback } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export interface UseIdleTimeoutOptions {
  timeoutMs?: number;
  warningMs?: number;
  onTimeout: () => void;
}

export function useIdleTimeout({
  timeoutMs = 30 * 60 * 1000,
  warningMs = 60 * 1000,
  onTimeout,
}: UseIdleTimeoutOptions) {
  const lastActivityRef = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const bump = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = window.setInterval(() => {
      const last = lastActivityRef.current;
      if (last === null) return;
      const idle = Date.now() - last;
      if (idle >= timeoutMs) onTimeoutRef.current?.();
      else if (idle >= timeoutMs - warningMs) setShowWarning(true);
      else setShowWarning(false);
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
    };
  }, [bump, timeoutMs, warningMs]);

  return { showWarning, bump };
}
