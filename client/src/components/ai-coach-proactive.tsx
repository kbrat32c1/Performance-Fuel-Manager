import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { format } from "date-fns";

interface CoachingMessage {
  text: string;
  timestamp: number;
  weightHash: string; // To detect when weights change
}

// Cache key for localStorage
const CACHE_KEY = 'pwm-ai-coach-proactive';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * AI Coach Proactive - Generates coaching message automatically
 * Triggers on: page load, weight log, manual refresh
 * Caches to avoid excessive API calls
 */
export function AiCoachProactive() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const lastFetchRef = useRef<number>(0);

  const store = useStore();
  const {
    profile,
    logs,
    getDaysUntilWeighIn,
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

  // Generate a hash of current weight state to detect changes
  const getWeightHash = useCallback(() => {
    const today = new Date();
    const todayLogs = logs.filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    const latestWeight = todayLogs.length > 0
      ? [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].weight
      : 0;
    return `${latestWeight}-${todayLogs.length}-${daysUntil}`;
  }, [logs, daysUntil]);

  // Build context for AI (same as ai-coach-global.tsx)
  const buildContext = useCallback(() => {
    const ctx: Record<string, any> = {
      currentPage: '/dashboard',
      name: profile.name,
      currentWeight: profile.currentWeight,
      targetWeightClass: profile.targetWeightClass,
      daysUntilWeighIn: daysUntil,
      weightToLose: Math.max(0, profile.currentWeight - profile.targetWeightClass).toFixed(1),
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

    // Today's weight logs
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
        const sorted = [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        ctx.currentWeight = sorted[0].weight;
        ctx.weightToLose = Math.max(0, sorted[0].weight - profile.targetWeightClass).toFixed(1);
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

    // Calculated insights
    try {
      const descentData = getWeekDescentData();
      const extraStats = getExtraWorkoutStats();
      const statusData = getStatus();
      const currentWeight = parseFloat(ctx.currentWeight) || profile.currentWeight;
      const targetWeight = profile.targetWeightClass;
      const weightToLose = Math.max(0, currentWeight - targetWeight);

      const now = new Date();
      const hour = now.getHours();
      let hoursUntilWeighIn: number | null = null;
      if (daysUntil >= 0) {
        if (daysUntil === 0) {
          hoursUntilWeighIn = Math.max(0, 6 - hour);
        } else {
          hoursUntilWeighIn = (24 - hour) + ((daysUntil - 1) * 24) + 6;
        }
      }

      const sweatRate = descentData.avgSweatRateOzPerHr ?? extraStats.avgLoss ?? null;
      const expectedDrift = descentData.avgOvernightDrift ?? null;
      const expectedPracticeLoss = descentData.avgPracticeLoss ? Math.abs(descentData.avgPracticeLoss) : null;

      // Fluid allowance
      let fluidAllowance: { oz: number; cutoffTime: string } | null = null;
      if (weightToLose > 0 && expectedDrift !== null) {
        const practiceToday = daysUntil > 0 && expectedPracticeLoss ? expectedPracticeLoss : 0;
        const naturalLoss = (expectedDrift ?? 0) + practiceToday;
        const buffer = naturalLoss - weightToLose;
        if (buffer > 0) {
          fluidAllowance = { oz: Math.floor(buffer * 16), cutoffTime: hour < 18 ? '6pm' : '8pm' };
        } else {
          fluidAllowance = { oz: 0, cutoffTime: 'now - water restricted' };
        }
      }

      // Workout guidance
      let workoutGuidance: { sessions: number; minutes: number; description: string } | null = null;
      if (weightToLose > 0 && sweatRate && sweatRate > 0) {
        const remainingAfterDrift = weightToLose - (expectedDrift ?? 0);
        if (remainingAfterDrift > 0) {
          const lossPerSession = sweatRate * 0.75;
          const sessionsNeeded = Math.ceil(remainingAfterDrift / lossPerSession);
          const minutesNeeded = Math.ceil((remainingAfterDrift / sweatRate) * 60);
          workoutGuidance = {
            sessions: sessionsNeeded,
            minutes: minutesNeeded,
            description: sessionsNeeded === 1 ? `One ${minutesNeeded}-min workout` : `${sessionsNeeded} sessions`
          };
        }
      }

      // Food guidance
      let foodGuidance: { maxLbs: number; lastMealTime: string } | null = null;
      if (weightToLose > 0) {
        if (daysUntil <= 1) {
          foodGuidance = { maxLbs: 0.5, lastMealTime: daysUntil === 0 ? 'after weigh-in' : '6pm' };
        } else if (daysUntil === 2) {
          foodGuidance = { maxLbs: 1.5, lastMealTime: '7pm' };
        } else {
          foodGuidance = { maxLbs: 2.5, lastMealTime: '8pm' };
        }
      }

      ctx.calculatedInsights = {
        hoursUntilWeighIn,
        weightToLose: weightToLose.toFixed(1),
        projectedWeight: descentData.projectedSaturday?.toFixed(1) ?? null,
        isOnTrack: descentData.pace === 'on-track' || descentData.pace === 'ahead',
        sweatRate: sweatRate?.toFixed(1) ?? null,
        expectedOvernightDrift: expectedDrift?.toFixed(1) ?? null,
        expectedPracticeLoss: expectedPracticeLoss?.toFixed(1) ?? null,
        fluidAllowance,
        workoutGuidance,
        foodGuidance,
        statusRecommendation: statusData.recommendation?.message ?? null,
        projectionWarning: statusData.projectionWarning ?? null,
      };
    } catch {}

    return ctx;
  }, [profile, logs, daysUntil, getPhase, getStatus, getMacroTargets, getTodaysFoods, calculateTarget, getDriftMetrics, getDailyTracking, getHydrationTarget, getWeekDescentData, getExtraWorkoutStats]);

  // Fetch AI coaching message
  const fetchCoaching = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const weightHash = getWeightHash();

    // Check cache first
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: CoachingMessage = JSON.parse(cached);
          // Use cache if: same weight state AND not expired
          if (data.weightHash === weightHash && (now - data.timestamp) < CACHE_TTL) {
            setMessage(data.text);
            return;
          }
        }
      } catch {}
    }

    // Rate limit: at least 10 seconds between requests
    if (now - lastFetchRef.current < 10000 && !forceRefresh) {
      return;
    }
    lastFetchRef.current = now;

    setLoading(true);
    setError(null);

    try {
      const context = buildContext();

      // Special proactive prompt - ask for the most important thing right now
      const proactivePrompt = `Based on my current situation, what's the ONE most important thing I should know or do right now? Be specific with numbers and timing. Keep it to 2-3 sentences max.`;

      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: proactivePrompt,
          context,
        }),
      });

      if (!res.ok) {
        throw new Error("AI unavailable");
      }

      const data = await res.json();
      const text = data.recommendation || "Stay focused on your cut.";

      // Cache the result
      const cacheData: CoachingMessage = {
        text,
        timestamp: now,
        weightHash,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setMessage(text);
    } catch (err) {
      setError("Couldn't get AI coaching");
      // Try to use stale cache as fallback
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: CoachingMessage = JSON.parse(cached);
          setMessage(data.text);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [buildContext, getWeightHash]);

  // Fetch on mount and when weight changes
  useEffect(() => {
    fetchCoaching();
  }, [getWeightHash]); // Re-fetch when weight hash changes

  // Listen for weight log events (custom event dispatched from FAB)
  useEffect(() => {
    const handleWeightLogged = () => {
      // Small delay to let the store update
      setTimeout(() => fetchCoaching(true), 500);
    };
    window.addEventListener('weight-logged', handleWeightLogged);
    return () => window.removeEventListener('weight-logged', handleWeightLogged);
  }, [fetchCoaching]);

  // Don't render if no meaningful data
  if (!profile.currentWeight || !profile.targetWeightClass) {
    return null;
  }

  // SPAR protocol users don't need weight cutting advice
  if (profile.protocol === '5') {
    return null;
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full"
      >
        <div className={cn(
          "rounded-xl p-4 transition-all",
          "bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent",
          "border border-violet-500/20"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold text-violet-400 uppercase tracking-wide">AI Coach</span>
            </div>
            <div className="flex items-center gap-2">
              {!loading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchCoaching(true);
                  }}
                  className="p-1 rounded-full hover:bg-violet-500/20 transition-colors"
                  title="Refresh coaching"
                >
                  <RefreshCw className="w-3 h-3 text-violet-400" />
                </button>
              )}
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Content */}
          {expanded && (
            <div className="min-h-[40px]">
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Analyzing your data...</span>
                </div>
              ) : error && !message ? (
                <p className="text-sm text-muted-foreground">{error}</p>
              ) : message ? (
                <p className="text-sm text-foreground leading-relaxed">{message}</p>
              ) : null}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
