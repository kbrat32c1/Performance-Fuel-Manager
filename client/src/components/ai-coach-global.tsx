import { useState, useRef, useEffect, useMemo } from "react";
import { Bot, Send, Loader2, X, BrainCircuit, Minimize2, ChevronDown, Flame, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useLocation } from "wouter";
import { format } from "date-fns";

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
  const { profile, logs, getDaysUntilWeighIn, getMacroTargets, getTodaysFoods, getPhase, getStatus, getDriftMetrics, getDailyTracking, getDailyPriority, getHydrationTarget, calculateTarget, getNutritionMode, getSliceTargets } = store;

  const daysUntil = getDaysUntilWeighIn();
  const recoveryMode = localStorage.getItem('pwm-comp-mode') || 'idle';

  const quickPrompts = useMemo(
    () => getQuickPrompts(location, daysUntil, recoveryMode !== 'idle' ? recoveryMode : undefined),
    [location, daysUntil, recoveryMode]
  );

  // Check AI availability
  useEffect(() => {
    if (open && aiAvailable === null) {
      fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "ping" }),
      })
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
      ctx.matchNumber = localStorage.getItem('pwm-comp-match') || '0';
      ctx.elapsed = parseInt(localStorage.getItem('pwm-comp-elapsed') || '0');
      ctx.weighInWeight = localStorage.getItem('pwm-recovery-weighin') || '';
      if (ctx.weighInWeight) {
        ctx.lostWeight = (profile.currentWeight - parseFloat(ctx.weighInWeight)).toFixed(1);
      }
    }

    return ctx;
  };

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

      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          className="fixed bottom-[7.5rem] left-5 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30 flex items-center justify-center active:scale-90 transition-all group hover:shadow-xl hover:shadow-purple-500/40"
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
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-sm shadow-purple-500/40">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h2 className="text-xs font-bold">SPAR Coach</h2>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  {daysUntil === 0 ? "COMP DAY" : daysUntil > 0 ? `${daysUntil}d out · ${profile.currentWeight}→${profile.targetWeightClass}lbs` : "Weight cutting expert"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
            {/* AI not available */}
            {aiAvailable === false && (
              <div className="bg-muted/20 rounded-lg p-3 text-center space-y-1.5 mt-4">
                <Bot className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-xs font-medium">SPAR Coach Not Configured</p>
                <p className="text-[10px] text-muted-foreground">
                  Add <code className="bg-muted px-1 py-0.5 rounded text-[9px]">ANTHROPIC_API_KEY</code> to env vars.
                </p>
              </div>
            )}

            {/* Welcome + quick prompts */}
            {aiAvailable !== false && messages.length === 0 && !loading && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-muted-foreground text-center px-2">
                  Ask me about weight cutting, nutrition, or recovery.
                </p>
                <div className="space-y-1">
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="w-full text-left bg-muted/20 hover:bg-muted/40 rounded-lg px-3 py-2 text-[11px] text-foreground transition-colors active:scale-[0.98]"
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
                  "rounded-lg px-3 py-2 text-[11px] max-w-[90%]",
                  msg.role === "user"
                    ? "bg-purple-600 text-white ml-auto"
                    : msg.role === "error"
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : "bg-muted/30 text-foreground"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-1">
                    <BrainCircuit className="w-2.5 h-2.5 text-primary" />
                    <span className="text-[8px] uppercase font-bold text-primary tracking-wider">SPAR Coach</span>
                  </div>
                )}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="bg-muted/30 rounded-lg px-3 py-2 max-w-[90%] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-[11px] text-muted-foreground">Thinking...</span>
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
                      className="shrink-0 text-[9px] bg-muted/30 hover:bg-muted/50 rounded-full px-2.5 py-1 text-muted-foreground transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex gap-1.5">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask a question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="flex-1 h-9 text-[11px] rounded-lg"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className={cn(
                    "p-2 rounded-lg transition-all active:scale-95 shrink-0",
                    input.trim() && !loading
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                      : "bg-muted/30 text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
