/**
 * Metric Detail Sheet
 *
 * Full-screen bottom sheet (WHOOP/Oura style) that slides up when an athlete
 * taps a health metric. Designed for mobile readability:
 *  - Large hero value at top
 *  - Clean 14-day bar chart with labeled axes
 *  - Stats summary (Avg / High / Low)
 *  - Baseline comparison card
 *  - Reference ranges with color coding
 *  - Educational context section
 *
 * Fully scrollable on mobile with safe-area padding.
 * Used by RecoveryScoreCard and HealthMetricsCard.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Activity, Heart, Moon, Wind, Thermometer, Footprints, Flame,
  X, TrendingUp, TrendingDown, Minus, Droplets, ArrowUp, ArrowDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DbHealthData } from "@/lib/supabase";

// ═══ TYPES ═══

export type MetricKey =
  | 'hrv'
  | 'rhr'
  | 'sleep'
  | 'spo2'
  | 'temperature'
  | 'steps'
  | 'recovery'
  | 'strain';

export interface MetricDetailSheetProps {
  metric: MetricKey | null;
  healthHistory: DbHealthData[];
  /** Latest health data — used to show sleep stage breakdown */
  latestHealth?: DbHealthData;
  /** Live override for today's value (e.g., real-time strain from TRIMP).
   *  When provided, replaces the DB value for the most recent data point. */
  liveValue?: number | null;
  onClose: () => void;
}

// ═══ METRIC CONFIGS ═══

