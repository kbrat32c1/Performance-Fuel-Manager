/**
 * Recovery Baselines Service
 *
 * Computes rolling 7-day personal baselines for health metrics.
 * The key insight from WHOOP: compare today's metrics to YOUR baseline,
 * not population averages. An athlete with baseline HRV of 40 who hits 50
 * is actually recovering well, even though 50 is "low" on a fixed scale.
 *
 * Requires ≥3 data points per metric to produce a baseline.
 * Falls back to null (which signals fixed thresholds) if insufficient data.
 */

import type { DbHealthData } from './supabase';

// ═══ TYPES ═══

export interface MetricBaseline {
  /** Rolling average over the baseline window */
  mean: number;
  /** Standard deviation — used to detect meaningful deviations */
  stdDev: number;
  /** Number of data points used */
  count: number;
}

export interface RecoveryBaselines {
  hrv: MetricBaseline | null;
  restingHeartRate: MetricBaseline | null;
  sleepScore: MetricBaseline | null;
  sleepHours: MetricBaseline | null;
  respiratoryRate: MetricBaseline | null;
  skinTemperature: MetricBaseline | null;
}

// Minimum data points required to compute a meaningful baseline
const MIN_DATA_POINTS = 3;

// Number of days to look back for baseline computation
const BASELINE_WINDOW_DAYS = 7;

// ═══ PUBLIC API ═══

/**
 * Compute rolling baselines from recent health data.
 *
 * @param recentData Array of DbHealthData sorted newest-first (from Supabase).
 *                   Should include at least 7-14 days of data.
 * @param todayDate  ISO date string for "today" — excluded from baselines
 *                   so today's data doesn't self-reference.
 * @returns Baselines for each metric, or null if insufficient data.
 */
export function computeBaselines(
  recentData: DbHealthData[],
  todayDate: string
): RecoveryBaselines {
  // Filter out today's data — baselines should only use prior days
  // Also only use data within the baseline window
  const priorDays = recentData.filter(d =>
    d.date !== todayDate && d.date < todayDate
  ).slice(0, BASELINE_WINDOW_DAYS);

  return {
    hrv: computeMetricBaseline(priorDays, d => d.hrv),
    restingHeartRate: computeMetricBaseline(priorDays, d => d.resting_heart_rate),
    sleepScore: computeMetricBaseline(priorDays, d => d.sleep_score),
    sleepHours: computeMetricBaseline(priorDays, d => d.sleep_hours),
    respiratoryRate: computeMetricBaseline(priorDays, d => d.respiratory_rate),
    skinTemperature: computeMetricBaseline(priorDays, d => d.body_temperature),
  };
}

/**
 * Compare a value against its baseline.
 * Returns a z-score-like deviation: positive = above baseline, negative = below.
 * Returns 0 if no baseline available.
 */
export function deviationFromBaseline(
  value: number | null,
  baseline: MetricBaseline | null
): number {
  if (value == null || baseline == null || baseline.stdDev === 0) return 0;
  return (value - baseline.mean) / baseline.stdDev;
}

/**
 * Get a trend direction comparing today's value to baseline.
 */
export function getTrend(
  value: number | null,
  baseline: MetricBaseline | null,
  /** How many SDs count as meaningful change */
  threshold: number = 0.5
): 'up' | 'down' | 'stable' | 'unknown' {
  if (value == null || baseline == null) return 'unknown';
  const dev = deviationFromBaseline(value, baseline);
  if (dev > threshold) return 'up';
  if (dev < -threshold) return 'down';
  return 'stable';
}

// ═══ INTERNALS ═══

function computeMetricBaseline(
  data: DbHealthData[],
  extractor: (d: DbHealthData) => number | null
): MetricBaseline | null {
  const values = data
    .map(extractor)
    .filter((v): v is number => v != null && !isNaN(v));

  if (values.length < MIN_DATA_POINTS) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    count: values.length,
  };
}
