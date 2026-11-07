/**
 * Strain Score Card
 *
 * WHOOP-style daily strain display showing the athlete's accumulated
 * strain (0-21) from HR zone tracking throughout the day.
 *
 * Features:
 *  - Color-coded circular gauge (0-21 scale)
 *  - HR zone minutes stacked bar
 *  - Peak HR + Avg HR display
 *  - "LIVE" badge when HR monitoring is active
 *  - 7-day mini history from Supabase health_data
 *  - Tappable for metric detail sheet
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Flame, Heart, Zap } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DbHealthData } from "@/lib/supabase";
import type { StrainResult, StrainTarget } from "@/lib/strain-service";
import { getStrainLabel, getStrainColor, percentToStrain, getStrainTarget } from "@/lib/strain-service";
import { MetricDetailSheet } from "./metric-detail-sheet";
import type { MetricKey } from "./metric-detail-sheet";

interface StrainScoreCardProps {
  /** Current strain result from today's HR monitoring */
  strain: StrainResult;
  /** Recent health history for 7-day mini chart */
  healthHistory: DbHealthData[];
  /** Whether HR monitoring is actively running */
  isLive?: boolean;
  /** Today's recovery score (0-100) for strain target recommendation */
  recoveryScore?: number | null;
}

// ═══ COLORS ═══

function getStrainTailwindColor(score: number): string {
  if (score >= 18) return 'text-red-500';
  if (score >= 14) return 'text-orange-500';
  if (score >= 10) return 'text-amber-500';
  if (score >= 7) return 'text-blue-500';
  return 'text-gray-400';
}

function getStrainBg(score: number): string {
  if (score >= 18) return 'bg-red-500/[0.03]';
  if (score >= 14) return 'bg-orange-500/[0.03]';
  if (score >= 10) return 'bg-amber-500/[0.03]';
  if (score >= 7) return 'bg-blue-500/[0.03]';
  return '';
}

function getStrainBarColor(score: number): string {
  if (score >= 18) return 'bg-red-500';
  if (score >= 14) return 'bg-orange-500';
  if (score >= 10) return 'bg-amber-500';
  if (score >= 7) return 'bg-blue-500';
  return 'bg-gray-400';
}

// Zone colors for stacked bar
const ZONE_COLORS = {
  zone1: { bg: 'bg-blue-400', label: 'Z1', name: 'Warm Up' },
  zone2: { bg: 'bg-green-500', label: 'Z2', name: 'Fat Burn' },
  zone3: { bg: 'bg-amber-500', label: 'Z3', name: 'Aerobic' },
  zone4: { bg: 'bg-orange-500', label: 'Z4', name: 'Threshold' },
  zone5: { bg: 'bg-red-500', label: 'Z5', name: 'Max' },
};