const METRIC_CONFIGS: Record<MetricKey, {
  label: string;
  shortLabel: string;
  unit: string;
  icon: React.ReactNode;
  color: string;
  textColor: string;
  bgColor: string;
  barColor: string;
  ringColor: string;
  description: string;
  athleteContext: string;
  goodDirection: 'higher' | 'lower' | 'stable';
  extract: (h: DbHealthData) => number | null;
  formatValue: (v: number) => string;
  ranges: { label: string; color: string; description: string }[];
}> = {
  hrv: {
    label: 'Heart Rate Variability',
    shortLabel: 'HRV',
    unit: 'ms',
    icon: <Activity className="w-6 h-6" />,
    color: 'text-purple-500',
    textColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    barColor: 'bg-purple-500',
    ringColor: 'ring-purple-500/20',
    description: 'HRV measures the variation in time between heartbeats. Higher HRV indicates better parasympathetic (rest & recovery) nervous system activity.',
    athleteContext: 'For wrestlers, good HRV means your body has recovered from training stress and is ready for high-intensity work. A drop below your baseline often signals overtraining, dehydration, or incomplete recovery from weight cutting.',
    goodDirection: 'higher',
    extract: (h) => h.hrv,
    formatValue: (v) => Math.round(v).toString(),
    ranges: [
      { label: '> 80 ms', color: 'bg-green-500', description: 'Excellent recovery — train hard' },
      { label: '50–80 ms', color: 'bg-yellow-500', description: 'Normal range — follow your plan' },
      { label: '< 50 ms', color: 'bg-red-500', description: 'Below average — recovery focus' },
    ],
  },
  rhr: {
    label: 'Resting Heart Rate',
    shortLabel: 'RHR',
    unit: 'bpm',
    icon: <Heart className="w-6 h-6" />,
    color: 'text-red-400',
    textColor: 'text-red-400',
    bgColor: 'bg-red-400/10',
    barColor: 'bg-red-400',
    ringColor: 'ring-red-400/20',
    description: 'Resting heart rate reflects cardiovascular fitness and recovery status. Lower RHR generally means better aerobic conditioning.',
    athleteContext: 'An elevated RHR above your baseline can signal overtraining, dehydration, or stress from weight cutting. Track it first thing in the morning for the most accurate reading.',
    goodDirection: 'lower',
    extract: (h) => h.resting_heart_rate,
    formatValue: (v) => Math.round(v).toString(),
    ranges: [
      { label: '< 55 bpm', color: 'bg-green-500', description: 'Athletic — excellent fitness' },
      { label: '55–70 bpm', color: 'bg-yellow-500', description: 'Good — normal for active athletes' },
      { label: '> 70 bpm', color: 'bg-red-500', description: 'Elevated — stress or fatigue' },
    ],
  },
  sleep: {
    label: 'Sleep Duration',
    shortLabel: 'Sleep',
    unit: 'hrs',
    icon: <Moon className="w-6 h-6" />,
    color: 'text-indigo-400',
    textColor: 'text-indigo-400',
    bgColor: 'bg-indigo-400/10',
    barColor: 'bg-indigo-400',
    ringColor: 'ring-indigo-400/20',
    description: 'Sleep is the most important recovery factor for athletes. During deep sleep, growth hormone is released for muscle repair and tissue recovery.',
    athleteContext: 'Wrestlers cutting weight need 7-9 hours to maintain performance and support healthy weight loss. Poor sleep impairs reaction time, decision-making, and hormone regulation — all critical for competition.',
    goodDirection: 'higher',
    extract: (h) => h.sleep_hours,
    formatValue: (v) => formatHours(v),
    ranges: [
      { label: '> 8 hrs', color: 'bg-green-500', description: 'Optimal for athletic recovery' },
      { label: '6–8 hrs', color: 'bg-yellow-500', description: 'Adequate — aim higher during hard training' },
      { label: '< 6 hrs', color: 'bg-red-500', description: 'Insufficient — prioritize sleep tonight' },
    ],
  },
  spo2: {
    label: 'Blood Oxygen',
    shortLabel: 'SpO2',
    unit: '%',
    icon: <Droplets className="w-6 h-6" />,
    color: 'text-blue-400',
    textColor: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    barColor: 'bg-blue-400',
    ringColor: 'ring-blue-400/20',
    description: 'Blood oxygen saturation measures how well oxygen is carried through your blood to muscles and organs.',
    athleteContext: 'Consistently high SpO2 indicates good respiratory function and oxygen delivery to muscles. A sudden dip may indicate respiratory issues, altitude effects, or sleep apnea.',
    goodDirection: 'higher',
    extract: (h) => h.spo2,
    formatValue: (v) => Math.round(v).toString(),
    ranges: [
      { label: '96–100%', color: 'bg-green-500', description: 'Normal and healthy' },
      { label: '93–95%', color: 'bg-yellow-500', description: 'Slightly low — monitor closely' },
      { label: '< 93%', color: 'bg-red-500', description: 'Concerning — consult a doctor' },
    ],
  },
  temperature: {
    label: 'Skin Temperature',
    shortLabel: 'Skin Temp',
    unit: '°F',
    icon: <Thermometer className="w-6 h-6" />,
    color: 'text-orange-400',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    barColor: 'bg-orange-400',
    ringColor: 'ring-orange-400/20',
    description: 'Wrist skin temperature from the V5 band, displayed as deviation from your 7-day personal baseline. The absolute value is lower than core body temp — what matters is the change from YOUR normal.',
    athleteContext: 'During a weight cut, skin temperature can shift due to metabolic and hydration changes. A sustained rise of +1°F or more above your baseline may signal illness or overtraining — critical to catch early before competition.',
    goodDirection: 'stable',
    extract: (h) => h.body_temperature,
    formatValue: (v) => v.toFixed(1),
    ranges: [
      { label: '± 0.5°F from baseline', color: 'bg-green-500', description: 'Normal daily variation' },
      { label: '± 0.5–1.5°F', color: 'bg-yellow-500', description: 'Elevated — monitor closely' },
      { label: '> ± 1.5°F', color: 'bg-red-500', description: 'Significant — possible illness or overtraining' },
    ],
  },
  steps: {
    label: 'Daily Steps',
    shortLabel: 'Steps',
    unit: '',
    icon: <Footprints className="w-6 h-6" />,
    color: 'text-emerald-400',
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    barColor: 'bg-emerald-400',
    ringColor: 'ring-emerald-400/20',
    description: 'Daily step count tracks your overall activity and non-exercise activity thermogenesis (NEAT).',
    athleteContext: 'For wrestlers during a weight cut, moderate daily activity helps maintain metabolism without excessive energy expenditure. Very high step counts during aggressive cuts can accelerate fatigue.',
    goodDirection: 'higher',
    extract: (h) => h.step_count,
    formatValue: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString(),
    ranges: [
      { label: '> 10,000', color: 'bg-green-500', description: 'Active day — great for metabolism' },
      { label: '5,000–10,000', color: 'bg-yellow-500', description: 'Moderate — solid baseline' },
      { label: '< 5,000', color: 'bg-red-500', description: 'Low activity day' },
    ],
  },
  recovery: {
    label: 'Recovery Score',
    shortLabel: 'Recovery',
    unit: '/ 100',
    icon: <Activity className="w-6 h-6" />,
    color: 'text-green-500',
    textColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
    barColor: 'bg-green-500',
    ringColor: 'ring-green-500/20',
    description: 'Your recovery score combines HRV, resting heart rate, sleep quality, and respiratory rate into a single 0-100 number.',
    athleteContext: 'This score tells you how ready your body is for training today. Scores are personalized to YOUR baselines when enough data is available. Use it to decide training intensity — go hard on green days, recover on red days.',
    goodDirection: 'higher',
    extract: (h) => h.recovery_score,
    formatValue: (v) => Math.round(v).toString(),
    ranges: [
      { label: '80–100', color: 'bg-green-500', description: 'Excellent — go hard today' },
      { label: '60–79', color: 'bg-yellow-500', description: 'Good — follow your plan' },
      { label: '40–59', color: 'bg-orange-500', description: 'Moderate — reduce intensity' },
      { label: '< 40', color: 'bg-red-500', description: 'Low — prioritize rest' },
    ],
  },
  strain: {
    label: 'Day Strain',
    shortLabel: 'Strain',
    unit: '/ 21',
    icon: <Flame className="w-6 h-6" />,
    color: 'text-orange-500',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    barColor: 'bg-orange-500',
    ringColor: 'ring-orange-500/20',
    description: 'Day strain measures the cardiovascular load your body has accumulated throughout the day. It uses the TRIMP (Training Impulse) method, which weights time spent in higher HR zones exponentially more than lower zones.',
    athleteContext: 'Strain tells you how hard your body has worked today. A score of 7-10 is a light day, 14-18 is a hard training day, and 18+ is an all-out effort. Pair this with your recovery score — high recovery days can handle high strain, but pushing strain on low recovery days increases overtraining risk.',
    goodDirection: 'higher',
    extract: (h) => {
      // strain_score is stored as 0-100 in DB; convert to 0-21 for display
      const s = h.strain_score;
      return s != null ? Math.round(((s / 100) * 21) * 10) / 10 : null;
    },
    formatValue: (v) => v.toFixed(1),
    ranges: [
      { label: '18–21', color: 'bg-red-500', description: 'All out — max cardiovascular load' },
      { label: '14–18', color: 'bg-orange-500', description: 'Strenuous — hard practice or competition' },
      { label: '10–14', color: 'bg-amber-500', description: 'Moderate — solid training day' },
      { label: '7–10', color: 'bg-blue-500', description: 'Light — active recovery or easy day' },
      { label: '0–7', color: 'bg-gray-400', description: 'Minimal — rest day or light activity' },
    ],
  },
};

