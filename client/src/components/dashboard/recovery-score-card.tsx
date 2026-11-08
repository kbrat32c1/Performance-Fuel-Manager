/**
 * Recovery Score Card
 *
 * Prominent dashboard component showing the athlete's recovery score (0-100)
 * with a color-coded gauge, per-metric contributions, trend indicators,
 * a 7-day mini history, and actionable recommendations.
 *
 * This is the first thing the athlete sees on the dashboard — like WHOOP's
 * Recovery screen. It answers: "How recovered am I? Should I train hard today?"
 */

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Heart, Moon, Wind, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DbHealthData } from "@/lib/supabase";
import { computeRecoveryScoreDetailed } from "@/lib/healthkit-service";
import type { RecoveryResult, RecoveryContribution } from "@/lib/healthkit-service";
import { computeBaselines } from "@/lib/recovery-baselines";
import { withDisplayRecovery, isWhoopDay } from "@/lib/recovery-display";
import { MetricDetailSheet } from "./metric-detail-sheet";
import type { MetricKey } from "./metric-detail-sheet";

interface RecoveryScoreCardProps {
  /** Today's (or latest) health data */
  latestHealth: DbHealthData;
  /** Recent 14 days of health data for baselines + mini chart */
  healthHistory: DbHealthData[];
  /** Whether the data is from a previous day */
  isStale?: boolean;
}

// Map recovery contribution metric keys → MetricDetailSheet keys
const CONTRIBUTION_TO_METRIC: Record<RecoveryContribution['metric'], MetricKey> = {
  hrv: 'hrv',
  rhr: 'rhr',
  sleep: 'sleep',
  respiratory: 'spo2', // respiratory rate maps to closest available
};

