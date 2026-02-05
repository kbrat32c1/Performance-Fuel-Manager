import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  Droplets, Scale, Dumbbell, Moon, Sun,
  ChevronRight, ChevronDown, ChevronUp, Info,
  AlertTriangle, Flame, Zap, Trash2,
  Calendar, Clock, ArrowDownToLine, ArrowUpFromLine, Plus,
  TrendingDown, TrendingUp, HelpCircle, X, WifiOff, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { getPhaseStyleForDaysUntil, PHASE_STYLES, getPhaseStyle } from "@/lib/phase-colors";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SPAR_MACRO_PROTOCOLS, type SparMacroProtocol } from "@/lib/spar-calculator";
import { SettingsDialog, FuelCard, DateNavigator, NextCyclePrompt, TodayCard } from "@/components/dashboard";
import { useToast } from "@/hooks/use-toast";
import { useCarouselSwipe } from "@/hooks/use-carousel-swipe";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { HelpTip } from "@/components/ui/help-tip";
import { Confetti, CelebrationBanner } from "@/components/ui/confetti";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { useCelebrations } from "@/hooks/use-celebrations";
import { DashboardTour } from "@/components/dashboard/tour";

// ═══════════════════════════════════════════════════════════════════════════════
// SPAR PROTOCOL SELECTOR — clickable phase label with protocol switcher popover
// ═══════════════════════════════════════════════════════════════════════════════
function SparProtocolSelector({
  profile,
}: {
  profile: ReturnType<typeof useStore>['profile'];
}) {
  // Simple v2 goal label - no dropdown, edit in settings
  const goal = profile.sparGoal || 'maintain';
  const intensity = profile.goalIntensity;
  const priority = profile.maintainPriority;

  // Build display label
  let goalLabel = goal === 'lose' ? 'LOSE' : goal === 'gain' ? 'GAIN' : 'MAINTAIN';
  if (goal === 'lose' && intensity) {
    goalLabel += intensity === 'aggressive' ? ' - AGG' : ' - LEAN';
  } else if (goal === 'gain' && intensity) {
    goalLabel += intensity === 'aggressive' ? ' - AGG' : ' - LEAN';
  } else if (goal === 'maintain' && priority) {
    goalLabel += priority === 'performance' ? ' - PERF' : '';
  }

  // Goal colors
  const goalColor = goal === 'lose' ? 'text-orange-500' :
                    goal === 'gain' ? 'text-green-500' : 'text-blue-500';

  return (
    <span className={cn("text-xs font-bold uppercase", goalColor)}>
      {goalLabel}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPAR FOCUS CARD — Protocol summary, tips, and calorie info for SPAR users
// ═══════════════════════════════════════════════════════════════════════════════
function SparFocusCard({ profile }: { profile: ReturnType<typeof useStore>['profile'] }) {
  const { getSliceTargets } = useStore();
  const [expanded, setExpanded] = useState(false);

  const macroProtocol = profile.sparMacroProtocol || 'maintenance';
  const config = SPAR_MACRO_PROTOCOLS[macroProtocol];
  const targets = getSliceTargets();

  // Get calorie adjustment
  const calorieAdj = macroProtocol === 'custom' && profile.customMacros?.calorieAdjustment !== undefined
    ? profile.customMacros.calorieAdjustment : config.calorieAdjustment;

  // Get C/P/F values
  const carbs = macroProtocol === 'custom' && profile.customMacros?.carbs ? profile.customMacros.carbs : config.carbs;
  const protein = macroProtocol === 'custom' && profile.customMacros?.protein ? profile.customMacros.protein : config.protein;
  const fat = macroProtocol === 'custom' && profile.customMacros?.fat ? profile.customMacros.fat : config.fat;

  // Protocol-specific tips
  const getTips = () => {
    switch (macroProtocol) {
      case 'performance':
        return [
          'Prioritize carbs around training for energy',
          'Eat complex carbs 2-3 hours before training',
          'Recover with protein + carbs within 30min post-workout',
        ];
      case 'maintenance':
        return [
          'Spread meals evenly throughout the day',
          'Balance each meal with protein, carbs, and veggies',
          'Stay consistent with portion sizes',
        ];
      case 'recomp':
        return [
          'Higher protein supports muscle retention',
          'Time carbs around workouts',
          'Be patient — body composition changes are slow',
        ];
      case 'build':
        return [
          'Eat in a slight surplus for lean gains',
          'Protein at every meal for muscle synthesis',
          'Don\'t skip carbs — they fuel muscle growth',
        ];
      case 'fatloss':
        return [
          'Protein keeps you full longer',
          'Fill up on veggies for volume without calories',
          'Stay hydrated — thirst often feels like hunger',
        ];
      case 'custom':
        return [
          'Track consistently to see what works for you',
          'Adjust ratios based on energy and performance',
          'Review your progress weekly',
        ];
      default:
        return [];
    }
  };

  const tips = getTips();
  const iconColor = macroProtocol === 'performance' ? 'text-yellow-500' :
                    macroProtocol === 'maintenance' ? 'text-blue-500' :
                    macroProtocol === 'recomp' ? 'text-cyan-500' :
                    macroProtocol === 'build' ? 'text-green-500' :
                    macroProtocol === 'fatloss' ? 'text-orange-500' : 'text-purple-500';

  const bgColor = macroProtocol === 'performance' ? 'from-yellow-500/10' :
                  macroProtocol === 'maintenance' ? 'from-blue-500/10' :
                  macroProtocol === 'recomp' ? 'from-cyan-500/10' :
                  macroProtocol === 'build' ? 'from-green-500/10' :
                  macroProtocol === 'fatloss' ? 'from-orange-500/10' : 'from-purple-500/10';

  return (
    <Card className={cn("mb-2 border-muted overflow-hidden bg-gradient-to-br", bgColor, "to-transparent")}>
      <CardContent className="p-3">
        {/* Header with expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Zap className={cn("w-4 h-4", iconColor)} />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Today's Focus</span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", iconColor, "bg-current/10")}>
              {config.shortName}
            </span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>

        {/* Quick stats row — always visible */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center">
            <div className="text-lg font-bold font-mono text-foreground">{targets.totalCalories}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Calories</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono">
              <span className="text-amber-500">{carbs}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-orange-500">{protein}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-blue-400">{fat}</span>
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">C/P/F Split</div>
          </div>
          <div className="text-center">
            <div className={cn("text-lg font-bold font-mono", iconColor)}>
              {calorieAdj > 0 ? `+${calorieAdj}` : calorieAdj < 0 ? calorieAdj : '±0'}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">Adjustment</div>
          </div>
        </div>

        {/* Slice targets summary */}
        <div className="flex items-center justify-center gap-2 mt-3 py-2 bg-muted/30 rounded-lg flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-orange-500 font-bold text-sm">{targets.protein}P</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-1">
            <span className="text-amber-500 font-bold text-sm">{targets.carb}C</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-1">
            <span className="text-green-500 font-bold text-sm">{targets.veg}V</span>
          </div>
          {/* V2: Show Fruit and Fat */}
          {(targets.isV2 || targets.fruit > 0 || targets.fat > 0) && (
            <>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-1">
                <span className="text-pink-500 font-bold text-sm">{targets.fruit}Fr</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-1">
                <span className="text-yellow-600 font-bold text-sm">{targets.fat}Ft</span>
              </div>
            </>
          )}
          <span className="text-muted-foreground/50 text-[10px]">slices today</span>
        </div>

        {/* Expanded section with tips */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-muted/50 animate-in slide-in-from-top-2 duration-200">
            <p className="text-[10px] text-muted-foreground font-bold uppercase mb-2">Protocol Tips</p>
            <div className="space-y-2">
              {tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={cn("text-[10px] font-bold mt-0.5", iconColor)}>{i + 1}</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>

            {/* Who this protocol is for */}
            <div className="mt-3 p-2 bg-muted/20 rounded-lg">
              <p className="text-[9px] text-muted-foreground">
                <span className="font-bold">Best for:</span> {config.whoFor}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE ADJUSTMENT BANNER — Suggests calorie changes when weight plateaus
// ═══════════════════════════════════════════════════════════════════════════════
function AdaptiveAdjustmentBanner() {
  const { getAdaptiveAdjustment } = useStore();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('adaptive-adjustment-dismissed');
      return saved === 'true';
    }
    return false;
  });

  const adjustment = getAdaptiveAdjustment();

  // Don't show if no suggestion, no plateau, or dismissed
  if (!adjustment.suggestedAdjustment || !adjustment.reason || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('adaptive-adjustment-dismissed', 'true');
  };

  return (
    <Card className={cn(
      "mb-2 border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300",
      adjustment.isPlateaued
        ? "bg-amber-500/5 border-amber-500/30"
        : "bg-blue-500/5 border-blue-500/30"
    )}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className={cn(
              "w-4 h-4 mt-0.5 shrink-0",
              adjustment.isPlateaued ? "text-amber-500" : "text-blue-500"
            )} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  "text-xs font-bold uppercase",
                  adjustment.isPlateaued ? "text-amber-500" : "text-blue-500"
                )}>
                  {adjustment.isPlateaued ? 'Plateau Detected' : 'Adjustment Suggestion'}
                </span>
                {adjustment.plateauDays > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {adjustment.plateauDays}+ days
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {adjustment.reason}
              </p>
              {/* Weight data mini-chart */}
              {adjustment.recentWeights.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[9px] text-muted-foreground">Recent:</span>
                  {adjustment.recentWeights.slice(0, 5).reverse().map((w, i) => (
                    <span key={i} className="text-[10px] font-mono text-foreground/70">
                      {w.weight.toFixed(1)}
                      {i < Math.min(4, adjustment.recentWeights.length - 1) && (
                        <span className="text-muted-foreground mx-0.5">→</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY COMPLIANCE CARD — Shows macro tracking performance for the week
// ═══════════════════════════════════════════════════════════════════════════════
function WeeklyComplianceCard() {
  const { getWeeklyCompliance, getSliceTargets } = useStore();
  const [expanded, setExpanded] = useState(false);

  const compliance = getWeeklyCompliance();
  const targets = getSliceTargets();
  const isV2 = targets.isV2;

  // Don't show if no data
  if (compliance.daysTracked === 0) {
    return null;
  }

  // Calculate overall compliance
  const categories = isV2
    ? ['protein', 'carb', 'veg', 'fruit', 'fat'] as const
    : ['protein', 'carb', 'veg'] as const;

  const validCategories = categories.filter(c => compliance[c].avgTarget > 0);
  const overallCompliance = validCategories.length > 0
    ? Math.round(validCategories.reduce((sum, c) => sum + compliance[c].percentage, 0) / validCategories.length)
    : 0;

  // Color based on overall compliance
  const overallColor = overallCompliance >= 85 ? 'text-green-500' :
                       overallCompliance >= 70 ? 'text-yellow-500' : 'text-red-500';

  return (
    <Card className="mb-2 border-muted overflow-hidden">
      <CardContent className="p-0">
        {/* Header - tap to expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-3 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                This Week
              </span>
              <span className={cn("text-xs font-bold", overallColor)}>
                {overallCompliance}%
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({compliance.daysTracked} day{compliance.daysTracked !== 1 ? 's' : ''})
              </span>
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )} />
          </div>

          {/* Mini progress bars - always visible */}
          <div className="flex gap-1 mt-2">
            {categories.map(cat => {
              const pct = compliance[cat].percentage;
              const color = cat === 'protein' ? 'bg-orange-500' :
                           cat === 'carb' ? 'bg-amber-500' :
                           cat === 'veg' ? 'bg-green-500' :
                           cat === 'fruit' ? 'bg-pink-500' : 'bg-yellow-600';
              if (compliance[cat].avgTarget === 0) return null;
              return (
                <div key={cat} className="flex-1">
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", color)}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="px-3 pb-3 border-t border-muted animate-in slide-in-from-top-2 duration-200">
            {/* Category breakdown */}
            <div className="grid grid-cols-5 gap-2 pt-3">
              {categories.map(cat => {
                const data = compliance[cat];
                if (data.avgTarget === 0) return null;
                const pct = data.percentage;
                const color = cat === 'protein' ? 'text-orange-500' :
                             cat === 'carb' ? 'text-amber-500' :
                             cat === 'veg' ? 'text-green-500' :
                             cat === 'fruit' ? 'text-pink-500' : 'text-yellow-600';
                const label = cat === 'protein' ? 'Pro' :
                             cat === 'carb' ? 'Carb' :
                             cat === 'veg' ? 'Veg' :
                             cat === 'fruit' ? 'Fruit' : 'Fat';
                const isBest = cat === compliance.bestCategory;
                const isWorst = cat === compliance.worstCategory;
                return (
                  <div key={cat} className={cn(
                    "text-center p-2 rounded-lg",
                    isBest && "bg-green-500/10",
                    isWorst && pct < 80 && "bg-red-500/10"
                  )}>
                    <div className={cn("text-lg font-bold font-mono", color)}>
                      {pct}%
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase font-bold">
                      {label}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {data.avgConsumed}/{data.avgTarget}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insight */}
            {compliance.insight && (
              <div className="mt-3 px-2.5 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[11px] text-muted-foreground">
                    {compliance.insight}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEIGHT PROJECTION SLIDER — Shows future weight based on protocol
// ═══════════════════════════════════════════════════════════════════════════════
function WeightProjectionCard({ profile, logs }: {
  profile: ReturnType<typeof useStore>['profile'];
  logs: Array<{ date: Date; weight: number; type: string }>;
}) {
  const [weeksAhead, setWeeksAhead] = useState(4);

  const macroProtocol = profile.sparMacroProtocol || 'maintenance';
  const config = SPAR_MACRO_PROTOCOLS[macroProtocol];

  // Get calorie adjustment
  const calorieAdj = macroProtocol === 'custom' && profile.customMacros?.calorieAdjustment !== undefined
    ? profile.customMacros.calorieAdjustment : config.calorieAdjustment;

  // Get current weight from most recent morning log
  const morningLogs = logs.filter(l => l.type === 'morning').sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const currentWeight = morningLogs[0]?.weight || profile.currentWeight;

  if (!currentWeight) {
    return null; // No weight data available
  }

  // Calculate weekly weight change based on calorie adjustment
  // 3500 cal deficit/surplus = ~1 lb loss/gain
  const weeklyChange = (calorieAdj * 7) / 3500;

  // Generate projections
  const projections = Array.from({ length: 13 }, (_, i) => {
    const week = i;
    const projectedWeight = currentWeight + (weeklyChange * week);
    const date = addDays(new Date(), week * 7);
    return {
      week,
      weight: Math.round(projectedWeight * 10) / 10,
      date,
    };
  });

  const selectedProjection = projections[weeksAhead];
  const totalChange = selectedProjection.weight - currentWeight;

  // Protocol-specific colors (matching the dashboard header and settings)
  const protocolColor = macroProtocol === 'performance' ? 'text-yellow-500' :
                        macroProtocol === 'build' ? 'text-green-500' :
                        macroProtocol === 'fatloss' ? 'text-orange-500' :
                        macroProtocol === 'recomp' ? 'text-cyan-500' :
                        macroProtocol === 'custom' ? 'text-purple-500' : 'text-blue-500';

  return (
    <Card className="mb-2 border-muted overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className={cn("w-4 h-4", protocolColor)} />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Weight Projection</span>
        </div>

        {/* Current vs Projected */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono text-foreground">{currentWeight}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Current (lbs)</div>
          </div>
          <div className="text-center">
            <div className={cn("text-2xl font-bold font-mono", protocolColor)}>
              {selectedProjection.weight}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">
              In {weeksAhead} week{weeksAhead !== 1 ? 's' : ''} (lbs)
            </div>
          </div>
        </div>

        {/* Change summary - shows protocol name and weight change */}
        <div className="flex items-center justify-center gap-2 mb-4 py-2 bg-muted/30 rounded-lg">
          <Scale className={cn("w-4 h-4", protocolColor)} />
          <span className={cn("font-bold text-sm", protocolColor)}>{config.shortName}</span>
          {totalChange !== 0 && (
            <span className="text-[10px] text-muted-foreground">
              ({totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)} lbs in {weeksAhead}w)
            </span>
          )}
        </div>

        {/* Week slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Today</span>
            <span>{format(selectedProjection.date, 'MMM d, yyyy')}</span>
            <span>12 weeks</span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            value={weeksAhead}
            onChange={(e) => setWeeksAhead(parseInt(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          {/* Week markers */}
          <div className="flex justify-between px-1">
            {[0, 4, 8, 12].map((w) => (
              <button
                key={w}
                onClick={() => setWeeksAhead(w)}
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded transition-colors",
                  weeksAhead === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>

        {/* Protocol explanation */}
        <p className="text-[9px] text-muted-foreground mt-3 text-center">
          Based on {config.shortName} protocol ({calorieAdj > 0 ? '+' : ''}{calorieAdj} cal/day)
        </p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const {
    profile,
    calculateTarget,
    getPhase,
    getFuelingGuide,
    updateProfile,
    getHydrationTarget,
    getMacroTargets,
    getFoodLists,
    logs,
    addLog,
    updateLog,
    deleteLog,
    getDailyTracking,
    updateDailyTracking,
    getTomorrowPlan,
    getWeeklyPlan,
    getStatus,
    getDailyPriority,
    getNextTarget,
    getDriftMetrics,
    getWeekDescentData,
    getTodaysFoods,
    getDaysUntilWeighIn,
    getTimeUntilWeighIn,
    isWaterLoadingDay,
    clearLogs,
    getHistoryInsights,
    resetData,
    getAdaptiveAdjustment,
    getWeeklyCompliance,
    getSliceTargets
  } = useStore();

  const phase = getPhase();
  const displayDate = profile.simulatedDate || new Date();
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const isViewingHistorical = !!profile.simulatedDate;
  const [compDayDismissed, setCompDayDismissed] = useState(() => sessionStorage.getItem('compDayBannerDismissed') === 'true');
  const [sipOnlyDismissed, setSipOnlyDismissed] = useState(() => sessionStorage.getItem('sipOnlyBannerDismissed') === 'true');
  const today = startOfDay(new Date());
  const { celebration, dismiss: dismissCelebration } = useCelebrations();
  const isOnline = useOnlineStatus();
  const { toast } = useToast();

  // Pull-to-refresh for dashboard (reloads data from Supabase)
  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      // Simulate a refresh - in a real app this would sync with backend
      await new Promise(resolve => setTimeout(resolve, 800));
      toast({
        title: "Dashboard refreshed",
        description: "Your data is up to date",
      });
    },
    disabled: isViewingHistorical, // Disable when viewing history
  });

  // Reset sip-only banner each day (check date stored vs. today)
  useEffect(() => {
    const storedDate = sessionStorage.getItem('sipOnlyBannerDate');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (storedDate !== todayStr) {
      // New day — reset the dismissal and store today's date
      sessionStorage.removeItem('sipOnlyBannerDismissed');
      sessionStorage.setItem('sipOnlyBannerDate', todayStr);
      setSipOnlyDismissed(false);
    }
  }, []);

  // Handle date navigation
  const handleDateChange = useCallback((date: Date | null) => {
    updateProfile({ simulatedDate: date });
  }, [updateProfile]);

  // Carousel swipe navigation
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 375);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      } else {
        setContainerWidth(window.innerWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleGoPrev = useCallback(() => {
    const prevDay = subDays(displayDate, 1);
    handleDateChange(prevDay);
  }, [displayDate, handleDateChange]);

  const handleGoNext = useCallback(() => {
    const nextDay = addDays(displayDate, 1);
    if (nextDay >= today) {
      handleDateChange(null);
    } else {
      handleDateChange(nextDay);
    }
  }, [displayDate, today, handleDateChange]);

  // Can always go to previous days, can only go next if viewing historical
  const canGoPrev = true;
  const canGoNext = isViewingHistorical;

  const { offset: swipeOffset, isDragging, isAnimating, transition: swipeTransition, handlers: swipeHandlers } = useCarouselSwipe(
    handleGoPrev,
    handleGoNext,
    canGoPrev,
    canGoNext,
    containerWidth,
    { threshold: 50 }
  );

  // Calculate which adjacent day is being revealed
  const revealingPrev = swipeOffset > 20;
  const revealingNext = swipeOffset < -20;
  const prevDate = subDays(displayDate, 1);
  const nextDate = addDays(displayDate, 1);

  // Get morning weight for a specific date (for peek preview)
  const getDateMorningWeight = useCallback((date: Date) => {
    const log = logs.find(l => {
      if (l.type !== 'morning') return false;
      const ld = new Date(l.date);
      return ld.getFullYear() === date.getFullYear() &&
        ld.getMonth() === date.getMonth() &&
        ld.getDate() === date.getDate();
    });
    return log?.weight ?? null;
  }, [logs]);

  const prevDayWeight = useMemo(() => getDateMorningWeight(prevDate), [getDateMorningWeight, prevDate]);
  const nextDayWeight = useMemo(() => getDateMorningWeight(nextDate), [getDateMorningWeight, nextDate]);

  // Macro tracking data
  const macros = getMacroTargets();
  const foodLists = getFoodLists();
  const todaysFoods = getTodaysFoods();

  const fuel = getFuelingGuide();
  const hydration = getHydrationTarget();
  const targetWeight = calculateTarget();

  // Is this a SPAR protocol user? (No competition, no weight class)
  const isSparProtocol = profile.protocol === '5';

  // Get protocol display name
  const getProtocolName = () => {
    switch (profile.protocol) {
      case '1': return 'Body Comp Phase';
      case '2': return 'Make Weight Phase';
      case '3': return 'Hold Weight Phase';
      case '4': return 'Build Phase';
      case '5': return 'SPAR Nutrition';
      default: return 'Unknown';
    }
  };

  // Get phase display info - driven by days-until-weigh-in, not day-of-week
  const getPhaseInfo = () => {
    // SPAR users: derive label from the macro protocol's calorie adjustment
    if (isSparProtocol) {
      const macroProtocol = profile.sparMacroProtocol || 'maintenance';
      const config = SPAR_MACRO_PROTOCOLS[macroProtocol];

      // Get calorie adjustment (use custom if applicable)
      const calorieAdj = macroProtocol === 'custom' && profile.customMacros?.calorieAdjustment !== undefined
        ? profile.customMacros.calorieAdjustment
        : config?.calorieAdjustment || 0;

      // Derive label and color from calorie adjustment
      if (calorieAdj > 0) {
        return { label: 'Building', color: 'text-green-500' };
      } else if (calorieAdj < 0) {
        return { label: 'Cutting', color: 'text-orange-500' };
      } else {
        return { label: 'Maintaining', color: 'text-blue-500' };
      }
    }

    if (daysUntilWeighIn < 0) {
      return { label: 'Recovery', color: 'text-cyan-500' };
    }
    if (daysUntilWeighIn === 0) {
      return { label: 'Competition Day', color: 'text-yellow-500' };
    }
    if (daysUntilWeighIn === 1) {
      return { label: 'Cut Phase', color: 'text-orange-500' };
    }
    if (daysUntilWeighIn === 2) {
      return { label: 'Prep Phase', color: 'text-violet-400' };
    }
    if (daysUntilWeighIn <= 5) {
      return { label: 'Loading Phase', color: 'text-primary' };
    }
    // 6+ days out
    return { label: 'Training Phase', color: 'text-primary' };
  };

  const statusInfo = getStatus();
  const dailyPriority = getDailyPriority();
  const nextTarget = getNextTarget();
  const driftMetrics = getDriftMetrics();
  const descentData = getWeekDescentData();
  const historyInsights = getHistoryInsights();

  const phaseInfo = getPhaseInfo();

  // Phase color mapping for UI elements
  const { style: phaseStyle } = getPhaseStyleForDaysUntil(daysUntilWeighIn);

  // Get today's tracking data for status summary
  const dateKey = format(displayDate, 'yyyy-MM-dd');
  const dailyTracking = getDailyTracking(dateKey);

  // Calculate today's log completion status (memoized — scans full logs array)
  const todayLogs = useMemo(() => {
    const todayDate = displayDate;
    const findLog = (type: string) => logs.find(log => {
      const logDate = new Date(log.date);
      return log.type === type &&
        logDate.getFullYear() === todayDate.getFullYear() &&
        logDate.getMonth() === todayDate.getMonth() &&
        logDate.getDate() === todayDate.getDate();
    });
    return {
      morning: findLog('morning'),
      prePractice: findLog('pre-practice'),
      postPractice: findLog('post-practice'),
      beforeBed: findLog('before-bed'),
    };
  }, [logs, displayDate]);

  // Most recent weigh-in today (any type) for metrics strip (memoized)
  const mostRecentLog = useMemo(() => logs
    .filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0],
  [logs, displayDate]);

  // Yesterday's morning weight for progress comparison
  const yesterdayMorning = useMemo(() => {
    const yesterday = subDays(displayDate, 1);
    return logs.find(log => {
      if (log.type !== 'morning') return false;
      const ld = new Date(log.date);
      return ld.getFullYear() === yesterday.getFullYear() &&
        ld.getMonth() === yesterday.getMonth() &&
        ld.getDate() === yesterday.getDate();
    });
  }, [logs, displayDate]);

  // Logging streak: consecutive days with at least a morning weigh-in (backwards from today)
  const streak = useMemo(() => {
    const today = startOfDay(new Date());
    let count = 0;
    for (let i = 0; i < 365; i++) {
      const checkDate = subDays(today, i);
      const hasMorning = logs.some(log => {
        if (log.type !== 'morning') return false;
        const ld = new Date(log.date);
        return ld.getFullYear() === checkDate.getFullYear() &&
          ld.getMonth() === checkDate.getMonth() &&
          ld.getDate() === checkDate.getDate();
      });
      if (hasMorning) {
        count++;
      } else if (i === 0) {
        // Today not logged yet — don't break, check yesterday
        continue;
      } else {
        break;
      }
    }
    return count;
  }, [logs]);

  // Generate contextual insights based on available data
  const insights = useMemo(() => {
    const items: { emoji: string; text: string; color: string }[] = [];
    const morningWeight = todayLogs.morning?.weight;

    // 1. Weekly trend — "Down X lbs this week"
    if (descentData.totalLost && descentData.totalLost > 0.3) {
      items.push({
        emoji: '📉',
        text: `Down ${descentData.totalLost.toFixed(1)} lbs this week`,
        color: 'text-green-500',
      });
    }

    // 2. Progress vs yesterday
    if (morningWeight && yesterdayMorning) {
      const diff = yesterdayMorning.weight - morningWeight;
      if (diff >= 0.5) {
        items.push({
          emoji: '⬇️',
          text: `${diff.toFixed(1)} lbs lighter than yesterday`,
          color: 'text-green-500',
        });
      }
    }

    // 3. Pace ahead/behind — only for competition protocols
    if (!isSparProtocol) {
      if (descentData.pace === 'ahead') {
        items.push({
          emoji: '🏃',
          text: 'Ahead of pace to make weight',
          color: 'text-green-500',
        });
      } else if (descentData.pace === 'behind' && daysUntilWeighIn > 0) {
        items.push({
          emoji: '⚠️',
          text: 'Behind pace — extra effort needed',
          color: 'text-yellow-500',
        });
      }

      // 4. Projected to make weight
      if (descentData.projectedSaturday !== null && descentData.projectedSaturday <= profile.targetWeightClass && daysUntilWeighIn > 1) {
        items.push({
          emoji: '✅',
          text: `On track for ${descentData.projectedSaturday.toFixed(1)} lbs at weigh-in`,
          color: 'text-green-500',
        });
      }
    }

    // 5. Overnight drift insight — "You lose ~X lbs per night"
    if (descentData.avgDriftRateOzPerHr !== null && descentData.avgDriftRateOzPerHr > 0) {
      const nightLoss = descentData.avgDriftRateOzPerHr * 8; // assume 8hr sleep
      if (nightLoss >= 0.5) {
        items.push({
          emoji: '🌙',
          text: `~${nightLoss.toFixed(1)} lbs lost per 8hr sleep`,
          color: 'text-cyan-500',
        });
      }
    }

    // 6. Practice sweat effectiveness
    if (descentData.avgSweatRateOzPerHr !== null && descentData.avgSweatRateOzPerHr > 0) {
      const sessionLoss = descentData.avgSweatRateOzPerHr * 1.5; // typical 1.5hr practice
      items.push({
        emoji: '💧',
        text: `~${sessionLoss.toFixed(1)} lbs per 1.5hr practice`,
        color: 'text-orange-500',
      });
    }

    // 7. Made weight last week
    if (historyInsights.madeWeightLastWeek) {
      items.push({
        emoji: '🏆',
        text: 'Made weight last week — keep it up!',
        color: 'text-primary',
      });
    }

    // 8. Logging streak encouragement
    if (streak >= 5) {
      items.push({
        emoji: '🔥',
        text: `${streak} day logging streak`,
        color: streak >= 14 ? 'text-orange-500' : 'text-yellow-500',
      });
    }

    return items;
  }, [todayLogs, yesterdayMorning, descentData, historyInsights, profile.targetWeightClass, daysUntilWeighIn, streak, isSparProtocol]);

  return (
    <MobileLayout showNav={true}>
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullToRefresh.pullDistance}
        pullProgress={pullToRefresh.pullProgress}
        isRefreshing={pullToRefresh.isRefreshing}
      />

      {/* Celebration system */}
      <Confetti active={!!celebration?.confetti} onComplete={undefined} />
      <CelebrationBanner
        show={!!celebration}
        emoji={celebration?.emoji || '🎉'}
        title={celebration?.title || ''}
        subtitle={celebration?.subtitle}
        onDismiss={dismissCelebration}
      />

      {/* Dashboard feature tour for new users */}
      {!isViewingHistorical && <DashboardTour />}

      {/* Carousel container */}
      <div ref={containerRef} className="relative overflow-hidden">
        {/* Previous day peek (shown during swipe right) */}
        {revealingPrev && (
          <div
            className="absolute inset-y-0 right-full w-full flex items-start justify-center pt-8 pointer-events-none"
            style={{
              transform: `translateX(${swipeOffset}px)`,
              transition: swipeTransition,
            }}
          >
            <div className="text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {format(prevDate, 'EEE, MMM d')}
              </div>
              {prevDayWeight && (
                <div className="text-lg font-mono font-bold text-foreground/70 mt-1">
                  {prevDayWeight.toFixed(1)} lbs
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next day peek (shown during swipe left) */}
        {revealingNext && canGoNext && (
          <div
            className="absolute inset-y-0 left-full w-full flex items-start justify-center pt-8 pointer-events-none"
            style={{
              transform: `translateX(${swipeOffset}px)`,
              transition: swipeTransition,
            }}
          >
            <div className="text-center">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {nextDate >= today ? 'Today' : format(nextDate, 'EEE, MMM d')}
              </div>
              {nextDayWeight && (
                <div className="text-lg font-mono font-bold text-foreground/70 mt-1">
                  {nextDayWeight.toFixed(1)} lbs
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current day content */}
        <div
          {...swipeHandlers}
          style={{
            transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
            transition: swipeTransition,
          }}
        >
        {/* ═══════════════════════════════════════════════════════ */}
        {/* OFFLINE INDICATOR — Shows when network is unavailable */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!isOnline && (
          <OfflineBanner />
        )}

        {/* Competition day reminder — use Recovery tab (dismissible) - not for SPAR */}
        {!isViewingHistorical && !isSparProtocol && daysUntilWeighIn === 0 && profile.protocol !== '4' && !compDayDismissed && (
          <button
            onClick={() => {
              setCompDayDismissed(true);
              sessionStorage.setItem('compDayBannerDismissed', 'true');
              setLocation('/recovery');
            }}
            className="w-full mb-2 px-3 py-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" />
            It's weigh-in day — tap here for your Recovery protocol
          </button>
        )}
        {/* Day after weigh-in reminder — set next date - not for SPAR */}
        {!isViewingHistorical && !isSparProtocol && daysUntilWeighIn < 0 && (
          <div className="w-full mb-2 px-3 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-500 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Set your next weigh-in date in Settings ⚙️
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SIP-ONLY WARNING BANNER — Critical alert 1 day before  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!isViewingHistorical && daysUntilWeighIn === 1 && profile.protocol !== '5' && !sipOnlyDismissed && (
          <SipOnlyBanner onDismiss={() => {
            setSipOnlyDismissed(true);
            sessionStorage.setItem('sipOnlyBannerDismissed', 'true');
          }} />
        )}

        {/* Header */}
        <header className="flex justify-between items-start mb-3">
          <div className="flex-1">
            {/* Date Navigator - WHOOP style */}
            <DateNavigator
              currentDate={displayDate}
              onDateChange={handleDateChange}
              className="mb-1"
            />
            <h1 className="text-2xl font-heading font-bold uppercase italic">
              {isViewingHistorical ? "Day Review" : (
                profile.name
                  ? isSparProtocol ? `${profile.name}'s Nutrition` : `${profile.name}'s Cut`
                  : isSparProtocol ? "My Nutrition" : "The Cut"
              )}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {/* For SPAR users, show goal label */}
              {isSparProtocol ? (
                <SparProtocolSelector profile={profile} />
              ) : (
                <span className={cn("text-xs font-bold uppercase", phaseInfo.color)}>
                  {phaseInfo.label}
                </span>
              )}
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{getProtocolName()}</span>
              {/* Logging streak indicator */}
              {streak > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className={cn(
                    "text-xs font-bold flex items-center gap-0.5",
                    streak >= 7 ? "text-orange-500" : streak >= 3 ? "text-yellow-500" : "text-muted-foreground"
                  )}>
                    <Flame className={cn("w-3 h-3", streak >= 7 ? "text-orange-500" : streak >= 3 ? "text-yellow-500" : "text-muted-foreground")} />
                    {streak}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <SettingsDialog profile={profile} updateProfile={updateProfile} resetData={resetData} clearLogs={clearLogs} />
            <InfoDialog />
          </div>
        </header>

        {/* Historical View Notice */}
        {isViewingHistorical && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-yellow-500 text-xs font-bold uppercase">
                Viewing History
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDateChange(null)}
              className="h-6 text-[10px] border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/20"
            >
              Back to Today
            </Button>
          </div>
        )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TODAY CARD — Focused view for stressed athletes        */}
      {/* Shows: Target, Delta, Action, Safety Flag              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isViewingHistorical && (
        <TodayCard />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEIGHT PACE BADGE — prominent projection status for competition users */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isViewingHistorical && !isSparProtocol && daysUntilWeighIn > 0 && descentData.projectedSaturday !== null && (
        <div className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 mb-2 border",
          descentData.projectedSaturday <= profile.targetWeightClass
            ? "bg-green-500/10 border-green-500/30"
            : descentData.projectedSaturday <= profile.targetWeightClass + 1
              ? "bg-yellow-500/10 border-yellow-500/30"
              : "bg-red-500/10 border-red-500/30"
        )}>
          <div className="flex items-center gap-2">
            {descentData.projectedSaturday <= profile.targetWeightClass ? (
              <TrendingDown className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-yellow-500" />
            )}
            <div>
              <span className={cn(
                "text-xs font-bold uppercase",
                descentData.projectedSaturday <= profile.targetWeightClass
                  ? "text-green-500"
                  : descentData.projectedSaturday <= profile.targetWeightClass + 1
                    ? "text-yellow-500"
                    : "text-red-500"
              )}>
                {descentData.projectedSaturday <= profile.targetWeightClass
                  ? "On Track"
                  : descentData.projectedSaturday <= profile.targetWeightClass + 1
                    ? "Close"
                    : "Behind Pace"}
              </span>
              <p className="text-[10px] text-muted-foreground">
                Projected: <span className="font-mono font-bold text-foreground">{descentData.projectedSaturday.toFixed(1)}</span> lbs
                {' '}• Target: <span className="font-mono">{profile.targetWeightClass}</span> lbs
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={cn(
              "text-lg font-bold font-mono",
              descentData.projectedSaturday <= profile.targetWeightClass
                ? "text-green-500"
                : descentData.projectedSaturday <= profile.targetWeightClass + 1
                  ? "text-yellow-500"
                  : "text-red-500"
            )}>
              {descentData.projectedSaturday <= profile.targetWeightClass
                ? `−${(profile.targetWeightClass - descentData.projectedSaturday).toFixed(1)}`
                : `+${(descentData.projectedSaturday - profile.targetWeightClass).toFixed(1)}`}
            </span>
            <p className="text-[9px] text-muted-foreground">lbs from target</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FOCUS CARD — persistent coaching card at top (competition only) */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isViewingHistorical && !isSparProtocol && daysUntilWeighIn >= 0 && (
        <FocusCard
          dailyPriority={dailyPriority}
          statusInfo={statusInfo}
          daysUntilWeighIn={daysUntilWeighIn}
          todayMorning={todayLogs.morning}
          yesterdayMorning={yesterdayMorning}
          protocol={profile.protocol}
          targetWeight={profile.targetWeightClass}
        />
      )}

      {/* Next Cycle Prompt — shows when weigh-in has passed (competition only) */}
      {!isViewingHistorical && !isSparProtocol && (
        <NextCyclePrompt
          profile={profile}
          updateProfile={updateProfile}
          daysUntilWeighIn={daysUntilWeighIn}
        />
      )}

      {/* Missing Log Prompt */}
      {!isViewingHistorical && !todayLogs.morning && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: 'morning' } }))}
          className="w-full mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-500 text-xs font-bold">Log morning weight</span>
          </div>
          <span className="text-[10px] text-yellow-500/70">Tap to log →</span>
        </button>
      )}

      {/* First-time user welcome — zero logs ever */}
      {!isViewingHistorical && logs.length === 0 && (
        <Card className="mb-2 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <h3 className="font-heading uppercase italic text-sm text-primary mb-2">Getting Started</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold mt-px">1</span>
                <span>Log your <strong className="text-foreground/80">morning weight</strong> right when you wake up — before eating or drinking.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold mt-px">2</span>
                <span>Weigh in <strong className="text-foreground/80">before & after practice</strong> to track sweat loss.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold mt-px">3</span>
                <span>Log <strong className="text-foreground/80">before bed</strong> to calculate your overnight drift.</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-3">
              After 2-3 days, you'll unlock projections, drift patterns, and personalized insights.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TODAY'S WEIGH-IN TIMELINE — at-a-glance log status     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <TodayTimeline
        todayLogs={todayLogs}
        logs={logs}
        displayDate={displayDate}
        mostRecentLog={mostRecentLog}
        targetWeight={targetWeight}
        weightClass={profile.targetWeightClass}
        updateLog={updateLog}
        deleteLog={deleteLog}
        readOnly={isViewingHistorical}
        statusInfo={statusInfo}
        streak={streak}
        descentData={descentData}
        isSparProtocol={isSparProtocol}
        trackPracticeWeighIns={profile.trackPracticeWeighIns}
      />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* NEW USER HINT — unlock stats after logging 2+ days     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {driftMetrics.overnight === null && driftMetrics.session === null && logs.length > 0 && logs.length < 4 && (
        <div className="flex items-center gap-2 bg-muted/30 border border-muted rounded-lg px-3 py-2 mb-2">
          <Scale className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            Log <span className="font-bold text-foreground/70">2+ days</span> of morning & bedtime weights to unlock your drift & projection stats.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* INSIGHTS — hidden behind "View Stats" toggle (competition only) */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSparProtocol && insights.length > 0 && (
        <details className="mb-2 group">
          <summary className="flex items-center justify-center gap-1.5 cursor-pointer py-1 list-none [&::-webkit-details-marker]:hidden text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wide">View Stats</span>
            <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex gap-2 overflow-x-auto pb-1 pt-2 scrollbar-none -mx-1 px-1 animate-in slide-in-from-top-2 duration-200">
            {insights.map((insight, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-card border border-muted rounded-full px-3 py-1.5 shrink-0"
              >
                <span className="text-xs">{insight.emoji}</span>
                <span className={cn("text-[11px] font-medium whitespace-nowrap", insight.color)}>
                  {insight.text}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEEK OVERVIEW (with drift/practice/projected stats) - competition only */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSparProtocol && (
        <WhatsNextCard getTomorrowPlan={getTomorrowPlan} getWeeklyPlan={getWeeklyPlan} descentData={descentData} timeUntilWeighIn={daysUntilWeighIn >= 0 ? getTimeUntilWeighIn() : null} daysUntilWeighIn={daysUntilWeighIn} />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SPAR FOCUS CARD — Protocol tips and calorie summary */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparProtocol && !isViewingHistorical && (
        <SparFocusCard profile={profile} />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADAPTIVE ADJUSTMENT BANNER — suggests calorie changes on plateau */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparProtocol && !isViewingHistorical && (
        <AdaptiveAdjustmentBanner />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEEKLY COMPLIANCE CARD — macro tracking summary */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparProtocol && !isViewingHistorical && (
        <WeeklyComplianceCard />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEIGHT PROJECTION — Shows future weight over weeks */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparProtocol && !isViewingHistorical && (
        <WeightProjectionCard profile={profile} logs={logs} />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FUEL SECTION - Food & Hydration collapsed into one card */}
      {/* ═══════════════════════════════════════════════════════ */}
      <FuelCard
        macros={macros}
        todaysFoods={todaysFoods}
        foodLists={foodLists}
        hydration={hydration}
        daysUntilWeighIn={daysUntilWeighIn}
        protocol={profile.protocol}
        readOnly={isViewingHistorical}
      />

        {/* Bottom Spacing for Nav */}
        <div className="h-20" />
        </div>
      </div>
    </MobileLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE BANNER — Shows when network is unavailable
// ═══════════════════════════════════════════════════════════════════════════════
function OfflineBanner() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="mb-3 px-4 py-3 rounded-lg border border-muted bg-muted/30 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="relative">
          <WifiOff className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">You're offline</p>
          <p className="text-[11px] text-muted-foreground">Your changes are saved locally</p>
        </div>
      </div>
      <button
        onClick={handleRefresh}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all min-h-[40px]"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIP-ONLY WARNING BANNER — Prominent alert when in water restriction phase
// ═══════════════════════════════════════════════════════════════════════════════
function SipOnlyBanner({ onDismiss }: { onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3 rounded-xl border-2 border-orange-500/50 bg-gradient-to-br from-orange-500/15 via-orange-500/10 to-rose-500/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header — always visible */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* Animated droplet icon */}
            <div className="relative shrink-0 mt-0.5">
              <Droplets className="w-6 h-6 text-orange-500" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-orange-500 uppercase tracking-wide flex items-center gap-2">
                Sip Only Mode
                <span className="text-[9px] font-bold bg-orange-500/30 text-orange-400 px-1.5 py-0.5 rounded animate-pulse">
                  ACTIVE
                </span>
              </h3>
              <p className="text-sm text-foreground/80 mt-0.5 leading-snug">
                No gulping — small sips only to wet your mouth.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 -mr-1 -mt-1 rounded-lg hover:bg-orange-500/20 text-orange-400/60 hover:text-orange-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick rules — always visible */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-500 text-[11px] font-bold px-2.5 py-1 rounded-full">
            <AlertTriangle className="w-3 h-3" /> Max 8oz at a time
          </span>
          <span className="inline-flex items-center gap-1.5 bg-rose-500/20 text-rose-400 text-[11px] font-bold px-2.5 py-1 rounded-full">
            <X className="w-3 h-3" /> No full glasses
          </span>
          <span className="inline-flex items-center gap-1.5 bg-green-500/20 text-green-500 text-[11px] font-bold px-2.5 py-1 rounded-full">
            ✓ Ice chips OK
          </span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-3 text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-wide font-bold transition-colors"
        >
          {expanded ? 'Hide details' : 'Why sip only?'}
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Expanded explanation */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-orange-500/20 bg-orange-500/5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px]">💧</span>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground/90">Your kidneys are still flushing</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  After 3 days of loading, your body is in full diuresis mode. Drinking normally would add weight back.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px]">⚡</span>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground/90">Small sips won't stop the process</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Tiny amounts keep you functional while your body continues eliminating water naturally.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px]">⚠️</span>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground/90">Gulping triggers water retention</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Large drinks signal your body to slow down urine production — the opposite of what you need.
                </p>
              </div>
            </div>

            {/* Total allowed */}
            <div className="bg-muted/30 border border-muted rounded-lg p-2.5 mt-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">Total allowed today:</span> ~{' '}
                <span className="font-mono font-bold text-orange-500">12-16 oz</span> spread throughout the day.
                Track every sip in the hydration card below.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Status Explanation Tooltip — tappable to expand
function StatusExplanation({ statusInfo, className }: {
  statusInfo: { status: string; label: string; contextMessage: string };
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusCriteria = () => {
    switch (statusInfo.status) {
      case 'on-track':
        return {
          title: "ON TRACK",
          criteria: "Your current weight is at or below today's target weight.",
          guidance: "Keep following your protocol. You're on pace to make weight.",
          color: "text-green-500",
          bgColor: "bg-green-500/10 border-green-500/30"
        };
      case 'borderline':
        return {
          title: "BORDERLINE",
          criteria: "You're within 2 lbs of today's target but slightly over.",
          guidance: "Stay disciplined with nutrition. Consider adding an extra practice or workout to accelerate weight loss.",
          color: "text-yellow-500",
          bgColor: "bg-yellow-500/10 border-yellow-500/30"
        };
      case 'risk':
        return {
          title: "AT RISK",
          criteria: "You're more than 2 lbs over today's target weight.",
          guidance: "You may need extra workouts, stricter nutrition compliance, or to reconsider your weight class if this continues.",
          color: "text-red-500",
          bgColor: "bg-red-500/10 border-red-500/30"
        };
      default:
        return {
          title: "LOG WEIGHT",
          criteria: "No weight logged yet today.",
          guidance: "Log your morning weight to see your status.",
          color: "text-muted-foreground",
          bgColor: "bg-muted/30 border-muted"
        };
    }
  };

  const info = getStatusCriteria();

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wide transition-all min-h-[28px]",
          statusInfo.status === 'on-track' ? "bg-green-500/20 text-green-500 border border-green-500/30" :
          statusInfo.status === 'borderline' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" :
          statusInfo.status === 'risk' ? "bg-red-500/20 text-red-500 border border-red-500/30" :
          "bg-muted/30 text-muted-foreground border border-muted"
        )}
      >
        {statusInfo.label}
        <HelpCircle className="w-3 h-3 opacity-60" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close on tap outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Tooltip panel */}
          <div className={cn(
            "absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border p-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200",
            info.bgColor,
            "bg-card"
          )}>
            <div className="flex items-center justify-between mb-2">
              <span className={cn("font-bold text-sm", info.color)}>{info.title}</span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-0.5">Criteria</span>
                <p className="text-xs text-foreground/80">{info.criteria}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-0.5">What to do</span>
                <p className="text-xs text-foreground/80">{info.guidance}</p>
              </div>
              {statusInfo.contextMessage && statusInfo.status !== 'on-track' && (
                <div className="pt-2 border-t border-muted/50">
                  <p className="text-[11px] text-muted-foreground italic">{statusInfo.contextMessage}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Today's Weigh-In Timeline — single weigh-in hub
function TodayTimeline({
  todayLogs,
  logs,
  displayDate,
  mostRecentLog,
  targetWeight,
  weightClass,
  updateLog,
  deleteLog,
  readOnly = false,
  statusInfo,
  streak = 0,
  descentData,
  isSparProtocol = false,
  trackPracticeWeighIns = false,
}: {
  todayLogs: { morning: any; prePractice: any; postPractice: any; beforeBed: any };
  logs: any[];
  displayDate: Date;
  mostRecentLog: any;
  targetWeight: number;
  weightClass: number;
  updateLog: (id: string, data: any) => void;
  deleteLog: (id: string) => void;
  readOnly?: boolean;
  statusInfo: { status: string; label: string; contextMessage: string; recommendation?: any };
  streak?: number;
  descentData: { projectedSaturday: number | null; [key: string]: any };
  isSparProtocol?: boolean;
  trackPracticeWeighIns?: boolean;
}) {

  const { toast } = useToast();
  const [confirmDeleteCheckIn, setConfirmDeleteCheckIn] = useState<string | null>(null);

  // Get extra workouts for today (paired before/after)
  const extraWorkouts = useMemo(() => {
    const todayExtraLogs = logs.filter(log => {
      const ld = new Date(log.date);
      return (log.type === 'extra-before' || log.type === 'extra-after') &&
        ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const pairs: { before: any; after: any | null; time: Date }[] = [];
    const usedAfterIds = new Set<string>();
    for (const log of todayExtraLogs) {
      if (log.type === 'extra-before') {
        const after = todayExtraLogs.find(l =>
          l.type === 'extra-after' &&
          !usedAfterIds.has(l.id) &&
          new Date(l.date).getTime() - new Date(log.date).getTime() >= 0 &&
          new Date(l.date).getTime() - new Date(log.date).getTime() < 3 * 60 * 60 * 1000
        );
        if (after) usedAfterIds.add(after.id);
        pairs.push({ before: log, after: after || null, time: new Date(log.date) });
      }
    }
    return pairs;
  }, [logs, displayDate]);

  // Get check-ins for today
  const todayCheckIns = useMemo(() => {
    return logs.filter(log => {
      const ld = new Date(log.date);
      return log.type === 'check-in' &&
        ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [logs, displayDate]);

  // No-practice (rest day) toggle — synced through dailyTracking → Supabase
  const { getDailyTracking, updateDailyTracking } = useStore();
  const dateStr = format(displayDate, 'yyyy-MM-dd');
  const dailyTrack = getDailyTracking(dateStr);
  const noPractice = dailyTrack.noPractice ?? false;

  const toggleNoPractice = useCallback(() => {
    updateDailyTracking(dateStr, { noPractice: !noPractice });
  }, [dateStr, noPractice, updateDailyTracking]);

  // Auto-detect: if PRE or POST already logged, can't be no-practice
  const hasPracticeLog = !!todayLogs.prePractice || !!todayLogs.postPractice;

  // Practice slots expansion state - auto-expands if practice is logged
  const [practiceExpanded, setPracticeExpanded] = useState(false);

  // Auto-expand when practice log exists
  useEffect(() => {
    if (hasPracticeLog) {
      setPracticeExpanded(true);
    }
  }, [hasPracticeLog]);

  // SPAR users only see AM + BED by default, but can opt-in to practice tracking
  // Competition users: show AM + BED by default, practice slots expand on demand or when logged
  const showPracticeSlots = isSparProtocol ? trackPracticeWeighIns : (practiceExpanded || hasPracticeLog);

  // Core slots - always AM and BED
  const amBedSlots = [
    { key: 'morning', label: 'AM', icon: <Sun className="w-3 h-3" />, log: todayLogs.morning, type: 'morning', color: 'text-yellow-500', dimmed: false },
    { key: 'bed', label: 'BED', icon: <Moon className="w-3 h-3" />, log: todayLogs.beforeBed, type: 'before-bed', color: 'text-purple-500', dimmed: false },
  ];

  // Practice slots - shown when expanded
  const practiceSlots = [
    { key: 'pre', label: 'PRE', icon: <ArrowDownToLine className="w-3 h-3" />, log: todayLogs.prePractice, type: 'pre-practice', color: 'text-blue-500', dimmed: false },
    { key: 'post', label: 'POST', icon: <ArrowUpFromLine className="w-3 h-3" />, log: todayLogs.postPractice, type: 'post-practice', color: 'text-green-500', dimmed: false },
  ];

  const coreSlots = showPracticeSlots ? [
    amBedSlots[0], // AM
    ...practiceSlots, // PRE, POST
    amBedSlots[1], // BED
  ] : amBedSlots;

  const handleSlotTap = (type: string, log: any) => {
    if (log) {
      // Logged — open FAB in edit mode
      window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { editLog: log } }));
    } else {
      // Empty — open FAB for new entry (works for today and historical days)
      window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type } }));
    }
  };

  const hasExtrasOrCheckIns = extraWorkouts.length > 0 || todayCheckIns.length > 0;

  // Calculate daily loss: morning weight minus most recent weight
  const morningWeight = todayLogs.morning?.weight ?? null;
  const latestWeight = mostRecentLog?.weight ?? null;
  const dailyLoss = (morningWeight && latestWeight && mostRecentLog?.type !== 'morning')
    ? morningWeight - latestWeight
    : null;

  // Completion count for daily weigh-ins
  // - SPAR users with trackPracticeWeighIns=false: always 2 (AM/BED)
  // - SPAR users with trackPracticeWeighIns=true: 4 on practice days, 2 on rest days
  // - Competition users: 4 on practice days, 2 on rest days
  const isPracticeDay = !noPractice;
  const shouldTrackPractice = isSparProtocol ? trackPracticeWeighIns && isPracticeDay : isPracticeDay;
  const activeSlots = shouldTrackPractice ? 4 : 2;
  const completedCount = shouldTrackPractice
    ? [todayLogs.morning, todayLogs.prePractice, todayLogs.postPractice, todayLogs.beforeBed].filter(Boolean).length
    : [todayLogs.morning, todayLogs.beforeBed].filter(Boolean).length;
  const isComplete = completedCount === activeSlots;

  return (
    <div className="mb-2 space-y-1.5">
      {/* Header: Row 1 = Weight + Class + Status + Completion, Row 2 = Over + Daily Loss */}
      <div className="px-1 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {latestWeight ? (
              <span className="text-sm font-mono font-bold text-foreground">
                {latestWeight.toFixed(1)} lbs
              </span>
            ) : (
              <span className="text-sm font-mono text-muted-foreground">— lbs</span>
            )}
            {/* Only show weight class for competition users */}
            {!isSparProtocol && (
              <>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground uppercase font-bold">
                  Class: <span className="text-foreground font-mono">{weightClass}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Completion indicator */}
            <div className="flex items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/50" />
                <circle
                  cx="10" cy="10" r="8" fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(completedCount / activeSlots) * 50.27} 50.27`}
                  transform="rotate(-90 10 10)"
                  className={cn(
                    "transition-all duration-500",
                    isComplete ? "stroke-green-500" : completedCount >= 2 ? "stroke-primary" : "stroke-muted-foreground"
                  )}
                />
                {isComplete && (
                  <text x="10" y="10" textAnchor="middle" dominantBaseline="central" className="fill-green-500 text-[7px] font-bold">
                    ✓
                  </text>
                )}
              </svg>
              <span className={cn(
                "text-[11px] font-mono font-bold",
                isComplete ? "text-green-500" : completedCount > 0 ? "text-foreground" : "text-muted-foreground"
              )}>
                {completedCount}/{activeSlots}
              </span>
            </div>
            {/* ON TRACK status badge — only for competition users doing weight cuts */}
            {!isSparProtocol && <StatusExplanation statusInfo={statusInfo} />}
          </div>
        </div>
        {/* Streak + daily stats row */}
        <div className="flex items-center gap-3">
          {streak >= 2 && (
            <span className={cn(
              "text-[11px] font-bold flex items-center gap-1",
              streak >= 14 ? "text-orange-500" : streak >= 7 ? "text-yellow-500" : "text-muted-foreground"
            )}>
              <Flame className="w-3 h-3" />
              {streak} day streak
            </span>
          )}
          {/* Over class display - competition only */}
          {!isSparProtocol && latestWeight && weightClass && latestWeight > weightClass && (
            <span className={cn(
              "text-[11px] font-mono font-bold",
              latestWeight - weightClass > 5 ? "text-destructive" :
              latestWeight - weightClass > 2 ? "text-yellow-500" : "text-muted-foreground"
            )}>
              +{(latestWeight - weightClass).toFixed(1)} over class
            </span>
          )}
          {dailyLoss !== null && dailyLoss > 0 && (
            <span className="text-[11px] font-mono font-bold text-primary">
              -{dailyLoss.toFixed(1)} today
            </span>
            )}
        </div>
        {/* Simple positive feedback - competition only, no conflicting messages */}
        {!isSparProtocol && latestWeight && latestWeight <= weightClass && (
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 bg-green-500/10 border border-green-500/20">
            <span className="text-xs text-green-500">&#9733;</span>
            <span className="text-[11px] font-bold text-green-500">
              At weight — you're competition ready
            </span>
          </div>
        )}
      </div>

      {/* Core weigh-in slots */}
      <div data-tour="weigh-ins" className="bg-card border border-muted rounded-lg p-2 space-y-1.5">
        <div className={cn("grid gap-1", showPracticeSlots ? "grid-cols-4" : "grid-cols-2")}>
          {coreSlots.map((slot) => {
            const isMostRecent = mostRecentLog && slot.log && mostRecentLog.id === slot.log.id;
            const hasWeight = !!slot.log;
            const diff = hasWeight ? slot.log.weight - targetWeight : null;

            return (
              <button
                key={slot.key}
                onClick={() => handleSlotTap(slot.type, slot.log)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-all",
                  hasWeight
                    ? "hover:bg-muted/50 active:scale-95"
                    : "hover:bg-primary/10 border border-dashed border-primary/30 active:scale-95",
                  isMostRecent && "ring-1 ring-primary/40 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-1">
                  <span className={cn("opacity-70", hasWeight ? slot.color : "text-muted-foreground")}>
                    {slot.icon}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase",
                    hasWeight ? slot.color : "text-muted-foreground"
                  )}>
                    {slot.label}
                  </span>
                </div>
                {hasWeight && (
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(slot.log.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                {hasWeight ? (
                  <>
                    <span className={cn(
                      "text-[13px] font-mono",
                      isMostRecent ? "font-bold text-foreground" : "text-foreground"
                    )}>
                      {slot.log.weight.toFixed(1)}
                    </span>
                    {/* SPAR users don't see target comparison - just the weight */}
                    {!isSparProtocol && diff !== null && (
                      <span className={cn(
                        "text-[10px] font-mono",
                        diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-red-400"
                      )}>
                        {diff <= 0 ? 'on target' : `+${diff.toFixed(1)}`}
                      </span>
                    )}
                  </>
                ) : (
                  <Plus className="w-4 h-4 mt-0.5 text-primary/60" />
                )}
              </button>
            );
          })}
        </div>
        {/* Practice toggle - for competition users only */}
        {!isSparProtocol && (
          <div className="flex items-center justify-center gap-2 py-1.5">
            {/* Show/hide practice slots toggle */}
            {!hasPracticeLog && (
              <button
                onClick={() => setPracticeExpanded(!practiceExpanded)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/50 hover:bg-muted transition-colors"
              >
                {practiceExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide practice
                  </>
                ) : (
                  <>
                    <Dumbbell className="w-3 h-3" />
                    Show practice
                  </>
                )}
              </button>
            )}
            {/* Rest day toggle - only when practice not logged */}
            {!hasPracticeLog && !practiceExpanded && (
              <button
                onClick={toggleNoPractice}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors",
                  noPractice
                    ? "text-purple-600 bg-purple-500/15 hover:bg-purple-500/25"
                    : "text-muted-foreground bg-muted/50 hover:bg-muted"
                )}
              >
                <Moon className="w-3 h-3" />
                {noPractice ? "Rest day" : "Rest day?"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Today's Weight Journey — mini sparkline connecting logged weights */}
      {completedCount >= 2 && (() => {
        const points = coreSlots
          .map((s, i) => s.log ? { x: i, w: s.log.weight, label: s.label, color: s.color } : null)
          .filter(Boolean) as { x: number; w: number; label: string; color: string }[];
        if (points.length < 2) return null;
        const weights = points.map(p => p.w);
        const minW = Math.min(...weights) - 0.3;
        const maxW = Math.max(...weights) + 0.3;
        const range = maxW - minW || 1;
        const svgW = 280;
        const svgH = 54;
        const padX = 16;
        const padTop = 18;
        const padBot = 8;
        const toX = (i: number) => padX + (i / 3) * (svgW - padX * 2);
        const toY = (w: number) => svgH - padBot - ((w - minW) / range) * (svgH - padTop - padBot);
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x)},${toY(p.w)}`).join(' ');
        const totalDrop = points[0].w - points[points.length - 1].w;

        return (
          <div className="bg-card border border-muted rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Today's Journey</span>
              {totalDrop > 0 && (
                <span className="text-[10px] font-mono font-bold text-primary">-{totalDrop.toFixed(1)} lbs</span>
              )}
            </div>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-12">
              {/* Target line */}
              <line
                x1={padX} y1={toY(targetWeight)} x2={svgW - padX} y2={toY(targetWeight)}
                stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" strokeDasharray="4 3" opacity={0.3}
              />
              {/* Connecting line */}
              <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* Dots + labels */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={toX(p.x)} cy={toY(p.w)} r="4" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
                  <text x={toX(p.x)} y={toY(p.w) - 7} textAnchor="middle" className="fill-foreground text-[8px] font-mono font-bold">
                    {p.w.toFixed(1)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        );
      })()}

      {/* Extras & Check-ins — collapsible under core slots */}
      {hasExtrasOrCheckIns && (
        <details className="group">
          <summary className="flex items-center justify-center gap-2 cursor-pointer py-1 list-none [&::-webkit-details-marker]:hidden">
            <span className="text-[9px] text-muted-foreground uppercase font-bold">
              {extraWorkouts.length > 0 && `${extraWorkouts.length} extra`}
              {extraWorkouts.length > 0 && todayCheckIns.length > 0 && ' · '}
              {todayCheckIns.length > 0 && `${todayCheckIns.length} check-in`}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-1.5 pt-1">
            {extraWorkouts.map((workout, i) => {
              const loss = workout.after ? workout.before.weight - workout.after.weight : null;
              return (
                <button
                  key={`extra-${i}`}
                  onClick={() => {
                    if (!readOnly) {
                      window.dispatchEvent(new CustomEvent('open-quick-log', {
                        detail: { editExtraWorkout: { before: workout.before, after: workout.after } }
                      }));
                    }
                  }}
                  className="w-full flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-3 h-3 text-orange-500" />
                    <span className="text-[11px] font-bold text-orange-500">Extra</span>
                    <span className="text-[10px] text-muted-foreground">{format(workout.time, 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-foreground">
                      {workout.before.weight} → {workout.after ? workout.after.weight : '…'}
                    </span>
                    {loss !== null && loss > 0 && (
                      <span className="text-[10px] font-bold font-mono text-primary">-{loss.toFixed(1)}</span>
                    )}
                    {!readOnly && (
                      <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    )}
                  </div>
                </button>
              );
            })}
            {todayCheckIns.map((ci) => {
              const diff = ci.weight - targetWeight;
              return (
                <div key={ci.id} className="flex items-center justify-between bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Scale className="w-3 h-3 text-cyan-500" />
                    <span className="text-[10px] font-bold text-cyan-500">Check-in</span>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(ci.date), 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-foreground">{ci.weight.toFixed(1)}</span>
                    <span className={cn(
                      "text-[9px] font-mono",
                      diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-red-400"
                    )}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </span>
                    {!readOnly && (
                      confirmDeleteCheckIn === ci.id ? (
                        <button
                          onClick={() => {
                            deleteLog(ci.id);
                            setConfirmDeleteCheckIn(null);
                            toast({ title: "Deleted", description: "Check-in removed" });
                          }}
                          className="px-2 py-0.5 rounded bg-destructive/20 text-destructive text-[10px] font-bold animate-pulse"
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmDeleteCheckIn(ci.id);
                            setTimeout(() => setConfirmDeleteCheckIn(null), 3000);
                          }}
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// Persistent Focus coaching card — always visible at top of dashboard
function FocusCard({ dailyPriority, statusInfo, daysUntilWeighIn, todayMorning, yesterdayMorning, protocol, targetWeight }: {
  dailyPriority: { priority: string; urgency: string; subtext?: string };
  statusInfo: { status: string; label: string; contextMessage: string; recommendation?: any };
  daysUntilWeighIn: number;
  todayMorning: any;
  yesterdayMorning: any;
  protocol: string;
  targetWeight: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const urgencyColor = dailyPriority.urgency === 'critical' ? 'text-red-500' :
    dailyPriority.urgency === 'high' ? 'text-yellow-500' : 'text-primary';
  const urgencyBorder = dailyPriority.urgency === 'critical' ? 'border-red-500/30' :
    dailyPriority.urgency === 'high' ? 'border-yellow-500/30' : 'border-primary/20';
  const urgencyBg = dailyPriority.urgency === 'critical' ? 'bg-red-500/5' :
    dailyPriority.urgency === 'high' ? 'bg-yellow-500/5' : 'bg-primary/5';

  // Progress since yesterday
  const progressDiff = todayMorning && yesterdayMorning
    ? todayMorning.weight - yesterdayMorning.weight
    : null;

  // Protocol-specific daily tip based on days out
  const getDailyTip = (): string | null => {
    if (protocol === '1') {
      // Body Comp Phase tips
      if (daysUntilWeighIn >= 6) return "Fructose window: fruit within 30 min of waking. Zero protein for first 4 hours.";
      if (daysUntilWeighIn === 5) return "Water loading starts today — drink 1.5 gal. Sodium: 3-5g.";
      if (daysUntilWeighIn === 4) return "Peak water day tomorrow. Keep hitting fructose targets.";
      if (daysUntilWeighIn === 3) return "Peak water: 1.5 gal. Your body is flushing — trust the process.";
    } else if (protocol === '2') {
      // Make Weight Phase tips
      if (daysUntilWeighIn >= 6) return "Follow your macro targets. Recovery is priority — protein within 30 min of practice.";
      if (daysUntilWeighIn === 5) return "Water loading begins — 1.5 gal today. Sodium up to 3-5g.";
      if (daysUntilWeighIn === 4) return "Continue loading. High water + sodium suppresses ADH hormone.";
      if (daysUntilWeighIn === 3) return "Final load day. Tomorrow your body starts flushing — ADH is suppressed.";
    } else if (protocol === '3') {
      // Hold Weight Phase tips
      if (daysUntilWeighIn >= 6) return "Balanced nutrition: 40C/35P/25F. Train hard, recover harder.";
      if (daysUntilWeighIn === 5) return "Start hydration focus — consistent water intake keeps you competition-ready.";
    } else if (protocol === '4') {
      // Build Phase tips
      if (daysUntilWeighIn >= 6) return "Protein target: 1.0-1.2 g/lb. Pair carbs with protein post-training.";
      if (daysUntilWeighIn <= 5 && daysUntilWeighIn >= 3) return "Competition week approaching — shift to maintenance calories.";
    }
    // Cut/compete day tips handled by priority message
    return null;
  };

  const dailyTip = getDailyTip();
  const rec = statusInfo.recommendation;

  return (
    <div data-tour="daily-coach" className={cn("rounded-lg border mb-2 overflow-hidden transition-all", urgencyBorder, urgencyBg)}>
      {/* Collapsed: always-visible coaching strip */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Zap className={cn("w-4 h-4 shrink-0 mt-0.5", urgencyColor)} />
            <div className="min-w-0">
              <p className={cn("text-xs font-bold leading-tight", urgencyColor)}>
                {dailyPriority.priority}
              </p>
              {/* Quick stats row — always visible (status badge removed - shown in Weight Pace Badge above) */}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {/* Progress since yesterday */}
                {progressDiff !== null && (
                  <span className={cn(
                    "text-[11px] font-mono font-bold flex items-center gap-0.5",
                    progressDiff < 0 ? "text-green-500" : progressDiff > 0 ? "text-red-400" : "text-muted-foreground"
                  )}>
                    {progressDiff < 0 ? <TrendingDown className="w-3 h-3" /> : progressDiff > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                    {progressDiff > 0 ? '+' : ''}{progressDiff.toFixed(1)} lbs vs yesterday
                  </span>
                )}
                {/* Workouts needed */}
                {rec && rec.extraWorkoutsNeeded > 0 && (
                  <span className="text-[11px] font-bold text-orange-400 flex items-center gap-0.5">
                    <Dumbbell className="w-3 h-3" />
                    {rec.extraWorkoutsNeeded} workout{rec.extraWorkoutsNeeded > 1 ? 's' : ''} needed
                  </span>
                )}
              </div>
              {/* Explain estimate updates on loading days */}
              {rec && rec.extraWorkoutsNeeded > 0 && daysUntilWeighIn >= 3 && (
                <p className="text-[10px] text-muted-foreground/60 mt-1 ml-6">
                  Based on your avg sweat rate — updates as you log
                </p>
              )}
            </div>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          }
        </div>
      </button>

      {/* Expanded: full detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-muted/50 pt-2.5" />

          {/* Projection & workout detail */}
          {dailyPriority.subtext && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {dailyPriority.subtext}
            </p>
          )}

          {/* Fiber warning for cut days */}
          {(daysUntilWeighIn === 1 || daysUntilWeighIn === 2) && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-orange-400">
                No vegetables, fruits with skin, whole grains, or beans. Check every ingredient.
              </p>
            </div>
          )}

          {/* Status context */}
          <p className="text-[11px] text-muted-foreground">
            {statusInfo.contextMessage}
          </p>

          {/* Protocol tip */}
          {dailyTip && (
            <div className="flex items-start gap-2 bg-muted/30 rounded-md px-2.5 py-2">
              <Flame className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-bold text-foreground/70">Tip: </span>
                {dailyTip}
              </p>
            </div>
          )}

          {/* Extra workout action */}
          {rec && rec.extraWorkoutsNeeded > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: 'extra-workout' } }));
              }}
              className="w-full h-8 text-[11px] border-muted-foreground/30"
            >
              <Dumbbell className="w-3.5 h-3.5 mr-2" />
              Log Extra Workout
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoDialog() {
  const { getFoodLists } = useStore();
  const fuelTanks = getFoodLists().fuelTanks;

  const tankColors: Record<string, string> = {
    'Water': 'text-cyan-500',
    'Glycogen': 'text-primary',
    'Gut Content': 'text-yellow-500',
    'Fat': 'text-orange-500',
    'Muscle': 'text-destructive',
  };

  const costColors: Record<string, string> = {
    'High': 'bg-destructive/20 text-destructive',
    'None': 'bg-green-500/20 text-green-500',
    'Critical': 'bg-red-600/30 text-red-400',
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Info className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95%] max-w-lg rounded-xl bg-card border-muted max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-xl">System Guide</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-4 text-sm">
          {/* The 5 Fuel Tanks */}
          <div className="space-y-3">
            <h4 className="font-bold text-base uppercase tracking-wide">The 5 Fuel Tanks</h4>
            <p className="text-xs text-muted-foreground">
              Your body weight consists of 5 distinct "tanks" that change at different rates with different performance impacts. We manage weight by manipulating these in order of performance cost.
            </p>

            <div className="space-y-2">
              {fuelTanks?.map((tank: any, i: number) => (
                <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={cn("font-bold", tankColors[tank.name] || 'text-foreground')}>
                      {i + 1}. {tank.name}
                    </span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", costColors[tank.performanceCost] || 'bg-muted')}>
                      {tank.performanceCost} COST
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block">How Fast You Lose</span>
                      <span className="font-medium">{tank.loseRate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">How Fast It Refills</span>
                      <span className="font-medium">{tank.replenishRate}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground border-t border-muted pt-1.5 mt-1">
                    <span className="font-bold text-foreground">Performance Decline: </span>
                    {tank.declinePoint}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Steps */}
          <div className="space-y-2 border-t border-muted pt-4">
            <h4 className="font-bold">Daily Steps:</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>Log your morning weight</li>
              <li>Follow the fuel guide for what to eat</li>
              <li>Hit your hydration target</li>
              <li>Log pre-practice and post-practice weights</li>
              <li>Log before bed weight</li>
              <li>Add extra workouts if needed</li>
            </ol>
          </div>

          {/* The Protocols */}
          <div className="space-y-2 border-t border-muted pt-4">
            <h4 className="font-bold">The Protocols:</h4>
            <ul className="space-y-2 text-muted-foreground text-xs">
              <li><strong className="text-destructive">Body Comp:</strong> Aggressive fat loss (2-4 weeks max)</li>
              <li><strong className="text-primary">Make Weight:</strong> Weekly competition cut</li>
              <li><strong className="text-primary">Hold Weight:</strong> Maintain at walk-around weight</li>
              <li><strong className="text-primary">Build:</strong> Off-season muscle gain</li>
            </ul>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

// Visual Weekly Calendar with tap-to-expand day details
function WhatsNextCard({ getTomorrowPlan, getWeeklyPlan, descentData, timeUntilWeighIn, daysUntilWeighIn }: {
  getTomorrowPlan: () => any;
  getWeeklyPlan: () => any[];
  descentData: {
    avgOvernightDrift: number | null;
    avgDriftRateOzPerHr: number | null;
    avgPracticeLoss: number | null;
    avgSweatRateOzPerHr: number | null;
    projectedSaturday: number | null;
    targetWeight: number;
  };
  timeUntilWeighIn: string | null;
  daysUntilWeighIn: number;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const weekPlan = getWeeklyPlan();

  const selectedDayData = selectedDay !== null ? weekPlan[selectedDay] : null;

  // Find the weigh-in day for the summary
  const weighInDay = weekPlan.find(d => d.phase === 'Competition') || weekPlan[weekPlan.length - 1];

  // Summary text for collapsed view
  const getSummaryText = () => {
    if (descentData.projectedSaturday === null) {
      return `${daysUntilWeighIn} days to weigh-in`;
    }
    const diff = descentData.projectedSaturday - descentData.targetWeight;
    if (diff <= 0) {
      return `On pace for ${descentData.projectedSaturday.toFixed(1)} lbs ${weighInDay?.day || 'Saturday'}`;
    } else if (diff <= 1) {
      return `Projected ${descentData.projectedSaturday.toFixed(1)} lbs — close`;
    } else {
      return `Projected ${descentData.projectedSaturday.toFixed(1)} lbs ${weighInDay?.day || 'Saturday'}`;
    }
  };

  const projectionColor = descentData.projectedSaturday === null ? 'text-muted-foreground' :
    descentData.projectedSaturday <= descentData.targetWeight ? 'text-green-500' :
    descentData.projectedSaturday <= descentData.targetWeight * 1.01 ? 'text-yellow-500' : 'text-orange-500';

  return (
    <div className="space-y-2 mt-2">
      <Card data-tour="countdown" className="border-muted overflow-hidden">
        <CardContent className="p-0">
          {/* Collapsed Header - always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm uppercase tracking-wide">The Countdown</h4>
              {timeUntilWeighIn && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  {timeUntilWeighIn}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-[11px] font-bold", projectionColor)}>
                {getSummaryText()}
              </span>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
            </div>
          </button>

          {/* Expanded Content */}
          {isExpanded && (
            <div className="animate-in slide-in-from-top-2 duration-200">

          {/* Stats Row */}
          {(descentData.avgOvernightDrift !== null || descentData.avgPracticeLoss !== null || descentData.projectedSaturday !== null) && (
            <div className="flex items-center justify-around px-3 pb-3">
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground uppercase block mb-0.5">
                  Drift
                  <HelpTip
                    title="Overnight Drift"
                    description="Weight lost while sleeping from breathing and metabolism. The rate (lbs/hr) lets you estimate for any sleep duration. E.g., 0.15 lbs/hr × 8 hrs = 1.2 lbs."
                  />
                </span>
                <span className={cn(
                  "font-mono font-bold text-lg",
                  descentData.avgOvernightDrift !== null ? "text-cyan-500" : "text-muted-foreground"
                )}>
                  {descentData.avgOvernightDrift !== null
                    ? `-${Math.abs(descentData.avgOvernightDrift).toFixed(1)}`
                    : '—'}
                </span>
                {descentData.avgDriftRateOzPerHr !== null && (
                  <span className="block text-[10px] font-mono text-cyan-400">
                    {descentData.avgDriftRateOzPerHr.toFixed(2)} lbs/hr
                  </span>
                )}
              </div>
              <div className="w-px h-8 bg-muted" />
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground uppercase block mb-0.5">
                  Practice
                  <HelpTip
                    title="Practice Loss"
                    description="Average weight lost per practice session from sweating. The rate (lbs/hr) lets you estimate for any workout length. E.g., 1.4 lbs/hr × 0.75 hr = 1.05 lbs."
                  />
                </span>
                <span className={cn(
                  "font-mono font-bold text-lg",
                  descentData.avgPracticeLoss !== null ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {descentData.avgPracticeLoss !== null
                    ? `-${Math.abs(descentData.avgPracticeLoss).toFixed(1)}`
                    : '—'}
                </span>
                {descentData.avgSweatRateOzPerHr !== null && (
                  <span className="block text-[10px] font-mono text-orange-400">
                    {descentData.avgSweatRateOzPerHr.toFixed(2)} lbs/hr
                  </span>
                )}
              </div>
              <div className="w-px h-8 bg-muted" />
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground uppercase block mb-0.5">
                  Projected
                  <HelpTip
                    title="Projected Weigh-In"
                    description={daysUntilWeighIn >= 3
                      ? "Estimated weigh-in weight based on drift and practice loss. During loading, this is naturally high — most of the drop happens in the final 2 days when you cut water and food."
                      : "Estimated weight at weigh-in day based on your drift, practice loss, and remaining days. Green = on track to make weight."
                    }
                  />
                </span>
                <span className={cn(
                  "font-mono font-bold text-lg",
                  descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight
                    ? "text-green-500"
                    : descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight * 1.03
                      ? "text-orange-500"
                      : descentData.projectedSaturday !== null ? "text-red-500" : "text-muted-foreground"
                )}>
                  {descentData.projectedSaturday !== null ? descentData.projectedSaturday.toFixed(1) : '—'}
                </span>
                {daysUntilWeighIn >= 3 && descentData.projectedSaturday !== null && descentData.projectedSaturday > descentData.targetWeight && (
                  <span className="block text-[9px] text-muted-foreground/60 mt-0.5">
                    Loading — big drop comes {format(addDays(new Date(), daysUntilWeighIn - 2), 'EEE')}–{format(addDays(new Date(), daysUntilWeighIn - 1), 'EEE')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phase Timeline — continuous gradient bar */}
          <div className="flex h-1.5 mx-3 rounded-full overflow-hidden mb-3">
            {weekPlan.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 relative",
                  getPhaseStyle(day.phase).bg || 'bg-muted',
                  i === 0 && "rounded-l-full",
                  i === weekPlan.length - 1 && "rounded-r-full"
                )}
              >
                {day.isToday && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-full border-2 border-primary shadow-sm" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Day Cards — clean grid */}
          <div className={cn(
            "flex px-2 pb-3 gap-1",
            weekPlan.length > 7 ? "overflow-x-auto scrollbar-none" : ""
          )}>
            {weekPlan.map((day, idx) => {
              const colors = getPhaseStyle(day.phase);
              const isSelected = selectedDay === idx;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(isSelected ? null : idx)}
                  className={cn(
                    weekPlan.length <= 7 ? "flex-1" : "min-w-[48px] flex-shrink-0",
                    "flex flex-col items-center py-2 px-0.5 rounded-xl transition-all",
                    day.isToday && !isSelected && "bg-primary/10 ring-1.5 ring-primary/40",
                    isSelected && "bg-primary/15 ring-2 ring-primary",
                    !isSelected && !day.isToday && "hover:bg-muted/40 active:bg-muted/60"
                  )}
                >
                  {/* Day abbrev */}
                  <span className={cn(
                    "text-[11px] font-bold uppercase leading-none",
                    day.isToday ? "text-primary" : isSelected ? "text-primary" : "text-muted-foreground"
                  )}>
                    {day.day.slice(0, 3)}
                  </span>

                  {/* Date number */}
                  <span className={cn(
                    "text-[10px] leading-none mt-0.5",
                    day.isToday ? "text-primary/70" : "text-muted-foreground/60"
                  )}>
                    {(() => {
                      if (!day.date) return '';
                      const d = new Date(day.date);
                      return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
                    })()}
                  </span>

                  {/* Phase color strip */}
                  <div className={cn(
                    "w-full h-0.5 rounded-full my-1.5",
                    colors.bg || 'bg-muted'
                  )} />

                  {/* Weight */}
                  <span className={cn(
                    "font-mono text-sm font-bold leading-none",
                    day.isToday ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {day.weightTarget}
                  </span>

                  {/* Badge */}
                  {day.isToday && (
                    <span className="text-[8px] bg-primary text-primary-foreground px-1.5 py-px rounded-full mt-1.5 font-bold uppercase tracking-wide">
                      Today
                    </span>
                  )}
                  {day.isTomorrow && !day.isToday && (
                    <span className="text-[8px] bg-muted text-muted-foreground px-1.5 py-px rounded-full mt-1.5 font-bold uppercase tracking-wide">
                      Next
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Expanded Day Detail */}
          {selectedDayData && (
            <div className={cn(
              "border-t border-muted animate-in slide-in-from-top-2 duration-200"
            )}>
              <div className="p-4">
                {/* Day header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h5 className="font-bold text-base">
                      {selectedDayData.day}
                      {selectedDayData.date && (
                        <span className="text-sm text-muted-foreground font-normal ml-2">
                          {(() => {
                            const d = new Date(selectedDayData.date);
                            return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
                          })()}
                        </span>
                      )}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={cn("w-2 h-2 rounded-full", getPhaseStyle(selectedDayData.phase).bg)} />
                      <span className={cn(
                        "text-xs font-bold uppercase",
                        getPhaseStyle(selectedDayData.phase).text || 'text-primary'
                      )}>
                        {selectedDayData.phase}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/50"
                  >
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  </button>
                </div>

                {/* Info grid — 2×2 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Target</span>
                    </div>
                    <span className="font-mono font-bold text-lg">{selectedDayData.weightTarget} <span className="text-sm text-muted-foreground">lbs</span></span>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Droplets className="w-3.5 h-3.5 text-cyan-500" />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Water</span>
                    </div>
                    <span className="font-mono font-bold text-lg text-cyan-500">{selectedDayData.water.amount}</span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase block",
                      selectedDayData.water.type === 'Sip Only' ? "text-orange-500" : "text-muted-foreground"
                    )}>
                      {selectedDayData.water.type}
                    </span>
                  </div>

                  {selectedDayData.weightWarning && (
                    <div className="col-span-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-1">
                      <p className="text-[11px] text-destructive font-bold leading-snug">
                        ⚠️ {selectedDayData.weightWarning}
                      </p>
                    </div>
                  )}

                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Flame className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Carbs</span>
                    </div>
                    <span className={cn(
                      "font-mono font-bold text-lg",
                      selectedDayData.weightWarning ? "text-destructive" : "text-primary"
                    )}>
                      {selectedDayData.carbs.min === 0 && selectedDayData.carbs.max === 0
                        ? <span className="text-sm font-bold">DO NOT EAT</span>
                        : <>{selectedDayData.carbs.min}-{selectedDayData.carbs.max}<span className="text-sm">g</span></>}
                    </span>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Dumbbell className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Protein</span>
                    </div>
                    <span className={cn(
                      "font-mono font-bold text-lg",
                      selectedDayData.protein.min === 0 ? "text-destructive" : "text-orange-500"
                    )}>
                      {selectedDayData.protein.min === 0 && selectedDayData.protein.max === 0
                        ? <span className="text-sm font-bold">DO NOT EAT</span>
                        : selectedDayData.protein.min === selectedDayData.protein.max
                        ? <>{selectedDayData.protein.min}<span className="text-sm">g</span></>
                        : <>{selectedDayData.protein.min}-{selectedDayData.protein.max}<span className="text-sm">g</span></>}
                    </span>
                    {selectedDayData.protein.min === 0 && selectedDayData.protein.max > 0 && (
                      <span className="text-[10px] text-destructive block font-bold">NO PROTEIN</span>
                    )}
                  </div>
                </div>

                {/* Phase tip */}
                <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                  {selectedDayData.phase === 'Load' && "Water loading — drink consistently throughout the day to trigger natural diuresis."}
                  {selectedDayData.phase === 'Prep' && "Prep day — zero fiber, full water. Last day of normal drinking before the cut."}
                  {selectedDayData.phase === 'Cut' && "Cutting phase — sip only. Follow protocol strictly. Monitor weight drift carefully."}
                  {selectedDayData.phase === 'Compete' && "Competition day — fast carbs between matches. Rehydrate with electrolytes."}
                  {selectedDayData.phase === 'Recover' && "Recovery day — high protein to repair muscle. Eat freely to refuel."}
                  {selectedDayData.phase === 'Train' && "Training day — maintain consistent nutrition and hydration."}
                  {selectedDayData.phase === 'Maintain' && "Maintenance phase — stay at walk-around weight with balanced nutrition."}
                </p>
              </div>
            </div>
          )}

          {/* Phase Legend — pill style (inside expanded) */}
          <div className="flex flex-wrap justify-center gap-2 px-2 pb-3">
            {['Load', 'Prep', 'Cut', 'Compete', 'Recover'].map((phase) => (
              <div key={phase} className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-full">
                <div className={cn("w-2 h-2 rounded-full", getPhaseStyle(phase).bg)} />
                <span className="text-[11px] text-muted-foreground font-medium">{phase}</span>
              </div>
            ))}
          </div>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