export function StrainScoreCard({ strain, healthHistory, isLive, recoveryScore }: StrainScoreCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  const score = strain.score;
  const scoreColor = getStrainTailwindColor(score);
  const scoreBg = getStrainBg(score);
  const strainTarget = getStrainTarget(recoveryScore);

  // Zone minutes for stacked bar
  const { zoneMinutes } = strain;
  const totalZoneMinutes =
    zoneMinutes.zone1 + zoneMinutes.zone2 + zoneMinutes.zone3 +
    zoneMinutes.zone4 + zoneMinutes.zone5;

  // Time since last update
  const lastUpdatedLabel = getTimeSinceLabel(strain.lastUpdated);

  // 7-day strain chart from health_data (strain_score is 0-100 in DB)
  const last7 = healthHistory
    .filter(h => h.strain_score != null && h.strain_score > 0)
    .slice(0, 7)
    .reverse();

  return (
    <>
      <Card
        className={cn("overflow-hidden border-muted/50 active:scale-[0.98] transition-transform cursor-pointer", scoreBg)}
        onClick={() => setSelectedMetric('strain')}
      >
        <CardContent className="p-4">
          {/* ── Top row: Title + Live badge ── */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Flame className={cn("w-4 h-4", scoreColor)} />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Day Strain
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isLive && (
                <span className="flex items-center gap-1 text-xs font-bold text-green-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  LIVE
                </span>
              )}
              {lastUpdatedLabel && (
                <span className="text-xs text-muted-foreground/60">
                  {lastUpdatedLabel}
                </span>
              )}
            </div>
          </div>

          {/* ── Score + Label ── */}
          <div className="flex items-center gap-4 mb-3">
            {/* Circular strain gauge */}
            <div className="relative flex-shrink-0">
              <StrainRing score={score} size={72} target={strainTarget} />
            </div>

            {/* Label + HR stats */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-snug mb-0.5">
                {getStrainLabel(score)} Strain
              </div>
              {strainTarget && (
                <div className={cn(
                  "text-xs font-medium mb-1",
                  strainTarget.zone === 'green' ? 'text-green-500' :
                  strainTarget.zone === 'yellow' ? 'text-amber-500' : 'text-red-400'
                )}>
                  Target: {strainTarget.min.toFixed(0)}-{strainTarget.max.toFixed(0)} ({strainTarget.label})
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {strain.peakHR > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Heart className="w-3 h-3 text-red-400" />
                    <span className="font-semibold">{strain.peakHR}</span> peak
                  </span>
                )}
                {strain.avgHR > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Heart className="w-3 h-3 text-muted-foreground/50" />
                    <span className="font-semibold">{strain.avgHR}</span> avg
                  </span>
                )}
              </div>
              {strain.totalHRMinutes > 0 && (
                <div className="text-xs text-muted-foreground/50 mt-0.5">
                  {Math.round(strain.totalHRMinutes)} min tracked
                </div>
              )}
            </div>
          </div>

          {/* ── HR Zone Stacked Bar ── */}
          {totalZoneMinutes > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground/60 uppercase tracking-wide">
                  HR Zones
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {Math.round(totalZoneMinutes)} min in zone
                </span>
              </div>
              {/* Stacked horizontal bar */}
              <div className="flex h-3 rounded-full overflow-hidden">
                {Object.entries(ZONE_COLORS).map(([zone, config]) => {
                  const minutes = zoneMinutes[zone as keyof typeof zoneMinutes];
                  if (minutes <= 0) return null;
                  const pct = (minutes / totalZoneMinutes) * 100;
                  return (
                    <div
                      key={zone}
                      className={cn("transition-all", config.bg)}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </div>
              {/* Zone legend */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {Object.entries(ZONE_COLORS).map(([zone, config]) => {
                  const minutes = zoneMinutes[zone as keyof typeof zoneMinutes];
                  if (minutes <= 0) return null;
                  return (
                    <div key={zone} className="flex items-center gap-1">
                      <div className={cn("w-2 h-2 rounded-full", config.bg)} />
                      <span className="text-xs text-muted-foreground">
                        {config.label} {formatZoneMinutes(minutes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 7-Day Mini Chart ── */}
          {last7.length >= 2 && (
            <div className="pt-2 border-t border-muted/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground/60 uppercase tracking-wide">
                  Last 7 days
                </span>
              </div>
              <div className="flex items-end gap-1 h-6">
                {last7.map((day, i) => {
                  // Convert DB 0-100 back to 0-21 for coloring
                  const dbScore = day.strain_score ?? 0;
                  const strain21 = percentToStrain(dbScore);
                  const height = Math.max(4, (dbScore / 100) * 24);
                  return (
                    <div
                      key={day.date || i}
                      className="flex-1 flex flex-col items-center gap-0.5"
                    >
                      <div
                        className={cn(
                          "w-full rounded-sm transition-all",
                          getStrainBarColor(strain21)
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
                    className="flex-1 text-center text-xs text-muted-foreground/40"
                  >
                    {day.date ? format(parseISO(day.date), 'EEE').charAt(0) : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metric Detail Sheet — slides up when gauge is tapped */}
      <MetricDetailSheet
        metric={selectedMetric}
        healthHistory={healthHistory}
        liveValue={score > 0 ? score : null}
        onClose={() => setSelectedMetric(null)}
      />
    </>
  );
}

// ═══ SUB-COMPONENTS ═══

/**
 * Circular strain gauge (0-21 scale) with WHOOP-style color gradient
 */
function StrainRing({ score, size = 72, target }: { score: number; size?: number; target?: StrainTarget | null }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 21) * circumference;
  const color = getStrainColor(score);

  // Target zone arc (thin, semi-transparent)
  const targetMinOffset = target ? circumference - (target.min / 21) * circumference : 0;
  const targetMaxOffset = target ? circumference - (target.max / 21) * circumference : 0;
  const targetArcLength = target ? ((target.max - target.min) / 21) * circumference : 0;
  const targetArcStart = target ? (target.min / 21) * circumference : 0;
  const targetColor = target?.zone === 'green' ? '#22c55e' : target?.zone === 'yellow' ? '#f59e0b' : '#f87171';

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
        {/* Target zone arc (behind the score ring) */}
        {target && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={targetColor}
            strokeWidth={strokeWidth + 4}
            strokeDasharray={`${targetArcLength} ${circumference - targetArcLength}`}
            strokeDashoffset={circumference - targetArcStart}
            opacity={0.15}
          />
        )}
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      {/* Center score text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-xl font-bold leading-none"
          style={{ color }}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">/ 21</span>
      </div>
    </div>
  );
}

// ═══ HELPERS ═══

function formatZoneMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function getTimeSinceLabel(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMin = Math.round((now - then) / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHrs = Math.round(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;

    return '';
  } catch {
    return '';
  }
}
