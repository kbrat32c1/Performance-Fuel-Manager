import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { authHeaders } from "@/lib/auth-headers";
import { Sparkles, Send, X, RotateCcw, Mic, Square } from "lucide-react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { addDays, format, isYesterday, parseISO } from "date-fns";
import { useTeam } from "@/hooks/use-team";
import { buildWeightChart } from "@/lib/weight-chart";
import { WeightTrendChart } from "@/components/dashboard/weight-trend-chart";
import { nextStepLabel, nextWeighIn } from "@/lib/next-weigh-in";
import { WATER_LOADING_WEIGHT_NOTE } from "@/lib/constants";
import { canShowTodayScale, getTodayScale, targetLabelLeftPct } from "@/lib/today-scale";
import { Input } from "@/components/ui/input";
import { CoachText } from "@/components/coach-text";
import { coachHistory, COACH_REPLY_FAILED, buildAthleteSnapshot, hoursUntilWeighIn, readMinutesToFirstMatch } from "@/lib/coach-context";
import { useHealthKitSync } from "@/hooks/use-healthkit-sync";
import { useAuth } from "@/lib/auth";
import { waterLoadingActive } from "@/lib/constants";

const ADVICE_QUESTION = "Based on my current situation, what's the most helpful thing I should know right now? Be specific with numbers and timing. Keep it encouraging and brief — 2-3 sentences max.";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Unified AI Coach - Calculated guidance (free) + AI chat (opt-in)
 * Shows weight, local calculations, and optional AI advice
 */
