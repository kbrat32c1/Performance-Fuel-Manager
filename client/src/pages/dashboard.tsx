import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Droplets, Scale, Utensils, Dumbbell, Moon, Sun,
  ChevronRight, CheckCircle2, Plus, Settings, Info,
  AlertTriangle, Flame, Zap, Trophy, Pencil, Trash2, Apple,
  Calendar, ArrowRight, Clock, Heart, Target, TrendingDown, TrendingUp, LogOut, Weight,
  HelpCircle
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, getDay } from "date-fns";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecoveryTakeover } from "@/components/recovery-takeover";
import { CompetitionDayTakeover } from "@/components/competition-day-takeover";

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
    getWeekDescentData
  } = useStore();

  const phase = getPhase();
  const displayDate = profile.simulatedDate || new Date();
  const dayOfWeek = getDay(displayDate);

  // Saturday Competition Day Takeover
  if (phase === 'last-24h' && dayOfWeek === 6) {
    return <CompetitionDayTakeover />;
  }

  // Friday Final Push (or if weigh-in is tomorrow)
  if (phase === 'last-24h') {
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

  // Get phase display info - using document terminology
  const getPhaseInfo = () => {
    switch (phase) {
      case 'metabolic':
        return { label: 'Metabolic Phase', days: 'Mon-Wed', color: 'text-primary' };
      case 'transition':
        return { label: 'Transition Phase', days: 'Thu', color: 'text-yellow-500' };
      case 'performance-prep':
        return { label: 'Performance-Prep', days: 'Fri', color: 'text-orange-500' };
      case 'recovery':
        return { label: 'Recovery Phase', days: 'Sun', color: 'text-cyan-500' };
      default:
        return { label: 'Active', days: '', color: 'text-primary' };
    }
  };

  const statusInfo = getStatus();
  const dailyPriority = getDailyPriority();
  const nextTarget = getNextTarget();
  const driftMetrics = getDriftMetrics();
  const descentData = getWeekDescentData();

  const phaseInfo = getPhaseInfo();

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
            {format(displayDate, 'EEEE, MMMM d')}
          </h2>
          <h1 className="text-2xl font-heading font-bold uppercase italic">
            Today's Plan
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
          <SettingsDialog profile={profile} updateProfile={updateProfile} resetData={useStore().resetData} />
          <InfoDialog />
        </div>
      </header>

      {/* Viewing Past Day Banner */}
      {profile.simulatedDate && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-2 mb-4 flex items-center justify-between">
          <span className="text-yellow-500 text-xs font-bold uppercase">
            Viewing: {format(displayDate, 'EEE, MMM d')}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateProfile({ simulatedDate: null })}
            className="h-6 text-[10px] border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/20"
          >
            Back to Today
          </Button>
        </div>
      )}

      {/* Status Badge */}
      <div className={cn(
        "flex items-center justify-center gap-2 py-2 -mx-4 mb-4",
        statusInfo.bgColor
      )}>
        <div className={cn(
          "w-2 h-2 rounded-full",
          statusInfo.status === 'on-track' ? "bg-green-500" :
          statusInfo.status === 'borderline' ? "bg-yellow-500 animate-pulse" : "bg-destructive animate-pulse"
        )} />
        <span className={cn("text-xs font-bold uppercase tracking-widest", statusInfo.color)}>
          {statusInfo.label}
        </span>
        {profile.currentWeight > 0 && (
          <span className="text-xs text-muted-foreground">
            ({profile.currentWeight.toFixed(1)} / {targetWeight.toFixed(1)} lbs)
          </span>
        )}
      </div>

      {/* Next Target - Always Visible */}
      {nextTarget && (
        <div className="bg-card border border-primary/30 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase text-muted-foreground">Next Target</span>
            </div>
            <div className="text-right">
              <span className="font-mono font-bold text-lg text-primary">{nextTarget.weight.toFixed(1)} lbs</span>
              <span className="text-xs text-muted-foreground ml-2">{nextTarget.label}</span>
            </div>
          </div>
          {/* Drift metrics when available */}
          {(driftMetrics.overnight !== null || driftMetrics.session !== null) && (
            <div className="flex gap-4 mt-2 pt-2 border-t border-muted text-xs">
              {driftMetrics.overnight !== null && (
                <div>
                  <span className="text-muted-foreground">Overnight avg: </span>
                  <span className={cn("font-mono font-bold", driftMetrics.overnight < 0 ? "text-primary" : "text-yellow-500")}>
                    {driftMetrics.overnight > 0 ? '+' : ''}{driftMetrics.overnight.toFixed(1)} lbs
                  </span>
                </div>
              )}
              {driftMetrics.session !== null && (
                <div>
                  <span className="text-muted-foreground">Practice avg: </span>
                  <span className={cn("font-mono font-bold", driftMetrics.session < 0 ? "text-primary" : "text-yellow-500")}>
                    {driftMetrics.session > 0 ? '+' : ''}{driftMetrics.session.toFixed(1)} lbs
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Week Descent Tracker - Only show for today's view with valid data */}
      {!profile.simulatedDate && descentData.morningWeights.length >= 2 && (
        <div className="bg-card border border-muted rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase text-muted-foreground">Week Descent</span>
            </div>
            {descentData.pace && (
              <span className={cn(
                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                descentData.pace === 'ahead' ? "bg-green-500/20 text-green-500" :
                descentData.pace === 'on-track' ? "bg-primary/20 text-primary" :
                "bg-yellow-500/20 text-yellow-500"
              )}>
                {descentData.pace === 'ahead' ? 'AHEAD' : descentData.pace === 'on-track' ? 'ON PACE' : 'BEHIND'}
              </span>
            )}
          </div>

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
                      isLatest ? "bg-primary" : "bg-primary/40"
                    )}
                    style={{ height: `${Math.max(heightPercent, 10)}%` }}
                  />
                  <span className="text-[8px] text-muted-foreground">{entry.day}</span>
                </div>
              );
            })}
            {/* Target marker */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-[10%] rounded-t border-2 border-dashed border-green-500/50" />
              <span className="text-[8px] text-green-500">Goal</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-muted">
            <div>
              <span className="text-[10px] text-muted-foreground block">Lost</span>
              <span className={cn(
                "font-mono font-bold text-sm",
                descentData.totalLost !== null && descentData.totalLost > 0 ? "text-green-500" :
                descentData.totalLost !== null && descentData.totalLost < 0 ? "text-red-500" : ""
              )}>
                {descentData.totalLost !== null
                  ? (descentData.totalLost > 0 ? `-${descentData.totalLost.toFixed(1)}` : `+${Math.abs(descentData.totalLost).toFixed(1)}`)
                  : '-'} lbs
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Avg/Day</span>
              <span className={cn(
                "font-mono font-bold text-sm",
                descentData.dailyAvgLoss !== null && descentData.dailyAvgLoss > 0 ? "text-green-500" :
                descentData.dailyAvgLoss !== null && descentData.dailyAvgLoss < 0 ? "text-red-500" : ""
              )}>
                {descentData.dailyAvgLoss !== null
                  ? (descentData.dailyAvgLoss > 0 ? `-${descentData.dailyAvgLoss.toFixed(1)}` : `+${Math.abs(descentData.dailyAvgLoss).toFixed(1)}`)
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
      )}

      {/* Daily Priority Banner */}
      <div className={cn(
        "border rounded-lg p-3 mb-4",
        dailyPriority.urgency === 'normal' ? "bg-primary/10 border-primary/30" :
        dailyPriority.urgency === 'high' ? "bg-yellow-500/20 border-yellow-500/50" :
        "bg-destructive/20 border-destructive/50"
      )}>
        <div className="flex items-center gap-2">
          {dailyPriority.urgency === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-destructive animate-pulse shrink-0" />
          ) : dailyPriority.urgency === 'high' ? (
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
          ) : (
            <Zap className="w-4 h-4 text-primary shrink-0" />
          )}
          <div>
            <span className={cn(
              "text-[10px] font-bold uppercase",
              dailyPriority.urgency === 'critical' ? "text-destructive" :
              dailyPriority.urgency === 'high' ? "text-yellow-500" : "text-primary"
            )}>
              Most Important Now
            </span>
            <p className={cn(
              "text-sm font-medium",
              dailyPriority.urgency === 'critical' ? "text-destructive" :
              dailyPriority.urgency === 'high' ? "text-yellow-500" : "text-foreground"
            )}>
              {dailyPriority.priority}
            </p>
          </div>
        </div>
      </div>

      {/* Fiber Elimination Banner - Thu/Fri Only */}
      {(dayOfWeek === 4 || dayOfWeek === 5) && (
        <div className="bg-red-600/20 border border-red-500/50 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse shrink-0 mt-0.5" />
            <div>
              <span className="text-red-500 font-bold uppercase text-sm block">ZERO FIBER TODAY</span>
              <p className="text-xs text-red-400 mt-0.5">
                No vegetables, fruits with skin, whole grains, or beans. Check every ingredient - fiber adds gut weight that won't clear by weigh-in.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Friday Weigh-In Countdown */}
      {dayOfWeek === 5 && <WeighInCountdown weighInDate={profile.weighInDate} simulatedDate={profile.simulatedDate} />}

      {/* Daily Steps */}
      <div className="space-y-4">

        {/* Step 1: Morning Weigh-In */}
        <DailyStep
          step={1}
          title="Morning Weigh-In"
          description="First thing after waking, before eating or drinking"
          icon={Sun}
          logs={logs}
          logType="morning"
          addLog={addLog}
          updateLog={updateLog}
          targetWeight={targetWeight}
          simulatedDate={profile.simulatedDate}
        />

        {/* Step 2: Today's Fuel with Macro Tracking */}
        <FuelTracker fuel={fuel} />

        {/* Step 3: Hydration */}
        <HydrationTracker hydration={hydration} />

        {/* Step 4: Pre-Practice Weigh-In */}
        <DailyStep
          step={4}
          title="Pre-Practice Weigh-In"
          description="Before practice starts"
          icon={Dumbbell}
          logs={logs}
          logType="pre-practice"
          addLog={addLog}
          updateLog={updateLog}
          targetWeight={targetWeight + 1.5}
          simulatedDate={profile.simulatedDate}
        />

        {/* Step 5: Post-Practice Weigh-In */}
        <DailyStep
          step={5}
          title="Post-Practice Weigh-In"
          description="Immediately after practice"
          icon={Dumbbell}
          logs={logs}
          logType="post-practice"
          addLog={addLog}
          updateLog={updateLog}
          targetWeight={targetWeight}
          simulatedDate={profile.simulatedDate}
        />

        {/* Step 6: Before Bed Weigh-In */}
        <DailyStep
          step={6}
          title="Before Bed Weigh-In"
          description="Last weigh-in of the day, before sleep"
          icon={Moon}
          logs={logs}
          logType="before-bed"
          addLog={addLog}
          updateLog={updateLog}
          targetWeight={targetWeight - 0.5}
          simulatedDate={profile.simulatedDate}
        />

        {/* Optional: Extra Workout */}
        <ExtraWorkoutLog addLog={addLog} logs={logs} simulatedDate={profile.simulatedDate} deleteLog={deleteLog} updateLog={updateLog} />

        {/* What's Next Section */}
        <WhatsNextCard getTomorrowPlan={getTomorrowPlan} getWeeklyPlan={getWeeklyPlan} />

      </div>

      {/* Bottom Spacing for Nav */}
      <div className="h-20" />
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
  targetWeight,
  simulatedDate
}: {
  step: number;
  title: string;
  description: string;
  icon: any;
  logs: any[];
  logType: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: any;
  updateLog: any;
  targetWeight: number;
  simulatedDate?: Date | null;
}) {
  const [weight, setWeight] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Check if already logged today (use simulated date if available)
  const today = simulatedDate || new Date();
  const todayLog = logs.find(log => {
    const logDate = new Date(log.date);
    return log.type === logType &&
           logDate.getFullYear() === today.getFullYear() &&
           logDate.getMonth() === today.getMonth() &&
           logDate.getDate() === today.getDate();
  });

  const isComplete = !!todayLog;

  const handleSubmit = () => {
    if (weight) {
      // Use simulated date if available, with appropriate time for log type
      const logDate = new Date(today);
      if (logType === 'morning') logDate.setHours(7, 0, 0, 0);
      else if (logType === 'pre-practice') logDate.setHours(15, 0, 0, 0);
      else if (logType === 'post-practice') logDate.setHours(17, 0, 0, 0);
      else if (logType === 'before-bed') logDate.setHours(22, 0, 0, 0);

      addLog({
        weight: parseFloat(weight),
        date: logDate,
        type: logType,
      });
      setWeight('');
      setIsLogging(false);
    }
  };

  const handleEdit = () => {
    setWeight(todayLog.weight.toString());
    setIsEditing(true);
  };

  const handleUpdate = () => {
    if (weight && todayLog) {
      updateLog(todayLog.id, { weight: parseFloat(weight) });
      setWeight('');
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setWeight('');
    setIsLogging(false);
    setIsEditing(false);
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
                {targetWeight && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    todayLog.weight <= targetWeight ? "bg-green-500/20 text-green-500" :
                    todayLog.weight <= targetWeight + 2 ? "bg-yellow-500/20 text-yellow-500" :
                    "bg-destructive/20 text-destructive"
                  )}>
                    {todayLog.weight <= targetWeight ? "ON TARGET" :
                     `+${(todayLog.weight - targetWeight).toFixed(1)} lbs`}
                  </span>
                )}
                <button
                  onClick={handleEdit}
                  className="ml-auto p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit weight"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (isLogging || isEditing) ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Weight"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-24 h-9 font-mono"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">lbs</span>
                <Button size="sm" onClick={isEditing ? handleUpdate : handleSubmit} className="h-9">
                  {isEditing ? 'Update' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} className="h-9">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLogging(true)}
                className="h-8"
              >
                <Scale className="w-3 h-3 mr-1" />
                Log Weight
              </Button>
            )}

            {!isComplete && !isLogging && (
              <div className="mt-2 space-y-1">
                {targetWeight && (
                  <p className="text-[10px] text-muted-foreground">
                    Target: {targetWeight.toFixed(1)} lbs
                  </p>
                )}
                <p className="text-[10px] text-yellow-500 font-medium">
                  {logType === 'morning' && "Log morning weight to track overnight drift"}
                  {logType === 'pre-practice' && "Log pre-practice to measure session loss"}
                  {logType === 'post-practice' && "Log post-practice to see sweat rate"}
                  {logType === 'before-bed' && "Log before bed to predict tomorrow's weight"}
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
function ExtraWorkoutLog({ addLog, logs, simulatedDate, deleteLog, updateLog }: { addLog: any; logs: any[]; simulatedDate?: Date | null; deleteLog: any; updateLog: any }) {
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
  const extraWorkouts: { before: any; after: any; time: Date }[] = [];
  for (let i = 0; i < todayExtraLogs.length; i++) {
    const log = todayExtraLogs[i];
    if (log.type === 'extra-before') {
      // Find matching after within 5 minutes
      const after = todayExtraLogs.find(l =>
        l.type === 'extra-after' &&
        Math.abs(new Date(l.date).getTime() - new Date(log.date).getTime()) < 5 * 60 * 1000
      );
      if (after) {
        extraWorkouts.push({ before: log, after, time: new Date(log.date) });
      }
    }
  }

  const handleSubmit = () => {
    if (beforeWeight && afterWeight) {
      // Use simulated date if available
      const baseDate = new Date(today);
      baseDate.setHours(18, 0, 0, 0); // Default extra workout time

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

  const handleDelete = (workout: { before: any; after: any }) => {
    deleteLog(workout.before.id);
    deleteLog(workout.after.id);
  };

  const handleEdit = (workout: { before: any; after: any }) => {
    setEditingId(workout.before.id);
    setEditBefore(workout.before.weight.toString());
    setEditAfter(workout.after.weight.toString());
  };

  const handleSaveEdit = (workout: { before: any; after: any }) => {
    if (editBefore && editAfter) {
      updateLog(workout.before.id, { weight: parseFloat(editBefore) });
      updateLog(workout.after.id, { weight: parseFloat(editAfter) });
      setEditingId(null);
      setEditBefore('');
      setEditAfter('');
    }
  };

  return (
    <div className="space-y-2">
      {/* Show logged extra workouts */}
      {extraWorkouts.map((workout, i) => {
        const weightLoss = workout.before.weight - workout.after.weight;
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
                  <span className="text-sm font-bold text-orange-500">Extra Workout</span>
                  <span className="text-xs text-muted-foreground">
                    {format(workout.time, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-mono text-sm">
                      {workout.before.weight} → {workout.after.weight} lbs
                    </span>
                    <span className={cn(
                      "text-xs font-bold ml-2",
                      weightLoss > 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {weightLoss > 0 ? `-${weightLoss.toFixed(1)}` : `+${Math.abs(weightLoss).toFixed(1)}`}
                    </span>
                  </div>
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
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Add new extra workout */}
      <Card className="border-dashed border-muted">
        <CardContent className="p-4">
          {!isOpen ? (
            <button
              onClick={() => setIsOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add Extra Workout</span>
            </button>
          ) : (
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Extra Workout Weight Loss</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Before</Label>
                  <Input
                    type="number"
                    placeholder="Weight"
                    value={beforeWeight}
                    onChange={(e) => setBeforeWeight(e.target.value)}
                    className="font-mono"
                    step="0.1"
                  />
                </div>
                <div>
                  <Label className="text-xs">After</Label>
                  <Input
                    type="number"
                    placeholder="Weight"
                    value={afterWeight}
                    onChange={(e) => setAfterWeight(e.target.value)}
                    className="font-mono"
                    step="0.1"
                  />
                </div>
              </div>
              {beforeWeight && afterWeight && (
                <p className="text-sm text-primary font-bold">
                  Lost: {(parseFloat(beforeWeight) - parseFloat(afterWeight)).toFixed(1)} lbs
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmit}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Fuel Tracker with Macro Tracking
function FuelTracker({ fuel }: { fuel: { allowed: string[]; avoid: string[]; ratio: string; protein?: string; carbs?: string } }) {
  const { getMacroTargets, getFoodLists, getDailyTracking, updateDailyTracking, profile } = useStore();
  const macros = getMacroTargets();
  const foodLists = getFoodLists();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const dayOfWeek = getDay(today);

  const [showFoodRef, setShowFoodRef] = useState(false); // Food reference collapsed by default
  const [addCarbs, setAddCarbs] = useState('');
  const [addProtein, setAddProtein] = useState('');
  const [isEditingCarbs, setIsEditingCarbs] = useState(false);
  const [isEditingProtein, setIsEditingProtein] = useState(false);
  const [editCarbsValue, setEditCarbsValue] = useState('');
  const [editProteinValue, setEditProteinValue] = useState('');

  const carbProgress = macros.carbs.max > 0 ? Math.min(100, (tracking.carbsConsumed / macros.carbs.max) * 100) : 0;
  const proteinProgress = macros.protein.max > 0 ? Math.min(100, (tracking.proteinConsumed / macros.protein.max) * 100) : 0;

  const handleAddMacros = () => {
    const newCarbs = addCarbs ? tracking.carbsConsumed + parseInt(addCarbs) : tracking.carbsConsumed;
    const newProtein = addProtein ? tracking.proteinConsumed + parseInt(addProtein) : tracking.proteinConsumed;
    updateDailyTracking(dateKey, { carbsConsumed: newCarbs, proteinConsumed: newProtein });
    setAddCarbs('');
    setAddProtein('');
  };

  const handleEditCarbs = () => {
    setEditCarbsValue(tracking.carbsConsumed.toString());
    setIsEditingCarbs(true);
  };

  const handleSaveCarbs = () => {
    updateDailyTracking(dateKey, { carbsConsumed: parseInt(editCarbsValue) || 0 });
    setIsEditingCarbs(false);
    setEditCarbsValue('');
  };

  const handleEditProtein = () => {
    setEditProteinValue(tracking.proteinConsumed.toString());
    setIsEditingProtein(true);
  };

  const handleSaveProtein = () => {
    updateDailyTracking(dateKey, { proteinConsumed: parseInt(editProteinValue) || 0 });
    setIsEditingProtein(false);
    setEditProteinValue('');
  };

  const handleResetMacros = () => {
    updateDailyTracking(dateKey, { carbsConsumed: 0, proteinConsumed: 0 });
  };

  // Determine which food list to show based on day
  const getFoodListForDay = () => {
    if (dayOfWeek === 0) { // Sunday
      return { label: "Recovery (Sunday)", foods: foodLists.recovery, description: "Protein refeed + rebuild glycogen" };
    }
    if (dayOfWeek === 6) { // Saturday
      return { label: "Competition Day", foods: foodLists.tournament, description: "Fast carbs between matches" };
    }
    if (dayOfWeek >= 4 && dayOfWeek <= 5) { // Thu-Fri
      return { label: "Zero Fiber (Thu-Fri)", foods: foodLists.zeroFiber, description: "Clear gut for weigh-in" };
    }
    if (dayOfWeek >= 1 && dayOfWeek <= 3) { // Mon-Wed
      return { label: "High Fructose (Mon-Wed)", foods: foodLists.highFructose, description: "Burns fat while keeping energy high" };
    }
    return { label: "Balanced", foods: foodLists.balanced, description: "Transition phase" };
  };

  const dayFoodList = getFoodListForDay();
  const avoidList = foodLists.avoid;

  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary">2</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary" />
                <h3 className="font-bold">Today's Fuel</h3>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{macros.ratio}</span>
            </div>

            {/* Macro Progress Bars */}
            <div className="space-y-2 mb-3">
              {/* Carbs */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-muted-foreground">Carbs</span>
                  <div className="flex items-center gap-1">
                    {isEditingCarbs ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={editCarbsValue}
                          onChange={(e) => setEditCarbsValue(e.target.value)}
                          className="h-5 w-14 text-xs font-mono"
                          autoFocus
                        />
                        <span className="text-muted-foreground">g</span>
                        <Button size="sm" variant="ghost" onClick={handleSaveCarbs} className="h-5 px-1 text-[10px]">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingCarbs(false)} className="h-5 px-1 text-[10px]">Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono">{tracking.carbsConsumed}g / {macros.carbs.min}-{macros.carbs.max}g</span>
                        <button
                          onClick={handleEditCarbs}
                          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit carbs"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      carbProgress >= 100 ? "bg-green-500" : carbProgress >= 80 ? "bg-primary" : "bg-primary/50"
                    )}
                    style={{ width: `${carbProgress}%` }}
                  />
                </div>
              </div>

              {/* Protein */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-muted-foreground">Protein</span>
                  <div className="flex items-center gap-1">
                    {isEditingProtein ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={editProteinValue}
                          onChange={(e) => setEditProteinValue(e.target.value)}
                          className="h-5 w-14 text-xs font-mono"
                          autoFocus
                        />
                        <span className="text-muted-foreground">g</span>
                        <Button size="sm" variant="ghost" onClick={handleSaveProtein} className="h-5 px-1 text-[10px]">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingProtein(false)} className="h-5 px-1 text-[10px]">Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono">{tracking.proteinConsumed}g / {macros.protein.min}-{macros.protein.max}g</span>
                        <button
                          onClick={handleEditProtein}
                          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit protein"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      proteinProgress >= 100 ? "bg-green-500" : proteinProgress >= 80 ? "bg-orange-500" : "bg-orange-500/50"
                    )}
                    style={{ width: `${proteinProgress}%` }}
                  />
                </div>
              </div>

              {/* Reset macros button */}
              {(tracking.carbsConsumed > 0 || tracking.proteinConsumed > 0) && (
                <button
                  onClick={handleResetMacros}
                  className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 mt-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Reset macros to 0
                </button>
              )}
            </div>

            {/* Quick Add Macros */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Carbs (g)"
                  value={addCarbs}
                  onChange={(e) => setAddCarbs(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Protein (g)"
                  value={addProtein}
                  onChange={(e) => setAddProtein(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                onClick={handleAddMacros}
                disabled={!addCarbs && !addProtein}
                className="h-8"
              >
                Add
              </Button>
            </div>

            {/* Why Explanations - Always visible */}
            <div className="space-y-2 mb-3">
              {dayOfWeek >= 1 && dayOfWeek <= 3 && (
                <WhyExplanation title="low protein Mon-Wed">
                  <strong>Protein blocks fat burning.</strong> During the metabolic phase, we want your body burning fat for fuel.
                  Protein triggers insulin and mTOR pathways that shut down fat oxidation. By keeping protein minimal,
                  you can lose more actual body fat while maintaining energy through carbs.
                </WhyExplanation>
              )}
              {dayOfWeek >= 1 && dayOfWeek <= 3 && (
                <WhyExplanation title="fructose heavy">
                  <strong>Fructose burns fat better.</strong> Unlike glucose, fructose is processed by the liver and doesn't spike
                  insulin as much. This keeps your body in a fat-burning state while still providing energy for training.
                  Fruits, honey, and juices are your primary fuel sources.
                </WhyExplanation>
              )}
              {dayOfWeek >= 4 && dayOfWeek <= 5 && (
                <WhyExplanation title="zero fiber Thu-Fri">
                  <strong>Fiber stays in your gut as weight.</strong> Fiber takes 24-48 hours to clear your digestive system.
                  Any fiber eaten Thursday or Friday will still be in your gut at weigh-in, adding 1-3 lbs that won't
                  show up on the scale until after you compete.
                </WhyExplanation>
              )}
              {dayOfWeek >= 4 && dayOfWeek <= 5 && (
                <WhyExplanation title="switch to glucose">
                  <strong>Glucose for quick energy.</strong> As you approach competition, we shift from fructose to glucose-based
                  carbs (rice, potatoes). Glucose goes straight to muscle glycogen, ensuring you have explosive energy
                  for your matches without the fiber that comes with fruit.
                </WhyExplanation>
              )}
              {dayOfWeek === 0 && (
                <WhyExplanation title="high protein Sunday">
                  <strong>Protein refeed repairs muscle.</strong> After a week of low protein and competition, your muscles are depleted.
                  Sunday is your window to flood your body with protein (1.2-1.5g/lb) to repair tissue damage and rebuild
                  strength before next week's cycle begins.
                </WhyExplanation>
              )}
              {dayOfWeek === 6 && (
                <WhyExplanation title="fast carbs on competition day">
                  <strong>Quick energy, no gut weight.</strong> Between matches you need instant fuel without adding bulk.
                  Simple sugars (gummies, juice, rice cakes) absorb fast and provide explosive energy without the fiber
                  that would slow you down or add scale weight.
                </WhyExplanation>
              )}
            </div>

            {/* Allowed Foods Toggle */}
            <button
              onClick={() => setShowFoodRef(!showFoodRef)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between py-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                  <Apple className="w-3 h-3" /> {showFoodRef ? 'Hide' : 'Show'} Food Reference
                </span>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showFoodRef && "rotate-90")} />
              </div>
            </button>

            {showFoodRef && (
              <div className="space-y-3 pt-2 border-t border-muted mt-2">
                {/* Recommended Foods - Show ALL */}
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-primary uppercase font-bold">{dayFoodList.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">— {dayFoodList.description}</span>
                  </div>
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {dayFoodList.foods.map((food, i) => (
                      <div key={i} className="flex items-center justify-between bg-primary/5 rounded px-2 py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-foreground">{food.name}</span>
                          <span className="text-[9px] text-muted-foreground bg-muted/50 px-1 rounded">{food.ratio}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground">{food.serving}</span>
                          <span className="font-mono text-primary">{food.carbs}g</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* High Glucose Options for Thu-Fri - Show ALL */}
                {dayOfWeek >= 4 && dayOfWeek <= 5 && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-cyan-500 uppercase font-bold">High Glucose Options:</span>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {foodLists.highGlucose.map((food, i) => (
                        <div key={i} className="flex items-center justify-between bg-cyan-500/5 rounded px-2 py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-foreground">{food.name}</span>
                            <span className="text-[9px] text-muted-foreground bg-muted/50 px-1 rounded">{food.ratio}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-muted-foreground">{food.serving}</span>
                            <span className="font-mono text-cyan-500">{food.carbs}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Avoid Foods - Show ALL relevant to today */}
                <div className="space-y-2">
                  <span className="text-[10px] text-destructive uppercase font-bold">Avoid Today:</span>
                  <div className="space-y-1">
                    {avoidList.filter((item) => {
                      // Filter avoid list based on day
                      if (dayOfWeek >= 1 && dayOfWeek <= 3) { // Mon-Wed
                        return item.name.includes("Mon-Wed") || item.name.includes("Whey") || item.name.includes("Chicken");
                      }
                      if (dayOfWeek >= 4 && dayOfWeek <= 5) { // Thu-Fri
                        return item.name.includes("Thu-Fri") || item.name.includes("Vegetables") || item.name.includes("Fruits");
                      }
                      return false;
                    }).map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-destructive/5 rounded px-2 py-1">
                        <span className="text-[11px] font-medium text-destructive">{item.name.replace(" (Mon-Wed)", "").replace(" (Thu-Fri)", "")}</span>
                        <span className="text-[9px] text-muted-foreground">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Hydration Tracker
function HydrationTracker({ hydration }: { hydration: { amount: string; type: string; note: string; targetOz: number } }) {
  const { getDailyTracking, updateDailyTracking, profile } = useStore();
  const today = profile.simulatedDate || new Date();
  const dateKey = format(today, 'yyyy-MM-dd');
  const tracking = getDailyTracking(dateKey);
  const [addAmount, setAddAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const progress = hydration.targetOz > 0 ? Math.min(100, (tracking.waterConsumed / hydration.targetOz) * 100) : 0;

  const quickAddAmounts = [8, 16, 24, 32];

  const handleAddWater = (oz: number) => {
    updateDailyTracking(dateKey, { waterConsumed: tracking.waterConsumed + oz });
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
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-cyan-500">3</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-500" />
                <h3 className="font-bold">Hydration: {hydration.amount}</h3>
                {/* Water Type Badge */}
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                  hydration.type === 'Distilled'
                    ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/50"
                    : hydration.type === 'Sip Only'
                      ? "bg-orange-500/20 text-orange-500 border border-orange-500/50 animate-pulse"
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

            {/* Quick Add Buttons */}
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

            {/* Why Explanations */}
            {(() => {
              const dayOfWeek = getDay(today);
              return (
                <div className="pt-3 mt-3 border-t border-muted space-y-2">
                  {dayOfWeek >= 1 && dayOfWeek <= 3 && (
                    <WhyExplanation title="load water Mon-Wed">
                      <strong>Water loading triggers natural diuresis.</strong> By drinking 1.5-2 gallons daily, your body
                      increases urine production. When you cut water on Friday, your body keeps flushing even without
                      intake, helping you drop water weight safely without severe dehydration.
                    </WhyExplanation>
                  )}
                  {dayOfWeek === 4 && (
                    <WhyExplanation title="distilled water Thursday">
                      <strong>Mineral-free water flushes sodium.</strong> Distilled water has no minerals, so your body
                      pulls sodium from tissues to balance it out. This accelerates sodium and water loss while maintaining
                      your hydration momentum from earlier in the week.
                    </WhyExplanation>
                  )}
                  {dayOfWeek === 5 && (
                    <WhyExplanation title="sip only Friday">
                      <strong>Your body is still flushing.</strong> After days of high water intake, your kidneys are in
                      overdrive. Sipping just enough to stay functional lets your body continue eliminating water
                      naturally. Gulping would halt this process and add weight back.
                    </WhyExplanation>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Settings Dialog
function SettingsDialog({ profile, updateProfile, resetData }: any) {
  const { signOut, user } = useAuth();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    resetData();
    setShowResetConfirm(false);
    window.location.href = '/';
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[90%] rounded-xl bg-card border-muted max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="dates">Dates</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Weight (lbs)</Label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="number"
                  value={profile.currentWeight || ''}
                  onChange={(e) => updateProfile({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                  className="pl-10 font-mono"
                  placeholder="Enter weight"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Weight Class</Label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                <Select
                  value={profile.targetWeightClass.toString()}
                  onValueChange={(v) => updateProfile({ targetWeightClass: parseInt(v) })}
                >
                  <SelectTrigger className="pl-10 font-mono">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {[125, 133, 141, 149, 157, 165, 174, 184, 197, 285].map(w => (
                      <SelectItem key={w} value={w.toString()}>{w} lbs</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Protocol</Label>
              <Select
                value={profile.protocol}
                onValueChange={(v) => updateProfile({ protocol: v as any })}
              >
                <SelectTrigger className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Body Comp Phase</SelectItem>
                  <SelectItem value="2">Make Weight Phase</SelectItem>
                  <SelectItem value="3">Hold Weight Phase</SelectItem>
                  <SelectItem value="4">Build Phase</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {profile.protocol === '1' && 'Extreme fat loss - fructose only Mon-Thu'}
                {profile.protocol === '2' && 'In-season weekly cut - standard protocol'}
                {profile.protocol === '3' && 'At walk-around weight - maintenance'}
                {profile.protocol === '4' && 'Off-season muscle gain - high calories'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="dates" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Next Weigh-in Date</Label>
              <Input
                type="date"
                className="bg-muted/30 border-muted"
                value={format(new Date(profile.weighInDate), 'yyyy-MM-dd')}
                onChange={(e) => updateProfile({ weighInDate: new Date(e.target.value) })}
              />
            </div>

            <div className="space-y-2 pt-4 border-t border-muted">
              <Label className="flex items-center gap-2">
                Demo Mode
                <span className="text-[10px] text-muted-foreground font-normal">(Test different days)</span>
              </Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Simulate a different day to see how the app behaves on Friday, Saturday, etc.
              </p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  className="bg-muted/30 border-muted flex-1"
                  value={profile.simulatedDate ? format(new Date(profile.simulatedDate), 'yyyy-MM-dd') : ''}
                  onChange={(e) => updateProfile({ simulatedDate: e.target.value ? new Date(e.target.value) : null })}
                />
                {profile.simulatedDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateProfile({ simulatedDate: null })}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                  // Calculate the date for each day of this week
                  const today = new Date();
                  const currentDay = today.getDay();
                  const targetDay = i === 6 ? 0 : i + 1; // Convert to JS day (0=Sun, 1=Mon, etc)
                  const diff = targetDay - currentDay;
                  const targetDate = new Date(today);
                  targetDate.setDate(today.getDate() + diff);

                  return (
                    <Button
                      key={day}
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-7 px-2"
                      onClick={() => updateProfile({ simulatedDate: targetDate })}
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4 py-4">
            {user && (
              <div className="space-y-3 pb-4 border-b border-muted">
                <h4 className="font-bold text-sm">Account</h4>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-bold text-sm">Reset All Data</h4>
              <p className="text-xs text-muted-foreground">
                This will delete all your weight logs, tracking data, and profile settings. You will need to go through onboarding again.
              </p>

              {!showResetConfirm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Reset All Data
                </Button>
              ) : (
                <div className="space-y-2 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <p className="text-xs font-bold text-destructive">Are you sure? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleReset}
                      className="flex-1"
                    >
                      Yes, Reset Everything
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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

// What's Next Card - Data-driven tomorrow's plan with specific numbers
function WhatsNextCard({ getTomorrowPlan, getWeeklyPlan }: { getTomorrowPlan: () => any; getWeeklyPlan: () => any[] }) {
  const tomorrow = getTomorrowPlan();
  const weekPlan = getWeeklyPlan();

  if (!tomorrow) return null;

  const phaseColors: Record<string, string> = {
    'Load': 'text-primary',
    'Cut': 'text-orange-500',
    'Compete': 'text-yellow-500',
    'Recover': 'text-cyan-500'
  };

  return (
    <div className="space-y-3 mt-4">
      {/* Tomorrow's Targets */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm uppercase">Tomorrow: {tomorrow.day}</h4>
            </div>
            <span className={cn("text-xs font-bold uppercase", phaseColors[tomorrow.phase] || 'text-primary')}>
              {tomorrow.phase} Phase
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Weight Targets */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground">Morning Target</span>
              <p className="font-mono font-bold text-lg">{tomorrow.weightTarget.morning} lbs</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground">Post-Practice</span>
              <p className="font-mono font-bold text-lg">{tomorrow.weightTarget.postPractice} lbs</p>
            </div>

            {/* Hydration */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground">Water</span>
              <p className="font-mono font-bold text-cyan-500">{tomorrow.water.amount}</p>
              <p className="text-[10px] text-muted-foreground">{tomorrow.water.type}</p>
            </div>

            {/* Macros */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground">Macros</span>
              <p className="text-xs">
                <span className="font-mono font-bold text-primary">{tomorrow.carbs.min}-{tomorrow.carbs.max}g</span>
                <span className="text-muted-foreground"> carbs</span>
              </p>
              <p className="text-xs">
                <span className="font-mono font-bold text-orange-500">{tomorrow.protein.min}-{tomorrow.protein.max}g</span>
                <span className="text-muted-foreground"> protein</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Week Overview */}
      <Card className="border-muted">
        <CardContent className="p-3">
          <h4 className="text-[10px] uppercase text-muted-foreground font-bold mb-2">Week at a Glance</h4>
          <div className="grid grid-cols-7 gap-1">
            {weekPlan.map((day) => (
              <div
                key={day.day}
                className={cn(
                  "text-center p-1 rounded text-[10px]",
                  day.isToday && "bg-primary text-black font-bold",
                  day.isTomorrow && !day.isToday && "bg-primary/20 text-primary font-bold",
                  !day.isToday && !day.isTomorrow && "text-muted-foreground"
                )}
              >
                <div className="font-bold">{day.day.slice(0, 3)}</div>
                <div className="font-mono">{day.weightTarget.morning}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
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

// Weigh-In Countdown Timer (shows on Friday)
function WeighInCountdown({ weighInDate, simulatedDate }: { weighInDate: Date; simulatedDate: Date | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = simulatedDate || new Date();
      const weighIn = new Date(weighInDate);
      const diff = weighIn.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('WEIGH-IN TIME');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours < 48) {
        setTimeLeft(`${hours}h ${minutes}m until weigh-in`);
      } else {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days} days until weigh-in`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [weighInDate, simulatedDate]);

  return (
    <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg p-3 mb-4 text-center">
      <Clock className="w-5 h-5 text-orange-500 mx-auto mb-1" />
      <span className="text-orange-500 font-bold text-lg font-mono">{timeLeft}</span>
    </div>
  );
}
