import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Scale, TrendingDown, Droplets, Timer, Activity, RefreshCw, Sun, ArrowDown, ArrowUp, Moon, Dumbbell, Flame } from "lucide-react";
import { format, differenceInDays, startOfDay, addDays, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { getWaterTargetOz, getWeightMultiplier, getPhaseForDaysUntil } from "@/lib/constants";

const PROTOCOL_LABELS: Record<string, string> = {
  '1': 'Extreme Cut',
  '2': 'Rapid Cut',
  '3': 'Optimal Cut',
  '4': 'Gain',
  '5': 'SPAR Nutrition',
};

const PHASE_COLORS: Record<string, string> = {
  'Train': 'bg-blue-500',
  'Load': 'bg-cyan-500',
  'Prep': 'bg-yellow-500',
  'Cut': 'bg-orange-500',
  'Compete': 'bg-red-500',
  'Recover': 'bg-green-500',
};

interface SharedProfile {
  name: string;
  last_name?: string;
  current_weight: number;
  target_weight_class: number;
  weigh_in_date: string;
  weigh_in_time: string;
  protocol: number;
}

interface SharedLog {
  weight: number;
  date: string;
  type: string;
  duration?: number;
  sleep_hours?: number;
}

interface DailyTrackingData {
  date: string;
  waterConsumed: number;
  carbsConsumed: number;
  proteinConsumed: number;
}

interface CoachData {
  profile: SharedProfile;
  logs: SharedLog[];
  dailyTracking: DailyTrackingData | null;
}

export default function CoachView() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<CoachData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/share/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Athlete not found or sharing has been disabled.");
        } else {
          setError("Failed to load athlete data.");
        }
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading athlete data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center space-y-2">
            <Scale className="w-8 h-8 text-muted-foreground mx-auto" />
            <h2 className="font-bold text-lg">Link Not Available</h2>
            <p className="text-sm text-muted-foreground">{error || "Unable to load data."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CoachDashboard data={data} lastRefresh={lastRefresh} onRefresh={fetchData} />;
}

