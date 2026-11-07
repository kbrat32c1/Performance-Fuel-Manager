/**
 * V5 Band Context Provider
 *
 * Consolidates the V5 band BLE hook into a single global instance.
 * Previously, useV5Band was called 3 separate times (Dashboard outer,
 * Dashboard WhatsNextCard, SettingsDialog), creating 3 independent
 * hook instances — each with its own auto-sync effect, reconnect listeners,
 * and syncInProgress ref. This caused duplicate BLE reads and event loop
 * starvation during sync.
 *
 * Now there's ONE instance, provided via React Context (same pattern as
 * AuthProvider/StoreProvider). All consumers call useV5BandContext().
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { useV5Band, type V5BandState } from '@/hooks/use-v5band';

/** localStorage key for cached RHR baseline (set by recovery-score-card) */
const RHR_CACHE_KEY = 'spar-rhr-baseline';

const V5BandContext = createContext<V5BandState | undefined>(undefined);

export function V5BandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useStore();

  // Read cached resting HR baseline from localStorage.
  // This is written by recovery-score-card.tsx whenever baselines are computed.
  const [rhr, setRhr] = useState<number | null>(() => {
    try {
      const v = parseInt(localStorage.getItem(RHR_CACHE_KEY) || '', 10);
      return v > 0 ? v : null;
    } catch { return null; }
  });

  // Re-read RHR from localStorage periodically in case recovery-score-card updated it.
  // Also listen for a custom event dispatched by recovery-score-card.
  useEffect(() => {
    const readRHR = () => {
      try {
        const v = parseInt(localStorage.getItem(RHR_CACHE_KEY) || '', 10);
        setRhr(prev => (v > 0 && v !== prev) ? v : prev);
      } catch { /* ignore */ }
    };
    window.addEventListener('rhr-baseline-updated', readRHR);
    return () => window.removeEventListener('rhr-baseline-updated', readRHR);
  }, []);

  const v5band = useV5Band(user?.id ?? null, profile?.age, rhr);

  return (
    <V5BandContext.Provider value={v5band}>
      {children}
    </V5BandContext.Provider>
  );
}

export function useV5BandContext(): V5BandState {
  const context = useContext(V5BandContext);
  if (context === undefined) {
    throw new Error('useV5BandContext must be used within a V5BandProvider');
  }
  return context;
}
