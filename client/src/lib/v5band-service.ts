/**
 * V5 Band Service Layer
 *
 * Abstracts all V5 smart band BLE interactions via the custom Capacitor plugin.
 * Handles:
 *  - Platform detection (native vs web)
 *  - BLE scanning and connection
 *  - Health data sync from band → Supabase
 *  - Computing derived scores (recovery, strain)
 *
 * Data flow:
 *   V5 Band → BLE → V5BandPlugin → This Service → Supabase → Cut Score
 *
 * This is the "direct" path, bypassing the JCVital companion app + HealthKit.
 * The V5 band takes priority over HealthKit when both data sources exist.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';
import type { DbHealthData } from './supabase';
import { computeRecoveryScoreDetailed, computeStrainScore } from './healthkit-service';
import { computeBaselines } from './recovery-baselines';
import { loadHealthData } from './healthkit-service';
import { getStoredStrain, getHealthDay, advanceHealthDay, isWakeUpSync } from './strain-service';

// ═══ CAPACITOR PLUGIN INTERFACE ═══

interface V5BandPluginInterface {
  startScan(): Promise<{ devices: V5Device[] }>;
  stopScan(): Promise<{ stopped: boolean }>;
  connect(options: { deviceId: string }): Promise<{
    connected: boolean;
    deviceName: string;
    deviceId: string;
  }>;
  disconnect(): Promise<{ disconnected: boolean }>;
  getConnectionStatus(): Promise<{
    connected: boolean;
    connecting: boolean;
    deviceName: string;
    deviceId: string;
  }>;
  syncHealthData(): Promise<V5SyncResult>;
  getBatteryLevel(): Promise<{ batteryLevel: number }>;

  // Reconnect to saved device without scanning (uses system BLE cache)
  reconnectSaved(): Promise<{
    connected: boolean;
    alreadyConnected?: boolean;
    deviceName: string;
    deviceId: string;
  }>;

  // HR Monitoring for continuous strain tracking
  fetchRecentHR(): Promise<{
    readings: Array<{ hour: number; values: number[] }>;
    totalReadings: number;
  }>;
  startHRMonitoring(): Promise<{ started: boolean; alreadyActive?: boolean }>;
  stopHRMonitoring(): Promise<{ stopped: boolean }>;

  // Event listener support
  addListener(
    eventName: 'v5band:disconnected',
    listenerFunc: (data: { error: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'v5band:connected',
    listenerFunc: (data: { deviceName: string; deviceId: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'v5band:hrUpdate',
    listenerFunc: (data: { readings: Array<{ hour: number; values: number[] }>; totalReadings: number }) => void
  ): Promise<{ remove: () => void }>;
}

export interface V5Device {
  deviceId: string;
  name: string;
}

export interface V5SyncResult {
  source: 'v5-direct';
  synced_at: string;
  // Raw metrics from band
  resting_heart_rate?: number;
  latest_heart_rate?: number;
  hrv?: number;
  stress_level?: number;
  sleep_hours?: number;
  sleep_score?: number;
  sleep_deep_minutes?: number;
  sleep_light_minutes?: number;
  sleep_rem_minutes?: number;
  sleep_awake_minutes?: number;
  spo2?: number;
  body_temperature?: number;
  skin_temperature_f?: number;
  step_count?: number;
  active_energy?: number;
  distance_meters?: number;
  respiratory_rate?: number;
}

// Register the native plugin (only resolves on iOS)
const V5BandNative = registerPlugin<V5BandPluginInterface>('V5Band');

// Local storage keys
const V5_DEVICE_KEY = 'spar_v5_device_id';
const V5_DEVICE_NAME_KEY = 'spar_v5_device_name';

// ═══ PUBLIC API ═══

/**
 * Check if V5 Band BLE is available (running in Capacitor on iOS)
 */
export function isV5BandAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Start scanning for V5 bands via BLE.
 * Returns after ~10 seconds with all discovered devices.
 */
