import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Droplets, Scale, Utensils, Dumbbell, Moon, Sun,
  ChevronRight, ChevronDown, CheckCircle2, Plus, Settings, Info,
  AlertTriangle, Flame, Zap, Trophy, Pencil, Trash2, Apple,
  Calendar, ArrowRight, Clock, Heart, Target, TrendingDown, TrendingUp, LogOut, Weight,
  HelpCircle, Minus, Sparkles, PartyPopper
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { getPhaseStyleForDaysUntil, PHASE_STYLES, getPhaseStyle } from "@/lib/phase-colors";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecoveryTakeover } from "@/components/recovery-takeover";
import { CompetitionDayTakeover } from "@/components/competition-day-takeover";
import { TrendChart, SettingsDialog, WeighInCountdown, MacroTracker, DateNavigator } from "@/components/dashboard";
import { useToast } from "@/hooks/use-toast";
import { useSwipe } from "@/hooks/use-swipe";

export default function Dashboard() {
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
    getHistoryInsights,
    getCheckpoints,
    getTodaysFoods,
    getDaysUntilWeighIn,
    getTimeUntilWeighIn,
    isWaterLoadingDay,
    clearLogs
  } = useStore();

  const phase = getPhase();
  const displayDate = profile.simulatedDate || new Date();
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const isViewingHistorical = !!profile.simulatedDate;
  const today = startOfDay(new Date());

  // Handle date navigation
  const handleDateChange = useCallback((date: Date | null) => {
    updateProfile({ simulatedDate: date });
  }, [updateProfile]);

  // Swipe navigation
  const handleSwipeLeft = useCallback(() => {
    // Swipe left = go to next day (toward today)
    if (!isViewingHistorical) return; // Already at today
    const nextDay = addDays(displayDate, 1);
    if (nextDay >= today) {
      handleDateChange(null);
    } else {
      handleDateChange(nextDay);
    }
  }, [displayDate, isViewingHistorical, today, handleDateChange]);

  const handleSwipeRight = useCallback(() => {
    // Swipe right = go to previous day
    const prevDay = subDays(displayDate, 1);
    handleDateChange(prevDay);
  }, [displayDate, handleDateChange]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  }, { threshold: 75 });

  // Macro tracking data
  const macros = getMacroTargets();
  const foodLists = getFoodLists();
  const todaysFoods = getTodaysFoods();

  // Competition Day Takeover (only for cutting protocols, not Build Phase)
  if (phase === 'last-24h' && daysUntilWeighIn === 0 && profile.protocol !== '4') {
    return <CompetitionDayTakeover />;
  }

  // Final Push (day before weigh-in, only for cutting protocols, not Build Phase)
  if (phase === 'last-24h' && profile.protocol !== '4') {
    return <RecoveryTakeover />;
  }

  const fuel = getFuelingGuide();
  const hydration = getHydrationTarget();
  const targetWeight = calculateTarget();

  // Get protocol display name
  const getProtocolName = () => {
    switch (profile.protocol) {
      case '1': return 'Body Comp Phase';
      case '2': return 'Make Weight Phase';
      case '3': return 'Hold Weight Phase';
      case '4': return 'Build Phase';
      default: return 'Unknown';
    }
  };

  // Get phase display info - driven by days-until-weigh-in, not day-of-week
  const getPhaseInfo = () => {
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
  const checkpoints = getCheckpoints();
  const historyInsights = getHistoryInsights();

  // Check if user has overnight drift history
  const hasOvernightDriftHistory = historyInsights.avgOvernightDrift !== null;
  const overnightDrift = hasOvernightDriftHistory
    ? Math.abs(historyInsights.avgOvernightDrift)
    : null; // null indicates we should show a range

  const phaseInfo = getPhaseInfo();

  // Phase color mapping for UI elements
  const { phase: currentPhaseName, style: phaseStyle } = getPhaseStyleForDaysUntil(daysUntilWeighIn);

  // Get today's tracking data for status summary
  const dateKey = format(displayDate, 'yyyy-MM-dd');
  const dailyTracking = getDailyTracking(dateKey);

  // Calculate today's log completion status
  const getTodayLogs = () => {
    const todayDate = displayDate;
    return {
      morning: logs.find(log => {
        const logDate = new Date(log.date);
        return log.type === 'morning' &&
          logDate.getFullYear() === todayDate.getFullYear() &&
          logDate.getMonth() === todayDate.getMonth() &&
          logDate.getDate() === todayDate.getDate();
      }),
      prePractice: logs.find(log => {
        const logDate = new Date(log.date);
        return log.type === 'pre-practice' &&
          logDate.getFullYear() === todayDate.getFullYear() &&
          logDate.getMonth() === todayDate.getMonth() &&
          logDate.getDate() === todayDate.getDate();
      }),
      postPractice: logs.find(log => {
        const logDate = new Date(log.date);
        return log.type === 'post-practice' &&
          logDate.getFullYear() === todayDate.getFullYear() &&
          logDate.getMonth() === todayDate.getMonth() &&
          logDate.getDate() === todayDate.getDate();
      }),
      beforeBed: logs.find(log => {
        const logDate = new Date(log.date);
        return log.type === 'before-bed' &&
          logDate.getFullYear() === todayDate.getFullYear() &&
          logDate.getMonth() === todayDate.getMonth() &&
          logDate.getDate() === todayDate.getDate();
      }),
    };
  };

  const todayLogs = getTodayLogs();
  const weighInsComplete = [todayLogs.morning, todayLogs.prePractice, todayLogs.postPractice, todayLogs.beforeBed].filter(Boolean).length;

  // Most recent weigh-in today (any type) for metrics strip
  const mostRecentLog = logs
    .filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === displayDate.getFullYear() &&
        ld.getMonth() === displayDate.getMonth() &&
        ld.getDate() === displayDate.getDate();
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const currentDisplayWeight = mostRecentLog?.weight ?? todayLogs.morning?.weight;

  return (
    <MobileLayout showNav={true}>
      <div {...swipeHandlers}>
        {/* Header */}
        <header className="flex justify-between items-start mb-4">
          <div className="flex-1">
            {/* Date Navigator - WHOOP style */}
            <DateNavigator
              currentDate={displayDate}
              onDateChange={handleDateChange}
              className="mb-2"
            />
            <h1 className="text-2xl font-heading font-bold uppercase italic">
              {isViewingHistorical ? "Day Review" : "Today's Plan"}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("text-xs font-bold uppercase", phaseInfo.color)}>
                {phaseInfo.label}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{getProtocolName()}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <SettingsDialog profile={profile} updateProfile={updateProfile} resetData={useStore().resetData} clearLogs={clearLogs} />
            <InfoDialog />
          </div>
        </header>

        {/* Historical View Notice */}
        {isViewingHistorical && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-yellow-500 text-xs font-bold uppercase">
                Read-Only View
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
      {/* DAILY COMMAND BAR — single-line status at a glance     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 -mx-4 mb-3 rounded-none",
        statusInfo.status === 'on-track' ? "bg-green-500/10" :
        statusInfo.status === 'borderline' ? "bg-yellow-500/10" :
        "bg-red-500/10"
      )}>
        {/* Phase pill + countdown */}
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
            phaseStyle.bgMedium, phaseStyle.text
          )}>
            {daysUntilWeighIn > 5 ? `${daysUntilWeighIn}D OUT` :
             daysUntilWeighIn === 5 ? `LOAD · DAY 1` :
             daysUntilWeighIn === 4 ? `LOAD · DAY 2` :
             daysUntilWeighIn === 3 ? `LOAD · DAY 3` :
             daysUntilWeighIn === 2 ? `PREP · ZERO FIBER` :
             daysUntilWeighIn === 1 ? `CUT · SIP ONLY` :
             daysUntilWeighIn === 0 ? 'COMPETE' :
             'RECOVERY'}
          </span>
          {daysUntilWeighIn >= 0 && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              phaseStyle.text, phaseStyle.bgLight
            )}>
              {getTimeUntilWeighIn()}
            </span>
          )}
        </div>

        {/* Status label + context */}
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] font-bold uppercase",
            statusInfo.status === 'on-track' ? "text-green-500" :
            statusInfo.status === 'borderline' ? "text-yellow-500" :
            "text-red-500"
          )}>
            {statusInfo.label}
          </span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
            {statusInfo.contextMessage}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FOCUS CARD — one question: "What should I do now?"     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        "border rounded-lg p-4 mb-3",
        dailyPriority.urgency === 'critical' ? "border-red-500/40 bg-red-500/5" :
        dailyPriority.urgency === 'high' ? "border-yellow-500/40 bg-yellow-500/5" :
        "border-primary/30 bg-primary/5"
      )}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Your Focus Today
        </span>
        <p className="text-sm font-medium text-foreground mt-1.5 leading-snug">
          {dailyPriority.priority}
        </p>
        {/* Fiber warning inline for cut days */}
        {(daysUntilWeighIn === 1 || daysUntilWeighIn === 2) && (
          <p className="text-xs text-orange-400 mt-2">
            No vegetables, fruits with skin, whole grains, or beans. Check every ingredient.
          </p>
        )}
        {/* Subtext — projection warning, recommendation, or water loading context */}
        {dailyPriority.subtext && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {dailyPriority.subtext}
          </p>
        )}
        {/* Action button when recommendation suggests extra workouts */}
        {statusInfo.recommendation && statusInfo.recommendation.extraWorkoutsNeeded > 0 && !isViewingHistorical && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: 'extra-workout' } }));
            }}
            className="mt-3 h-7 text-xs px-4 border-muted-foreground/30"
          >
            <Dumbbell className="w-3 h-3 mr-1.5" />
            Log Extra Workout
          </Button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* METRICS STRIP — static grid                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-1 mb-4 bg-muted/30 rounded-lg p-2">
        {/* Weight — most recent weigh-in today */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-muted-foreground uppercase">
            {mostRecentLog && mostRecentLog.type !== 'morning' ? 'Current' : 'Weight'}
          </span>
          <span className="text-[13px] font-mono font-bold text-foreground">
            {currentDisplayWeight ? currentDisplayWeight.toFixed(1) : '—'}
          </span>
        </div>

        {/* Water */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-muted-foreground uppercase">Water</span>
          <span className="text-[13px] font-mono font-bold text-foreground">
            {dailyTracking.waterConsumed}/{hydration.targetOz}<span className="text-[9px] text-muted-foreground">oz</span>
          </span>
        </div>

        {/* Weigh-ins */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-muted-foreground uppercase">Weigh-ins</span>
          <span className="text-[13px] font-mono font-bold text-foreground">
            {weighInsComplete}/4
          </span>
        </div>

        {/* Projected */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] text-muted-foreground uppercase">Projected</span>
          <span className={cn(
            "text-[13px] font-mono font-bold",
            descentData.projectedSaturday !== null && descentData.daysRemaining > 0
              ? (descentData.projectedSaturday <= descentData.targetWeight ? "text-green-500" : "text-yellow-500")
              : "text-muted-foreground"
          )}>
            {descentData.projectedSaturday !== null && descentData.daysRemaining > 0
              ? descentData.projectedSaturday.toFixed(1)
              : '—'}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TODAY'S WEIGH-IN TIMELINE — at-a-glance log status     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <TodayTimeline
        todayLogs={todayLogs}
        logs={logs}
        displayDate={displayDate}
        mostRecentLog={mostRecentLog}
        targetWeight={targetWeight}
        updateLog={updateLog}
        deleteLog={deleteLog}
        readOnly={isViewingHistorical}
      />

      {/* Weigh-In Countdown - 1-3 days out (kept but simplified) */}
      {(daysUntilWeighIn >= 1 && daysUntilWeighIn <= 3) && (profile.protocol === '1' || profile.protocol === '2') && (
        <WeighInCountdown
          daysUntilWeighIn={daysUntilWeighIn}
          dayBeforeTarget={daysUntilWeighIn === 1 ? checkpoints.friTarget : undefined}
        />
      )}

      {/* Week Descent — collapsed by default */}
      {!profile.simulatedDate && descentData.morningWeights.length >= 2 && (
        <details className="mb-4">
          <summary className="flex items-center justify-between cursor-pointer bg-card border border-muted rounded-lg p-3">
            <div className="flex items-center gap-2">
              <TrendingDown className={cn("w-4 h-4", phaseStyle.text)} />
              <span className="text-xs font-bold uppercase text-muted-foreground">Week Descent</span>
            </div>
            <div className="flex items-center gap-2">
              {descentData.pace && (() => {
                return (
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    phaseStyle.bgLight, phaseStyle.text
                  )}>
                    {currentPhaseName.toUpperCase()}
                  </span>
                );
              })()}
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </summary>
          <div className="bg-card border border-t-0 border-muted rounded-b-lg p-3 pt-2">
            {/* Mini weight trend visualization */}
            <div className="flex items-end justify-between gap-1 h-12 mb-2">
              {descentData.morningWeights.map((entry, i) => {
                const weights = descentData.morningWeights.map(e => e.weight);
                const maxW = Math.max(...weights);
                const minW = Math.min(...weights, descentData.targetWeight);
                const range = maxW - minW || 1;
                const heightPercent = ((entry.weight - minW) / range) * 100;
                const isLatest = i === descentData.morningWeights.length - 1;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        isLatest ? phaseStyle.bg : phaseStyle.bgBar
                      )}
                      style={{ height: `${Math.max(heightPercent, 10)}%` }}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {entry.date ? `${new Date(entry.date).getMonth() + 1}/${new Date(entry.date).getDate()}` : entry.day}
                    </span>
                  </div>
                );
              })}
              <div className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-[10%] rounded-t border-2 border-dashed border-green-500/50" />
                <span className="text-[8px] text-green-500">Goal</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-muted">
              <div>
                <span className="text-[10px] text-muted-foreground block">Drift</span>
                <span className={cn(
                  "font-mono font-bold text-sm",
                  descentData.avgOvernightDrift !== null ? "text-cyan-500" : ""
                )}>
                  {descentData.avgOvernightDrift !== null
                    ? `-${Math.abs(descentData.avgOvernightDrift).toFixed(1)}`
                    : '-'} lbs
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Practice</span>
                <span className={cn(
                  "font-mono font-bold text-sm",
                  descentData.avgPracticeLoss !== null ? "text-orange-500" : ""
                )}>
                  {descentData.avgPracticeLoss !== null
                    ? `-${Math.abs(descentData.avgPracticeLoss).toFixed(1)}`
                    : '-'} lbs
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Projected</span>
                <span className={cn(
                  "font-mono font-bold text-sm",
                  descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight
                    ? "text-green-500"
                    : "text-yellow-500"
                )}>
                  {descentData.projectedSaturday !== null ? `${descentData.projectedSaturday.toFixed(1)}` : '-'} lbs
                </span>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FUEL SECTION - Food & Hydration grouped together */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Food Tracking */}
        <MacroTracker
          macros={macros}
          todaysFoods={todaysFoods}
          foodLists={foodLists}
          daysUntilWeighIn={daysUntilWeighIn}
          protocol={profile.protocol}
          readOnly={isViewingHistorical}
        />

        {/* Hydration */}
        <HydrationTracker hydration={hydration} readOnly={isViewingHistorical} />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* INFO SECTION - Planning & Insights */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        {/* Weight Trend Chart - Moved up for visibility */}
        <TrendChart />

        {/* What's Next */}
        <WhatsNextCard getTomorrowPlan={getTomorrowPlan} getWeeklyPlan={getWeeklyPlan} />

        {/* History Insights */}
        <HistoryInsightsCard getHistoryInsights={getHistoryInsights} targetWeightClass={profile.targetWeightClass} />
      </div>

        {/* Bottom Spacing for Nav */}
        <div className="h-20" />
      </div>
    </MobileLayout>
  );
}

