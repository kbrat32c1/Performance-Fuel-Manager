/**
 * useV5Band Hook
 *
 * Manages V5 smart band BLE connection and data sync lifecycle.
 *
 * WHOOP-style always-on BLE:
 *  - On mount: check native status first (may already be connected from background).
 *    If not, try reconnectSaved (no scan needed). Fall back to scan-and-connect.
 *  - On foreground resume: same native-first pattern.
 *  - Listen for native v5band:connected events from background reconnection.
 *  - Auto-sync after every connect.
 *
 * Only active when running inside Capacitor on iOS.
 * On web (PWA), this hook is a no-op.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from '@capacitor/app';
import {
  isV5BandAvailable,
  startScan as scanForBands,
  stopScan as stopBandScan,
  connectBand,
  disconnectBand,
  getConnectionStatus,
  syncBandToSupabase,
  getBatteryLevel,
  getSavedDeviceId,
  getSavedDeviceName,
  clearSavedDevice,
  onDisconnect,
  reconnectSaved,
  onConnect,
  startHRMonitoring,
  stopHRMonitoring,
  fetchRecentHR,
  onHRUpdate,
} from '@/lib/v5band-service';
import type { V5Device } from '@/lib/v5band-service';
import type { StrainResult } from '@/lib/strain-service';
import {
  processHRUpdate,
  computeStrainFromHR,
  getStoredStrain,
  getStoredHRReadings,
  storeStrain,
  getTodayDateKey,
  getHealthDay,
  isWakeUpSync,
  MIN_SLEEP_HOURS_FOR_WAKE_UP,
  getMaxHR,
  cleanupOldStrainData,
  getCalendarDateKey,
} from '@/lib/strain-service';

// Local storage key for last sync time (ISO timestamp — used for UI display)
const V5_LAST_SYNC_KEY = 'spar_v5_last_sync';
// Local storage key for last sync date ('yyyy-MM-dd' — used for once-per-day gate)
const V5_LAST_SYNC_DATE_KEY = 'spar_v5_last_sync_date';

/**
 * Check whether the V5 band has already been synced for the current health day.
 * Uses the health day (WHOOP-style, rolls over on wake-up) — not calendar date.
 */
