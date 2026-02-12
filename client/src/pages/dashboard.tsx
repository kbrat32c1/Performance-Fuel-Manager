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
  TrendingDown, TrendingUp, HelpCircle, X, WifiOff, RefreshCw, Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { getPhaseStyleForDaysUntil, PHASE_STYLES, getPhaseStyle } from "@/lib/phase-colors";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SettingsDialog, FuelCard, DateNavigator, NextCyclePrompt } from "@/components/dashboard";
import { useToast } from "@/hooks/use-toast";
import { useCarouselSwipe } from "@/hooks/use-carousel-swipe";
import { useOnlineStatus } from "@/hooks/use-online-status";
// pull-to-refresh removed
import { HelpTip } from "@/components/ui/help-tip";
import { Confetti, CelebrationBanner } from "@/components/ui/confetti";
// pull-to-refresh indicator removed
import { useCelebrations } from "@/hooks/use-celebrations";
import { DashboardTour } from "@/components/dashboard/tour";
import { DashboardSkeleton } from "@/components/ui/dashboard-skeletons";
import { SwipeableRow } from "@/components/ui/swipeable-row";
import { AiCoachProactive } from "@/components/ai-coach-proactive";
import { CutScoreGauge } from "@/components/dashboard/cut-score-gauge";
import { ProtocolSwitchBanner } from "@/components/dashboard/protocol-switch-banner";

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

  const targets = getSliceTargets();
  const goal = profile.sparGoal || 'maintain';

  // V2 goal-based display
  const goalLabel = goal === 'lose' ? 'Losing Weight' : goal === 'gain' ? 'Gaining Weight' : 'Maintaining';
  const goalShortName = goal === 'lose' ? 'Fat Loss' : goal === 'gain' ? 'Building' : 'Maintain';
  const calorieAdj = targets.calorieAdjustment || 0;

  // V2 goal-appropriate tips
  const tips = goal === 'lose' ? [
    'Protein keeps you full longer — hit your palm targets',
    'Fill up on veggies for volume without extra calories',
    'Stay hydrated — thirst often feels like hunger',
  ] : goal === 'gain' ? [
    'Eat in a slight surplus for lean gains',
    'Protein at every meal for muscle synthesis',
    'Don\'t skip carbs — they fuel muscle growth',
  ] : [
    'Spread meals evenly throughout the day',
    'Balance each meal with protein, carbs, and veggies',
    'Stay consistent with portion sizes',
  ];

  const iconColor = goal === 'lose' ? 'text-orange-500' : goal === 'gain' ? 'text-green-500' : 'text-blue-500';
  const bgColor = goal === 'lose' ? 'from-orange-500/10' : goal === 'gain' ? 'from-green-500/10' : 'from-blue-500/10';

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
              {goalShortName}
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
              <span className="text-amber-500">{targets.carbGramsTotal || '—'}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-orange-500">{targets.proteinGrams || '—'}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-blue-400">{targets.fatGrams || '—'}</span>
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">C/P/F (grams)</div>
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

            {/* Goal context */}
            <div className="mt-3 p-2 bg-muted/20 rounded-lg">
              <p className="text-[9px] text-muted-foreground">
                <span className="font-bold">Goal:</span> {goalLabel}
                {calorieAdj !== 0 && ` (${calorieAdj > 0 ? '+' : ''}${calorieAdj} cal/day)`}
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
// TODAY FLOW — Simplified horizontal timeline (AM → PRE → POST → BED)
// Adapts to: practice days (4 slots), rest days (2 slots), competition day
// ═══════════════════════════════════════════════════════════════════════════════
function TodayFlow({
  todayLogs,
  onSlotTap,
  isRestDay,
  onToggleRestDay,
  isCompetitionDay,
  isGeneralNutrition,
}: {
  todayLogs: { morning: any; prePractice: any; postPractice: any; beforeBed: any; weighIn: any };
  onSlotTap: (type: string, log: any) => void;
  isRestDay: boolean;
  onToggleRestDay: () => void;
  isCompetitionDay: boolean;
  isGeneralNutrition: boolean;
}) {
  const { logs, profile, deleteLog } = useStore();
  const { toast } = useToast();
  const [confirmDeleteCheckIn, setConfirmDeleteCheckIn] = useState<string | null>(null);

  // Extra workouts today (before/after pairs)
  const extraWorkouts = useMemo(() => {
    const today = new Date();
    const todayExtras = logs.filter(l => {
      const ld = new Date(l.date);
      return (l.type === 'extra-before' || l.type === 'extra-after') &&
        ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    const befores = todayExtras.filter(l => l.type === 'extra-before').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const usedAfterIds = new Set<string>();
    const pairs: { before: any; after: any | null; time: Date }[] = [];
    for (const log of befores) {
      const after = todayExtras.find(l =>
        l.type === 'extra-after' &&
        !usedAfterIds.has(l.id) &&
        new Date(l.date).getTime() - new Date(log.date).getTime() >= 0 &&
        new Date(l.date).getTime() - new Date(log.date).getTime() < 3 * 60 * 60 * 1000
      );
      if (after) usedAfterIds.add(after.id);
      pairs.push({ before: log, after: after || null, time: new Date(log.date) });
    }
    return pairs;
  }, [logs]);

  // Check-ins today
  const todayCheckIns = useMemo(() => {
    const today = new Date();
    return logs.filter(log => {
      const ld = new Date(log.date);
      return log.type === 'check-in' &&
        ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [logs]);

  const hasExtrasOrCheckIns = extraWorkouts.length > 0 || todayCheckIns.length > 0;

  // Calculate practice loss for POST slot display
  const preWeight = todayLogs.prePractice?.weight ?? null;
  const postWeight = todayLogs.postPractice?.weight ?? null;
  const practiceLoss = (preWeight && postWeight) ? preWeight - postWeight : null;
  const practiceDuration = todayLogs.postPractice?.duration ?? null;
  const sweatRate = (practiceLoss && practiceDuration && practiceDuration > 0)
    ? practiceLoss / (practiceDuration / 60)
    : null;

  // Has practice logs? If so, can't be a rest day
  const hasPracticeLog = !!todayLogs.prePractice || !!todayLogs.postPractice;

  // All possible slots
  const allSlots = [
    { key: 'morning', label: 'AM', icon: <Sun className="w-3 h-3" />, log: todayLogs.morning, type: 'morning', color: 'text-yellow-500' },
    { key: 'pre', label: 'PRE', icon: <ArrowDownToLine className="w-3 h-3" />, log: todayLogs.prePractice, type: 'pre-practice', color: 'text-blue-500' },
    { key: 'post', label: 'POST', icon: <ArrowUpFromLine className="w-3 h-3" />, log: todayLogs.postPractice, type: 'post-practice', color: 'text-green-500' },
    { key: 'bed', label: 'BED', icon: <Moon className="w-3 h-3" />, log: todayLogs.beforeBed, type: 'before-bed', color: 'text-purple-500' },
  ];

  // Competition day: show AM wake-up + Official Weigh-In + BED (all optional)
  if (isCompetitionDay) {
    const morningLog = todayLogs.morning;
    const weighInLog = todayLogs.weighIn;
    const bedLog = todayLogs.beforeBed;
    return (
      <div className="mb-4">
        <div className="text-center mb-3">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-500 text-xs font-bold uppercase">
            <Target className="w-3.5 h-3.5" />
            Competition Day
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {/* AM Wake-up weight (optional) */}
          <button
            onClick={() => onSlotTap('morning', morningLog)}
            className={cn(
              "flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95",
              morningLog
                ? "bg-yellow-500/10 border-2 border-yellow-500/40"
                : "bg-muted/30 border-2 border-dashed border-muted-foreground/20"
            )}
          >
            <Sun className={cn("w-4 h-4 mb-1", morningLog ? "text-yellow-500" : "text-muted-foreground/40")} />
            <span className={cn("text-[9px] font-bold uppercase tracking-wide mb-0.5", morningLog ? "text-yellow-500" : "text-muted-foreground/60")}>
              {morningLog ? "AM ✓" : "AM"}
            </span>
            {morningLog ? (
              <span className="text-base font-mono font-bold">{morningLog.weight.toFixed(1)}</span>
            ) : (
              <span className="text-[9px] text-muted-foreground/40">Optional</span>
            )}
          </button>

          {/* Official Weigh-In (primary) */}
          <button
            onClick={() => onSlotTap('weigh-in', weighInLog)}
            className={cn(
              "flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95",
              weighInLog
                ? "bg-green-500/10 border-2 border-green-500/40"
                : "bg-muted/30 border-2 border-dashed border-yellow-500/40"
            )}
          >
            <Scale className={cn("w-4 h-4 mb-1", weighInLog ? "text-green-500" : "text-yellow-500/50")} />
            <span className={cn("text-[9px] font-bold uppercase tracking-wide mb-0.5", weighInLog ? "text-green-500" : "text-yellow-500")}>
              {weighInLog ? "Official ✓" : "Weigh-In"}
            </span>
            {weighInLog ? (
              <span className="text-base font-mono font-bold">{weighInLog.weight.toFixed(1)}</span>
            ) : (
              <span className="text-[9px] text-muted-foreground">Tap to log</span>
            )}
          </button>

          {/* Before Bed (optional — recovery tracking) */}
          <button
            onClick={() => onSlotTap('before-bed', bedLog)}
            className={cn(
              "flex flex-col items-center py-3 px-2 rounded-xl transition-all active:scale-95",
              bedLog
                ? "bg-purple-500/10 border-2 border-purple-500/40"
                : "bg-muted/30 border-2 border-dashed border-muted-foreground/20"
            )}
          >
            <Moon className={cn("w-4 h-4 mb-1", bedLog ? "text-purple-500" : "text-muted-foreground/40")} />
            <span className={cn("text-[9px] font-bold uppercase tracking-wide mb-0.5", bedLog ? "text-purple-500" : "text-muted-foreground/60")}>
              {bedLog ? "BED ✓" : "BED"}
            </span>
            {bedLog ? (
              <span className="text-base font-mono font-bold">{bedLog.weight.toFixed(1)}</span>
            ) : (
              <span className="text-[9px] text-muted-foreground/40">Optional</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // General nutrition: always AM + BED only (no practice tracking)
  // Rest day: only AM + BED
  // Practice day: all 4 slots
  const slots = isGeneralNutrition || (isRestDay && !hasPracticeLog)
    ? allSlots.filter(s => s.key === 'morning' || s.key === 'bed')
    : allSlots;

  const gridCols = slots.length === 2 ? 'grid-cols-2' : 'grid-cols-4';

  // Count logged slots for completion indicator
  const loggedCount = slots.filter(s => s.log).length;
  const isComplete = loggedCount === slots.length;

  // Find most recent logged slot for highlight
  const mostRecentSlot = [...slots]
    .filter(s => s.log)
    .sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime())[0] ?? null;

  return (
    <div className="mb-4">
      <div className="bg-card border border-muted rounded-lg p-2 space-y-1.5">
        {/* Header: label + colored dots + count */}
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Today's Weight</span>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {slots.map((slot) => (
                <div
                  key={slot.key}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    slot.log ? slot.color.replace('text-', 'bg-') : "bg-muted"
                  )}
                />
              ))}
            </div>
            <span className={cn(
              "text-[10px] font-mono",
              isComplete ? "text-green-500 font-bold" : "text-muted-foreground"
            )}>
              {loggedCount}/{slots.length}
            </span>
          </div>
        </div>

        {/* Slots grid */}
        <div className={cn("grid gap-1", gridCols)}>
          {slots.map((slot) => {
            const isLogged = !!slot.log;
            const weight = slot.log?.weight;
            const isMostRecent = mostRecentSlot && slot.log && mostRecentSlot.log.id === slot.log.id;
            // Show practice loss on POST slot
            const showPracticeLoss = slot.key === 'post' && practiceLoss !== null && practiceLoss > 0;

            return (
              <button
                key={slot.key}
                onClick={() => onSlotTap(slot.type, slot.log)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-all active:scale-95",
                  isLogged
                    ? "hover:bg-muted/50"
                    : "hover:bg-primary/10 border border-dashed border-primary/30",
                  isMostRecent && "ring-1 ring-primary/40 bg-primary/5"
                )}
              >
                {/* Icon + colored label inline */}
                <div className="flex items-center gap-1">
                  <span className={cn("opacity-70", isLogged ? slot.color : "text-muted-foreground")}>
                    {slot.icon}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase",
                    isLogged ? slot.color : "text-muted-foreground"
                  )}>
                    {slot.label}
                  </span>
                </div>

                {/* Time */}
                {isLogged && (
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(slot.log.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}

                {/* Weight or plus icon */}
                {isLogged ? (
                  <span className={cn(
                    "text-[13px] font-mono",
                    isMostRecent ? "font-bold text-foreground" : "text-foreground"
                  )}>
                    {weight?.toFixed(1)}
                  </span>
                ) : (
                  <Plus className="w-4 h-4 mt-0.5 text-primary/60" />
                )}

                {/* Practice loss on POST slot */}
                {showPracticeLoss && (
                  <span className="text-[9px] text-primary font-bold">
                    -{practiceLoss.toFixed(1)}{sweatRate ? ` (${sweatRate.toFixed(1)}/hr)` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Rest day toggle — hidden for general nutrition (no practice tracking) */}
        {!isGeneralNutrition && (
          <div className="flex items-center justify-center gap-2 py-1">
            <button
              onClick={onToggleRestDay}
              disabled={hasPracticeLog}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors",
                hasPracticeLog
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : isRestDay
                    ? "text-purple-400 bg-purple-500/15"
                    : "text-muted-foreground bg-muted/50 hover:bg-muted"
              )}
            >
              <Moon className="w-3 h-3" />
              {hasPracticeLog ? "Practice logged" : isRestDay ? "Rest day ✓" : "No practice today?"}
            </button>
          </div>
        )}

        {/* Extras & Check-ins — always visible for today */}
        {hasExtrasOrCheckIns && (
          <div className="space-y-1.5 pt-1 border-t border-border/30">
            {extraWorkouts.map((workout, i) => {
              const loss = workout.after ? workout.before.weight - workout.after.weight : null;
              return (
                <button
                  key={`extra-${i}`}
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-quick-log', {
                      detail: { editExtraWorkout: { before: workout.before, after: workout.after } }
                    }));
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
                    <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                </button>
              );
            })}
            {todayCheckIns.map((ci) => (
                <div key={ci.id} className="flex items-center justify-between bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Scale className="w-3 h-3 text-cyan-500" />
                    <span className="text-[10px] font-bold text-cyan-500">Weight Check</span>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(ci.date), 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-foreground">{ci.weight.toFixed(1)}</span>
                    {confirmDeleteCheckIn === ci.id ? (
                      <button
                        onClick={() => {
                          deleteLog(ci.id);
                          setConfirmDeleteCheckIn(null);
                          toast({ title: "Deleted", description: "Weight check removed" });
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
                    )}
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
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

  const { getSliceTargets } = useStore();
  const targets = getSliceTargets();
  const goal = profile.sparGoal || 'maintain';

  // Get calorie adjustment from v2 targets
  const calorieAdj = targets.calorieAdjustment || 0;

  // Get current weight from most recent morning log
  const morningLogs = logs.filter(l => l.type === 'morning' || l.type === 'weigh-in').sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const currentWeight = morningLogs[0]?.weight || profile.currentWeight;

  // Get starting weight from earliest morning log, or profile setup weight
  const startWeight = morningLogs.length > 1
    ? morningLogs[morningLogs.length - 1]?.weight
    : profile.currentWeight || null;

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

  // Goal-specific colors
  const protocolColor = goal === 'lose' ? 'text-orange-500' : goal === 'gain' ? 'text-green-500' : 'text-blue-500';
  const goalShortName = goal === 'lose' ? 'Fat Loss' : goal === 'gain' ? 'Building' : 'Maintain';

  return (
    <Card className="mb-2 border-muted overflow-hidden" data-swipeIgnore>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className={cn("w-4 h-4", protocolColor)} />
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Weight Projection</span>
        </div>

        {/* Started → Current → Projected */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold font-mono text-muted-foreground/70">{startWeight ? startWeight.toFixed(1) : '—'}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Started</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono text-foreground">{currentWeight}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Current</div>
          </div>
          <div className="text-center">
            <div className={cn("text-lg font-bold font-mono", protocolColor)}>
              {selectedProjection.weight}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">
              In {weeksAhead}w
            </div>
          </div>
        </div>

        {/* Progress since start */}
        {startWeight && startWeight !== currentWeight && (
          <div className="flex items-center justify-center gap-3 mb-3 py-1.5 bg-muted/20 rounded-lg text-[10px]">
            <span className="text-muted-foreground">
              Progress: <span className={cn("font-bold", (currentWeight - startWeight) < 0 ? "text-orange-500" : (currentWeight - startWeight) > 0 ? "text-green-500" : "text-muted-foreground")}>
                {(currentWeight - startWeight) > 0 ? '+' : ''}{(currentWeight - startWeight).toFixed(1)} lbs
              </span>
            </span>
            {totalChange !== 0 && (
              <span className="text-muted-foreground/60">
                Projected: <span className={cn("font-bold", protocolColor)}>
                  {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)} lbs
                </span>
              </span>
            )}
          </div>
        )}

        {/* Change summary - shows protocol name */}
        <div className="flex items-center justify-center gap-2 mb-4 py-2 bg-muted/30 rounded-lg">
          <Scale className={cn("w-4 h-4", protocolColor)} />
          <span className={cn("font-bold text-sm", protocolColor)}>{goalShortName}</span>
        </div>

        {/* Week slider */}
        <div className="space-y-2" data-swipeIgnore>
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
            data-swipeIgnore
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
          Based on {goalShortName} goal ({calorieAdj > 0 ? '+' : ''}{calorieAdj} cal/day)
        </p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const {
    profile,
    isLoading,
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
    getSliceTargets,
    hasTodayMorningWeight,
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

  // Pull-to-refresh removed — no server data to refresh, all state is local

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

  // Adjacent dates for carousel preview
  const prevDate = subDays(displayDate, 1);
  const nextDate = addDays(displayDate, 1);

  // Get weight data for adjacent days
  const getDateWeight = useCallback((date: Date) => {
    const log = logs.find(l => {
      if (l.type !== 'morning') return false;
      const ld = new Date(l.date);
      return ld.getFullYear() === date.getFullYear() &&
        ld.getMonth() === date.getMonth() &&
        ld.getDate() === date.getDate();
    });
    return log?.weight ?? null;
  }, [logs]);

  const prevDayWeight = useMemo(() => getDateWeight(prevDate), [getDateWeight, prevDate]);
  const nextDayWeight = useMemo(() => getDateWeight(nextDate), [getDateWeight, nextDate]);

  // Macro tracking data
  const macros = getMacroTargets();
  const foodLists = getFoodLists();
  const todaysFoods = getTodaysFoods();

  const fuel = getFuelingGuide();
  const hydration = getHydrationTarget();
  const targetWeight = calculateTarget();

  // SPAR protocol classification
  // isSparNutrition: uses SPAR slice tracker (P5 general + P6 competition)
  // isSparGeneral: no competition features, no weigh-in date (P5 only)
  const isSparNutrition = profile.protocol === '5' || profile.protocol === '6';
  const isSparGeneral = profile.protocol === '5';
  // Keep backward-compatible alias for TodayTimeline prop
  const isSparProtocol = isSparNutrition;

  // Get protocol display name
  // Check if this historical day has a weigh-in log (past competition day)
  const hasWeighInLog = useMemo(() => {
    const todayDate = displayDate;
    return logs.some(log => {
      const logDate = new Date(log.date);
      return log.type === 'weigh-in' &&
        logDate.getFullYear() === todayDate.getFullYear() &&
        logDate.getMonth() === todayDate.getMonth() &&
        logDate.getDate() === todayDate.getDate();
    });
  }, [logs, displayDate]);

  // Get phase display info - driven by days-until-weigh-in, not day-of-week
  const getPhaseInfo = (): { label: string; color: string; stage?: string; stageColor?: string } => {
    // SPAR General users: derive label from v2 goal
    if (isSparGeneral) {
      const sparGoal = profile.sparGoal || 'maintain';
      if (sparGoal === 'gain') {
        return { label: 'Building', color: 'text-green-500' };
      } else if (sparGoal === 'lose') {
        return { label: 'Cutting', color: 'text-orange-500' };
      } else {
        return { label: 'Maintaining', color: 'text-blue-500' };
      }
    }

    // Protocol name for header
    const protocolLabel = (() => {
      switch (profile.protocol) {
        case '1': return { label: 'Extreme Cut', color: 'text-red-500' };
        case '2': return { label: 'Rapid Cut', color: 'text-primary' };
        case '3': return { label: 'Optimal Cut', color: 'text-primary' };
        case '4': return { label: 'Gain', color: 'text-green-500' };
        case '6': return { label: 'SPAR Competition', color: 'text-purple-500' };
        default: return { label: 'Training', color: 'text-primary' };
      }
    })();

    // Historical competition day: if a weigh-in log exists, it was comp day
    if (hasWeighInLog) {
      return { ...protocolLabel, stage: 'Competition Day', stageColor: 'text-yellow-500' };
    }

    if (daysUntilWeighIn < 0) {
      return { ...protocolLabel, stage: 'Recovery', stageColor: 'text-cyan-500' };
    }
    if (daysUntilWeighIn === 0) {
      return { ...protocolLabel, stage: 'Competition Day', stageColor: 'text-yellow-500' };
    }
    if (daysUntilWeighIn <= 2) {
      return { ...protocolLabel, stage: 'Water Cut', stageColor: 'text-orange-500' };
    }
    if (daysUntilWeighIn <= 5) {
      return { ...protocolLabel, stage: 'Water Load', stageColor: 'text-primary' };
    }
    // 6+ days out — protocol name only, stage is "Training"
    return { ...protocolLabel, stage: 'Training', stageColor: 'text-muted-foreground' };
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

  // Rest day state (synced to Supabase via dailyTracking)
  const isRestDay = dailyTracking.noPractice ?? false;
  const toggleRestDay = useCallback(() => {
    updateDailyTracking(dateKey, { noPractice: !isRestDay });
  }, [dateKey, isRestDay, updateDailyTracking]);

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
      weighIn: findLog('weigh-in'),
    };
  }, [logs, displayDate]);

  // Is today competition day?
  // Check both: current weigh-in date matches (daysUntilWeighIn === 0)
  // AND historical: if there's a weigh-in log for this day, it was a past competition day
  const isCompetitionDay = daysUntilWeighIn === 0 || !!todayLogs.weighIn;

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

  // All today's logs sorted by most recent first (for Today's Weight card)
  const todayLogsArray = useMemo(() => logs
    .filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [logs, displayDate]);

  // Yesterday's morning weight for progress comparison
  const yesterdayMorning = useMemo(() => {
    const yesterday = subDays(displayDate, 1);
    return logs.find(log => {
      if (log.type !== 'morning' && log.type !== 'weigh-in') return false;
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
        if (log.type !== 'morning' && log.type !== 'weigh-in') return false;
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
    const morningWeight = todayLogs.weighIn?.weight || todayLogs.morning?.weight;

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
    if (!isSparGeneral) {
      const isTrainingPhase = daysUntilWeighIn > 5;
      if (descentData.pace === 'ahead') {
        items.push({
          emoji: '🏃',
          text: isTrainingPhase ? 'Below walk-around weight' : 'Ahead of pace to make weight',
          color: 'text-green-500',
        });
      } else if (descentData.pace === 'behind' && daysUntilWeighIn > 0) {
        items.push({
          emoji: '⚠️',
          text: isTrainingPhase ? 'Above walk-around — monitor intake' : 'Behind pace — extra effort needed',
          color: 'text-yellow-500',
        });
      }

      // 4. Projected to make weight — only show during comp week (projection is meaningful)
      if (!isTrainingPhase && descentData.projectedSaturday !== null && descentData.projectedSaturday <= profile.targetWeightClass && daysUntilWeighIn > 1) {
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
  }, [todayLogs, yesterdayMorning, descentData, historyInsights, profile.targetWeightClass, daysUntilWeighIn, streak, isSparGeneral]);

  // Show skeleton while initial data is loading
  if (isLoading) {
    return (
      <MobileLayout showNav={true}>
        <DashboardSkeleton />
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={true}>
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

      {/* Carousel container - Apple-style swipe with full preview */}
      <div ref={containerRef} className="relative overflow-hidden">
        {/* Previous day - full preview panel (positioned to the left) */}
        <div
          className="absolute top-0 right-full w-full h-full pointer-events-none"
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: swipeTransition,
          }}
        >
          <div className="p-4 pt-2 opacity-80">
            {/* Previous day header */}
            <div className="text-center mb-4">
              <div className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                {format(prevDate, 'EEEE, MMM d')}
              </div>
            </div>
            {/* Previous day weight card */}
            <div className="bg-card rounded-xl border p-4 mb-3">
              <div className="text-center">
                {prevDayWeight ? (
                  <>
                    <div className="text-3xl font-bold font-mono">{prevDayWeight.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">lbs</div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No weight logged</div>
                )}
              </div>
            </div>
            {/* Hint to swipe */}
            <div className="text-center text-xs text-muted-foreground">
              Release to view this day
            </div>
          </div>
        </div>

        {/* Next day - full preview panel (positioned to the right) */}
        {canGoNext && (
          <div
            className="absolute top-0 left-full w-full h-full pointer-events-none"
            style={{
              transform: `translateX(${swipeOffset}px)`,
              transition: swipeTransition,
            }}
          >
            <div className="p-4 pt-2 opacity-80">
              {/* Next day header */}
              <div className="text-center mb-4">
                <div className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                  {nextDate >= today ? 'Today' : format(nextDate, 'EEEE, MMM d')}
                </div>
              </div>
              {/* Next day weight card */}
              <div className="bg-card rounded-xl border p-4 mb-3">
                <div className="text-center">
                  {nextDayWeight ? (
                    <>
                      <div className="text-3xl font-bold font-mono">{nextDayWeight.toFixed(1)}</div>
                      <div className="text-sm text-muted-foreground">lbs</div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No weight logged</div>
                  )}
                </div>
              </div>
              {/* Hint to swipe */}
              <div className="text-center text-xs text-muted-foreground">
                Release to view this day
              </div>
            </div>
          </div>
        )}

        {/* Current day content */}
        <div
          {...swipeHandlers}
          style={{
            transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
            transition: swipeTransition,
            touchAction: 'pan-y',
          }}
        >
        {/* ═══════════════════════════════════════════════════════ */}
        {/* OFFLINE INDICATOR — Shows when network is unavailable */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!isOnline && (
          <OfflineBanner />
        )}

        {/* Competition day reminder — use Recovery tab (dismissible) - not for SPAR */}
        {/* Auto-hides once official weigh-in is logged (job done) */}
        {!isViewingHistorical && !isSparGeneral && daysUntilWeighIn === 0 && profile.protocol !== '4' && !compDayDismissed && !todayLogs.weighIn && (
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
        {/* No weigh-in scheduled banner — tappable, opens settings to schedule tab */}
        {!isViewingHistorical && !isSparGeneral && profile.weighInCleared && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'schedule' } }))}
            className="w-full mb-2 px-3 py-2.5 rounded-lg border border-muted/50 bg-muted/10 text-muted-foreground text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-muted/20 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            No weigh-in scheduled — tap to set one
          </button>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SIP-ONLY WARNING BANNER — Only when projection says fluids must be 0 */}
        {/* Uses store's projection to check if athlete has any fluid buffer     */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!isViewingHistorical && daysUntilWeighIn === 1 && !isSparGeneral && !sipOnlyDismissed && profile.currentWeight > profile.targetWeightClass && (() => {
          // Check projection-based fluid buffer — only show if truly no room for fluids
          try {
            const descentData = getWeekDescentData();
            const projected = descentData.projectedSaturday;
            if (projected !== null && projected <= profile.targetWeightClass) return false; // has margin, don't show
          } catch {}
          return true;
        })() && (
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
                  ? isSparGeneral ? `${profile.name}'s Nutrition` : `${profile.name}'s Cut`
                  : isSparGeneral ? "My Nutrition" : "The Cut"
              )}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {/* For SPAR users, show goal label */}
              {isSparGeneral ? (
                <SparProtocolSelector profile={profile} />
              ) : (
                <>
                  <span className={cn("text-xs font-bold uppercase", phaseInfo.color)}>
                    {phaseInfo.label}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-bold font-mono text-primary">{profile.targetWeightClass} lbs</span>
                  {phaseInfo.stage && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className={cn("text-xs font-bold uppercase", phaseInfo.stageColor)}>
                        {phaseInfo.stage}
                      </span>
                    </>
                  )}
                </>
              )}
              {/* Logging streak — shown in Cut Lab card instead to avoid duplication */}
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

      {/* Protocol Switch Banner — shows when wrestler should switch to Extreme Cut */}
      {!isViewingHistorical && !isSparGeneral && (
        <ProtocolSwitchBanner />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* UNIFIED AI COACH — Weight display + AI recommendations + chat */}
      {/* Replaces old DecisionZone and floating chat widget            */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isViewingHistorical && !isSparGeneral && daysUntilWeighIn >= 0 && !profile.weighInCleared && (
        <AiCoachProactive />
      )}

      {/* Next Cycle Prompt — shows when weigh-in has passed (competition only) */}
      {!isViewingHistorical && !isSparGeneral && (
        <NextCyclePrompt
          profile={profile}
          updateProfile={updateProfile}
          daysUntilWeighIn={daysUntilWeighIn}
        />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TODAY FLOW — Simplified horizontal timeline             */}
      {/* AM → PRE → POST → BED — adapts to rest/competition days */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isViewingHistorical && (
        <TodayFlow
          todayLogs={todayLogs}
          onSlotTap={(type, log) => {
            if (log) {
              window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { editLog: log } }));
            } else {
              window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type } }));
            }
          }}
          isRestDay={isRestDay}
          onToggleRestDay={toggleRestDay}
          isCompetitionDay={isCompetitionDay && !isSparGeneral}
          isGeneralNutrition={isSparGeneral}
        />
      )}

      {/* First-time user welcome — zero logs ever */}
      {!isViewingHistorical && logs.length === 0 && (
        <Card className="mb-4 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <h3 className="font-heading uppercase italic text-sm text-primary mb-2">Getting Started</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold mt-px">1</span>
                <span>Log your <strong className="text-foreground/80">morning weight</strong> right when you wake up</span>
              </div>
              {!isSparGeneral && (
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-px">2</span>
                  <span>Weigh in <strong className="text-foreground/80">before & after practice</strong></span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold mt-px">{isSparGeneral ? '2' : '3'}</span>
                <span>Log <strong className="text-foreground/80">before bed</strong> for overnight drift</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historical view: show full TodayTimeline for data exploration */}
      {isViewingHistorical && (
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
      )}

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
      {/* WEEK OVERVIEW — collapsed by default, tap to see week plan */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSparGeneral && daysUntilWeighIn >= 0 && !profile.weighInCleared && (
        <WhatsNextCard getTomorrowPlan={getTomorrowPlan} getWeeklyPlan={getWeeklyPlan} descentData={descentData} timeUntilWeighIn={daysUntilWeighIn >= 0 ? (() => { const t = getTimeUntilWeighIn(); return t === 'WEIGH-IN TIME' ? null : t; })() : null} daysUntilWeighIn={daysUntilWeighIn} />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SPAR FOCUS CARD — Protocol tips and calorie summary */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparNutrition && !isViewingHistorical && (
        <SparFocusCard profile={profile} />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADAPTIVE ADJUSTMENT BANNER — suggests calorie changes on plateau (SPAR General only) */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparGeneral && !isViewingHistorical && (
        <AdaptiveAdjustmentBanner />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEEKLY COMPLIANCE CARD — macro tracking summary */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparNutrition && !isViewingHistorical && (
        <WeeklyComplianceCard />
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEIGHT PROJECTION — Shows future weight over weeks (SPAR General only) */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSparGeneral && !isViewingHistorical && (
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
    // Training phase labels use the same status codes but different context
    const label = statusInfo.label;
    if (label === 'HOLDING') {
      return {
        title: "HOLDING",
        criteria: "You're near your walk-around weight during training phase.",
        guidance: "This is normal. The cut hasn't started yet — focus on training and following your protocol.",
        color: "text-green-500",
        bgColor: "bg-green-500/10 border-green-500/30"
      };
    }
    if (label === 'MONITOR') {
      return {
        title: "MONITOR",
        criteria: "You're a bit above your typical walk-around weight.",
        guidance: "Still plenty of time before competition. Keep an eye on intake and stay consistent with training.",
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10 border-yellow-500/30"
      };
    }
    if (label === 'HIGH') {
      return {
        title: "HIGH",
        criteria: "You're well above walk-around weight even for training phase.",
        guidance: "Consider tightening nutrition. You have time, but starting lower makes comp week easier.",
        color: "text-orange-500",
        bgColor: "bg-orange-500/10 border-orange-500/30"
      };
    }

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
          title: "CLOSE",
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
  todayLogs: { morning: any; prePractice: any; postPractice: any; beforeBed: any; weighIn: any };
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

  // Auto-expand when practice log exists, collapse on rest days
  useEffect(() => {
    if (hasPracticeLog) {
      setPracticeExpanded(true);
    } else if (noPractice) {
      setPracticeExpanded(false);
    }
  }, [hasPracticeLog, noPractice]);

  // SPAR users only see AM + BED by default, but can opt-in to practice tracking
  // Competition users: show AM + BED by default, practice slots expand on demand or when logged
  // Rest days (noPractice): always hide practice slots regardless of practiceExpanded
  const showPracticeSlots = noPractice ? false : (isSparProtocol ? trackPracticeWeighIns : (practiceExpanded || hasPracticeLog));

  // Detect historical competition day (weigh-in log exists for this day)
  const isHistoricalCompDay = !!todayLogs.weighIn;

  // Competition day slots: AM, Official Weigh-In, BED
  const compDaySlots = [
    { key: 'morning', label: 'AM', icon: <Sun className="w-3 h-3" />, log: todayLogs.morning, type: 'morning', color: 'text-yellow-500', dimmed: false },
    { key: 'weigh-in', label: todayLogs.weighIn ? 'Official ✓' : 'Weigh-In', icon: <Scale className="w-3 h-3" />, log: todayLogs.weighIn, type: 'weigh-in', color: 'text-green-500', dimmed: false },
    { key: 'bed', label: 'BED', icon: <Moon className="w-3 h-3" />, log: todayLogs.beforeBed, type: 'before-bed', color: 'text-purple-500', dimmed: false },
  ];

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

  const coreSlots = isHistoricalCompDay ? compDaySlots : showPracticeSlots ? [
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
  const morningWeight = todayLogs.weighIn?.weight ?? todayLogs.morning?.weight ?? null;
  const latestWeight = mostRecentLog?.weight ?? null;
  const dailyLoss = (morningWeight && latestWeight && mostRecentLog?.type !== 'morning' && mostRecentLog?.type !== 'weigh-in')
    ? morningWeight - latestWeight
    : null;

  // Completion count for daily weigh-ins
  // - Competition day: 3 (AM/Official/BED)
  // - SPAR users with trackPracticeWeighIns=false: always 2 (AM/BED)
  // - SPAR users with trackPracticeWeighIns=true: 4 on practice days, 2 on rest days
  // - Competition users: 4 on practice days, 2 on rest days
  const isPracticeDay = !noPractice;
  const shouldTrackPractice = isSparProtocol ? trackPracticeWeighIns && isPracticeDay : isPracticeDay;
  const activeSlots = isHistoricalCompDay ? 3 : shouldTrackPractice ? 4 : 2;
  const completedCount = isHistoricalCompDay
    ? [todayLogs.morning, todayLogs.weighIn, todayLogs.beforeBed].filter(Boolean).length
    : shouldTrackPractice
      ? [todayLogs.morning, todayLogs.prePractice, todayLogs.postPractice, todayLogs.beforeBed].filter(Boolean).length
      : [todayLogs.morning, todayLogs.beforeBed].filter(Boolean).length;
  const isComplete = completedCount === activeSlots;

  return (
    <div className="mb-2">
      {/* Core weigh-in slots - clean card */}
      <div data-tour="weigh-ins" className="bg-card border border-muted rounded-lg p-2 space-y-1.5">
        {/* Completion indicator - small, inline */}
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Today's Weight</span>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {Array.from({ length: activeSlots }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    i < completedCount ? "bg-green-500" : "bg-muted"
                  )}
                />
              ))}
            </div>
            <span className={cn(
              "text-[10px] font-mono",
              isComplete ? "text-green-500 font-bold" : "text-muted-foreground"
            )}>
              {completedCount}/{activeSlots}
            </span>
          </div>
        </div>
        <div className={cn("grid gap-1", isHistoricalCompDay ? "grid-cols-3" : showPracticeSlots ? "grid-cols-4" : "grid-cols-2")}>
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
            {/* Show/hide practice slots toggle — hidden on rest days */}
            {!hasPracticeLog && !noPractice && (
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
            {/* Rest day toggle - shown when practice not logged and not expanded (or when already rest day) */}
            {!hasPracticeLog && (!practiceExpanded || noPractice) && (
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

      {/* Extras & Check-ins — collapsible under core slots */}
      {hasExtrasOrCheckIns && (
        <details className="group">
          <summary className="flex items-center justify-center gap-2 cursor-pointer py-1 list-none [&::-webkit-details-marker]:hidden">
            <span className="text-[9px] text-muted-foreground uppercase font-bold">
              {extraWorkouts.length > 0 && `${extraWorkouts.length} extra`}
              {extraWorkouts.length > 0 && todayCheckIns.length > 0 && ' · '}
              {todayCheckIns.length > 0 && `${todayCheckIns.length} weight check`}
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
            {todayCheckIns.map((ci) => (
                <div key={ci.id} className="flex items-center justify-between bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Scale className="w-3 h-3 text-cyan-500" />
                    <span className="text-[10px] font-bold text-cyan-500">Weight Check</span>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(ci.date), 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-foreground">{ci.weight.toFixed(1)}</span>
                    {!readOnly && (
                      confirmDeleteCheckIn === ci.id ? (
                        <button
                          onClick={() => {
                            deleteLog(ci.id);
                            setConfirmDeleteCheckIn(null);
                            toast({ title: "Deleted", description: "Weight check removed" });
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
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO WEIGHT — Clean, elite-style weight display with progress bar
// ═══════════════════════════════════════════════════════════════════════════════
function HeroWeight({
  currentWeight,
  targetWeight,
  timeUntil,
  dailyChange,
  streak,
  status,
  daysUntilWeighIn,
}: {
  currentWeight: number | null;
  targetWeight: number;
  timeUntil: string | null;
  dailyChange: number | null;
  streak: number;
  status: 'on-track' | 'borderline' | 'risk' | 'unknown';
  daysUntilWeighIn: number;
}) {
  const weightToLose = currentWeight ? currentWeight - targetWeight : 0;
  const isAtWeight = weightToLose <= 0;

  // Progress percentage (capped at 100%)
  // Assume max cut is ~15 lbs, so we show progress toward that
  const maxCut = 15;
  const progressPct = currentWeight
    ? Math.min(100, Math.max(0, ((maxCut - weightToLose) / maxCut) * 100))
    : 0;

  // Status color
  const statusColor = status === 'on-track' ? 'text-green-500' :
    status === 'borderline' ? 'text-yellow-500' :
    status === 'risk' ? 'text-red-500' : 'text-muted-foreground';

  const progressBarColor = status === 'on-track' ? 'bg-green-500' :
    status === 'borderline' ? 'bg-yellow-500' :
    status === 'risk' ? 'bg-orange-500' : 'bg-primary';

  return (
    <div className="mb-3">
      {/* Main weight display */}
      <div className="flex items-baseline justify-center gap-2 mb-1">
        <span className="text-4xl font-mono font-bold tracking-tight">
          {currentWeight ? currentWeight.toFixed(1) : '—'}
        </span>
        <span className="text-2xl text-muted-foreground">→</span>
        <span className="text-4xl font-mono font-bold text-primary tracking-tight">
          {targetWeight}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted/40 rounded-full overflow-hidden mb-2 mx-4">
        <div
          className={cn("h-full rounded-full transition-all duration-500", progressBarColor)}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-center gap-3 text-[11px]">
        {/* Weight to lose / at weight */}
        {currentWeight && (
          <span className={cn("font-mono font-bold", statusColor)}>
            {isAtWeight ? '✓ AT WEIGHT' : `${weightToLose.toFixed(1)} lbs to go`}
          </span>
        )}

        {/* Daily change */}
        {dailyChange !== null && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn(
              "font-mono font-bold",
              dailyChange < 0 ? "text-green-500" : dailyChange > 0 ? "text-red-400" : "text-muted-foreground"
            )}>
              {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(1)} today
            </span>
          </>
        )}

        {/* Streak */}
        {streak >= 2 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn(
              "font-bold flex items-center gap-0.5",
              streak >= 14 ? "text-orange-500" : streak >= 7 ? "text-yellow-500" : "text-muted-foreground"
            )}>
              <Flame className="w-3 h-3" />
              {streak}
            </span>
          </>
        )}
      </div>

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
              <li><strong className="text-destructive">Extreme Cut:</strong> 12%+ above class. Multi-day depletion, strict oversight required.</li>
              <li><strong className="text-primary">Rapid Cut:</strong> 7-12% above class. Short-term glycogen + water manipulation.</li>
              <li><strong className="text-primary">Optimal Cut:</strong> Within 6-7% of class. Glycogen management, performance protected.</li>
              <li><strong className="text-primary">Gain:</strong> Off-season. Performance and strength focus.</li>
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
    avgCutDrift: number | null;
    avgLoadingDrift: number | null;
    currentWeight: number | null;
    startWeight: number | null;
    totalLost: number | null;
    grossDailyLoss: number | null;
    pace: 'ahead' | 'on-track' | 'behind' | null;
    daysRemaining: number;
    dailyAvgLoss: number | null;
    daytimeBmrDrift: number;
    emaSleepHours: number;
    emaPracticeHours: number;
    todayRemainingComponents: { sleep: number; practice: number } | null;
    projectedSaturday: number | null;
    targetWeight: number;
    recentDrifts: number[];
    recentDriftRates: number[];
    recentSleepHours: number[];
    recentPracticeLosses: number[];
    recentPracticeSweatRates: number[];
    recentPracticeDurations: number[];
    trends: {
      drift: 'up' | 'down' | 'stable';
      practice: 'up' | 'down' | 'stable';
      driftRate: 'up' | 'down' | 'stable';
      sweatRate: 'up' | 'down' | 'stable';
    };
    confidence: {
      driftSamples: number;
      practiceSamples: number;
      level: 'high' | 'medium' | 'low' | 'none';
    };
    makeWeightProb: {
      probability: number;
      worstCase: number;
      median: number;
      includesExtraWork: boolean;
    } | null;
    todayProgress: {
      lostSoFar: number;
      expectedTotal: number;
      pctComplete: number;
    } | null;
    loggingStreak: number;
    todayCoreLogged: number;
    todayCoreTotal: number;
    weekOverWeek: {
      thisWeekAvgDrift: number | null;
      lastWeekAvgDrift: number | null;
      thisWeekAvgPractice: number | null;
      lastWeekAvgPractice: number | null;
    } | null;
    weekWeighIns: Array<{ day: string; weight: number; type: string }>;
    personalRecords: {
      bestDrift: number | null;
      bestPracticeLoss: number | null;
      bestDriftRate: number | null;
      bestSweatRate: number | null;
      totalLostThisWeek: number | null;
    };
    timeToTarget: {
      etaHours: number | null;
      etaTime: string | null;
      lbsRemaining: number;
      ratePerHour: number | null;
    } | null;
    historicalDrift: number | null;
    historicalDriftRate: number | null;
    historicalPracticeLoss: number | null;
    historicalSweatRate: number | null;
    cycleHasOwnDriftData: boolean;
    cycleHasOwnPracticeData: boolean;
  };
  timeUntilWeighIn: string | null;
  daysUntilWeighIn: number;
}) {
  const { getExtraWorkoutStats, logs, profile, isWaterLoadingDay, getCutScore, hasTodayMorningWeight } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [flippedCard, setFlippedCard] = useState<'sleep' | 'practice' | 'awake' | 'extras' | null>(null);

  // Detect historical competition day: if a weigh-in log exists for this day
  const hasWeighInLogForDay = useMemo(() => {
    const displayDate = profile.simulatedDate || new Date();
    return logs.some(l => {
      const ld = new Date(l.date);
      return l.type === 'weigh-in' &&
        ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    });
  }, [logs, profile.simulatedDate]);
  const effectiveCompDay = daysUntilWeighIn === 0 || hasWeighInLogForDay;

  // Phase styling for header badge only
  const { phase: currentPhase, style: phaseStyle } = getPhaseStyleForDaysUntil(effectiveCompDay ? 0 : daysUntilWeighIn);
  const isWaterLoading = isWaterLoadingDay();

  // Card border/bg driven by Cut Score zone — matches the gauge ring color
  // Don't show Cut Score when no active weigh-in or no morning weight logged today
  const cutScore = !effectiveCompDay && daysUntilWeighIn > 0 && !profile.weighInCleared && hasTodayMorningWeight() ? getCutScore() : null;
  // On comp day (no Cut Score), use weight vs goal for card color
  const compDayZone = effectiveCompDay && descentData.currentWeight !== null
    ? (descentData.currentWeight <= descentData.targetWeight ? 'green' : 'yellow')
    : 'neutral';
  const statusZone = cutScore ? cutScore.zone : compDayZone;
  const cardBorder = statusZone === 'green' ? 'border-green-500/50'
    : statusZone === 'yellow' ? 'border-yellow-500/50'
    : statusZone === 'red' ? 'border-red-500/50'
    : 'border-muted/50';
  const cardBg = statusZone === 'green' ? 'bg-green-500/5'
    : statusZone === 'yellow' ? 'bg-yellow-500/5'
    : statusZone === 'red' ? 'bg-red-500/5'
    : 'bg-muted/5';
  const statusText = statusZone === 'green' ? 'text-green-500'
    : statusZone === 'yellow' ? 'text-yellow-500'
    : statusZone === 'red' ? 'text-red-500'
    : 'text-muted-foreground';

  return (
    <div className="mt-4">
      <Card data-tour="countdown" className={cn("overflow-hidden", cardBorder, cardBg)}>
        <CardContent className="p-0">

          {/* ═══ HEADER ═══ */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              {statusZone === 'red'
                ? <AlertTriangle className="w-4 h-4 text-red-500" />
                : statusZone === 'yellow'
                  ? <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  : <TrendingDown className={cn("w-4 h-4", statusText)} />}
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Cut Lab</span>
            </div>
            <div className="flex items-center gap-2">
              {profile.weighInCleared ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'schedule' } }));
                  }}
                  className="text-xs font-bold px-2 py-1 rounded bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  No weigh-in scheduled
                </button>
              ) : timeUntilWeighIn && !hasWeighInLogForDay ? (
                <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded",
                  phaseStyle.text, phaseStyle.bgLight
                )}>
                  {timeUntilWeighIn} to weigh-in
                </span>
              ) : null}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/50 transition-transform", isExpanded && "rotate-180")} />
            </div>
          </button>

          {/* ═══ EXPANDED CONTENT ═══ */}
          {isExpanded && (
            <div className="border-t border-muted/30 animate-in fade-in duration-150">

              {/* ═══ CUT SCORE GAUGE — locked until morning weight logged ═══ */}
              {!effectiveCompDay && daysUntilWeighIn > 0 && (
                hasTodayMorningWeight()
                  ? <CutScoreGauge result={getCutScore()} />
                  : <CutScoreGauge locked />
              )}

              {/* ═══ COMP DAY: MADE WEIGHT SUMMARY ═══ */}
              {effectiveCompDay && descentData.currentWeight !== null && descentData.currentWeight <= descentData.targetWeight && (
                <div className="px-4 pt-4 pb-2 text-center">
                  <div className="text-3xl mb-1">🏆</div>
                  <div className="text-lg font-bold text-green-500">Made Weight!</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Weighed in at {descentData.currentWeight.toFixed(1)} lbs
                  </div>
                  {descentData.totalLost !== null && descentData.totalLost > 0 && (
                    <div className="text-[10px] text-muted-foreground/60 mt-1">
                      Cut {descentData.totalLost.toFixed(1)} lbs this week
                    </div>
                  )}
                </div>
              )}

              {/* ═══ STATS GRID — Start / Now / Lost / Goal ═══ */}
              <div className="grid grid-cols-4 gap-2 text-center p-4 pb-0">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Start</span>
                  <span className="font-mono font-bold text-sm">
                    {descentData.startWeight?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Now</span>
                  <span className={cn("font-mono font-bold text-sm", statusText)}>
                    {descentData.currentWeight?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Lost</span>
                  <span className={cn(
                    "font-mono font-bold text-sm",
                    descentData.totalLost && descentData.totalLost > 0 ? "text-green-500" : "text-muted-foreground"
                  )}>
                    {descentData.totalLost !== null
                      ? descentData.totalLost > 0 ? `-${descentData.totalLost.toFixed(1)}` : `+${Math.abs(descentData.totalLost).toFixed(1)}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">
                    {daysUntilWeighIn > 5 ? 'Walk-around' : 'Goal'}
                  </span>
                  <span className="font-mono font-bold text-sm text-green-500">
                    {daysUntilWeighIn > 5 ? Math.round(descentData.targetWeight * 1.07) : descentData.targetWeight}
                  </span>
                  {daysUntilWeighIn > 5 && (
                    <span className="text-[8px] text-muted-foreground/50 block">class: {descentData.targetWeight}</span>
                  )}
                </div>
              </div>

              {/* ═══ PROJECTED WEIGHT — only during comp week (projection is meaningful) ═══ */}
              {descentData.projectedSaturday !== null && daysUntilWeighIn <= 5 && (
                <div className="flex items-center justify-center gap-2 pt-2 mt-2 mx-4 border-t border-muted">
                  <span className="text-[10px] text-muted-foreground">Projected</span>
                  <span className={cn(
                    "font-mono font-bold text-xs",
                    descentData.projectedSaturday <= descentData.targetWeight
                      ? "text-green-500"
                      : descentData.projectedSaturday <= descentData.targetWeight * 1.03
                        ? "text-orange-500"
                        : "text-red-500"
                  )}>
                    {descentData.projectedSaturday.toFixed(1)} lbs
                  </span>
                </div>
              )}

              {/* ═══ PROGRESS WARNING — only when projected over during comp week ═══ */}
              {descentData.totalLost !== null && descentData.currentWeight && daysUntilWeighIn <= 5 && (() => {
                const toGoal = (descentData.currentWeight - descentData.targetWeight).toFixed(1);
                const projectedOver = descentData.projectedSaturday !== null && descentData.projectedSaturday > descentData.targetWeight;
                const projectedOverAmt = descentData.projectedSaturday !== null ? (descentData.projectedSaturday - descentData.targetWeight).toFixed(1) : '0';

                // Only show banner when projected over — green projections speak for themselves
                if (!projectedOver) return null;

                return (
                  <div className="mx-4 mt-3 p-2 rounded-lg text-center text-xs bg-orange-500/10 text-orange-500">
                    {isWaterLoading
                      ? <>Projected <strong>{projectedOverAmt} lbs over</strong> at weigh-in. Normal during loading — track closely.</>
                      : <>Projected <strong>{projectedOverAmt} lbs over</strong> at weigh-in. <strong>{toGoal} lbs</strong> left to cut.</>
                    }
                  </div>
                );
              })()}

              {/* ═══ LOSS BREAKDOWN — shows cycle data or historical fallback ═══ */}
              {(() => {
                const hasCycleDrift = descentData.avgOvernightDrift !== null;
                const hasCyclePractice = descentData.avgPracticeLoss !== null;
                const hasHistDrift = descentData.historicalDrift !== null;
                const hasHistPractice = descentData.historicalPracticeLoss !== null;
                if (!hasCycleDrift && !hasCyclePractice && !hasHistDrift && !hasHistPractice) return null;

                const extraStats = getExtraWorkoutStats();
                const hasExtras = extraStats.totalWorkouts > 0;
                const isHistorical = !hasCycleDrift && !hasCyclePractice;
                const driftVal = hasCycleDrift ? descentData.avgOvernightDrift : descentData.historicalDrift;
                const driftRateVal = hasCycleDrift ? descentData.avgDriftRateOzPerHr : descentData.historicalDriftRate;
                const practiceVal = hasCyclePractice ? descentData.avgPracticeLoss : descentData.historicalPracticeLoss;
                const sweatVal = hasCyclePractice ? descentData.avgSweatRateOzPerHr : descentData.historicalSweatRate;

                return (
                  <>
                  {isHistorical && (
                    <div className="text-[9px] text-muted-foreground/50 text-center mt-3 mx-4">
                      Season averages — new cycle data will replace these
                    </div>
                  )}
                  <div className={cn("grid gap-1 text-center pt-2 mx-4 border-t border-muted", !isHistorical && "mt-3", hasExtras ? "grid-cols-4" : "grid-cols-3", isHistorical && "opacity-60")}>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Sleep</span>
                      <span className={cn("font-mono font-bold text-xs", driftVal !== null ? "text-cyan-500" : "")}>
                        {driftVal !== null ? `-${Math.abs(driftVal).toFixed(1)}` : '—'} lbs
                      </span>
                      {driftRateVal !== null && (
                        <span className="block text-[9px] font-mono text-cyan-400">
                          {driftRateVal.toFixed(2)}/hr
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Awake <span className="text-[8px] text-muted-foreground/50">(est.)</span></span>
                      <span className="font-mono font-bold text-xs text-teal-500">
                        {descentData.daytimeBmrDrift > 0 ? `-${descentData.daytimeBmrDrift.toFixed(1)}` : '—'} lbs
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Practice</span>
                      <span className={cn("font-mono font-bold text-xs", practiceVal !== null ? "text-orange-500" : "")}>
                        {practiceVal !== null ? `-${Math.abs(practiceVal).toFixed(1)}` : '—'} lbs
                      </span>
                      {sweatVal !== null && (
                        <span className="block text-[9px] font-mono text-orange-400">
                          {sweatVal.toFixed(2)}/hr
                        </span>
                      )}
                    </div>
                    {hasExtras && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Extras</span>
                        <span className="font-mono font-bold text-xs text-orange-400">
                          {extraStats.avgLoss !== null ? `-${extraStats.avgLoss.toFixed(1)}` : '—'} lbs
                        </span>
                        {extraStats.avgSweatRateOzPerHr !== null && (
                          <span className="block text-[9px] font-mono text-orange-400/70">
                            {extraStats.avgSweatRateOzPerHr.toFixed(2)}/hr
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                );
              })()}

              {/* EMA explanation */}
              <p className="text-[8px] text-muted-foreground/40 text-center mt-1 mx-4">
                Averages use EMA (recency-weighted) — recent data counts more than old data
              </p>

              {/* ═══ LOGGING STREAK + CORE LOGGED ═══ */}
              <div className="flex items-center justify-center gap-3 mt-3 mx-4 pt-2 border-t border-muted/50">
                {descentData.loggingStreak > 1 && (
                  <span className="text-[10px] font-bold text-muted-foreground/60">
                    🔥 {descentData.loggingStreak}-day streak
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/50">
                  {descentData.todayCoreLogged}/{descentData.todayCoreTotal} logged today
                  {descentData.todayCoreLogged >= descentData.todayCoreTotal && ' ✓'}
                </span>
              </div>

              {/* ═══ INTERACTIVE STAT CARDS — tap to expand ═══ */}
              {(descentData.avgOvernightDrift !== null || descentData.avgPracticeLoss !== null || descentData.historicalDrift !== null || descentData.historicalPracticeLoss !== null) && (() => {
                const extraStats = getExtraWorkoutStats();
                const hasExtras = extraStats.totalWorkouts > 0;

                // Mini bar chart component for recent data
                const SparkBars = ({ values, color, label, suffix = '' }: { values: number[]; color: string; label?: string; suffix?: string }) => {
                  if (values.length === 0) return <span className="text-[11px] text-muted-foreground/40">No data yet</span>;
                  const absValues = values.map(v => Math.abs(v));
                  const maxVal = Math.max(...absValues, 0.1);
                  return (
                    <div>
                      {label && (
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">{label}</span>
                          <span className="text-[9px] text-muted-foreground/40">oldest → newest</span>
                        </div>
                      )}
                      <div className="flex items-end gap-1.5 h-[48px]">
                        {[...absValues].reverse().map((v, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] font-mono text-muted-foreground/60 font-bold leading-none">
                              {v.toFixed(1)}{suffix}
                            </span>
                            <div
                              className={cn("w-full rounded-md min-h-[3px]", color)}
                              style={{ height: `${Math.max(12, (v / maxVal) * 100)}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                };

                // Trend arrow component
                const TrendArrow = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
                  if (trend === 'up') return <span className="text-green-500 text-[10px] font-bold ml-1">▲</span>;
                  if (trend === 'down') return <span className="text-orange-500 text-[10px] font-bold ml-1">▼</span>;
                  return <span className="text-muted-foreground/40 text-[10px] ml-1">—</span>;
                };

                // Tappable stat card — dims when another card is expanded
                const StatCard = ({ id, children, dashed = false }: {
                  id: 'sleep' | 'practice' | 'awake' | 'extras';
                  children: React.ReactNode;
                  dashed?: boolean;
                }) => {
                  const isSelected = flippedCard === id;
                  const isDimmed = flippedCard !== null && !isSelected;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setFlippedCard(isSelected ? null : id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlippedCard(isSelected ? null : id); }}}
                      className={cn(
                        "rounded-lg p-2.5 text-left transition-all duration-200 cursor-pointer",
                        dashed ? "border border-dashed" : "",
                        isSelected
                          ? cn("bg-muted/50 ring-2 ring-primary/40 shadow-sm", dashed ? "border-primary/30" : "")
                          : cn("bg-muted/30", dashed ? "border-muted-foreground/10" : ""),
                        isDimmed && "opacity-40"
                      )}
                    >
                      {children}
                    </div>
                  );
                };

                const sleepDrift = descentData.avgOvernightDrift ?? descentData.historicalDrift;
                const sleepRate = descentData.avgDriftRateOzPerHr ?? descentData.historicalDriftRate;
                const practiceLoss = descentData.avgPracticeLoss ?? descentData.historicalPracticeLoss;
                const practiceRate = descentData.avgSweatRateOzPerHr ?? descentData.historicalSweatRate;
                const isHistSleep = descentData.avgOvernightDrift === null && descentData.historicalDrift !== null;
                const isHistPractice = descentData.avgPracticeLoss === null && descentData.historicalPracticeLoss !== null;

                return (
                  <>
                  <div className="mx-4 mt-3 mb-1">
                    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wide font-bold">Tap for details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2 mx-4">
                    {/* Sleep */}
                    <StatCard id="sleep">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-muted-foreground/80 uppercase font-bold">
                          Sleep {isHistSleep && <span className="text-[8px] text-muted-foreground/40 font-normal">(season)</span>}
                        </span>
                        {!isHistSleep && <TrendArrow trend={descentData.trends.drift} />}
                      </div>
                      <span className={cn("font-mono font-bold text-base block", isHistSleep ? "text-foreground/50" : "text-foreground")}>
                        {sleepDrift !== null
                          ? `-${Math.abs(sleepDrift).toFixed(1)}`
                          : '—'}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">lbs</span>
                      </span>
                      {sleepRate !== null && (
                        <span className={cn("block text-[10px] font-mono mt-0.5", isHistSleep ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
                          {sleepRate.toFixed(2)}/hr
                        </span>
                      )}
                    </StatCard>

                    {/* Practice */}
                    <StatCard id="practice">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-muted-foreground/80 uppercase font-bold">
                          Practice {isHistPractice && <span className="text-[8px] text-muted-foreground/40 font-normal">(season)</span>}
                        </span>
                        {!isHistPractice && <TrendArrow trend={descentData.trends.practice} />}
                      </div>
                      <span className={cn("font-mono font-bold text-base block", isHistPractice ? "text-foreground/50" : "text-foreground")}>
                        {practiceLoss !== null
                          ? `-${Math.abs(practiceLoss).toFixed(1)}`
                          : '—'}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">lbs</span>
                      </span>
                      {practiceRate !== null && (
                        <span className={cn("block text-[10px] font-mono mt-0.5", isHistPractice ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
                          {practiceRate.toFixed(2)} lbs/hr
                        </span>
                      )}
                    </StatCard>

                    {/* Awake */}
                    <StatCard id="awake" dashed>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-teal-500/80 uppercase font-bold">Awake</span>
                        <span className="text-[8px] text-muted-foreground/40 font-bold">EST</span>
                      </div>
                      <span className="font-mono font-bold text-base text-teal-500 block">
                        {descentData.daytimeBmrDrift > 0
                          ? `-${descentData.daytimeBmrDrift.toFixed(1)}`
                          : '—'}
                        <span className="text-[10px] text-teal-500/50 font-normal ml-1">lbs</span>
                      </span>
                    </StatCard>

                    {/* Extras */}
                    {hasExtras ? (
                      <StatCard id="extras" dashed>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-orange-400/80 uppercase font-bold">Extras</span>
                          <span className="text-[8px] text-muted-foreground/40 font-bold">INFO</span>
                        </div>
                        <span className="font-mono font-bold text-base text-orange-400 block">
                          {extraStats.avgLoss !== null
                            ? `-${extraStats.avgLoss.toFixed(1)}`
                            : '—'}
                          <span className="text-[10px] text-orange-400/50 font-normal ml-1">lbs</span>
                        </span>
                      </StatCard>
                    ) : (
                      <div className={cn(
                        "bg-muted/20 rounded-lg p-2.5 border border-dashed border-muted-foreground/10 flex items-center justify-center transition-all duration-200",
                        flippedCard !== null && "opacity-40"
                      )}>
                        <span className="text-[10px] text-muted-foreground/40">No extras logged</span>
                      </div>
                    )}
                  </div>

                  {/* ── Expanded Detail Panel ── animated slide down */}
                  {flippedCard && (
                    <div className="mb-3 mx-4 rounded-lg border border-border/50 bg-muted/40 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
                      <div className="p-3">
                        {/* Sleep detail */}
                        {flippedCard === 'sleep' && (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Sleep Drift History</span>
                              <button onClick={() => setFlippedCard(null)} className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-lg hover:bg-muted/50">
                                <ChevronRight className="w-4 h-4 rotate-90" />
                              </button>
                            </div>
                            {descentData.recentDrifts.length > 0 ? (
                              <>
                                <SparkBars values={descentData.recentDrifts} color="bg-purple-400" label="lbs lost per night" />
                                {descentData.recentSleepHours.length > 0 && (
                                  <div className="mt-3">
                                    <SparkBars values={descentData.recentSleepHours} color="bg-purple-300/60" label="hours slept" suffix="h" />
                                  </div>
                                )}
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Rate</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">
                                      {descentData.avgDriftRateOzPerHr !== null ? `${descentData.avgDriftRateOzPerHr.toFixed(2)}` : '—'}
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/50">lbs/hr</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Avg Sleep</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">{descentData.emaSleepHours.toFixed(1)}</span>
                                    <span className="block text-[9px] text-muted-foreground/50">hrs/night</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Range</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">
                                      {descentData.recentDrifts.length >= 2
                                        ? `${Math.min(...descentData.recentDrifts.map(Math.abs)).toFixed(1)}–${Math.max(...descentData.recentDrifts.map(Math.abs)).toFixed(1)}`
                                        : descentData.recentDrifts[0] ? Math.abs(descentData.recentDrifts[0]).toFixed(1) : '—'}
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/50">lbs</span>
                                  </div>
                                </div>
                                {descentData.weekOverWeek && descentData.weekOverWeek.lastWeekAvgDrift !== null && descentData.weekOverWeek.thisWeekAvgDrift !== null && (
                                  <div className="mt-3 pt-3 border-t border-border/30">
                                    <span className="text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wide">Week over Week</span>
                                    <div className="flex items-baseline gap-2 mt-1">
                                      <span className="text-[11px] font-mono text-muted-foreground">
                                        This: <span className="font-bold text-foreground">{descentData.weekOverWeek.thisWeekAvgDrift.toFixed(2)}</span>
                                      </span>
                                      <span className="text-[11px] font-mono text-muted-foreground">
                                        Last: <span className="font-bold text-foreground/70">{descentData.weekOverWeek.lastWeekAvgDrift.toFixed(2)}</span>
                                      </span>
                                      {(() => {
                                        const diff = descentData.weekOverWeek!.thisWeekAvgDrift! - descentData.weekOverWeek!.lastWeekAvgDrift!;
                                        const pct = Math.round((diff / Math.max(Math.abs(descentData.weekOverWeek!.lastWeekAvgDrift!), 0.01)) * 100);
                                        return (
                                          <span className={cn("text-[10px] font-bold", diff > 0 ? "text-green-500" : diff < 0 ? "text-orange-500" : "text-muted-foreground/50")}>
                                            {diff > 0 ? '+' : ''}{pct}%
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground/50 text-center py-2">Log before-bed and morning weights to see drift data</p>
                            )}
                          </>
                        )}

                        {/* Practice detail */}
                        {flippedCard === 'practice' && (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Practice Loss History</span>
                              <button onClick={() => setFlippedCard(null)} className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-lg hover:bg-muted/50">
                                <ChevronRight className="w-4 h-4 rotate-90" />
                              </button>
                            </div>
                            {descentData.recentPracticeLosses.length > 0 ? (
                              <>
                                <SparkBars values={descentData.recentPracticeLosses} color="bg-green-400" label="lbs lost" />
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Sweat Rate</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">
                                      {descentData.avgSweatRateOzPerHr !== null ? `${descentData.avgSweatRateOzPerHr.toFixed(2)}` : '—'}
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/50">lbs/hr</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Avg Length</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">{descentData.emaPracticeHours.toFixed(1)}</span>
                                    <span className="block text-[9px] text-muted-foreground/50">hrs/session</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Range</span>
                                    <span className="block font-mono text-sm font-bold text-foreground">
                                      {descentData.recentPracticeLosses.length >= 2
                                        ? `${Math.min(...descentData.recentPracticeLosses.map(Math.abs)).toFixed(1)}–${Math.max(...descentData.recentPracticeLosses.map(Math.abs)).toFixed(1)}`
                                        : descentData.recentPracticeLosses[0] ? Math.abs(descentData.recentPracticeLosses[0]).toFixed(1) : '—'}
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/50">lbs</span>
                                  </div>
                                </div>
                                {descentData.weekOverWeek && descentData.weekOverWeek.lastWeekAvgPractice !== null && descentData.weekOverWeek.thisWeekAvgPractice !== null && (
                                  <div className="mt-3 pt-3 border-t border-border/30">
                                    <span className="text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wide">Week over Week</span>
                                    <div className="flex items-baseline gap-2 mt-1">
                                      <span className="text-[11px] font-mono text-muted-foreground">
                                        This: <span className="font-bold text-foreground">{descentData.weekOverWeek.thisWeekAvgPractice.toFixed(2)}</span>
                                      </span>
                                      <span className="text-[11px] font-mono text-muted-foreground">
                                        Last: <span className="font-bold text-foreground/70">{descentData.weekOverWeek.lastWeekAvgPractice.toFixed(2)}</span>
                                      </span>
                                      {(() => {
                                        const diff = descentData.weekOverWeek!.thisWeekAvgPractice! - descentData.weekOverWeek!.lastWeekAvgPractice!;
                                        const pct = Math.round((diff / Math.max(Math.abs(descentData.weekOverWeek!.lastWeekAvgPractice!), 0.01)) * 100);
                                        return (
                                          <span className={cn("text-[10px] font-bold", diff > 0 ? "text-green-500" : diff < 0 ? "text-orange-500" : "text-muted-foreground/50")}>
                                            {diff > 0 ? '+' : ''}{pct}%
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground/50 text-center py-2">Log pre/post practice weights to see sweat data</p>
                            )}
                          </>
                        )}

                        {/* Awake detail */}
                        {flippedCard === 'awake' && (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Awake Drift Estimate</span>
                              <button onClick={() => setFlippedCard(null)} className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-lg hover:bg-muted/50">
                                <ChevronRight className="w-4 h-4 rotate-90" />
                              </button>
                            </div>
                            <div className="bg-background/50 rounded-lg p-3 mb-3">
                              <p className="text-xs font-mono text-center text-muted-foreground leading-relaxed">
                                24 hrs − <span className="text-foreground font-bold">{descentData.emaSleepHours.toFixed(1)}</span> sleep − <span className="text-foreground font-bold">{descentData.emaPracticeHours.toFixed(1)}</span> practice
                              </p>
                              <p className="text-sm font-mono text-center text-teal-500 font-bold mt-1">
                                = {(24 - descentData.emaSleepHours - descentData.emaPracticeHours).toFixed(1)} hrs awake
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="text-center bg-muted/30 rounded-lg py-2">
                                <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Drift Rate</span>
                                <span className="block font-mono text-sm font-bold text-teal-500">
                                  {descentData.avgDriftRateOzPerHr !== null ? `${descentData.avgDriftRateOzPerHr.toFixed(2)} lbs/hr` : '—'}
                                </span>
                              </div>
                              <div className="text-center bg-muted/30 rounded-lg py-2">
                                <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Est. Loss</span>
                                <span className="block font-mono text-sm font-bold text-teal-500">
                                  {descentData.daytimeBmrDrift > 0 ? `-${descentData.daytimeBmrDrift.toFixed(1)} lbs` : '—'}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/40 text-center mt-2 leading-relaxed">
                              Uses overnight drift rate as proxy for daytime metabolic rate. Not included in the projection — shown for awareness only.
                            </p>
                          </>
                        )}

                        {/* Extras detail */}
                        {flippedCard === 'extras' && (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Extra Workouts</span>
                              <button onClick={() => setFlippedCard(null)} className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-lg hover:bg-muted/50">
                                <ChevronRight className="w-4 h-4 rotate-90" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="text-center bg-muted/30 rounded-lg py-2.5">
                                <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Total</span>
                                <span className="block font-mono text-lg font-bold text-orange-400">{extraStats.totalWorkouts}</span>
                                <span className="block text-[9px] text-muted-foreground/50">sessions</span>
                              </div>
                              <div className="text-center bg-muted/30 rounded-lg py-2.5">
                                <span className="block text-[10px] text-muted-foreground/60 uppercase font-bold">Today</span>
                                <span className="block font-mono text-lg font-bold text-orange-400">{extraStats.todayWorkouts}</span>
                                <span className="block text-[9px] text-muted-foreground/50">
                                  {extraStats.todayLoss > 0 ? `-${extraStats.todayLoss.toFixed(1)} lbs` : 'session' + (extraStats.todayWorkouts !== 1 ? 's' : '')}
                                </span>
                              </div>
                            </div>
                            {extraStats.avgSweatRateOzPerHr !== null && (
                              <div className="text-center bg-muted/30 rounded-lg py-2">
                                <span className="text-[10px] text-muted-foreground/60 uppercase font-bold">Avg Sweat Rate: </span>
                                <span className="font-mono text-sm font-bold text-orange-400">{extraStats.avgSweatRateOzPerHr.toFixed(2)} lbs/hr</span>
                              </div>
                            )}
                            <p className="text-[10px] text-muted-foreground/40 text-center mt-2 leading-relaxed">
                              Extra workouts are tracked separately and not included in the projection.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  </>
                );
              })()}

              {/* Bottom padding */}
              <div className="pb-3" />

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




