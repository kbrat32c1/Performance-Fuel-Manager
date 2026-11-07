/**
 * Strain Service — WHOOP-aligned Heart Rate Reserve strain tracking
 *
 * Computes daily strain from accumulated HR readings using Banister's TRIMP
 * (Training Impulse) with Heart Rate Reserve (HRR) baseline adjustment.
 *
 * TWO KEY DESIGN CHOICES:
 *
 * 1. HRR baseline (Karvonen formula):
 *    pct = (HR - restingHR) / (maxHR - restingHR)
 *    Resting HR → 0% (zero strain). Only HR elevated above personal resting
 *    baseline contributes.
 *
 * 2. Banister's continuous exponential TRIMP (not discrete zone weights):
 *    trimp += minutes × pct × 0.64 × exp(1.92 × pct)
 *    Every HR beat above RHR contributes, but exponentially weighted by
 *    intensity. A reading at 80% HRR weighs ~30× more than at 10% HRR.
 *    This produces WHOOP-aligned scores: rest day ~4-6, hard practice ~15-18.
 *
 * HR zones (30/50/70/80/90% HRR) are tracked for display only; they don't
 * affect the TRIMP calculation.
 *
 * HR data comes from the V5 band's stored continuous HR readings, fetched
 * every ~15 minutes via periodic polling. The band records ~15 readings/minute
 * at 4-second intervals; each reading represents 4 seconds of time.
 */

import { STORAGE_KEYS } from './storage-keys';

// ═══ TYPES ═══

export interface HRReading {
  /** Hour of day (0-23) */
  hour: number;
  /** Heart rate in BPM */
  hr: number;
  /** Index within the hour's readings (for dedup) */
  index: number;
}

export interface HRZoneMinutes {
  zone1: number; // 30-50% HRR — light / elevated
  zone2: number; // 50-70% HRR — moderate / aerobic
  zone3: number; // 70-80% HRR — hard / threshold
  zone4: number; // 80-90% HRR — very hard
  zone5: number; // 90-100% HRR — max effort
}

export interface StrainResult {
  /** WHOOP-style strain score (0-21) */
  score: number;
  /** Raw TRIMP value before mapping to 0-21 */
  rawTRIMP: number;
  /** Time spent in each HR zone */
  zoneMinutes: HRZoneMinutes;
  /** Highest HR observed today */
  peakHR: number;
  /** Average HR across all readings (including sub-zone) */
  avgHR: number;
  /** Total minutes of HR data processed */
  totalHRMinutes: number;
  /** Resting HR used for HRR zone calculation (for debugging) */
  restingHR: number;
  /** ISO timestamp of last computation */
  lastUpdated: string;
}

// ═══ CONSTANTS ═══

/**
 * Zone thresholds as fraction of Heart Rate Reserve (HRR) — for display only.
 * TRIMP calculation uses continuous Banister weighting, not discrete zones.
 * HRR = maxHR - restingHR.  Zone% = (HR - restingHR) / HRR.
 * With RHR=67, maxHR=173, HRR=106:
 *   Zone 1: HR  99-120 (brisk walk / stairs)
 *   Zone 2: HR 120-141 (moderate exercise)
 *   Zone 3: HR 141-152 (hard / threshold)
 *   Zone 4: HR 152-162 (very hard)
 *   Zone 5: HR 162+     (max effort)
 */
const ZONE_THRESHOLDS = [0.30, 0.50, 0.70, 0.80, 0.90, 1.00];

/**
 * Banister TRIMP coefficient for exponential HR weighting (male value).
 * Female coefficient is 1.67 — could be made configurable later.
 * Formula: trimp += minutes × HRR_fraction × 0.64 × exp(b × HRR_fraction)
 *
 * This is continuous: every HR beat above RHR contributes to strain,
 * but exponentially weighted — resting (pct~0.05) contributes almost
 * nothing while threshold effort (pct~0.80) contributes massively.
 */
const BANISTER_B = 1.92;