export function RecoveryScoreCard({ latestHealth, healthHistory, isStale }: RecoveryScoreCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  // Memoize baselines + recovery to avoid recomputing (and logging) on every render
  const { recovery, baselines } = useMemo(() => {
    const baselines = computeBaselines(healthHistory, latestHealth.date);

    // Cache the RHR baseline for strain computation (used by V5BandProvider).
    // This avoids the strain service needing its own Supabase query.
    if (baselines.restingHeartRate?.mean) {
      const rhrStr = String(Math.round(baselines.restingHeartRate.mean));
      try {
        const prev = localStorage.getItem('spar-rhr-baseline');
        if (prev !== rhrStr) {
          localStorage.setItem('spar-rhr-baseline', rhrStr);
          window.dispatchEvent(new Event('rhr-baseline-updated'));
        }
      } catch { /* quota exceeded — ignore */ }
    }

    const recovery: RecoveryResult = computeRecoveryScoreDetailed({
      hrv: latestHealth.hrv,
      restingHeartRate: latestHealth.resting_heart_rate,
      sleepHours: latestHealth.sleep_hours,
      sleepScore: latestHealth.sleep_score,
      respiratoryRate: latestHealth.respiratory_rate,
      baselines: {
        hrv: baselines.hrv,
        restingHeartRate: baselines.restingHeartRate,
        sleepScore: baselines.sleepScore,
        sleepHours: baselines.sleepHours,
        respiratoryRate: baselines.respiratoryRate,
      },
    });
    return { recovery, baselines };
  }, [latestHealth, healthHistory]);

  // Today's reading next to the athlete's usual, so the points explain themselves.
  const fmt = (v: number | null | undefined, digits = 0) => (v == null ? null : v.toFixed(digits));
  const readings: Record<RecoveryContribution['metric'], string | null> = {
    hrv: fmt(latestHealth.hrv) && `${fmt(latestHealth.hrv)} ms${baselines.hrv ? ` · usual ${fmt(baselines.hrv.mean)}` : ''}`,
    rhr: fmt(latestHealth.resting_heart_rate) && `${fmt(latestHealth.resting_heart_rate)} bpm${baselines.restingHeartRate ? ` · usual ${fmt(baselines.restingHeartRate.mean)}` : ''}`,
    sleep: fmt(latestHealth.sleep_hours, 1) && `${fmt(latestHealth.sleep_hours, 1)} h${baselines.sleepHours ? ` · usual ${fmt(baselines.sleepHours.mean, 1)}` : ''}`,
    respiratory: fmt(latestHealth.respiratory_rate, 1) && `${fmt(latestHealth.respiratory_rate, 1)} /min${baselines.respiratoryRate ? ` · usual ${fmt(baselines.respiratoryRate.mean, 1)}` : ''}`,
  };

  // Same score source for the ring, the 7-day bars and the detail sheet.
  const scoredHistory = useMemo(() => withDisplayRecovery(healthHistory), [healthHistory]);
  const fromWhoop = isWhoopDay(latestHealth) && latestHealth.recovery_score != null;
  const score = fromWhoop ? Math.round(latestHealth.recovery_score as number) : recovery.score;
  const scoreColor = getScoreColor(score);
  const scoreBg = getScoreBg(score);

  // 7-day mini chart data (newest first in healthHistory, we want oldest-to-newest)
  const last7 = scoredHistory
    .filter(h => h.recovery_score != null)
    .slice(0, 7)
    .reverse();

  return (
  <>
    <Card className={cn("overflow-hidden border-muted/50", scoreBg)}>
      <CardContent className="p-4">
        {/* ── Top row: Title + Stale label ── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Activity className={cn("w-4 h-4", scoreColor)} />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Recovery
            </span>
            {fromWhoop && (
              <span className="text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full">
                WHOOP
              </span>
            )}
            {!fromWhoop && recovery.personalized && (
              <span className="text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full">
                Personalized
              </span>
            )}
          </div>
          {isStale && latestHealth.date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(latestHealth.date), 'MMM d')}
            </span>
          )}
        </div>

        {/* ── Score + Recommendation ── */}
        <div className="flex items-center gap-4 mb-3">
          {/* Large score number — tappable for recovery detail */}
          <button
            aria-label={`Recovery score ${score}. Show details`}
            className="relative flex-shrink-0 active:scale-95 transition-transform"
            onClick={() => setSelectedMetric('recovery')}
          >
            <ScoreRing score={score} size={72} />
          </button>

          {/* Recommendation text */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-snug mb-1">
              {getScoreLabel(score)}
            </div>
            {/* Context only: no automatic training advice. The athlete and coach decide intensity. */}
            <div className="text-xs text-muted-foreground leading-relaxed">
              {fromWhoop ? 'From WHOOP' : 'From your sleep and heart data'} · tap a factor for details
            </div>
          </div>
        </div>

        {/* ── Metric Contribution Bars — tappable ── */}
        <div className="space-y-1.5 mb-3">
          {recovery.contributions.map((c) => (
            <ContributionBar
              key={c.metric}
              contribution={c}
              reading={readings[c.metric]}
              onTap={() => setSelectedMetric(CONTRIBUTION_TO_METRIC[c.metric])}
            />
          ))}
          <div className="text-center">
            <span className="text-xs text-muted-foreground">tap any metric for details</span>
          </div>
        </div>

        {/* ── 7-Day Mini Chart ── */}
        {last7.length >= 2 && (
          <div className="pt-2 border-t border-muted/30">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Last 7 days
              </span>
            </div>
            <div className="flex items-end gap-1 h-6">
              {last7.map((day, i) => {
                const s = day.recovery_score ?? 0;
                const height = Math.max(4, (s / 100) * 24);
                return (
                  <div
                    key={day.date || i}
                    className="flex-1 flex flex-col items-center gap-0.5"
                  >
                    <div
                      className={cn(
                        "w-full rounded-sm transition-all",
                        getDotColor(s)
                      )}
                      style={{ height: `${height}px` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-0.5">
              {last7.map((day, i) => (
                <div
                  key={`label-${day.date || i}`}
                  className="flex-1 text-center text-xs text-muted-foreground"
                >
                  {day.date ? format(parseISO(day.date), 'EEE').charAt(0) : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Metric Detail Sheet — slides up when a metric is tapped */}
    <MetricDetailSheet
      metric={selectedMetric}
      healthHistory={scoredHistory}
      latestHealth={latestHealth}
      onClose={() => setSelectedMetric(null)}
    />
  </>
  );
}

// ═══ SUB-COMPONENTS ═══

/**
 * Circular score ring with animated fill
 */
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={cn("transition-all duration-700", color)}
        />
      </svg>
      {/* Center score text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-xl font-bold leading-none", color)}>
          {Math.round(score)}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

/**
 * Single metric contribution bar — tappable for detail view
 */
function ContributionBar({ contribution, reading, onTap }: { contribution: RecoveryContribution; reading?: string | null; onTap?: () => void }) {
  const { metric, points, maxPoints, trend, status } = contribution;
  const percentage = maxPoints > 0 ? (points / maxPoints) * 100 : 0;

  const metricConfig = METRIC_CONFIG[metric];
  const TrendIcon = trend === 'up' ? TrendingUp :
    trend === 'down' ? TrendingDown :
      trend === 'stable' ? Minus : HelpCircle;

  const statusColor = status === 'good' ? 'bg-green-500' :
    status === 'neutral' ? 'bg-yellow-500' : 'bg-red-500';

  const trendColor = metric === 'rhr' || metric === 'respiratory'
    // For RHR and respiratory, "up" is bad, "down" is good
    ? (trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-muted-foreground')
    // For HRV and sleep, "up" is good, "down" is bad
    : (trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground');

  return (
    <button
      onClick={onTap}
      className="block w-full hover:bg-muted/20 rounded-md px-1 py-0.5 -mx-1 transition-colors active:scale-[0.98]"
    >
     <span className="flex items-center gap-2 w-full">
      {/* Icon */}
      <div className="flex items-center gap-1 w-14 flex-shrink-0">
        {metricConfig.icon}
        <span className="text-xs text-muted-foreground">{metricConfig.label}</span>
      </div>

      {/* Bar */}
      <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", statusColor)}
          style={{ width: `${Math.max(2, percentage)}%` }}
        />
      </div>

      {/* Points */}
      <span className="text-xs text-muted-foreground w-8 text-right">
        {points.toFixed(0)}/{maxPoints}
      </span>

      {/* Trend */}
      {trend !== 'unknown' && (
        <TrendIcon className={cn("w-2.5 h-2.5 flex-shrink-0", trendColor)} />
      )}
     </span>
      {reading && (
        <span className="block pl-16 text-left text-xs text-muted-foreground font-heading tabular-nums">{reading}</span>
      )}
    </button>
  );
}

// ═══ CONFIG & HELPERS ═══

const METRIC_CONFIG: Record<RecoveryContribution['metric'], {
  label: string;
  icon: React.ReactNode;
}> = {
  hrv: {
    label: 'HRV',
    icon: <Activity className="w-2.5 h-2.5 text-purple-500" />,
  },
  rhr: {
    label: 'RHR',
    icon: <Heart className="w-2.5 h-2.5 text-red-400" />,
  },
  sleep: {
    label: 'Sleep',
    icon: <Moon className="w-2.5 h-2.5 text-indigo-400" />,
  },
  respiratory: {
    label: 'Resp',
    icon: <Wind className="w-2.5 h-2.5 text-blue-400" />,
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/[0.03]';
  if (score >= 60) return 'bg-yellow-500/[0.03]';
  if (score >= 40) return 'bg-orange-500/[0.03]';
  return 'bg-red-500/[0.03]';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent Recovery';
  if (score >= 65) return 'Good Recovery';
  if (score >= 45) return 'Moderate Recovery';
  if (score >= 30) return 'Low Recovery';
  return 'Poor Recovery';
}

function getDotColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}
