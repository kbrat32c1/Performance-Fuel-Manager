/**
 * HealthKit Service Layer
 *
 * Abstracts all Apple HealthKit interactions via the custom Capacitor plugin.
 * Handles:
 *  - Platform detection (native vs web)
 *  - HealthKit authorization
 *  - Querying health samples by date
 *  - Computing derived scores (recovery)
 *  - Upserting data to Supabase health_data table
 *
 * Data flow:
 *   V5 Band → JCVital App → Apple Health → This Service → Supabase → Cut Score
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';
import type { DbHealthData } from './supabase';
import { format, subDays } from 'date-fns';

// ═══ CAPACITOR PLUGIN INTERFACE ═══

interface HealthKitPluginInterface {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ authorized: boolean }>;
  queryDayData(options?: { date?: string }): Promise<HealthKitDayResult>;
}

interface HealthKitDayResult {
  date: string;
  hrv?: number;                 // ms (SDNN)
  restingHeartRate?: number;    // bpm
  spo2?: number;                // 0-100 percentage
  bodyTemperature?: number;     // degrees F
  activeEnergy?: number;        // kcal
  stepCount?: number;
  sleepHours?: number;
  sleepScore?: number;          // 0-100
  sleepDeepHours?: number;
  sleepRemHours?: number;
  sleepAwakenings?: number;
}

// Register the native plugin (only resolves on iOS)
const HealthKitNative = registerPlugin<HealthKitPluginInterface>('HealthKit');

// ═══ PUBLIC API ═══

/**
 * Check if HealthKit is available (running in Capacitor on iOS)
 */
export function isHealthKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * Request HealthKit authorization from the user.
 * Returns true if authorization was granted (or already granted).
 */
export async function requestHealthKitAuthorization(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;

  try {
    const { available } = await HealthKitNative.isAvailable();
    if (!available) return false;

    const { authorized } = await HealthKitNative.requestAuthorization();
    return authorized;
  } catch (error) {
    console.error('[HealthKit] Authorization error:', error);
    return false;
  }
}

/**
 * Query HealthKit data for a specific date and return the raw result.
 */
export async function queryHealthKitDay(date?: string): Promise<HealthKitDayResult | null> {
  if (!isHealthKitAvailable()) return null;

  try {
    const result = await HealthKitNative.queryDayData(date ? { date } : undefined);
    return result;
  } catch (error) {
    console.error('[HealthKit] Query error:', error);
    return null;
  }
}

// ═══ RECOVERY SCORE TYPES ═══

export interface RecoveryContribution {
  metric: 'hrv' | 'rhr' | 'sleep' | 'respiratory';
  points: number;
  maxPoints: number;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  status: 'good' | 'neutral' | 'concern';
}

export interface RecoveryResult {
  score: number;
  contributions: RecoveryContribution[];
  recommendation: string;
  /** Whether baselines were used (vs fixed thresholds) */
  personalized: boolean;
}

/**
 * Compute a recovery score from raw health metrics.
 * LEGACY interface — still used by HealthKit sync path.
 * Calls the new algorithm without baselines (fixed thresholds).
 *
 * Scale: 0-100
 *   0-30:  Poor recovery — body under stress
 *   30-60: Moderate — some recovery happening
 *   60-80: Good — well recovered
 *   80-100: Excellent — peak readiness
 */
export function computeRecoveryScore(data: {
  hrv: number | null;
  restingHeartRate: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
}): number {
  const result = computeRecoveryScoreDetailed({
    hrv: data.hrv,
    restingHeartRate: data.restingHeartRate,
    sleepHours: data.sleepHours,
    sleepScore: data.sleepScore,
    respiratoryRate: null,
  });
  return result.score;
}

/**
 * Compute a detailed recovery score with per-metric contributions,
 * trend analysis, and actionable recommendations.
 *
 * When baselines are provided, compares today's metrics to personal
 * 7-day rolling averages (WHOOP-style). Falls back to population-level
 * fixed thresholds when baselines are unavailable.
 *
 * WHOOP-aligned weighting (HRV dominant, sleep secondary):
 *
 * Point allocation (100 total):
 *   HRV:              40 pts (parasympathetic recovery — primary signal)
 *   RHR:              20 pts (cardiovascular stress)
 *   Sleep:            20 pts (duration + quality + efficiency)
 *   Respiratory Rate: 20 pts (very stable metric — any elevation is meaningful)
 *
 * When respiratory rate is unavailable, points redistribute:
 *   HRV: 50, RHR: 25, Sleep: 25
 */