function hasSyncedToday(): boolean {
  try {
    const lastSyncDate = localStorage.getItem(V5_LAST_SYNC_DATE_KEY);
    const healthDay = getHealthDay();

    if (lastSyncDate === healthDay) {
      // DEADLOCK ESCAPE: If the calendar date has advanced past the gate date,
      // we crossed midnight but the wake-up sync hasn't fired yet (it's what
      // calls advanceHealthDay()). Without this escape, the gate blocks the
      // sync that would advance the health day — a deadlock that keeps the
      // app stuck on yesterday until the 9 AM auto-advance fallback.
      const calendarToday = getCalendarDateKey();
      if (calendarToday > lastSyncDate) {
        console.log(`[useV5Band] Deadlock escape — gate locked for ${lastSyncDate} but calendar is ${calendarToday}. Allowing wake-up sync.`);
        return false;
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * WHOOP-style "complete sleep" gate for auto-sync.
 *
 * WHOOP computes recovery only AFTER detecting the sleep session has ended
 * (i.e., user woke up). It uses continuous on-wrist sensors to detect
 * sleep/wake transitions in real-time.
 *
 * We can't detect wake-up in real-time (V5 band stores data on-device), but
 * we CAN check whether the synced sleep data represents a complete night:
 *
 * - If the app opens mid-sleep (e.g. 1 AM) and syncs, sleep_hours will be
 *   low (e.g. 1.5h) because the night isn't over yet. We do NOT lock the
 *   daily gate — the morning sync will overwrite with the full night's data.
 *
 * - When the user wakes up (e.g. 6 AM) and the app syncs, sleep_hours will
 *   be ≥3h. NOW we lock the daily gate — this is the real data.
 *
 * Threshold: ≥ 3 hours of sleep = "complete night" → lock the gate.
 * 3h is enough to distinguish a real sleep session from a mid-sleep sync
 * (which typically shows 1-2h), while still catching short sleepers.
 * Below 3h, the sync still writes to Supabase (upsert by date), but doesn't
 * prevent a later sync from overwriting with better data.
 *
 * Manual sync (Settings → Sync) always works regardless of the gate.
 */
const MIN_SLEEP_HOURS_FOR_GATE = MIN_SLEEP_HOURS_FOR_WAKE_UP;

export interface V5BandState {
  /** Whether V5 Band BLE is available on this platform */
  available: boolean;
  /** Whether we're actively scanning for bands */
  scanning: boolean;
  /** Discovered V5 bands from last scan */
  devices: V5Device[];
  /** Whether a band is currently connected */
  connected: boolean;
  /** Whether we're in the process of connecting */
  connecting: boolean;
  /** Name of the connected or saved band */
  deviceName: string;
  /** ID of the connected band */
  deviceId: string;
  /** Battery level (0-100) of connected band, or null */
  batteryLevel: number | null;
  /** Whether a data sync is in progress */
  syncing: boolean;
  /** Timestamp of last successful sync */
  lastSyncAt: string | null;
  /** Current day strain from TRIMP computation (0-21 scale) */
  currentStrain: StrainResult | null;
  /** Whether periodic HR monitoring is active */
  hrMonitoringActive: boolean;

  /** Start scanning for V5 bands */
  scan: () => Promise<void>;
  /** Stop scanning */
  stopScan: () => Promise<void>;
  /** Connect to a specific band */
  connect: (deviceId: string) => Promise<boolean>;
  /** Disconnect from current band */
  disconnect: () => Promise<void>;
  /** Sync health data from band → Supabase */
  syncNow: () => Promise<void>;
  /** Refresh connection status */
  refreshStatus: () => Promise<void>;
}

export function useV5Band(userId: string | null, athleteAge?: number | null, restingHR?: number | null): V5BandState {
  // IMPORTANT: Run cleanup/migration SYNCHRONOUSLY during first render (via useState
  // initializer), BEFORE any useEffect fires. This prevents a race condition where
  // auto-sync reads stale health day from localStorage before the migration clears it.
  const [available] = useState(() => {
    cleanupOldStrainData();
    return isV5BandAvailable();
  });
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<V5Device[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState(() => getSavedDeviceName() || '');
  const [deviceId, setDeviceId] = useState(() => getSavedDeviceId() || '');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(V5_LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });

  // Strain tracking state
  const [currentStrain, setCurrentStrain] = useState<StrainResult | null>(() => {
    // Load cached strain from localStorage on mount
    return getStoredStrain(getTodayDateKey());
  });
  const [hrMonitoringActive, setHRMonitoringActive] = useState(false);
  const userAge = useRef<number | null>(athleteAge ?? null);
  // Keep userAge ref in sync when prop changes
  userAge.current = athleteAge ?? null;
  const userRHR = useRef<number | null>(restingHR ?? null);
  // Keep userRHR ref in sync when prop changes
  userRHR.current = restingHR ?? null;
  // Track the current date key for midnight rollover detection
  const strainDateKey = useRef<string>(getTodayDateKey());

  const syncInProgress = useRef(false);
  // Stable ref for syncNow so foreground listener doesn't need it in deps
  const syncNowRef = useRef<(() => Promise<void>) | null>(null);

  // ── Helper: update UI state from a connection result ──
  const applyConnectionState = useCallback(async (name: string, id: string) => {
    setConnected(true);
    if (name) setDeviceName(name);
    if (id) setDeviceId(id);
    try {
      const level = await getBatteryLevel();
      setBatteryLevel(level);
    } catch {}
  }, []);

  // ── Refresh connection status from native layer ──
  const refreshStatus = useCallback(async () => {
    if (!available) return;

    try {
      const status = await getConnectionStatus();
      setConnected(status.connected);
      setConnecting(status.connecting);
      if (status.deviceName) setDeviceName(status.deviceName);
      if (status.deviceId) setDeviceId(status.deviceId);

      if (status.connected) {
        const level = await getBatteryLevel();
        setBatteryLevel(level);
      } else {
        setBatteryLevel(null);
      }
    } catch (error) {
      console.error('[useV5Band] Status refresh error:', error);
    }
  }, [available]);

  // ── Scan for V5 bands ──
  const scan = useCallback(async () => {
    if (!available || scanning) return;

    setScanning(true);
    setDevices([]);

    try {
      const foundDevices = await scanForBands();
      setDevices(foundDevices);
    } catch (error) {
      console.error('[useV5Band] Scan error:', error);
    } finally {
      setScanning(false);
    }
  }, [available, scanning]);

  // ── Stop scan ──
  const stopScan = useCallback(async () => {
    if (!available) return;

    try {
      await stopBandScan();
    } catch (error) {
      console.error('[useV5Band] Stop scan error:', error);
    } finally {
      setScanning(false);
    }
  }, [available]);

  // ── Connect to a specific band ──
  const connect = useCallback(async (targetDeviceId: string): Promise<boolean> => {
    if (!available) return false;

    setConnecting(true);

    try {
      const result = await connectBand(targetDeviceId);
      if (result?.connected) {
        await applyConnectionState(result.deviceName, result.deviceId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[useV5Band] Connect error:', error);
      return false;
    } finally {
      setConnecting(false);
    }
  }, [available, applyConnectionState]);

  // ── Disconnect ──
  const disconnect = useCallback(async () => {
    if (!available) return;

    try {
      await disconnectBand();
      setConnected(false);
      setDeviceName('');
      setDeviceId('');
      setBatteryLevel(null);
    } catch (error) {
      console.error('[useV5Band] Disconnect error:', error);
    }
  }, [available]);

  // ── Sync health data from band → Supabase (75s timeout, 15s buffer over native 60s) ──
  const syncNow = useCallback(async () => {
    if (!available || !connected || !userId || syncInProgress.current) {
      console.log(`[useV5Band] syncNow skipped: available=${available} connected=${connected} userId=${!!userId} inProgress=${syncInProgress.current}`);
      return;
    }

    syncInProgress.current = true;
    setSyncing(true);
    console.log('[useV5Band] syncNow starting...');

    try {
      const result = await Promise.race([
        syncBandToSupabase(userId),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Sync timed out after 75s')), 75000)
        ),
      ]);

      if (result) {
        const now = new Date().toISOString();
        setLastSyncAt(now);
        try {
          localStorage.setItem(V5_LAST_SYNC_KEY, now);

          // WHOOP-style "complete sleep" gate:
          // Only lock the once-per-day gate if sleep_hours ≥ 3h.
          // A mid-sleep sync (e.g. 2:32 AM with 1.5h) won't lock the gate,
          // so the real morning sync (e.g. 7 AM with 7.8h) can still fire.
          //
          // HEALTH DAY ROLLOVER: When ≥3h sleep is detected, advance the health
          // day to today's calendar date. This is WHOOP's approach — the "day"
          // starts when you wake up, not at midnight. Until wake-up, after-midnight
          // data (strain, sync) stays attributed to the previous day.
          const sleepHours = result.sleep_hours ?? 0;
          const currentHour = new Date().getHours();

          // WHOOP-style wake-up detection (shared with syncBandToSupabase, which
          // already rolled the health day over before choosing the row to save):
          //   1. ≥3h of sleep data (complete night), AND
          //   2. a plausible wake-up window (4 AM – 2 PM). Before 4 AM the band
          //      still reports the previous night's sleep, so that data is stale.
          const isPlausibleWakeUp = currentHour >= 4 && currentHour < 14;

          if (isWakeUpSync(sleepHours, currentHour)) {
            // Lock the gate for the day that was actually saved, never a later one.
            const savedHealthDay = result.date;
            localStorage.setItem(V5_LAST_SYNC_DATE_KEY, savedHealthDay);
            console.log(`[useV5Band] Daily gate LOCKED — sleep ${sleepHours.toFixed(1)}h ≥ ${MIN_SLEEP_HOURS_FOR_GATE}h, wake-up hour ${currentHour}, health day: ${savedHealthDay}`);

            // Signal "recovery ready" to dashboard (WHOOP-style morning modal)
            if (result.recovery_score != null) {
              window.dispatchEvent(new CustomEvent('recovery-ready', {
                detail: { score: result.recovery_score, healthDay: savedHealthDay }
              }));
            }
          } else if (sleepHours >= MIN_SLEEP_HOURS_FOR_GATE && !isPlausibleWakeUp) {
            // Stale sleep data (e.g., midnight sync with last night's 7.8h).
            // Do NOT advance health day (correct) and do NOT lock the gate.
            // The gate should only lock after a REAL wake-up sync (4 AM–2 PM).
            // Locking here prevents the critical morning sync from firing,
            // because hasSyncedToday() would see the locked gate and skip.
            // Extra midnight–4AM syncs are harmless (Supabase upserts are idempotent).
            console.log(`[useV5Band] Stale sleep data — sleep ${sleepHours.toFixed(1)}h ≥ ${MIN_SLEEP_HOURS_FOR_GATE}h but hour ${currentHour} outside wake-up window (4-14). Gate NOT locked, health day stays: ${getHealthDay()}`);
          } else {
            console.log(`[useV5Band] Daily gate NOT locked — sleep ${sleepHours.toFixed(1)}h < ${MIN_SLEEP_HOURS_FOR_GATE}h (partial night, will re-sync later), health day: ${getHealthDay()}`);
          }
        } catch {}
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error);
      console.error('[useV5Band] Sync error:', errMsg);
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }, [available, connected, userId]);

  // Keep syncNowRef current so the foreground listener always has the latest closure
  useEffect(() => { syncNowRef.current = syncNow; }, [syncNow]);

  // ══════════════════════════════════════════════════════════════════
  // NATIVE-FIRST AUTO-RECONNECT ON MOUNT
  //
  // Priority order:
  //   1. Check if already connected (from background state restoration)
  //   2. Try reconnectSaved (uses system BLE cache, no scan)
  //   3. Fall back to scan-and-connect
  //
  // This makes app open instant when the band stayed connected in background.
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!available) return;

    const savedId = getSavedDeviceId();
    if (!savedId) return;

    let cancelled = false;

    const autoReconnect = async () => {
      // Step 1: Check if native layer is already connected (background/state restoration)
      try {
        const status = await getConnectionStatus();
        if (cancelled) return;
        if (status.connected) {
          console.log('[useV5Band] Already connected from background — instant load');
          await applyConnectionState(status.deviceName, status.deviceId);
          return;
        }
      } catch {}

      // Step 2: Try reconnectSaved (no scan, uses system BLE cache)
      setConnecting(true);
      const timeout = setTimeout(() => {
        if (!cancelled) {
          console.warn('[useV5Band] Auto-reconnect timed out after 10s');
          setConnecting(false);
        }
      }, 10000);

      try {
        const result = await reconnectSaved();
        if (cancelled) return;
        if (result?.connected) {
          console.log('[useV5Band] reconnectSaved succeeded (no scan needed)');
          await applyConnectionState(result.deviceName, result.deviceId);
          clearTimeout(timeout);
          if (!cancelled) setConnecting(false);
          return;
        }
      } catch {
        // reconnectSaved failed — device not in system cache
      }

      // Step 3: Fallback — scan and connect (original behavior)
      // Note: we keep showing "Connecting..." (not "Scanning...") since the user
      // doesn't care about the internal mechanism — they just want it connected.
      if (cancelled) return;
      try {
        const foundDevices = await scanForBands();
        if (cancelled) return;
        setDevices(foundDevices);

        const savedDevice = foundDevices.find(d => d.deviceId === savedId);
        if (savedDevice) {
          const result = await connectBand(savedId);
          if (cancelled) return;
          if (result?.connected) {
            await applyConnectionState(result.deviceName, result.deviceId);
          }
        }
      } catch (error) {
        console.debug('[useV5Band] Auto-reconnect fallback failed:', error);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setConnecting(false);
        }
      }
    };

    autoReconnect();

    return () => { cancelled = true; };
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen for disconnect events ──
  useEffect(() => {
    if (!available) return;

    let cleanup: (() => void) | null = null;

    const setupListener = async () => {
      cleanup = await onDisconnect((error) => {
        console.warn('[useV5Band] Band disconnected:', error);
        setConnected(false);
        setBatteryLevel(null);
        // Note: we intentionally do NOT clear saved device here.
        // Native layer will auto-reconnect in background (WHOOP-style).
      });
    };

    setupListener();

    return () => {
      cleanup?.();
    };
  }, [available]);

  // ── Listen for native background reconnection events ──
  // When iOS reconnects the band in background, the native plugin fires v5band:connected
  useEffect(() => {
    if (!available) return;

    let cleanup: (() => void) | null = null;

    const setup = async () => {
      cleanup = await onConnect(async (data) => {
        console.log('[useV5Band] Native background reconnect:', data.deviceName);
        await applyConnectionState(data.deviceName, data.deviceId);
      });
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, [available, applyConnectionState]);

  // ── Auto-reconnect when app returns to foreground ──
  // Native-first: check status → reconnectSaved → scan fallback
  const reconnectInProgress = useRef(false);
  useEffect(() => {
    if (!available) return;

    let cleanup: (() => void) | undefined;

    const setupForegroundListener = async () => {
      try {
        const handle = await App.addListener('appStateChange', async (state) => {
          if (!state.isActive) return;
          if (reconnectInProgress.current) return;

          const savedId = getSavedDeviceId();
          if (!savedId) return;

          // Check native connection status first — band may still be connected
          try {
            const status = await getConnectionStatus();
            if (status.connected) {
              setConnected(true);
              if (status.deviceName) setDeviceName(status.deviceName);
              if (status.deviceId) setDeviceId(status.deviceId);
              const level = await getBatteryLevel();
              setBatteryLevel(level);

              // Auto-sync on foreground if not yet synced today (once-per-calendar-day)
              // Gate is only locked after a sync with ≥ 3h sleep (complete night).
              // Mid-sleep syncs (e.g. 2:32 AM with 1.5h) won't lock it, so morning sync still fires.
              try {
                if (!hasSyncedToday() && !syncInProgress.current) {
                  console.log(`[useV5Band] Foreground sync — not yet synced for health day ${getHealthDay()}`);
                  setTimeout(() => {
                    if (!syncInProgress.current && syncNowRef.current) {
                      syncNowRef.current();
                    }
                  }, 1000); // 1s delay to let UI settle after foreground transition
                } else if (!syncInProgress.current) {
                  console.log(`[useV5Band] Skipping auto-sync — already synced for health day ${getHealthDay()}`);
                }
              } catch {}

              return; // Still connected from background — reconnect not needed
            }
          } catch {}

          // Not connected — try fast reconnect without scan
          reconnectInProgress.current = true;
          setConnecting(true);

          const fgTimeout = setTimeout(() => {
            setConnecting(false);
            reconnectInProgress.current = false;
          }, 10000);

          try {
            // Try reconnectSaved first (no scan)
            const result = await reconnectSaved();
            if (result?.connected) {
              await applyConnectionState(result.deviceName, result.deviceId);
              clearTimeout(fgTimeout);
              setConnecting(false);
              reconnectInProgress.current = false;
              return;
            }

            // Fallback: scan then connect
            const foundDevices = await scanForBands();
            const savedDevice = foundDevices.find(d => d.deviceId === savedId);
            if (savedDevice) {
              const connectResult = await connectBand(savedId);
              if (connectResult?.connected) {
                await applyConnectionState(connectResult.deviceName, connectResult.deviceId);
              }
            }
          } catch (error) {
            console.warn('[useV5Band] Foreground reconnect failed:', error);
          } finally {
            clearTimeout(fgTimeout);
            setConnecting(false);
            reconnectInProgress.current = false;
          }
        });
        cleanup = () => handle.remove();
      } catch (error) {
        console.debug('[useV5Band] App listener not available:', error);
      }
    };

    setupForegroundListener();

    return () => {
      cleanup?.();
    };
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-sync after connecting if userId is available ──
  // Debounce by 500ms to avoid spamming sync on rapid connect/disconnect flapping.
  // Once-per-day gate: skip auto-sync if already synced with ≥ 3h sleep today.
  // Mid-sleep syncs (< 3h) won't lock the gate — morning sync will overwrite.
  // (Manual syncNow() always works — this guard is only for the automatic trigger.)
  useEffect(() => {
    if (!connected || !userId || syncing) return;

    // Check if we already synced a complete night today (≥ 3h sleep)
    try {
      if (hasSyncedToday()) {
        console.log(`[useV5Band] Skipping auto-sync — already synced for health day ${getHealthDay()}`);
        return;
      }
    } catch {}

    const timer = setTimeout(() => {
      if (!syncInProgress.current) {
        syncNow();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [connected, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════════════
  // HR MONITORING & STRAIN TRACKING
  //
  // When connected:
  //   1. Start HR monitoring (15-min periodic fetch on native side)
  //   2. Do an initial fetchRecentHR to catch up
  //   3. Listen for v5band:hrUpdate events → accumulate → recompute strain
  // When disconnected:
  //   1. Stop HR monitoring
  //   2. Keep last strain value visible
  // ══════════════════════════════════════════════════════════════════

  // Process incoming HR data into strain
  const processHRData = useCallback((data: { readings: Array<{ hour: number; values: number[] }>; totalReadings: number }) => {
    if (!data.readings || data.readings.length === 0) return;

    // Health day rollover: if the health day has changed (user woke up → advanceHealthDay
    // was called), reset strain for the new day. Unlike midnight rollover, this only
    // triggers when a sync with ≥3h sleep advances the health day.
    const healthDay = getHealthDay();
    if (healthDay !== strainDateKey.current) {
      console.log(`[useV5Band] Health day rollover: ${strainDateKey.current} → ${healthDay}`);
      strainDateKey.current = healthDay;
      setCurrentStrain(null); // Reset for new day
    }

    // Flatten hour-grouped readings into HRReading[]
    const hrReadings = data.readings.flatMap((hourBlock) =>
      hourBlock.values.map((hr, idx) => ({
        hour: hourBlock.hour,
        hr,
        index: idx,
      }))
    );

    if (hrReadings.length === 0) return;

    const ageVal = userAge.current;
    const rhrVal = userRHR.current;
    const maxHR = getMaxHR(ageVal);
    const result = processHRUpdate(hrReadings, maxHR, undefined, rhrVal ?? undefined);
    setCurrentStrain(result);
    console.log(`[useV5Band] Strain updated: ${result.score.toFixed(1)}/21 (${hrReadings.length} new readings, ${result.totalHRMinutes.toFixed(0)} min total, age=${ageVal}, maxHR=${maxHR}, rhr=${rhrVal ?? 'est'}, peakHR=${result.peakHR})`);
  }, []);

  // Start/stop HR monitoring when connection state changes.
  // IMPORTANT: Register the v5band:hrUpdate listener FIRST, then start monitoring,
  // so the listener is ready before any native HR data arrives.
  useEffect(() => {
    if (!available || !connected) {
      // Band disconnected — stop monitoring, keep last strain visible
      if (hrMonitoringActive) {
        stopHRMonitoring().catch(() => {});
        setHRMonitoringActive(false);
      }
      return;
    }

    // Band connected — register listener first, then start monitoring
    let cancelled = false;
    let listenerCleanup: (() => void) | null = null;

    const setupAndStart = async () => {
      // Step 1: Register the HR update event listener BEFORE starting monitoring.
      // This ensures the listener is ready when the native periodic fetch fires.
      try {
        listenerCleanup = await onHRUpdate((data) => {
          if (!cancelled) processHRData(data);
        });
        console.log('[useV5Band] HR update listener registered');
      } catch (err) {
        console.warn('[useV5Band] Failed to register HR listener:', err);
      }

      // Step 2: Start native HR monitoring (15-min timer)
      try {
        await startHRMonitoring();
        if (!cancelled) {
          setHRMonitoringActive(true);
          console.log('[useV5Band] HR monitoring started');
        }
      } catch (err) {
        console.warn('[useV5Band] Failed to start HR monitoring:', err);
      }

      // NOTE: No manual fetchRecentHR() here — the native periodic timer
      // fires ~8s after connect and delivers data via the v5band:hrUpdate
      // event listener we registered above. A redundant JS-initiated fetch
      // would cause processHRData to run twice per cycle.
    };

    // Small delay to let BLE communication settle after connect
    const timer = setTimeout(setupAndStart, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      listenerCleanup?.();
    };
  }, [available, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // On foreground resume — catch up on HR data if connected
  // (This is handled by the existing foreground listener above,
  // but we also want to refresh strain from localStorage on resume
  // in case the native layer updated in background)
  useEffect(() => {
    if (!available) return;

    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        const handle = await App.addListener('appStateChange', async (state) => {
          if (!state.isActive) return;

          // Refresh strain from localStorage (native may have updated in background)
          const cached = getStoredStrain(getTodayDateKey());
          if (cached) setCurrentStrain(cached);

          // If connected, do a catch-up HR fetch
          if (connected && !syncInProgress.current) {
            try {
              const data = await fetchRecentHR();
              if (data) processHRData(data);
            } catch {}
          }
        });
        cleanup = () => handle.remove();
      } catch {}
    };

    setup();

    return () => { cleanup?.(); };
  }, [available, connected, processHRData]);

  // ── Recompute strain when athlete age changes ──
  // Age may become available after the user sets it in Settings (for non-SPAR
  // users who didn't go through SPAR onboarding). When age changes, recompute
  // strain from stored readings so HR zone boundaries use the correct maxHR.
  const prevAge = useRef<number | null | undefined>(athleteAge);
  useEffect(() => {
    // Detect any meaningful age change (undefined→47, null→47, 30→47, etc.)
    if (prevAge.current === athleteAge) return;
    const hadNoAge = prevAge.current == null;
    prevAge.current = athleteAge;

    // Only recompute if age is now set and there's existing strain data
    if (athleteAge == null) return;

    const dateKey = getTodayDateKey();
    const storedReadings = getStoredHRReadings(dateKey);
    if (storedReadings.length === 0) return;

    const newMaxHR = getMaxHR(athleteAge);
    const rhrVal = userRHR.current;
    const result = computeStrainFromHR(storedReadings, newMaxHR, rhrVal ?? undefined);
    storeStrain(dateKey, result);
    setCurrentStrain(result);
    console.log(`[useV5Band] Recomputed strain with age ${athleteAge} → maxHR=${newMaxHR}, rhr=${rhrVal ?? 'est'}: ${result.score.toFixed(1)}/21`);
  }, [athleteAge]);

  // Recompute strain when resting HR baseline changes (e.g., more data collected)
  const prevRHR = useRef<number | null | undefined>(restingHR);
  useEffect(() => {
    if (prevRHR.current === restingHR) return;
    prevRHR.current = restingHR;

    if (restingHR == null) return;

    const dateKey = getTodayDateKey();
    const storedReadings = getStoredHRReadings(dateKey);
    if (storedReadings.length === 0) return;

    const maxHR = getMaxHR(userAge.current);
    const result = computeStrainFromHR(storedReadings, maxHR, restingHR);
    storeStrain(dateKey, result);
    setCurrentStrain(result);
    console.log(`[useV5Band] Recomputed strain with rhr=${restingHR} → maxHR=${maxHR}: ${result.score.toFixed(1)}/21`);
  }, [restingHR]);

  // NOTE: cleanupOldStrainData() was moved to the useState initializer for `available`
  // (top of this hook) so it runs synchronously before any effects fire. This prevents
  // the auto-sync effect from reading stale health day data before migration clears it.

  return {
    available,
    scanning,
    devices,
    connected,
    connecting,
    deviceName,
    deviceId,
    batteryLevel,
    syncing,
    lastSyncAt,
    currentStrain,
    hrMonitoringActive,
    scan,
    stopScan,
    connect,
    disconnect,
    syncNow,
    refreshStatus,
  };
}
