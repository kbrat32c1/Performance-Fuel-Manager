import { useState, useRef, useEffect, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import { authHeaders } from "@/lib/auth-headers";
import { Bot, Send, Loader2, X, BrainCircuit, Minimize2, ChevronDown, Flame, Sparkles, Mic, Square } from "lucide-react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { buildAthleteSnapshot, hoursUntilWeighIn, readMinutesToFirstMatch } from "@/lib/coach-context";
import { useHealthKitSync } from "@/hooks/use-healthkit-sync";
import { useAuth } from "@/lib/auth";

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
}

// Dynamic quick prompts based on page context
function getQuickPrompts(page: string, daysUntilWeighIn: number, recoveryMode?: string): string[] {
  // Recovery-specific
  if (page === '/recovery' && recoveryMode) {
    return [
      "What should I eat right now?",
      "Am I hydrating enough?",
      "How should I prep for my next match?",
      "I feel sluggish, what do I do?",
    ];
  }

  // Competition day (dashboard)
  if (daysUntilWeighIn === 0) {
    return [
      "What should I eat today?",
      "How do I rehydrate safely?",
      "Pre-match fueling plan?",
      "I'm still over weight, help!",
    ];
  }

  // Close to weigh-in
  if (daysUntilWeighIn > 0 && daysUntilWeighIn <= 2) {
    return [
      "Am I on track to make weight?",
      "What should I eat today?",
      "Water loading strategy?",
      "How much more weight can I safely cut?",
    ];
  }

  // Week of competition
  if (daysUntilWeighIn > 2 && daysUntilWeighIn <= 5) {
    return [
      "Review my cut plan",
      "Best foods for this phase?",
      "How is my weight trending?",
      "Should I adjust my protocol?",
    ];
  }

  // History page
  if (page === '/history') {
    return [
      "Analyze my weight trends",
      "Am I cutting too fast?",
      "What patterns do you see?",
      "Suggest adjustments",
    ];
  }

  // Default / far from competition
  return [
    "Help me plan my weight cut",
    "What should I eat today?",
    "Explain my current protocol",
    "Tips for making weight safely",
  ];
}

