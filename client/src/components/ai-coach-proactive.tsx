import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, Send, X, Scale, Dumbbell, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";

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
  const [loading, setLoading] = useState(false);
  const [showAiSection, setShowAiSection] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const store = useStore();
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
    getHydrationTarget,
    calculateTarget,
    getWeekDescentData,
    getExtraWorkoutStats,
  } = store;

  const daysUntil = getDaysUntilWeighIn();

  // Get current weight and latest log type from today's logs
  const { currentWeight, latestLogType } = (() => {
    const today = new Date();
    const todayLogs = logs.filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    if (todayLogs.length > 0) {
      const sorted = [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { currentWeight: sorted[0].weight, latestLogType: sorted[0].type };
    }
    return { currentWeight: profile.currentWeight, latestLogType: null as string | null };
  })();
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
      const sweatRate = extraStats.avgSweatRateOzPerHr ?? descentData.avgSweatRateOzPerHr ?? extraStats.avgLoss ?? null;
      const expectedDrift = descentData.avgOvernightDrift ? Math.abs(descentData.avgOvernightDrift) : null;

      // Use the store's projection to determine how much is covered naturally
      // projectedSaturday already accounts for phase-specific drift, practice loss,
      // loading vs cut days, and EMA recency weighting
      const projected = descentData.projectedSaturday;
      const projectedGap = projected !== null ? projected - targetWeight : weightToLose;

      // Fluid allowance — based on projection buffer
      let fluidAllowance: { oz: number; cutoffTime: string } | null = null;
      const buffer = projected !== null ? targetWeight - projected : -weightToLose;
      if (weightToLose > 0) {
        if (daysUntil === 0) {
          // Competition day — no fluids until after weigh-in
          fluidAllowance = { oz: 0, cutoffTime: 'weigh-in' };
        } else if (buffer >= 0) {
          // Projected to make weight — some fluid room
          const allowanceOz = Math.floor(buffer * 16); // 1 lb ≈ 16 oz
          let cutoffTime: string;
          if (daysUntil === 1) {
            const cutoffH = (weighInHour + 24 - 12) % 24;
            cutoffTime = formatHour(cutoffH);
          } else if (daysUntil === 2) {
            cutoffTime = formatHour(weighInHour + 24 - 8);
          } else {
            cutoffTime = 'bedtime';
          }
          fluidAllowance = { oz: Math.max(0, allowanceOz), cutoffTime };
        } else {
          // Projected over target — need to cut fluids
          fluidAllowance = { oz: 0, cutoffTime: daysUntil <= 1 ? 'now' : formatHour(weighInHour + 24 - 12) };
        }
      }

      // Food guidance — deficit-aware, using weigh-in time for cutoffs
      // Gut content is ~2-5 lbs and takes 12-24h to empty
      let foodGuidance: { maxLbs: number; lastMealTime: string } | null = null;
      if (weightToLose > 0) {
        if (daysUntil === 0) {
          foodGuidance = { maxLbs: 0, lastMealTime: 'after weigh-in' };
        } else if (daysUntil === 1) {
          const cutoffH = (weighInHour + 24 - 12) % 24;
          if (weightToLose >= 2 || projectedGap > 0.5) {
            foodGuidance = { maxLbs: 0, lastMealTime: 'after weigh-in' };
          } else {
            foodGuidance = { maxLbs: 0.5, lastMealTime: formatHour(cutoffH) };
          }
        } else if (daysUntil === 2) {
          if (weightToLose >= 4 || projectedGap > 2) {
            foodGuidance = { maxLbs: 0.5, lastMealTime: formatHour(weighInHour + 24 - 14) };
          } else if (weightToLose >= 2 || projectedGap > 0.5) {
            foodGuidance = { maxLbs: 1.0, lastMealTime: formatHour(weighInHour + 24 - 10) };
          } else {
            foodGuidance = { maxLbs: 1.5, lastMealTime: formatHour(weighInHour + 24 - 8) };
          }
        } else {
          // 3+ days out — eat normally but track
          if (weightToLose >= 5) {
            foodGuidance = { maxLbs: 1.5, lastMealTime: formatHour(weighInHour + 24 - 10) };
          } else {
            foodGuidance = { maxLbs: 2.5, lastMealTime: formatHour(weighInHour + 24 - 8) };
          }
        }
      }

      // Use the athlete's actual sweat rate data directly — no guessed penalties.
      // Their logged practice/extra workout data already reflects real-world loss rates.
      const adjustedSweatRate = sweatRate;

      // Workout guidance — realistic sessions: 30, 45, or 60 min zone 2
      // Picks session length based on projected gap size
      let workoutGuidance: { minutes: number; lossLbs: number; unlocksOz: number } | null = null;
      if (weightToLose > 0 && projectedGap > 0 && adjustedSweatRate && adjustedSweatRate > 0) {
        // Pick session length: small gap = 30 min, medium = 45, large = 60
        const lossAt30 = adjustedSweatRate * (30 / 60);
        const sessionMinutes = projectedGap <= lossAt30 * 1.2 ? 30
          : projectedGap <= adjustedSweatRate * 0.75 ? 45
          : 60;
        const sessionLossLbs = adjustedSweatRate * (sessionMinutes / 60);
        const unlocksOz = Math.floor(sessionLossLbs * 16);
        workoutGuidance = { minutes: sessionMinutes, lossLbs: sessionLossLbs, unlocksOz };
      }

      // Tradeoff hint: if food/fluids are restricted, show what a light workout buys you
      // Includes the COST — glycogen takes 4-6h to refill 70-80%, and extra work
      // this close to competition depletes the glycogen tank
      let tradeoffHint: string | null = null;
      if (daysUntil >= 1 && daysUntil <= 2 && weightToLose > 0 && adjustedSweatRate && adjustedSweatRate > 0) {
        if (fluidAllowance && fluidAllowance.oz === 0 && projectedGap > 0) {
          const mins30loss = adjustedSweatRate * (30 / 60);
          const ozUnlocked = Math.floor(mins30loss * 16);
          if (ozUnlocked > 0) {
            tradeoffHint = `30 min zone 2 = ~${ozUnlocked} oz fluids (costs glycogen)`;
          }
        } else if (foodGuidance && foodGuidance.maxLbs === 0 && buffer < 0) {
          const mins30loss = adjustedSweatRate * (30 / 60);
          if (mins30loss >= 0.3) {
            tradeoffHint = `30 min zone 2 = light snack option (4-6h to refuel)`;
          }
        }
      }

      // On track = projection says we make weight without extra work
      const needsExtraWork = workoutGuidance !== null;
      const isOnTrack = isAtWeight || (projected !== null && projected <= targetWeight && !needsExtraWork);

      return { fluidAllowance, workoutGuidance, foodGuidance, expectedDrift, sweatRate, adjustedSweatRate, isOnTrack, projectedGap, tradeoffHint };
    } catch {
      return { fluidAllowance: null, workoutGuidance: null, foodGuidance: null, expectedDrift: null, sweatRate: null, adjustedSweatRate: null, isOnTrack: false, projectedGap: weightToLose, tradeoffHint: null };
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

    // Dehydration level for AI context
    const dehydrationPct = targetWeight > 0 ? ((currentWeight - targetWeight) / currentWeight) * 100 : 0;

    ctx.calculatedInsights = {
      timeUntilWeighIn: daysUntil >= 0 ? getTimeUntilWeighIn() : null,
      weightToLose: weightToLose.toFixed(1),
      isOnTrack: insights.isOnTrack,
      fluidAllowance: insights.fluidAllowance,
      workoutGuidance: insights.workoutGuidance,
      foodGuidance: insights.foodGuidance,
      expectedOvernightDrift: insights.expectedDrift?.toFixed(1) ?? null,
      dehydrationPct: dehydrationPct.toFixed(1),
      tradeoffHint: insights.tradeoffHint,
    };

    return ctx;
  }, [profile, logs, currentWeight, targetWeight, daysUntil, weightToLose, isAtWeight, insights, getPhase, getStatus, getMacroTargets, getTodaysFoods, calculateTarget, getDriftMetrics, getDailyTracking, getHydrationTarget, getTimeUntilWeighIn]);

  // Fetch AI advice (only when user requests)
  const fetchAiAdvice = useCallback(async () => {
    setLoading(true);
    try {
      const context = buildContext();
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Based on my current situation, what's the most helpful thing I should know right now? Be specific with numbers and timing. Keep it encouraging and brief — 2-3 sentences max.",
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
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, context }),
      });

      if (!res.ok) throw new Error("AI unavailable");

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.recommendation }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Try again?" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, buildContext]);

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

  // Don't render for SPAR users or if no profile
  if (!profile.currentWeight || !profile.targetWeightClass || profile.protocol === '5') {
    return null;
  }

  // Status color: green = on track, orange = behind, red = critical
  const statusColor = isAtWeight ? 'green' :
    insights.isOnTrack ? 'green' :
    (weightToLose > 3 && daysUntil <= 1) ? 'red' :
    'orange';
  const showDetailedGuidance = !isAtWeight && daysUntil >= 0 && daysUntil <= 7;

  // Use store's precise countdown (matches Week tab)
  const timeUntilWeighIn = daysUntil >= 0 ? getTimeUntilWeighIn() : null;

  // ─── Coaching insight ───
  // Uses PROJECTED GAP (not raw deficit) — metabolism, overnight drift, and practice losses are accounted for.
  // Returns a React node with inline-highlighted key numbers for visual hierarchy.
  // No arbitrary directives — only specific, data-driven advice.
  type CoachingStatus = 'on-track' | 'behind' | 'at-weight';

  const getCoachingInsight = (): { status: CoachingStatus; node: React.ReactNode } | null => {
    if (isAtWeight) return {
      status: 'at-weight',
      node: <>You're at weight. Stay fueled and hydrated for competition.</>,
    };
    if (daysUntil < 0) return null;

    const gap = insights.projectedGap;
    const onTrack = insights.isOnTrack;
    const fluids = insights.fluidAllowance;
    const food = insights.foodGuidance;
    const sweatLbsHr = insights.adjustedSweatRate;

    // Highlighted number span helper
    const hl = (text: string, color?: string) => (
      <span className={cn("font-semibold", color || "text-foreground")}>{text}</span>
    );

    const formatTime = (totalMinutes: number) =>
      totalMinutes >= 60
        ? `~${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60 > 0 ? `${totalMinutes % 60}m` : ''}`.trim()
        : `~${totalMinutes} min`;

    // Mid-day weigh-in context: show "At X.X" prefix for non-routine logs
    // Skip for morning/before-bed since those are baseline readings the card already shows
    const isMidDayLog = latestLogType && !['morning', 'before-bed'].includes(latestLogType);
    const checkPrefix = isMidDayLog ? <>At {hl(currentWeight.toFixed(1))}, </> : null;

    // Competition day
    if (daysUntil === 0) {
      if (weightToLose <= 0.5) return {
        status: 'on-track',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go — almost there. Stay warm and calm until weigh-in.</>,
      };
      return {
        status: 'behind',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go. Stay warm, keep moving light, and stay calm.</>,
      };
    }

    // Day before (cut day)
    if (daysUntil === 1) {
      if (onTrack) {
        if (fluids && fluids.oz > 0) {
          return {
            status: 'on-track',
            node: <>{checkPrefix}On pace — metabolism, drift, and practice cover it. You can sip up to {hl(fluids.oz + ' oz')} before {hl(fluids.cutoffTime)}.</>,
          };
        }
        return {
          status: 'on-track',
          node: <>{checkPrefix}On pace — metabolism, drift, and practice should get you there. Let the protocol work.</>,
        };
      }
      if (gap > 0) {
        const totalMinutes = sweatLbsHr && sweatLbsHr > 0 ? Math.round((gap / sweatLbsHr) * 60) : null;
        if (totalMinutes) {
          return {
            status: 'behind',
            node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over after metabolism, drift, and practice. At your sweat rate, {hl(formatTime(totalMinutes))} of extra work needed to make weight.</>,
          };
        }
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over after metabolism, drift, and practice. Extra work needed to make weight.</>,
        };
      }
      return {
        status: 'on-track',
        node: <>{checkPrefix}On pace — let the protocol work. Metabolism, drift, and practice should handle it.</>,
      };
    }

    // 2 days out (prep day)
    if (daysUntil === 2) {
      if (onTrack) {
        const foodNote = food && food.maxLbs > 0
          ? <>Keep meals under {hl(food.maxLbs + ' lbs')} by {hl(food.lastMealTime)}.</>
          : <>Low-fiber meals to let the gut empty.</>;
        const fluidNote = fluids && fluids.oz > 0
          ? <> {hl(fluids.oz + ' oz')} fluids OK before {hl(fluids.cutoffTime)}.</>
          : null;
        return {
          status: 'on-track',
          node: <>{checkPrefix}On pace. {foodNote}{fluidNote}</>,
        };
      }
      if (gap > 0) {
        const totalMinutes = sweatLbsHr && sweatLbsHr > 0 ? Math.round((gap / sweatLbsHr) * 60) : null;
        const foodNote = food ? <>Keep food under {hl(food.maxLbs + ' lbs')}.</> : <>Keep meals light.</>;
        if (totalMinutes) {
          return {
            status: 'behind',
            node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over. At your sweat rate, {hl(formatTime(totalMinutes))} of extra work needed to make weight. {foodNote}</>,
          };
        }
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over. {foodNote} Extra work needed to make weight.</>,
        };
      }
      return {
        status: 'behind',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to cut. Low-fiber meals, sip fluids carefully.</>,
      };
    }

    // 3-5 days out (loading phase)
    if (daysUntil >= 3 && daysUntil <= 5) {
      if (onTrack) {
        return {
          status: 'on-track',
          node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go with {hl(daysUntil + ' days')} left — on schedule. Eat clean, train normally.</>,
        };
      }
      if (gap > 0) {
        const totalMinutes = sweatLbsHr && sweatLbsHr > 0 ? Math.round((gap / sweatLbsHr) * 60) : null;
        if (totalMinutes) {
          return {
            status: 'behind',
            node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over. At your sweat rate, {hl(formatTime(totalMinutes))} of extra work over the next {hl(daysUntil + ' days')} needed to make weight.</>,
          };
        }
        return {
          status: 'behind',
          node: <>{checkPrefix}Projected {hl(gap.toFixed(1) + ' lbs', 'text-orange-500')} over. {hl(daysUntil + ' days')} to make weight — tighten up meals and push in practice.</>,
        };
      }
      return {
        status: 'on-track',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go, {hl(daysUntil + ' days')} out. Stay disciplined with meals.</>,
      };
    }

    // 6-7 days out
    if (daysUntil >= 6) {
      return {
        status: 'on-track',
        node: <>{checkPrefix}{hl(weightToLose.toFixed(1) + ' lbs')} to go. Plenty of time — focus on clean eating and solid practices.</>,
      };
    }

    return null;
  };

  const coachingInsight = showDetailedGuidance ? getCoachingInsight() : null;

  // Determine contextual quick-action based on coaching state
  const getQuickAction = (): { label: string; icon: 'scale' | 'workout'; type: string } | null => {
    if (isAtWeight || daysUntil < 0) return null;
    // If behind (projected gap > 0), offer "Log Workout"
    if (!insights.isOnTrack && insights.projectedGap > 0) {
      return { label: 'Log Workout', icon: 'workout', type: 'extra-workout' };
    }
    // Otherwise suggest logging weight
    return { label: 'Log Weight', icon: 'scale', type: 'morning' };
  };

  const quickAction = coachingInsight ? getQuickAction() : null;

  const handleQuickAction = (type: string) => {
    window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type } }));
  };

  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden bg-card border border-border">
        {/* Weight Display Header — compact */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-2 mb-1.5">
              <span className="text-3xl font-mono font-bold tracking-tight">
                {currentWeight.toFixed(1)}
              </span>
              <span className="text-base text-muted-foreground/40">→</span>
              <span className="text-3xl font-mono font-bold text-primary tracking-tight">
                {targetWeight}
              </span>
            </div>
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold",
              statusColor === 'green' && "bg-green-500/10 text-green-500",
              statusColor === 'orange' && "bg-orange-500/10 text-orange-500",
              statusColor === 'red' && "bg-red-500/10 text-red-400"
            )}>
              {isAtWeight ? '✓ AT WEIGHT' : (
                <>
                  {insights.isOnTrack ? 'ON TRACK' : 'BEHIND'}
                  <span className="text-muted-foreground font-normal">•</span>
                  {`${weightToLose.toFixed(1)} lbs to go`}
                </>
              )}
              {timeUntilWeighIn && timeUntilWeighIn !== 'WEIGH-IN TIME' && !isAtWeight && (
                <span className="text-muted-foreground font-normal">• {timeUntilWeighIn}</span>
              )}
            </div>
          </div>
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
            {quickAction && (
              <button
                onClick={() => handleQuickAction(quickAction.type)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  {quickAction.icon === 'scale' ? <Scale className="w-3.5 h-3.5" /> : <Dumbbell className="w-3.5 h-3.5" />}
                  {quickAction.label}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Replay insight button — shown when dismissed */}
        {coachingInsight && insightDismissed && (
          <div className="px-3 pb-2">
            <button
              onClick={() => setInsightDismissed(false)}
              className="flex items-center gap-1.5 mx-auto text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
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
            className="w-full px-4 py-3 border-t border-border flex items-center justify-center gap-2 text-sm text-violet-400 hover:text-violet-300 hover:bg-violet-500/5 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask AI Coach</span>
          </button>
        ) : (
          <div className="border-t border-border">
            {/* AI Header */}
            <div className="px-4 py-2 flex items-center justify-between bg-violet-500/5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-wide">AI Coach</span>
              </div>
              <button
                onClick={() => { setShowAiSection(false); setMessages([]); setAiMessage(null); }}
                className="p-1 rounded-full hover:bg-violet-500/20 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
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
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                  )}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                      Analyzing...
                    </span>
                  ) : (
                    "Get AI advice for right now"
                  )}
                </button>
              )}

              {/* AI quick advice response */}
              {aiMessage && messages.length === 0 && (
                <div className="mb-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <p className="text-sm text-foreground leading-relaxed">{aiMessage}</p>
                </div>
              )}

              {/* Chat messages */}
              {messages.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto mb-3 space-y-2">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "text-sm rounded-lg px-3 py-2",
                      msg.role === 'user'
                        ? "bg-primary/10 text-primary ml-8"
                        : "bg-muted/50 mr-8"
                    )}>
                      {msg.content}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                      Thinking...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Chat input */}
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 h-9 text-sm"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className={cn(
                    "h-9 px-3 rounded-lg transition-colors",
                    input.trim() && !loading
                      ? "bg-violet-500 text-white hover:bg-violet-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