export async function startScan(): Promise<V5Device[]> {
  if (!isV5BandAvailable()) return [];

  try {
    const { devices } = await V5BandNative.startScan();
    return devices;
  } catch (error) {
    console.error('[V5Band] Scan error:', error);
    return [];
  }
}

/**
 * Stop an active BLE scan.
 */
export async function stopScan(): Promise<void> {
  if (!isV5BandAvailable()) return;

  try {
    await V5BandNative.stopScan();
  } catch (error) {
    console.error('[V5Band] Stop scan error:', error);
  }
}

/**
 * Connect to a specific V5 band by device ID.
 * Saves the device ID for auto-reconnect.
 */
export async function connectBand(deviceId: string): Promise<{
  connected: boolean;
  deviceName: string;
  deviceId: string;
} | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const result = await V5BandNative.connect({ deviceId });

    if (result.connected) {
      // Save for auto-reconnect
      try {
        localStorage.setItem(V5_DEVICE_KEY, result.deviceId);
        localStorage.setItem(V5_DEVICE_NAME_KEY, result.deviceName);
      } catch {}
    }

    return result;
  } catch (error) {
    console.error('[V5Band] Connect error:', error);
    return null;
  }
}

/**
 * Disconnect from the current V5 band.
 */
export async function disconnectBand(): Promise<void> {
  if (!isV5BandAvailable()) return;

  try {
    await V5BandNative.disconnect();
    // Clear saved device
    try {
      localStorage.removeItem(V5_DEVICE_KEY);
      localStorage.removeItem(V5_DEVICE_NAME_KEY);
    } catch {}
  } catch (error) {
    console.error('[V5Band] Disconnect error:', error);
  }
}

/**
 * Get the current connection status.
 */
export async function getConnectionStatus(): Promise<{
  connected: boolean;
  connecting: boolean;
  deviceName: string;
  deviceId: string;
}> {
  if (!isV5BandAvailable()) {
    return { connected: false, connecting: false, deviceName: '', deviceId: '' };
  }

  try {
    return await V5BandNative.getConnectionStatus();
  } catch (error) {
    console.error('[V5Band] Status error:', error);
    return { connected: false, connecting: false, deviceName: '', deviceId: '' };
  }
}

/**
 * Get the saved device ID for auto-reconnect.
 */
export function getSavedDeviceId(): string | null {
  try {
    return localStorage.getItem(V5_DEVICE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the saved device ID and name (e.g. after failed auto-reconnect).
 */
export function clearSavedDevice(): void {
  try {
    localStorage.removeItem(V5_DEVICE_KEY);
    localStorage.removeItem(V5_DEVICE_NAME_KEY);
  } catch {}
}

/**
 * Get the saved device name.
 */
export function getSavedDeviceName(): string | null {
  try {
    return localStorage.getItem(V5_DEVICE_NAME_KEY);
  } catch {
    return null;
  }
}

/**
 * Get the battery level of the connected band.
 */
export async function getBatteryLevel(): Promise<number | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const { batteryLevel } = await V5BandNative.getBatteryLevel();
    // Native may return -1 or 0 when battery level is unknown/not yet read
    if (batteryLevel == null || batteryLevel < 0 || batteryLevel > 100) {
      return null;
    }
    return batteryLevel;
  } catch (error) {
    console.error('[V5Band] Battery error:', error);
    return null;
  }
}

/**
 * Listen for disconnect events.
 */
export async function onDisconnect(
  callback: (error: string) => void
): Promise<(() => void) | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const handle = await V5BandNative.addListener('v5band:disconnected', (data) => {
      callback(data.error);
    });
    return () => handle.remove();
  } catch (error) {
    console.error('[V5Band] Listener error:', error);
    return null;
  }
}

/**
 * Reconnect to the saved device without scanning.
 * Uses the native iOS system BLE cache (retrievePeripheralsWithIdentifiers).
 * Much faster than scan-then-connect — typically <2 seconds.
 */
