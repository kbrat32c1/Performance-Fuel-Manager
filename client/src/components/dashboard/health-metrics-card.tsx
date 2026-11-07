/**
 * Health Metrics Card
 *
 * Displays today's wearable health data from the V5 Band on the dashboard.
 * Always shows all 6 metrics (HRV, RHR, Sleep, SpO2, Temp, Steps).
 * When data is missing, shows a dash "—" instead of hiding the metric.
 *
 * Recovery score lives in the dedicated RecoveryScoreCard above.
 * Sleep stage breakdown (deep/light/awake) shown when available.
 *
 * Each metric tile is tappable — opens a full-screen detail sheet
 * with trends, baseline comparison, and educational context.
 */

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Moon, Activity, Thermometer, Footprints, Droplets } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { DbHealthData } from "@/lib/supabase";
import { computeBaselines } from "@/lib/recovery-baselines";
import type { MetricBaseline } from "@/lib/recovery-baselines";
import { MetricDetailSheet } from "./metric-detail-sheet";
import type { MetricKey } from "./metric-detail-sheet";

interface HealthMetricsCardProps {
  healthData: DbHealthData;
  healthHistory?: DbHealthData[];
  isStale?: boolean;
}

/**
 * Compute temperature delta display from baseline (WHOOP-style).
 * Returns { display, color, hasData } for the temp tile.
 */
function getTempDelta(
  currentTemp: number | null,
  baseline: MetricBaseline | null
): { value: string; unit: string; color: string; hasData: boolean; subtext?: string } {
  if (currentTemp == null) {
    return { value: '—', unit: '', color: 'text-muted-foreground/40', hasData: false };
  }

  if (baseline == null) {
    // No baseline yet — show absolute with subtext
    return {
      value: currentTemp.toFixed(1),
      unit: '°F',
      color: 'text-orange-400',
      hasData: true,
      subtext: 'building baseline...',
    };
  }

  // Show delta from baseline mean
  const delta = currentTemp - baseline.mean;
  const absDelta = Math.abs(delta);
  const sign = delta >= 0 ? '+' : '';
  const display = `${sign}${delta.toFixed(1)}`;

  // Color coding: green (normal), yellow (elevated), red (significant)
  let color: string;
  if (absDelta <= 0.5) {
    color = 'text-emerald-400'; // Normal range
  } else if (absDelta <= 1.5) {
    color = 'text-yellow-400'; // Elevated — worth monitoring
  } else {
    color = 'text-red-400'; // Significant — possible illness/overtraining
  }

  return { value: display, unit: '°F', color, hasData: true };
}