/**
 * Scaling constant for Banister TRIMP → 0-21 mapping.
 * Tuned for WHOOP-aligned output:
 *   TRIMP ~80   → strain ~3.7 (full rest day)
 *   TRIMP ~120  → strain ~5.4 (light rest, peak ~139 bpm)
 *   TRIMP ~170  → strain ~7.3 (light walk)
 *   TRIMP ~460  → strain ~14.4 (moderate workout)
 *   TRIMP ~870  → strain ~18.6 (hard practice)
 *   TRIMP ~1500 → strain ~20.5 (all out)
 */
const TRIMP_SCALE_K = 400;

/** Each V5 HR reading represents ~4 seconds of time */
const SECONDS_PER_READING = 4;
const MINUTES_PER_READING = SECONDS_PER_READING / 60;

/** Default max HR when no age is available */
const DEFAULT_MAX_HR = 190;

/** localStorage key for observed max HR (auto-calibration) */
const OBSERVED_MAX_HR_KEY = 'spar-observed-max-hr';

// ═══ STRAIN STORAGE KEYS ═══
// Added to STORAGE_KEYS pattern but stored directly since storage-keys.ts
// uses 'pwm-' prefix. We use 'spar-strain-' prefix for strain data.

const strainHRKey = (date: string) => `spar-strain-hr-${date}`;
const strainResultKey = (date: string) => `spar-strain-result-${date}`;

// ═══ PUBLIC API ═══

/**
 * Estimate max HR from age using the standard formula.
 * Auto-calibrates upward if we've observed a higher HR from the band.
 */
export function getMaxHR(age: number | null): number {
  const estimated = age != null ? 220 - age : DEFAULT_MAX_HR;
  const observed = getObservedMaxHR();
  // Cap observed to estimated + 15 bpm — prevents BLE artifacts from inflating maxHR.
  // Real max HR rarely exceeds 220-age by more than 10-15 bpm.
  const cappedObserved = age != null ? Math.min(observed, estimated + 15) : observed;
  return Math.max(estimated, cappedObserved);
}

/**
 * Get the highest HR ever observed from band data.
 * Returns 0 if never observed.
 */