export function computeRecoveryScoreDetailed(data: {
  hrv: number | null;
  restingHeartRate: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
  respiratoryRate?: number | null;
  baselines?: {
    hrv?: { mean: number; stdDev: number } | null;
    restingHeartRate?: { mean: number; stdDev: number } | null;
    sleepScore?: { mean: number; stdDev: number } | null;
    sleepHours?: { mean: number; stdDev: number } | null;
    respiratoryRate?: { mean: number; stdDev: number } | null;
  };
}): RecoveryResult {
  const hasRespiratory = data.respiratoryRate != null;
  const baselines = data.baselines;
  const personalized = baselines != null && (
    baselines.hrv != null || baselines.restingHeartRate != null ||
    baselines.sleepScore != null || baselines.sleepHours != null
  );

  // WHOOP-aligned: HRV is the dominant recovery signal (~50%), sleep is secondary
  const maxHrv = hasRespiratory ? 40 : 50;
  const maxRhr = hasRespiratory ? 20 : 25;
  const maxSleep = hasRespiratory ? 20 : 25;
  const maxResp = hasRespiratory ? 20 : 0;

  const contributions: RecoveryContribution[] = [];

  // ── HRV (higher = better recovery) ──
  const hrvResult = scoreHRV(data.hrv, maxHrv, baselines?.hrv ?? null);
  contributions.push(hrvResult);

  // ── RHR (lower = better for athletes) ──
  const rhrResult = scoreRHR(data.restingHeartRate, maxRhr, baselines?.restingHeartRate ?? null);
  contributions.push(rhrResult);

  // ── Sleep (duration + quality combined) ──
  const sleepResult = scoreSleep(
    data.sleepHours,
    data.sleepScore,
    maxSleep,
    baselines?.sleepHours ?? null,
    baselines?.sleepScore ?? null
  );
  contributions.push(sleepResult);

  // ── Respiratory Rate (lower/stable = good, elevated = concern) ──
  if (hasRespiratory) {
    const respResult = scoreRespiratoryRate(
      data.respiratoryRate!,
      maxResp,
      baselines?.respiratoryRate ?? null
    );
    contributions.push(respResult);
  }

  // Total score
  const totalPoints = contributions.reduce((sum, c) => sum + c.points, 0);
  const totalMax = contributions.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 50;
  const clampedScore = Math.max(0, Math.min(100, score));

  // Diagnostic logging — shows baselines and per-component breakdown
  if (baselines) {
    console.log('[Recovery] Baselines:', JSON.stringify({
      hrv: baselines.hrv, rhr: baselines.restingHeartRate,
      sleep: baselines.sleepHours, quality: baselines.sleepScore,
    }));
  }
  console.log('[Recovery] Components:', contributions.map(c =>
    `${c.metric}: ${c.points}/${c.maxPoints} (${c.status})`
  ).join(', '), `→ ${totalPoints}/${totalMax} = ${clampedScore}%`);

  // Recommendation
  const recommendation = getRecoveryRecommendation(clampedScore);

  return {
    score: clampedScore,
    contributions,
    recommendation,
    personalized,
  };
}

// ═══ METRIC SCORING FUNCTIONS ═══

function scoreHRV(
  value: number | null,
  maxPoints: number,
  baseline: { mean: number; stdDev: number } | null
): RecoveryContribution {
  if (value == null) {
    return { metric: 'hrv', points: maxPoints * 0.5, maxPoints, trend: 'unknown', status: 'neutral' };
  }

  let ratio: number;
  let trend: RecoveryContribution['trend'] = 'unknown';

  if (baseline != null && baseline.stdDev > 0) {
    // WHOOP-style baseline-relative scoring
    // An "average" day (0σ) should yield ~50% recovery, not 60%
    const dev = (value - baseline.mean) / baseline.stdDev;
    // Map deviation to 0-1 ratio: -2σ = 0, 0σ = 0.5, +1σ = 0.75, +2σ = 1.0
    ratio = clamp(0.5 + dev * 0.25, 0, 1);
    trend = dev > 0.5 ? 'up' : dev < -0.5 ? 'down' : 'stable';
  } else {
    // Fixed thresholds for young athletes (wrestlers)
    // Tuned for WHOOP-style last-SWS HRV (lower than all-night average)
    if (value >= 65) ratio = 1.0;
    else if (value >= 50) ratio = 0.75;
    else if (value >= 35) ratio = 0.5;
    else if (value >= 20) ratio = 0.3;
    else ratio = 0.1;
  }

  const points = Math.round(maxPoints * ratio * 10) / 10;
  const status: RecoveryContribution['status'] =
    ratio >= 0.7 ? 'good' : ratio >= 0.45 ? 'neutral' : 'concern';

  return { metric: 'hrv', points, maxPoints, trend, status };
}