/** All 6 metrics always displayed, with dash for missing data */
function buildMetrics(healthData: DbHealthData, tempBaseline: MetricBaseline | null) {
  const temp = getTempDelta(healthData.body_temperature, tempBaseline);

  return [
    {
      key: 'hrv' as MetricKey,
      label: 'HRV',
      icon: <Activity className="w-3.5 h-3.5 text-purple-500" />,
      value: healthData.hrv != null ? `${Math.round(healthData.hrv)}` : '—',
      unit: healthData.hrv != null ? 'ms' : '',
      color: healthData.hrv != null ? 'text-purple-500' : 'text-muted-foreground/40',
      hasData: healthData.hrv != null,
    },
    {
      key: 'rhr' as MetricKey,
      label: 'RHR',
      icon: <Heart className="w-3.5 h-3.5 text-red-400" />,
      value: healthData.resting_heart_rate != null ? `${Math.round(healthData.resting_heart_rate)}` : '—',
      unit: healthData.resting_heart_rate != null ? 'bpm' : '',
      color: healthData.resting_heart_rate != null ? 'text-red-400' : 'text-muted-foreground/40',
      hasData: healthData.resting_heart_rate != null,
    },
    {
      key: 'sleep' as MetricKey,
      label: 'Sleep',
      icon: <Moon className="w-3.5 h-3.5 text-indigo-400" />,
      value: healthData.sleep_hours != null
        ? (() => {
            const h = Math.floor(healthData.sleep_hours!);
            const m = Math.round((healthData.sleep_hours! - h) * 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
          })()
        : healthData.sleep_score != null
          ? `${Math.round(healthData.sleep_score)}`
          : '—',
      unit: healthData.sleep_hours != null ? '' : healthData.sleep_score != null ? '/100' : '',
      color: (healthData.sleep_hours != null || healthData.sleep_score != null) ? 'text-indigo-400' : 'text-muted-foreground/40',
      hasData: healthData.sleep_hours != null || healthData.sleep_score != null,
    },
    {
      key: 'spo2' as MetricKey,
      label: 'SpO2',
      icon: <Droplets className="w-3.5 h-3.5 text-blue-400" />,
      value: healthData.spo2 != null ? `${Math.round(healthData.spo2)}` : '—',
      unit: healthData.spo2 != null ? '%' : '',
      color: healthData.spo2 != null ? 'text-blue-400' : 'text-muted-foreground/40',
      hasData: healthData.spo2 != null,
    },
    {
      key: 'temperature' as MetricKey,
      label: 'Skin Temp',
      icon: <Thermometer className="w-3.5 h-3.5 text-orange-400" />,
      value: temp.value,
      unit: temp.unit,
      color: temp.color,
      hasData: temp.hasData,
      subtext: temp.subtext,
    },
    {
      key: 'steps' as MetricKey,
      label: 'Steps',
      icon: <Footprints className="w-3.5 h-3.5 text-emerald-400" />,
      value: healthData.step_count != null
        ? (healthData.step_count >= 1000
          ? `${(healthData.step_count / 1000).toFixed(1)}k`
          : `${healthData.step_count}`)
        : '—',
      unit: '',
      color: healthData.step_count != null ? 'text-emerald-400' : 'text-muted-foreground/40',
      hasData: healthData.step_count != null,
    },
  ];
}

export function HealthMetricsCard({ healthData, healthHistory, isStale }: HealthMetricsCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  // Compute skin temperature baseline from history (WHOOP-style delta display)
  const tempBaseline = useMemo(() => {
    if (!healthHistory || healthHistory.length < 3) return null;
    const baselines = computeBaselines(healthHistory, healthData.date);
    return baselines.skinTemperature;
  }, [healthHistory, healthData.date]);

  // Sleep stage data available?
  const hasSleepStages = healthData.sleep_deep_minutes != null ||
    healthData.sleep_light_minutes != null ||
    healthData.sleep_rem_minutes != null ||
    healthData.sleep_awake_minutes != null;

  // Always show all 6 metrics
  const metrics = buildMetrics(healthData, tempBaseline);

  return (
    <>
      <Card className="overflow-hidden border-muted/50">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Heart className="w-3.5 h-3.5 text-red-500" />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Health Metrics
              </span>
              {isStale && healthData.date && (
                <span className="text-[10px] text-muted-foreground/60">
                  · {format(parseISO(healthData.date), 'MMM d')}
                </span>
              )}
            </div>
            {healthData.source === 'v5-direct' && (
              <span className="text-[9px] text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded-full">
                V5 Band
              </span>
            )}
          </div>

          {/* Metrics Grid — always 3 columns, always 6 tiles */}
          <div className="grid grid-cols-3 gap-2">
            {metrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key)}
                className={cn(
                  "bg-muted/20 rounded-xl p-2.5 text-left hover:bg-muted/30 active:scale-[0.97] transition-all",
                  !m.hasData && "opacity-60"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {m.icon}
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{m.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-lg font-bold font-mono leading-none", m.color)}>
                    {m.value}
                  </span>
                  {m.unit && (
                    <span className="text-[10px] text-muted-foreground font-medium">{m.unit}</span>
                  )}
                </div>
                {'subtext' in m && m.subtext && (
                  <div className="text-[8px] text-muted-foreground/50 mt-0.5 leading-tight">{m.subtext}</div>
                )}
              </button>
            ))}
          </div>

          {/* Sleep Stage Breakdown */}
          {hasSleepStages && (
            <SleepStageBar
              deep={healthData.sleep_deep_minutes}
              light={healthData.sleep_light_minutes}
              rem={healthData.sleep_rem_minutes}
              awake={healthData.sleep_awake_minutes}
            />
          )}
        </CardContent>
      </Card>

      {/* Metric Detail Sheet — slides up when a tile is tapped */}
      <MetricDetailSheet
        metric={selectedMetric}
        healthHistory={healthHistory ?? []}
        latestHealth={healthData}
        onClose={() => setSelectedMetric(null)}
      />
    </>
  );
}

/**
 * Visual sleep stage breakdown bar (deep/light/rem/awake)
 */
function SleepStageBar({
  deep,
  light,
  rem,
  awake,
}: {
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
}) {
  const deepMin = deep ?? 0;
  const lightMin = light ?? 0;
  const remMin = rem ?? 0;
  const awakeMin = awake ?? 0;
  const total = deepMin + lightMin + remMin + awakeMin;

  if (total === 0) return null;

  const deepPct = (deepMin / total) * 100;
  const lightPct = (lightMin / total) * 100;
  const remPct = (remMin / total) * 100;
  const awakePct = (awakeMin / total) * 100;

  const formatMin = (min: number) => {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${Math.round(min)}m`;
  };

  return (
    <div className="mt-3 pt-3 border-t border-muted/20">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Moon className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Sleep Stages</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
        {deepMin > 0 && (
          <div
            className="bg-indigo-600 transition-all"
            style={{ width: `${deepPct}%` }}
          />
        )}
        {lightMin > 0 && (
          <div
            className="bg-indigo-300 transition-all"
            style={{ width: `${lightPct}%` }}
          />
        )}
        {remMin > 0 && (
          <div
            className="bg-violet-400 transition-all"
            style={{ width: `${remPct}%` }}
          />
        )}
        {awakeMin > 0 && (
          <div
            className="bg-orange-400/60 transition-all"
            style={{ width: `${awakePct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center flex-wrap">
        {deepMin > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="text-[10px] text-muted-foreground font-medium">Deep {formatMin(deepMin)}</span>
          </div>
        )}
        {lightMin > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-indigo-300" />
            <span className="text-[10px] text-muted-foreground font-medium">Light {formatMin(lightMin)}</span>
          </div>
        )}
        {remMin > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-[10px] text-muted-foreground font-medium">REM {formatMin(remMin)}</span>
          </div>
        )}
        {awakeMin > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-400/60" />
            <span className="text-[10px] text-muted-foreground font-medium">Awake {formatMin(awakeMin)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