export function AiCoachProactive() {
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const speech = useSpeechInput(setInput);
  const [loading, setLoading] = useState(false);
  const [showAiSection, setShowAiSection] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const store = useStore();
  const { user } = useAuth();
  const team = useTeam();
  const { healthData } = useHealthKitSync(user?.id ?? null);
  const {
    profile,
    logs,
    getDaysUntilWeighIn,
    getTimeUntilWeighIn,
    getMacroTargets,
    getTodaysFoods,
    getPhase,
    getStatus,
    getDriftMetrics,
    getDailyTracking,
    isWaterLoadingDay,
    getHydrationTarget,
    calculateTarget,
    getWeekDescentData,
    getExtraWorkoutStats,
  } = store;

  const daysUntil = getDaysUntilWeighIn();

  // Get current weight and latest log type from today's logs
  // Training/hold phase (>2 days out): morning weight is the baseline — before-bed
  // weight is inflated from food/water and isn't representative of actual progress.
  // Cut phase (≤2 days out): every weigh-in matters, use most recent.
  const { currentWeight, latestLogType, hasMorningWeight, weightLoggedAt } = (() => {
    const today = new Date();
    const todayLogs = logs.filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    if (todayLogs.length > 0) {
      const sorted = [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const morningLog = todayLogs.find(l => l.type === 'morning' || l.type === 'weigh-in');
      const isCutPhase = daysUntil <= 2;

      if (isCutPhase) {
        // Cut phase: use most recent weigh-in for real-time tracking
        return { currentWeight: sorted[0].weight, latestLogType: sorted[0].type, hasMorningWeight: !!morningLog, weightLoggedAt: new Date(sorted[0].date) };
      } else {
        // Training/hold phase: use morning weight as baseline
        if (morningLog) {
          return { currentWeight: morningLog.weight, latestLogType: morningLog.type, hasMorningWeight: true, weightLoggedAt: new Date(morningLog.date) };
        }
        // No morning weight today — fall through to profile
      }
    }
    // Fallback: use most recent morning/weigh-in from any day
    const recentMorning = logs
      .filter(l => l.type === 'morning' || l.type === 'weigh-in')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return {
      currentWeight: recentMorning?.weight || profile.currentWeight,
      latestLogType: null as string | null,
      hasMorningWeight: false,
      weightLoggedAt: recentMorning ? new Date(recentMorning.date) : null,
    };
  })();
  const weightIsFromToday = !!weightLoggedAt && weightLoggedAt.toDateString() === new Date().toDateString();
  const weightLoggedLabel = !weightLoggedAt
    ? 'From profile'
    : weightIsFromToday
      ? `Logged ${format(weightLoggedAt, 'h:mm a')}`
      : `${isYesterday(weightLoggedAt) ? 'Yesterday' : format(weightLoggedAt, 'EEE')} ${format(weightLoggedAt, 'h:mm a')}`;

  // What to do next. Weigh-in day has its own official weigh-in flow.
  const loggedToday = new Set(logs.filter(l => new Date(l.date).toDateString() === new Date().toDateString()).map(l => l.type as string));
  const skipPractice = !!getDailyTracking(format(new Date(), 'yyyy-MM-dd'))?.noPractice;
  const nextStep = daysUntil > 0 ? nextWeighIn(loggedToday, skipPractice) : null;
  const weightNotLoggedLabel = weightIsFromToday ? null : loggedToday.size > 0 ? "Today's morning weight not logged" : "Today's weight not logged";
  const targetWeight = profile.targetWeightClass;
  const weightToLose = Math.max(0, currentWeight - targetWeight);
  const isAtWeight = weightToLose <= 0;

  // Calculate weigh-in timing
  const hour = new Date().getHours();
  const [wiH] = (profile.weighInTime || '07:00').split(':').map(Number);
  const weighInHour = wiH || 7;

  // Format an hour (0-23) as a readable time string
  const formatHour = (h: number): string => {
    const wrapped = ((h % 24) + 24) % 24;
    if (wrapped === 0) return '12am';
    if (wrapped === 12) return '12pm';
    return wrapped > 12 ? `${wrapped - 12}pm` : `${wrapped}am`;
  };

  // Get calculated insights for display (LOCAL - NO API COST)
  // Uses the store's phase-aware projection system with EMA recency-weighted data.
  // Loading days (3+ out): projects from morning weight using net daily loss.
  // Cut days (1-2 out): projects from most recent weigh-in using remaining losses.
  const getInsights = useCallback(() => {
    try {
      const descentData = getWeekDescentData();
      const extraStats = getExtraWorkoutStats();
      // Priority: extra workout sweat rate (actual data) > practice sweat rate > extra avg loss
      const sweatRate = extraStats.avgSweatRateOzPerHr ?? descentData.avgSweatRateOzPerHr ?? null;
      const expectedDrift = descentData.avgOvernightDrift != null ? Math.max(0, descentData.avgOvernightDrift) : null;
      // Extra work is only suggested when the projection rests on several real weigh-in pairs.
      const projectionReliable = descentData.confidence?.reliable === true;

      // Use the store's projection to determine how much is covered naturally
      // projectedSaturday already accounts for phase-specific drift, practice loss,
      // loading vs cut days, and EMA recency weighting
      const projected = descentData.projectedSaturday;
      const projectedGap = projected !== null ? projected - targetWeight : weightToLose;

      // Use the athlete's actual sweat rate data directly — no guessed penalties.
      // Their logged practice/extra workout data already reflects real-world loss rates.
      const adjustedSweatRate = sweatRate;

      const isOnTrack = isAtWeight || (projected !== null && projected <= targetWeight);

      return { expectedDrift, sweatRate, adjustedSweatRate, isOnTrack, projectedGap, projectionReliable };
    } catch {
      return { expectedDrift: null, sweatRate: null, adjustedSweatRate: null, isOnTrack: false, projectedGap: weightToLose, projectionReliable: false };
    }
  }, [weightToLose, targetWeight, daysUntil, hour, weighInHour, isAtWeight, getWeekDescentData, getExtraWorkoutStats]);

  const insights = getInsights();

  // Build context for AI (only used when user asks)
  const buildContext = useCallback(() => {
    const ctx: Record<string, any> = {
      currentPage: '/dashboard',
      name: profile.name,
      currentWeight,
      targetWeightClass: targetWeight,
      daysUntilWeighIn: daysUntil,
      weightToLose: weightToLose.toFixed(1),
      protocol: profile.protocol,
      waterLoading: waterLoadingActive(profile),
      phase: getPhase(),
      status: getStatus().status,
    };

    try { ctx.macroTargets = getMacroTargets(); } catch {}
    try {
      const foods = getTodaysFoods();
      ctx.todaysFoods = {
        carbsLabel: foods.carbsLabel,
        proteinLabel: foods.proteinLabel,
        avoid: foods.avoid?.slice(0, 5),
      };
    } catch {}

    try {
      const today = new Date();
      const todayLogs = logs.filter(l => {
        const ld = new Date(l.date);
        return ld.getFullYear() === today.getFullYear() &&
          ld.getMonth() === today.getMonth() &&
          ld.getDate() === today.getDate();
      });
      if (todayLogs.length > 0) {
        ctx.todaysWeighIns = todayLogs.map(l => ({
          type: l.type,
          weight: l.weight,
          time: new Date(l.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        }));
      }
    } catch {}

    try { ctx.todayTargetWeight = calculateTarget(); } catch {}
    try {
      const drift = getDriftMetrics();
      if (drift.overnight !== null) ctx.avgOvernightDrift = drift.overnight.toFixed(1);
      if (drift.session !== null) ctx.avgPracticeLoss = drift.session.toFixed(1);
    } catch {}

    try {
      const dateKey = format(new Date(), 'yyyy-MM-dd');
      const tracking = getDailyTracking(dateKey);
      if (tracking) {
        ctx.dailyTracking = {
          waterConsumed: tracking.waterConsumed || 0,
          carbsConsumed: tracking.carbsConsumed || 0,
          proteinConsumed: tracking.proteinConsumed || 0,
        };
      }
    } catch {}

    try {
      const hydration = getHydrationTarget();
      if (hydration) ctx.hydrationTarget = hydration;
    } catch {}

    try {
      ctx.athleteSnapshot = buildAthleteSnapshot({
        logs,
        foodLog: getDailyTracking(format(new Date(), 'yyyy-MM-dd'))?.foodLog,
        health: healthData,
        bodyFatPercent: profile.bodyFatPercent,
        weighInDate: profile.weighInDate,
        weighInTime: profile.weighInTime,
        weighInCleared: profile.weighInCleared,
        minutesToFirstMatch: readMinutesToFirstMatch(daysUntil, null),
      });
    } catch {}

    ctx.calculatedInsights = {
      timeUntilWeighIn: daysUntil >= 0 ? getTimeUntilWeighIn() : null,
      hoursUntilWeighIn: profile.weighInCleared ? null : hoursUntilWeighIn(profile.weighInDate, profile.weighInTime),
      weightToLose: weightToLose.toFixed(1),
      isOnTrack: insights.isOnTrack,
      projectionReliable: insights.projectionReliable,
      expectedOvernightDrift: insights.expectedDrift?.toFixed(1) ?? null,
    };

    return ctx;
  }, [profile, logs, currentWeight, targetWeight, daysUntil, weightToLose, isAtWeight, insights, getPhase, getStatus, getMacroTargets, getTodaysFoods, calculateTarget, getDriftMetrics, getDailyTracking, getHydrationTarget, getTimeUntilWeighIn]);

  // Fetch AI advice (only when user requests)
  const fetchAiAdvice = useCallback(async () => {
    setLoading(true);
    try {
      const context = buildContext();
      const res = await fetch(apiUrl("/api/ai/coach"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          question: ADVICE_QUESTION,
          context,
        }),
      });

      if (!res.ok) throw new Error("AI unavailable");

      const data = await res.json();
      setAiMessage(data.recommendation || "Stay focused on your cut.");
    } catch {
      setAiMessage("Couldn't get AI advice right now. Try again later.");
    } finally {
      setLoading(false);
    }
  }, [buildContext]);

  // Send chat message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      const context = buildContext();
      const res = await fetch(apiUrl("/api/ai/coach"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          question: userMessage,
          context,
          history: coachHistory(messages, aiMessage && !aiMessage.startsWith("Couldn't get AI") ? { question: ADVICE_QUESTION, answer: aiMessage } : null),
        }),
      });

      if (!res.ok) throw new Error("AI unavailable");

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.recommendation }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: COACH_REPLY_FAILED }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, buildContext, messages, aiMessage]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opening AI section
  useEffect(() => {
    if (showAiSection && !aiMessage) {
      inputRef.current?.focus();
    }
  }, [showAiSection, aiMessage]);

  // Don't render for SPAR General users or if no profile (SPAR Competition gets coach)
  if (!profile.currentWeight || !profile.targetWeightClass || profile.protocol === '5') {
    return null;
  }

  // The same target the rest of the app and the coach use for today.
  const todayTarget = calculateTarget();
  const weighInTimePassed = daysUntil === 0 && getTimeUntilWeighIn() === 'WEIGH-IN TIME';
  const todayScale = canShowTodayScale({ daysUntil, weighInTimePassed, hasLoggedWeight: weightLoggedAt !== null })
    ? getTodayScale({
        weight: currentWeight,
        weightClass: targetWeight,
        target: todayTarget,
        isComparable: latestLogType === 'morning' || latestLogType === 'weigh-in',
      })
    : null;
  const targetDelta = todayScale?.targetDelta ?? null;

  // Once there are a few morning weights, the chart takes the scale's place.
  const knownWeighIns = [
    ...logs.filter(l => l.type === 'weigh-in').map(l => new Date(l.date)),
    ...(team.membership?.events ?? [])
      .filter(e => !team.membership?.skipped.includes(e.id))
      .map(e => addDays(parseISO(e.eventDate), e.days - 1)),
  ];
  // Unlike the scale, the chart doesn't depend on still being above class.
  const weightChart = canShowTodayScale({ daysUntil, weighInTimePassed, hasLoggedWeight: weightLoggedAt !== null }) && !profile.weighInCleared
    ? buildWeightChart({
        today: new Date(),
        logs,
        weighInDate: new Date(profile.weighInDate),
        weightClass: targetWeight,
        protocol: profile.protocol,
        waterLoading: waterLoadingActive(profile),
        knownWeighIns,
      })
    : null;
  const statusPill = isAtWeight
    ? { label: 'At weight', className: 'bg-chart-5/10 text-chart-5' }
    : targetDelta === null
      ? null
      : Math.abs(targetDelta) < 0.05
        ? { label: "At today's target", className: 'bg-muted text-foreground' }
        : targetDelta > 0
          ? { label: `${targetDelta.toFixed(1)} over target`, className: 'bg-chart-3/15 text-chart-3' }
          : { label: `${Math.abs(targetDelta).toFixed(1)} under target`, className: 'bg-muted text-foreground' };
  const showLbsToClass = !isAtWeight && daysUntil >= 0 && !weighInTimePassed;
  const showDetailedGuidance = !isAtWeight && daysUntil >= 0 && daysUntil <= 7;

  // Use store's precise countdown (matches Week tab)
  const timeUntilWeighIn = daysUntil >= 0 ? getTimeUntilWeighIn() : null;
  const showCountdown = !!timeUntilWeighIn && timeUntilWeighIn !== 'WEIGH-IN TIME';

  // ─── Coaching insight ───
  // Uses PROJECTED GAP (not raw deficit) — sleep drift and practice losses are accounted for.
  // Returns a React node with inline-highlighted key numbers for visual hierarchy.
  // No arbitrary directives — only specific, data-driven advice.
  type CoachingStatus = 'on-track' | 'behind' | 'at-weight';

  const getCoachingInsight = (): { status: CoachingStatus; node: React.ReactNode; isLogPrompt?: boolean } | null => {
    if (isAtWeight) return {
      status: 'at-weight',
      node: <>You're at weight. Ready for competition.</>,
    };
    if (daysUntil < 0) return null;

    const gap = insights.projectedGap;
    const onTrack = insights.isOnTrack;

    // Highlighted number span helper
    const hl = (text: string, color?: string) => (
      <span className={cn("font-semibold", color || "text-foreground")}>{text}</span>
    );

    // Mid-day weigh-in context: show "At X.X" prefix for non-routine logs
    // Skip for morning/before-bed since those are baseline readings the card already shows
    const isMidDayLog = latestLogType && !['morning', 'before-bed'].includes(latestLogType);
    const checkPrefix = isMidDayLog ? <>At {hl(currentWeight.toFixed(1))}, </> : null;

    // Context-aware loss description: only mention what's still remaining
    const descentDataForText = getWeekDescentData();
    const remainingComp = descentDataForText.todayRemainingComponents;
    const hasSleepRemaining = !remainingComp || remainingComp.sleep > 0.05;
    const hasPracticeRemaining = remainingComp ? remainingComp.practice > 0.05 : true;
    const lossDescription = hasSleepRemaining && hasPracticeRemaining
      ? 'sleep drift and practice'
      : hasSleepRemaining ? 'sleep drift' : hasPracticeRemaining ? 'practice' : 'remaining losses';

    // Competition day
    if (daysUntil === 0) {
      if (weightToLose <= 0.5) return {
        status: 'on-track',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go — almost there. Stay warm and calm until weigh-in.</>,
      };
      return {
        status: 'behind',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go. Stay warm and keep moving light.</>,
      };
    }

    // Too few weigh-in pairs: say what's measured and what to log; no pace verdict or extra work.
    if (daysUntil >= 1 && daysUntil <= 5 && !insights.projectionReliable) {
      return {
        status: 'on-track',
        isLogPrompt: true,
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go, {hl(daysUntil + (daysUntil === 1 ? ' day' : ' days'))} out. Log before bed, and before and after practice, so we can project from your own numbers.</>,
      };
    }

    // Day before (cut day)
    if (daysUntil === 1) {
      if (onTrack) {
        return {
          status: 'on-track',
          node: <>{checkPrefix}On pace — {lossDescription} cover{hasSleepRemaining && !hasPracticeRemaining ? 's' : ''} it.</>,
        };
      }
      if (gap > 0) {
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-chart-4')} over after {lossDescription}. Talk to your coach about your options.</>,
        };
      }
      return {
        status: 'on-track',
        node: <>{checkPrefix}On pace — {lossDescription} should handle it.</>,
      };
    }

    // 2 days out (prep day)
    if (daysUntil === 2) {
      if (onTrack) {
        return {
          status: 'on-track',
          node: <>{checkPrefix}On pace — {hl(weightToLose.toFixed(1) + ' lbs')} to go. {hasSleepRemaining && hasPracticeRemaining ? 'Sleep drift and practice cover' : lossDescription + ' cover' + (hasSleepRemaining && !hasPracticeRemaining ? 's' : '')} it.</>,
        };
      }
      if (gap > 0) {
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-chart-4')} over. Talk to your coach about your options.</>,
        };
      }
      return {
        status: 'behind',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to cut with {hl('2 days')} left.</>,
      };
    }

    // 3-5 days out (loading phase)
    if (daysUntil >= 3 && daysUntil <= 5) {
      if (onTrack) {
        return {
          status: 'on-track',
          node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go with {hl(daysUntil + ' days')} left — on schedule.</>,
        };
      }
      if (gap > 0) {
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-chart-4')} over with {hl(daysUntil + ' days')} to go. Talk to your coach about your options.</>,
        };
      }
      return {
        status: 'on-track',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go, {hl(daysUntil + ' days')} out. On schedule.</>,
      };
    }

    // 6-7 days out
    if (daysUntil >= 6) {
      return {
        status: 'on-track',
        node: insights.projectionReliable
          ? <>{checkPrefix}Estimated {hl((targetWeight + gap).toFixed(1) + ' lbs')} at weigh-in, based on your recent logs.</>
          : <>{checkPrefix}Not enough logged weights yet for a weigh-in estimate. Keep logging morning and practice weights.</>,
      };
    }

    return null;
  };

  const fullInsight = showDetailedGuidance ? getCoachingInsight() : null;
  // The button says what to log. Don't repeat it, or judge a weight that isn't today's.
  const coachingInsight = fullInsight && nextStep && (!weightIsFromToday || fullInsight.isLogPrompt) ? null : fullInsight;



  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden bg-card border border-border">
        {/* Weight, today's target and class on one scale */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-1">
                <span className={cn("font-heading text-[64px] font-bold leading-[0.9] tabular-nums", weightIsFromToday ? "text-foreground" : "text-foreground/60")}>
                  {currentWeight.toFixed(1)}
                </span>
                <span className="font-heading text-xl font-semibold text-muted-foreground">lbs</span>
              </div>
              <span className="mt-1.5 block text-xs text-muted-foreground">
                {weightLoggedLabel}
                {weightNotLoggedLabel && <> · <span className="font-semibold text-primary">{weightNotLoggedLabel}</span></>}
              </span>
              {isWaterLoadingDay() && targetDelta !== null && targetDelta > 0 && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{WATER_LOADING_WEIGHT_NOTE}</span>
              )}
            </div>
            {statusPill && (
              <span className={cn("mt-1 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-medium", statusPill.className)}>
                {statusPill.label}
              </span>
            )}
          </div>

          {/* The one thing to do next */}
          {nextStep && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: nextStep } }))}
                className="w-full min-h-12 rounded-xl bg-primary px-4 py-3 text-[15px] font-bold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                {nextStepLabel(nextStep)}
              </button>
            </div>
          )}

          {weightChart ? (
            <WeightTrendChart chart={weightChart} weightClass={targetWeight} />
          ) : todayScale && (
            <div
              role="img"
              aria-label={`${currentWeight.toFixed(1)} pounds. ${todayScale.targetPct !== null ? `Today's target ${todayTarget} pounds. ` : ''}Class ${targetWeight} pounds.`}
              className="px-2"
            >
              <div className="relative mt-6 h-1 rounded-full bg-border">
                <div className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${todayScale.weightPct}%` }} />
                {todayScale.targetPct !== null && (
                  <div className="absolute -top-1 h-3 w-0.5 -translate-x-1/2 bg-muted-foreground" style={{ left: `${todayScale.targetPct}%` }} />
                )}
                <div className="absolute -top-1 right-0 h-3 w-0.5 bg-primary" />
                <div
                  className="absolute -top-[7px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] border-card bg-primary"
                  style={{ left: `${todayScale.weightPct}%` }}
                />
              </div>
              <div className="relative mt-2.5 h-[34px]">
                {todayScale.targetPct !== null && (
                  <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${targetLabelLeftPct(todayScale.targetPct)}%` }}>
                    <span className="block font-heading text-lg font-semibold leading-none tabular-nums text-foreground">{todayTarget}</span>
                    <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">Today's target</span>
                  </div>
                )}
                <div className="absolute right-0 top-0 text-right">
                  <span className="block font-heading text-lg font-semibold leading-none tabular-nums text-primary">{targetWeight}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">Class</span>
                </div>
              </div>
            </div>
          )}

          {(showLbsToClass || showCountdown) && (
            <div className="mt-3 grid grid-cols-2 border-t border-border pt-3">
              <div>
                {showLbsToClass && (
                  <>
                    <span className="block font-heading text-2xl font-semibold leading-none tabular-nums text-foreground">{weightToLose.toFixed(1)} lbs</span>
                    <span className="mt-1 block text-xs text-muted-foreground">to class</span>
                  </>
                )}
              </div>
              <div className="text-right">
                {showCountdown && (
                  <>
                    <span className="block font-heading text-2xl font-semibold leading-none tabular-nums text-foreground">{timeUntilWeighIn}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">until weigh-in</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Daily Insight Card — clean sentence with highlighted numbers */}
        {coachingInsight && !insightDismissed && (
          <div className="mx-3 mb-3 rounded-lg overflow-hidden border border-border/50 bg-muted/30">
            <div className="flex items-start gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground/70 leading-relaxed">
                  {coachingInsight.node}
                </p>
              </div>
              <button
                onClick={() => setInsightDismissed(true)}
                className="shrink-0 p-1 -mr-1 -mt-0.5 rounded-full text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                aria-label="Dismiss insight"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Replay insight button — shown when dismissed */}
        {coachingInsight && insightDismissed && (
          <div className="px-3 pb-2">
            <button
              onClick={() => setInsightDismissed(false)}
              className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Show insight
            </button>
          </div>
        )}

        {/* AI Section Toggle */}
        {!showAiSection ? (
          <button
            onClick={() => setShowAiSection(true)}
            className="w-full px-4 py-3 border-t border-border flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask AI Coach</span>
          </button>
        ) : (
          <div className="border-t border-border">
            {/* AI Header */}
            <div className="px-4 py-2 flex items-center justify-between bg-primary/5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-xs font-bold text-primary uppercase tracking-wide">AI Coach</span>
              </div>
              <button
                aria-label="Close AI coach"
                onClick={() => { setShowAiSection(false); setMessages([]); setAiMessage(null); }}
                className="p-1 rounded-full relative after:absolute after:-inset-2.5 hover:bg-primary/20 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>

            {/* AI Content */}
            <div className="px-4 py-3">
              {/* Quick AI advice button */}
              {!aiMessage && messages.length === 0 && (
                <button
                  onClick={fetchAiAdvice}
                  disabled={loading}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm font-medium mb-3 transition-colors",
                    loading
                      ? "bg-primary/20 text-primary"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    "Get AI advice for right now"
                  )}
                </button>
              )}

              {/* AI quick advice response */}
              {aiMessage && messages.length === 0 && (
                <div className="mb-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <CoachText text={aiMessage} className="text-sm text-foreground" />
                </div>
              )}

              {/* Chat messages */}
              {messages.length > 0 && (
                <div className="max-h-[50vh] overflow-y-auto mb-3 space-y-2">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "text-sm rounded-lg px-3 py-2",
                      msg.role === 'user'
                        ? "bg-primary/10 text-primary ml-8"
                        : "bg-muted/50 mr-8"
                    )}>
                      {msg.role === 'assistant' ? <CoachText text={msg.content} /> : msg.content}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Thinking...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Chat input */}
              {speech.error && <p role="alert" className="mb-1 text-xs text-destructive">{speech.error}</p>}
              <form onSubmit={(e) => { e.preventDefault(); if (!speech.listening) sendMessage(); }} className="flex gap-2">
                <Input aria-label="Message the AI coach"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 h-9 text-sm"
                  disabled={loading}
                />
                {speech.supported && (
                  <button
                    type="button"
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    disabled={loading}
                    aria-label={speech.listening ? "Stop dictation" : "Speak your question"}
                    aria-pressed={speech.listening}
                    className={cn(
                      "h-9 px-3 rounded-lg transition-colors",
                      speech.listening ? "bg-red-500 text-white animate-pulse" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {speech.listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <button
                  aria-label="Send message"
                  type="submit"
                  disabled={!input.trim() || loading || speech.listening}
                  className={cn(
                    "h-9 px-3 rounded-lg relative after:absolute after:-inset-1 transition-colors",
                    input.trim() && !loading
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