export function AiCoachGlobal() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();

  const store = useStore();
  const { user } = useAuth();
  const { healthData } = useHealthKitSync(user?.id ?? null);
  const { profile, logs, getDaysUntilWeighIn, getMacroTargets, getTodaysFoods, getPhase, getStatus, getDriftMetrics, getDailyTracking, getDailyPriority, getHydrationTarget, calculateTarget, getNutritionMode, getSliceTargets, getWeekDescentData, getExtraWorkoutStats } = store;

  const daysUntil = getDaysUntilWeighIn();
  const recoveryMode = localStorage.getItem(STORAGE_KEYS.COMP_MODE) || 'idle';

  const quickPrompts = useMemo(
    () => getQuickPrompts(location, daysUntil, recoveryMode !== 'idle' ? recoveryMode : undefined),
    [location, daysUntil, recoveryMode]
  );

  // Check AI availability
  useEffect(() => {
    if (open && aiAvailable === null) {
      // Availability check only: the server answers without calling the AI
      authHeaders().then(headers => fetch(apiUrl("/api/ai/coach"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ ping: true }),
      }))
        .then(res => setAiAvailable(res.status !== 503))
        .catch(() => setAiAvailable(false));
    }
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const buildContext = () => {
    const ctx: Record<string, any> = {
      currentPage: location,
      name: profile.name,
      currentWeight: profile.currentWeight,
      targetWeightClass: profile.targetWeightClass,
      daysUntilWeighIn: daysUntil,
      weightToLose: Math.max(0, profile.currentWeight - profile.targetWeightClass).toFixed(1),
      protocol: profile.protocol,
      waterLoading: profile.waterLoading !== false,
      phase: getPhase(),
      status: getStatus().status,
    };

    // Nutrition mode awareness
    try {
      const nutritionMode = getNutritionMode();
      ctx.nutritionMode = nutritionMode;
      if (nutritionMode === 'spar') {
        const sliceTargets = getSliceTargets();
        ctx.sliceTargets = sliceTargets;
        ctx.nutritionInfo = `SPAR mode: ${sliceTargets.protein}P/${sliceTargets.carb}C/${sliceTargets.veg}V slices (~${sliceTargets.totalCalories} cal)`;
      } else {
        ctx.nutritionInfo = 'Sugar System mode: gram-based competition fueling';
      }
    } catch {}

    try { ctx.macroTargets = getMacroTargets(); } catch {}
    try {
      const foods = getTodaysFoods();
      ctx.todaysFoods = {
        carbsLabel: foods.carbsLabel,
        proteinLabel: foods.proteinLabel,
        avoid: foods.avoid?.slice(0, 5),
      };
    } catch {}

    // Today's actual weight logs
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
        // Most recent weight is more accurate than profile.currentWeight
        const sorted = [...todayLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        ctx.currentWeight = sorted[0].weight;
        ctx.weightToLose = Math.max(0, sorted[0].weight - profile.targetWeightClass).toFixed(1);
      }
    } catch {}

    // Today's target weight
    try { ctx.todayTargetWeight = calculateTarget(); } catch {}

    // Drift & practice metrics
    try {
      const drift = getDriftMetrics();
      if (drift.overnight !== null) ctx.avgOvernightDrift = drift.overnight.toFixed(1);
      if (drift.session !== null) ctx.avgPracticeLoss = drift.session.toFixed(1);
    } catch {}

    // Daily tracking (water, carbs, protein consumed)
    try {
      const dateKey = format(new Date(), 'yyyy-MM-dd');
      const tracking = getDailyTracking(dateKey);
      if (tracking) {
        ctx.dailyTracking = {
          waterConsumed: tracking.waterConsumed || 0,
          carbsConsumed: tracking.carbsConsumed || 0,
          proteinConsumed: tracking.proteinConsumed || 0,
          // SPAR slice tracking
          proteinSlices: tracking.proteinSlices || 0,
          carbSlices: tracking.carbSlices || 0,
          vegSlices: tracking.vegSlices || 0,
          nutritionMode: tracking.nutritionMode || null,
        };
      }
    } catch {}

    // Hydration target
    try {
      const hydration = getHydrationTarget();
      if (hydration) ctx.hydrationTarget = hydration;
    } catch {}

    // Daily priority (coaching message)
    try {
      const priority = getDailyPriority();
      if (priority) ctx.dailyPriority = priority.priority;
    } catch {}

    // Recovery context
    if (recoveryMode !== 'idle') {
      ctx.recoveryMode = recoveryMode;
      ctx.matchNumber = localStorage.getItem(STORAGE_KEYS.COMP_MATCH) || '0';
      ctx.elapsed = parseInt(localStorage.getItem(STORAGE_KEYS.COMP_ELAPSED) || '0');
      ctx.weighInWeight = localStorage.getItem(STORAGE_KEYS.RECOVERY_WEIGHIN) || '';
      if (ctx.weighInWeight) {
        ctx.lostWeight = (profile.currentWeight - parseFloat(ctx.weighInWeight)).toFixed(1);
      }
    }

    try {
      ctx.athleteSnapshot = buildAthleteSnapshot({
        logs,
        foodLog: getDailyTracking(format(new Date(), 'yyyy-MM-dd'))?.foodLog,
        health: healthData,
        bodyFatPercent: profile.bodyFatPercent,
        weighInDate: profile.weighInDate,
        weighInTime: profile.weighInTime,
        weighInCleared: profile.weighInCleared,
        minutesToFirstMatch: readMinutesToFirstMatch(daysUntil, recoveryMode),
      });
    } catch {}

    // ─── CALCULATED INSIGHTS (DecisionZone-style) ───
    // These are the smart calculations the AI should use for recommendations
    try {
      const descentData = getWeekDescentData();
      const extraStats = getExtraWorkoutStats();
      const statusData = getStatus();
      const currentWeight = parseFloat(ctx.currentWeight) || profile.currentWeight;
      const targetWeight = profile.targetWeightClass;
      const weightToLose = Math.max(0, currentWeight - targetWeight);

      // Hours until weigh-in, at the athlete's actual weigh-in time
      const hoursUntil = profile.weighInCleared ? null : hoursUntilWeighIn(profile.weighInDate, profile.weighInTime);

      // Sweat rate (lbs/hr)
      // lbs/hr only; pounds per session isn't a rate.
      const sweatRate = descentData.avgSweatRateOzPerHr ?? extraStats.avgSweatRateOzPerHr ?? null;

      // Expected overnight drift
      const expectedDrift = descentData.avgOvernightDrift ?? null;

      // Expected practice loss
      const expectedPracticeLoss = descentData.avgPracticeLoss != null ? Math.max(0, descentData.avgPracticeLoss) : null;

      const projectionReliable = descentData.confidence?.reliable === true;

      // Build calculated insights object
      ctx.calculatedInsights = {
        hoursUntilWeighIn: hoursUntil,
        weightToLose: weightToLose.toFixed(1),
        projectedWeight: descentData.projectedSaturday?.toFixed(1) ?? null,
        isOnTrack: descentData.pace === 'on-track' || descentData.pace === 'ahead',
        sweatRate: sweatRate?.toFixed(1) ?? null,
        expectedOvernightDrift: expectedDrift?.toFixed(1) ?? null,
        expectedPracticeLoss: expectedPracticeLoss?.toFixed(1) ?? null,
        projectionReliable,
        projectionNote: projectionReliable
          ? null
          : `Not enough weigh-in pairs yet (${descentData.confidence?.driftSamples ?? 0} overnight, ${descentData.confidence?.practiceSamples ?? 0} practice; need ${3} each). Do not prescribe extra workouts from the projection — tell the athlete to keep logging and follow the plan.`,
        statusRecommendation: statusData.recommendation?.message ?? null,
        projectionWarning: statusData.projectionWarning ?? null,
      };
    } catch (e) {
      // Fail silently if calculations error
    }

    return ctx;
  };

  const speech = useSpeechInput(setInput);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    setMessages(prev => [...prev, { role: "user", content: text.trim() }]);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history for multi-turn context (last 6 messages)
      const history = messages
        .filter(m => m.role !== 'error')
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(apiUrl("/api/ai/coach"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          question: text.trim(),
          context: buildContext(),
          history,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Failed to get response");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.recommendation }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "error",
        content: err.message || "Something went wrong. Try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (speech.listening) return; // wait for the final transcript
    sendMessage(input);
  };

  // Don't show on landing or onboarding
  if (location === '/' || location === '/onboarding') return null;

  return (
    <>
      {/* Floating button — SPAR Coach */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-tour="ai-coach"
          className="fixed bottom-[7.5rem] left-5 z-40 w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center active:scale-90 transition-all group hover:shadow-xl hover:shadow-primary/40"
          aria-label="Open SPAR Coach"
        >
          <Sparkles className="w-6 h-6 text-white drop-shadow-sm" />
        </button>
      )}

      {/* Chat panel — small floating box */}
      {open && (
        <div className="fixed bottom-4 left-4 z-50 w-[340px] max-h-[420px] flex flex-col bg-background border border-border rounded-2xl shadow-2xl shadow-black/30 animate-in slide-in-from-bottom-4 duration-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/40">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h2 className="text-xs font-bold">SPAR Coach</h2>
                <p className="text-xs text-muted-foreground leading-tight">
                  {daysUntil === 0 ? "COMP DAY" : daysUntil > 0 ? `${daysUntil}d out · ${profile.currentWeight}→${profile.targetWeightClass}lbs` : "Weight cutting expert"}
                </p>
              </div>
            </div>
            <button
              aria-label="Close AI coach"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg relative after:absolute after:-inset-1.5 hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {/* AI not available */}
            {aiAvailable === false && (
              <div className="bg-muted/20 rounded-lg p-3 text-center space-y-1.5 mt-4">
                <Bot className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-xs font-medium">SPAR Coach Not Configured</p>
                <p className="text-xs text-muted-foreground">
                  Add <code className="bg-muted px-1 py-0.5 rounded text-xs">ANTHROPIC_API_KEY</code> to env vars.
                </p>
              </div>
            )}

            {/* Welcome + quick prompts */}
            {aiAvailable !== false && messages.length === 0 && !loading && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground text-center px-2">
                  Ask me about weight cutting, nutrition, or recovery.
                </p>
                <div className="space-y-1">
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="w-full text-left bg-muted/20 hover:bg-muted/40 rounded-lg px-3 py-2 text-xs text-foreground transition-colors active:scale-[0.98]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs max-w-[90%]",
                  msg.role === "user"
                    ? "bg-primary text-white ml-auto"
                    : msg.role === "error"
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : "bg-muted/30 text-foreground"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-1">
                    <BrainCircuit className="w-2.5 h-2.5 text-primary" />
                    <span className="text-xs uppercase font-bold text-primary tracking-wider">SPAR Coach</span>
                  </div>
                )}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="bg-muted/30 rounded-lg px-3 py-2 max-w-[90%] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {aiAvailable !== false && (
            <div className="px-3 pb-3 pt-1.5 border-t border-border bg-background shrink-0">
              {/* Quick prompts after conversation started */}
              {messages.length > 0 && !loading && (
                <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1 scrollbar-none">
                  {quickPrompts.slice(0, 3).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="shrink-0 text-xs bg-muted/30 hover:bg-muted/50 rounded-full px-2.5 py-1 text-muted-foreground transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {speech.error && <p role="alert" className="mb-1 text-xs text-destructive">{speech.error}</p>}
              <form onSubmit={handleSubmit} className="flex gap-1.5">
                <Input aria-label="Message the AI coach"
                  ref={inputRef}
                  type="text"
                  placeholder="Ask a question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="flex-1 h-9 text-xs rounded-lg"
                />
                {speech.supported && (
                  <button
                    type="button"
                    onClick={() => (speech.listening ? speech.stop() : speech.start())}
                    disabled={loading}
                    aria-label={speech.listening ? "Stop dictation" : "Speak your question"}
                    aria-pressed={speech.listening}
                    className={cn(
                      "p-2 rounded-lg transition-all active:scale-95 shrink-0",
                      speech.listening ? "bg-red-500 text-white animate-pulse" : "bg-muted/30 text-muted-foreground"
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
                    "p-2 rounded-lg relative after:absolute after:-inset-1 transition-all active:scale-95 shrink-0",
                    input.trim() && !loading
                      ? "bg-primary text-white shadow-lg shadow-primary/20"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