function scoreRHR(
  value: number | null,
  maxPoints: number,
  baseline: { mean: number; stdDev: number } | null
): RecoveryContribution {
  if (value == null) {
    return { metric: 'rhr', points: maxPoints * 0.5, maxPoints, trend: 'unknown', status: 'neutral' };
  }

  let ratio: number;
  let trend: RecoveryContribution['trend'] = 'unknown';

  if (baseline != null && baseline.stdDev > 0) {
    // RHR: LOWER is better, so invert the deviation
    // WHOOP-style: average day (0σ) = 50% contribution
    const dev = (value - baseline.mean) / baseline.stdDev;
    // Negative dev (below baseline) is good: -2σ = 1.0, 0σ = 0.5, +2σ = 0
    ratio = clamp(0.5 - dev * 0.25, 0, 1);
    // Trend: for RHR, "up" means worse (elevated), "down" means better (lower)
    trend = dev > 0.5 ? 'up' : dev < -0.5 ? 'down' : 'stable';
  } else {
    // Fixed thresholds for young athletes
    // Tuned for sleep-period RHR (lower than all-day values)
    if (value <= 45) ratio = 1.0;
    else if (value <= 52) ratio = 0.75;
    else if (value <= 60) ratio = 0.5;
    else if (value <= 70) ratio = 0.3;
    else ratio = 0.1;
  }

  const points = Math.round(maxPoints * ratio * 10) / 10;
  const status: RecoveryContribution['status'] =
    ratio >= 0.7 ? 'good' : ratio >= 0.45 ? 'neutral' : 'concern';

  return { metric: 'rhr', points, maxPoints, trend, status };
}

function scoreSleep(
  sleepHours: number | null,
  sleepScore: number | null,
  maxPoints: number,
  hoursBaseline: { mean: number; stdDev: number } | null,
  scoreBaseline: { mean: number; stdDev: number } | null
): RecoveryContribution {
  if (sleepHours == null && sleepScore == null) {
    return { metric: 'sleep', points: maxPoints * 0.5, maxPoints, trend: 'unknown', status: 'neutral' };
  }

  // Split sleep points: 60% duration, 40% quality
  const durationMax = maxPoints * 0.6;
  const qualityMax = maxPoints * 0.4;

  let durationRatio = 0.5;
  let qualityRatio = 0.5;
  let trend: RecoveryContribution['trend'] = 'unknown';

  // Duration scoring
  if (sleepHours != null) {
    if (hoursBaseline != null && hoursBaseline.stdDev > 0) {
      const dev = (sleepHours - hoursBaseline.mean) / hoursBaseline.stdDev;
      // WHOOP-style: average sleep duration = 50% contribution
      durationRatio = clamp(0.5 + dev * 0.25, 0, 1);
      trend = dev > 0.5 ? 'up' : dev < -0.5 ? 'down' : 'stable';
    } else {
      // Fixed: target 8h for wrestlers
      if (sleepHours >= 8.5) durationRatio = 1.0;
      else if (sleepHours >= 7.5) durationRatio = 0.8;
      else if (sleepHours >= 6.5) durationRatio = 0.55;
      else if (sleepHours >= 5.0) durationRatio = 0.3;
      else durationRatio = 0.1;
    }
  }

  // Quality scoring — WHOOP caps this to prevent inflated scores
  // A "good" night (80+) should contribute well but not max out
  if (sleepScore != null) {
    if (scoreBaseline != null && scoreBaseline.stdDev > 0) {
      const dev = (sleepScore - scoreBaseline.mean) / scoreBaseline.stdDev;
      qualityRatio = clamp(0.5 + dev * 0.25, 0, 1);
    } else {
      // Fixed: scale 0-100 but with diminishing returns above 80
      // This prevents a 98 sleep score from dominating recovery
      if (sleepScore >= 90) qualityRatio = 0.85;
      else if (sleepScore >= 80) qualityRatio = 0.75;
      else if (sleepScore >= 65) qualityRatio = 0.55;
      else if (sleepScore >= 50) qualityRatio = 0.35;
      else qualityRatio = 0.15;
    }
  }

  const durationPts = Math.round(durationMax * durationRatio * 10) / 10;
  const qualityPts = Math.round(qualityMax * qualityRatio * 10) / 10;
  const points = durationPts + qualityPts;
  const overallRatio = maxPoints > 0 ? points / maxPoints : 0;
  const status: RecoveryContribution['status'] =
    overallRatio >= 0.7 ? 'good' : overallRatio >= 0.45 ? 'neutral' : 'concern';

  return { metric: 'sleep', points, maxPoints, trend, status };
}