// Daily Step with Weight Logging
function DailyStep({
  step,
  title,
  description,
  icon: Icon,
  logs,
  logType,
  addLog,
  updateLog,
  deleteLog,
  targetWeight,
  targetWeightRange,
  simulatedDate,
  readOnly = false,
  isWaterLoadingDay = false
}: {
  step: number;
  title: string;
  description: string;
  icon: any;
  logs: any[];
  logType: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: any;
  updateLog: any;
  deleteLog: any;
  targetWeight?: number;
  targetWeightRange?: { min: number; max: number };
  simulatedDate?: Date | null;
  readOnly?: boolean;
  isWaterLoadingDay?: boolean;
}) {
  const [weight, setWeight] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Check if already logged today (use simulated date if available)
  const today = simulatedDate || new Date();
  const todayLog = logs.find(log => {
    const logDate = new Date(log.date);
    return log.type === logType &&
           logDate.getFullYear() === today.getFullYear() &&
           logDate.getMonth() === today.getMonth() &&
           logDate.getDate() === today.getDate();
  });

  // Get yesterday's same log type for pre-fill suggestion
  const yesterday = subDays(today, 1);
  const yesterdayLog = logs.find(log => {
    const logDate = new Date(log.date);
    return log.type === logType &&
           logDate.getFullYear() === yesterday.getFullYear() &&
           logDate.getMonth() === yesterday.getMonth() &&
           logDate.getDate() === yesterday.getDate();
  });

  // Get most recent log of this type as fallback
  const recentLog = logs
    .filter(log => log.type === logType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const suggestedWeight = yesterdayLog?.weight || recentLog?.weight || (targetWeight ? Math.round(targetWeight) : null);

  const isComplete = !!todayLog;
  const { toast } = useToast();

  // Validate weight is reasonable (between 80 and 350 lbs for wrestling)
  const validateWeight = (w: number): boolean => {
    if (w < 80 || w > 350) {
      toast({
        title: "Invalid weight",
        description: "Weight must be between 80 and 350 lbs",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Adjust weight by increment
  const adjustWeight = (increment: number) => {
    const current = parseFloat(weight) || suggestedWeight || 150;
    const newWeight = Math.max(80, Math.min(350, current + increment));
    setWeight(newWeight.toFixed(1));
  };

  const handleStartLogging = () => {
    // Pre-fill with suggested weight
    if (suggestedWeight) {
      setWeight(suggestedWeight.toString());
    }
    setIsLogging(true);
  };

  const handleSubmit = () => {
    if (weight) {
      const parsedWeight = parseFloat(weight);
      if (!validateWeight(parsedWeight)) return;

      // Use simulated date if available, with appropriate time for log type
      const logDate = new Date(today);
      if (logType === 'morning') logDate.setHours(7, 0, 0, 0);
      else if (logType === 'pre-practice') logDate.setHours(15, 0, 0, 0);
      else if (logType === 'post-practice') logDate.setHours(17, 0, 0, 0);
      else if (logType === 'before-bed') logDate.setHours(22, 0, 0, 0);

      addLog({
        weight: parsedWeight,
        date: logDate,
        type: logType,
      });

      // Show success animation
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);

      // Show celebration toast if on target
      if (targetWeight && parsedWeight <= targetWeight) {
        toast({
          title: "On target!",
          description: `${parsedWeight.toFixed(1)} lbs - you're right where you need to be`,
        });
      }

      setWeight('');
      setIsLogging(false);
      // Blur any focused input to close mobile keyboard
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleEdit = () => {
    setWeight(todayLog.weight.toString());
    setIsEditing(true);
  };

  const handleUpdate = () => {
    if (weight && todayLog) {
      const parsedWeight = parseFloat(weight);
      if (!validateWeight(parsedWeight)) return;

      updateLog(todayLog.id, { weight: parsedWeight });
      setWeight('');
      setIsEditing(false);
      // Blur any focused input to close mobile keyboard
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleCancel = () => {
    setWeight('');
    setIsLogging(false);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (todayLog) {
      deleteLog(todayLog.id);
      toast({
        title: "Weight deleted",
        description: `${logType.replace('-', ' ')} weigh-in removed`,
      });
    }
  };

  return (
    <Card className={cn(
      "border-muted transition-all",
      isComplete && "bg-primary/5 border-primary/30"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            isComplete ? "bg-primary" : "bg-muted/50"
          )}>
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-black" />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">{step}</span>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("w-4 h-4", isComplete ? "text-primary" : "text-muted-foreground")} />
              <h3 className={cn("font-bold", isComplete && "text-primary")}>{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{description}</p>

            {isComplete && !isEditing ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-lg text-primary">{todayLog.weight} lbs</span>
                <span className="text-xs text-muted-foreground">at {format(new Date(todayLog.date), 'h:mm a')}</span>
                {targetWeight !== undefined ? (() => {
                  const diff = todayLog.weight - targetWeight;
                  const isOnTarget = diff <= 0;
                  // During water loading, +1-4 lbs is expected and OK
                  const isWaterLoadingOK = isWaterLoadingDay && diff > 0 && diff <= 4;
                  const isWaterLoadingBorderline = isWaterLoadingDay && diff > 4 && diff <= 6;

                  return (
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      isOnTarget ? "bg-green-500/20 text-green-500" :
                      isWaterLoadingOK ? "bg-cyan-500/20 text-cyan-500" :
                      isWaterLoadingBorderline ? "bg-yellow-500/20 text-yellow-500" :
                      diff <= 2 ? "bg-yellow-500/20 text-yellow-500" :
                      "bg-destructive/20 text-destructive"
                    )}>
                      {isOnTarget ? "ON TARGET" :
                       isWaterLoadingOK ? `+${diff.toFixed(1)} water` :
                       `+${diff.toFixed(1)} lbs`}
                    </span>
                  );
                })() : targetWeightRange ? (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    todayLog.weight <= targetWeightRange.max ? "bg-green-500/20 text-green-500" :
                    todayLog.weight <= targetWeightRange.max + 1 ? "bg-yellow-500/20 text-yellow-500" :
                    "bg-destructive/20 text-destructive"
                  )}>
                    {todayLog.weight <= targetWeightRange.max ? "ON TARGET" :
                     `+${(todayLog.weight - targetWeightRange.max).toFixed(1)} lbs`}
                  </span>
                ) : null}
                {!readOnly && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={handleEdit}
                      className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit weight"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete weight"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : isEditing ? (
              <div className="space-y-2">
                {/* Weight input with +/- buttons */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adjustWeight(-0.2)}
                    className="h-10 w-10 p-0"
                    title="-0.2 lbs"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    placeholder="Weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-24 h-10 font-mono text-center text-lg"
                    step="0.1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adjustWeight(0.2)}
                    className="h-10 w-10 p-0"
                    title="+0.2 lbs"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">lbs</span>
                </div>
                {/* Quick adjust buttons */}
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => adjustWeight(-1)} className="h-7 px-2 text-xs">-1</Button>
                  <Button size="sm" variant="ghost" onClick={() => adjustWeight(-0.5)} className="h-7 px-2 text-xs">-0.5</Button>
                  <Button size="sm" variant="ghost" onClick={() => adjustWeight(0.5)} className="h-7 px-2 text-xs">+0.5</Button>
                  <Button size="sm" variant="ghost" onClick={() => adjustWeight(1)} className="h-7 px-2 text-xs">+1</Button>
                  <div className="flex-1" />
                  <Button size="sm" onClick={handleUpdate} className="h-7">
                    Update
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not yet logged</span>
            )}

            {!isComplete && !isEditing && (
              <div className="mt-2 space-y-1">
                {targetWeight !== undefined ? (
                  <p className="text-[10px] text-muted-foreground">
                    Target: {targetWeight.toFixed(1)} lbs
                  </p>
                ) : targetWeightRange ? (
                  <p className="text-[10px] text-muted-foreground">
                    Target: {targetWeightRange.min.toFixed(1)}-{targetWeightRange.max.toFixed(1)} lbs
                  </p>
                ) : null}
                <p className="text-[10px] text-muted-foreground">
                  Tap <span className="text-primary font-bold">+</span> to log
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Extra Workout Log
function ExtraWorkoutLog({ addLog, logs, simulatedDate, deleteLog, updateLog, readOnly = false }: { addLog: any; logs: any[]; simulatedDate?: Date | null; deleteLog: any; updateLog: any; readOnly?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [beforeWeight, setBeforeWeight] = useState('');
  const [afterWeight, setAfterWeight] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBefore, setEditBefore] = useState('');
  const [editAfter, setEditAfter] = useState('');

  // Get today's extra workouts (use simulated date if available)
  const today = simulatedDate || new Date();
  const todayExtraLogs = logs.filter(log => {
    const logDate = new Date(log.date);
    return (log.type === 'extra-before' || log.type === 'extra-after') &&
      logDate.getFullYear() === today.getFullYear() &&
      logDate.getMonth() === today.getMonth() &&
      logDate.getDate() === today.getDate();
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group extra workouts by pairs (before/after logged close together)
  const extraWorkouts: { before: any; after: any | null; time: Date }[] = [];
  const usedAfterIds = new Set<string>();
  for (let i = 0; i < todayExtraLogs.length; i++) {
    const log = todayExtraLogs[i];
    if (log.type === 'extra-before') {
      // Find matching after within 5 minutes that hasn't been used
      const after = todayExtraLogs.find(l =>
        l.type === 'extra-after' &&
        !usedAfterIds.has(l.id) &&
        new Date(l.date).getTime() - new Date(log.date).getTime() >= 0 &&
        new Date(l.date).getTime() - new Date(log.date).getTime() < 5 * 60 * 1000
      );
      if (after) {
        usedAfterIds.add(after.id);
        extraWorkouts.push({ before: log, after, time: new Date(log.date) });
      } else {
        // Orphaned extra-before - show as pending
        extraWorkouts.push({ before: log, after: null, time: new Date(log.date) });
      }
    }
  }

  const handleSubmit = () => {
    if (beforeWeight && afterWeight) {
      // Use simulated date if available
      const baseDate = new Date(today);
      const realNow = new Date();
      baseDate.setHours(realNow.getHours(), realNow.getMinutes(), realNow.getSeconds(), 0);

      // Log before weight
      addLog({
        weight: parseFloat(beforeWeight),
        date: baseDate,
        type: 'extra-before',
      });
      // Log after weight (1 second later for ordering)
      addLog({
        weight: parseFloat(afterWeight),
        date: new Date(baseDate.getTime() + 1000),
        type: 'extra-after',
      });
      setBeforeWeight('');
      setAfterWeight('');
      setIsOpen(false);
    }
  };

  const handleDelete = (workout: { before: any; after: any | null }) => {
    deleteLog(workout.before.id);
    if (workout.after) deleteLog(workout.after.id);
  };

  const handleEdit = (workout: { before: any; after: any | null }) => {
    setEditingId(workout.before.id);
    setEditBefore(workout.before.weight.toString());
    setEditAfter(workout.after ? workout.after.weight.toString() : '');
  };

  const handleSaveEdit = (workout: { before: any; after: any | null }) => {
    if (editBefore && editAfter) {
      updateLog(workout.before.id, { weight: parseFloat(editBefore) });
      if (workout.after) updateLog(workout.after.id, { weight: parseFloat(editAfter) });
      setEditingId(null);
      setEditBefore('');
      setEditAfter('');
    }
  };

  return (
    <div className="space-y-2">
      {/* Show logged extra workouts */}
      {extraWorkouts.map((workout, i) => {
        const weightLoss = workout.after ? workout.before.weight - workout.after.weight : null;
        const isEditing = editingId === workout.before.id;

        if (isEditing) {
          return (
            <Card key={i} className="border-muted bg-orange-500/5">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-bold text-orange-500">Edit Extra Workout</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Before</Label>
                    <Input
                      type="number"
                      value={editBefore}
                      onChange={(e) => setEditBefore(e.target.value)}
                      className="font-mono h-8"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">After</Label>
                    <Input
                      type="number"
                      value={editAfter}
                      onChange={(e) => setEditAfter(e.target.value)}
                      className="font-mono h-8"
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveEdit(workout)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          );
        }

        return (
          <Card key={i} className="border-muted bg-orange-500/5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-bold text-orange-500">
                    Extra Workout{!workout.after ? ' (pending)' : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(workout.time, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    {workout.after ? (
                      <>
                        <span className="font-mono text-sm">
                          {workout.before.weight} → {workout.after.weight} lbs
                        </span>
                        <span className={cn(
                          "text-xs font-bold ml-2",
                          weightLoss !== null && weightLoss > 0 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {weightLoss !== null && (weightLoss > 0 ? `-${weightLoss.toFixed(1)}` : `+${Math.abs(weightLoss).toFixed(1)}`)}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">
                        {workout.before.weight} lbs → …
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <>
                      <button
                        onClick={() => handleEdit(workout)}
                        className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(workout)}
                        className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* No inline form - use FAB to log extra workouts */}
    </div>
  );
}

// Quick Check-in - anytime weight check that doesn't count toward daily 1/4
function QuickCheckIn({ addLog, logs, simulatedDate, deleteLog, updateLog, readOnly = false, targetWeight }: {
  addLog: any;
  logs: any[];
  simulatedDate?: Date | null;
  deleteLog: any;
  updateLog: any;
  readOnly?: boolean;
  targetWeight: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');

  const today = simulatedDate || new Date();

  // Get today's check-ins
  const todayCheckIns = logs.filter(log => {
    const logDate = new Date(log.date);
    return log.type === 'check-in' &&
      logDate.getFullYear() === today.getFullYear() &&
      logDate.getMonth() === today.getMonth() &&
      logDate.getDate() === today.getDate();
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleSubmit = () => {
    if (weight) {
      const now = new Date(today);
      now.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0);

      addLog({
        date: now,
        weight: parseFloat(weight),
        type: 'check-in'
      });

      setWeight('');
      setIsOpen(false);
    }
  };

  if (readOnly) return null;

  return (
    <div className="space-y-2">
      {/* Show today's check-ins */}
      {todayCheckIns.length > 0 && (
        <div className="space-y-1">
          {todayCheckIns.map((checkIn) => {
            const diff = checkIn.weight - targetWeight;
            const isEditing = editingId === checkIn.id;

            return (
              <Card key={checkIn.id} className="border-muted bg-muted/10">
                <CardContent className="p-3">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-cyan-500" />
                      <Input
                        type="number"
                        step="0.1"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-20 h-7 text-center text-xs font-mono p-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (editWeight) {
                            updateLog(checkIn.id, { weight: parseFloat(editWeight) });
                          }
                          setEditingId(null);
                          setEditWeight('');
                        }}
                        className="h-6 px-2"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditWeight('');
                        }}
                        className="h-6 px-2"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-cyan-500" />
                        <span className="text-xs text-muted-foreground">Check-in</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(checkIn.date), 'h:mm a')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(checkIn.id);
                            setEditWeight(checkIn.weight.toString());
                          }}
                          className="font-mono font-bold hover:text-primary hover:underline transition-colors"
                        >
                          {checkIn.weight} lbs
                        </button>
                        <span className={cn(
                          "text-xs font-mono",
                          diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-destructive"
                        )}>
                          ({diff > 0 ? '+' : ''}{diff.toFixed(1)} vs target)
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteLog(checkIn.id)}
                          className="h-6 w-6"
                        >
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No inline form - use FAB to log check-ins */}
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
  updateLog,
  deleteLog,
  readOnly = false,
}: {
  todayLogs: { morning: any; prePractice: any; postPractice: any; beforeBed: any };
  logs: any[];
  displayDate: Date;
  mostRecentLog: any;
  targetWeight: number;
  updateLog: (id: string, data: any) => void;
  deleteLog: (id: string) => void;
  readOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const { toast } = useToast();

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
          new Date(l.date).getTime() - new Date(log.date).getTime() < 5 * 60 * 1000
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

  const coreSlots = [
    { key: 'morning', label: 'AM', icon: <Sun className="w-3 h-3" />, log: todayLogs.morning, type: 'morning', color: 'text-yellow-500' },
    { key: 'pre', label: 'PRE', icon: <Dumbbell className="w-3 h-3" />, log: todayLogs.prePractice, type: 'pre-practice', color: 'text-blue-500' },
    { key: 'post', label: 'POST', icon: <Dumbbell className="w-3 h-3" />, log: todayLogs.postPractice, type: 'post-practice', color: 'text-green-500' },
    { key: 'bed', label: 'BED', icon: <Moon className="w-3 h-3" />, log: todayLogs.beforeBed, type: 'before-bed', color: 'text-purple-500' },
  ];

  const handleSlotTap = (type: string, log: any) => {
    if (readOnly) return;
    if (log) {
      // Logged — open inline edit
      setEditingId(log.id);
      setEditWeight(log.weight.toString());
    } else {
      // Empty — open FAB
      window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type } }));
    }
  };

  const handleSaveEdit = (id: string) => {
    const parsed = parseFloat(editWeight);
    if (isNaN(parsed) || parsed < 80 || parsed > 350) return;
    updateLog(id, { weight: parsed });
    setEditingId(null);
    setEditWeight('');
  };

  const handleDelete = (id: string, type: string) => {
    deleteLog(id);
    setEditingId(null);
    setEditWeight('');
    toast({ title: "Deleted", description: `${type.replace('-', ' ')} weigh-in removed` });
  };

  const hasExtrasOrCheckIns = extraWorkouts.length > 0 || todayCheckIns.length > 0;

  return (
    <div className="mb-3 space-y-2">
      {/* Core 4 weigh-in slots */}
      <div className="grid grid-cols-4 gap-1 bg-card border border-muted rounded-lg p-2">
        {coreSlots.map((slot) => {
          const isMostRecent = mostRecentLog && slot.log && mostRecentLog.id === slot.log.id;
          const hasWeight = !!slot.log;
          const diff = hasWeight ? slot.log.weight - targetWeight : null;
          const isEditing = editingId === slot.log?.id;

          if (isEditing) {
            return (
              <div key={slot.key} className="flex flex-col items-center gap-1 py-1">
                <span className={cn("text-[9px] font-bold uppercase", slot.color)}>{slot.label}</span>
                <Input
                  type="number"
                  step="0.1"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full h-7 text-center text-[11px] font-mono p-0.5"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit(slot.log.id);
                    if (e.key === 'Escape') { setEditingId(null); setEditWeight(''); }
                  }}
                />
                <div className="flex gap-0.5">
                  <button onClick={() => handleSaveEdit(slot.log.id)} className="text-[8px] text-green-500 font-bold px-1">Save</button>
                  <button onClick={() => handleDelete(slot.log.id, slot.type)} className="text-[8px] text-red-400 font-bold px-1">Del</button>
                  <button onClick={() => { setEditingId(null); setEditWeight(''); }} className="text-[8px] text-muted-foreground px-1">X</button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={slot.key}
              onClick={() => handleSlotTap(slot.type, slot.log)}
              disabled={readOnly && !hasWeight}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-all",
                hasWeight
                  ? "hover:bg-muted/50 active:scale-95"
                  : readOnly
                    ? "opacity-40"
                    : "hover:bg-primary/10 border border-dashed border-muted-foreground/20 active:scale-95",
                isMostRecent && "ring-1 ring-primary/40 bg-primary/5"
              )}
            >
              <div className="flex items-center gap-1">
                <span className={cn("opacity-70", hasWeight ? slot.color : "text-muted-foreground")}>
                  {slot.icon}
                </span>
                <span className={cn(
                  "text-[9px] font-bold uppercase",
                  hasWeight ? slot.color : "text-muted-foreground"
                )}>
                  {slot.label}
                </span>
              </div>
              <span className={cn(
                "text-[12px] font-mono",
                hasWeight
                  ? isMostRecent ? "font-bold text-foreground" : "text-foreground"
                  : "text-muted-foreground/50"
              )}>
                {hasWeight ? slot.log.weight.toFixed(1) : '—'}
              </span>
              {hasWeight && diff !== null && (
                <span className={cn(
                  "text-[8px] font-mono",
                  diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-red-400"
                )}>
                  {diff <= 0 ? 'on target' : `+${diff.toFixed(1)}`}
                </span>
              )}
              {!hasWeight && !readOnly && (
                <span className="text-[8px] text-primary/60">tap to log</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Extra workouts — before/after with loss */}
      {extraWorkouts.map((workout, i) => {
        const loss = workout.after ? workout.before.weight - workout.after.weight : null;
        return (
          <div key={`extra-${i}`} className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-3.5 h-3.5 text-orange-500" />
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
                <button
                  onClick={() => {
                    deleteLog(workout.before.id);
                    if (workout.after) deleteLog(workout.after.id);
                    toast({ title: "Deleted", description: "Extra workout removed" });
                  }}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Check-ins */}
      {todayCheckIns.map((ci) => {
        const diff = ci.weight - targetWeight;
        return (
          <div key={ci.id} className="flex items-center justify-between bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Scale className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[11px] font-bold text-cyan-500">Check-in</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(ci.date), 'h:mm a')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-foreground">{ci.weight.toFixed(1)}</span>
              <span className={cn(
                "text-[10px] font-mono",
                diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-red-400"
              )}>
                {diff > 0 ? '+' : ''}{diff.toFixed(1)}
              </span>
              {!readOnly && (
                <button
                  onClick={() => {
                    deleteLog(ci.id);
                    toast({ title: "Deleted", description: "Check-in removed" });
                  }}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Weigh-In Section - Groups all practice weigh-ins together
function WeighInSection({
  logs,
  addLog,
  updateLog,
  deleteLog,
  targetWeight,
  overnightDrift,
  simulatedDate,
  readOnly = false,
  isWaterLoadingDay = false,
  waterLoadBonus = 0
}: {
  logs: any[];
  addLog: any;
  updateLog: any;
  deleteLog: any;
  targetWeight: number;
  overnightDrift: number | null;
  simulatedDate?: Date | null;
  readOnly?: boolean;
  isWaterLoadingDay?: boolean;
  waterLoadBonus?: number;
}) {
  const today = simulatedDate || new Date();

  // Check if user has morning weight logged today (determines if they should focus on this section)
  const hasMorningLog = logs.find(log => {
    const logDate = new Date(log.date);
    return log.type === 'morning' &&
      logDate.getFullYear() === today.getFullYear() &&
      logDate.getMonth() === today.getMonth() &&
      logDate.getDate() === today.getDate();
  });

  // Check if it's afternoon/evening (when practice weigh-ins are relevant)
  const currentHour = new Date().getHours();
  const isPracticeTime = currentHour >= 14; // After 2 PM

  // Smart default: collapsed if morning not logged yet, expanded if it's practice time
  const [isExpanded, setIsExpanded] = useState(hasMorningLog && isPracticeTime);

  // Check completion status for each weigh-in type
  const getLogForType = (logType: string) => {
    return logs.find(log => {
      const logDate = new Date(log.date);
      return logDate.toDateString() === today.toDateString() && log.type === logType;
    });
  };

  const prePracticeLog = getLogForType('pre-practice');
  const postPracticeLog = getLogForType('post-practice');
  const beforeBedLog = getLogForType('before-bed');

  const completedCount = [prePracticeLog, postPracticeLog, beforeBedLog].filter(Boolean).length;
  const totalCount = 3;

  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        {/* Section Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="text-left">
              <h3 className="font-bold">Daily Weigh-Ins</h3>
              <span className="text-[10px] text-muted-foreground">
                {completedCount}/{totalCount} logged
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {completedCount === totalCount && (
              <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded font-bold">COMPLETE</span>
            )}
            <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
          </div>
        </button>

        {/* Weigh-In Items */}
        {isExpanded && (
          <div className="mt-4 space-y-3">
            {/* Pre-Practice */}
            <CompactWeighIn
              title="Pre-Practice"
              description="Before practice starts"
              icon={Dumbbell}
              logs={logs}
              logType="pre-practice"
              addLog={addLog}
              updateLog={updateLog}
              deleteLog={deleteLog}
              targetWeight={targetWeight + 1.5}
              simulatedDate={simulatedDate}
              readOnly={readOnly}
              isWaterLoadingDay={isWaterLoadingDay}
              waterLoadBonus={waterLoadBonus}
            />

            {/* Post-Practice */}
            <CompactWeighIn
              title="Post-Practice"
              description="Immediately after practice"
              icon={Dumbbell}
              logs={logs}
              logType="post-practice"
              addLog={addLog}
              updateLog={updateLog}
              deleteLog={deleteLog}
              targetWeight={targetWeight}
              simulatedDate={simulatedDate}
              readOnly={readOnly}
              isWaterLoadingDay={isWaterLoadingDay}
              waterLoadBonus={waterLoadBonus}
            />

            {/* Before Bed */}
            <CompactWeighIn
              title="Before Bed"
              description="Last weigh-in of the day"
              icon={Moon}
              logs={logs}
              logType="before-bed"
              addLog={addLog}
              updateLog={updateLog}
              deleteLog={deleteLog}
              targetWeight={overnightDrift !== null ? targetWeight + overnightDrift : undefined}
              targetWeightRange={overnightDrift === null ? { min: targetWeight + 1, max: targetWeight + 2 } : undefined}
              simulatedDate={simulatedDate}
              readOnly={readOnly}
              isWaterLoadingDay={isWaterLoadingDay}
              waterLoadBonus={waterLoadBonus}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact Weigh-In Row Component
function CompactWeighIn({
  title,
  description,
  icon: Icon,
  logs,
  logType,
  addLog,
  updateLog,
  deleteLog,
  targetWeight,
  targetWeightRange,
  simulatedDate,
  readOnly = false,
  isWaterLoadingDay = false,
  waterLoadBonus = 0
}: {
  title: string;
  description: string;
  icon: any;
  logs: any[];
  logType: 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: any;
  updateLog: any;
  deleteLog: any;
  targetWeight?: number;
  targetWeightRange?: { min: number; max: number };
  simulatedDate?: Date | null;
  readOnly?: boolean;
  isWaterLoadingDay?: boolean;
  waterLoadBonus?: number;
}) {
  const [weight, setWeight] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const today = simulatedDate || new Date();
  const todayLog = logs.find(log => {
    const logDate = new Date(log.date);
    return logDate.toDateString() === today.toDateString() && log.type === logType;
  });

  const isComplete = !!todayLog;

  const handleSubmit = () => {
    if (weight) {
      addLog({
        date: today,
        type: logType,
        weight: parseFloat(weight)
      });
      setWeight('');
      setIsLogging(false);
    }
  };

  const handleUpdate = () => {
    if (weight && todayLog) {
      updateLog(todayLog.id, { weight: parseFloat(weight) });
      setWeight('');
      setIsEditing(false);
    }
  };

  const handleEdit = () => {
    setWeight(todayLog?.weight?.toString() || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setWeight('');
    setIsLogging(false);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (todayLog) {
      deleteLog(todayLog.id);
    }
  };

  // Get status color based on target
  // During water loading days, use water-loaded target for comparison
  const getStatusColor = () => {
    if (!todayLog) return "";
    if (targetWeight !== undefined) {
      // During water loading, the effective target includes water weight
      const effectiveTarget = isWaterLoadingDay ? targetWeight + waterLoadBonus : targetWeight;
      const diff = todayLog.weight - effectiveTarget;
      if (diff <= 0) return "text-green-500";
      if (diff <= 1.5) return isWaterLoadingDay ? "text-cyan-500" : "text-yellow-500";
      return "text-destructive";
    }
    if (targetWeightRange) {
      const effectiveMax = isWaterLoadingDay ? targetWeightRange.max + waterLoadBonus : targetWeightRange.max;
      if (todayLog.weight <= effectiveMax) return "text-green-500";
      if (todayLog.weight <= effectiveMax + 1.5) return isWaterLoadingDay ? "text-cyan-500" : "text-yellow-500";
      return "text-destructive";
    }
    return "";
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      isComplete ? "bg-green-500/5 border-green-500/20" : "bg-muted/30 border-muted"
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn("w-4 h-4", isComplete ? "text-green-500" : "text-muted-foreground")} />
        <div>
          <span className="text-sm font-medium">{title}</span>
          {!isComplete && targetWeight !== undefined && (
            <span className="text-[10px] text-muted-foreground ml-2">
              Target: {targetWeight.toFixed(1)} lbs
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isComplete && !isEditing ? (
          <>
            <span className={cn("font-mono font-bold", getStatusColor())}>
              {todayLog.weight} lbs
            </span>
            {!readOnly && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleEdit}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        ) : isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="lbs"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-8 w-20 text-sm font-mono"
              step="0.1"
              autoFocus
            />
            <Button size="sm" onClick={handleUpdate} className="h-8 px-2">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-8 px-2">
              <span className="sr-only">Cancel</span>×
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </div>
    </div>
  );
}

// Hydration Tracker
function HydrationTracker({ hydration, readOnly = false }: { hydration: { amount: string; type: string; note: string; targetOz: number }; readOnly?: boolean }) {
  const { getDailyTracking, updateDailyTracking, profile, getDaysUntilWeighIn } = useStore();
  const { toast } = useToast();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const daysUntilWeighIn = getDaysUntilWeighIn();
  const tracking = getDailyTracking(dateKey);
  const [addAmount, setAddAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [justHitGoal, setJustHitGoal] = useState(false);

  const progress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;
  const wasUnderGoal = tracking.waterConsumed < hydration.targetOz;

  const quickAddAmounts = [8, 16, 24, 32];

  const handleAddWater = (oz: number) => {
    const newTotal = tracking.waterConsumed + oz;
    updateDailyTracking(dateKey, { waterConsumed: newTotal });

    // Celebrate when hitting goal
    if (wasUnderGoal && newTotal >= hydration.targetOz) {
      setJustHitGoal(true);
      toast({
        title: "Hydration goal reached!",
        description: "Great job staying hydrated today!",
      });
      setTimeout(() => setJustHitGoal(false), 2000);
    }
  };

  const handleCustomAdd = () => {
    if (addAmount) {
      handleAddWater(parseInt(addAmount));
      setAddAmount('');
    }
  };

  const handleEdit = () => {
    setEditValue(tracking.waterConsumed.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateDailyTracking(dateKey, { waterConsumed: parseInt(editValue) || 0 });
    setIsEditing(false);
    setEditValue('');
  };

  const handleReset = () => {
    updateDailyTracking(dateKey, { waterConsumed: 0 });
  };

  return (
    <Card className={cn(
      "border-muted transition-all",
      progress >= 100 && "bg-green-500/5 border-green-500/30",
      justHitGoal && "ring-2 ring-green-500/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            progress >= 100 ? "bg-green-500" : "bg-cyan-500/10"
          )}>
            {progress >= 100 ? (
              <CheckCircle2 className="w-5 h-5 text-black" />
            ) : (
              <Droplets className="w-4 h-4 text-cyan-500" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className={cn("font-bold", progress >= 100 && "text-green-500")}>Hydration: {hydration.amount}</h3>
                {/* Water Type Badge */}
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                  hydration.type === 'Sip Only'
                    ? "bg-orange-500/20 text-orange-500 border border-orange-500/50"
                    : "bg-cyan-500/20 text-cyan-500"
                )}>
                  {hydration.type}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-6 w-16 text-xs font-mono"
                      autoFocus
                    />
                    <span className="text-xs text-muted-foreground">oz</span>
                    <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-6 px-2 text-xs">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-6 px-2 text-xs">Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-mono text-muted-foreground">
                      {tracking.waterConsumed} / {hydration.targetOz} oz
                    </span>
                    {!readOnly && (
                      <>
                        <button
                          onClick={handleEdit}
                          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {tracking.waterConsumed > 0 && (
                          <button
                            onClick={handleReset}
                            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                            title="Reset to 0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-3 bg-muted/50 rounded-full overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  progress >= 100 ? "bg-green-500" : "bg-cyan-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">{hydration.type} • {hydration.note}</p>
              <span className={cn(
                "text-xs font-bold",
                progress >= 100 ? "text-green-500" : progress >= 75 ? "text-cyan-500" : "text-muted-foreground"
              )}>
                {progress.toFixed(0)}%
              </span>
            </div>

            {/* Quick Add Buttons - hide in read-only mode */}
            {!readOnly && (
              <div className="flex gap-1.5 flex-wrap">
                {quickAddAmounts.map(oz => (
                  <Button
                    key={oz}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddWater(oz)}
                    className="h-7 text-xs px-2"
                  >
                    +{oz}oz
                  </Button>
                ))}
                <div className="flex gap-1">
                  <Input
                    type="number"
                    placeholder="oz"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    className="h-7 w-14 text-xs font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCustomAdd}
                  className="h-7 text-xs px-2"
                    disabled={!addAmount}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Why Explanations */}
            <div className="pt-3 mt-3 border-t border-muted space-y-2">
              {daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5 && (
                <WhyExplanation title="water loading (3-5 days out)">
                  <strong>Water loading triggers natural diuresis.</strong> By drinking 1.5-2 gallons daily, your body
                  increases urine production. When you cut water the day before, your body keeps flushing even without
                  intake, helping you drop water weight safely without severe dehydration.
                </WhyExplanation>
              )}
              {daysUntilWeighIn === 2 && (
                <WhyExplanation title="flush day (2 days out)">
                  <strong>Water weight starts dropping.</strong> After days of high water intake, your body is in
                  full flush mode. Maintain high intake to keep kidneys active while cutting sodium and fiber
                  to accelerate water loss.
                </WhyExplanation>
              )}
              {daysUntilWeighIn === 1 && (
                <WhyExplanation title="sip only (1 day out)">
                  <strong>Your body is still flushing.</strong> After days of high water intake, your kidneys are in
                  overdrive. Sipping just enough to stay functional lets your body continue eliminating water
                  naturally. Gulping would halt this process and add weight back.
                </WhyExplanation>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Info Dialog with 5 Fuel Tanks
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
function WhatsNextCard({ getTomorrowPlan, getWeeklyPlan }: { getTomorrowPlan: () => any; getWeeklyPlan: () => any[] }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const weekPlan = getWeeklyPlan();

  const selectedDayData = selectedDay !== null ? weekPlan.find(d => d.dayNum === selectedDay) : null;

  return (
    <div className="space-y-3 mt-4">
      {/* Visual Week Calendar */}
      <Card className="border-muted overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-muted/30 px-4 py-2 flex items-center justify-between border-b border-muted">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm uppercase">Week Overview</h4>
            </div>
            <span className="text-[10px] text-muted-foreground">Tap any day for details</span>
          </div>

          {/* Phase Timeline Bar */}
          <div className="flex h-2">
            {weekPlan.map((day) => (
              <div
                key={day.day}
                className={cn(
                  "flex-1",
                  getPhaseStyle(day.phase).bg || 'bg-muted',
                  day.isToday && "ring-2 ring-white ring-inset"
                )}
              />
            ))}
          </div>

          {/* Day Cards Grid */}
          <div className="grid grid-cols-7 gap-0.5 p-2 bg-muted/20">
            {weekPlan.map((day) => {
              const colors = getPhaseStyle(day.phase);
              const isSelected = selectedDay === day.dayNum;

              return (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(isSelected ? null : day.dayNum)}
                  className={cn(
                    "flex flex-col items-center p-1.5 rounded-lg transition-all text-center",
                    day.isToday && "ring-2 ring-primary",
                    isSelected && colors.bgMedium,
                    isSelected && colors.border,
                    isSelected && "border",
                    !isSelected && !day.isToday && "hover:bg-muted/50"
                  )}
                >
                  {/* Day Name + Date */}
                  <span className={cn(
                    "text-[10px] font-bold uppercase",
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {day.day.slice(0, 3)}
                  </span>
                  <span className="text-[8px] text-muted-foreground">
                    {(() => {
                      if (!day.date) return '';
                      const d = new Date(day.date);
                      return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
                    })()}
                  </span>

                  {/* Phase Indicator Dot */}
                  <div className={cn(
                    "w-2 h-2 rounded-full my-1",
                    getPhaseStyle(day.phase).bg || 'bg-muted'
                  )} />

                  {/* Weight Target (Morning) */}
                  <span className={cn(
                    "font-mono text-[11px] font-bold",
                    day.isToday ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {day.weightTarget}
                  </span>

                  {/* Today/Tomorrow Badge */}
                  {day.isToday && (
                    <span className="text-[8px] bg-primary text-black px-1 rounded mt-0.5 font-bold">
                      TODAY
                    </span>
                  )}
                  {day.isTomorrow && !day.isToday && (
                    <span className="text-[8px] bg-primary/30 text-primary px-1 rounded mt-0.5 font-bold">
                      NEXT
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Expanded Day Details */}
          {selectedDayData && (
            <div className={cn(
              "border-t p-4 animate-in slide-in-from-top-2 duration-200",
              getPhaseStyle(selectedDayData.phase).bgMedium || 'bg-muted/20'
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="font-bold text-lg">
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
                  <span className={cn(
                    "text-xs font-bold uppercase",
                    getPhaseStyle(selectedDayData.phase).text || 'text-primary'
                  )}>
                    {selectedDayData.phase} Phase
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <ChevronRight className="w-5 h-5 rotate-90" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Weight Target (Morning) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Morning Target</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-lg">{selectedDayData.weightTarget} lbs</span>
                  </div>
                </div>

                {/* Water */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-cyan-500" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Water</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-cyan-500 block">{selectedDayData.water.amount}</span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase",
                      selectedDayData.water.type === 'Sip Only' ? "text-orange-500" : "text-muted-foreground"
                    )}>
                      {selectedDayData.water.type}
                    </span>
                  </div>
                </div>

                {/* Carbs */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Carbs</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-primary">
                      {selectedDayData.carbs.min}-{selectedDayData.carbs.max}g
                    </span>
                  </div>
                </div>

                {/* Protein */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Protein</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className={cn(
                      "font-mono font-bold",
                      selectedDayData.protein.min === 0 ? "text-destructive" : "text-orange-500"
                    )}>
                      {selectedDayData.protein.min === selectedDayData.protein.max
                        ? `${selectedDayData.protein.min}g`
                        : `${selectedDayData.protein.min}-${selectedDayData.protein.max}g`}
                    </span>
                    {selectedDayData.protein.min === 0 && (
                      <span className="text-[10px] text-destructive block font-bold">NO PROTEIN</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase-specific tips */}
              <div className="mt-3 pt-3 border-t border-muted/50">
                <p className="text-xs text-muted-foreground">
                  {selectedDayData.phase === 'Load' && "Water loading phase - drink consistently throughout the day to trigger natural diuresis."}
                  {selectedDayData.phase === 'Prep' && "Prep day - zero fiber, full water. Last day of normal drinking before the cut."}
                  {selectedDayData.phase === 'Cut' && "Cutting phase - sip only. Follow protocol strictly. Monitor weight drift carefully."}
                  {selectedDayData.phase === 'Compete' && "Competition day - focus on fast carbs between matches. Rehydrate with electrolytes."}
                  {selectedDayData.phase === 'Recover' && "Recovery day - high protein to repair muscle. Eat freely to refuel."}
                  {selectedDayData.phase === 'Train' && "Training day - maintain consistent nutrition and hydration."}
                  {selectedDayData.phase === 'Maintain' && "Maintenance phase - stay at walk-around weight with balanced nutrition."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Legend */}
      <div className="flex flex-wrap justify-center gap-3 px-2">
        {['Load', 'Prep', 'Cut', 'Compete', 'Recover'].map((phase) => (
          <div key={phase} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", getPhaseStyle(phase).bg)} />
            <span className="text-[10px] text-muted-foreground">{phase}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// History Insights Card - Shows patterns from weight logging history
function HistoryInsightsCard({
  getHistoryInsights,
  targetWeightClass
}: {
  getHistoryInsights: () => any;
  targetWeightClass: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const insights = getHistoryInsights();

  // Don't show if no useful data
  if (!insights.hasEnoughData && insights.totalLogsThisWeek < 3) {
    return (
      <Card className="border-muted/50 mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs">Log more weights to see your patterns and predictions</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-muted mt-4">
      <CardContent className="p-0">
        {/* Header - Always Visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h4 className="font-bold text-sm uppercase">Your Patterns</h4>
          </div>
          <div className="flex items-center gap-2">
            {insights.projectedSaturday !== null && (
              <span className={cn(
                "text-xs font-mono font-bold",
                insights.projectedSaturday <= targetWeightClass ? "text-green-500" : "text-orange-500"
              )}>
                Projected: {insights.projectedSaturday.toFixed(1)} lbs
              </span>
            )}
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-muted px-4 pb-4 pt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Overnight Drift */}
              {insights.avgOvernightDrift !== null && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Moon className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">Overnight Drop</span>
                  </div>
                  <span className="font-mono font-bold text-lg text-cyan-500">
                    {insights.avgOvernightDrift.toFixed(1)} lbs
                  </span>
                  <p className="text-[10px] text-muted-foreground">Average while sleeping</p>
                </div>
              )}

              {/* Practice Loss */}
              {insights.avgPracticeLoss !== null && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Dumbbell className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">Practice Loss</span>
                  </div>
                  <span className="font-mono font-bold text-lg text-orange-500">
                    {insights.avgPracticeLoss.toFixed(1)} lbs
                  </span>
                  <p className="text-[10px] text-muted-foreground">Average per session</p>
                </div>
              )}

              {/* Final Cut — day before weigh-in */}
              {insights.avgFridayCut !== null && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">Final Cut</span>
                  </div>
                  <span className="font-mono font-bold text-lg text-primary">
                    {insights.avgFridayCut.toFixed(1)} lbs
                  </span>
                  <p className="text-[10px] text-muted-foreground">Day-before average drop</p>
                </div>
              )}

              {/* Weekly Trend */}
              {insights.weeklyTrend !== null && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {insights.weeklyTrend > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                    )}
                    <span className="text-[10px] uppercase text-muted-foreground font-bold">Weekly Trend</span>
                  </div>
                  <span className={cn(
                    "font-mono font-bold text-lg",
                    insights.weeklyTrend > 0 ? "text-red-500" : "text-green-500"
                  )}>
                    {insights.weeklyTrend > 0 ? "+" : ""}{insights.weeklyTrend.toFixed(1)} lbs
                  </span>
                  <p className="text-[10px] text-muted-foreground">Monday to Monday</p>
                </div>
              )}
            </div>

            {/* Weigh-In Projection */}
            {insights.projectedSaturday !== null && insights.daysUntilSat > 0 && (
              <div className={cn(
                "rounded-lg p-3 border",
                insights.projectedSaturday <= targetWeightClass
                  ? "bg-green-500/10 border-green-500/30"
                  : insights.projectedSaturday <= targetWeightClass + 2
                  ? "bg-orange-500/10 border-orange-500/30"
                  : "bg-red-500/10 border-red-500/30"
              )}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-bold block">
                      Weigh-In Projection
                    </span>
                    <span className={cn(
                      "font-mono font-bold text-2xl",
                      insights.projectedSaturday <= targetWeightClass
                        ? "text-green-500"
                        : insights.projectedSaturday <= targetWeightClass + 2
                        ? "text-orange-500"
                        : "text-red-500"
                    )}>
                      {insights.projectedSaturday.toFixed(1)} lbs
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">Target</span>
                    <span className="font-mono font-bold text-lg">{targetWeightClass} lbs</span>
                    <span className={cn(
                      "text-xs font-bold block",
                      insights.projectedSaturday <= targetWeightClass ? "text-green-500" : "text-orange-500"
                    )}>
                      {insights.projectedSaturday <= targetWeightClass
                        ? `${(targetWeightClass - insights.projectedSaturday).toFixed(1)} lbs under`
                        : `${(insights.projectedSaturday - targetWeightClass).toFixed(1)} lbs over`
                      }
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Based on your {insights.daysUntilSat} day{insights.daysUntilSat > 1 ? 's' : ''} of patterns
                </p>
              </div>
            )}

            {/* Last Week Summary */}
            {(insights.lastFridayWeight || insights.lastSaturdayWeight) && (
              <div className="border-t border-muted pt-3">
                <h5 className="text-[10px] uppercase text-muted-foreground font-bold mb-2">Last Week</h5>
                <div className="flex items-center justify-between text-xs">
                  {insights.lastFridayWeight && (
                    <div>
                      <span className="text-muted-foreground">Day Before: </span>
                      <span className="font-mono font-bold">{insights.lastFridayWeight.toFixed(1)} lbs</span>
                    </div>
                  )}
                  {insights.lastSaturdayWeight && (
                    <div>
                      <span className="text-muted-foreground">Weigh-In: </span>
                      <span className={cn(
                        "font-mono font-bold",
                        insights.madeWeightLastWeek ? "text-green-500" : "text-orange-500"
                      )}>
                        {insights.lastSaturdayWeight.toFixed(1)} lbs
                      </span>
                      {insights.madeWeightLastWeek && <CheckCircle2 className="w-3 h-3 text-green-500 inline ml-1" />}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tips Based on Data */}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2">
              <strong className="text-foreground">💡 Insight:</strong>{" "}
              {insights.avgOvernightDrift && insights.avgOvernightDrift > 1.5
                ? "You lose significant weight overnight. Make sure to weigh first thing in the morning before eating or drinking."
                : insights.avgPracticeLoss && insights.avgPracticeLoss > 3
                ? "You sweat heavily during practice. Plan hydration recovery carefully to avoid cramping."
                : insights.projectedSaturday && insights.projectedSaturday > targetWeightClass
                ? "You may need to adjust your protocol or add activity to hit your target."
                : "Your patterns look consistent. Keep following the protocol and logging weights."
              }
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Why Explanation Component - Tap to expand
function WhyExplanation({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="w-full text-left"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase font-bold">Why {title}?</span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", isOpen && "rotate-90")} />
      </div>
      {isOpen && (
        <div className="mt-2 p-2.5 bg-muted/30 rounded-lg text-xs text-muted-foreground leading-relaxed border border-muted/50">
          {children}
        </div>
      )}
    </button>
  );
}

// Today's Status Card - At-a-glance summary
function TodayStatusCard({
  morningWeight,
  targetWeight,
  carbsConsumed,
  carbsTarget,
  proteinConsumed,
  proteinTarget,
  waterConsumed,
  waterTarget,
  weighInsComplete,
  weighInsTotal,
  isNewUser
}: {
  morningWeight?: number;
  targetWeight: number;
  carbsConsumed: number;
  carbsTarget: number;
  proteinConsumed: number;
  proteinTarget: number;
  waterConsumed: number;
  waterTarget: number;
  weighInsComplete: number;
  weighInsTotal: number;
  isNewUser: boolean;
}) {
  // Calculate completion percentages
  const carbsPercent = carbsTarget > 0 ? Math.min(100, (carbsConsumed / carbsTarget) * 100) : 0;
  const proteinPercent = proteinTarget > 0 ? Math.min(100, (proteinConsumed / proteinTarget) * 100) : 0;
  const waterPercent = waterTarget > 0 ? Math.min(100, (waterConsumed / waterTarget) * 100) : 0;

  // Check if all tasks complete for celebration
  const allComplete = morningWeight && carbsPercent >= 100 && proteinPercent >= 100 && waterPercent >= 100 && weighInsComplete === weighInsTotal;
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (allComplete && !showCelebration) {
      setShowCelebration(true);
      // Auto-hide after 3 seconds
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [allComplete]);

  return (
    <div className="mb-4">
      {/* Celebration overlay */}
      {showCelebration && (
        <div className="bg-gradient-to-r from-green-500/20 via-primary/20 to-green-500/20 border border-green-500/50 rounded-lg p-3 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-center gap-2">
            <PartyPopper className="w-5 h-5 text-green-500" />
            <span className="font-bold text-green-500">All targets hit! Great work today!</span>
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
        </div>
      )}

      {/* New User Getting Started Hint */}
      {isNewUser && !morningWeight && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-xs font-bold text-primary uppercase">Getting Started</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Start by logging your morning weight below. This is the foundation of your daily tracking!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Summary Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Morning Weight */}
        <div className={cn(
          "rounded-lg p-2 text-center border",
          morningWeight
            ? morningWeight <= targetWeight
              ? "bg-green-500/10 border-green-500/30"
              : "bg-yellow-500/10 border-yellow-500/30"
            : "bg-muted/30 border-muted"
        )}>
          <Scale className={cn(
            "w-4 h-4 mx-auto mb-1",
            morningWeight ? morningWeight <= targetWeight ? "text-green-500" : "text-yellow-500" : "text-muted-foreground"
          )} />
          <div className="text-[10px] text-muted-foreground uppercase font-medium">Weight</div>
          {morningWeight ? (
            <div className={cn(
              "font-mono font-bold text-sm",
              morningWeight <= targetWeight ? "text-green-500" : "text-yellow-500"
            )}>
              {morningWeight.toFixed(1)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">—</div>
          )}
        </div>

        {/* Carbs */}
        <div className={cn(
          "rounded-lg p-2 text-center border",
          carbsPercent >= 100 ? "bg-green-500/10 border-green-500/30" : "bg-muted/30 border-muted"
        )}>
          <Flame className={cn(
            "w-4 h-4 mx-auto mb-1",
            carbsPercent >= 100 ? "text-green-500" : carbsPercent > 50 ? "text-primary" : "text-muted-foreground"
          )} />
          <div className="text-[10px] text-muted-foreground uppercase font-medium">Carbs</div>
          <div className={cn(
            "font-mono font-bold text-sm",
            carbsPercent >= 100 ? "text-green-500" : carbsPercent > 50 ? "text-primary" : "text-muted-foreground"
          )}>
            {carbsConsumed}g
          </div>
          <div className="text-[9px] text-muted-foreground">/ {carbsTarget}g</div>
        </div>

        {/* Water */}
        <div className={cn(
          "rounded-lg p-2 text-center border",
          waterPercent >= 100 ? "bg-green-500/10 border-green-500/30" : "bg-muted/30 border-muted"
        )}>
          <Droplets className={cn(
            "w-4 h-4 mx-auto mb-1",
            waterPercent >= 100 ? "text-green-500" : waterPercent > 50 ? "text-cyan-500" : "text-muted-foreground"
          )} />
          <div className="text-[10px] text-muted-foreground uppercase font-medium">Water</div>
          <div className={cn(
            "font-mono font-bold text-sm",
            waterPercent >= 100 ? "text-green-500" : waterPercent > 50 ? "text-cyan-500" : "text-muted-foreground"
          )}>
            {waterConsumed}oz
          </div>
          <div className="text-[9px] text-muted-foreground">/ {waterTarget}oz</div>
        </div>

        {/* Weigh-Ins */}
        <div className={cn(
          "rounded-lg p-2 text-center border",
          weighInsComplete === weighInsTotal ? "bg-green-500/10 border-green-500/30" : "bg-muted/30 border-muted"
        )}>
          <CheckCircle2 className={cn(
            "w-4 h-4 mx-auto mb-1",
            weighInsComplete === weighInsTotal ? "text-green-500" : weighInsComplete > 0 ? "text-primary" : "text-muted-foreground"
          )} />
          <div className="text-[10px] text-muted-foreground uppercase font-medium">Logs</div>
          <div className={cn(
            "font-mono font-bold text-sm",
            weighInsComplete === weighInsTotal ? "text-green-500" : weighInsComplete > 0 ? "text-primary" : "text-muted-foreground"
          )}>
            {weighInsComplete}/{weighInsTotal}
          </div>
        </div>
      </div>
    </div>
  );
}

