import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Droplets, Scale, Dumbbell, Moon, Sun,
  ChevronRight, ChevronDown, Info,
  AlertTriangle, Flame, Zap, Trash2,
  Calendar, Clock, ArrowDownToLine, ArrowUpFromLine, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { getPhaseStyleForDaysUntil, PHASE_STYLES, getPhaseStyle } from "@/lib/phase-colors";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SettingsDialog, FuelCard, DateNavigator, NextCyclePrompt } from "@/components/dashboard";
import { useToast } from "@/hooks/use-toast";
import { useSwipe } from "@/hooks/use-swipe";

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


  return (
    <MobileLayout showNav={true}>
      <div {...swipeHandlers}>
        {/* Competition day reminder — use Recovery tab */}
        {!isViewingHistorical && daysUntilWeighIn === 0 && profile.protocol !== '4' && (
          <button
            onClick={() => setLocation('/recovery')}
            className="w-full mb-3 px-3 py-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" />
            It's weigh-in day — tap here for your Recovery protocol
          </button>
        )}
        {/* Day after weigh-in reminder — set next date */}
        {!isViewingHistorical && daysUntilWeighIn < 0 && (
          <div className="w-full mb-3 px-3 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-500 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Set your next weigh-in date in Settings ⚙️
          </div>
        )}
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
              {daysUntilWeighIn >= 0 && daysUntilWeighIn <= 5 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className={cn("text-[10px] font-mono font-bold", phaseStyle.text)}>
                    {getTimeUntilWeighIn()}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <FocusDialog dailyPriority={dailyPriority} statusInfo={statusInfo} daysUntilWeighIn={daysUntilWeighIn} isViewingHistorical={isViewingHistorical} />
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

      {/* Next Cycle Prompt — shows when weigh-in has passed */}
      {!isViewingHistorical && (
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
          className="w-full mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-500 text-xs font-bold">Log morning weight</span>
          </div>
          <span className="text-[10px] text-yellow-500/70">Tap to log →</span>
        </button>
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
      />



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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* WEEK OVERVIEW (with drift/practice/projected stats)   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <WhatsNextCard getTomorrowPlan={getTomorrowPlan} getWeeklyPlan={getWeeklyPlan} descentData={descentData} />

        {/* Bottom Spacing for Nav */}
        <div className="h-20" />
      </div>
    </MobileLayout>
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
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editSleep, setEditSleep] = useState('');
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

  const coreSlots = [
    { key: 'morning', label: 'AM', icon: <Sun className="w-3 h-3" />, log: todayLogs.morning, type: 'morning', color: 'text-yellow-500' },
    { key: 'pre', label: 'PRE', icon: <ArrowDownToLine className="w-3 h-3" />, log: todayLogs.prePractice, type: 'pre-practice', color: 'text-blue-500' },
    { key: 'post', label: 'POST', icon: <ArrowUpFromLine className="w-3 h-3" />, log: todayLogs.postPractice, type: 'post-practice', color: 'text-green-500' },
    { key: 'bed', label: 'BED', icon: <Moon className="w-3 h-3" />, log: todayLogs.beforeBed, type: 'before-bed', color: 'text-purple-500' },
  ];

  const handleSlotTap = (type: string, log: any) => {
    if (readOnly) return;
    if (log) {
      // Logged — open inline edit
      setEditingId(log.id);
      setEditWeight(log.weight.toString());
      const d = new Date(log.date);
      setEditTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
      setEditDuration(log.duration ? log.duration.toString() : '');
      setEditSleep(log.sleepHours ? log.sleepHours.toString() : '');
    } else {
      // Empty — open FAB
      window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type } }));
    }
  };

  const handleSaveEdit = (id: string) => {
    const parsed = parseFloat(editWeight);
    if (!editWeight) {
      toast({ title: "Enter a weight", description: "Weight field cannot be empty" });
      return;
    }
    if (isNaN(parsed)) {
      toast({ title: "Invalid number", description: "Please enter a valid weight" });
      return;
    }
    if (parsed < 80 || parsed > 350) {
      toast({ title: "Weight out of range", description: "Enter between 80 and 350 lbs" });
      return;
    }
    const updates: any = { weight: parsed };
    if (editTime) {
      const [h, m] = editTime.split(':').map(Number);
      const existingLog = logs.find(l => l.id === id);
      if (existingLog) {
        const newDate = new Date(existingLog.date);
        newDate.setHours(h, m, 0, 0);
        updates.date = newDate;
      }
    }
    if (editDuration) updates.duration = parseInt(editDuration, 10);
    if (editSleep) updates.sleepHours = parseFloat(editSleep);
    updateLog(id, updates);
    setEditingId(null);
    setEditWeight('');
    setEditTime('');
    setEditDuration('');
    setEditSleep('');
    toast({ title: `Updated to ${parsed.toFixed(1)} lbs` });
  };

  const handleDelete = (id: string, type: string) => {
    deleteLog(id);
    setEditingId(null);
    setEditWeight('');
    toast({ title: "Deleted", description: `${type.replace('-', ' ')} weigh-in removed` });
  };

  const hasExtrasOrCheckIns = extraWorkouts.length > 0 || todayCheckIns.length > 0;

  // Calculate daily loss: morning weight minus most recent weight
  const morningWeight = todayLogs.morning?.weight ?? null;
  const latestWeight = mostRecentLog?.weight ?? null;
  const dailyLoss = (morningWeight && latestWeight && mostRecentLog?.type !== 'morning')
    ? morningWeight - latestWeight
    : null;

  return (
    <div className="mb-3 space-y-2">
      {/* Header: Row 1 = Weight + Class + Status, Row 2 = Over + Daily Loss */}
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
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold">
              Class: <span className="text-foreground font-mono">{weightClass}</span>
            </span>
          </div>
          <span className={cn(
            "text-[11px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wide",
            statusInfo.status === 'on-track' ? "bg-green-500/20 text-green-500 border border-green-500/30" :
            statusInfo.status === 'borderline' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" :
            "bg-red-500/20 text-red-500 border border-red-500/30"
          )}>
            {statusInfo.label}
          </span>
        </div>
        {(dailyLoss !== null && dailyLoss > 0 || (latestWeight && weightClass && latestWeight > weightClass)) && (
          <div className="flex items-center gap-3">
            {latestWeight && weightClass && latestWeight > weightClass && (
              <span className={cn(
                "text-[10px] font-mono font-bold",
                latestWeight - weightClass > 5 ? "text-destructive" :
                latestWeight - weightClass > 2 ? "text-yellow-500" : "text-muted-foreground"
              )}>
                +{(latestWeight - weightClass).toFixed(1)} over class
              </span>
            )}
            {dailyLoss !== null && dailyLoss > 0 && (
              <span className="text-[10px] font-mono font-bold text-primary">
                -{dailyLoss.toFixed(1)} today
              </span>
            )}
          </div>
        )}
      </div>

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
                    if (e.key === 'Escape') { setEditingId(null); setEditWeight(''); setEditTime(''); }
                  }}
                />
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full h-6 text-center text-[10px] font-mono bg-background border border-border rounded px-0.5"
                />
                {slot.type === 'post-practice' && (
                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      placeholder="min"
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                      className="flex-1 h-6 text-center text-[10px] font-mono p-0.5 border-orange-500/50 bg-orange-500/5"
                    />
                    <span className="text-[8px] text-orange-500 font-bold whitespace-nowrap">min *</span>
                  </div>
                )}
                {slot.type === 'morning' && (
                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="hrs"
                      value={editSleep}
                      onChange={(e) => setEditSleep(e.target.value)}
                      className="flex-1 h-6 text-center text-[10px] font-mono p-0.5 border-purple-500/50 bg-purple-500/5"
                    />
                    <span className="text-[8px] text-purple-500 font-bold whitespace-nowrap">sleep *</span>
                  </div>
                )}
                <div className="flex gap-1">
                  <button onClick={() => handleSaveEdit(slot.log.id)} className="text-[9px] text-green-500 font-bold px-2 py-1 min-h-[28px] min-w-[36px] rounded active:bg-green-500/20">Save</button>
                  <button onClick={() => handleDelete(slot.log.id, slot.type)} className="text-[9px] text-red-500 font-bold px-2 py-1 min-h-[28px] min-w-[28px] rounded bg-red-500/10 border border-red-500/30 active:bg-red-500/30">Del</button>
                  <button onClick={() => { setEditingId(null); setEditWeight(''); setEditTime(''); }} className="text-[9px] text-muted-foreground px-2 py-1 min-h-[28px] min-w-[28px] rounded active:bg-muted">✕</button>
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
                    : "hover:bg-primary/10 border border-dashed border-primary/30 active:scale-95",
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
              {hasWeight && (
                <span className="text-[8px] text-muted-foreground font-mono">
                  {new Date(slot.log.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              {hasWeight ? (
                <>
                  <span className={cn(
                    "text-[12px] font-mono",
                    isMostRecent ? "font-bold text-foreground" : "text-foreground"
                  )}>
                    {slot.log.weight.toFixed(1)}
                  </span>
                  {diff !== null && (
                    <span className={cn(
                      "text-[9px] font-mono",
                      diff <= 0 ? "text-green-500" : diff <= 2 ? "text-yellow-500" : "text-red-400"
                    )}>
                      {diff <= 0 ? 'on target' : `+${diff.toFixed(1)}`}
                    </span>
                  )}
                </>
              ) : (
                <Plus className={cn(
                  "w-4 h-4 mt-0.5",
                  readOnly ? "text-muted-foreground/30" : "text-primary/60"
                )} />
              )}
            </button>
          );
        })}
      </div>

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
                <div key={`extra-${i}`} className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-3 h-3 text-orange-500" />
                    <span className="text-[10px] font-bold text-orange-500">Extra</span>
                    <span className="text-[9px] text-muted-foreground">{format(workout.time, 'h:mm a')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-foreground">
                      {workout.before.weight} → {workout.after ? workout.after.weight : '…'}
                    </span>
                    {loss !== null && loss > 0 && (
                      <span className="text-[9px] font-bold font-mono text-primary">-{loss.toFixed(1)}</span>
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
        </details>
      )}
    </div>
  );
}

