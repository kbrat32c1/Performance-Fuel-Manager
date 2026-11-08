/**
 * useHealthKitSync Hook
 *
 * Manages HealthKit data synchronization lifecycle:
 *  - On mount: sync today + yesterday (to catch overnight sleep data)
 *  - On app foreground: re-sync current day
 *  - Exposes sync state and manual trigger for settings UI
 *
 * Only active when running inside Capacitor on iOS.
 * On web (PWA), this hook is a no-op.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import {
  isHealthKitAvailable,
  requestHealthKitAuthorization,
  syncRecentDays,
  loadHealthData,
} from '@/lib/healthkit-service';
import type { DbHealthData } from '@/lib/supabase';

// Local storage key for tracking authorization state
const HK_AUTH_KEY = 'spar_healthkit_authorized';
const HK_LAST_SYNC_KEY = 'spar_healthkit_last_sync';

export interface HealthKitSyncState {
  /** Whether HealthKit is available on this device */
  available: boolean;
  /** Whether the user has authorized HealthKit access */
  authorized: boolean;
  /** Whether a sync is currently in progress */
  syncing: boolean;
  /** Timestamp of last successful sync */
  lastSyncAt: string | null;
  /** Most recent health data rows from Supabase */
  healthData: DbHealthData[];
  /** Number of records synced in the last operation */
  lastSyncCount: number;
  /** Request HealthKit authorization */
  authorize: () => Promise<boolean>;
  /** Manually trigger a sync */
  syncNow: () => Promise<void>;
  /** Reload health data from Supabase (without HealthKit query) */
  refreshData: () => Promise<void>;
}

const HEALTH_UPDATED_EVENT = 'spar-health-data-updated';

export function useHealthKitSync(userId: string | null): HealthKitSyncState {
  const [available] = useState(() => isHealthKitAvailable());
  const [authorized, setAuthorized] = useState(() => {
    try {
      return localStorage.getItem(HK_AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HK_LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [healthData, setHealthData] = useState<DbHealthData[]>([]);
  const [lastSyncCount, setLastSyncCount] = useState(0);
  const syncInProgress = useRef(false);

  // Request authorization
  const authorize = useCallback(async (): Promise<boolean> => {
    if (!available) return false;

    const success = await requestHealthKitAuthorization();
    setAuthorized(success);
    try {
      localStorage.setItem(HK_AUTH_KEY, success ? 'true' : 'false');
    } catch {}
    return success;
  }, [available]);

  // Load health data from Supabase
  const loadData = useCallback(async () => {
    if (!userId) return;
    const data = await loadHealthData(userId, 14);
    setHealthData(data);
  }, [userId]);

  // Several components use this hook. After a sync, tell the others so none keeps old rows.
  const instanceId = useRef(Symbol('health-sync'));
  const refreshData = useCallback(async () => {
    await loadData();
    window.dispatchEvent(new CustomEvent(HEALTH_UPDATED_EVENT, { detail: instanceId.current }));
  }, [loadData]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      if ((e as CustomEvent).detail !== instanceId.current) loadData();
    };
    window.addEventListener(HEALTH_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(HEALTH_UPDATED_EVENT, onUpdated);
  }, [loadData]);

  // Sync from HealthKit → Supabase, then refresh local state
  const syncNow = useCallback(async () => {
    if (!available || !authorized || !userId || syncInProgress.current) return;

    syncInProgress.current = true;
    setSyncing(true);

    try {
      // Sync today and yesterday (yesterday catches overnight sleep data)
      const count = await syncRecentDays(userId, 1);
      setLastSyncCount(count);

      const now = new Date().toISOString();
      setLastSyncAt(now);
      try {
        localStorage.setItem(HK_LAST_SYNC_KEY, now);
      } catch {}

      // Refresh the local health data from Supabase
      await refreshData();
    } catch (error) {
      console.error('[HealthKitSync] Sync failed:', error);
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }, [available, authorized, userId, refreshData]);

  // ── HealthKit auto-sync DISABLED ──
  // V5 band is the primary health data source. HealthKit auto-sync was
  // overwriting V5 data (HRV, sleep stages, etc.) with inferior HealthKit data.
  // We still load health data from Supabase (refreshData) — that works for both sources.
  // If HealthKit sync is ever needed again, uncomment these blocks.

  // Load health data from Supabase on mount (reads V5 or HealthKit rows)
  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId, loadData]);

  return {
    available,
    authorized,
    syncing,
    lastSyncAt,
    healthData,
    lastSyncCount,
    authorize,
    syncNow,
    refreshData,
  };
}