export async function reconnectSaved(): Promise<{
  connected: boolean;
  alreadyConnected?: boolean;
  deviceName: string;
  deviceId: string;
} | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const result = await V5BandNative.reconnectSaved();

    if (result.connected) {
      // Update localStorage with the device info
      try {
        localStorage.setItem(V5_DEVICE_KEY, result.deviceId);
        localStorage.setItem(V5_DEVICE_NAME_KEY, result.deviceName);
      } catch {}
    }

    return result;
  } catch (error) {
    console.debug('[V5Band] reconnectSaved error:', error);
    return null;
  }
}

// ═══ HR MONITORING (Strain Tracking) ═══

export interface V5HRReadings {
  readings: Array<{ hour: number; values: number[] }>;
  totalReadings: number;
}

/**
 * Fetch recent HR readings from the band (lightweight, ~3-8 sec).
 * Returns stored HR from the last 2 hours grouped by clock hour.
 */
export async function fetchRecentHR(): Promise<V5HRReadings | null> {
  if (!isV5BandAvailable()) return null;

  try {
    return await V5BandNative.fetchRecentHR();
  } catch (error) {
    console.error('[V5Band] fetchRecentHR error:', error);
    return null;
  }
}

/**
 * Start periodic HR monitoring (every 15 minutes).
 * The band records HR continuously; this fetches stored data periodically.
 * Auto-starts on connect, auto-stops on disconnect.
 */
export async function startHRMonitoring(): Promise<boolean> {
  if (!isV5BandAvailable()) return false;

  try {
    const result = await V5BandNative.startHRMonitoring();
    return result.started;
  } catch (error) {
    console.error('[V5Band] startHRMonitoring error:', error);
    return false;
  }
}

/**
 * Stop periodic HR monitoring.
 */
export async function stopHRMonitoring(): Promise<boolean> {
  if (!isV5BandAvailable()) return false;

  try {
    const result = await V5BandNative.stopHRMonitoring();
    return result.stopped;
  } catch (error) {
    console.error('[V5Band] stopHRMonitoring error:', error);
    return false;
  }
}

/**
 * Listen for periodic HR update events (fired every 15 min by the native layer).
 * Use this to accumulate HR readings for strain computation.
 */
export async function onHRUpdate(
  callback: (data: V5HRReadings) => void
): Promise<(() => void) | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const handle = await V5BandNative.addListener('v5band:hrUpdate', callback);
    return () => handle.remove();
  } catch (error) {
    console.error('[V5Band] onHRUpdate listener error:', error);
    return null;
  }
}

/**
 * Listen for native background connection events.
 * Fires when iOS reconnects the band in the background (WHOOP-style).
 */
export async function onConnect(
  callback: (data: { deviceName: string; deviceId: string }) => void
): Promise<(() => void) | null> {
  if (!isV5BandAvailable()) return null;

  try {
    const handle = await V5BandNative.addListener('v5band:connected', callback);
    return () => handle.remove();
  } catch (error) {
    console.error('[V5Band] onConnect listener error:', error);
    return null;
  }
}

// ═══ SYNC TO SUPABASE ═══

/**
 * Sync health data from the connected V5 band to Supabase.
 * Queries all health data types from the band, computes derived scores,
 * and upserts to the health_data table with source='v5-direct'.
 */