function scoreRespiratoryRate(
  value: number,
  maxPoints: number,
  baseline: { mean: number; stdDev: number } | null
): RecoveryContribution {
  let ratio: number;
  let trend: RecoveryContribution['trend'] = 'unknown';

  if (baseline != null && baseline.stdDev > 0) {
    // Respiratory rate: LOWER/STABLE is better. Any elevation is significant.
    const dev = (value - baseline.mean) / baseline.stdDev;
    // This metric is very stable — even 1σ elevation is meaningful
    ratio = clamp(0.8 - dev * 0.3, 0, 1);
    trend = dev > 0.3 ? 'up' : dev < -0.3 ? 'down' : 'stable';
  } else {
    // Fixed thresholds: normal adult at rest = 12-20 bpm
    if (value <= 14) ratio = 1.0;
    else if (value <= 16) ratio = 0.8;
    else if (value <= 18) ratio = 0.6;
    else if (value <= 20) ratio = 0.4;
    else ratio = 0.15;
  }

  const points = Math.round(maxPoints * ratio * 10) / 10;
  const status: RecoveryContribution['status'] =
    ratio >= 0.7 ? 'good' : ratio >= 0.45 ? 'neutral' : 'concern';

  return { metric: 'respiratory', points, maxPoints, trend, status };
}

// ═══ RECOMMENDATIONS ═══

export function getRecoveryRecommendation(score: number): string {
  if (score >= 80) return 'Your body is recovered. Great day for high-intensity training.';
  if (score >= 60) return 'Moderate recovery. Stick to your plan but listen to your body.';
  if (score >= 40) return 'Recovery is limited. Consider reducing intensity.';
  return 'Your body needs rest. Light movement only.';
}

// ═══ HELPERS ═══

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute a strain score from activity data.
 * Scale: 0-100 for DB storage.
 *
 * If TRIMP-based strain (0-21 scale) is available from continuous HR monitoring,
 * it takes priority. Otherwise falls back to calorie/step-based estimation.
 */
