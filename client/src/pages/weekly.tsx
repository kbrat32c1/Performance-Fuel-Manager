import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format, getDay, addDays, startOfWeek, isSameDay } from "date-fns";
import { Droplets, Scale, CheckCircle2, Circle, AlertTriangle, TrendingDown, TrendingUp, Target, Dumbbell } from "lucide-react";
import { getWeightMultiplier, WATER_LOADING_RANGE, calculateTargetWeight, getWaterTargetGallons, getSodiumTarget } from "@/lib/constants";
import { getPhaseStyleForDaysUntil } from "@/lib/phase-colors";
import { WeekOverview } from "@/components/dashboard";
import { useLocation } from "wouter";

export default function Weekly() {
  const [, setLocation] = useLocation();
  const { profile: profileCheck } = useStore();
  const proto = profileCheck?.protocol || '5';
  // Redirect non-competition protocols (4=Gain, 5=SPAR General) away from Week page
  if (proto === '4' || proto === '5') {
    setLocation('/dashboard');
    return null;
  }

  const { profile, logs, getCheckpoints, getWeekDescentData, getWaterLoadBonus, isWaterLoadingDay, getExtraWorkoutStats, getDaysUntilWeighIn, getDaysUntilForDay, getTimeUntilWeighIn, getWeeklyPlan } = useStore();
  const checkpoints = getCheckpoints();
  const descentData = getWeekDescentData();

  const today = profile.simulatedDate || new Date();
  const currentDayOfWeek = getDay(today); // Still needed for week display (Mon-Sun navigation)

  // Current phase based on days until weigh-in
  const daysUntil = getDaysUntilWeighIn();
  const { phase: currentPhase, style: phaseStyle } = getPhaseStyleForDaysUntil(daysUntil);

  // Dynamically compute daysUntil for each day of the week based on actual weigh-in date
  // dayNum: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const dayToDaysUntil: Record<string, number> = {
    mon: getDaysUntilForDay(1),
    tue: getDaysUntilForDay(2),
    wed: getDaysUntilForDay(3),
    thu: getDaysUntilForDay(4),
    fri: getDaysUntilForDay(5),
    sat: getDaysUntilForDay(6),
    sun: getDaysUntilForDay(0),
  };

  // Use athlete's walk-around weight for water scaling
  // Walk-around is estimated as targetWeightClass × 1.06-1.07 (typical rehydration weight)
  // If we have a recent morning log from training phase (not cut week), use that instead
  const athleteWeightLbs = (() => {
    const daysUntil = getDaysUntilWeighIn();
    // During training phase (6+ days out), use most recent morning or any log
    if (daysUntil > 5) {
      // Most recent log of any type gives best current weight estimate
      if (logs.length > 0) {
        const sorted = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return sorted[0].weight;
      }
    } else {
      // During comp week, use morning weight (more representative of cutting weight)
      const morningLogs = [...logs]
        .filter(l => l.type === 'morning')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (morningLogs.length > 0) return morningLogs[0].weight;
    }
    // Fallback: walk-around estimate from weight class
    return Math.round(profile.targetWeightClass * 1.07);
  })();

  // Compute water targets using ml/kg scaling from research
  const getWaterForDay = (dayKey: string) => {
    const daysOut = dayToDaysUntil[dayKey] ?? 5;
    return getWaterTargetGallons(daysOut, athleteWeightLbs);
  };

  // Compute sodium target for each day
  const getSodiumForDay = (dayKey: string) => {
    const daysOut = dayToDaysUntil[dayKey] ?? 5;
    return getSodiumTarget(daysOut);
  };

  // Water loading bonus from centralized helper
  const waterLoadBonus = getWaterLoadBonus();

  // Weight targets by day - dynamically computed from actual weigh-in date
  const getWeightTargets = () => {
    const w = profile.targetWeightClass;
    const protocol = profile.protocol;
    const getTarget = (daysUntil: number) => calculateTargetWeight(w, daysUntil, protocol);

    // Build targets for each day using dynamic daysUntil
    const buildDayTarget = (dayKey: string) => {
      const du = dayToDaysUntil[dayKey];
      const t = getTarget(du);

      // Label and note based on days-until, not day-of-week
      if (du === 0) return {
        label: 'Weigh-in', target: t.base, range: `${t.base}`,
        withLoading: null, note: 'Weigh-in weight'
      };
      if (du < 0) return {
        label: 'Recovery', target: t.base, range: `${t.base}-${t.base + 1}`,
        withLoading: null, note: 'Rebuilding'
      };
      if (du === 1) return {
        label: 'Final Cut', target: t.base, range: `${t.base}-${t.base + 1}`,
        withLoading: null, note: 'CRITICAL checkpoint'
      };
      if (du === 2) return {
        label: 'Restriction', target: t.range ? t.range.max : t.base, range: `${t.base}`,
        withLoading: t.range ? `${t.range.min}-${t.range.max}` : null,
        note: t.range ? `Still +${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water weight` : 'Water weight dropping'
      };
      if (du >= 3 && du <= 4) return {
        label: du === 4 ? 'Peak Loading' : 'Loading',
        target: t.range ? t.range.max : t.base,
        range: t.range ? `${t.range.min}-${t.range.max}` : `${t.base}`,
        withLoading: du === 3 ? (t.range ? `${t.range.min}-${t.range.max}` : null) : null,
        note: du === 4 ? 'Heaviest day is normal' : (t.range ? `+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs loading` : undefined)
      };
      // du === 5 or du > 5
      return {
        label: du === 5 ? 'Walk-Around' : 'Training',
        target: t.range ? t.range.max : t.base,
        range: `${t.base}`,
        withLoading: t.range ? `${t.range.min}-${t.range.max}` : null,
        note: t.range ? `+${WATER_LOADING_RANGE.MIN}-${WATER_LOADING_RANGE.MAX} lbs water loading` : undefined
      };
    };

    return {
      mon: buildDayTarget('mon'),
      tue: buildDayTarget('tue'),
      wed: buildDayTarget('wed'),
      thu: buildDayTarget('thu'),
      fri: buildDayTarget('fri'),
      sat: buildDayTarget('sat'),
      sun: buildDayTarget('sun'),
    };
  };

  const weightTargets = getWeightTargets();

  // Days of the week with phases computed from actual weigh-in date
  const days = [
    { key: 'mon', label: 'Mon', dayNum: 1 },
    { key: 'tue', label: 'Tue', dayNum: 2 },
    { key: 'wed', label: 'Wed', dayNum: 3 },
    { key: 'thu', label: 'Thu', dayNum: 4 },
    { key: 'fri', label: 'Fri', dayNum: 5 },
    { key: 'sat', label: 'Sat', dayNum: 6 },
    { key: 'sun', label: 'Sun', dayNum: 0 },
  ].map(d => ({
    ...d,
    phase: getPhaseStyleForDaysUntil(dayToDaysUntil[d.key]).phase,
  }));

  // Get logged weight for a specific day
  const getLoggedWeight = (dayNum: number, type: string) => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetDate = addDays(weekStart, dayNum === 0 ? 6 : dayNum - 1);

    return logs.find(log => {
      const logDate = new Date(log.date);
      return log.type === type &&
        logDate.getFullYear() === targetDate.getFullYear() &&
        logDate.getDate() === targetDate.getDate() &&
        logDate.getMonth() === targetDate.getMonth();
    });
  };

  // Get extra workouts for a specific day
  const getExtraWorkoutsForDay = (dayNum: number) => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetDate = addDays(weekStart, dayNum === 0 ? 6 : dayNum - 1);

    const extraBefore = logs.filter(log => {
      const logDate = new Date(log.date);
      return log.type === 'extra-before' &&
        logDate.getFullYear() === targetDate.getFullYear() &&
        logDate.getDate() === targetDate.getDate() &&
        logDate.getMonth() === targetDate.getMonth();
    });

    let totalLoss = 0;
    let count = 0;

    for (const before of extraBefore) {
      const after = logs.find(log => {
        if (log.type !== 'extra-after') return false;
        const afterDate = new Date(log.date);
        // Must be on the same day
        if (afterDate.getDate() !== targetDate.getDate() || afterDate.getMonth() !== targetDate.getMonth()) return false;
        const timeDiff = Math.abs(afterDate.getTime() - new Date(before.date).getTime());
        return timeDiff < 3 * 60 * 60 * 1000;
      });

      if (after) {
        totalLoss += before.weight - after.weight;
        count++;
      }
    }

    return { count, totalLoss };
  };

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="mb-4">
        <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
          {daysUntil > 0 ? `${daysUntil} days to weigh-in` : daysUntil === 0 ? 'Competition Day' : 'Recovery'}
        </h2>
        <h1 className="text-2xl font-heading font-bold uppercase italic">
          The Plan
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile.targetWeightClass} lb class • Water scaled to {athleteWeightLbs} lbs
        </p>
      </header>

      {/* Visual Week Plan — tap any day for eating/drinking details */}
      <WeekOverview getWeeklyPlan={getWeeklyPlan} />

      {/* Weight Targets Table */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4" /> Weight Targets
        </h3>

        {/* Phase-Aware Protocol Banner */}
        {checkpoints.isWaterLoadingDay && (
          <div className={cn("mb-3 p-2 rounded-lg border", phaseStyle.bgLight, phaseStyle.border)}>
            <div className="flex items-center gap-2">
              <Droplets className={cn("w-4 h-4", phaseStyle.text)} />
              <span className={cn("text-xs font-bold", phaseStyle.text)}>
                {currentPhase === 'Prep' ? 'PREP DAY — ZERO FIBER' : 'WATER LOADING ACTIVE'}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {currentPhase === 'Prep'
                ? "Last day of full water. Eliminate fiber to clear the GI tract before the cut."
                : `${checkpoints.waterLoadingAdjustment} — this is expected and part of the protocol.`}
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
                {getWeeklyPlan().map((planDay) => {
                  const dayDate = new Date(planDay.date);
                  const morningLog = logs.find(log => {
                    const logDate = new Date(log.date);
                    return (log.type === 'morning' || log.type === 'weigh-in') &&
                      logDate.getFullYear() === dayDate.getFullYear() &&
                      logDate.getMonth() === dayDate.getMonth() &&
                      logDate.getDate() === dayDate.getDate();
                  });
                  const relevantLog = morningLog;
                  const dayDaysUntil = Math.round((new Date(profile.weighInDate).getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24));
                  const isLoadingDay = dayDaysUntil >= 3 && dayDaysUntil <= 5;
                  const isCritical = planDay.isCriticalCheckpoint || dayDaysUntil === 1;
                  const dateLabel = format(dayDate, 'M/d');

                  let status: 'on-track' | 'behind' | 'ahead' | 'none' = 'none';
                  if (relevantLog) {
                    const diff = relevantLog.weight - planDay.weightTarget;
                    const tolerance = 1.5;
                    if (diff <= -1) status = 'ahead';
                    else if (diff <= tolerance) status = 'on-track';
                    else status = 'behind';
                  }

                  return (
                    <tr
                      key={dayDate.toISOString()}
                      className={cn(
                        "border-t border-muted",
                        planDay.isToday && phaseStyle.bgLight,
                        isCritical && !planDay.isToday && "bg-orange-500/5"
                      )}
                    >
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bold",
                            planDay.isToday && phaseStyle.text,
                            isCritical && !planDay.isToday && "text-orange-500"
                          )}>{planDay.day.slice(0, 3)} <span className="text-[9px] text-muted-foreground font-normal">{dateLabel}</span></span>
                          {planDay.isToday && <span className={cn("text-[10px] text-black px-1 rounded", phaseStyle.bg)}>TODAY</span>}
                          {isCritical && !planDay.isToday && <span className="text-[10px] bg-orange-500/20 text-orange-500 px-1 rounded">KEY</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{planDay.phase}</span>
                        {planDay.waterLoadingNote && (
                          <div className={cn(
                            "text-[9px]",
                            isLoadingDay ? "text-cyan-500" : isCritical ? "text-orange-500 font-bold" : "text-muted-foreground"
                          )}>
                            {planDay.waterLoadingNote}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "font-mono font-bold",
                          isCritical && "text-orange-500"
                        )}>{planDay.weightTarget}</span>
                      </td>
                      <td className="p-2 text-center">
                        {relevantLog ? (
                          <span className="font-mono font-bold">{relevantLog.weight}</span>
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
          Loading day targets include water loading weight • 1 day out is critical checkpoint
        </p>
      </section>

      {/* Water Load Schedule */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
          <Droplets className="w-4 h-4" /> Water Load Schedule
        </h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[340px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left font-bold whitespace-nowrap">Day</th>
                  <th className="p-2 text-center font-bold whitespace-nowrap">Water</th>
                  <th className="p-2 text-center font-bold whitespace-nowrap">Na+</th>
                  <th className="p-2 text-left font-bold whitespace-nowrap">Sodium Plan</th>
                </tr>
              </thead>
              <tbody>
                {getWeeklyPlan().map((planDay) => {
                  const dayDate = new Date(planDay.date);
                  const daysOut = Math.round((new Date(profile.weighInDate).getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24));
                  const waterAmount = getWaterTargetGallons(daysOut, athleteWeightLbs);
                  const sodiumInfo = getSodiumTarget(daysOut);
                  const dateLabel = format(dayDate, 'M/d');

                  return (
                    <tr
                      key={dayDate.toISOString()}
                      className={cn(
                        "border-t border-muted",
                        planDay.isToday && phaseStyle.bgLight
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", planDay.isToday && phaseStyle.text)}>{planDay.day.slice(0, 3)} <span className="text-[9px] text-muted-foreground font-normal">{dateLabel}</span></span>
                        {planDay.isToday && <span className={cn("text-[10px] text-black px-1 rounded ml-1", phaseStyle.bg)}>TODAY</span>}
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "font-mono font-bold",
                          daysOut >= 3 && "text-cyan-500",
                          daysOut === 2 && "text-yellow-500",
                          daysOut === 1 && "text-orange-500",
                          daysOut === 0 && "text-green-500"
                        )}>
                          {waterAmount}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <span className={cn(
                          "text-[10px] font-mono font-bold",
                          sodiumInfo.color
                        )}>
                          {sodiumInfo.target > 0 ? `${(sodiumInfo.target / 1000).toFixed(1)}g` : '—'}
                        </span>
                      </td>
                      <td className="p-2 text-left">
                        <span className={cn(
                          "text-[10px] whitespace-nowrap",
                          sodiumInfo.color
                        )}>
                          {sodiumInfo.label}
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
          Based on Reale et al. acute weight management protocol (100 ml/kg peak loading) • Scaled to {athleteWeightLbs} lbs ({Math.round(athleteWeightLbs * 0.4536)} kg)
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
                  <th className="p-2 text-center font-bold">3 Days Out</th>
                  <th className="p-2 text-center font-bold">1 Day Out</th>
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
                  { class: 285, walk: '303-305', wed: '299-300', fri: '293-294' },
                ].map((row) => {
                  const isUserClass = row.class === profile.targetWeightClass;
                  return (
                    <tr
                      key={row.class}
                      className={cn(
                        "border-t border-muted",
                        isUserClass && phaseStyle.bgLight
                      )}
                    >
                      <td className="p-2">
                        <span className={cn("font-bold", isUserClass && phaseStyle.text)}>{row.class}</span>
                        {isUserClass && <span className={cn("text-[10px] text-black px-1 rounded ml-1", phaseStyle.bg)}>YOU</span>}
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
          Walk-Around = Competition × 1.06-1.07 • All targets are morning weigh-in
        </p>
      </section>

      {/* Checkpoint Rules Summary */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-3">
          Checkpoint Rules
        </h3>
        <div className="space-y-3">
          {(() => {
            // Build dynamic day labels for each protocol phase
            const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const loadingDays = dayKeys.filter(k => dayToDaysUntil[k] >= 3 && dayToDaysUntil[k] <= 5);
            const restrictionDays = dayKeys.filter(k => dayToDaysUntil[k] === 2);
            const criticalDays = dayKeys.filter(k => dayToDaysUntil[k] === 1);
            const peakDay = dayKeys.find(k => dayToDaysUntil[k] === 4); // Peak loading day

            const toLabel = (keys: string[]) => keys.map(k => dayLabels[dayKeys.indexOf(k)]).join(', ');
            const rangeLabel = (keys: string[]) => {
              if (keys.length <= 2) return toLabel(keys);
              return `${dayLabels[dayKeys.indexOf(keys[0])]}–${dayLabels[dayKeys.indexOf(keys[keys.length - 1])]}`;
            };

            return (
              <>
                <Card className="p-3 border-cyan-500/30 bg-cyan-500/5">
                  <h4 className="font-bold text-sm text-cyan-500 mb-1">{rangeLabel(loadingDays)}: Water Loading Phase</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    <li>• <strong className="text-cyan-500">Expect to be +{waterLoadBonus} lbs heavier</strong> than baseline targets</li>
                    <li>• Walk-around weight: {checkpoints.walkAround}</li>
                    <li>• Being heavier during loading is NORMAL and part of the protocol</li>
                    {peakDay && <li>• Peak water intake {dayLabels[dayKeys.indexOf(peakDay)]} (heaviest day)</li>}
                  </ul>
                </Card>

                <Card className="p-3 border-violet-400/30 bg-violet-400/5">
                  <h4 className="font-bold text-sm text-violet-400 mb-1">{toLabel(restrictionDays)}: Water Restriction Begins</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    <li>• Sharp water drop — ADH still suppressed from loading, urine output stays high</li>
                    <li>• Sodium back to normal (~2,500mg) — stop adding extra salt</li>
                    <li>• ZERO fiber — check every bite</li>
                    <li>• Water weight drops fast as body keeps flushing</li>
                  </ul>
                </Card>

                <Card className="p-3 border-orange-500/30 bg-orange-500/5">
                  <h4 className="font-bold text-sm text-orange-500 mb-1">{toLabel(criticalDays)} PM: CRITICAL Checkpoint</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    <li>• <strong className="text-orange-500">Must be {checkpoints.friTarget}</strong></li>
                    <li>• Final 3% drops from practice + overnight drift</li>
                    <li>• Above range? May need extra activity or hot bath</li>
                    <li>• Below range? You're ahead - can eat more</li>
                  </ul>
                </Card>
              </>
            );
          })()}
        </div>
      </section>

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}
