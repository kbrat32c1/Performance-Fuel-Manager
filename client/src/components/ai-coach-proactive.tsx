import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, Send, Droplets, Dumbbell, Flame, Moon, MessageCircle, X } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Get current weight from today's logs
  const getCurrentWeight = useCallback(() => {
    const today = new Date();
    const todayLogs = logs.filter(l => {
      const ld = new Date(l.date);
      return ld.getFullYear() === today.getFullYear() &&
        ld.getMonth() === today.getMonth() &&
        ld.getDate() === today.getDate();
    });
    if (todayLogs.length > 0) {
      const sorted = [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return sorted[0].weight;
    }
    return profile.currentWeight;
  }, [logs, profile.currentWeight]);

  const currentWeight = getCurrentWeight();
  const targetWeight = profile.targetWeightClass;
  const weightToLose = Math.max(0, currentWeight - targetWeight);
  const isAtWeight = weightToLose <= 0;

  // Calculate hours until weigh-in
  const hour = new Date().getHours();
  let hoursUntilWeighIn: number | null = null;
  if (daysUntil >= 0) {
    if (daysUntil === 0) {
      hoursUntilWeighIn = Math.max(0, 6 - hour);
    } else {
      hoursUntilWeighIn = (24 - hour) + ((daysUntil - 1) * 24) + 6;
    }
  }

  // Get calculated insights for display (LOCAL - NO API COST)
  const getInsights = useCallback(() => {
    try {
      const descentData = getWeekDescentData();
      const extraStats = getExtraWorkoutStats();
      const sweatRate = descentData.avgSweatRateOzPerHr ?? extraStats.avgLoss ?? null;
      const expectedDrift = descentData.avgOvernightDrift ? Math.abs(descentData.avgOvernightDrift) : null;
      const expectedPracticeLoss = descentData.avgPracticeLoss ? Math.abs(descentData.avgPracticeLoss) : null;

      // Fluid allowance
      let fluidAllowance: { oz: number; cutoffTime: string } | null = null;
      if (weightToLose > 0 && expectedDrift !== null) {
        const practiceToday = daysUntil > 0 && expectedPracticeLoss ? expectedPracticeLoss : 0;
        const naturalLoss = expectedDrift + practiceToday;
        const buffer = naturalLoss - weightToLose;
        if (buffer > 0) {
          fluidAllowance = { oz: Math.floor(buffer * 16), cutoffTime: hour < 18 ? '6pm' : '8pm' };
        } else {
          fluidAllowance = { oz: 0, cutoffTime: 'now' };
        }
      }

      // Workout guidance
      let workoutGuidance: { sessions: number; minutes: number } | null = null;
      if (weightToLose > 0 && sweatRate && sweatRate > 0) {
        const remainingAfterDrift = weightToLose - (expectedDrift ?? 0);
        if (remainingAfterDrift > 0) {
          const lossPerSession = sweatRate * 0.75;
          const sessionsNeeded = Math.ceil(remainingAfterDrift / lossPerSession);
          const minutesNeeded = Math.ceil((remainingAfterDrift / sweatRate) * 60);
          workoutGuidance = { sessions: sessionsNeeded, minutes: minutesNeeded };
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

      return { fluidAllowance, workoutGuidance, foodGuidance, expectedDrift, sweatRate };
    } catch {
      return { fluidAllowance: null, workoutGuidance: null, foodGuidance: null, expectedDrift: null, sweatRate: null };
    }
  }, [weightToLose, daysUntil, hour, getWeekDescentData, getExtraWorkoutStats]);

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

    ctx.calculatedInsights = {
      hoursUntilWeighIn,
      weightToLose: weightToLose.toFixed(1),
      isOnTrack: isAtWeight || weightToLose < 3,
      fluidAllowance: insights.fluidAllowance,
      workoutGuidance: insights.workoutGuidance,
      foodGuidance: insights.foodGuidance,
      expectedOvernightDrift: insights.expectedDrift?.toFixed(1) ?? null,
    };

    return ctx;
  }, [profile, logs, currentWeight, targetWeight, daysUntil, weightToLose, isAtWeight, hoursUntilWeighIn, insights, getPhase, getStatus, getMacroTargets, getTodaysFoods, calculateTarget, getDriftMetrics, getDailyTracking, getHydrationTarget]);

  // Fetch AI advice (only when user requests)
  const fetchAiAdvice = useCallback(async () => {
    setLoading(true);
    try {
      const context = buildContext();
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Based on my current situation, what's the ONE most important thing I should know or do right now? Be specific with numbers and timing. Keep it to 2-3 sentences max.",
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

  const statusColor = isAtWeight ? 'green' : weightToLose <= 2 ? 'yellow' : 'red';
  const showDetailedGuidance = !isAtWeight && daysUntil >= 0 && daysUntil <= 7;

  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden bg-card border border-border">
        {/* Weight Display Header */}
        <div className="p-4 pb-3">
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-3 mb-2">
              <span className="text-5xl font-mono font-bold tracking-tight">
                {currentWeight.toFixed(1)}
              </span>
              <span className="text-xl text-muted-foreground/40">→</span>
              <span className="text-5xl font-mono font-bold text-primary tracking-tight">
                {targetWeight}
              </span>
            </div>
            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold",
              statusColor === 'green' && "bg-green-500/10 text-green-500",
              statusColor === 'yellow' && "bg-yellow-500/10 text-yellow-500",
              statusColor === 'red' && "bg-red-500/10 text-red-400"
            )}>
              {isAtWeight ? '✓ AT WEIGHT' : `${weightToLose.toFixed(1)} lbs to go`}
              {hoursUntilWeighIn !== null && hoursUntilWeighIn > 0 && !isAtWeight && (
                <span className="text-muted-foreground font-normal">• {hoursUntilWeighIn}h</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Grid - LOCAL CALCULATIONS (FREE) */}
        {showDetailedGuidance && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                <Droplets className="w-4 h-4 mx-auto mb-1 text-cyan-500/70" />
                <div className="text-[10px] text-muted-foreground mb-0.5">Fluids</div>
                {insights.fluidAllowance ? (
                  <>
                    <div className="text-sm font-bold font-mono">
                      {insights.fluidAllowance.oz > 0 ? `${insights.fluidAllowance.oz} oz` : 'Cut'}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {insights.fluidAllowance.oz > 0 ? `until ${insights.fluidAllowance.cutoffTime}` : 'Stop now'}
                    </div>
                  </>
                ) : <div className="text-sm font-bold text-green-500">OK</div>}
              </div>

              <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                <Dumbbell className="w-4 h-4 mx-auto mb-1 text-orange-500/70" />
                <div className="text-[10px] text-muted-foreground mb-0.5">Extra Work</div>
                {insights.workoutGuidance ? (
                  <>
                    <div className="text-sm font-bold font-mono">{insights.workoutGuidance.sessions}×</div>
                    <div className="text-[9px] text-muted-foreground">
                      {insights.workoutGuidance.sessions === 1 ? `${insights.workoutGuidance.minutes} min` : '45 min each'}
                    </div>
                  </>
                ) : <div className="text-sm font-bold text-green-500">None</div>}
              </div>

              <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                <Flame className="w-4 h-4 mx-auto mb-1 text-yellow-500/70" />
                <div className="text-[10px] text-muted-foreground mb-0.5">Food</div>
                {insights.foodGuidance ? (
                  <>
                    <div className="text-sm font-bold font-mono">
                      {insights.foodGuidance.maxLbs <= 0.5 ? 'Light' : `<${insights.foodGuidance.maxLbs} lb`}
                    </div>
                    <div className="text-[9px] text-muted-foreground">by {insights.foodGuidance.lastMealTime}</div>
                  </>
                ) : <div className="text-sm font-bold text-green-500">Normal</div>}
              </div>
            </div>

            {/* Overnight drift - evening only */}
            {hour >= 17 && insights.expectedDrift && insights.expectedDrift > 0 && !isAtWeight && (
              <div className="mt-2 text-center">
                <p className="text-[11px] text-muted-foreground">
                  <Moon className="w-3 h-3 inline mr-1 text-purple-400" />
                  Overnight drift: <span className="font-mono font-bold text-foreground">−{insights.expectedDrift.toFixed(1)} lbs</span>
                </p>
              </div>
            )}
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