export function getObservedMaxHR(): number {
  try {
    const stored = localStorage.getItem(OBSERVED_MAX_HR_KEY);
    return stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Update observed max HR if the new value is higher.
 * Called during strain computation whenever new HR data arrives.
 */
export function updateObservedMaxHR(hr: number): void {
  const current = getObservedMaxHR();
  if (hr > current && hr < 250) { // sanity check
    try {
      localStorage.setItem(OBSERVED_MAX_HR_KEY, String(hr));
    } catch { /* quota exceeded — ignore */ }
  }
}

/**
 * Compute strain from an array of HR readings using Heart Rate Reserve (HRR).
 *
 * Uses the Karvonen formula for zone classification:
 *   zone% = (HR - restingHR) / (maxHR - restingHR)
 *
 * This ensures resting HR contributes zero strain, matching WHOOP's behavior
 * where a desk day scores ~3-6 instead of 18+.
 *
 * @param readings All HR readings for today (accumulated across fetches)
 * @param maxHR User's max heart rate (from getMaxHR)
 * @param restingHR User's resting HR baseline (from recovery baselines)
 * @returns StrainResult with 0-21 score, zone breakdown, etc.
 */
export function computeStrainFromHR(
  readings: HRReading[],
  maxHR: number,
  restingHR?: number
): StrainResult {
  // Resting HR: use provided value, or estimate as 35% of maxHR (~60 bpm for 173 max)
  const rhr = restingHR ?? Math.round(maxHR * 0.35);
  const hrReserve = maxHR - rhr;

  if (readings.length === 0 || hrReserve <= 0) {
    return {
      score: 0,
      rawTRIMP: 0,
      zoneMinutes: { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 },
      peakHR: 0,
      avgHR: 0,
      totalHRMinutes: 0,
      restingHR: rhr,
      lastUpdated: new Date().toISOString(),
    };
  }

  const zoneMinutes: HRZoneMinutes = {
    zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0,
  };

  let peakHR = 0;
  let totalHR = 0;
  let validReadings = 0;
  let rawTRIMP = 0;

  for (const reading of readings) {
    const hr = reading.hr;
    if (hr < 30 || hr > 250) continue; // invalid reading

    validReadings++;
    totalHR += hr;
    if (hr > peakHR) peakHR = hr;

    // Heart Rate Reserve fraction (Karvonen formula)
    // pct = 0.0 at resting HR, 1.0 at max HR
    const pct = (hr - rhr) / hrReserve;
    if (pct <= 0) continue; // At or below resting — zero strain

    // Banister's continuous TRIMP: exponential weighting by intensity.
    // Every HR beat above RHR contributes, but high-intensity contributes
    // exponentially more. A beat at 80% HRR weighs ~30× more than at 10% HRR.
    rawTRIMP += MINUTES_PER_READING * pct * 0.64 * Math.exp(BANISTER_B * pct);

    // Zone classification for display (separate from TRIMP calculation)
    if (pct < ZONE_THRESHOLDS[0]) {
      // Below 30% HRR — contributes to TRIMP but not in any display zone
    } else if (pct < ZONE_THRESHOLDS[1]) {
      zoneMinutes.zone1 += MINUTES_PER_READING;
    } else if (pct < ZONE_THRESHOLDS[2]) {
      zoneMinutes.zone2 += MINUTES_PER_READING;
    } else if (pct < ZONE_THRESHOLDS[3]) {
      zoneMinutes.zone3 += MINUTES_PER_READING;
    } else if (pct < ZONE_THRESHOLDS[4]) {
      zoneMinutes.zone4 += MINUTES_PER_READING;
    } else {
      zoneMinutes.zone5 += MINUTES_PER_READING;
    }
  }

  // Auto-calibrate max HR upward
  if (peakHR > 0) {
    updateObservedMaxHR(peakHR);
  }

  // Map TRIMP to 0-21 via exponential saturation curve
  const score = rawTRIMP > 0
    ? Math.round(21 * (1 - Math.exp(-rawTRIMP / TRIMP_SCALE_K)) * 10) / 10
    : 0;

  const totalHRMinutes = validReadings * MINUTES_PER_READING;
  const avgHR = validReadings > 0 ? Math.round(totalHR / validReadings) : 0;

  // Round zone minutes to 1 decimal
  zoneMinutes.zone1 = Math.round(zoneMinutes.zone1 * 10) / 10;
  zoneMinutes.zone2 = Math.round(zoneMinutes.zone2 * 10) / 10;
  zoneMinutes.zone3 = Math.round(zoneMinutes.zone3 * 10) / 10;
  zoneMinutes.zone4 = Math.round(zoneMinutes.zone4 * 10) / 10;
  zoneMinutes.zone5 = Math.round(zoneMinutes.zone5 * 10) / 10;

  return {
    score,
    rawTRIMP: Math.round(rawTRIMP * 10) / 10,
    zoneMinutes,
    peakHR,
    avgHR,
    totalHRMinutes: Math.round(totalHRMinutes * 10) / 10,
    restingHR: rhr,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get a descriptive label for a strain score.
 */
export function getStrainLabel(score: number): string {
  if (score >= 18) return 'All Out';
  if (score >= 14) return 'Strenuous';
  if (score >= 10) return 'Moderate';
  if (score >= 7) return 'Light';
  if (score >= 3) return 'Low';
  return 'Minimal';
}

/**
 * Get WHOOP-style color for a strain score.
 */
export function getStrainColor(score: number): string {
  if (score >= 18) return '#dc2626'; // red-600 — all out
  if (score >= 14) return '#ea580c'; // orange-600 — strenuous
  if (score >= 10) return '#d97706'; // amber-600 — moderate
  if (score >= 7) return '#2563eb';  // blue-600 — light
  return '#6b7280';                   // gray-500 — minimal
}

// ═══ ACCUMULATION (DEDUP) ═══

/**
 * Merge new HR readings with existing, deduplicating by (hour, index).
 * This ensures fetching the same hourly block twice doesn't double-count.
 */
export function accumulateHRReadings(
  existing: HRReading[],
  newReadings: HRReading[]
): HRReading[] {
  // Build a set of existing keys for O(1) lookup
  const existingKeys = new Set(
    existing.map(r => `${r.hour}:${r.index}`)
  );

  const merged = [...existing];
  for (const r of newReadings) {
    const key = `${r.hour}:${r.index}`;
    if (!existingKeys.has(key)) {
      merged.push(r);
      existingKeys.add(key);
    }
  }

  return merged;
}

// ═══ HEALTH DAY (WHOOP-STYLE DAY BOUNDARY) ═══

/**
 * WHOOP-style "health day" — the day doesn't roll over at midnight.
 * Instead, it rolls over when the user wakes up (detected by a sync
 * with ≥3 hours of sleep). This prevents after-midnight data from
 * being attributed to the wrong day.
 *
 * How it works:
 * - `spar-health-day` stores the current health day (yyyy-MM-dd).
 * - When syncBandToSupabase detects ≥3h sleep, it calls advanceHealthDay()
 *   which sets the health day to the current calendar date.
 * - Until then, getHealthDay() returns the stored health day.
 * - If no health day is stored (first use), falls back to yesterday (midnight-9AM) or today.
 *
 * Example timeline:
 *   Friday 11 PM: health day = Friday (set by morning sync)
 *   Saturday 12:30 AM: health day = STILL Friday (no wake-up detected)
 *   Saturday 1 AM: mid-sleep sync (1.5h) → still Friday
 *   Saturday 6 AM: morning sync (7h) → health day advances to Saturday
 */
const HEALTH_DAY_KEY = 'spar-health-day';

/** Get the current calendar date as yyyy-MM-dd. */
export function getCalendarDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get the current "health day" — may be yesterday if user hasn't woken up yet.
 * This is the date key used for strain accumulation, sync upserts, etc.
 *
 * Fallback: If the health day is more than 1 calendar day behind (e.g., the user
 * slept <3h or didn't sync at all), auto-advance at 9 AM. This prevents the
 * health day from getting stuck indefinitely.
 */
export function getHealthDay(): string {
  try {
    const stored = localStorage.getItem(HEALTH_DAY_KEY);
    const calendarToday = getCalendarDateKey();

    // If stored health day matches today, use it
    if (stored === calendarToday) return calendarToday;

    // If stored health day is from a previous day, check how far behind we are
    if (stored && stored < calendarToday) {
      // Calculate how many days behind the stored health day is
      const storedDate = new Date(stored + 'T00:00:00');
      const todayDate = new Date(calendarToday + 'T00:00:00');
      const daysBehind = Math.round((todayDate.getTime() - storedDate.getTime()) / (24 * 60 * 60 * 1000));

      // If only 1 day behind (normal case: after midnight but before wake-up)
      if (daysBehind === 1) {
        // Auto-advance at 9 AM if no wake-up detected — prevents getting stuck
        // when user sleeps <3h or skips sync entirely
        const hour = new Date().getHours();
        if (hour >= 9) {
          console.log(`[HealthDay] Auto-advancing at 9 AM — no wake-up detected for ${calendarToday}`);
          localStorage.setItem(HEALTH_DAY_KEY, calendarToday);
          return calendarToday;
        }
        // Before 9 AM: still the previous health day
        return stored;
      }

      // More than 1 day behind — force advance (app wasn't used for a while)
      console.log(`[HealthDay] ${daysBehind} days behind — force advancing to ${calendarToday}`);
      localStorage.setItem(HEALTH_DAY_KEY, calendarToday);
      return calendarToday;
    }

    // No stored value (first use) or future date (clock issue).
    // Between midnight and 9 AM on first use, default to YESTERDAY —
    // the user likely hasn't slept yet, so data belongs to the previous day.
    const hour = new Date().getHours();
    if (hour < 9) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = getCalendarDateKey(yesterday);
      console.log(`[HealthDay] First use before 9 AM — initializing to yesterday (${yesterdayKey})`);
      localStorage.setItem(HEALTH_DAY_KEY, yesterdayKey);
      return yesterdayKey;
    }
    localStorage.setItem(HEALTH_DAY_KEY, calendarToday);
    return calendarToday;
  } catch {
    return getCalendarDateKey();
  }
}

/** Minimum sleep, in hours, for a sync to count as a completed night. */
export const MIN_SLEEP_HOURS_FOR_WAKE_UP = 3;

/**
 * Whether a sync looks like the athlete just woke up: a completed night of sleep
 * reported during a plausible wake-up window (4 AM – 2 PM). Before 4 AM the band
 * still reports the previous night's sleep, so that data is stale.
 */
export function isWakeUpSync(sleepHours: number | null | undefined, hour: number = new Date().getHours()): boolean {
  return (sleepHours ?? 0) >= MIN_SLEEP_HOURS_FOR_WAKE_UP && hour >= 4 && hour < 14;
}

/**
 * Advance the health day to today's calendar date.
 * Called when a sync detects ≥3h of sleep (user woke up → new day).
 */
export function advanceHealthDay(): void {
  try {
    const calendarToday = getCalendarDateKey();
    const previous = localStorage.getItem(HEALTH_DAY_KEY);
    if (previous !== calendarToday) {
      console.log(`[HealthDay] Day rolled over: ${previous} → ${calendarToday}`);
    }
    localStorage.setItem(HEALTH_DAY_KEY, calendarToday);
  } catch { /* ignore */ }
}

// ═══ LOCAL STORAGE PERSISTENCE ═══

/**
 * Get the current health day key for strain/sync date attribution.
 * Alias for getHealthDay() — preserves the familiar API name.
 * @deprecated Use getHealthDay() directly for clarity.
 */
export function getTodayDateKey(): string {
  return getHealthDay();
}

/**
 * Load accumulated HR readings for a date from localStorage.
 */
export function getStoredHRReadings(date: string): HRReading[] {
  try {
    const raw = localStorage.getItem(strainHRKey(date));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Store accumulated HR readings for a date.
 */
export function storeHRReadings(date: string, readings: HRReading[]): void {
  try {
    localStorage.setItem(strainHRKey(date), JSON.stringify(readings));
  } catch { /* quota exceeded — ignore */ }
}

/**
 * Load computed strain result for a date.
 */
export function getStoredStrain(date: string): StrainResult | null {
  try {
    const raw = localStorage.getItem(strainResultKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Store computed strain result for a date.
 */
export function storeStrain(date: string, result: StrainResult): void {
  try {
    localStorage.setItem(strainResultKey(date), JSON.stringify(result));
  } catch { /* quota exceeded — ignore */ }
}

/**
 * Process new HR readings: accumulate, recompute strain, persist both.
 * This is the main entry point called on each v5band:hrUpdate event.
 *
 * @param newReadings New HR readings from the band
 * @param maxHR User's max heart rate
 * @param date Date key (defaults to today)
 * @param restingHR User's resting HR baseline (from recovery baselines)
 * @returns Updated StrainResult
 */
export function processHRUpdate(
  newReadings: HRReading[],
  maxHR: number,
  date?: string,
  restingHR?: number
): StrainResult {
  const dateKey = date ?? getTodayDateKey();

  // Load existing, merge, deduplicate
  const existing = getStoredHRReadings(dateKey);
  const merged = accumulateHRReadings(existing, newReadings);

  // Persist merged readings
  storeHRReadings(dateKey, merged);

  // Recompute strain from full day's data (HRR model)
  const result = computeStrainFromHR(merged, maxHR, restingHR);

  // Persist result
  storeStrain(dateKey, result);

  return result;
}

/**
 * Convert 0-21 strain to 0-100 scale for Supabase storage.
 */
export function strainToPercent(strain21: number): number {
  return Math.round((strain21 / 21) * 100);
}

/**
 * Convert 0-100 stored strain back to 0-21 for display.
 */
export function percentToStrain(percent100: number): number {
  return Math.round(((percent100 / 100) * 21) * 10) / 10;
}

/**
 * Clean up old strain data from localStorage (older than 14 days).
 * Call periodically to prevent storage bloat.
 */
// ═══ STRAIN TARGET (WHOOP-style recovery-based recommendation) ═══

export interface StrainTarget {
  /** Recommended minimum strain */
  min: number;
  /** Recommended maximum strain */
  max: number;
  /** Human-readable label */
  label: string;
  /** Recovery zone: 'red' | 'yellow' | 'green' */
  zone: 'red' | 'yellow' | 'green';
}

/**
 * Compute a recommended daily strain range based on recovery score.
 * This is WHOOP's signature feature: aligning training intensity with readiness.
 *
 * Recovery 0-33%  (red):    rest day, strain 0-8
 * Recovery 34-66% (yellow): moderate training, strain 8-14
 * Recovery 67-100% (green): push it, strain 14-18
 */
export function getStrainTarget(recoveryScore: number | null | undefined): StrainTarget | null {
  if (recoveryScore == null) return null;

  const r = Math.max(0, Math.min(100, recoveryScore));

  if (r <= 33) {
    return { min: 0, max: 8, label: 'Rest day', zone: 'red' };
  }
  if (r <= 66) {
    // Scale within yellow: recovery 34 → target 8-11, recovery 66 → target 11-14
    const t = (r - 33) / 33; // 0-1 within yellow band
    const minStrain = Math.round((8 + t * 3) * 10) / 10;
    const maxStrain = Math.round((11 + t * 3) * 10) / 10;
    return { min: minStrain, max: maxStrain, label: 'Moderate', zone: 'yellow' };
  }
  // Green: recovery 67-100 → target 14-18
  const t = (r - 66) / 34; // 0-1 within green band
  const minStrain = Math.round((14 + t * 2) * 10) / 10;
  const maxStrain = Math.round((16 + t * 2) * 10) / 10;
  return { min: minStrain, max: maxStrain, label: 'Push it', zone: 'green' };
}

/** Version key for strain formula migrations */
const STRAIN_VERSION_KEY = 'spar-strain-version';
/** Current formula version: '8' = v7 + fix hasSyncedToday deadlock (calendar date escape hatch) */
const CURRENT_STRAIN_VERSION = '8';

export function cleanupOldStrainData(): void {
  try {
    // Formula version migration: if the strain formula changed, clear all cached
    // results so they'll be recomputed with the new formula on next HR fetch.
    // HR readings are preserved (they're raw data, formula-independent).
    if (localStorage.getItem(STRAIN_VERSION_KEY) !== CURRENT_STRAIN_VERSION) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('spar-strain-result-')) {
          localStorage.removeItem(key);
        }
      }
      // Clear corrupt observed max HR — v3→v4 migration fixes the 201 artifact
      localStorage.removeItem(OBSERVED_MAX_HR_KEY);
      // Clear stale health day + sync gate — v4→v5 migration
      // Forces re-initialization with the new first-use logic
      // (between midnight-9AM → yesterday, otherwise → today)
      localStorage.removeItem(HEALTH_DAY_KEY);
      localStorage.removeItem('spar_v5_last_sync_date');
      localStorage.setItem(STRAIN_VERSION_KEY, CURRENT_STRAIN_VERSION);
    }

    // Remove old data (>14 days) to prevent storage bloat
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('spar-strain-hr-') || key.startsWith('spar-strain-result-'))) {
        const dateStr = key.replace('spar-strain-hr-', '').replace('spar-strain-result-', '');
        if (dateStr < cutoffKey) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch { /* ignore */ }
}