export function computeStrainScore(data: {
  activeEnergy: number | null;
  stepCount: number | null;
  /** TRIMP-based strain from HR monitoring (0-21 WHOOP scale). Takes priority. */
  trimpStrain?: number | null;
}): number | null {
  // If we have TRIMP-based strain from continuous HR monitoring, convert 0-21 → 0-100
  if (data.trimpStrain != null && data.trimpStrain > 0) {
    return Math.max(0, Math.min(100, Math.round((data.trimpStrain / 21) * 100)));
  }

  // Fallback: calorie/step-based estimation (for users without V5 band HR data)
  if (data.activeEnergy == null && data.stepCount == null) return null;

  let score = 30; // Base — light day

  // Active energy burned
  if (data.activeEnergy != null) {
    if (data.activeEnergy >= 800) score = 85;       // Very high intensity
    else if (data.activeEnergy >= 600) score = 70;  // High intensity (hard practice)
    else if (data.activeEnergy >= 400) score = 55;  // Moderate (normal practice)
    else if (data.activeEnergy >= 200) score = 40;  // Light activity
    else score = 25;                                  // Rest day
  }

  // Step count bonus/adjustment
  if (data.stepCount != null) {
    if (data.stepCount >= 15000) score += 5;
    else if (data.stepCount < 3000) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ═══ SUPABASE SYNC ═══

/**
 * Sync a single day's HealthKit data to Supabase.
 * Queries HealthKit, computes derived scores, and upserts to health_data table.
 *
 * IMPORTANT: V5 band data takes priority. If a V5 row already exists for this
 * date, we skip the HealthKit upsert to avoid overwriting richer V5 data
 * (which includes HRV, sleep stages, respiratory rate, etc.).
 */
export async function syncDayToSupabase(
  userId: string,
  date?: string
): Promise<DbHealthData | null> {
  const dayData = await queryHealthKitDay(date);
  if (!dayData) return null;

  // Check if we got any meaningful data
  const hasData = dayData.hrv != null ||
    dayData.restingHeartRate != null ||
    dayData.spo2 != null ||
    dayData.sleepHours != null ||
    dayData.activeEnergy != null ||
    dayData.stepCount != null;

  if (!hasData) return null;

  // ── V5 data protection ──
  // Don't overwrite V5 band data with HealthKit data. V5 is the primary source
  // and includes richer metrics (HRV, sleep stages, etc.).
  const { data: existing } = await supabase
    .from('health_data')
    .select('source')
    .eq('user_id', userId)
    .eq('date', dayData.date)
    .maybeSingle();

  if (existing?.source === 'v5-direct' || existing?.source === 'whoop') {
    console.debug('[HealthKit] Skipping upsert —', existing.source, 'data already exists for', dayData.date);
    return null;
  }

  // Compute derived scores
  const recoveryScore = computeRecoveryScore({
    hrv: dayData.hrv ?? null,
    restingHeartRate: dayData.restingHeartRate ?? null,
    sleepHours: dayData.sleepHours ?? null,
    sleepScore: dayData.sleepScore ?? null,
  });

  const strainScore = computeStrainScore({
    activeEnergy: dayData.activeEnergy ?? null,
    stepCount: dayData.stepCount ?? null,
  });

  const payload = {
    user_id: userId,
    date: dayData.date,
    resting_heart_rate: dayData.restingHeartRate ?? null,
    hrv: dayData.hrv ?? null,
    spo2: dayData.spo2 ?? null,
    sleep_hours: dayData.sleepHours ?? null,
    sleep_score: dayData.sleepScore ?? null,
    body_temperature: dayData.bodyTemperature ?? null,
    active_energy: dayData.activeEnergy ?? null,
    step_count: dayData.stepCount ?? null,
    recovery_score: recoveryScore,
    strain_score: strainScore,
    source: 'healthkit' as const,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('health_data')
    .upsert(payload, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) {
    console.error('[HealthKit] Supabase upsert error:', error);
    return null;
  }

  return data as DbHealthData;
}

/**
 * Sync recent days from HealthKit to Supabase (for backfill).
 * Syncs today + the specified number of previous days.
 */
export async function syncRecentDays(
  userId: string,
  days: number = 1
): Promise<number> {
  let synced = 0;

  for (let i = 0; i <= days; i++) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const result = await syncDayToSupabase(userId, date);
    if (result) synced++;
  }

  return synced;
}

/**
 * Load health data from Supabase for the specified number of days.
 * Used by the store to populate the Cut Score and dashboard.
 */
export async function loadHealthData(
  userId: string,
  days: number = 14
): Promise<DbHealthData[]> {
  const { data, error } = await supabase
    .from('health_data')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('[HealthKit] Load health data error:', error);
    return [];
  }

  return (data as DbHealthData[]) || [];
}

/**
 * Get the most recent health data row for a user.
 */
export async function getLatestHealthData(
  userId: string
): Promise<DbHealthData | null> {
  const rows = await loadHealthData(userId, 1);
  return rows[0] ?? null;
}

/**
 * Get HealthKit authorization status.
 * Returns 'available' if HealthKit is on the device,
 * 'unavailable' if not (web/Android), or 'error' on failure.
 */
export async function getHealthKitStatus(): Promise<'available' | 'unavailable' | 'error'> {
  if (!isHealthKitAvailable()) return 'unavailable';

  try {
    const { available } = await HealthKitNative.isAvailable();
    return available ? 'available' : 'unavailable';
  } catch {
    return 'error';
  }
}