// ═══ MAIN COMPONENT ═══

export function MetricDetailSheet({ metric, healthHistory, latestHealth, liveValue, onClose }: MetricDetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (!metric) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [metric]);

  // Close on escape key
  useEffect(() => {
    if (!metric) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [metric, onClose]);

  // Close on backdrop tap
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!metric) return null;

  const config = METRIC_CONFIGS[metric];

  // Extract data points for this metric from health history
  const dataPoints = healthHistory
    .map((h) => ({
      date: h.date,
      value: config.extract(h),
    }))
    .filter((d): d is { date: string; value: number } => d.value != null)
    .slice(0, 14)
    .reverse(); // oldest → newest for chart

  // Override the most recent data point with the live value when provided.
  // This keeps the chart's latest bar and hero value in sync with the card
  // (e.g., live TRIMP strain vs stale DB snapshot from morning sync).
  if (liveValue != null && dataPoints.length > 0) {
    dataPoints[dataPoints.length - 1] = {
      ...dataPoints[dataPoints.length - 1],
      value: liveValue,
    };
  }

  // Compute stats
  const values = dataPoints.map((d) => d.value);
  const currentValue = values.length > 0 ? values[values.length - 1] : null;
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const high = values.length > 0 ? Math.max(...values) : null;
  const low = values.length > 0 ? Math.min(...values) : null;

  // Trend: compare last value to average
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (currentValue != null && average != null) {
    const diff = currentValue - average;
    const threshold = average * 0.05;
    if (diff > threshold) trend = 'up';
    else if (diff < -threshold) trend = 'down';
  }

  const trendIsGood =
    config.goodDirection === 'higher' ? trend === 'up' :
    config.goodDirection === 'lower' ? trend === 'down' :
    trend === 'stable';

  const trendColor = trendIsGood ? 'text-green-500' : trend === 'stable' ? 'text-muted-foreground' : 'text-orange-500';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[92vh] flex flex-col"
      >
        {/* Sticky header with handle + close */}
        <div className="flex-shrink-0 sticky top-0 bg-background rounded-t-3xl z-10 border-b border-muted/20">
          {/* Drag handle — tappable to close (natural mobile UX) */}
          <button
            onClick={onClose}
            className="w-full flex justify-center pt-3 pb-2 active:opacity-60 transition-opacity"
            aria-label="Close"
          >
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </button>

          {/* Title row + close button */}
          <div className="flex items-center gap-3 px-6 pb-4">
            <div className={cn("w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center", config.bgColor, config.color)}>
              {config.icon}
            </div>
            <h2 className="flex-1 min-w-0 text-base font-bold leading-tight truncate">{config.label}</h2>
            <button
              onClick={onClose}
              className="w-11 h-11 flex-shrink-0 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted active:scale-95 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">

          {/* ── Hero Value ── */}
          <div className="px-6 pt-4 pb-4">
            {currentValue != null ? (
              <div className="flex items-baseline gap-2">
                <span className={cn("text-5xl font-bold font-mono tracking-tight", config.color)}>
                  {config.formatValue(currentValue)}
                </span>
                <span className="text-lg text-muted-foreground font-medium">{config.unit}</span>
                <div className={cn("flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-xs font-semibold",
                  trendIsGood ? "bg-green-500/10 text-green-500" : trend === 'stable' ? "bg-muted/50 text-muted-foreground" : "bg-orange-500/10 text-orange-500"
                )}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  <span>
                    {trend === 'up' ? 'Up' : trend === 'down' ? 'Down' : 'Stable'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-2xl text-muted-foreground">No data available</span>
            )}
          </div>

          {/* ── Trend Chart ── */}
          {dataPoints.length >= 2 && (
            <div className="px-6 pb-4">
              <div className="bg-muted/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dataPoints.length}-Day Trend
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {dataPoints[0].date ? format(parseISO(dataPoints[0].date), 'MMM d') : ''}
                    {' — '}
                    {dataPoints[dataPoints.length - 1].date ? format(parseISO(dataPoints[dataPoints.length - 1].date), 'MMM d') : ''}
                  </span>
                </div>
                <TrendChart
                  dataPoints={dataPoints}
                  barColor={config.barColor}
                  formatValue={config.formatValue}
                  average={average}
                />
              </div>
            </div>
          )}

          {/* ── Stats Row ── */}
          {values.length > 0 && (
            <div className="grid grid-cols-3 gap-3 px-6 pb-4">
              <StatCard label="Average" value={average != null ? config.formatValue(average) : '—'} unit={config.unit} />
              <StatCard label="High" value={high != null ? config.formatValue(high) : '—'} unit={config.unit} icon={<ArrowUp className="w-3 h-3 text-green-500" />} />
              <StatCard label="Low" value={low != null ? config.formatValue(low) : '—'} unit={config.unit} icon={<ArrowDown className="w-3 h-3 text-red-400" />} />
            </div>
          )}

          {/* ── WHOOP-Style Sleep Analytics (Sleep metric only) ── */}
          {metric === 'sleep' && (
            <SleepAnalytics healthHistory={healthHistory} latestHealth={latestHealth} />
          )}

          {/* ── Baseline Comparison ── */}
          {currentValue != null && average != null && (
            <div className="px-6 pb-4">
              <div className={cn("p-4 rounded-2xl border", trendIsGood ? "bg-green-500/5 border-green-500/20" : trend === 'stable' ? "bg-muted/30 border-muted/50" : "bg-orange-500/5 border-orange-500/20")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">vs Your Baseline</span>
                  <div className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                    trendIsGood ? "bg-green-500/10 text-green-500" : trend === 'stable' ? "bg-muted text-muted-foreground" : "bg-orange-500/10 text-orange-500"
                  )}>
                    <TrendIcon className="w-3 h-3" />
                    <span>
                      {(() => {
                        const diff = currentValue - average;
                        const sign = diff > 0 ? '+' : '';
                        return `${sign}${config.formatValue(Math.abs(diff))} ${config.unit}`;
                      })()}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {trendIsGood
                    ? config.goodDirection === 'higher'
                      ? 'Above your personal average — your body is responding well.'
                      : config.goodDirection === 'lower'
                        ? 'Below your personal average — trending in the right direction.'
                        : 'Stable and consistent — this is a good sign.'
                    : config.goodDirection === 'higher'
                      ? 'Below your personal average — consider prioritizing recovery today.'
                      : config.goodDirection === 'lower'
                        ? 'Above your personal average — your body may be under stress.'
                        : 'More variable than usual — keep an eye on this.'}
                </p>
              </div>
            </div>
          )}

          {/* ── Reference Ranges ── */}
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold mb-3">Reference Ranges</h3>
            <div className="space-y-2.5">
              {config.ranges.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("w-3 h-3 rounded-full flex-shrink-0", r.color)} />
                  <div className="flex-1">
                    <span className="text-sm font-bold">{r.label}</span>
                    <span className="text-sm text-muted-foreground ml-2">{r.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── What This Means ── */}
          <div className="px-6 pb-4">
            <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
              <h3 className="text-sm font-semibold mb-2">What This Means</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {config.description}
              </p>
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">For Athletes</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {config.athleteContext}
              </p>
            </div>
          </div>

          {/* Bottom safe area for iOS */}
          <div className="h-12" />

        </div>
      </div>
    </div>
  );
}