function CoachDashboard({ data, lastRefresh, onRefresh }: { data: CoachData; lastRefresh: Date; onRefresh: () => void }) {
  const { profile, logs, dailyTracking } = data;

  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const weighInDate = startOfDay(new Date(profile.weigh_in_date));
  const daysUntilWeighIn = differenceInDays(weighInDate, today);
  const currentPhase = getPhaseForDaysUntil(daysUntilWeighIn);

  // Sort all logs newest first
  const sortedLogs = useMemo(() =>
    [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [logs]
  );

  // Current weight (most recent log)
  const currentWeight = sortedLogs.length > 0 ? sortedLogs[0].weight : profile.current_weight;
  const overTarget = currentWeight - profile.target_weight_class;

  // Today's logs
  const todayLogs = useMemo(() =>
    logs.filter(l => format(new Date(l.date), 'yyyy-MM-dd') === todayStr),
    [logs, todayStr]
  );

  // Core weigh-in timeline for today
  const timeline = useMemo(() => {
    const findLog = (type: string) => todayLogs.find(l => l.type === type);
    return {
      morning: findLog('morning'),
      prePractice: findLog('pre-practice'),
      postPractice: findLog('post-practice'),
      beforeBed: findLog('before-bed'),
    };
  }, [todayLogs]);

  // Extra workouts for today
  const extraWorkouts = useMemo(() => {
    const extras = todayLogs.filter(l => l.type === 'extra-before' || l.type === 'extra-after');
    const pairs: { before: SharedLog; after: SharedLog | null }[] = [];
    for (const log of extras) {
      if (log.type === 'extra-before') {
        const after = extras.find(l =>
          l.type === 'extra-after' &&
          Math.abs(new Date(l.date).getTime() - new Date(log.date).getTime()) < 5 * 60 * 60 * 1000 &&
          new Date(l.date).getTime() > new Date(log.date).getTime()
        );
        pairs.push({ before: log, after: after || null });
      }
    }
    return pairs;
  }, [todayLogs]);

  // Check-ins for today
  const checkIns = useMemo(() =>
    todayLogs.filter(l => l.type === 'check-in'),
    [todayLogs]
  );

  // Morning weights for chart
  const chartData = useMemo(() =>
    logs
      .filter(l => l.type === 'morning' || l.type === 'weigh-in')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(l => ({ date: format(new Date(l.date), 'M/d'), weight: l.weight })),
    [logs]
  );

  // Compute drift rate (overnight weight loss per hour)
  const { avgDriftRate, avgDriftLoss } = useMemo(() => {
    const driftRates: number[] = [];
    const driftLosses: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const prev = sortedLogs[i + 1];
      if (current.type === 'morning' && (prev.type === 'post-practice' || prev.type === 'before-bed')) {
        const hoursDiff = (new Date(current.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 4 && hoursDiff < 16) {
          const drift = prev.weight - current.weight;
          if (drift > 0) {
            driftLosses.push(drift);
            const sleepHrs = current.sleep_hours && current.sleep_hours > 0 ? current.sleep_hours : hoursDiff;
            if (sleepHrs > 0) driftRates.push(drift / sleepHrs);
          }
        }
      }
    }
    return {
      avgDriftRate: driftRates.length > 0 ? driftRates.reduce((a, b) => a + b, 0) / driftRates.length : null,
      avgDriftLoss: driftLosses.length > 0 ? driftLosses.reduce((a, b) => a + b, 0) / driftLosses.length : null,
    };
  }, [sortedLogs]);

  // Compute sweat rate (practice weight loss per hour)
  const { avgSweatRate, avgPracticeLoss } = useMemo(() => {
    const sweatRates: number[] = [];
    const practiceLosses: number[] = [];
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const post = sortedLogs[i];
      const pre = sortedLogs[i + 1];
      if (post.type === 'post-practice' && pre.type === 'pre-practice') {
        const hoursDiff = (new Date(post.date).getTime() - new Date(pre.date).getTime()) / (1000 * 60 * 60);
        if (hoursDiff > 0.25 && hoursDiff < 6) {
          const loss = pre.weight - post.weight;
          if (loss > 0) {
            practiceLosses.push(loss);
            const hrs = post.duration && post.duration > 0 ? post.duration / 60 : hoursDiff;
            const rate = loss / hrs;
            if (rate <= 6) sweatRates.push(rate);
          }
        }
      }
    }
    return {
      avgSweatRate: sweatRates.length > 0 ? sweatRates.reduce((a, b) => a + b, 0) / sweatRates.length : null,
      avgPracticeLoss: practiceLosses.length > 0 ? practiceLosses.reduce((a, b) => a + b, 0) / practiceLosses.length : null,
    };
  }, [sortedLogs]);

  // Projected Saturday weight
  const projectedWeight = useMemo(() => {
    if (!avgDriftLoss && !avgPracticeLoss) return null;
    const latestMorning = sortedLogs.find(l => l.type === 'morning' || l.type === 'weigh-in');
    if (!latestMorning) return null;
    const daysLeft = Math.max(0, daysUntilWeighIn);
    if (daysLeft === 0) return latestMorning.weight;
    const dailyLoss = (avgDriftLoss || 0) + (avgPracticeLoss || 0);
    return latestMorning.weight - (dailyLoss * daysLeft);
  }, [sortedLogs, avgDriftLoss, avgPracticeLoss, daysUntilWeighIn]);

  // Status — widen thresholds during loading phase (athletes are intentionally heavy)
  const isLoadingPhase = daysUntilWeighIn >= 3 && daysUntilWeighIn <= 5;
  const onTrackThreshold = isLoadingPhase ? 4 : 1.5;
  const borderlineThreshold = isLoadingPhase ? 6 : 3;
  const status = overTarget <= onTrackThreshold ? 'on-track' : overTarget <= borderlineThreshold ? 'borderline' : 'risk';
  const statusLabel = status === 'on-track' ? 'ON TRACK' : status === 'borderline' ? 'CLOSE' : 'AT RISK';
  const statusColor = status === 'on-track' ? 'text-green-500' : status === 'borderline' ? 'text-yellow-500' : 'text-red-500';
  const statusBg = status === 'on-track' ? 'bg-green-500/15' : status === 'borderline' ? 'bg-yellow-500/15' : 'bg-red-500/15';

  // Dynamic cut day names based on actual weigh-in day (2 days and 1 day before)
  const cutDayNames = useMemo(() => {
    const day2Before = addDays(weighInDate, -2);
    const day1Before = addDays(weighInDate, -1);
    return `${format(day2Before, 'EEE')}–${format(day1Before, 'EEE')}`;
  }, [weighInDate]);

  // Week overview - get Monday of competition week
  const weekDays = useMemo(() => {
    // Find the Monday of the week containing weigh-in (Saturday)
    const satDay = getDay(weighInDate); // 0=Sun, 6=Sat
    const mondayOffset = satDay === 0 ? -6 : -(satDay - 1);
    const weekMonday = addDays(weighInDate, mondayOffset);

    const days: { label: string; date: Date; dateStr: string; daysUntil: number; phase: string; target: number; morningWeight: number | null; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekMonday, i);
      const dStr = format(d, 'yyyy-MM-dd');
      const dUntil = differenceInDays(weighInDate, d);
      const phase = getPhaseForDaysUntil(dUntil);
      const multiplier = getWeightMultiplier(dUntil);
      const target = Math.round(profile.target_weight_class * multiplier * 10) / 10;

      // Find morning weight for this day
      const morningLog = logs.find(l =>
        (l.type === 'morning' || l.type === 'weigh-in') && format(new Date(l.date), 'yyyy-MM-dd') === dStr
      );

      days.push({
        label: format(d, 'EEE').toUpperCase(),
        date: d,
        dateStr: format(d, 'M/d'),
        daysUntil: dUntil,
        phase,
        target,
        morningWeight: morningLog ? morningLog.weight : null,
        isToday: dStr === todayStr,
      });
    }
    return days;
  }, [weighInDate, logs, todayStr, profile.target_weight_class]);

  // Water target for today — uses shared constants (includes MAX_WATER_LOADING_OZ safety cap)
  const waterTarget = useMemo(() => {
    return getWaterTargetOz(daysUntilWeighIn, currentWeight);
  }, [daysUntilWeighIn, currentWeight]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading uppercase italic text-xl">{profile.name || 'Athlete'}{profile.last_name ? ` ${profile.last_name}` : ''}</h1>
            <p className="text-xs text-muted-foreground">
              {profile.target_weight_class} lbs  ·  {PROTOCOL_LABELS[String(profile.protocol)] || 'Unknown'}
            </p>
          </div>
          <div className="text-right space-y-1">
            <span className={cn("text-xs font-bold uppercase px-2 py-1 rounded", statusBg, statusColor)}>
              {statusLabel}
            </span>
            {isLoadingPhase && overTarget > 1.5 && (
              <p className="text-[9px] text-muted-foreground mt-0.5">Loading phase — big drop comes {cutDayNames}</p>
            )}
            <div className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", PHASE_COLORS[currentPhase] || 'bg-gray-500', 'text-white')}>
              {currentPhase} Phase
            </div>
          </div>
        </div>

        {/* Current Weight Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Current</p>
                <p className="text-3xl font-mono font-bold">{currentWeight.toFixed(1)}</p>
                <p className={cn("text-xs font-mono", overTarget > 0 ? "text-red-500" : "text-green-500")}>
                  {overTarget > 0 ? '+' : ''}{overTarget.toFixed(1)} lbs {overTarget > 0 ? 'over' : 'from'} {profile.target_weight_class}
                </p>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Weigh-in</p>
                  {daysUntilWeighIn >= 0 ? (
                    <>
                      <p className="text-2xl font-mono font-bold">{daysUntilWeighIn}</p>
                      <p className="text-[10px] text-muted-foreground">day{daysUntilWeighIn !== 1 ? 's' : ''} left</p>
                    </>
                  ) : (
                    <p className="text-xs text-cyan-500 font-bold">Passed</p>
                  )}
                </div>
                {projectedWeight !== null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Projected</p>
                    <p className={cn("text-sm font-mono font-bold", projectedWeight <= profile.target_weight_class ? "text-green-500" : "text-orange-500")}>
                      {projectedWeight.toFixed(1)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Weigh-in Timeline */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase font-bold mb-3">Today's Timeline</p>
            <div className="grid grid-cols-4 gap-2">
              {/* AM */}
              <TimelineSlot
                label="AM"
                icon={<Sun className="w-3.5 h-3.5 text-yellow-500" />}
                weight={timeline.morning?.weight}
                target={profile.target_weight_class}
              />
              {/* PRE */}
              <TimelineSlot
                label="PRE"
                icon={<ArrowDown className="w-3.5 h-3.5 text-blue-500" />}
                weight={timeline.prePractice?.weight}
                target={profile.target_weight_class}
              />
              {/* POST */}
              <TimelineSlot
                label="POST"
                icon={<ArrowUp className="w-3.5 h-3.5 text-green-500" />}
                weight={timeline.postPractice?.weight}
                target={profile.target_weight_class}
                prevWeight={timeline.prePractice?.weight}
              />
              {/* BED */}
              <TimelineSlot
                label="BED"
                icon={<Moon className="w-3.5 h-3.5 text-purple-500" />}
                weight={timeline.beforeBed?.weight}
                target={profile.target_weight_class}
              />
            </div>

            {/* Practice loss summary if both PRE and POST exist */}
            {timeline.prePractice && timeline.postPractice && (
              <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs">
                <span className="text-muted-foreground">Practice loss</span>
                <span className="font-mono font-bold text-orange-500">
                  -{(timeline.prePractice.weight - timeline.postPractice.weight).toFixed(1)} lbs
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Extra Workouts */}
        {extraWorkouts.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">
                <Dumbbell className="w-3.5 h-3.5 inline mr-1 text-orange-500" />
                {extraWorkouts.length} Extra Workout{extraWorkouts.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {extraWorkouts.map((pair, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono">
                      {pair.before.weight.toFixed(1)}
                      {pair.after ? ` → ${pair.after.weight.toFixed(1)}` : ' → ...'}
                    </span>
                    {pair.after && (
                      <span className="font-mono font-bold text-orange-500">
                        -{(pair.before.weight - pair.after.weight).toFixed(1)} lbs
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Check-ins */}
        {checkIns.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Check-ins</p>
              <div className="space-y-1">
                {checkIns.map((log, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{format(new Date(log.date), 'h:mm a')}</span>
                    <span className="font-mono font-bold">{log.weight.toFixed(1)} lbs</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid - Drift / Practice / Hydration */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <Droplets className="w-4 h-4 text-cyan-500 mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase font-bold">Drift</p>
              {avgDriftLoss !== null ? (
                <p className="text-sm font-mono font-bold">-{avgDriftLoss.toFixed(1)}</p>
              ) : (
                <p className="text-sm font-mono text-muted-foreground">—</p>
              )}
              {avgDriftRate !== null && (
                <p className="text-[8px] text-muted-foreground">{avgDriftRate.toFixed(2)} lbs/hr</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Activity className="w-4 h-4 text-orange-500 mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase font-bold">Practice</p>
              {avgPracticeLoss !== null ? (
                <p className="text-sm font-mono font-bold">-{avgPracticeLoss.toFixed(1)}</p>
              ) : (
                <p className="text-sm font-mono text-muted-foreground">—</p>
              )}
              {avgSweatRate !== null && (
                <p className="text-[8px] text-muted-foreground">{avgSweatRate.toFixed(2)} lbs/hr</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Droplets className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-[9px] text-muted-foreground uppercase font-bold">Water</p>
              {dailyTracking ? (
                <p className="text-sm font-mono font-bold">{dailyTracking.waterConsumed}</p>
              ) : (
                <p className="text-sm font-mono text-muted-foreground">0</p>
              )}
              <p className="text-[8px] text-muted-foreground">/ {waterTarget} oz</p>
            </CardContent>
          </Card>
        </div>

        {/* Week Overview */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground uppercase font-bold mb-3">Week Overview</p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day) => (
                <div
                  key={day.label}
                  className={cn(
                    "text-center rounded-lg p-1.5",
                    day.isToday ? "ring-2 ring-primary bg-primary/10" : "bg-muted/30"
                  )}
                >
                  <p className="text-[9px] font-bold text-muted-foreground">{day.label}</p>
                  <p className="text-[8px] text-muted-foreground">{day.dateStr}</p>
                  <div className={cn("h-1 rounded-full my-1 mx-auto w-4", PHASE_COLORS[day.phase] || 'bg-gray-500')} />
                  <p className="text-[10px] font-mono font-bold">{day.target}</p>
                  {day.morningWeight !== null ? (
                    <p className={cn(
                      "text-[9px] font-mono font-bold",
                      day.morningWeight <= day.target ? "text-green-500" : "text-red-500"
                    )}>
                      {day.morningWeight.toFixed(1)}
                    </p>
                  ) : (
                    <p className="text-[9px] text-muted-foreground/40">—</p>
                  )}
                </div>
              ))}
            </div>
            {projectedWeight !== null && (
              <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs">
                <span className="text-muted-foreground">Projected Sat</span>
                <span className={cn(
                  "font-mono font-bold",
                  projectedWeight <= profile.target_weight_class ? "text-green-500" : "text-orange-500"
                )}>
                  {projectedWeight.toFixed(1)} lbs
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Morning Weight Chart */}
        {chartData.length >= 2 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Morning Weight Trend</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                  />
                  <ReferenceLine
                    y={profile.target_weight_class}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="3 3"
                    label={{ value: `${profile.target_weight_class}`, position: 'right', fontSize: 10, fill: 'hsl(var(--destructive))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center space-y-2 pt-2">
          <button
            onClick={onRefresh}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh · Updated {format(lastRefresh, 'h:mm a')}
          </button>
          <p className="text-[10px] text-muted-foreground/50">
            Powered by SPAR Nutrition
          </p>
        </div>
      </div>
    </div>
  );
}

/** Single slot in the AM/PRE/POST/BED timeline */
function TimelineSlot({
  label,
  icon,
  weight,
  target,
  prevWeight,
}: {
  label: string;
  icon: React.ReactNode;
  weight?: number;
  target: number;
  prevWeight?: number;
}) {
  const hasWeight = weight !== undefined && weight !== null;
  const overTarget = hasWeight ? weight - target : null;

  return (
    <div className={cn(
      "text-center rounded-lg p-2",
      hasWeight ? "bg-muted/50" : "bg-muted/20"
    )}>
      <div className="flex items-center justify-center gap-1 mb-1">
        {icon}
        <span className="text-[9px] font-bold text-muted-foreground">{label}</span>
      </div>
      {hasWeight ? (
        <>
          <p className="text-sm font-mono font-bold">{weight.toFixed(1)}</p>
          {overTarget !== null && (
            <p className={cn("text-[8px] font-mono", overTarget > 0 ? "text-red-400" : "text-green-400")}>
              {overTarget > 0 ? '+' : ''}{overTarget.toFixed(1)}
            </p>
          )}
          {prevWeight !== undefined && prevWeight !== null && (
            <p className="text-[8px] font-mono text-orange-400">
              -{(prevWeight - weight).toFixed(1)}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-mono text-muted-foreground/40">—</p>
      )}
    </div>
  );
}
