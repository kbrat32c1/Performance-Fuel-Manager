import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Scale, Heart, Utensils, Lock } from "lucide-react";
import type { CutScoreResult } from "@/lib/cut-score";

interface CutScoreGaugeProps {
  result?: CutScoreResult;
  locked?: boolean;
}

const ZONE_COLORS = {
  green: {
    stroke: "stroke-green-500",
    text: "text-green-500",
    bg: "bg-green-500/10",
    label: "text-green-500",
    fill: "#22c55e",
  },
  yellow: {
    stroke: "stroke-yellow-500",
    text: "text-yellow-500",
    bg: "bg-yellow-500/10",
    label: "text-yellow-500",
    fill: "#eab308",
  },
  red: {
    stroke: "stroke-red-500",
    text: "text-red-500",
    bg: "bg-red-500/10",
    label: "text-red-500",
    fill: "#ef4444",
  },
};

const PILLAR_CONFIG = {
  weight: { label: "Weight", icon: Scale, description: "Tracking to make weight" },
  recovery: { label: "Recovery", icon: Heart, description: "Sleep & body readiness" },
  protocol: { label: "Protocol", icon: Utensils, description: "Nutrition & hydration" },
} as const;

export function CutScoreGauge({ result, locked }: CutScoreGaugeProps) {
  const [expanded, setExpanded] = useState(false);

  // SVG circular gauge math
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // ── Locked state: grayed-out gauge with lock icon ──
  if (locked || !result) {
    return (
      <div className="px-4 pt-3 pb-1">
        <div className="w-full flex items-center gap-4 opacity-40">
          <div className="relative w-[96px] h-[96px] flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="6" className="stroke-muted/30" />
              {/* Dashed ring hint — shows there's something to unlock */}
              <circle
                cx="48" cy="48" r={radius} fill="none" strokeWidth="6"
                className="stroke-muted-foreground/15"
                strokeDasharray="8 12"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Lock className="w-5 h-5 text-muted-foreground/40 mb-0.5" />
              <span className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">
                Cut Score
              </span>
            </div>
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-xs text-muted-foreground">
              Log your <strong className="text-muted-foreground/80">morning weight</strong> to unlock
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Active state ──
  const colors = ZONE_COLORS[result.zone];
  const progress = result.score / 100;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className="px-4 pt-3 pb-1">
      {/* Gauge + Score */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 group"
      >
        {/* Circular Gauge */}
        <div className="relative w-[96px] h-[96px] flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
            {/* Background track */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              strokeWidth="6"
              className="stroke-muted/30"
            />
            {/* Progress arc */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className={colors.stroke}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset,
                transition: "stroke-dashoffset 0.6s ease-out",
              }}
            />
          </svg>
          {/* Center: score number + label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn(
              "text-2xl font-bold font-mono leading-none animate-number-pop",
              colors.text
            )}>
              {result.score}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
              Cut Score
            </span>
          </div>
        </div>

        {/* Label + Rationale */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm font-bold", colors.label)}>
              {result.label}
            </span>
            <ChevronDown className={cn(
              "w-3.5 h-3.5 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground/70",
              expanded && "rotate-180"
            )} />
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            {result.rationale}
          </p>
          {/* Active pillar indicators */}
          <div className="flex items-center gap-2 mt-1.5">
            {(Object.keys(PILLAR_CONFIG) as Array<keyof typeof PILLAR_CONFIG>).map((key) => {
              const pillar = result.pillars[key];
              const config = PILLAR_CONFIG[key];
              const Icon = config.icon;
              const isActive = pillar.hasData;

              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-0.5",
                    isActive ? "text-muted-foreground" : "text-muted-foreground/25"
                  )}
                  title={isActive ? `${config.label}: ${pillar.raw}/100` : `${config.label}: No data`}
                >
                  <Icon className="w-3 h-3" />
                  {isActive && (
                    <span className="text-[9px] font-mono font-bold">{pillar.raw}</span>
                  )}
                </div>
              );
            })}
            {!expanded && (
              <span className="text-[8px] text-muted-foreground/30 ml-1">tap ▾</span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded: pillar breakdown */}
      {expanded && (
        <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {(Object.keys(PILLAR_CONFIG) as Array<keyof typeof PILLAR_CONFIG>).map((key) => {
            const pillar = result.pillars[key];
            const config = PILLAR_CONFIG[key];
            const Icon = config.icon;

            if (!pillar.hasData) {
              return (
                <div key={key} className="flex items-center gap-2 opacity-40">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground flex-1">
                    {config.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground">No data</span>
                </div>
              );
            }

            // Bar color based on raw score
            const barZone = pillar.raw >= 75 ? "green" : pillar.raw >= 50 ? "yellow" : "red";
            const barColor = ZONE_COLORS[barZone];

            return (
              <div key={key} className="flex items-center gap-2">
                <Icon className={cn("w-3.5 h-3.5", barColor.text)} />
                <span className="text-[10px] text-muted-foreground w-16">
                  {config.label}
                </span>
                {/* Score bar */}
                <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500 ease-out")}
                    style={{
                      width: `${pillar.raw}%`,
                      backgroundColor: barColor.fill,
                    }}
                  />
                </div>
                <span className={cn("text-[10px] font-mono font-bold w-6 text-right", barColor.text)}>
                  {pillar.raw}
                </span>
              </div>
            );
          })}

          {/* Tier indicators */}
          <div className="flex items-center gap-3 pt-1 border-t border-muted/20">
            {(Object.keys(PILLAR_CONFIG) as Array<keyof typeof PILLAR_CONFIG>).map((key) => {
              const pillar = result.pillars[key];
              if (!pillar.hasData) return null;
              const tierLabel = pillar.tier === 'premium' ? 'Premium' :
                               pillar.tier === 'enhanced' ? 'Enhanced' : 'Basic';
              return (
                <span key={key} className="text-[8px] text-muted-foreground/50">
                  {PILLAR_CONFIG[key].label}: {tierLabel}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