// ═══ SUB-COMPONENTS ═══

function TrendChart({
  dataPoints,
  barColor,
  formatValue,
  average,
}: {
  dataPoints: { date: string; value: number }[];
  barColor: string;
  formatValue: (v: number) => string;
  average: number | null;
}) {
  const values = dataPoints.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal;
  // When all values are the same (or nearly), show bars at a uniform height
  const isFlat = range < 0.01;

  return (
    <div>
      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-[100px] relative">
        {/* Average line */}
        {average != null && !isFlat && (
          <>
            <div
              className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/30 z-0"
              style={{
                bottom: `${((average - minVal) / range) * 100}%`,
              }}
            />
            <span
              className="absolute -right-0.5 text-xs text-muted-foreground/50 font-mono z-0"
              style={{
                bottom: `${Math.min(90, Math.max(5, ((average - minVal) / range) * 100))}%`,
              }}
            >
              avg
            </span>
          </>
        )}
        {dataPoints.map((d, i) => {
          // When flat, show all bars at 60% — visible and uniform
          const height = isFlat ? 60 : Math.max(8, ((d.value - minVal) / range) * 100);
          const isLast = i === dataPoints.length - 1;
          return (
            <div key={d.date || i} className="flex-1 flex flex-col items-center gap-1 z-10">
              <span className={cn(
                "text-xs font-mono leading-none",
                isLast ? "text-foreground font-bold" : "text-muted-foreground/50"
              )}>
                {formatValue(d.value)}
              </span>
              <div
                className={cn(
                  "w-full rounded-md transition-all",
                  barColor,
                  isLast ? "opacity-100" : "opacity-50"
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* Date labels */}
      <div className="flex gap-1.5 mt-1.5">
        {dataPoints.map((d, i) => {
          const isLast = i === dataPoints.length - 1;
          return (
            <div
              key={`label-${d.date || i}`}
              className={cn(
                "flex-1 text-center text-xs",
                isLast ? "text-foreground font-bold" : "text-muted-foreground/40"
              )}
            >
              {d.date ? format(parseISO(d.date), 'EEE').charAt(0) : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 rounded-xl p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground/70 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <span className="text-lg font-bold font-mono leading-tight block">
        {value}
        {unit && <span className="text-xs text-muted-foreground font-normal ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

// ═══ WHOOP-STYLE SLEEP ANALYTICS ═══

const formatMin = (min: number) => {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(min)}m`;
};

const formatHours = (hrs: number) => {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

function getSleepScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function getSleepScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function getSleepScoreLabel(score: number): string {
  if (score >= 80) return 'Optimal';
  if (score >= 60) return 'Adequate';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

/**
 * WHOOP-style Sleep Analytics — comprehensive sleep breakdown
 * shown when the user taps the Sleep metric tile.
 *
 * Sections:
 *  1. Sleep Score Ring (WHOOP-style circular gauge)
 *  2. Today's Sleep Stages (stacked horizontal bar + breakdown)
 *  3. Sleep Score Trend (7-day bar chart)
 *  4. Sleep Duration Trend (7-day bar chart with 8hr target)
 *  5. Restorative Sleep (deep + light stacked bars over time)
 *  6. Sleep Efficiency (computed as sleep_time / total_time)
 */
function SleepAnalytics({
  healthHistory,
  latestHealth,
}: {
  healthHistory: DbHealthData[];
  latestHealth?: DbHealthData;
}) {
  // Get up to 7 days with sleep data, oldest→newest
  const sleepDays = healthHistory
    .filter(h => h.sleep_hours != null || h.sleep_score != null)
    .slice(0, 7)
    .reverse();

  const today = latestHealth ?? sleepDays[sleepDays.length - 1];

  if (!today && sleepDays.length === 0) {
    return (
      <div className="px-6 pb-4">
        <div className="bg-muted/20 rounded-2xl p-6 text-center">
          <Moon className="w-8 h-8 text-indigo-400/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No sleep data available yet</p>
        </div>
      </div>
    );
  }

  const deepMin = today?.sleep_deep_minutes ?? 0;
  const lightMin = today?.sleep_light_minutes ?? 0;
  const remMin = today?.sleep_rem_minutes ?? 0;
  const awakeMin = today?.sleep_awake_minutes ?? 0;
  const totalStageMin = deepMin + lightMin + remMin + awakeMin;
  const sleepScore = today?.sleep_score ?? null;
  const sleepHours = today?.sleep_hours ?? null;

  return (
    <div className="space-y-3">

      {/* ── 1. Sleep Score Ring ── */}
      {sleepScore != null && (
        <div className="px-6">
          <div className="bg-muted/20 rounded-2xl p-5 border border-muted/30">
            <div className="flex items-center gap-5">
              {/* Circular gauge */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {/* Background ring */}
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="currentColor"
                    className="text-muted/30"
                    strokeWidth="8"
                  />
                  {/* Score ring */}
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="currentColor"
                    className={getSleepScoreColor(sleepScore)}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(sleepScore / 100) * 264} 264`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-2xl font-bold font-mono", getSleepScoreColor(sleepScore))}>
                    {Math.round(sleepScore)}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Score</span>
                </div>
              </div>

              {/* Score label + time */}
              <div className="flex-1">
                <div className={cn("text-lg font-bold mb-0.5", getSleepScoreColor(sleepScore))}>
                  {getSleepScoreLabel(sleepScore)}
                </div>
                {sleepHours != null && (
                  <p className="text-sm text-muted-foreground">
                    {formatHours(sleepHours)} of sleep
                  </p>
                )}
                {totalStageMin > 0 && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {formatMin(deepMin + lightMin + remMin)} restorative ({Math.round(((deepMin + lightMin + remMin) / totalStageMin) * 100)}%)
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Today's Sleep Stages ── */}
      {totalStageMin > 0 && (
        <div className="px-6">
          <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Moon className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold">Sleep Stages</h3>
              <span className="text-xs text-muted-foreground ml-auto">{formatMin(totalStageMin)} total</span>
            </div>

            {/* Stacked bar */}
            <div className="flex h-5 rounded-full overflow-hidden mb-4">
              {deepMin > 0 && (
                <div className="bg-indigo-600 transition-all" style={{ width: `${(deepMin / totalStageMin) * 100}%` }} />
              )}
              {lightMin > 0 && (
                <div className="bg-indigo-300 transition-all" style={{ width: `${(lightMin / totalStageMin) * 100}%` }} />
              )}
              {remMin > 0 && (
                <div className="bg-violet-400 transition-all" style={{ width: `${(remMin / totalStageMin) * 100}%` }} />
              )}
              {awakeMin > 0 && (
                <div className="bg-orange-400/60 transition-all" style={{ width: `${(awakeMin / totalStageMin) * 100}%` }} />
              )}
            </div>

            {/* Stage details */}
            <div className="space-y-3">
              {[
                { label: 'Deep Sleep', minutes: deepMin, color: 'bg-indigo-600', textColor: 'text-indigo-400',
                  desc: 'Physical recovery & growth hormone' },
                { label: 'Light Sleep', minutes: lightMin, color: 'bg-indigo-300', textColor: 'text-indigo-300',
                  desc: 'Memory consolidation & muscle relaxation' },
                { label: 'REM Sleep', minutes: remMin, color: 'bg-violet-400', textColor: 'text-violet-400',
                  desc: 'Mental recovery, learning & emotional processing' },
                { label: 'Awake', minutes: awakeMin, color: 'bg-orange-400/60', textColor: 'text-orange-400',
                  desc: 'Time awake during sleep period' },
              ].filter(s => s.minutes > 0).map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className={cn("w-3 h-3 rounded-full flex-shrink-0", s.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{s.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-bold font-mono", s.textColor)}>
                          {formatMin(s.minutes)}
                        </span>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {Math.round((s.minutes / totalStageMin) * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Sleep Score Trend (7-day) ── */}
      {sleepDays.filter(d => d.sleep_score != null).length >= 2 && (
        <div className="px-6">
          <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Sleep Score</h3>
              <span className="text-xs text-muted-foreground/60">7-day trend</span>
            </div>
            <div className="flex items-end gap-1.5 h-[80px]">
              {sleepDays.map((d, i) => {
                const score = d.sleep_score ?? 0;
                const isLast = i === sleepDays.length - 1;
                return (
                  <div key={d.date || i} className="flex-1 flex flex-col items-center gap-1">
                    <span className={cn(
                      "text-xs font-mono leading-none",
                      isLast ? "font-bold" : "text-muted-foreground/50",
                      isLast ? getSleepScoreColor(score) : ""
                    )}>
                      {Math.round(score)}
                    </span>
                    <div
                      className={cn(
                        "w-full rounded-md transition-all",
                        isLast ? getSleepScoreBg(score) : getSleepScoreBg(score),
                        isLast ? "opacity-100" : "opacity-40"
                      )}
                      style={{ height: `${Math.max(8, (score / 100) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Day labels */}
            <div className="flex gap-1.5 mt-1.5">
              {sleepDays.map((d, i) => (
                <div key={`score-label-${d.date || i}`} className={cn(
                  "flex-1 text-center text-xs",
                  i === sleepDays.length - 1 ? "text-foreground font-bold" : "text-muted-foreground/40"
                )}>
                  {d.date ? format(parseISO(d.date), 'EEE').charAt(0) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Sleep Duration Trend (7-day with 8hr target) ── */}
      {sleepDays.filter(d => d.sleep_hours != null).length >= 2 && (() => {
        const durationDays = sleepDays.filter(d => d.sleep_hours != null);
        const maxHrs = Math.max(8, ...durationDays.map(d => d.sleep_hours ?? 0));
        return (
          <div className="px-6">
            <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Sleep Duration</h3>
                <span className="text-xs text-muted-foreground/60">8hr target</span>
              </div>
              <div className="flex items-end gap-1.5 h-[80px] relative">
                {/* 8-hour target line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-green-500/30 z-0"
                  style={{ bottom: `${(8 / maxHrs) * 100}%` }}
                />
                <span
                  className="absolute -right-0.5 text-xs text-green-500/40 font-mono z-0"
                  style={{ bottom: `${Math.min(90, (8 / maxHrs) * 100)}%` }}
                >
                  8h
                </span>
                {durationDays.map((d, i) => {
                  const hrs = d.sleep_hours ?? 0;
                  const height = Math.max(8, (hrs / maxHrs) * 100);
                  const isLast = i === durationDays.length - 1;
                  const metGoal = hrs >= 8;
                  return (
                    <div key={d.date || i} className="flex-1 flex flex-col items-center gap-1 z-10">
                      <span className={cn(
                        "text-xs font-mono leading-none",
                        isLast ? "text-foreground font-bold" : "text-muted-foreground/50"
                      )}>
                        {formatHours(hrs)}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-md transition-all",
                          metGoal ? "bg-green-500" : "bg-indigo-400",
                          isLast ? "opacity-100" : "opacity-40"
                        )}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Day labels */}
              <div className="flex gap-1.5 mt-1.5">
                {durationDays.map((d, i) => (
                  <div key={`dur-label-${d.date || i}`} className={cn(
                    "flex-1 text-center text-xs",
                    i === durationDays.length - 1 ? "text-foreground font-bold" : "text-muted-foreground/40"
                  )}>
                    {d.date ? format(parseISO(d.date), 'EEE').charAt(0) : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 5. Restorative Sleep (Deep + Light + REM stacked) ── */}
      {sleepDays.filter(d => (d.sleep_deep_minutes ?? 0) + (d.sleep_light_minutes ?? 0) + (d.sleep_rem_minutes ?? 0) > 0).length >= 2 && (() => {
        const restDays = sleepDays.filter(d => (d.sleep_deep_minutes ?? 0) + (d.sleep_light_minutes ?? 0) + (d.sleep_rem_minutes ?? 0) > 0);
        const maxRestorative = Math.max(...restDays.map(d => (d.sleep_deep_minutes ?? 0) + (d.sleep_light_minutes ?? 0) + (d.sleep_rem_minutes ?? 0)));
        const avgRestorative = restDays.reduce((sum, d) => sum + (d.sleep_deep_minutes ?? 0) + (d.sleep_light_minutes ?? 0) + (d.sleep_rem_minutes ?? 0), 0) / restDays.length;
        return (
          <div className="px-6">
            <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">Restorative Sleep</h3>
                <span className="text-xs text-muted-foreground/60">Deep + Light + REM</span>
              </div>
              <p className="text-xs text-muted-foreground/60 mb-3">
                Avg {formatMin(avgRestorative)} per night
              </p>
              <div className="flex items-end gap-1.5 h-[80px]">
                {restDays.map((d, i) => {
                  const deep = d.sleep_deep_minutes ?? 0;
                  const light = d.sleep_light_minutes ?? 0;
                  const rem = d.sleep_rem_minutes ?? 0;
                  const total = deep + light + rem;
                  const totalHeight = Math.max(8, (total / maxRestorative) * 100);
                  const deepPct = total > 0 ? (deep / total) * 100 : 0;
                  const remPct = total > 0 ? (rem / total) * 100 : 0;
                  const isLast = i === restDays.length - 1;
                  return (
                    <div key={d.date || i} className="flex-1 flex flex-col items-center gap-1">
                      <span className={cn(
                        "text-xs font-mono leading-none",
                        isLast ? "text-foreground font-bold" : "text-muted-foreground/50"
                      )}>
                        {formatMin(total)}
                      </span>
                      <div
                        className={cn("w-full rounded-md overflow-hidden flex flex-col-reverse transition-all", isLast ? "opacity-100" : "opacity-40")}
                        style={{ height: `${totalHeight}%` }}
                      >
                        <div className="bg-indigo-600 w-full" style={{ height: `${deepPct}%` }} />
                        <div className="bg-violet-400 w-full" style={{ height: `${remPct}%` }} />
                        <div className="bg-indigo-300 w-full flex-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Day labels */}
              <div className="flex gap-1.5 mt-1.5">
                {restDays.map((d, i) => (
                  <div key={`rest-label-${d.date || i}`} className={cn(
                    "flex-1 text-center text-xs",
                    i === restDays.length - 1 ? "text-foreground font-bold" : "text-muted-foreground/40"
                  )}>
                    {d.date ? format(parseISO(d.date), 'EEE').charAt(0) : ''}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <span className="text-xs text-muted-foreground">Deep</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-300" />
                  <span className="text-xs text-muted-foreground">Light</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                  <span className="text-xs text-muted-foreground">REM</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 6. Sleep Efficiency ── */}
      {totalStageMin > 0 && sleepHours != null && (() => {
        // Efficiency = actual sleep time / total time in bed
        // total time in bed = deep + light + rem + awake
        // actual sleep time = deep + light + rem
        const actualSleepMin = deepMin + lightMin + remMin;
        const efficiency = Math.round((actualSleepMin / totalStageMin) * 100);
        const effColor = efficiency >= 85 ? 'text-green-500' : efficiency >= 70 ? 'text-yellow-500' : 'text-red-400';
        const effBg = efficiency >= 85 ? 'bg-green-500' : efficiency >= 70 ? 'bg-yellow-500' : 'bg-red-400';
        const effLabel = efficiency >= 85 ? 'Excellent' : efficiency >= 70 ? 'Good' : 'Needs Work';

        return (
          <div className="px-6">
            <div className="bg-muted/20 rounded-2xl p-4 border border-muted/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Sleep Efficiency</h3>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", effColor,
                  efficiency >= 85 ? "bg-green-500/10" : efficiency >= 70 ? "bg-yellow-500/10" : "bg-red-400/10"
                )}>
                  {effLabel}
                </span>
              </div>

              {/* Efficiency bar */}
              <div className="flex items-center gap-3 mb-3">
                <span className={cn("text-3xl font-bold font-mono", effColor)}>{efficiency}%</span>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", effBg)} style={{ width: `${efficiency}%` }} />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/70">
                Of your {formatMin(totalStageMin)} in bed, {formatMin(actualSleepMin)} was actual sleep.
                {efficiency >= 85
                  ? ' Great — you fell asleep quickly with minimal wake time.'
                  : efficiency >= 70
                    ? ' Decent, but some restlessness. Try limiting screen time before bed.'
                    : ' Significant awake time detected. Consider your sleep environment.'}
              </p>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