export async function syncBandToSupabase(userId: string): Promise<DbHealthData | null> {
  if (!isV5BandAvailable()) return null;

  try {
    // Query all health data from the band
    const bandData = await V5BandNative.syncHealthData();

    // Yield to event loop so React can process tap events during sync
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check if we got any meaningful data
    const hasData = bandData.hrv != null ||
      bandData.resting_heart_rate != null ||
      bandData.spo2 != null ||
      bandData.sleep_hours != null ||
      bandData.step_count != null;

    if (!hasData) {
      console.warn('[V5Band] No health data from band');
      return null;
    }

    // A wake-up sync starts the new health day BEFORE choosing the row, so last
    // night's sleep and recovery land on today instead of overwriting yesterday.
    if (isWakeUpSync(bandData.sleep_hours)) advanceHealthDay();

    // Use the health day (WHOOP-style) — may be yesterday if user hasn't woken up yet.
    // This prevents after-midnight syncs from creating a new day's entry prematurely.
    const today = getHealthDay();

    // Load recent history for baseline-relative recovery scoring
    let baselines = undefined;
    try {
      const recentData = await loadHealthData(userId, 14);

      // Yield to event loop between network calls
      await new Promise(resolve => setTimeout(resolve, 0));

      if (recentData.length >= 3) {
        const computed = computeBaselines(recentData, today);
        baselines = {
          hrv: computed.hrv,
          restingHeartRate: computed.restingHeartRate,
          sleepScore: computed.sleepScore,
          sleepHours: computed.sleepHours,
          respiratoryRate: computed.respiratoryRate,
        };
      }
    } catch (err) {
      console.warn('[V5Band] Could not load baselines, using fixed thresholds:', err);
    }

    // Compute recovery with baseline-relative algorithm
    const recoveryResult = computeRecoveryScoreDetailed({
      hrv: bandData.hrv ?? null,
      restingHeartRate: bandData.resting_heart_rate ?? null,
      sleepHours: bandData.sleep_hours ?? null,
      sleepScore: bandData.sleep_score ?? null,
      respiratoryRate: bandData.respiratory_rate ?? null,
      baselines,
    });

    // Use TRIMP-based strain if available (from continuous HR monitoring),
    // otherwise fall back to calorie/step-based strain
    const storedStrain = getStoredStrain(today);
    const strainScore = computeStrainScore({
      activeEnergy: bandData.active_energy ?? null,
      stepCount: bandData.step_count ?? null,
      trimpStrain: storedStrain?.score ?? null,
    });

    console.log('[V5Band] Recovery:', recoveryResult.score,
      recoveryResult.personalized ? '(personalized)' : '(fixed)',
      recoveryResult.recommendation);

    // Yield before network write so UI stays responsive
    await new Promise(resolve => setTimeout(resolve, 0));

    const payload = {
      user_id: userId,
      date: today,
      resting_heart_rate: bandData.resting_heart_rate ?? null,
      hrv: bandData.hrv ?? null,
      spo2: bandData.spo2 ?? null,
      sleep_hours: bandData.sleep_hours ?? null,
      sleep_score: bandData.sleep_score ?? null,
      sleep_deep_minutes: bandData.sleep_deep_minutes ?? null,
      sleep_light_minutes: bandData.sleep_light_minutes ?? null,
      sleep_rem_minutes: bandData.sleep_rem_minutes ?? null,
      sleep_awake_minutes: bandData.sleep_awake_minutes ?? null,
      // V5 band wrist skin temp — displayed as delta from personal baseline (WHOOP-style),
      // not as absolute value. Stored in body_temperature column for baseline computation.
      body_temperature: bandData.skin_temperature_f ?? null,
      active_energy: bandData.active_energy ?? null,
      step_count: bandData.step_count ?? null,
      // Respiratory rate estimated from sleep HRV via RSA relationship
      respiratory_rate: bandData.respiratory_rate ?? null,
      // HR zone & strain data from TRIMP computation
      peak_hr: storedStrain?.peakHR ?? null,
      avg_hr: storedStrain?.avgHR ?? null,
      hr_zone1_minutes: storedStrain?.zoneMinutes.zone1 ?? null,
      hr_zone2_minutes: storedStrain?.zoneMinutes.zone2 ?? null,
      hr_zone3_minutes: storedStrain?.zoneMinutes.zone3 ?? null,
      hr_zone4_minutes: storedStrain?.zoneMinutes.zone4 ?? null,
      hr_zone5_minutes: storedStrain?.zoneMinutes.zone5 ?? null,
      trimp_score: storedStrain?.rawTRIMP ?? null,
      recovery_score: recoveryResult.score,
      strain_score: strainScore,
      source: 'v5-direct' as const,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('health_data')
      .upsert(payload, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (error) {
      console.error('[V5Band] Supabase upsert error:', error);
      return null;
    }

    console.log('[V5Band] Synced to Supabase:', data);
    return data as DbHealthData;
  } catch (error: unknown) {
    const errMsg = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);
    console.error('[V5Band] Sync error:', errMsg);
    return null;
  }
}
