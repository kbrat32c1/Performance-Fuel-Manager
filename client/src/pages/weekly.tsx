import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, getDay, addDays, startOfWeek, isSameDay } from "date-fns";
import { Droplets, Scale, CheckCircle2, Circle, AlertTriangle, TrendingDown, TrendingUp, Target, Pencil, Check, X } from "lucide-react";
import { useState } from "react";

export default function Weekly() {
  const { profile, logs, getCheckpoints, updateLog, addLog, getWeekDescentData } = useStore();
  const checkpoints = getCheckpoints();
  const descentData = getWeekDescentData();

  // State for editing weights
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');

  const today = profile.simulatedDate || new Date();
  const currentDayOfWeek = getDay(today);

  // Get weight class category for water load table
  const getWeightCategory = (weightClass: number): 'light' | 'medium' | 'heavy' => {
    if (weightClass <= 141) return 'light';
    if (weightClass <= 165) return 'medium';
    return 'heavy';
  };

  const weightCategory = getWeightCategory(profile.targetWeightClass);

  // Water load schedule from your document (page 10)
  const waterLoadSchedule = {
    light: { mon: '1.0 gal', tue: '1.25 gal', wed: '1.5 gal', thu: '1.25 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.0 gal' },
    medium: { mon: '1.25 gal', tue: '1.5 gal', wed: '1.75 gal', thu: '1.5 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.25 gal' },
    heavy: { mon: '1.5 gal', tue: '1.75 gal', wed: '2.0 gal', thu: '1.75 gal', fri: '0.25-0.5 gal', sat: 'Rehydrate', sun: '1.5 gal' },
  };

  const waterTypes = {
    mon: { type: 'Regular', sodium: 'Normal' },
    tue: { type: 'Regular', sodium: 'Normal' },
    wed: { type: 'Regular', sodium: 'Moderate' },
    thu: { type: 'Distilled', sodium: 'Low' },
    fri: { type: 'Distilled', sodium: 'Very Low' },
    sat: { type: 'Regular', sodium: 'Reintroduce' },
    sun: { type: 'Regular', sodium: 'Normal' },
  };

  // Water loading adds weight during Mon-Wed
  // Light (<150 lbs): +2 lbs, Medium (150-174 lbs): +3 lbs, Heavy (175+): +4 lbs
  const waterLoadBonus = profile.targetWeightClass >= 175 ? 4 : profile.targetWeightClass >= 150 ? 3 : 2;

  // Weight targets by day (from your document - page 2)
  // Baseline targets + water loading adjustment for Mon-Wed
  const getWeightTargets = () => {
    const w = profile.targetWeightClass;
    const walkAround = w * 1.07;
    const wedBaseline = w * 1.045; // midpoint of 1.04-1.05
    const friTarget = w * 1.025; // midpoint of 1.02-1.03

    return {
      mon: {
        label: 'Walk-Around',
        target: walkAround,
        range: `${(w * 1.06).toFixed(0)}-${(w * 1.07).toFixed(0)}`,
        withLoading: `${Math.round(w * 1.06 + waterLoadBonus)}-${Math.round(w * 1.07 + waterLoadBonus)}`,
        note: `+${waterLoadBonus} lbs water loading`
      },
      tue: {
        label: 'Peak Loading',
        target: walkAround + waterLoadBonus,
        range: `${Math.round(w * 1.06 + waterLoadBonus)}-${Math.round(w * 1.07 + waterLoadBonus)}`,
        withLoading: null,
        note: 'Heaviest day is normal'
      },
      wed: {
        label: 'Wed PM Target',
        target: wedBaseline + waterLoadBonus,
        range: `${(w * 1.04).toFixed(0)}-${(w * 1.05).toFixed(0)}`,
        withLoading: `${Math.round(w * 1.04 + waterLoadBonus)}-${Math.round(w * 1.05 + waterLoadBonus)}`,
        note: `Still +${waterLoadBonus} lbs loading`
      },
      thu: {
        label: 'Flush Day',
        target: (wedBaseline + friTarget) / 2,
        range: `${Math.round(w * 1.03)}-${Math.round(w * 1.04)}`,
        withLoading: null,
        note: 'Water weight dropping'
      },
      fri: {
        label: 'Fri PM Target',
        target: friTarget,
        range: `${(w * 1.02).toFixed(0)}-${(w * 1.03).toFixed(0)}`,
        withLoading: null,
        note: 'CRITICAL checkpoint'
      },
      sat: {
        label: 'Competition',
        target: w,
        range: `${w}`,
        withLoading: null,
        note: 'Weigh-in weight'
      },
      sun: {
        label: 'Recovery',
        target: walkAround,
        range: `${Math.round(w * 1.06)}-${Math.round(w * 1.07)}`,
        withLoading: null,
        note: 'Rebuilding'
      },
    };
  };

  const weightTargets = getWeightTargets();

  // Days of the week
  const days = [
    { key: 'mon', label: 'Mon', dayNum: 1, phase: 'Load' },
    { key: 'tue', label: 'Tue', dayNum: 2, phase: 'Load' },
    { key: 'wed', label: 'Wed', dayNum: 3, phase: 'Load' },
    { key: 'thu', label: 'Thu', dayNum: 4, phase: 'Cut' },
    { key: 'fri', label: 'Fri', dayNum: 5, phase: 'Cut' },
    { key: 'sat', label: 'Sat', dayNum: 6, phase: 'Compete' },
    { key: 'sun', label: 'Sun', dayNum: 0, phase: 'Rebuild' },
  ];

  // Get logged weight for a specific day
  const getLoggedWeight = (dayNum: number, type: string) => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetDate = addDays(weekStart, dayNum === 0 ? 6 : dayNum - 1);

    return logs.find(log => {
      const logDate = new Date(log.date);
      return log.type === type &&
        logDate.getDate() === targetDate.getDate() &&
        logDate.getMonth() === targetDate.getMonth();
    });
  };

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="mb-4">
        <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
          Week of {format(startOfWeek(today, { weekStartsOn: 1 }), 'MMM d')}
        </h2>
        <h1 className="text-2xl font-heading font-bold uppercase italic">
          Weekly Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile.targetWeightClass} lb class • {weightCategory === 'light' ? '125-141' : weightCategory === 'medium' ? '149-165' : '174-197'} lb category
        </p>
      </header>

      {/* Progress Summary Card */}
      {descentData.morningWeights.length >= 1 && (
        <Card className={cn(
          "mb-4 border-2",
          descentData.pace === 'ahead' ? "border-green-500/50 bg-green-500/5" :
          descentData.pace === 'on-track' ? "border-primary/50 bg-primary/5" :
          descentData.pace === 'behind' ? "border-orange-500/50 bg-orange-500/5" :
          "border-muted"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {descentData.pace === 'ahead' && <TrendingDown className="w-5 h-5 text-green-500" />}
                {descentData.pace === 'on-track' && <Target className="w-5 h-5 text-primary" />}
                {descentData.pace === 'behind' && <TrendingUp className="w-5 h-5 text-orange-500" />}
                {!descentData.pace && <Scale className="w-5 h-5 text-muted-foreground" />}
                <span className="text-sm font-bold uppercase">
                  {descentData.pace === 'ahead' ? "Ahead of Schedule!" :
                   descentData.pace === 'on-track' ? "On Track" :
                   descentData.pace === 'behind' ? "Behind Schedule" :
                   "Week Progress"}
                </span>
              </div>
              <span className={cn(
                "text-xs font-bold px-2 py-1 rounded",
                descentData.pace === 'ahead' ? "bg-green-500/20 text-green-500" :
                descentData.pace === 'on-track' ? "bg-primary/20 text-primary" :
                descentData.pace === 'behind' ? "bg-orange-500/20 text-orange-500" :
                "bg-muted text-muted-foreground"
              )}>
                {descentData.daysRemaining} day{descentData.daysRemaining !== 1 ? 's' : ''} to weigh-in
              </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="text-[10px] text-muted-foreground block">Start</span>
                <span className="font-mono font-bold text-lg">
                  {descentData.startWeight?.toFixed(1) ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Now</span>
                <span className={cn(
                  "font-mono font-bold text-lg",
                  descentData.pace === 'ahead' ? "text-green-500" :
                  descentData.pace === 'on-track' ? "text-primary" :
                  descentData.pace === 'behind' ? "text-orange-500" : ""
                )}>
                  {descentData.currentWeight?.toFixed(1) ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Lost</span>
                <span className={cn(
                  "font-mono font-bold text-lg",
                  descentData.totalLost && descentData.totalLost > 0 ? "text-green-500" : "text-muted-foreground"
                )}>
                  {descentData.totalLost !== null
                    ? descentData.totalLost > 0 ? `-${descentData.totalLost.toFixed(1)}` : `+${Math.abs(descentData.totalLost).toFixed(1)}`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Goal</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {descentData.targetWeight}
                </span>
              </div>
            </div>

            {/* Progress Message */}
            {descentData.totalLost !== null && descentData.currentWeight && (
              <div className={cn(
                "mt-3 p-2 rounded-lg text-center text-sm",
                descentData.pace === 'ahead' ? "bg-green-500/10 text-green-500" :
                descentData.pace === 'on-track' ? "bg-primary/10 text-primary" :
                descentData.pace === 'behind' ? "bg-orange-500/10 text-orange-500" :
                "bg-muted text-muted-foreground"
              )}>
                {descentData.pace === 'ahead' && (
                  <>You're <strong>{Math.abs(descentData.currentWeight - descentData.targetWeight - 2).toFixed(1)} lbs</strong> ahead! You can eat a bit more.</>
                )}
                {descentData.pace === 'on-track' && (
                  <>On pace! <strong>{(descentData.currentWeight - descentData.targetWeight).toFixed(1)} lbs</strong> left to cut.</>
                )}
                {descentData.pace === 'behind' && (
                  <>Need to lose <strong>{(descentData.currentWeight - descentData.targetWeight).toFixed(1)} lbs</strong> more. Tighten up!</>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Weight Targets Table */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4" /> Weight Targets
        </h3>

        {/* Water Loading Context Banner */}
        {checkpoints.isWaterLoadingDay && (
          <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-cyan-500" />
              <span className="text-xs text-cyan-500 font-bold">WATER LOADING ACTIVE</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {checkpoints.waterLoadingAdjustment} — this is expected and part of the protocol.
            </p>
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Day</th>
                  <th className="p-2 text-center font-bold">
                    <div>Target</div>
                    <div className="text-[9px] font-normal text-muted-foreground">(w/ loading)</div>
                  </th>
                  <th className="p-2 text-center font-bold">Logged</th>
                  <th className="p-2 text-center font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const target = weightTargets[day.key as keyof typeof weightTargets];
                  const morningLog = getLoggedWeight(day.dayNum, 'morning');
                  const postLog = getLoggedWeight(day.dayNum, 'post-practice');
                  const relevantLog = day.key === 'wed' || day.key === 'fri' ? postLog : morningLog;
                  const isToday = currentDayOfWeek === day.dayNum;
                  const isPast = (day.dayNum < currentDayOfWeek && currentDayOfWeek !== 0) || (day.dayNum !== 0 && currentDayOfWeek === 0);
                  const isLoadingDay = day.key === 'mon' || day.key === 'tue' || day.key === 'wed';
                  const isCritical = day.key === 'fri';

                  let status: 'on-track' | 'behind' | 'ahead' | 'none' = 'none';
                  if (relevantLog) {
                    const diff = relevantLog.weight - target.target;
                    if (Math.abs(diff) <= 1.5) status = 'on-track';
                    else if (diff > 1.5) status = 'behind';
                    else status = 'ahead';
                  }

                  return (
                    <tr
                      key={day.key}
                      className={cn(
                        "border-t border-muted",
                        isToday && "bg-primary/10",
                        isCritical && !isToday && "bg-orange-500/5"
                      )}
                    >
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bold",
                            isToday && "text-primary",
                            isCritical && !isToday && "text-orange-500"
                          )}>{day.label}</span>
                          {isToday && <span className="text-[10px] bg-primary text-black px-1 rounded">TODAY</span>}
                          {isCritical && !isToday && <span className="text-[10px] bg-orange-500/20 text-orange-500 px-1 rounded">KEY</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{target.label}</span>
                        {target.note && (
                          <div className={cn(
                            "text-[9px]",
                            isLoadingDay ? "text-cyan-500" : isCritical ? "text-orange-500 font-bold" : "text-muted-foreground"
                          )}>
                            {target.note}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {target.withLoading ? (
                          <div>
                            <span className="font-mono font-bold text-cyan-500">{target.withLoading}</span>
                            <div className="text-[9px] text-muted-foreground line-through">{target.range}</div>
                          </div>
                        ) : (
                          <span className={cn(
                            "font-mono font-bold",
                            isCritical && "text-orange-500"
                          )}>{target.range}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editingDay === `${day.key}-${relevantLog?.type || 'morning'}` && relevantLog ? (
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              value={editWeight}
                              onChange={(e) => setEditWeight(e.target.value)}
                              className="w-16 h-7 text-center text-xs font-mono p-1"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (relevantLog && editWeight) {
                                  updateLog(relevantLog.id, { weight: parseFloat(editWeight) });
                                }
                                setEditingDay(null);
                                setEditWeight('');
                              }}
                              className="h-6 w-6"
                            >
                              <Check className="w-3 h-3 text-green-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingDay(null);
                                setEditWeight('');
                              }}
                              className="h-6 w-6"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : relevantLog ? (
                          <button
                            onClick={() => {
                              setEditingDay(`${day.key}-${relevantLog.type}`);
                              setEditWeight(relevantLog.weight.toString());
                            }}
                            className="font-mono font-bold hover:text-primary hover:underline transition-colors flex items-center justify-center gap-1 w-full"
                            title="Tap to edit"
                          >
                            {relevantLog.weight}
                            <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-50" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {status === 'on-track' && <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />}
                        {status === 'behind' && <AlertTriangle className="w-4 h-4 text-destructive mx-auto" />}
                        {status === 'ahead' && <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />}
                        {status === 'none' && <Circle className="w-4 h-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-2">
          Mon-Wed targets include water loading weight • Fri PM is critical checkpoint
        </p>
      </section>

      {/* Water Load Schedule */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Droplets className="w-4 h-4" /> Water Load Schedule
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Day</th>
                  <th className="p-2 text-center font-bold">Amount</th>
                  <th className="p-2 text-center font-bold">Type</th>
                  <th className="p-2 text-center font-bold">Sodium</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const waterAmount = waterLoadSchedule[weightCategory][day.key as keyof typeof waterLoadSchedule.light];
                  const waterInfo = waterTypes[day.key as keyof typeof waterTypes];
                  const isToday = currentDayOfWeek === day.dayNum;

                  return (
                    <tr
                      key={day.key}
                      className={cn(
                        "border-t border-muted",
                        isToday && "bg-primary/10"
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", isToday && "text-primary")}>{day.label}</span>
                        {isToday && <span className="text-[10px] bg-primary text-black px-1 rounded ml-1">TODAY</span>}
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "font-mono font-bold",
                          day.key === 'wed' && "text-cyan-500",
                          day.key === 'fri' && "text-orange-500"
                        )}>
                          {waterAmount}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          waterInfo.type === 'Distilled' ? "bg-yellow-500/20 text-yellow-500" : "bg-cyan-500/20 text-cyan-500"
                        )}>
                          {waterInfo.type}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "text-[10px]",
                          waterInfo.sodium === 'Very Low' && "text-orange-500 font-bold",
                          waterInfo.sodium === 'Low' && "text-yellow-500"
                        )}>
                          {waterInfo.sodium}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-2">
          Peak hydration Wed • Switch to distilled Thu • Sharp cut Fri
        </p>
      </section>

      {/* Weight Class Reference Table */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          Weight Management Targets (All Classes)
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold">Class</th>
                  <th className="p-2 text-center font-bold">Walk-Around</th>
                  <th className="p-2 text-center font-bold">Wed PM</th>
                  <th className="p-2 text-center font-bold">Fri PM</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { class: 125, walk: '133-134', wed: '130-131', fri: '127-128' },
                  { class: 133, walk: '141-143', wed: '138-139', fri: '135-136' },
                  { class: 141, walk: '150-151', wed: '147-148', fri: '144-145' },
                  { class: 149, walk: '158-160', wed: '155-156', fri: '152-153' },
                  { class: 157, walk: '167-168', wed: '164-165', fri: '161-162' },
                  { class: 165, walk: '175-177', wed: '172-173', fri: '169-170' },
                  { class: 174, walk: '185-187', wed: '182-183', fri: '178-180' },
                  { class: 184, walk: '196-198', wed: '193-194', fri: '189-191' },
                  { class: 197, walk: '209-211', wed: '206-207', fri: '202-203' },
                ].map((row) => {
                  const isUserClass = row.class === profile.targetWeightClass;
                  return (
                    <tr
                      key={row.class}
                      className={cn(
                        "border-t border-muted",
                        isUserClass && "bg-primary/10"
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", isUserClass && "text-primary")}>{row.class}</span>
                        {isUserClass && <span className="text-[10px] bg-primary text-black px-1 rounded ml-1">YOU</span>}
                      </td>
                      <td className="p-2 text-center font-mono">{row.walk}</td>
                      <td className="p-2 text-center font-mono">{row.wed}</td>
                      <td className="p-2 text-center font-mono">{row.fri}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-2">
          Walk-Around = Competition × 1.06-1.07 • Wed PM = Post-Practice • Fri PM = Pre-Practice
        </p>
      </section>

      {/* Checkpoint Rules Summary */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          Checkpoint Rules
        </h3>
        <div className="space-y-3">
          <Card className="p-3 border-cyan-500/30 bg-cyan-500/5">
            <h4 className="font-bold text-sm text-cyan-500 mb-1">Mon-Wed: Water Loading Phase</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• <strong className="text-cyan-500">Expect to be +{waterLoadBonus} lbs heavier</strong> than baseline targets</li>
              <li>• Walk-around weight: {checkpoints.walkAround}</li>
              <li>• Being heavier during loading is NORMAL and part of the protocol</li>
              <li>• Peak water intake Wednesday (heaviest day)</li>
            </ul>
          </Card>

          <Card className="p-3 border-yellow-500/30 bg-yellow-500/5">
            <h4 className="font-bold text-sm text-yellow-500 mb-1">Thursday: Flush Day</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Switch to distilled water - ZERO sodium</li>
              <li>• ZERO fiber - check every bite</li>
              <li>• Water loading weight starts dropping rapidly</li>
              <li>• Still high water intake to maintain flush</li>
            </ul>
          </Card>

          <Card className="p-3 border-orange-500/30 bg-orange-500/5">
            <h4 className="font-bold text-sm text-orange-500 mb-1">Friday PM: CRITICAL Checkpoint</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• <strong className="text-orange-500">Must be {checkpoints.friTarget}</strong></li>
              <li>• Final 3% drops from Fri practice + overnight drift</li>
              <li>• Above range? May need extra activity or hot bath</li>
              <li>• Below range? You're ahead - can eat more</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}