// Info Dialog with 5 Fuel Tanks
function FocusDialog({ dailyPriority, statusInfo, daysUntilWeighIn, isViewingHistorical }: {
  dailyPriority: { priority: string; urgency: string; subtext?: string };
  statusInfo: { status: string; label: string; contextMessage: string; recommendation?: any };
  daysUntilWeighIn: number;
  isViewingHistorical: boolean;
}) {
  const [open, setOpen] = useState(false);
  const urgencyColor = dailyPriority.urgency === 'critical' ? 'text-red-500' :
    dailyPriority.urgency === 'high' ? 'text-yellow-500' : 'text-primary';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-8 w-8", urgencyColor)}>
          <Zap className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95%] max-w-md rounded-xl bg-card border-muted">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-lg flex items-center gap-2">
            <Zap className={cn("w-5 h-5", urgencyColor)} />
            Today's Focus
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Priority */}
          <div className={cn(
            "rounded-lg px-4 py-3 border",
            dailyPriority.urgency === 'critical' ? "border-red-500/40 bg-red-500/5" :
            dailyPriority.urgency === 'high' ? "border-yellow-500/40 bg-yellow-500/5" :
            "border-primary/30 bg-primary/5"
          )}>
            <p className={cn("text-sm font-bold", urgencyColor)}>
              {dailyPriority.priority}
            </p>
          </div>

          {/* Fiber warning for cut days */}
          {(daysUntilWeighIn === 1 || daysUntilWeighIn === 2) && (
            <div className="flex items-start gap-2 px-1">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-400">
                No vegetables, fruits with skin, whole grains, or beans. Check every ingredient.
              </p>
            </div>
          )}

          {/* Subtext */}
          {dailyPriority.subtext && (
            <p className="text-xs text-muted-foreground leading-relaxed px-1">
              {dailyPriority.subtext}
            </p>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 px-1">
            <span className={cn(
              "text-xs font-bold uppercase px-2 py-1 rounded",
              statusInfo.status === 'on-track' ? "bg-green-500/15 text-green-500" :
              statusInfo.status === 'borderline' ? "bg-yellow-500/15 text-yellow-500" :
              "bg-red-500/15 text-red-500"
            )}>
              {statusInfo.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {statusInfo.contextMessage}
            </span>
          </div>

          {/* Action button for extra workouts */}
          {statusInfo.recommendation && statusInfo.recommendation.extraWorkoutsNeeded > 0 && !isViewingHistorical && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false);
                // Small delay so dialog closes before quick-log opens
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: 'extra-workout' } }));
                }, 150);
              }}
              className="w-full h-9 text-xs border-muted-foreground/30"
            >
              <Dumbbell className="w-3.5 h-3.5 mr-2" />
              Log Extra Workout
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
function WhatsNextCard({ getTomorrowPlan, getWeeklyPlan, descentData }: {
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
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const weekPlan = getWeeklyPlan();

  const selectedDayData = selectedDay !== null ? weekPlan.find(d => d.dayNum === selectedDay) : null;

  return (
    <div className="space-y-3 mt-4">
      <Card className="border-muted overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm uppercase tracking-wide">Week Overview</h4>
            </div>
            <span className="text-[10px] text-muted-foreground">Tap any day</span>
          </div>

          {/* Stats Row */}
          {(descentData.avgOvernightDrift !== null || descentData.avgPracticeLoss !== null || descentData.projectedSaturday !== null) && (
            <div className="flex items-center justify-around px-3 pb-3">
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase block mb-0.5">Drift</span>
                <span className={cn(
                  "font-mono font-bold text-base",
                  descentData.avgOvernightDrift !== null ? "text-cyan-500" : "text-muted-foreground"
                )}>
                  {descentData.avgOvernightDrift !== null
                    ? `-${Math.abs(descentData.avgOvernightDrift).toFixed(1)}`
                    : '—'}
                </span>
                {descentData.avgDriftRateOzPerHr !== null && (
                  <span className="block text-[9px] font-mono text-cyan-400">
                    {descentData.avgDriftRateOzPerHr.toFixed(2)} lbs/hr
                  </span>
                )}
              </div>
              <div className="w-px h-8 bg-muted" />
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase block mb-0.5">Practice</span>
                <span className={cn(
                  "font-mono font-bold text-base",
                  descentData.avgPracticeLoss !== null ? "text-orange-500" : "text-muted-foreground"
                )}>
                  {descentData.avgPracticeLoss !== null
                    ? `-${Math.abs(descentData.avgPracticeLoss).toFixed(1)}`
                    : '—'}
                </span>
                {descentData.avgSweatRateOzPerHr !== null && (
                  <span className="block text-[9px] font-mono text-orange-400">
                    {descentData.avgSweatRateOzPerHr.toFixed(2)} lbs/hr
                  </span>
                )}
              </div>
              <div className="w-px h-8 bg-muted" />
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase block mb-0.5">Projected</span>
                <span className={cn(
                  "font-mono font-bold text-base",
                  descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight
                    ? "text-green-500"
                    : descentData.projectedSaturday !== null ? "text-yellow-500" : "text-muted-foreground"
                )}>
                  {descentData.projectedSaturday !== null ? descentData.projectedSaturday.toFixed(1) : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Phase Timeline — continuous gradient bar */}
          <div className="flex h-1.5 mx-3 rounded-full overflow-hidden mb-3">
            {weekPlan.map((day, i) => (
              <div
                key={day.day}
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
          <div className="grid grid-cols-7 px-2 pb-3 gap-1">
            {weekPlan.map((day) => {
              const colors = getPhaseStyle(day.phase);
              const isSelected = selectedDay === day.dayNum;

              return (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(isSelected ? null : day.dayNum)}
                  className={cn(
                    "flex flex-col items-center py-2 px-0.5 rounded-xl transition-all",
                    day.isToday && !isSelected && "bg-primary/10 ring-1.5 ring-primary/40",
                    isSelected && "bg-primary/15 ring-2 ring-primary",
                    !isSelected && !day.isToday && "hover:bg-muted/40 active:bg-muted/60"
                  )}
                >
                  {/* Day abbrev */}
                  <span className={cn(
                    "text-[10px] font-bold uppercase leading-none",
                    day.isToday ? "text-primary" : isSelected ? "text-primary" : "text-muted-foreground"
                  )}>
                    {day.day.slice(0, 3)}
                  </span>

                  {/* Date number */}
                  <span className={cn(
                    "text-[9px] leading-none mt-0.5",
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
                    "font-mono text-xs font-bold leading-none",
                    day.isToday ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {day.weightTarget}
                  </span>

                  {/* Badge */}
                  {day.isToday && (
                    <span className="text-[7px] bg-primary text-primary-foreground px-1.5 py-px rounded-full mt-1.5 font-bold uppercase tracking-wide">
                      Today
                    </span>
                  )}
                  {day.isTomorrow && !day.isToday && (
                    <span className="text-[7px] bg-muted text-muted-foreground px-1.5 py-px rounded-full mt-1.5 font-bold uppercase tracking-wide">
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
        </CardContent>
      </Card>

      {/* Phase Legend — pill style */}
      <div className="flex flex-wrap justify-center gap-2 px-2">
        {['Load', 'Prep', 'Cut', 'Compete', 'Recover'].map((phase) => (
          <div key={phase} className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-full">
            <div className={cn("w-2 h-2 rounded-full", getPhaseStyle(phase).bg)} />
            <span className="text-[10px] text-muted-foreground font-medium">{phase}</span>
          </div>
        ))}
      </div>
    </div>
  );
}




